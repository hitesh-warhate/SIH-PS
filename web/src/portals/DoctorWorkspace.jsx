import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Hero } from '../components/Hero.jsx';
import { api } from '../api.js';
import { useI18n } from '../i18n/index.jsx';
import { useAlertStream } from '../useAlertStream.js';
import { Consistency, Interactions, Labs, Medicines, Tag, Timeline } from './DoctorAnalysis.jsx';

const IDX = { en: 0, hi: 1, mr: 2 };
const TABS = ['summary', 'documents', 'labs', 'medications', 'timeline', 'alerts'];
const CHIP_MARK = { not_started: '○', in_intake: '◔', ready: '●', alert: '‼', in_consultation: '▶', completed: '✔', rejected: '✖' };
const WARN_TAB = { labs: 'labs', interactions: 'medications', allergies: 'medications', mismatches: 'alerts' };
const WARN_MARK = { labs: '▲', interactions: '⚠', allergies: '✚', mismatches: '≠' };
const typing = (e) => ['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target?.tagName) || e.target?.isContentEditable;

function StatusChip({ chip }) {
  const { t } = useI18n();
  return <span className={`status-chip chip-${chip}`}>{CHIP_MARK[chip]} {t(`ws.status.${chip}`)}</span>;
}

function Warnings({ w, onJump }) {
  const { t } = useI18n();
  return (
    <span className="warn-row">
      {Object.entries(w).filter(([, n]) => n > 0).map(([k, n]) => (
        <button key={k} type="button" className="warn-chip" onClick={(e) => { e.stopPropagation(); onJump(WARN_TAB[k]); }}>{WARN_MARK[k]} {t(`ws.warn.${k}`)} {n}</button>
      ))}
    </span>
  );
}

// ---------- the original scan beside an extracted value (DB-7) ----------
function ScanPanel({ encounterId, scan, onClose }) {
  const { t } = useI18n();
  const [dims, setDims] = useState(null);
  const [failed, setFailed] = useState(false);
  const src = `/api/doctor/encounters/${encounterId}/documents/${scan.documentId}/file`;
  const r = scan.region;
  const box = dims && r ? { left: `${(r.x0 / dims.w) * 100}%`, top: `${(r.y0 / dims.h) * 100}%`, width: `${((r.x1 - r.x0) / dims.w) * 100}%`, height: `${((r.y1 - r.y0) / dims.h) * 100}%` } : null;
  return (
    <aside className="scan-panel" aria-label={t('ws.scan.title')}>
      <header><strong>{t('ws.scan.title')}</strong> <span className="chip">{scan.name}</span><button type="button" onClick={onClose}>{t('ws.scan.close')}</button></header>
      {failed
        ? <p><a href={src} target="_blank" rel="noreferrer">{t('ws.scan.openFile')}</a></p>
        : (
          <div className="scan-frame">
            <img src={src} alt={scan.name} onLoad={(e) => setDims({ w: e.target.naturalWidth, h: e.target.naturalHeight })} onError={() => setFailed(true)} />
            {box && <span className="scan-box" style={box} />}
          </div>
        )}
      {!r && <p className="muted small">{t('ws.scan.noPosition')}</p>}
    </aside>
  );
}

// ---------- summary tab: accept, amend, reject ----------
function SummaryTab({ enc, data, reload, onJump }) {
  const { t, lang } = useI18n();
  const [edits, setEdits] = useState({});
  const [editing, setEditing] = useState(null);
  const [manual, setManual] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const { summary, versions, status } = data;
  const l = ['en', 'hi', 'mr'][IDX[lang]];

  const act = async (path, body) => {
    setBusy(true); setError('');
    try {
      const r = await api(`/doctor/encounters/${enc}/${path}`, { method: 'POST', body });
      if (!r.ok) setError(t('ws.error.action'));
      else { setEdits({}); setEditing(null); await reload(); }
    } catch { setError(t('ws.error.action')); }
    setBusy(false);
  };

  if (!summary) return <p>{t('ws.summary.notReady')}</p>;
  const c = summary.content;
  const live = Boolean(data.live);
  const nar = data.narrative;
  const canEdit = status === 'in_consultation';
  const text = (it) => edits[it.id] ?? it.text?.[l];

  const plain = () => c.sections.map((s) => `${s.title[IDX[lang]]}\n${s.items.filter((i) => i.status === 'answered').map((i) => `- ${i.label ? `${i.label[IDX[lang]]}: ` : ''}${i.text[l]}`).join('\n')}`).join('\n\n');
  const download = () => {
    const url = URL.createObjectURL(new Blob([plain()], { type: 'text/plain;charset=utf-8' }));
    const a = Object.assign(document.createElement('a'), { href: url, download: 'summary.txt' });
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="summary-tab print-area">
      <div className="summary-bar no-print">
        {status === 'ready' && <button type="button" className="primary" disabled={busy} onClick={() => act('consult')}>{t('ws.summary.open')} <kbd>O</kbd></button>}
        {canEdit && (
          <>
            <button type="button" className="primary" disabled={busy} onClick={() => act('summary/accept')}>{t('ws.summary.accept')} <kbd>A</kbd></button>
            <button type="button" disabled={busy || !Object.keys(edits).length} onClick={() => act('summary/amend', { edits: Object.entries(edits).map(([id, text2]) => ({ id, text: text2 })) })}>{t('ws.summary.amend')} ({Object.keys(edits).length})</button>
            <button type="button" className="danger" disabled={busy} onClick={() => act('summary/reject')}>{t('ws.summary.reject')}</button>
          </>
        )}
        {(status === 'completed' || status === 'rejected') && summary.kind !== 'ai_draft' && (
          <>
            <button type="button" onClick={() => window.print()}>{t('ws.summary.print')}</button>
            <button type="button" onClick={download}>{t('ws.summary.download')}</button>
          </>
        )}
        <span className="muted">{t(`ws.decision.${summary.decision ?? 'draft'}`)}</span>
      </div>
      {error && <p role="alert" className="error">{error}</p>}
      {live
        ? <p className="draft-note no-print" role="status">{t('ws.summary.liveNote')}</p>
        : <p className="draft-note no-print" role="note">{t('ws.summary.draftNote')}</p>}

      {!live && (
        <section className="a-sec ai-overview" aria-label={t('ws.overview.title')}>
          <h3>{t('ws.overview.title')}</h3>
          {!nar || nar.status === 'pending'
            ? <p className="muted" role="status">{t('ws.overview.pending')}</p>
            : (
              <>
                <p className="overview-text">{nar.text[l] ?? nar.text.en}</p>
                <p className="muted small">
                  {nar.provider === 'rules-v1' ? t('ws.overview.byRules') : t('ws.overview.byModel', { model: nar.model })}
                  {nar.fellBack && ` ${t('ws.overview.fellBack')}`} {t('ws.overview.check')}
                </p>
              </>
            )}
        </section>
      )}

      {status === 'rejected' && (
        <div className="manual-box no-print">
          <h3>{t('ws.manual.title')}</h3>
          <textarea value={manual} onChange={(e) => setManual(e.target.value)} rows={5} aria-label={t('ws.manual.title')} />
          <button type="button" className="primary" disabled={busy || !manual.trim()} onClick={() => act('summary/manual', { note: manual })}>{t('ws.manual.save')}</button>
        </div>
      )}
      {summary.kind === 'manual' && <section className="a-sec"><h3>{t('ws.manual.title')}</h3><p className="manual-text">{summary.note}</p></section>}

      {c.sections.map((s) => (
        <section className="a-sec" key={s.id}>
          <h3>{s.title[IDX[lang]]}</h3>
          {s.items.length === 0 && <p className="muted">{t('analysis.nothing')}</p>}
          <ul className="plain">
            {s.items.map((it) => (
              <li key={it.id} className={`sum-item${it.status === 'not_answered' ? ' is-missing' : ''}`}>
                {it.label && <span className="muted">{it.label[IDX[lang]]}: </span>}
                {it.status === 'not_answered' && <strong className="not-answered">{t('ws.notAnswered')}</strong>}
                {it.status === 'physician_to_observe' && <strong className="not-answered">{t('ws.observe')}</strong>}
                {it.status === 'answered' && (editing === it.id
                  ? <textarea autoFocus value={text(it)} rows={2} onChange={(e) => setEdits({ ...edits, [it.id]: e.target.value })} onBlur={() => setEditing(null)} />
                  : <strong>{text(it)}</strong>)}
                {(edits[it.id] || it.edited) && <> <Tag kind="sev-warning">{t('ws.edited')}</Tag></>}
                {it.needsReview && <> <Tag kind="sev-warning">{t('analysis.toCheck')}</Tag></>}
                {' '}<SourceChip source={it.source} />
                {canEdit && it.status === 'answered' && <button type="button" className="linklike no-print" onClick={() => setEditing(it.id)}>{t('ws.summary.edit')}</button>}
              </li>
            ))}
          </ul>
        </section>
      ))}

      <section className="a-sec">
        <h3>{t('ws.files.title')}</h3>
        <p>{t('ws.files.included')}: {c.files.included.length ? c.files.included.map((f) => <span key={f.id} className="chip">{f.name}</span>) : '–'}</p>
        {c.files.failed.length > 0 && <p>{t('ws.files.failed')}: {c.files.failed.map((f) => <span key={f.id} className="chip">{f.name}</span>)}</p>}
        {c.files.pending.length > 0 && <p className="muted">{t('analysis.pending', { n: c.files.pending.length })}</p>}
      </section>

      <section className="a-sec" id="completeness">
        <h3>{t('ws.complete.title')}</h3>
        <p><strong>{t('ws.complete.count', { a: c.completeness.answered, n: c.completeness.total })}</strong></p>
        {c.completeness.notAnswered.length > 0 && (
          <>
            <p className="muted">{t('ws.complete.missing')}</p>
            <ul className="plain">{c.completeness.notAnswered.map((x) => <li key={x.id}>{x.label[IDX[lang]]}</li>)}</ul>
          </>
        )}
        {data.diagnosticWording?.length > 0 && <p role="alert" className="error">{t('ws.diagnosticWarning')}</p>}
      </section>

      <section className="a-sec no-print">
        <h3>{t('ws.versions.title')}</h3>
        <ol className="plain">
          {versions.map((v) => (
            <li key={v.version}>
              v{v.version} · {t(`ws.version.${v.kind}`)} · {v.by ?? t('ws.version.system')} · {new Date(v.at).toLocaleString()}
              {v.changed.length > 0 && <span className="muted"> · {t('ws.versions.changed', { n: v.changed.length })}</span>}
            </li>
          ))}
        </ol>
      </section>
      <button type="button" className="linklike no-print" onClick={() => onJump('alerts')}>{t('ws.summary.checks')}</button>
    </div>
  );
}

function SourceChip({ source }) {
  const { t } = useI18n();
  if (source.type === 'file') return <span className="chip">{source.name}</span>;
  if (source.type === 'files') return <span className="chip">{source.sources.map((s) => (s.type === 'patient' ? t('analysis.med.patient') : s.name)).join(', ')}</span>;
  if (source.type === 'registration') return <span className="chip">{t('ws.source.registration')}</span>;
  if (source.type === 'physician') return <span className="chip">{t('ws.source.physician')}</span>;
  return <span className="chip">{t('ws.source.patient')}{source.modality ? ` (${t(`ws.source.${source.modality}`)})` : ''}</span>;
}

function DocumentsTab({ analysis, onScan }) {
  const { t } = useI18n();
  const events = analysis.results.timeline.events;
  return (
    <section className="a-sec">
      <h3>{t('ws.tab.documents')}</h3>
      {events.length === 0 && <p>{t('analysis.nothing')}</p>}
      <ul className="plain">
        {events.map((e) => (
          <li key={e.documentId}>
            <span className="chip">{e.name}</span> {t(`analysis.doctype.${['prescription', 'lab_report', 'discharge_summary', 'other'].includes(e.docType) ? e.docType : 'unknown'}`)} · {e.date ?? t('analysis.dateMissing')} ·{' '}
            {t(`docs.status.${e.status}`)}
            {e.attentionReason && <> ({e.attentionReason})</>}{' '}
            <button type="button" className="linklike" onClick={() => onScan({ documentId: e.documentId, region: null, name: e.name })}>{t('analysis.viewScan')}</button>
          </li>
        ))}
      </ul>
    </section>
  );
}

function AlertsTab({ analysis, encounterId, alerts }) {
  const { t, lang } = useI18n();
  const mine = alerts.filter((a) => a.encounterId === encounterId);
  return (
    <div>
      <section className="a-sec">
        <h3>{t('alerts.title')}</h3>
        {mine.length === 0 && <p>{t('alerts.none')}</p>}
        {mine.map((a) => (
          <p key={a.id} className={`issue sev-${a.level === 'emergency' ? 'attention' : 'warning'}`}>
            <Tag kind={`sev-${a.level === 'emergency' ? 'attention' : 'warning'}`}>{t(`alerts.level.${a.level}`)}</Tag> {a.reason[IDX[lang]]}
          </p>
        ))}
      </section>
      <Consistency c={analysis.results.consistency} file={(id) => analysis.results.timeline.events.find((e) => e.documentId === id)?.name ?? '–'} />
    </div>
  );
}

// ---------- the workspace: queue left, patient right (DB-4) ----------
export default function DoctorWorkspace() {
  const { t, lang } = useI18n();
  const { alerts } = useAlertStream('doctor');
  const [queue, setQueue] = useState({ items: [], counters: {} });
  const [filters, setFilters] = useState({ q: '', status: '', alert: false });
  const [selected, setSelected] = useState(null);
  const [tab, setTab] = useState('summary');
  const [summary, setSummary] = useState(null);
  const [analysis, setAnalysis] = useState(null);
  const [scan, setScan] = useState(null);
  const [error, setError] = useState('');
  const [params] = useSearchParams();
  const queueRef = useRef(queue);
  queueRef.current = queue;

  const loadQueue = useCallback(async () => {
    const qs = new URLSearchParams({ q: filters.q, status: filters.status, ...(filters.alert ? { alert: '1' } : {}) });
    try { const r = await api(`/doctor/encounters?${qs}`); if (r.ok) setQueue(r.body); } catch { /* retried on the next tick */ }
  }, [filters]);
  useEffect(() => {
    loadQueue();
    const timer = setInterval(loadQueue, 6000);
    return () => clearInterval(timer);
  }, [loadQueue]);

  const reload = useCallback(async () => {
    if (!selected) return;
    try {
      const [s, a] = await Promise.all([api(`/doctor/encounters/${selected}/summary`), api(`/doctor/encounters/${selected}/analysis`)]);
      if (s.ok && a.ok) { setSummary(s.body); setAnalysis(a.body); setError(''); } else setError(t('analysis.loadError'));
    } catch { setError(t('analysis.loadError')); }
    loadQueue();
  }, [selected, loadQueue, t]);
  useEffect(() => {
    if (!selected) return undefined;
    reload();
    const timer = setInterval(reload, 8000);
    return () => clearInterval(timer);
  }, [selected, reload]);

  const choose = (id) => { setSummary(null); setAnalysis(null); setScan(null); setTab('summary'); setSelected(id); };

  // The alert banner opens a case in one click (DB-2): /doctor/workspace?encounter=<id>
  const wanted = params.get('encounter');
  useEffect(() => { if (wanted) choose(wanted); }, [wanted]);

  // Keyboard shortcuts (DB-10): J/K next and previous patient, 1 to 6 tabs, O opens the case, A accepts the summary.
  useEffect(() => {
    const onKey = async (e) => {
      if (typing(e) || e.ctrlKey || e.metaKey || e.altKey) return;
      const items = queueRef.current.items;
      const at = items.findIndex((i) => i.id === selected);
      if (e.key === 'j') choose(items[Math.min(items.length - 1, at + 1)]?.id ?? selected);
      else if (e.key === 'k') choose(items[Math.max(0, at - 1)]?.id ?? selected);
      else if (/^[1-6]$/.test(e.key)) setTab(TABS[Number(e.key) - 1]);
      else if (e.key === 'o' && summary?.status === 'ready') { await api(`/doctor/encounters/${selected}/consult`, { method: 'POST' }); reload(); }
      else if (e.key === 'a' && summary?.status === 'in_consultation') { await api(`/doctor/encounters/${selected}/summary/accept`, { method: 'POST' }); reload(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const current = useMemo(() => queue.items.find((i) => i.id === selected), [queue, selected]);
  const c = queue.counters;
  const counter = (k) => <span key={k} className="counter"><strong>{c[k] ?? 0}</strong> {t(`ws.counter.${k}`)}</span>;

  return (
    <>
    <Hero title={t('nav.doctor.workspace')} subtitle={t('hero.doctor.sub')} tiles={[
      { label: t('ws.counter.waiting'), value: c.waiting ?? 0, icon: 'clock' }, { label: t('ws.counter.ready'), value: c.ready ?? 0, icon: 'file' },
      { label: t('ws.counter.alerts'), value: c.alerts ?? 0, icon: 'alert', tone: 'alert' }, { label: t('ws.counter.completed'), value: c.completed ?? 0, icon: 'check' },
    ]} />
    <section className="workspace">
      <aside className="queue-pane" aria-label={t('ws.queue.title')}>
        <h2>{t('ws.queue.title')}</h2>
        <div className="counters">{['waiting', 'inIntake', 'ready', 'alerts', 'inConsultation', 'completed'].map(counter)}</div>
        <div className="filters">
          <input type="search" value={filters.q} placeholder={t('ws.search')} aria-label={t('ws.search')} onChange={(e) => setFilters({ ...filters, q: e.target.value })} />
          <select value={filters.status} aria-label={t('ws.filter.status')} onChange={(e) => setFilters({ ...filters, status: e.target.value })}>
            <option value="">{t('ws.filter.all')}</option>
            {['not_started', 'in_intake', 'ready', 'alert', 'in_consultation', 'completed', 'rejected'].map((s) => <option key={s} value={s}>{t(`ws.status.${s}`)}</option>)}
          </select>
          <label className="check"><input type="checkbox" checked={filters.alert} onChange={(e) => setFilters({ ...filters, alert: e.target.checked })} /> {t('ws.filter.alerts')}</label>
        </div>
        {queue.items.length === 0 && <p>{t('analysis.noPatients')}</p>}
        <ul className="queue-list">
          {queue.items.map((i) => (
            <li key={i.id}>
              <button type="button" aria-pressed={i.id === selected} className={`queue-item${i.id === selected ? ' is-selected' : ''}${i.openAlerts ? ' has-alert' : ''}`} onClick={() => choose(i.id)}>
                <span className="q-top"><strong>{i.token != null ? t('analysis.token', { n: i.token }) : '–'}</strong> {i.name}{i.ayush && <> <Tag kind="dir">{t('ws.ayush')}</Tag></>} <span className="muted">{i.age ?? ''} {i.sex ? i.sex[0].toUpperCase() : ''}</span></span>
                <span className="q-mid"><StatusChip chip={i.chip} /> {i.openAlerts > 0 && i.chip !== 'alert' && <StatusChip chip="alert" />} {i.complaint && <span className="muted">{i.complaint.label[IDX[lang]]}</span>}</span>
                <Warnings w={i.warnings} onJump={(tb) => { choose(i.id); setTab(tb); }} />
              </button>
            </li>
          ))}
        </ul>
        <p className="muted small">{t('ws.shortcuts')}</p>
      </aside>

      <div className="patient-pane">
        {!selected && <p>{t('analysis.pick')}</p>}
        {error && <p role="alert" className="error">{error}</p>}
        {selected && current && (
          <header className="analysis-head">
            <h2>{current.name}</h2>
            <span>{current.age ?? ''} {current.sex ?? ''}</span>
            <StatusChip chip={current.chip} />
            {current.ayush && <Tag kind="dir">{t('ws.ayush')}</Tag>}
            <Warnings w={current.warnings} onJump={setTab} />
          </header>
        )}
        {selected && (
          <nav className="tabs" role="tablist">
            {TABS.map((tb, k) => (
              <button key={tb} type="button" role="tab" aria-selected={tab === tb} className={tab === tb ? 'is-selected' : ''} onClick={() => setTab(tb)}>{k + 1}. {t(`ws.tab.${tb}`)}</button>
            ))}
          </nav>
        )}
        {selected && summary && analysis && (
          <div className={`tab-body${scan ? ' with-scan' : ''}`}>
            <div className="tab-main" role="tabpanel">
              {analysis.documents.pending > 0 && <p role="status" className="muted">{t('analysis.pending', { n: analysis.documents.pending })}</p>}
              {tab === 'summary' && <SummaryTab enc={selected} data={summary} reload={reload} onJump={setTab} />}
              {tab === 'documents' && <DocumentsTab analysis={analysis} onScan={setScan} />}
              {tab === 'labs' && <Labs l={analysis.results.lab_table} onScan={setScan} />}
              {tab === 'medications' && (<><Medicines m={analysis.results.med_reconciliation} onScan={setScan} /><Interactions x={analysis.results.interactions} /></>)}
              {tab === 'timeline' && <Timeline tl={analysis.results.timeline} onScan={setScan} />}
              {tab === 'alerts' && <AlertsTab analysis={analysis} encounterId={selected} alerts={alerts} />}
            </div>
            {scan && <ScanPanel encounterId={selected} scan={scan} onClose={() => setScan(null)} />}
          </div>
        )}
      </div>
    </section>
    </>
  );
}
