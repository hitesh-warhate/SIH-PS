import { useI18n } from '../i18n/index.jsx';

const REASONS = new Set(['blurry', 'too_dark', 'low_resolution', 'cut_off_edges', 'blank_or_overexposed', 'unreadable', 'no_text_found', 'scanned_pdf', 'processing_failed']);
const DOCTYPES = new Set(['prescription', 'lab_report', 'discharge_summary', 'other']);
const FLAG_MARK = { high: '▲', low: '▼', normal: '●', range_unavailable: '○' };
const DIR_MARK = { up: '↑', down: '↓', unchanged: '=' };
const SEV_MARK = { attention: '‼', warning: '!', info: 'i' };

// Parts of the doctor workspace that show the cross-document analysis (Phase 5). Everything here is decision support: directions are
// shown without interpretation, and every extracted value can be opened beside the file it came from (DB-7).

// Confidence is shown as a percentage with a word, never colour alone. A value flagged for review always says so.
export function ConfBadge({ value, needsReview }) {
  const { t } = useI18n();
  if (value == null) return null;
  const level = value >= 0.9 ? 'high' : value >= 0.75 ? 'medium' : 'low';
  return <Tag kind={needsReview || level === 'low' ? 'sev-warning' : 'dir'}>{Math.round(value * 100)}% {t(`analysis.conf.${level}`)}</Tag>;
}

function ScanLink({ onScan, documentId, name, region }) {
  const { t } = useI18n();
  if (!onScan || !documentId) return null;
  return <button type="button" className="linklike" onClick={() => onScan({ documentId, region, name })}>{t('analysis.viewScan')}</button>;
}

export function Tag({ children, kind = '' }) {
  return <span className={`tag ${kind}`}>{children}</span>;
}

function issueText(t, i, file) {
  const p = i.params;
  const f = i.documentId ? file(i.documentId) : '';
  const args = {
    possible_wrong_patient: { file: f, signals: p.signals?.map((s) => t(`analysis.signal.${s}`)).join(', ') },
    date_missing: { file: f },
    date_in_future: { file: f, date: p.date },
    document_needs_attention: { file: f, reason: t(`analysis.reason.${REASONS.has(p.reason) ? p.reason : 'other'}`) },
    duplicate_document: { files: p.documentIds?.map(file).join(', ') },
    lab_conflict: { test: p.test, date: p.date },
    medication_conflict: { drug: p.drug, date: p.date },
    patient_reports_no_medicines: { list: p.medicines?.join(', ') },
    unknown_drug: { name: p.name },
    unknown_test: { name: p.name },
    unit_not_comparable: { test: p.test, units: p.units?.join(', ') },
  }[i.code] ?? {};
  return t(`analysis.issue.${i.code}`, args);
}

export function Consistency({ c, file }) {
  const { t } = useI18n();
  return (
    <section className="a-sec">
      <h3>{t('analysis.sec.consistency')}</h3>
      {c.issues.length === 0 && <p>{t('analysis.nothing')}</p>}
      <ul className="issues">
        {c.issues.map((i, k) => (
          <li key={k} className={`issue sev-${i.severity}`}>
            <Tag kind={`sev-${i.severity}`}>{SEV_MARK[i.severity]} {t(`analysis.sev.${i.severity}`)}</Tag> {issueText(t, i, file)}
          </li>
        ))}
      </ul>
    </section>
  );
}

// Where a drug was seen: each chip names the drug, then the file (and its date) or the patient's own answer.
function Sources({ list, drug }) {
  const { t } = useI18n();
  return <>{list.map((s, k) => <span key={k} className="chip">{drug}: {s.source === 'patient' ? t('analysis.med.patient') : s.documentName}{s.date ? ` · ${s.date}` : ''}</span>)}</>;
}

