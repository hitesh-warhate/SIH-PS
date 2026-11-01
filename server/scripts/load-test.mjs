// Load test (Phase 9, PRD Section 10 scalability): many simultaneous terminals, each running a whole patient journey, plus a staff and a doctor
// screen listening for alerts. Reports request latency, red-flag alert latency, multi-file analysis time and errors.
//
//   node --env-file=.env scripts/load-test.mjs [terminals=50] [filesPerPatient=4] [poolMax=10] [alertShare=0.1]
//
// Limits to keep in mind when reading the numbers: the clients, the server and PostgreSQL run on one machine, so the clients compete with the
// server for the CPU; document reading uses the stand-in engine (real OCR is measured separately in scripts/benchmark-analysis.mjs); and the
// data is synthetic. It shows where a single server saturates, not what a hospital deployment will do.
import { monitorEventLoopDelay } from 'node:perf_hooks';
import { startTestApp } from '../test/helpers.js';
import { fixture, index } from '../test/doc-helpers.js';
import { QUESTIONS } from '../config/questions.v1.js';

const [terminals = 50, files = 4, poolMax = 10, alertShare = 0.1] = process.argv.slice(2).map(Number);
const ALL = { history: true, documents: true, his_sharing: true, abha_linking: true };
const CONFIRM = { visual: true, audio: true };
const t = await startTestApp({ poolMax, docWorkers: 3 });
const staff = await t.login('staff'), doctor = await t.login('doctor');
const lag = monitorEventLoopDelay({ resolution: 10 });
lag.enable();

const lat = {};
const errors = [];
const timed = async (label, fn) => {
  const t0 = performance.now();
  try {
    const r = await fn();
    (lat[label] ??= []).push(performance.now() - t0);
    if (r?.status >= 500 || r?.status === 429) errors.push(`${label}: ${r.status}`);
    return r;
  } catch (err) {
    errors.push(`${label}: ${err.message}`);
    return { status: 0, body: {} };
  }
};
const pct = (xs, p) => (xs.length ? [...xs].sort((a, b) => a - b)[Math.min(xs.length - 1, Math.floor((p / 100) * xs.length))] : null);
const round = (n) => (n == null ? null : Math.round(n));

// A stand-in for the staff and doctor screens: it listens to the real alert stream and notes when each alert arrives.
const arrivals = { staff: new Map(), doctor: new Map() };
async function listen(role, cookie) {
  const res = await fetch(`${t.base}/api/${role}/alerts/stream`, { headers: { cookie } });
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = '';
  (async () => {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) return;
      buf += dec.decode(value, { stream: true });
      let k;
      while ((k = buf.indexOf('\n\n')) >= 0) {
        const block = buf.slice(0, k);
        buf = buf.slice(k + 2);
        if (!block.startsWith('event: alert')) continue;
        const a = JSON.parse(block.split('data: ')[1]);
        arrivals[role].set(a.encounterId, performance.now());
      }
    }
  })().catch(() => {});
  return () => reader.cancel().catch(() => {});
}
const stops = [await listen('staff', staff), await listen('doctor', doctor)];

const fill = (q) => (q.type === 'yes_no' ? 'no' : q.type === 'single' ? q.options[0].value : q.type === 'multi' ? [(q.options.find((o) => o.value === 'none') ?? q.options[0]).value] : q.type === 'number' ? (q.min ?? 1) + 1 : 'since the morning');
const sent = new Map(); // encounter -> time the emergency answer was posted
const imgs = index.slice(0, 8).map((e) => fixture(e.file));

