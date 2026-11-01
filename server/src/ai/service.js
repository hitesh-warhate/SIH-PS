import { createHash } from 'node:crypto';
import { audit } from '../patients.js';
import { diagnosticHits } from '../summary/generate.js';
import { doctorFacts, patientFacts } from './facts.js';
import { createRulesProvider } from './providers.js';

const AUDIENCES = ['doctor', 'patient'];
// Words that must not reach a patient in a recap, whoever wrote it. Checked on the English text and, for the model, on every language by the diagnosis scan.
const PATIENT_BANNED = /\b(urgent|emergency|serious|critical|risk|priority|alert|abnormal|dangerous)\b/i;

const sha = (x) => createHash('sha256').update(JSON.stringify(x)).digest('hex');

// Writes the overview of a patient's history once the patient has submitted: one for the doctor (history, files and checks) and one for the
// patient (only what they said). Whatever the model writes is checked before it is kept: any wording that states a diagnosis, or a patient
// recap that mentions alerts or risk, is thrown away and replaced by the rule-based overview, and the reason is recorded.
export function createAiAnalyst({ pool, provider = createRulesProvider(), fallback = createRulesProvider(), log = console }) {
  async function load(encounterId) {
    const { rows: [e] } = await pool.query(
      `SELECT e.id, e.patient_id, p.sex, p.date_of_birth, s.id AS summary_id FROM encounters e JOIN patients p ON p.id = e.patient_id JOIN summaries s ON s.encounter_id = e.id WHERE e.id = $1`, [encounterId]);
    if (!e) return null;
    const { rows: [v] } = await pool.query('SELECT content FROM summary_versions WHERE summary_id = $1 ORDER BY version DESC LIMIT 1', [e.summary_id]);
    const { rows: results } = await pool.query('SELECT kind, payload FROM analysis_results WHERE encounter_id = $1', [encounterId]);
    const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
    const dob = e.date_of_birth;
    const age = dob ? Number(today.slice(0, 4)) - Number(dob.slice(0, 4)) - (today.slice(5) < dob.slice(5) ? 1 : 0) : null;
    return { content: v.content, analysis: Object.fromEntries(results.map((r) => [r.kind, r.payload])), patient: { age, sex: e.sex } };
  }

  const valid = (audience, text) => {
    const all = Object.values(text).join('\n');
    const hits = diagnosticHits(all);
    if (hits.length) return `wording that states a diagnosis (${hits[0]})`;
    if (audience === 'patient' && PATIENT_BANNED.test(text.en)) return 'wording about alerts or risk in a patient recap';
    return null;
  };

  async function write(encounterId, audience, input) {
    const facts = audience === 'doctor' ? doctorFacts(input) : patientFacts(input);
    const hash = sha([facts, provider.name, provider.model]);
    const { rows: [have] } = await pool.query('SELECT input_hash, status FROM ai_narratives WHERE encounter_id = $1 AND audience = $2', [encounterId, audience]);
    if (have?.input_hash === hash && have.status === 'ready') return false;
    await pool.query(
      `INSERT INTO ai_narratives (encounter_id, audience, provider, model, status, input_hash) VALUES ($1,$2,$3,$4,'pending',$5)
       ON CONFLICT (encounter_id, audience) DO UPDATE SET status = 'pending', provider = $3, model = $4, input_hash = $5, fallback_reason = NULL, updated_at = now()`,
      [encounterId, audience, provider.name, provider.model, hash]);

    let used = provider, text = null, reason = null;
    try {
      text = await provider.narrate({ audience, facts, content: input.content });
      reason = valid(audience, text);
    } catch (err) { reason = `the model could not be used: ${String(err.message).slice(0, 160)}`; }
    if (reason) {
      used = fallback;
      text = await fallback.narrate({ audience, facts, content: input.content });
    }
    await pool.query(
      `UPDATE ai_narratives SET status = 'ready', provider = $3, model = $4, text = $5, fallback_reason = $6, updated_at = now() WHERE encounter_id = $1 AND audience = $2`,
      [encounterId, audience, used.name, used.model, JSON.stringify(text), reason]);
    await audit(pool, { actorType: 'system', action: 'ai_overview_written', objectType: 'encounter', objectId: encounterId, detail: { audience, provider: used.name, model: used.model, fellBack: Boolean(reason) } });
    return true;
  }

  async function analyse(encounterId) {
    const input = await load(encounterId);
    if (!input) return;
    for (const audience of AUDIENCES) await write(encounterId, audience, input);
  }

  // Runs in the background so a slow model never holds up the patient's submission; one run per encounter at a time.
  const running = new Map();
  function schedule(encounterId) {
    const next = (running.get(encounterId) ?? Promise.resolve()).then(() => analyse(encounterId)).catch((err) => log.error('overview failed', err.message))
      .finally(() => { if (running.get(encounterId) === next) running.delete(encounterId); });
    running.set(encounterId, next);
    return next;
  }
  const idle = async () => { while (running.size) await Promise.all([...running.values()]); };

  async function get(encounterId, audience) {
    const { rows: [r] } = await pool.query('SELECT provider, model, status, text, fallback_reason, updated_at FROM ai_narratives WHERE encounter_id = $1 AND audience = $2', [encounterId, audience]);
    if (!r) return null;
    return { status: r.status, text: r.text, provider: r.provider, model: r.model, fellBack: Boolean(r.fallback_reason), at: r.updated_at };
  }

  return { schedule, analyse, idle, get, provider };
}
