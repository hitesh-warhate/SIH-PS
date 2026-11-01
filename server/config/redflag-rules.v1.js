// Red-flag rules, version 1 (FR-A16). Data, not code: each rule has an id, a version, a level, a reason in three languages
// and a condition over the interview answers. Conditions use the same shape as the question bank, plus gte and skipped.
//
// STATUS: DRAFT. Written by the developers from the PRD examples (chest pain with breathlessness, stroke symptoms, severe
// bleeding, loss of consciousness) and common emergency teaching. It has NOT been reviewed by a clinician.
// Phase 3 requires clinician sign-off (docs/redflag-rules-review.md); Phase 9 repeats it on the final rules.
//
// Levels (staff and doctor screens only, never shown to the patient):
//   emergency  a symptom that may need immediate care; sorted first.
//   attention  a safety question went unanswered or a symptom needs a prompt look; sorted after emergencies.
// The rule set errs towards alerting (PRD 16.3): a critical question that was skipped is itself a reason for staff attention.

export const RULESET_VERSION = 1;
export const RULESET_STATUS = 'draft: awaiting clinician review';

const chest = { key: 'cc.main', eq: 'chest_pain' };

export const RULES = [
  {
    id: 'RF-EMERG-CHEST', version: 1, level: 'emergency',
    reason: ['Reports chest pain with difficulty breathing', 'सीने में दर्द और साँस लेने में तकलीफ़ बताई', 'छातीत दुखणे आणि श्वास घेण्यास त्रास सांगितला'],
    when: { key: 'emergency.screen', includes: 'e_chest' },
  },
  {
    id: 'RF-EMERG-STROKE', version: 1, level: 'emergency',
    reason: ['Reports one-sided weakness or trouble speaking (possible stroke)', 'एक तरफ़ कमज़ोरी या बोलने में तकलीफ़ बताई (संभावित स्ट्रोक)', 'एका बाजूला अशक्तपणा किंवा बोलण्यास त्रास सांगितला (संभाव्य पक्षाघात)'],
    when: { key: 'emergency.screen', includes: 'e_stroke' },
  },
  {
    id: 'RF-EMERG-FAINT', version: 1, level: 'emergency',
    reason: ['Reports fainting or loss of consciousness', 'बेहोशी बताई', 'बेशुद्ध पडल्याचे सांगितले'],
    when: { key: 'emergency.screen', includes: 'e_faint' },
  },
  {
    id: 'RF-EMERG-BLEED', version: 1, level: 'emergency',
    reason: ['Reports heavy bleeding', 'बहुत ज़्यादा खून बहना बताया', 'खूप रक्तस्राव सांगितला'],
    when: { key: 'emergency.screen', includes: 'e_bleed' },
  },
  {
    id: 'RF-CHEST-BREATHLESS', version: 1, level: 'emergency',
    reason: ['Chest pain with breathlessness', 'सीने में दर्द के साथ साँस फूलना', 'छातीत दुखण्यासोबत दम लागणे'],
    when: { all: [chest, { key: 'pain.associated', includes: 'breathlessness' }] },
  },
  {
    id: 'RF-CHEST-SWEATING', version: 1, level: 'emergency',
    reason: ['Chest pain with sweating', 'सीने में दर्द के साथ पसीना', 'छातीत दुखण्यासोबत घाम येणे'],
    when: { all: [chest, { key: 'pain.associated', includes: 'sweating' }] },
  },
  {
    id: 'RF-COUGH-BLOOD', version: 1, level: 'emergency',
    reason: ['Coughing up blood', 'खाँसी में खून आना', 'खोकल्यातून रक्त येणे'],
    when: { key: 'cough.blood', eq: 'yes' },
  },
  {
    id: 'RF-BACK-BLADDER', version: 1, level: 'emergency',
    reason: ['Back pain with trouble passing urine or stool (possible nerve compression)', 'पीठ दर्द के साथ पेशाब या शौच में तकलीफ़ (नस दबने की संभावना)', 'पाठदुखीसोबत लघवी किंवा शौचास त्रास (मज्जा दबल्याची शक्यता)'],
    when: { key: 'back.bladder', eq: 'yes' },
  },
  {
    id: 'RF-HEADACHE-THUNDERCLAP', version: 1, level: 'emergency',
    reason: ['Sudden, very severe headache', 'अचानक बहुत तेज़ सिर दर्द', 'अचानक खूप तीव्र डोकेदुखी'],
    when: { all: [{ key: 'cc.main', eq: 'headache' }, { key: 'pain.onset', eq: 'sudden' }, { key: 'pain.severity', gte: 8 }] },
  },
  {
    id: 'RF-PAIN-SEVERE', version: 1, level: 'attention',
    reason: ['Reports the worst level of pain (9 or 10 out of 10)', 'सबसे ज़्यादा दर्द बताया (10 में से 9 या 10)', 'सर्वाधिक वेदना सांगितली (10 पैकी 9 किंवा 10)'],
    when: { key: 'pain.severity', gte: 9 },
  },
  {
    id: 'RF-SKIPPED-EMERGENCY-SCREEN', version: 1, level: 'attention',
    reason: ['The emergency symptom question was not answered', 'आपातकालीन लक्षणों का सवाल अनुत्तरित रहा', 'आणीबाणीच्या लक्षणांचा प्रश्न अनुत्तरित राहिला'],
    when: { key: 'emergency.screen', skipped: true },
  },
  {
    id: 'RF-SKIPPED-ALLERGY', version: 1, level: 'attention',
    reason: ['The allergy question was not answered', 'एलर्जी का सवाल अनुत्तरित रहा', 'अ‍ॅलर्जीचा प्रश्न अनुत्तरित राहिला'],
    when: { key: 'allergy.any', skipped: true },
  },
  {
    id: 'RF-SKIPPED-MEDICINES', version: 1, level: 'attention',
    reason: ['The current-medicines question was not answered', 'वर्तमान दवाओं का सवाल अनुत्तरित रहा', 'सध्याच्या औषधांचा प्रश्न अनुत्तरित राहिला'],
    when: { key: 'drug.current_any', skipped: true },
  },
];
