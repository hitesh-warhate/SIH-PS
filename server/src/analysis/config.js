// Thresholds for the cross-document checks (Phase 5). Both are judgement calls for clinical review and tuning:
// too strict floods the doctor with warnings, too loose misses a real wrong-patient file (PRD Phase 5 risks).
export const ANALYSIS = {
  version: 1,
  // share of the shorter name's words that must appear in the other name (initials, order and one-letter typos allowed)
  nameMatchRatio: 0.67,
  // years of difference allowed between the age written on a document and the age worked out from the registered date of birth;
  // registration may record an approximate age and a handwritten age is often rounded
  ageToleranceYears: 3,
};