export function Interactions({ x }) {
  const { t } = useI18n();
  const allergyLine = !x.allergies.answered ? t('analysis.allergy.notAnswered')
    : x.allergies.reported === false ? t('analysis.allergy.none')
      : x.allergies.listMissing ? t('analysis.allergy.listMissing')
        : t('analysis.allergy.reported', { list: x.allergies.items.map((a) => a.term).join(', ') });
  return (
    <section className="a-sec">
      <h3>{t('analysis.sec.interactions')}</h3>
      {x.interactions.length === 0 && x.allergyConflicts.length === 0 && <p>{t('analysis.int.none')}</p>}
      <ul className="issues">
        {x.allergyConflicts.map((a, k) => (
          <li key={`a${k}`} className="issue sev-attention">
            <Tag kind="sev-attention">{SEV_MARK.attention} {t('analysis.sev.attention')}</Tag>{' '}
            {t('analysis.allergy.conflict', { drug: a.drug, allergen: a.allergen })} {a.match === 'class' ? t('analysis.allergy.byClass') : ''}
            <div><Sources list={a.sources} drug={a.drug} /></div>
          </li>
        ))}
        {x.interactions.map((i, k) => (
          <li key={k} className={`issue sev-${i.severity === 'major' ? 'attention' : 'warning'}`}>
            <Tag kind={`sev-${i.severity === 'major' ? 'attention' : 'warning'}`}>{t(`analysis.int.${i.severity}`)}</Tag> <strong>{t('analysis.int.pair', { a: i.a, b: i.b })}</strong>: {t(`analysis.effect.${i.effect}`)}
            <div><Sources list={i.sources.a} drug={i.a} /><Sources list={i.sources.b} drug={i.b} /></div>
          </li>
        ))}
      </ul>
      <p className="muted">{allergyLine}</p>
      {x.unchecked.length > 0 && <p className="muted">{t('analysis.int.unchecked', { names: x.unchecked.map((u) => u.name).join(', ') })}</p>}
      <p className="muted small">{t('analysis.int.source', { name: x.source.name, status: x.source.status })}</p>
    </section>
  );
}

const doseText = (e) => [e.dose, e.frequency].filter(Boolean).join(' ') || '–';

