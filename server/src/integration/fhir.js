import { randomUUID } from 'node:crypto';

// Maps a confirmed encounter to a FHIR R4 document Bundle (FR-D4, FR-D5): Composition (the confirmed summary), Patient, Encounter, Practitioner,
// MedicationStatement, Observation (lab values), AllergyIntolerance and DocumentReference. Only facts the record already holds are mapped:
// no resource states a diagnosis or an interpretation. The ABDM profile URLs are NOT claimed (meta.profile is left out) until the
// bundle has been validated in the ABDM sandbox (docs/integration-report.md).

export const ABHA_SYSTEM = 'https://healthid.ndhm.gov.in';
const IDX = { en: 0, hi: 1, mr: 2 };
const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const div = (lines) => `<div xmlns="http://www.w3.org/1999/xhtml">${lines.map((l) => `<p>${esc(l)}</p>`).join('')}</div>`;
const ref = (r) => ({ reference: `urn:uuid:${r.id}`, type: r.resourceType });
const entry = (r) => ({ fullUrl: `urn:uuid:${r.id}`, resource: r });

// input: { patient:{id,name,sex,dob,abha}, encounter:{id,startedAt}, practitioner:{id,name}, summary:{lang,content,note,version,decidedAt},
//          medications:[{name,dose,frequency}], labs:[{test,value,unit,date,refLow,refHigh}], allergies:[{term}], documents:[{fhir}] }
export function buildBundle(input, { includeAbha = false } = {}) {
  const lang = input.summary.lang ?? 'en';
  const i = IDX[lang] ?? 0;
  const patient = {
    resourceType: 'Patient', id: input.patient.id,
    ...(includeAbha && input.patient.abha ? { identifier: [{ system: ABHA_SYSTEM, value: input.patient.abha }] } : {}),
    name: [{ text: input.patient.name }],
    ...(input.patient.sex ? { gender: input.patient.sex } : {}),
    ...(input.patient.dob ? { birthDate: input.patient.dob } : {}),
  };
  const practitioner = { resourceType: 'Practitioner', id: input.practitioner.id, name: [{ text: input.practitioner.name }] };
  const encounter = {
    resourceType: 'Encounter', id: input.encounter.id, status: 'finished',
    class: { system: 'http://terminology.hl7.org/CodeSystem/v3-ActCode', code: 'AMB', display: 'ambulatory' },
    subject: ref(patient), period: { start: input.encounter.startedAt },
  };
  const meds = input.medications.map((m) => ({
    resourceType: 'MedicationStatement', id: randomUUID(), status: 'unknown', subject: ref(patient), context: ref(encounter),
    medicationCodeableConcept: { text: m.name },
    ...(m.dose || m.frequency ? { dosage: [{ text: [m.dose, m.frequency].filter(Boolean).join(', ') }] } : {}),
  }));
  const obs = input.labs.filter((l) => typeof l.value === 'number').map((l) => ({
    resourceType: 'Observation', id: randomUUID(), status: 'final', category: [{ coding: [{ system: 'http://terminology.hl7.org/CodeSystem/observation-category', code: 'laboratory' }] }],
    code: { text: l.test }, subject: ref(patient), encounter: ref(encounter),
    ...(l.date ? { effectiveDateTime: l.date } : {}),
    valueQuantity: { value: l.value, ...(l.unit ? { unit: l.unit } : {}) },
    ...(l.refLow != null || l.refHigh != null ? { referenceRange: [{ ...(l.refLow != null ? { low: { value: l.refLow } } : {}), ...(l.refHigh != null ? { high: { value: l.refHigh } } : {}) }] } : {}),
  }));
  const allergies = input.allergies.map((a) => ({ resourceType: 'AllergyIntolerance', id: randomUUID(), patient: ref(patient), code: { text: a.term } }));
  const docs = input.documents.map((d) => ({ ...d.fhir, subject: ref(patient), context: { encounter: [ref(encounter)] } }));

  const sectionEntries = { drug_allergy: [...meds, ...allergies], investigations: [...obs, ...docs] };
  const sections = (input.summary.content?.sections ?? []).map((s) => {
    const lines = s.items.filter((it) => it.status === 'answered' && it.text).map((it) => `${Array.isArray(it.label) ? `${it.label[i]}: ` : ''}${it.text[lang] ?? it.text.en}`);
    const refs = sectionEntries[s.id] ?? [];
    return {
      title: Array.isArray(s.title) ? s.title[i] : String(s.title),
      text: { status: 'generated', div: div(lines.length ? lines : ['-']) },
      ...(refs.length ? { entry: refs.map(ref) } : {}),
    };
  });
  if (input.summary.note) sections.push({ title: 'Manual documentation by the doctor', text: { status: 'additive', div: div([input.summary.note]) } });
  if (!sections.length) sections.push({ title: 'Summary', text: { status: 'empty', div: div(['-']) } });

  const composition = {
    resourceType: 'Composition', id: randomUUID(), status: 'final',
    type: { coding: [{ system: 'http://loinc.org', code: '11488-4', display: 'Consult note' }] },
    subject: ref(patient), encounter: ref(encounter), date: input.summary.decidedAt, author: [ref(practitioner)],
    title: 'OPD history summary', section: sections,
  };
  const resources = [composition, patient, practitioner, encounter, ...meds, ...obs, ...allergies, ...docs];
  return {
    resourceType: 'Bundle', id: randomUUID(), type: 'document', timestamp: input.summary.decidedAt,
    identifier: { system: 'urn:patientcase:summary', value: `${input.encounter.id}:${input.summary.version}` },
    entry: resources.map(entry),
  };
}
