// Question bank and clinical ontology v1 (FR-A4, FR-A5, FR-A6). This is configuration, not code: the dialogue manager
// can only ask what is in this file. Every text is [English, Hindi, Marathi]. Hindi and Marathi are DRAFTS pending
// native-speaker and clinician review (docs/clinical-review-ontology.md is generated from this file for that review).
//
// A question: key, section, type (yes_no | single | multi | number | text), text, options, critical, when.
// `when` makes it a follow-up: { key, eq | in | includes } or { all: [...] } / { any: [...] }, over EARLIER questions only.

export const PAIN_COMPLAINTS = ['chest_pain', 'back_pain', 'abdominal_pain', 'headache'];

// Shared option labels: value -> [en, hi, mr]
const L = {
  yes: ['Yes', 'हाँ', 'होय'], no: ['No', 'नहीं', 'नाही'], none: ['None of these', 'इनमें से कोई नहीं', 'यापैकी काही नाही'],
  chest_pain: ['Chest pain', 'सीने में दर्द', 'छातीत दुखणे'], fever: ['Fever', 'बुखार', 'ताप'], back_pain: ['Back pain', 'पीठ दर्द', 'पाठदुखी'],
  cough: ['Cough', 'खाँसी', 'खोकला'], abdominal_pain: ['Stomach pain', 'पेट दर्द', 'पोटदुखी'], headache: ['Headache', 'सिर दर्द', 'डोकेदुखी'],
  other: ['Something else', 'कुछ और', 'दुसरे काही'],
  lt1d: ['Less than a day', 'एक दिन से कम', 'एका दिवसापेक्षा कमी'], d1_3: ['1 to 3 days', '1 से 3 दिन', '1 ते 3 दिवस'],
  d4_7: ['4 to 7 days', '4 से 7 दिन', '4 ते 7 दिवस'], w1_4: ['1 to 4 weeks', '1 से 4 सप्ताह', '1 ते 4 आठवडे'],
  m1: ['More than a month', 'एक महीने से अधिक', 'एका महिन्यापेक्षा जास्त'],
  better: ['Getting better', 'बेहतर हो रहा है', 'बरे वाटत आहे'], same: ['The same', 'वैसा ही', 'तसेच'], worse: ['Getting worse', 'बिगड़ रहा है', 'वाढत आहे'],
  sudden: ['Suddenly', 'अचानक', 'अचानक'], gradual: ['Slowly', 'धीरे-धीरे', 'हळूहळू'],
  sharp: ['Sharp', 'तेज़ चुभने वाला', 'तीक्ष्ण'], dull: ['Dull ache', 'हल्का दर्द', 'मंद दुखणे'], burning: ['Burning', 'जलन जैसा', 'जळजळ'],
  pressure: ['Pressure or squeezing', 'दबाव या भारीपन', 'दाब किंवा आवळल्यासारखे'], cramping: ['Cramping', 'ऐंठन', 'पेटके'],
  nausea: ['Nausea', 'मिचली', 'मळमळ'], sweating: ['Sweating', 'पसीना', 'घाम येणे'], breathlessness: ['Breathlessness', 'साँस फूलना', 'दम लागणे'],
  vomiting: ['Vomiting', 'उल्टी', 'उलटी'],
  constant: ['All the time', 'हर समय', 'सतत'], comes_goes: ['Comes and goes', 'आता-जाता रहता है', 'येते आणि जाते'], on_activity: ['Only on activity', 'केवल मेहनत करने पर', 'फक्त श्रम केल्यावर'],
  movement: ['Movement', 'हिलने-डुलने से', 'हालचालीने'], deep_breath: ['Deep breathing', 'गहरी साँस से', 'खोल श्वासाने'], eating: ['Eating', 'खाने से', 'खाल्ल्याने'],
  exertion: ['Walking or effort', 'चलने या मेहनत से', 'चालल्याने किंवा श्रमाने'], lying: ['Lying down', 'लेटने से', 'झोपल्याने'], nothing: ['Nothing', 'कुछ नहीं', 'काही नाही'],
  rest: ['Rest', 'आराम से', 'विश्रांतीने'], medicine: ['Medicine', 'दवा से', 'औषधाने'], position: ['Changing position', 'स्थिति बदलने से', 'स्थिती बदलल्याने'],
  continuous: ['All day', 'पूरे दिन', 'दिवसभर'], intermittent: ['On and off', 'रुक-रुक कर', 'थांबून थांबून'], evening: ['Mostly evening or night', 'ज़्यादातर शाम या रात को', 'बहुतेक संध्याकाळी किंवा रात्री'],
  sore_throat: ['Sore throat', 'गले में दर्द', 'घसा दुखणे'], loose_motions: ['Loose motions', 'दस्त', 'जुलाब'], burning_urine: ['Burning urine', 'पेशाब में जलन', 'लघवीला जळजळ'],
  body_ache: ['Body ache', 'बदन दर्द', 'अंगदुखी'],
  dry: ['Dry', 'सूखी', 'कोरडा'], wet: ['With phlegm', 'बलगम वाली', 'कफासह'],
  one_side: ['One side', 'एक तरफ़', 'एका बाजूला'], both_sides: ['Both sides', 'दोनों तरफ़', 'दोन्ही बाजूंना'], all_over: ['All over', 'पूरे सिर में', 'संपूर्ण डोक्यात'],
  normal: ['Normal', 'सामान्य', 'सामान्य'], constipation: ['Constipation', 'कब्ज़', 'बद्धकोष्ठता'],
  diabetes: ['Diabetes (sugar)', 'मधुमेह (शुगर)', 'मधुमेह (शुगर)'], hypertension: ['High blood pressure', 'उच्च रक्तचाप', 'उच्च रक्तदाब'],
  heart: ['Heart disease', 'हृदय रोग', 'हृदयरोग'], asthma: ['Asthma or COPD', 'दमा या सीओपीडी', 'दमा किंवा सीओपीडी'], thyroid: ['Thyroid problem', 'थायरॉइड की समस्या', 'थायरॉइड समस्या'],
  kidney: ['Kidney disease', 'गुर्दे की बीमारी', 'मूत्रपिंडाचा आजार'], tb: ['Tuberculosis', 'टीबी (क्षय रोग)', 'क्षयरोग (टीबी)'], epilepsy: ['Epilepsy (fits)', 'मिर्गी (दौरे)', 'अपस्मार (फिट्स)'],
  cancer: ['Cancer', 'कैंसर', 'कर्करोग'],
  never: ['Never', 'कभी नहीं', 'कधीही नाही'], current: ['Yes, now', 'हाँ, अभी', 'होय, सध्या'], past: ['Used to, stopped', 'पहले करते थे, अब छोड़ दिया', 'पूर्वी करत होते, आता सोडले'],
  sometimes: ['Sometimes', 'कभी-कभी', 'कधीकधी'], regularly: ['Regularly', 'नियमित रूप से', 'नियमितपणे'],
  weight_loss: ['Weight loss', 'वज़न घटना', 'वजन कमी होणे'], appetite: ['Loss of appetite', 'भूख कम लगना', 'भूक कमी लागणे'], night_sweats: ['Night sweats', 'रात को पसीना', 'रात्री घाम'],
  fatigue: ['Tiredness', 'थकान', 'थकवा'], wheeze: ['Wheezing', 'साँस में सीटी जैसी आवाज़', 'घरघर'], palpitations: ['Racing heart', 'धड़कन तेज़ होना', 'छातीत धडधड'],
  leg_swelling: ['Leg swelling', 'पैरों में सूजन', 'पायांना सूज'], blood_stool: ['Blood in stool', 'मल में खून', 'शौचात रक्त'], frequent_urine: ['Passing urine often', 'बार-बार पेशाब', 'वारंवार लघवी'],
  blood_urine: ['Blood in urine', 'पेशाब में खून', 'लघवीत रक्त'], dizziness: ['Dizziness', 'चक्कर', 'चक्कर येणे'], weakness: ['Weakness', 'कमज़ोरी', 'अशक्तपणा'], numbness: ['Numbness', 'सुन्नपन', 'बधिरपणा'],
  e_chest: ['Chest pain with difficulty breathing', 'सीने में दर्द और साँस लेने में तकलीफ़', 'छातीत दुखणे आणि श्वास घेण्यास त्रास'],
  e_stroke: ['Weakness on one side of the face, arm or leg, or trouble speaking', 'चेहरे, हाथ या पैर में एक तरफ़ कमज़ोरी, या बोलने में तकलीफ़', 'चेहरा, हात किंवा पाय एका बाजूला कमजोर, किंवा बोलण्यास त्रास'],
  e_faint: ['Fainting or loss of consciousness', 'बेहोशी', 'बेशुद्ध पडणे'], e_bleed: ['Heavy bleeding', 'बहुत ज़्यादा खून बहना', 'खूप रक्तस्राव'],
};

