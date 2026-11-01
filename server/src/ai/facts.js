// The facts handed to the model, in English, with no name, contact number or identifier. The patient's recap is built only from what the patient
// said; the doctor's overview also gets what the files contain and the checks the system ran (the patient's model call never sees those).

const items = (content) => content.sections.flatMap((s) => s.items.map((it) => ({ section: s.title[0], it })));

function interviewFacts(content) {
  const answered = items(content).filter(({ it }) => it.status === 'answered' && it.source.type === 'patient')
    .map(({ section, it }) => ({ section, question: (it.label?.[0] ?? '').replace(/\?+$/, ''), answer: it.text.en }));
  const notAnswered = (content.completeness?.notAnswered ?? []).map((x) => (x.label?.[0] ?? '').replace(/\?+$/, ''));
  return { answered, notAnswered };
}

export const ageBand = (age) => (age == null ? null : age < 1 ? 'infant' : age < 13 ? 'child' : age < 18 ? 'adolescent' : age < 40 ? 'adult under 40' : age < 65 ? 'adult 40 to 64' : 'older adult 65 or over');

export function patientFacts({ content, patient }) {
  return { audience: 'patient', person: { ageGroup: ageBand(patient.age), sex: patient.sex ?? null }, ...interviewFacts(content) };
}

export function doctorFacts({ content, analysis, patient }) {
  const a = analysis ?? {};
  return {
    audience: 'doctor', person: { ageGroup: ageBand(patient.age), sex: patient.sex ?? null }, ...interviewFacts(content),
    files: (a.timeline?.events ?? []).map((e) => ({ type: e.docType, date: e.date ?? 'date not found', status: e.status, conditionsNamedInFile: e.diagnoses, proceduresNamedInFile: e.procedures })),
    medicines: (a.med_reconciliation?.medications ?? []).map((m) => ({
      name: m.name, source: m.status, entries: m.entries.map((e) => [e.dose, e.frequency].filter(Boolean).join(' ')).filter(Boolean), doseChanges: m.doseChanges.map((c) => ({ kind: c.kind, direction: c.direction })), needsChecking: m.needsReview,
    })),
    labs: (a.lab_table?.tests ?? []).filter((t) => t.latest).map((t) => ({ test: t.test, latest: t.latest.value, unit: t.unit, flag: t.latest.flag, directionSincePrevious: t.direction, needsChecking: t.needsReview })),
    allergiesReported: (a.interactions?.allergies?.items ?? []).map((x) => x.term),
    allergyConflicts: (a.interactions?.allergyConflicts ?? []).map((c) => ({ drug: c.drug, allergen: c.allergen })),
    interactionsFlagged: (a.interactions?.interactions ?? []).map((i) => ({ between: [i.a, i.b], severity: i.severity, effect: i.effect })),
    recordChecks: (a.consistency?.issues ?? []).filter((i) => i.severity !== 'info').map((i) => ({ code: i.code, severity: i.severity })),
  };
}
