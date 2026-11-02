import { createHash } from 'node:crypto';
import { SECTIONS } from '../../config/questions.v1.js';
import { AYUSH_OBSERVED, AYUSH_SECTIONS, VAYA, vayaOf } from '../../config/ayush.v1.js';
import { activeQuestions, displayAnswer } from '../interview/dialogue.js';

// The summary generator (FR-C1, C2, C4, C6). A pure function of the patient's answers and the cross-document analysis, so the same
// input gives the same draft. It states facts only: what the patient answered (or did not), and what the files say, each with its source.
// It never combines facts into a conclusion and never names a diagnosis of its own. Conditions that a file names are quoted from that
// file and shown as "named in the file".
//
// content = { version, generator, sections: [{ id, title:[en,hi,mr], items:[item] }], files:{ included, failed, pending }, completeness }
// item    = { id, label:[en,hi,mr]|null, status:'answered'|'not_answered', text:{en,hi,mr}|null, quoted:[...], source:{ type:'patient'|'file'|'files', ... } }

export const GENERATOR = 'rules-v1';
export const LANG_KEYS = ['en', 'hi', 'mr'];

// Words for the facts taken from files. Hindi and Marathi are first drafts and, like the question bank, await native-speaker review.
const W = {
  date_unknown: ['date not found', 'तारीख नहीं मिली', 'तारीख मिळाली नाही'],
  conditions: ['Conditions named in the file', 'फ़ाइल में लिखी स्थितियाँ', 'फाईलमध्ये नमूद स्थिती'],
  procedures: ['Procedures named in the file', 'फ़ाइल में लिखी प्रक्रियाएँ', 'फाईलमध्ये नमूद प्रक्रिया'],
  read: ['{m} medicines and {l} lab values read', '{m} दवाइयाँ और {l} जाँच मान पढ़े गए', '{m} औषधे आणि {l} तपासणी मूल्ये वाचली'],
  range: ['range', 'सीमा', 'मर्यादा'], to: ['to', 'से', 'ते'],
  change: ['change from the previous result', 'पिछले नतीजे से बदलाव', 'मागील निकालापासून बदल'],
  check: ['to be checked against the file', 'फ़ाइल से मिलान करना है', 'फाईलशी पडताळायचे'],
  meds: ['Medicines across the files and the patient\'s answers', 'फ़ाइलों और मरीज़ के उत्तरों में दवाइयाँ', 'फाईल आणि रुग्णाच्या उत्तरांमधील औषधे'],
  patientSaid: ['patient said', 'मरीज़ ने बताया', 'रुग्णाने सांगितले'],
  invest: ['Prior investigations summary', 'पिछली जाँचों का सारांश', 'मागील तपासण्यांचा सारांश'],
  type: {
    prescription: ['Prescription', 'पर्ची', 'औषधचिठ्ठी'], lab_report: ['Lab report', 'जाँच रिपोर्ट', 'तपासणी अहवाल'],
    discharge_summary: ['Discharge summary', 'डिस्चार्ज सारांश', 'डिस्चार्ज सारांश'], other: ['Document', 'कागज़', 'कागद'],
  },
  flag: { high: ['high', 'अधिक', 'जास्त'], low: ['low', 'कम', 'कमी'], normal: ['in range', 'सीमा के भीतर', 'मर्यादेत'], range_unavailable: ['no range given', 'सीमा नहीं दी गई', 'मर्यादा दिलेली नाही'] },
  dir: { up: ['up', 'ऊपर', 'वर'], down: ['down', 'नीचे', 'खाली'], unchanged: ['unchanged', 'वही', 'तेवढेच'] },
};
const fill = (s, v) => s.replace(/\{(\w+)\}/g, (_, k) => v[k]);
const all = (fn) => Object.fromEntries(LANG_KEYS.map((l, i) => [l, fn(i)]));

export const summaryHash = (input) => createHash('sha256').update(JSON.stringify(input)).digest('hex');