export function Medicines({ m, onScan }) {
  const { t } = useI18n();
  return (
    <section className="a-sec">
      <h3>{t('analysis.sec.meds')}</h3>
      {m.medications.length === 0 && <p>{t('analysis.nothing')}</p>}
      {m.medications.length > 0 && (
        <table className="a-table">
          <thead><tr><th>{t('analysis.med.name')}</th><th>{t('analysis.med.writtenAs')}</th><th>{t('analysis.med.where')}</th><th>{t('analysis.med.changes')}</th></tr></thead>
          <tbody>
            {m.medications.map((d) => (
              <tr key={d.key}>
                <td>
                  <strong>{d.name}</strong>
                  {!d.known && <> <Tag kind="sev-warning">{t('analysis.toCheck')}</Tag> <span className="muted">{t('analysis.med.unknown')}</span></>}
                  <div className="muted small">{t(`analysis.med.status.${d.status}`)}</div>
                </td>
                <td>{d.writtenNames.join(', ')}</td>
                <td>
                  <ul className="plain">
                    {d.entries.map((e, k) => (
                      <li key={k}>
                        {e.source === 'patient' ? t('analysis.med.patient') : e.documentName}
                        {e.source === 'document' && ` · ${e.date ?? t('analysis.dateMissing')}`}: {doseText(e)}
                        {e.needsReview && <> <Tag kind="sev-warning">{t('analysis.toCheck')}</Tag></>}
                        {e.source === 'document' && <> <ConfBadge value={e.confidence} needsReview={e.needsReview} /> <ScanLink onScan={onScan} documentId={e.documentId} name={e.documentName} region={e.region} /></>}
                      </li>
                    ))}
                  </ul>
                </td>
                <td>
                  {d.doseChanges.length === 0 && <span className="muted">{t('analysis.med.none')}</span>}
                  {d.doseChanges.map((c, k) => (
                    <div key={k}>{t(`analysis.med.change.${c.kind}`, {
                      direction: c.direction ? t(`analysis.med.direction.${c.direction}`) : '', from: doseText(c.from), to: doseText(c.to),
                    })}</div>
                  ))}
                  {d.duplicatesInDocument.map((x, k) => <div key={`d${k}`}>{t('analysis.med.duplicate', { file: x.documentName, names: x.written.join(', ') })}</div>)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

function rangeText(t, p) {
  if (p.refLow != null && p.refHigh != null) return t('analysis.lab.range', { low: p.refLow, high: p.refHigh });
  if (p.refHigh != null) return t('analysis.lab.below', { high: p.refHigh });
  if (p.refLow != null) return t('analysis.lab.above', { low: p.refLow });
  return '';
}

export function Labs({ l, onScan }) {
  const { t } = useI18n();
  return (
    <section className="a-sec">
      <h3>{t('analysis.sec.labs')}</h3>
      {l.tests.length === 0 && <p>{t('analysis.nothing')}</p>}
      {l.tests.length > 0 && (
        <table className="a-table">
          <thead><tr><th>{t('analysis.lab.test')}</th><th>{t('analysis.lab.results')}</th><th>{t('analysis.lab.latest')}</th></tr></thead>
          <tbody>
            {l.tests.map((s) => (
              <tr key={s.key}>
                <td>
                  <strong>{s.test}</strong>
                  {!s.known && <> <Tag kind="sev-warning">{t('analysis.toCheck')}</Tag></>}
                  {s.unit && <div className="muted small">{s.unit}</div>}
                </td>
                <td>
                  <ul className="plain">
                    {s.points.map((p, k) => (
                      <li key={k}>
                        {p.date ?? t('analysis.dateMissing')} · <strong>{p.value ?? '–'} {p.unit ?? ''}</strong>{' '}
                        <Tag kind={`flag-${p.flag}`}>{FLAG_MARK[p.flag]} {t(`analysis.flag.${p.flag}`)}</Tag>{' '}
                        <span className="muted">{rangeText(t, p)}</span>
                        {p.converted && <span className="muted"> · {t('analysis.lab.converted', { value: p.original.value, unit: p.original.unit })}</span>}
                        {p.unitMismatch && <> <Tag kind="sev-warning">{t('analysis.lab.unitMismatch')}</Tag></>}
                        {p.needsReview && !p.unitMismatch && <> <Tag kind="sev-warning">{t('analysis.toCheck')}</Tag></>}
                        {p.change?.sameDate && <span className="muted"> · {t('analysis.lab.sameDate')}</span>}
                        {p.change && p.change.direction && <> <Tag kind="dir">{DIR_MARK[p.change.direction]} {t(`analysis.dir.${p.change.direction}`)}</Tag></>}
                        {' '}<ConfBadge value={p.confidence} needsReview={p.needsReview} /> <ScanLink onScan={onScan} documentId={p.documentId} name={p.documentName} region={p.region} />
                      </li>
                    ))}
                  </ul>
                </td>
                <td>{s.direction ? <Tag kind="dir">{DIR_MARK[s.direction]} {t(`analysis.dir.${s.direction}`)}</Tag> : <span className="muted">{t('analysis.dir.none')}</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

export function Timeline({ tl, onScan }) {
  const { t } = useI18n();
  return (
    <section className="a-sec">
      <h3>{t('analysis.sec.timeline')}</h3>
      {tl.events.length === 0 && <p>{t('analysis.nothing')}</p>}
      <ol className="timeline">
        {tl.events.map((e) => (
          <li key={e.documentId}>
            <strong>{e.date ?? t('analysis.dateMissing')}</strong> · {t(`analysis.doctype.${DOCTYPES.has(e.docType) ? e.docType : 'unknown'}`)} · <span className="chip">{e.name}</span> <ScanLink onScan={onScan} documentId={e.documentId} name={e.name} region={null} />
            {e.dateMissing && <> <Tag kind="sev-warning">{t('analysis.toCheck')}</Tag></>}
            <div className="muted small">{t('analysis.timeline.counts', { meds: e.counts.medications, labs: e.counts.labs })}</div>
            {e.diagnoses.length > 0 && <div>{t('analysis.timeline.diagnoses', { list: e.diagnoses.join(', ') })}</div>}
            {e.procedures.length > 0 && <div>{t('analysis.timeline.procedures', { list: e.procedures.join(', ') })}</div>}
            {e.attentionReason && <div>{t('analysis.timeline.attention', { reason: t(`analysis.reason.${REASONS.has(e.attentionReason) ? e.attentionReason : 'other'}`) })}</div>}
          </li>
        ))}
      </ol>
    </section>
  );
}