const opts = (...values) => values.map((value) => ({ value, label: L[value] }));
const YES_NO = opts('yes', 'no');
const is = (key, value) => ({ key, eq: value });
const all = (...conds) => ({ all: conds });
const q = (key, section, type, text, extra = {}) => ({ key, section, type, text, next: null, ...extra });

// ---------------------------------------------------------------------------------------------------------------------------
// Branching interview (v2). The first question asks the reason for the visit in the patient's own words; the words are read for a
// complaint and a duration (narration.js), which then need not be asked. Every question after it is chosen by the answers so far,
// is phrased around the reason ("About your cough: …", dialogue.js presentQuestion), and no patient is asked more than MAX_QUESTIONS:
//   opening questions (reason, closest complaint and how long unless read from the words, emergency signs)  +  questions for that
//   reason (whatever the budget leaves, at most BRANCH_LIMIT)  +  medicines and allergies (2, or 4 when the patient says yes to them).
// `next` names the following question: a key, null (the end), or a list of [condition, key] pairs tried in order with a plain key
// last as the default. Conditions use the same form as the red-flag rules ({ key, eq | in | includes }, all, any) over the answers
// so far. A skipped answer matches no condition, so "not answered" always takes the default and is never read as "no".
// ---------------------------------------------------------------------------------------------------------------------------
export const MAX_QUESTIONS = 10;
export const ROOT = 'cc.reason';
export const OPENING = ['cc.reason', 'emergency.screen', 'cc.main', 'cc.duration'];
export const CLOSING = 'drug.current_any'; // medicines then allergies end every path (safety questions, always asked)
export const CLOSING_MAX = 4; // drug.current_any, drug.current_list, allergy.any, allergy.list
export const BRANCH_LIMIT = 4; // questions specific to the reason; the budget left after the opening may allow fewer

