// Classifies a document from its text (FR-B4): prescription, lab report, discharge summary or other.
// Weighted keyword evidence in English, Hindi and Marathi. A weak result is "other", never a guess.
const EVIDENCE = {
  prescription: [
    [/\brx\b|prescription|\bsig\b/i, 3],
    [/\b(tab|tablet|cap|capsule|syp|syrup|inj|drops?)\b\.?/i, 2],
    [/twice daily|once daily|thrice daily|three times|\b(od|bd|tds|qid|hs|sos)\b|\b\d\s*-\s*\d\s*-\s*\d\b/i, 2],
    [/\b\d+\s*(mg|mcg)\b/i, 1],
    [/प्रिस्क्रिप्शन|नुस्खा|पर्चा|दवा|दवाइ|गोली|टैबलेट|दिन में|सुबह|औषध|गोळी|दिवसातून|सकाळी|संध्याकाळी/, 2],
  ],
  lab_report: [
    [/reference range|ref\.? range|normal range|biological ref/i, 3],
    [/laborator|patholog|investigation report|test report|lab report/i, 3],
    [/\b(hb|hemoglobin|haemoglobin|wbc|platelet|creatinine|glucose|hba1c|cholesterol|tsh|urea|bilirubin|sgpt|sgot|esr)\b/i, 2],
    [/mg\/dl|g\/dl|mmol\/l|iu\/l|\/cumm|miu\/ml|meq\/l|ng\/ml/i, 2],
    [/जाँच|जांच|प्रयोगशाला|रिपोर्ट|संदर्भ|सामान्य सीमा|हीमोग्लोबिन|तपासणी|अहवाल|प्रयोगशाळा|संदर्भ मर्यादा/, 3],
  ],
  discharge_summary: [
    [/discharge/i, 4],
    [/admission|admitted|date of admission|\bipd\b/i, 2],
    [/hospital course|course in (the )?hospital|condition at discharge/i, 3],
    [/follow[- ]?up|advice on discharge/i, 1],
    [/डिस्चार्ज|छुट्टी/, 5],
    [/भर्ती|भरती/, 2],
    [/अस्पताल|रुग्णालय/, 1],
    [/सारांश/, 2],
  ],
};

export function classify(text) {
  const scores = Object.entries(EVIDENCE).map(([type, rules]) => [type, rules.reduce((s, [re, w]) => s + (re.test(text) ? w : 0), 0)]);
  scores.sort((a, b) => b[1] - a[1]);
  const [top, second] = scores;
  if (top[1] < 4) return { type: 'other', confidence: 0.5, scores: Object.fromEntries(scores) };
  return { type: top[0], confidence: +(top[1] / (top[1] + second[1] + 1)).toFixed(2), scores: Object.fromEntries(scores) };
}
