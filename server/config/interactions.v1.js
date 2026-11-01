// Interaction source v1 (Phase 5): pairs of drugs or drug classes that need a second look when taken together.
// STATUS: DRAFT STARTER LIST. The PRD asks for a recognised interaction source chosen and reviewed with a clinician or pharmacist.
// This list is NOT that source: it holds widely published major and moderate interactions, written by the builder, and has had no
// clinical review. It sits behind `createInteractionSource` so a licensed dataset can replace it without touching the analysis code.
// Each rule names an `effect` key, never a sentence, so the doctor screen can say it in English, Hindi or Marathi.
// A side is a generic name or a class name (see drugs.v1.js). Rules are symmetric.

export const INTERACTIONS_VERSION = 1;
export const INTERACTIONS_STATUS = 'draft: pending clinician and pharmacist review';
export const INTERACTIONS_SOURCE = 'PatientCase_AI starter list v1 (not a licensed or recognised source)';

const r = (a, b, severity, effect) => ({ a, b, severity, effect });

export const INTERACTION_RULES = [
  r('warfarin', 'aspirin', 'major', 'bleeding_risk'),
  r('warfarin', 'nsaid', 'major', 'bleeding_risk'),
  r('warfarin', 'clopidogrel', 'major', 'bleeding_risk'),
  r('warfarin', 'macrolide', 'major', 'inr_change'),
  r('warfarin', 'co-trimoxazole', 'major', 'inr_change'),
  r('warfarin', 'amiodarone', 'major', 'inr_change'),
  r('warfarin', 'fluoroquinolone', 'moderate', 'inr_change'),
  r('warfarin', 'ssri', 'major', 'bleeding_risk'),
  r('aspirin', 'clopidogrel', 'moderate', 'bleeding_risk'),
  r('clopidogrel', 'omeprazole', 'moderate', 'reduced_activation'),
  r('nsaid', 'ace_inhibitor', 'moderate', 'kidney_and_blood_pressure'),
  r('nsaid', 'arb', 'moderate', 'kidney_and_blood_pressure'),
  r('nsaid', 'ssri', 'moderate', 'gi_bleeding'),
  r('nsaid', 'corticosteroid', 'moderate', 'gi_bleeding'),
  r('nsaid', 'fluoroquinolone', 'moderate', 'seizure_risk'),
  r('nsaid', 'methotrexate', 'major', 'drug_toxicity'),
  r('ace_inhibitor', 'potassium_sparing_diuretic', 'major', 'high_potassium'),
  r('arb', 'potassium_sparing_diuretic', 'major', 'high_potassium'),
  r('ace_inhibitor', 'potassium_supplement', 'moderate', 'high_potassium'),
  r('arb', 'potassium_supplement', 'moderate', 'high_potassium'),
  r('ace_inhibitor', 'arb', 'moderate', 'dual_blockade'),
  r('simvastatin', 'clarithromycin', 'major', 'muscle_toxicity'),
  r('simvastatin', 'amiodarone', 'moderate', 'muscle_toxicity'),
  r('simvastatin', 'amlodipine', 'moderate', 'muscle_toxicity'),
  r('atorvastatin', 'clarithromycin', 'moderate', 'muscle_toxicity'),
  r('pde5_inhibitor', 'nitrate', 'major', 'severe_low_blood_pressure'),
  r('digoxin', 'amiodarone', 'major', 'drug_toxicity'),
  r('digoxin', 'macrolide', 'major', 'drug_toxicity'),
  r('ssri', 'tramadol', 'major', 'serotonin_syndrome'),
  r('ssri', 'aspirin', 'moderate', 'gi_bleeding'),
  r('methotrexate', 'co-trimoxazole', 'major', 'drug_toxicity'),
  r('insulin', 'beta_blocker', 'moderate', 'masked_low_sugar'),
  r('sulfonylurea', 'fluoroquinolone', 'moderate', 'blood_sugar_change'),
  r('sulfonylurea', 'co-trimoxazole', 'moderate', 'blood_sugar_change'),
];

export function createInteractionSource(rules = INTERACTION_RULES) {
  return {
    name: INTERACTIONS_SOURCE, version: INTERACTIONS_VERSION, status: INTERACTIONS_STATUS,
    // `a` and `b` each describe a drug as { generic, classes }. Returns the matching rule with the side that matched, or null.
    check(a, b) {
      const names = (x) => new Set([x.generic, ...x.classes]);
      const na = names(a), nb = names(b);
      let hit = null;
      for (const rule of rules) {
        if ((na.has(rule.a) && nb.has(rule.b)) || (na.has(rule.b) && nb.has(rule.a))) {
          if (!hit || (rule.severity === 'major' && hit.severity !== 'major')) hit = rule;
        }
      }
      return hit;
    },
  };
}
