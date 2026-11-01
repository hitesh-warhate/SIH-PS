// Synthetic documents for the OCR and extraction benchmark. NO real patient data: every name, drug and value is invented.
// The generator (server/scripts/make-synthetic-docs.mjs) renders each entry to a PNG; `truth` is what a perfect reader would extract.
//   style: printed   - clean computer text
//          scan      - the same text with rotation, noise and blur, as from a poor scanner
//          script    - a handwriting-style FONT (English only). This is NOT real handwriting; real handwritten Hindi and Marathi
//                      prescriptions have not been tested (docs/ocr-accuracy-report.md).
// Medicine and test names are in Latin letters, as on most Indian prescriptions; the surrounding words are in the document language.

const med = (name, dose, frequency, form = 'tab') => ({ name, dose, frequency, form });
const lab = (test_name, value, unit, low, high, flag) => ({ test_name, value, unit, ref_low: low, ref_high: high, flag });

export const SYNTHETIC = [
  // ---------------- English ----------------
  {
    id: 'en-rx-printed', lang: 'en', docType: 'prescription', style: 'printed',
    lines: ['Dr. A. Sharma Clinic', 'Prescription', 'Date: 12/03/2026', 'Diagnosis: Type 2 diabetes, hypertension', 'Rx', 'Tab Metformin 500 mg twice daily', 'Tab Amlodipine 5 mg once daily', 'Cap Omeprazole 20 mg 1-0-0', 'Review after 2 weeks'],
    truth: { date: '2026-03-12', diagnoses: ['Type 2 diabetes', 'hypertension'], procedures: [], meds: [med('Metformin', '500 mg', 'twice daily'), med('Amlodipine', '5 mg', 'once daily'), med('Omeprazole', '20 mg', 'once daily', 'cap')], labs: [] },
  },
  {
    id: 'en-rx-scan', lang: 'en', docType: 'prescription', style: 'scan',
    lines: ['City Health Centre', 'Prescription', 'Date: 02/11/2025', 'Diagnosis: Acute bronchitis', 'Tab Azithromycin 500 mg once daily', 'Syp Ambroxol 5 ml thrice daily', 'Tab Paracetamol 650 mg SOS'],
    truth: { date: '2025-11-02', diagnoses: ['Acute bronchitis'], procedures: [], meds: [med('Azithromycin', '500 mg', 'once daily'), med('Ambroxol', '5 ml', 'three times daily', 'syp'), med('Paracetamol', '650 mg', 'as needed')], labs: [] },
  },
  {
    id: 'en-rx-script', lang: 'en', docType: 'prescription', style: 'script',
    lines: ['Prescription', 'Date: 05/01/2026', 'Diagnosis: Viral fever', 'Tab Paracetamol 500 mg thrice daily', 'Tab Cetirizine 10 mg at night'],
    truth: { date: '2026-01-05', diagnoses: ['Viral fever'], procedures: [], meds: [med('Paracetamol', '500 mg', 'three times daily'), med('Cetirizine', '10 mg', 'at bedtime')], labs: [] },
  },
  {
    id: 'en-lab-printed', lang: 'en', docType: 'lab_report', style: 'printed',
    lines: ['Sunrise Pathology Laboratory', 'Laboratory Report', 'Date: 20/02/2026', 'Test Result Unit Reference Range', 'Hemoglobin 10.2 g/dL 12.0 - 15.5', 'Fasting Glucose 142 mg/dL 70 - 100', 'Creatinine 0.9 mg/dL 0.6 - 1.2', 'HbA1c 7.8 % < 5.7'],
    truth: { date: '2026-02-20', diagnoses: [], procedures: [], meds: [], labs: [lab('Hemoglobin', 10.2, 'g/dL', 12, 15.5, 'low'), lab('Fasting Glucose', 142, 'mg/dL', 70, 100, 'high'), lab('Creatinine', 0.9, 'mg/dL', 0.6, 1.2, 'normal'), lab('HbA1c', 7.8, '%', null, 5.7, 'high')] },
  },
  {
    id: 'en-lab-scan', lang: 'en', docType: 'lab_report', style: 'scan',
    lines: ['Metro Diagnostics', 'Laboratory Report', 'Date: 14/12/2025', 'Total Cholesterol 231 mg/dL < 200', 'Platelet Count 1.8 lakhs/cumm 1.5 - 4.5', 'TSH 6.2 uIU/mL 0.4 - 4.0'],
    truth: { date: '2025-12-14', diagnoses: [], procedures: [], meds: [], labs: [lab('Total Cholesterol', 231, 'mg/dL', null, 200, 'high'), lab('Platelet Count', 1.8, 'lakhs/cumm', 1.5, 4.5, 'normal'), lab('TSH', 6.2, 'uIU/mL', 0.4, 4, 'high')] },
  },
  {
    id: 'en-dis-printed', lang: 'en', docType: 'discharge_summary', style: 'printed',
    lines: ['District Hospital', 'Discharge Summary', 'Date of admission: 01/04/2026', 'Date: 06/04/2026', 'Final diagnosis: Acute appendicitis', 'Procedure: Laparoscopic appendectomy', 'Condition at discharge: stable', 'Tab Cefixime 200 mg twice daily', 'Follow up after 7 days'],
    truth: { date: '2026-04-06', diagnoses: ['Acute appendicitis'], procedures: ['Laparoscopic appendectomy'], meds: [med('Cefixime', '200 mg', 'twice daily')], labs: [] },
  },
  {
    id: 'en-other-printed', lang: 'en', docType: 'other', style: 'printed',
    lines: ['Medical Certificate', 'This is to certify that the patient was seen on 10/05/2026', 'and advised rest for three days', 'Signed Dr. R. Iyer'],
    truth: { date: '2026-05-10', diagnoses: [], procedures: [], meds: [], labs: [] }, // the date written in the sentence
  },

  // ---------------- Hindi ----------------
  {
    id: 'hi-rx-printed', lang: 'hi', docType: 'prescription', style: 'printed',
    lines: ['डॉ. ए. शर्मा क्लिनिक', 'प्रिस्क्रिप्शन', 'दिनांक: 12/03/2026', 'निदान: मधुमेह, उच्च रक्तचाप', 'Tab Metformin 500 mg दिन में दो बार', 'Tab Amlodipine 5 mg दिन में एक बार', '2 सप्ताह बाद दिखाएँ'],
    truth: { date: '2026-03-12', diagnoses: ['मधुमेह', 'उच्च रक्तचाप'], procedures: [], meds: [med('Metformin', '500 mg', 'twice daily'), med('Amlodipine', '5 mg', 'once daily')], labs: [] },
  },
  {
    id: 'hi-rx-scan', lang: 'hi', docType: 'prescription', style: 'scan',
    lines: ['सिटी हेल्थ सेंटर', 'प्रिस्क्रिप्शन', 'दिनांक: 02/11/2025', 'निदान: तीव्र ब्रोंकाइटिस', 'Tab Azithromycin 500 mg दिन में एक बार', 'Tab Paracetamol 650 mg ज़रूरत पड़ने पर'],
    truth: { date: '2025-11-02', diagnoses: ['तीव्र ब्रोंकाइटिस'], procedures: [], meds: [med('Azithromycin', '500 mg', 'once daily'), med('Paracetamol', '650 mg', 'as needed')], labs: [] },
  },
  {
    id: 'hi-lab-printed', lang: 'hi', docType: 'lab_report', style: 'printed',
    lines: ['सनराइज़ प्रयोगशाला', 'जाँच रिपोर्ट', 'दिनांक: 20/02/2026', 'जाँच परिणाम इकाई सामान्य सीमा', 'Hemoglobin 10.2 g/dL 12.0 - 15.5', 'Fasting Glucose 142 mg/dL 70 - 100', 'Creatinine 0.9 mg/dL 0.6 - 1.2'],
    truth: { date: '2026-02-20', diagnoses: [], procedures: [], meds: [], labs: [lab('Hemoglobin', 10.2, 'g/dL', 12, 15.5, 'low'), lab('Fasting Glucose', 142, 'mg/dL', 70, 100, 'high'), lab('Creatinine', 0.9, 'mg/dL', 0.6, 1.2, 'normal')] },
  },
  {
    id: 'hi-dis-printed', lang: 'hi', docType: 'discharge_summary', style: 'printed',
    lines: ['जिला अस्पताल', 'डिस्चार्ज सारांश', 'भर्ती की तारीख: 01/04/2026', 'दिनांक: 06/04/2026', 'निदान: तीव्र अपेंडिसाइटिस', 'शस्त्रक्रिया: लैप्रोस्कोपिक अपेंडिसेक्टॉमी', 'Tab Cefixime 200 mg दिन में दो बार', '7 दिन बाद फॉलो अप'],
    truth: { date: '2026-04-06', diagnoses: ['तीव्र अपेंडिसाइटिस'], procedures: ['लैप्रोस्कोपिक अपेंडिसेक्टॉमी'], meds: [med('Cefixime', '200 mg', 'twice daily')], labs: [] },
  },
  {
    id: 'hi-other-printed', lang: 'hi', docType: 'other', style: 'printed',
    lines: ['चिकित्सा प्रमाण पत्र', 'प्रमाणित किया जाता है कि मरीज़ को', 'तीन दिन आराम की सलाह दी गई'],
    truth: { date: null, diagnoses: [], procedures: [], meds: [], labs: [] },
  },

  // ---------------- Marathi ----------------
  {
    id: 'mr-rx-printed', lang: 'mr', docType: 'prescription', style: 'printed',
    lines: ['डॉ. ए. शर्मा क्लिनिक', 'प्रिस्क्रिप्शन', 'दिनांक: 12/03/2026', 'निदान: मधुमेह, उच्च रक्तदाब', 'Tab Metformin 500 mg दिवसातून दोनदा', 'Tab Amlodipine 5 mg दिवसातून एकदा', '२ आठवड्यांनी दाखवा'],
    truth: { date: '2026-03-12', diagnoses: ['मधुमेह', 'उच्च रक्तदाब'], procedures: [], meds: [med('Metformin', '500 mg', 'twice daily'), med('Amlodipine', '5 mg', 'once daily')], labs: [] },
  },
  {
    id: 'mr-rx-scan', lang: 'mr', docType: 'prescription', style: 'scan',
    lines: ['सिटी हेल्थ सेंटर', 'प्रिस्क्रिप्शन', 'दिनांक: 02/11/2025', 'निदान: तीव्र श्वसनदाह', 'Tab Azithromycin 500 mg दिवसातून एकदा', 'Tab Paracetamol 650 mg गरज असल्यास'],
    truth: { date: '2025-11-02', diagnoses: ['तीव्र श्वसनदाह'], procedures: [], meds: [med('Azithromycin', '500 mg', 'once daily'), med('Paracetamol', '650 mg', 'as needed')], labs: [] },
  },
  {
    id: 'mr-lab-printed', lang: 'mr', docType: 'lab_report', style: 'printed',
    lines: ['सनराइज प्रयोगशाळा', 'तपासणी अहवाल', 'दिनांक: 20/02/2026', 'तपासणी निकाल एकक संदर्भ मर्यादा', 'Hemoglobin 10.2 g/dL 12.0 - 15.5', 'Fasting Glucose 142 mg/dL 70 - 100', 'Creatinine 0.9 mg/dL 0.6 - 1.2'],
    truth: { date: '2026-02-20', diagnoses: [], procedures: [], meds: [], labs: [lab('Hemoglobin', 10.2, 'g/dL', 12, 15.5, 'low'), lab('Fasting Glucose', 142, 'mg/dL', 70, 100, 'high'), lab('Creatinine', 0.9, 'mg/dL', 0.6, 1.2, 'normal')] },
  },
  {
    id: 'mr-dis-printed', lang: 'mr', docType: 'discharge_summary', style: 'printed',
    lines: ['जिल्हा रुग्णालय', 'डिस्चार्ज सारांश', 'भरती तारीख: 01/04/2026', 'दिनांक: 06/04/2026', 'निदान: तीव्र अपेंडिसायटिस', 'शस्त्रक्रिया: लॅपरोस्कोपिक अपेंडिसेक्टॉमी', 'Tab Cefixime 200 mg दिवसातून दोनदा', '७ दिवसांनी पुन्हा तपासणी'],
    truth: { date: '2026-04-06', diagnoses: ['तीव्र अपेंडिसायटिस'], procedures: ['लॅपरोस्कोपिक अपेंडिसेक्टॉमी'], meds: [med('Cefixime', '200 mg', 'twice daily')], labs: [] },
  },
  {
    id: 'mr-other-printed', lang: 'mr', docType: 'other', style: 'printed',
    lines: ['वैद्यकीय प्रमाणपत्र', 'प्रमाणित करण्यात येते की रुग्णाला', 'तीन दिवस विश्रांतीचा सल्ला दिला'],
    truth: { date: null, diagnoses: [], procedures: [], meds: [], labs: [] },
  },
];