const cc = (value) => is('cc.main', value);

export const QUESTIONS = [
  // --- Opening: the reason for the visit, in the patient's own words, decides everything after it ---
  q('cc.reason', 'chief_complaint', 'text', ['What is the reason for your visit to the hospital today? Please tell us in your own words.', 'आज अस्पताल आने का कारण क्या है? कृपया अपने शब्दों में बताइए।', 'आज रुग्णालयात येण्याचे कारण काय आहे? कृपया तुमच्या शब्दांत सांगा.'],
    { next: 'emergency.screen' }),
  // Asked only when the words did not name exactly one of these (otherwise it is filled from the words and the patient can change it on review).
  q('cc.main', 'chief_complaint', 'single', ['Which of these is closest to your problem?', 'इनमें से कौन सी आपकी समस्या के सबसे करीब है?', 'यापैकी कोणती तुमच्या तक्रारीच्या सर्वात जवळ आहे?'],
    { options: opts('chest_pain', 'fever', 'back_pain', 'cough', 'abdominal_pain', 'headache', 'other'), next: 'cc.duration' }),
  q('emergency.screen', 'chief_complaint', 'multi', ['Are you having any of these right now?', 'क्या अभी आपको इनमें से कुछ हो रहा है?', 'तुम्हाला आत्ता यापैकी काही होत आहे का?'],
    { critical: true, options: opts('e_chest', 'e_stroke', 'e_faint', 'e_bleed', 'none'), next: 'cc.main' }),
  q('cc.duration', 'chief_complaint', 'single', ['How long has this been going on?', 'यह कब से हो रहा है?', 'हे किती दिवसांपासून सुरू आहे?'],
    { options: opts('lt1d', 'd1_3', 'd4_7', 'w1_4', 'm1'),
      next: [[cc('chest_pain'), 'pain.onset'], [cc('headache'), 'pain.onset'], [cc('abdominal_pain'), 'pain.severity'], [cc('back_pain'), 'back.bladder'],
        [cc('fever'), 'fever.chills'], [cc('cough'), 'cough.blood'], [cc('other'), 'cc.other_text'], CLOSING] }),

  // --- Chest pain and headache start with how the pain began ---
  //   chest:    sudden → other symptoms (sweating, breathlessness) → severity;  slow → when it comes → (on effort) other symptoms, else severity
  //   headache: sudden → severity → blurred vision;  slow → which side → severity
  q('pain.onset', 'hpi', 'single', ['Did the pain start suddenly or slowly?', 'दर्द अचानक शुरू हुआ या धीरे-धीरे?', 'दुखणे अचानक सुरू झाले की हळूहळू?'],
    { options: opts('sudden', 'gradual'),
      next: [[all(cc('headache'), is('pain.onset', 'sudden')), 'pain.severity'], [cc('headache'), 'headache.side'], [is('pain.onset', 'sudden'), 'pain.associated'], 'pain.timing'] }),
  q('pain.timing', 'hpi', 'single', ['When do you feel the pain?', 'दर्द कब होता है?', 'दुखणे कधी होते?'],
    { options: opts('constant', 'comes_goes', 'on_activity'), next: [[is('pain.timing', 'on_activity'), 'pain.associated'], 'pain.severity'] }),
  q('pain.associated', 'hpi', 'multi', ['Do you also have any of these?', 'क्या आपको इनमें से भी कुछ है?', 'तुम्हाला यापैकी काही आहे का?'],
    { critical: true, options: opts('nausea', 'sweating', 'breathlessness', 'vomiting', 'fever', 'none'), next: 'pain.severity' }),
  q('pain.severity', 'hpi', 'number', ['How bad is the pain, from 0 (none) to 10 (worst)?', 'दर्द कितना ज़्यादा है, 0 (नहीं) से 10 (सबसे ज़्यादा) तक?', 'दुखणे किती आहे, 0 (नाही) ते 10 (सर्वाधिक)?'],
    { min: 0, max: 10, scale: true,
      next: [[all(cc('headache'), is('pain.onset', 'sudden')), 'headache.vision'], [cc('abdominal_pain'), 'abd.vomiting'], CLOSING] }),
  q('headache.side', 'hpi', 'single', ['Where is the headache?', 'सिर दर्द कहाँ है?', 'डोकेदुखी कुठे आहे?'], { options: opts('one_side', 'both_sides', 'all_over'), next: 'pain.severity' }),
  q('headache.vision', 'hpi', 'yes_no', ['Any blurred vision or vomiting with it?', 'क्या साथ में धुंधला दिखना या उल्टी है?', 'सोबत अंधुक दिसणे किंवा उलटी आहे का?'], { options: YES_NO, next: CLOSING }),

  // --- Stomach pain: severity → vomiting → (yes) bowel motions, (no) where exactly ---
  q('abd.vomiting', 'hpi', 'yes_no', ['Have you been vomiting?', 'क्या आपको उल्टी हो रही है?', 'तुम्हाला उलट्या होत आहेत का?'], { options: YES_NO, next: [[is('abd.vomiting', 'yes'), 'abd.bowel'], 'pain.site'] }),
  q('abd.bowel', 'hpi', 'single', ['How are your motions?', 'आपका मल त्याग कैसा है?', 'तुमची शौचाची स्थिती कशी आहे?'], { options: opts('normal', 'constipation', 'loose_motions'), next: CLOSING }),
  q('pain.site', 'hpi', 'text', ['Where exactly is the pain?', 'दर्द ठीक कहाँ है?', 'दुखणे नेमके कुठे आहे?'], { next: CLOSING }),

  // --- Back pain: bladder trouble first (a red flag, so it is never cut by the budget) → injury → (yes) leg numbness, (no) severity ---
  q('back.bladder', 'hpi', 'yes_no', ['Do you have trouble passing urine or stool?', 'क्या पेशाब या शौच में तकलीफ़ है?', 'लघवी किंवा शौचास त्रास होतो का?'],
    { critical: true, options: YES_NO, next: 'back.injury' }),
  q('back.injury', 'hpi', 'yes_no', ['Did the back pain start after an injury or fall?', 'क्या पीठ दर्द चोट या गिरने के बाद शुरू हुआ?', 'पाठदुखी दुखापत किंवा पडल्यानंतर सुरू झाली का?'],
    { options: YES_NO, next: [[is('back.injury', 'yes'), 'back.leg_numb'], 'pain.severity'] }),
  q('back.leg_numb', 'hpi', 'yes_no', ['Do you have numbness or weakness in a leg?', 'क्या पैर में सुन्नपन या कमज़ोरी है?', 'पायात बधिरपणा किंवा अशक्तपणा आहे का?'], { options: YES_NO, next: CLOSING }),

  // --- Fever: chills → (yes) when it comes, (no) rash → other symptoms ---
  q('fever.chills', 'hpi', 'yes_no', ['Do you get shivering or chills?', 'क्या कँपकँपी या ठंड लगती है?', 'थंडी वाजून ताप येतो का?'], { options: YES_NO, next: [[is('fever.chills', 'yes'), 'fever.pattern'], 'fever.rash'] }),
  q('fever.pattern', 'hpi', 'single', ['When is the fever there?', 'बुखार कब रहता है?', 'ताप कधी असतो?'], { options: opts('continuous', 'intermittent', 'evening'), next: 'fever.associated' }),
  q('fever.rash', 'hpi', 'yes_no', ['Is there any rash on the skin?', 'क्या त्वचा पर चकत्ते हैं?', 'त्वचेवर पुरळ आहे का?'], { options: YES_NO, next: 'fever.associated' }),
  q('fever.associated', 'hpi', 'multi', ['Do you also have any of these?', 'क्या आपको इनमें से भी कुछ है?', 'तुम्हाला यापैकी काही आहे का?'],
    { options: opts('cough', 'sore_throat', 'loose_motions', 'burning_urine', 'body_ache', 'none'), next: CLOSING }),

  // --- Cough: blood → breathless → (yes) heart symptoms, (no) dry or with phlegm ---
  q('cough.blood', 'hpi', 'yes_no', ['Have you coughed up blood?', 'क्या खाँसी में खून आया है?', 'खोकल्यातून रक्त आले का?'], { critical: true, options: YES_NO, next: 'cough.breathless' }),
  q('cough.breathless', 'hpi', 'yes_no', ['Do you feel breathless?', 'क्या साँस फूलती है?', 'दम लागतो का?'], { options: YES_NO, next: [[is('cough.breathless', 'yes'), 'ros.cardio'], 'cough.type'] }),
  q('cough.type', 'hpi', 'single', ['Is the cough dry or with phlegm?', 'खाँसी सूखी है या बलगम वाली?', 'खोकला कोरडा आहे की कफासह?'], { options: opts('dry', 'wet'), next: CLOSING }),
  q('ros.cardio', 'ros', 'multi', ['Heart: any of these?', 'हृदय: इनमें से कुछ?', 'हृदय: यापैकी काही?'], { options: opts('chest_pain', 'palpitations', 'leg_swelling', 'none'), next: CLOSING }),

  // --- Something else: own words → better or worse → (worse) weight loss or tiredness, (else) long-term illnesses ---
  q('cc.other_text', 'chief_complaint', 'text', ['Where exactly is it, and what do you feel?', 'यह ठीक कहाँ है, और आपको कैसा महसूस होता है?', 'हे नेमके कुठे आहे, आणि तुम्हाला कसे वाटते?'], { next: 'hpi.progress' }),
  q('hpi.progress', 'hpi', 'single', ['Is it getting better, the same, or worse?', 'क्या यह बेहतर, वैसा ही, या बिगड़ रहा है?', 'हे बरे होत आहे, तसेच आहे की वाढत आहे?'],
    { options: opts('better', 'same', 'worse'), next: [[is('hpi.progress', 'worse'), 'ros.general'], 'pmh.conditions'] }),
  q('ros.general', 'ros', 'multi', ['In the last month, have you had any of these?', 'पिछले एक महीने में क्या आपको इनमें से कुछ हुआ?', 'गेल्या महिन्यात तुम्हाला यापैकी काही झाले का?'],
    { options: opts('weight_loss', 'appetite', 'night_sweats', 'fatigue', 'none'), next: CLOSING }),
  q('pmh.conditions', 'past_history', 'multi', ['Do you have any of these long-term illnesses?', 'क्या आपको इनमें से कोई लंबी बीमारी है?', 'तुम्हाला यापैकी कोणता दीर्घकालीन आजार आहे का?'],
    { options: opts('diabetes', 'hypertension', 'heart', 'asthma', 'thyroid', 'kidney', 'tb', 'epilepsy', 'cancer', 'none'), next: CLOSING }),

  // --- Closing for everyone: medicines and allergies (critical: confirmed on screen and by audio) ---
  q('drug.current_any', 'drug_allergy', 'yes_no', ['Are you taking any medicines now?', 'क्या आप अभी कोई दवा ले रहे हैं?', 'तुम्ही सध्या कोणती औषधे घेत आहात का?'],
    { critical: true, options: YES_NO, next: [[is('drug.current_any', 'yes'), 'drug.current_list'], 'allergy.any'] }),
  q('drug.current_list', 'drug_allergy', 'text', ['Which medicines? Say or type their names.', 'कौन सी दवाइयाँ? उनके नाम बोलें या लिखें।', 'कोणती औषधे? त्यांची नावे सांगा किंवा लिहा.'], { critical: true, next: 'allergy.any' }),
  q('allergy.any', 'drug_allergy', 'yes_no', ['Are you allergic to any medicine or food?', 'क्या आपको किसी दवा या खाने से एलर्जी है?', 'तुम्हाला कोणत्या औषधाची किंवा अन्नाची अ‍ॅलर्जी आहे का?'],
    { critical: true, options: YES_NO, next: [[is('allergy.any', 'yes'), 'allergy.list'], null] }),
  q('allergy.list', 'drug_allergy', 'text', ['What are you allergic to?', 'आपको किससे एलर्जी है?', 'तुम्हाला कशाची अ‍ॅलर्जी आहे?'], { critical: true, next: null }),

  // --- Not on any path in v2. Kept so answers given before the change still show in summaries and reviews. ---
  q('pain.character', 'hpi', 'single', ['What does the pain feel like?', 'दर्द कैसा महसूस होता है?', 'दुखणे कसे वाटते?'], { options: opts('sharp', 'dull', 'burning', 'pressure', 'cramping') }),
  q('pain.radiation', 'hpi', 'yes_no', ['Does the pain spread anywhere else?', 'क्या दर्द कहीं और फैलता है?', 'दुखणे इतरत्र पसरते का?'], { options: YES_NO }),
  q('pain.radiation_where', 'hpi', 'text', ['Where does it spread to?', 'यह कहाँ तक फैलता है?', 'ते कुठे पसरते?']),
  q('pain.exacerbating', 'hpi', 'multi', ['What makes the pain worse?', 'किस चीज़ से दर्द बढ़ता है?', 'कशाने दुखणे वाढते?'], { options: opts('movement', 'deep_breath', 'eating', 'exertion', 'lying', 'nothing') }),
  q('pain.relieving', 'hpi', 'multi', ['What makes the pain better?', 'किस चीज़ से दर्द कम होता है?', 'कशाने दुखणे कमी होते?'], { options: opts('rest', 'medicine', 'position', 'nothing') }),
  q('psh.any', 'past_history', 'yes_no', ['Have you ever had an operation?', 'क्या आपकी कभी कोई सर्जरी हुई है?', 'तुमची कधी शस्त्रक्रिया झाली आहे का?'], { options: YES_NO }),
  q('psh.details', 'past_history', 'text', ['Which operation, and when?', 'कौन सी सर्जरी, और कब?', 'कोणती शस्त्रक्रिया, आणि कधी?']),
  q('drug.herbal', 'drug_allergy', 'yes_no', ['Do you take any herbal or home remedies?', 'क्या आप कोई जड़ी-बूटी या घरेलू उपचार लेते हैं?', 'तुम्ही कोणती वनौषधी किंवा घरगुती उपाय घेता का?'], { options: YES_NO }),
  q('family.conditions', 'family', 'multi', ['Does anyone in your family have any of these?', 'क्या आपके परिवार में किसी को इनमें से कुछ है?', 'तुमच्या कुटुंबात कोणाला यापैकी काही आहे का?'],
    { options: opts('diabetes', 'hypertension', 'heart', 'cancer', 'tb', 'none') }),
  q('personal.tobacco', 'personal', 'single', ['Do you use tobacco, gutka or smoke?', 'क्या आप तंबाकू, गुटखा या धूम्रपान करते हैं?', 'तुम्ही तंबाखू, गुटखा किंवा धूम्रपान करता का?'], { options: opts('never', 'current', 'past') }),
  q('personal.alcohol', 'personal', 'single', ['Do you drink alcohol?', 'क्या आप शराब पीते हैं?', 'तुम्ही मद्यपान करता का?'], { options: opts('never', 'sometimes', 'regularly') }),
  q('personal.occupation', 'personal', 'text', ['What work do you do?', 'आप क्या काम करते हैं?', 'तुम्ही कोणते काम करता?']),
  q('ros.respiratory', 'ros', 'multi', ['Breathing: any of these?', 'साँस: इनमें से कुछ?', 'श्वसन: यापैकी काही?'], { options: opts('cough', 'breathlessness', 'wheeze', 'none') }),
  q('ros.gi', 'ros', 'multi', ['Stomach and bowels: any of these?', 'पेट और आँतें: इनमें से कुछ?', 'पोट आणि आतडे: यापैकी काही?'], { options: opts('nausea', 'vomiting', 'loose_motions', 'constipation', 'blood_stool', 'none') }),
  q('ros.urinary', 'ros', 'multi', ['Urine: any of these?', 'पेशाब: इनमें से कुछ?', 'लघवी: यापैकी काही?'], { options: opts('burning_urine', 'frequent_urine', 'blood_urine', 'none') }),
  q('ros.neuro', 'ros', 'multi', ['Nerves and head: any of these?', 'नसें और सिर: इनमें से कुछ?', 'मज्जा आणि डोके: यापैकी काही?'], { options: opts('headache', 'dizziness', 'weakness', 'numbness', 'none') }),
];