async function terminal(i) {
  const emergency = i < Math.round(terminals * alertShare);
  const mobile = `7${String(10_000_000 + i).padStart(9, '0')}`;
  const otp = await timed('otp', () => t.call('POST', '/api/patient/otp/send', { body: { mobile } }));
  const ok = await timed('otp', () => t.call('POST', '/api/patient/otp/verify', { body: { challengeId: otp.body.challengeId, code: otp.body.devCode } }));
  const reg = await timed('register', () => t.call('POST', '/api/patient/register', { body: { ...t.form({ fullName: `Load ${i}`, mobile, age: 20 + (i % 60) }), verificationToken: ok.body.verificationToken } }));
  const cookie = reg.cookie;
  const consent = await timed('consent', () => t.call('POST', '/api/patient/consent', { cookie, body: { purposes: ALL } }));
  const enc = consent.body.encounterId;
  const answer = (k, v) => timed('answer', () => t.call('POST', '/api/patient/interview/answer', { cookie, body: { questionKey: k, value: v, modality: 'tap', confirmation: CONFIRM } }));
  if (emergency) { sent.set(enc, performance.now()); await answer('emergency.screen', ['e_chest']); } else await answer('emergency.screen', ['none']);
  await answer('cc.main', 'fever');
  for (let n = 0; n < 40; n++) {
    const next = await timed('next', () => t.call('GET', '/api/patient/interview/next', { cookie }));
    if (next.body.done) break;
    const q = QUESTIONS.find((x) => x.key === next.body.question.key);
    await answer(q.key, q.key === 'cc.duration' ? 'd1_3' : fill(q));
  }
  for (let f = 0; f < files; f++) await timed('upload', () => t.send('POST', '/api/patient/documents', imgs[(i + f) % imgs.length], { cookie, name: `f${f}.png` }));
  await timed('submit', () => t.call('POST', '/api/patient/submit', { cookie }));
  return enc;
}

const poolWait = [];
const sampler = setInterval(() => poolWait.push(t.db.pool.waitingCount), 50);
const t0 = performance.now();
const encs = await Promise.all(Array.from({ length: terminals }, (_, i) => terminal(i)));
const journeyMs = performance.now() - t0;

// doctors open a sample of the ready cases
const sample = encs.filter(Boolean).slice(0, Math.min(30, terminals));
await Promise.all(sample.map((id) => timed('doctor_summary', () => t.call('GET', `/api/doctor/encounters/${id}/summary`, { cookie: doctor }))));
await timed('doctor_queue', () => t.call('GET', '/api/doctor/encounters', { cookie: doctor }));
await t.settle();
clearInterval(sampler);
await new Promise((r) => setTimeout(r, 500));

const alertMs = (role) => [...sent].map(([enc, at]) => (arrivals[role].has(enc) ? arrivals[role].get(enc) - at : null));
const staffMs = alertMs('staff').filter((x) => x != null), doctorMs = alertMs('doctor').filter((x) => x != null);
const { rows: [analysis] } = await t.db.pool.query(
  `SELECT count(*)::int n, percentile_cont(0.5) WITHIN GROUP (ORDER BY ready_ms) med, max(ready_ms) mx FROM analysis_runs WHERE ready_ms IS NOT NULL`);
const { rows: [ready] } = await t.db.pool.query(`SELECT count(*) FILTER (WHERE status = 'ready')::int ready, count(*)::int total FROM encounters`);

const table = Object.fromEntries(Object.entries(lat).map(([k, v]) => [k, { n: v.length, p50: round(pct(v, 50)), p95: round(pct(v, 95)), p99: round(pct(v, 99)), max: round(Math.max(...v)) }]));
console.log(JSON.stringify({
  config: { terminals, filesPerPatient: files, dbPoolMax: poolMax, emergencyShare: alertShare, engine: 'stand-in (instant)' },
  journeys: { completed: ready.ready, started: ready.total, wallSeconds: Number((journeyMs / 1000).toFixed(1)), patientsPerHourAtThisRate: Math.round((ready.ready / (journeyMs / 1000)) * 3600) },
  requestLatencyMs: table,
  redFlagAlertLatencyMs: {
    emergencies: sent.size,
    staff: { delivered: staffMs.length, p50: round(pct(staffMs, 50)), p95: round(pct(staffMs, 95)), max: round(Math.max(0, ...staffMs)) },
    doctor: { delivered: doctorMs.length, p50: round(pct(doctorMs, 50)), p95: round(pct(doctorMs, 95)), max: round(Math.max(0, ...doctorMs)) },
  },
  multiFileAnalysisMs: { runs: analysis.n, median: round(analysis.med), max: analysis.mx },
  dbPoolWaiting: { max: Math.max(0, ...poolWait), samplesWithWaiters: poolWait.filter((x) => x > 0).length, samples: poolWait.length },
  eventLoopDelayMs: { mean: round(lag.mean / 1e6), p99: round(lag.percentile(99) / 1e6), max: round(lag.max / 1e6) },
  errors: { count: errors.length, first: errors.slice(0, 5) },
}, null, 2));
stops.forEach((s) => s());
await t.close();
process.exit(0);