function interviewItems(answers, sectionId, opts) {
  return activeQuestions(answers, opts).filter((q) => q.section === sectionId).map((q) => {
    const a = answers[q.key];
    const answered = Boolean(a) && !a.skipped;
    return {
      id: q.key, label: q.text, ...(q.parameter ? { parameter: q.parameter } : {}), status: answered ? 'answered' : 'not_answered',
      // a skipped or never-asked question is "not answered", never "no" (DB-12)
      ...(answered ? { text: all((i) => displayAnswer(q, a, ['en', 'hi', 'mr'][i])) } : { text: null }),
      quoted: answered && q.type === 'text' ? [String(a.value)] : [],
      source: { type: 'patient', modality: a?.modality ?? null },
      // a question written by the AI interviewer is marked as such, with the reason it gave for asking
      ...(q.ai ? { askedBy: 'ai', rationale: q.rationale ?? null, model: q.model ?? null } : {}),
    };
  });
}

function fileItems(analysis) {
  const items = [];
  const byName = Object.fromEntries(analysis.timeline.events.map((e) => [e.documentId, e.name]));
  for (const e of analysis.timeline.events.filter((x) => x.status === 'done')) {
    const quoted = [...e.diagnoses, ...e.procedures];
    items.push({
      id: `file:${e.documentId}`, label: null, status: 'answered', quoted,
      text: all((i) => [
        `${(W.type[e.docType] ?? W.type.other)[i]}, ${e.date ?? W.date_unknown[i]}.`,
        e.diagnoses.length ? `${W.conditions[i]}: ${e.diagnoses.join(', ')}.` : '',
        e.procedures.length ? `${W.procedures[i]}: ${e.procedures.join(', ')}.` : '',
        (e.counts.medications || e.counts.labs) ? `${fill(W.read[i], { m: e.counts.medications, l: e.counts.labs })}.` : '',
      ].filter(Boolean).join(' ')),
      source: { type: 'file', documentId: e.documentId, name: e.name },
    });
  }
  for (const t of analysis.lab_table.tests) {
    const p = t.latest && t.points.find((x) => x.documentId === t.latest.documentId && x.date === t.latest.date);
    if (!p) continue;
    const flagged = p.flag === 'high' || p.flag === 'low';
    if (!flagged) continue;
    items.push({
      id: `lab:${t.key}`, label: null, status: 'answered', quoted: [],
      text: all((i) => {
        const base = `${t.test}: ${p.value} ${p.unit ?? ''} (${p.date ?? W.date_unknown[i]})`;
        if (p.needsReview) return `${base}, ${W.check[i]}.`;
        const r = p.refLow != null && p.refHigh != null ? ` (${W.range[i]} ${p.refLow} ${W.to[i]} ${p.refHigh})` : '';
        const d = t.direction ? `; ${W.change[i]}: ${W.dir[t.direction][i]}` : '';
        return `${base}, ${W.flag[p.flag][i]}${r}${d}.`;
      }),
      source: { type: 'file', documentId: p.documentId, name: byName[p.documentId] ?? '' },
    });
  }
  return items;
}

function medicineItems(analysis) {
  return analysis.med_reconciliation.medications.map((m) => ({
    id: `med:${m.key}`, label: W.meds, status: 'answered', quoted: [],
    text: all(() => `${m.name}; ${m.entries.map((e) => [e.dose, e.frequency].filter(Boolean).join(' ') || '–').filter((x, k, a) => a.indexOf(x) === k).join(' / ')}.`),
    source: { type: 'files', sources: m.entries.map((e) => (e.source === 'patient' ? { type: 'patient' } : { type: 'file', documentId: e.documentId, name: e.documentName })) },
    needsReview: m.needsReview,
  }));
}