// The standard physician-readable order (FR-C2 / FR-A13).
export const SECTIONS = [
  ['chief_complaint', ['Chief complaint', 'मुख्य शिकायत', 'मुख्य तक्रार']],
  ['hpi', ['History of present illness', 'वर्तमान बीमारी का इतिहास', 'सध्याच्या आजाराचा इतिहास']],
  ['past_history', ['Past medical and surgical history', 'पिछला चिकित्सा और सर्जरी इतिहास', 'मागील वैद्यकीय आणि शस्त्रक्रिया इतिहास']],
  ['drug_allergy', ['Drug and allergy history', 'दवा और एलर्जी का इतिहास', 'औषध आणि अ‍ॅलर्जी इतिहास']],
  ['family', ['Family history', 'पारिवारिक इतिहास', 'कौटुंबिक इतिहास']],
  ['personal', ['Personal history', 'व्यक्तिगत इतिहास', 'वैयक्तिक इतिहास']],
  ['ros', ['Review of systems', 'तंत्रों की समीक्षा', 'प्रणालींचा आढावा']],
];

export const UNITS = { 'pain.severity': ['out of 10', '10 में से', '10 पैकी'] };
export const ONTOLOGY_VERSION = 2;
export const YES_NO_LABELS = { yes: L.yes, no: L.no };
