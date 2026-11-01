// Structural checks on a FHIR R4 bundle. These are our own checks of the required elements, references and shapes we produce; they are
// NOT validation against the ABDM profiles, which needs the ABDM sandbox (Phase 0 external action). The result says so.

const REQUIRED = {
  Composition: ['status', 'type', 'subject', 'date', 'author', 'title'],
  Patient: ['name'],
  Practitioner: ['name'],
  Encounter: ['status', 'class', 'subject'],
  MedicationStatement: ['status', 'subject', 'medicationCodeableConcept'],
  Observation: ['status', 'code', 'subject', 'valueQuantity'],
  AllergyIntolerance: ['patient', 'code'],
  DocumentReference: ['status', 'subject', 'content'],
};
const ISO_DATE = /^\d{4}-\d{2}-\d{2}(T[\d:.+Z-]+)?$/;
const walk = (v, fn, path = '') => {
  fn(v, path);
  if (Array.isArray(v)) v.forEach((x, i) => walk(x, fn, `${path}[${i}]`));
  else if (v && typeof v === 'object') Object.entries(v).forEach(([k, x]) => walk(x, fn, `${path}.${k}`));
};
const stamp = () => ({
  checked: 'FHIR R4 structural checks written for this project',
  abdmProfiles: { checked: false, reason: 'ABDM sandbox not configured; profile validation has not been run' },
});

export function validateBundle(bundle) {
  const errors = [];
  const err = (where, msg) => errors.push({ where, msg });
  if (bundle?.resourceType !== 'Bundle') return { valid: false, errors: [{ where: 'Bundle', msg: 'not a Bundle' }], ...stamp() };
  if (bundle.type !== 'document') err('Bundle.type', 'must be "document"');
  if (!bundle.timestamp || !ISO_DATE.test(bundle.timestamp)) err('Bundle.timestamp', 'missing or not a date');
  const entries = bundle.entry ?? [];
  if (entries[0]?.resource?.resourceType !== 'Composition') err('Bundle.entry[0]', 'a document bundle starts with its Composition');
  const urls = new Set(entries.map((e) => e.fullUrl));
  if (urls.size !== entries.length) err('Bundle.entry', 'duplicate fullUrl');
  const ids = new Set();
  entries.forEach((e, i) => {
    const r = e.resource, at = `Bundle.entry[${i}].${r?.resourceType}`;
    if (!r?.resourceType || !r.id) { err(at, 'resource without type or id'); return; }
    if (e.fullUrl !== `urn:uuid:${r.id}`) err(at, 'fullUrl does not match the id');
    if (ids.has(r.id)) err(at, 'duplicate id');
    ids.add(r.id);
    for (const f of REQUIRED[r.resourceType] ?? []) if (r[f] == null || (Array.isArray(r[f]) && !r[f].length)) err(at, `missing ${f}`);
    if (!(r.resourceType in REQUIRED)) err(at, 'resource type not in the mapping');
    walk(r, (v, path) => {
      if (v === undefined) err(at + path, 'undefined value');
      if (v && typeof v === 'object' && 'reference' in v && !urls.has(v.reference)) err(at + path, `reference ${v.reference} is not in the bundle`);
      if (/(Date|dateTime|timestamp)$/.test(path) && typeof v === 'string' && !ISO_DATE.test(v)) err(at + path, 'not a date');
    });
    if (r.resourceType === 'Observation' && typeof r.valueQuantity?.value !== 'number') err(at, 'valueQuantity.value must be a number');
    if (r.resourceType === 'Composition') {
      for (const [k, s] of (r.section ?? []).entries()) {
        if (!s.title || !s.text?.div?.startsWith('<div xmlns="http://www.w3.org/1999/xhtml">')) err(`${at}.section[${k}]`, 'section needs a title and an xhtml narrative');
      }
    }
  });
  return { valid: errors.length === 0, errors, ...stamp() };
}
