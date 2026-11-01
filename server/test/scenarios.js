// Scripted emergency scenarios for the red-flag rules (Phase 3 DoD). Small on purpose, to grow with clinician input.
// STATUS: written by the developers; NOT yet agreed with a clinician (docs/redflag-rules-review.md).
//   mustAlert: every listed rule id has to fire. mustNot: nothing may fire.
// Answer shorthand: a value, or 'SKIP' for a skipped question.

const SAFE = { 'emergency.screen': ['none'], 'allergy.any': 'no', 'drug.current_any': 'no' };
const withSafe = (extra) => ({ ...SAFE, ...extra });

export const SCENARIOS = [
  // ---- must alert ----
  { name: 'chest pain with breathlessness', mustAlert: ['RF-CHEST-BREATHLESS'], answers: withSafe({ 'cc.main': 'chest_pain', 'pain.associated': ['breathlessness', 'nausea'] }) },
  { name: 'chest pain with sweating', mustAlert: ['RF-CHEST-SWEATING'], answers: withSafe({ 'cc.main': 'chest_pain', 'pain.associated': ['sweating'] }) },
  { name: 'emergency screen: chest pain with difficulty breathing', mustAlert: ['RF-EMERG-CHEST'], answers: withSafe({ 'emergency.screen': ['e_chest'] }) },
  { name: 'emergency screen: stroke symptoms', mustAlert: ['RF-EMERG-STROKE'], answers: withSafe({ 'emergency.screen': ['e_stroke'] }) },
  { name: 'emergency screen: fainting', mustAlert: ['RF-EMERG-FAINT'], answers: withSafe({ 'emergency.screen': ['e_faint'] }) },
  { name: 'emergency screen: heavy bleeding', mustAlert: ['RF-EMERG-BLEED'], answers: withSafe({ 'emergency.screen': ['e_bleed'] }) },
  { name: 'emergency screen: several symptoms at once', mustAlert: ['RF-EMERG-CHEST', 'RF-EMERG-FAINT'], answers: withSafe({ 'emergency.screen': ['e_chest', 'e_faint'] }) },
  { name: 'coughing up blood', mustAlert: ['RF-COUGH-BLOOD'], answers: withSafe({ 'cc.main': 'cough', 'cough.blood': 'yes' }) },
  { name: 'back pain with trouble passing urine or stool', mustAlert: ['RF-BACK-BLADDER'], answers: withSafe({ 'cc.main': 'back_pain', 'back.bladder': 'yes' }) },
  { name: 'sudden severe headache', mustAlert: ['RF-HEADACHE-THUNDERCLAP', 'RF-PAIN-SEVERE'], answers: withSafe({ 'cc.main': 'headache', 'pain.onset': 'sudden', 'pain.severity': 9 }) },
  { name: 'worst pain, gradual headache', mustAlert: ['RF-PAIN-SEVERE'], answers: withSafe({ 'cc.main': 'headache', 'pain.onset': 'gradual', 'pain.severity': 9 }) },
  { name: 'worst pain, abdomen', mustAlert: ['RF-PAIN-SEVERE'], answers: withSafe({ 'cc.main': 'abdominal_pain', 'pain.severity': 10 }) },
  { name: 'emergency question skipped', mustAlert: ['RF-SKIPPED-EMERGENCY-SCREEN'], answers: withSafe({ 'emergency.screen': 'SKIP' }) },
  { name: 'allergy question skipped', mustAlert: ['RF-SKIPPED-ALLERGY'], answers: withSafe({ 'allergy.any': 'SKIP' }) },
  { name: 'current-medicines question skipped', mustAlert: ['RF-SKIPPED-MEDICINES'], answers: withSafe({ 'drug.current_any': 'SKIP' }) },

  // ---- must not alert ----
  { name: 'ordinary fever', mustNot: true, answers: withSafe({ 'cc.main': 'fever', 'fever.pattern': 'evening', 'fever.chills': 'yes', 'fever.rash': 'no' }) },
  { name: 'dry cough without blood', mustNot: true, answers: withSafe({ 'cc.main': 'cough', 'cough.type': 'dry', 'cough.blood': 'no', 'cough.breathless': 'no' }) },
  { name: 'chest pain on exertion, nothing else reported', mustNot: true, answers: withSafe({ 'cc.main': 'chest_pain', 'pain.associated': ['none'], 'pain.timing': 'on_activity', 'pain.severity': 5 }) },
  { name: 'back pain after a fall, no bladder trouble', mustNot: true, answers: withSafe({ 'cc.main': 'back_pain', 'back.injury': 'yes', 'back.bladder': 'no', 'pain.severity': 6 }) },
  { name: 'gradual headache, mild', mustNot: true, answers: withSafe({ 'cc.main': 'headache', 'pain.onset': 'gradual', 'pain.severity': 4 }) },
  { name: 'sudden headache, mild', mustNot: true, answers: withSafe({ 'cc.main': 'headache', 'pain.onset': 'sudden', 'pain.severity': 5 }) },
  { name: 'mild stomach pain', mustNot: true, answers: withSafe({ 'cc.main': 'abdominal_pain', 'abd.bowel': 'constipation', 'pain.severity': 3 }) },
  { name: 'allergy and medicines answered', mustNot: true, answers: withSafe({ 'allergy.any': 'yes', 'allergy.list': 'penicillin', 'drug.current_any': 'yes', 'drug.current_list': 'metformin' }) },
  { name: 'only a non-critical question skipped', mustNot: true, answers: withSafe({ 'psh.any': 'SKIP' }) },
  { name: 'long-term illness only', mustNot: true, answers: withSafe({ 'pmh.conditions': ['diabetes', 'hypertension'] }) },
  { name: 'nothing answered yet', mustNot: true, answers: {} },
  { name: 'emergency screen answered "none" and nothing else', mustNot: true, answers: { 'emergency.screen': ['none'] } },
];