// answers: { [questionKey]: { value|skipped, modality } }; analysis: the five analysis results (timeline, ...), or null.
export function generateSummary({ answers, analysis, documents = [], ayush = false, patient = {} }) {
  const opts = { ayush };
  const sections = SECTIONS.map(([id, title]) => ({ id, title, items: interviewItems(answers, id, opts) }));
  if (ayush) {
    // AYUSH sections sit beside the standard ones (Phase 7). What the physician must observe is listed, never filled in.
    for (const [id, title] of AYUSH_SECTIONS) sections.push({ id, title, items: interviewItems(answers, id, opts) });
    const dash = sections.find((s) => s.id === 'ayush_dashavidha').items;
    const vaya = vayaOf(patient.age);
    if (vaya) dash.push({ id: 'ayush.vaya', label: ['Vaya (age group)', 'वय (आयु वर्ग)', 'वय (वयोगट)'], parameter: 'vaya', status: 'answered', text: Object.fromEntries(LANG_KEYS.map((l, i) => [l, VAYA[vaya][i]])), quoted: [], source: { type: 'registration' } });
    for (const o of AYUSH_OBSERVED) {
      const target = sections.find((s) => s.id === (o.parameter === 'samprapti_assessment' ? 'ayush_nidana_samprapti' : 'ayush_dashavidha')).items;
      target.push({ id: `ayush.observe.${o.parameter}`, label: o.title, parameter: o.parameter, status: 'physician_to_observe', text: null, quoted: [], source: { type: 'physician' } });
    }
  }
  const emptyAnalysis = { timeline: { events: [] }, lab_table: { tests: [] }, med_reconciliation: { medications: [] } };
  const a = analysis ?? emptyAnalysis;
  sections.find((s) => s.id === 'drug_allergy').items.push(...medicineItems(a));
  sections.push({ id: 'investigations', title: W.invest, items: fileItems(a) });

  const interview = sections.flatMap((s) => s.items).filter((i) => i.source.type === 'patient');
  const notAnswered = interview.filter((i) => i.status === 'not_answered').map((i) => ({ id: i.id, label: i.label }));
  const failed = documents.filter((d) => d.status === 'needs_attention').map((d) => ({ id: d.id, name: d.name, reason: d.attentionReason }));
  const pending = documents.filter((d) => d.status === 'waiting' || d.status === 'reading').map((d) => ({ id: d.id, name: d.name }));
  return {
    version: 1, generator: GENERATOR, ayush, sections,
    files: {
      included: documents.filter((d) => d.status === 'done').map((d) => ({ id: d.id, name: d.name })), failed, pending,
    },
    completeness: { answered: interview.length - notAnswered.length, total: interview.length, notAnswered },
  };
}

// ---------- the no-diagnosis check (FR-C4) ----------
// Wording that states or implies a diagnosis. Text that is quoted from the patient or a file is removed first: the summary may repeat
// what they wrote, but its own sentences must not conclude anything.
const DIAGNOSTIC = [
  /\bdiagnos(is|es|ed|e|tic)\b/i, /\bsuffer(s|ed|ing)?\s+from\b/i, /\bconsistent\s+with\b/i, /\bsuggest(s|ed|ive|ing)?\b/i, /\blikely\b/i,
  /\bprobabl(e|y)\b/i, /\bdifferential\b/i, /\brules?\s+out\b/i, /\bimpression\b/i, /\bindicat(es|ed|ing|ive)\b/i, /\bdue\s+to\b/i, /\bcaused?\s+by\b/i,
  /\bsuspect(ed|s)?\b/i, /\bappears?\s+to\s+have\b/i, /\bconfirms?\b/i, /\bsigns?\s+of\b/i,
  /निदान/, /संभवतः/, /लगता\s+है/, /संभाव्य/, /असण्याची\s+शक्यता/, /सूचित\s+करते/,
];

export const diagnosticHits = (text) => DIAGNOSTIC.filter((re) => re.test(text)).map(String);

export function findDiagnosticWording(content) {
  const hits = [];
  for (const s of content.sections) {
    for (const item of s.items) {
      for (const l of LANG_KEYS) {
        let text = item.text?.[l];
        if (!text || item.edited) continue; // a doctor's own amendment is the doctor's words, not the generator's
        for (const q of item.quoted ?? []) text = text.split(q).join(' ');
        for (const re of DIAGNOSTIC) if (re.test(text)) hits.push({ item: item.id, lang: l, pattern: String(re), text });
      }
    }
  }
  return hits;
}
