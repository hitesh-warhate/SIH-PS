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
const PAIN = { key: 'cc.main', in: PAIN_COMPLAINTS };
const is = (key, value) => ({ key, eq: value });
const q = (key, section, type, text, extra = {}) => ({ key, section, type, text, ...extra });

export const QUESTIONS = [
  // --- Chief complaint ---
  q('emergency.screen', 'chief_complaint', 'multi', ['Are you having any of these right now?', 'क्या अभी आपको इनमें से कुछ हो रहा है?', 'तुम्हाला आत्ता यापैकी काही होत आहे का?'],
    { critical: true, options: opts('e_chest', 'e_stroke', 'e_faint', 'e_bleed', 'none') }),
  q('cc.main', 'chief_complaint', 'single', ['What is your main problem today?', 'आज आपकी मुख्य समस्या क्या है?', 'आज तुमची मुख्य तक्रार काय आहे?'],
    { options: opts('chest_pain', 'fever', 'back_pain', 'cough', 'abdominal_pain', 'headache', 'other') }),
  q('cc.other_text', 'chief_complaint', 'text', ['Please tell us about your problem in your own words.', 'कृपया अपनी समस्या अपने शब्दों में बताइए।', 'कृपया तुमची तक्रार तुमच्या शब्दांत सांगा.'], { when: is('cc.main', 'other') }),
  q('cc.duration', 'chief_complaint', 'single', ['How long has this been going on?', 'यह कब से हो रहा है?', 'हे किती दिवसांपासून सुरू आहे?'], { options: opts('lt1d', 'd1_3', 'd4_7', 'w1_4', 'm1') }),
  q('hpi.progress', 'hpi', 'single', ['Is it getting better, the same, or worse?', 'क्या यह बेहतर, वैसा ही, या बिगड़ रहा है?', 'हे बरे होत आहे, तसेच आहे की वाढत आहे?'], { options: opts('better', 'same', 'worse') }),

  // --- Pain: SOCRATES (site, onset, character, radiation, associated symptoms, timing, exacerbating/relieving, severity) ---
  q('pain.site', 'hpi', 'text', ['Where exactly is the pain?', 'दर्द ठीक कहाँ है?', 'दुखणे नेमके कुठे आहे?'], { when: PAIN }),
  q('pain.onset', 'hpi', 'single', ['Did the pain start suddenly or slowly?', 'दर्द अचानक शुरू हुआ या धीरे-धीरे?', 'दुखणे अचानक सुरू झाले की हळूहळू?'], { when: PAIN, options: opts('sudden', 'gradual') }),
  q('pain.character', 'hpi', 'single', ['What does the pain feel like?', 'दर्द कैसा महसूस होता है?', 'दुखणे कसे वाटते?'], { when: PAIN, options: opts('sharp', 'dull', 'burning', 'pressure', 'cramping') }),
  q('pain.radiation', 'hpi', 'yes_no', ['Does the pain spread anywhere else?', 'क्या दर्द कहीं और फैलता है?', 'दुखणे इतरत्र पसरते का?'], { when: PAIN, options: YES_NO }),
  q('pain.radiation_where', 'hpi', 'text', ['Where does it spread to?', 'यह कहाँ तक फैलता है?', 'ते कुठे पसरते?'], { when: is('pain.radiation', 'yes') }),
  q('pain.associated', 'hpi', 'multi', ['Do you also have any of these?', 'क्या आपको इनमें से भी कुछ है?', 'तुम्हाला यापैकी काही आहे का?'],
    { when: PAIN, critical: true, options: opts('nausea', 'sweating', 'breathlessness', 'vomiting', 'fever', 'none') }),
  q('pain.timing', 'hpi', 'single', ['When do you feel the pain?', 'दर्द कब होता है?', 'दुखणे कधी होते?'], { when: PAIN, options: opts('constant', 'comes_goes', 'on_activity') }),
  q('pain.exacerbating', 'hpi', 'multi', ['What makes the pain worse?', 'किस चीज़ से दर्द बढ़ता है?', 'कशाने दुखणे वाढते?'],
    { when: PAIN, options: opts('movement', 'deep_breath', 'eating', 'exertion', 'lying', 'nothing') }),
  q('pain.relieving', 'hpi', 'multi', ['What makes the pain better?', 'किस चीज़ से दर्द कम होता है?', 'कशाने दुखणे कमी होते?'], { when: PAIN, options: opts('rest', 'medicine', 'position', 'nothing') }),
  q('pain.severity', 'hpi', 'number', ['How bad is the pain, from 0 (none) to 10 (worst)?', 'दर्द कितना ज़्यादा है, 0 (नहीं) से 10 (सबसे ज़्यादा) तक?', 'दुखणे किती आहे, 0 (नाही) ते 10 (सर्वाधिक)?'], { when: PAIN, min: 0, max: 10, scale: true }),

  // --- Complaint-specific follow-ups ---
  q('back.injury', 'hpi', 'yes_no', ['Did the back pain start after an injury or fall?', 'क्या पीठ दर्द चोट या गिरने के बाद शुरू हुआ?', 'पाठदुखी दुखापत किंवा पडल्यानंतर सुरू झाली का?'], { when: is('cc.main', 'back_pain'), options: YES_NO }),
  q('back.leg_numb', 'hpi', 'yes_no', ['Do you have numbness or weakness in a leg?', 'क्या पैर में सुन्नपन या कमज़ोरी है?', 'पायात बधिरपणा किंवा अशक्तपणा आहे का?'], { when: is('cc.main', 'back_pain'), options: YES_NO }),
  q('back.bladder', 'hpi', 'yes_no', ['Do you have trouble passing urine or stool?', 'क्या पेशाब या शौच में तकलीफ़ है?', 'लघवी किंवा शौचास त्रास होतो का?'], { when: is('cc.main', 'back_pain'), critical: true, options: YES_NO }),
  q('abd.bowel', 'hpi', 'single', ['How are your motions?', 'आपका मल त्याग कैसा है?', 'तुमची शौचाची स्थिती कशी आहे?'], { when: is('cc.main', 'abdominal_pain'), options: opts('normal', 'constipation', 'loose_motions') }),
  q('abd.vomiting', 'hpi', 'yes_no', ['Have you been vomiting?', 'क्या आपको उल्टी हो रही है?', 'तुम्हाला उलट्या होत आहेत का?'], { when: is('cc.main', 'abdominal_pain'), options: YES_NO }),
  q('headache.side', 'hpi', 'single', ['Where is the headache?', 'सिर दर्द कहाँ है?', 'डोकेदुखी कुठे आहे?'], { when: is('cc.main', 'headache'), options: opts('one_side', 'both_sides', 'all_over') }),
  q('headache.vision', 'hpi', 'yes_no', ['Any blurred vision or vomiting with it?', 'क्या साथ में धुंधला दिखना या उल्टी है?', 'सोबत अंधुक दिसणे किंवा उलटी आहे का?'], { when: is('cc.main', 'headache'), options: YES_NO }),
  q('fever.pattern', 'hpi', 'single', ['When is the fever there?', 'बुखार कब रहता है?', 'ताप कधी असतो?'], { when: is('cc.main', 'fever'), options: opts('continuous', 'intermittent', 'evening') }),
  q('fever.chills', 'hpi', 'yes_no', ['Do you get shivering or chills?', 'क्या कँपकँपी या ठंड लगती है?', 'थंडी वाजून ताप येतो का?'], { when: is('cc.main', 'fever'), options: YES_NO }),
  q('fever.rash', 'hpi', 'yes_no', ['Is there any rash on the skin?', 'क्या त्वचा पर चकत्ते हैं?', 'त्वचेवर पुरळ आहे का?'], { when: is('cc.main', 'fever'), options: YES_NO }),
  q('fever.associated', 'hpi', 'multi', ['Do you also have any of these?', 'क्या आपको इनमें से भी कुछ है?', 'तुम्हाला यापैकी काही आहे का?'],
    { when: is('cc.main', 'fever'), options: opts('cough', 'sore_throat', 'loose_motions', 'burning_urine', 'body_ache', 'none') }),
  q('cough.type', 'hpi', 'single', ['Is the cough dry or with phlegm?', 'खाँसी सूखी है या बलगम वाली?', 'खोकला कोरडा आहे की कफासह?'], { when: is('cc.main', 'cough'), options: opts('dry', 'wet') }),
  q('cough.blood', 'hpi', 'yes_no', ['Have you coughed up blood?', 'क्या खाँसी में खून आया है?', 'खोकल्यातून रक्त आले का?'], { when: is('cc.main', 'cough'), critical: true, options: YES_NO }),
  q('cough.breathless', 'hpi', 'yes_no', ['Do you feel breathless?', 'क्या साँस फूलती है?', 'दम लागतो का?'], { when: is('cc.main', 'cough'), options: YES_NO }),

  // --- Past medical and surgical ---
  q('pmh.conditions', 'past_history', 'multi', ['Do you have any of these long-term illnesses?', 'क्या आपको इनमें से कोई लंबी बीमारी है?', 'तुम्हाला यापैकी कोणता दीर्घकालीन आजार आहे का?'],
    { options: opts('diabetes', 'hypertension', 'heart', 'asthma', 'thyroid', 'kidney', 'tb', 'epilepsy', 'cancer', 'none') }),
  q('psh.any', 'past_history', 'yes_no', ['Have you ever had an operation?', 'क्या आपकी कभी कोई सर्जरी हुई है?', 'तुमची कधी शस्त्रक्रिया झाली आहे का?'], { options: YES_NO }),
  q('psh.details', 'past_history', 'text', ['Which operation, and when?', 'कौन सी सर्जरी, और कब?', 'कोणती शस्त्रक्रिया, आणि कधी?'], { when: is('psh.any', 'yes') }),

  // --- Drug and allergy (critical: always confirmed on screen and by audio) ---
  q('drug.current_any', 'drug_allergy', 'yes_no', ['Are you taking any medicines now?', 'क्या आप अभी कोई दवा ले रहे हैं?', 'तुम्ही सध्या कोणती औषधे घेत आहात का?'], { critical: true, options: YES_NO }),
  q('drug.current_list', 'drug_allergy', 'text', ['Which medicines? Say or type their names.', 'कौन सी दवाइयाँ? उनके नाम बोलें या लिखें।', 'कोणती औषधे? त्यांची नावे सांगा किंवा लिहा.'], { when: is('drug.current_any', 'yes'), critical: true }),
  q('drug.herbal', 'drug_allergy', 'yes_no', ['Do you take any herbal or home remedies?', 'क्या आप कोई जड़ी-बूटी या घरेलू उपचार लेते हैं?', 'तुम्ही कोणती वनौषधी किंवा घरगुती उपाय घेता का?'], { options: YES_NO }),
  q('allergy.any', 'drug_allergy', 'yes_no', ['Are you allergic to any medicine or food?', 'क्या आपको किसी दवा या खाने से एलर्जी है?', 'तुम्हाला कोणत्या औषधाची किंवा अन्नाची अ‍ॅलर्जी आहे का?'], { critical: true, options: YES_NO }),
  q('allergy.list', 'drug_allergy', 'text', ['What are you allergic to?', 'आपको किससे एलर्जी है?', 'तुम्हाला कशाची अ‍ॅलर्जी आहे?'], { when: is('allergy.any', 'yes'), critical: true }),

  // --- Family and personal ---
  q('family.conditions', 'family', 'multi', ['Does anyone in your family have any of these?', 'क्या आपके परिवार में किसी को इनमें से कुछ है?', 'तुमच्या कुटुंबात कोणाला यापैकी काही आहे का?'],
    { options: opts('diabetes', 'hypertension', 'heart', 'cancer', 'tb', 'none') }),
  q('personal.tobacco', 'personal', 'single', ['Do you use tobacco, gutka or smoke?', 'क्या आप तंबाकू, गुटखा या धूम्रपान करते हैं?', 'तुम्ही तंबाखू, गुटखा किंवा धूम्रपान करता का?'], { options: opts('never', 'current', 'past') }),
  q('personal.alcohol', 'personal', 'single', ['Do you drink alcohol?', 'क्या आप शराब पीते हैं?', 'तुम्ही मद्यपान करता का?'], { options: opts('never', 'sometimes', 'regularly') }),
  q('personal.occupation', 'personal', 'text', ['What work do you do?', 'आप क्या काम करते हैं?', 'तुम्ही कोणते काम करता?'], {}),

  // --- Review of systems ---
  q('ros.general', 'ros', 'multi', ['In the last month, have you had any of these?', 'पिछले एक महीने में क्या आपको इनमें से कुछ हुआ?', 'गेल्या महिन्यात तुम्हाला यापैकी काही झाले का?'],
    { options: opts('weight_loss', 'appetite', 'night_sweats', 'fatigue', 'none') }),
  q('ros.respiratory', 'ros', 'multi', ['Breathing: any of these?', 'साँस: इनमें से कुछ?', 'श्वसन: यापैकी काही?'], { options: opts('cough', 'breathlessness', 'wheeze', 'none') }),
  q('ros.cardio', 'ros', 'multi', ['Heart: any of these?', 'हृदय: इनमें से कुछ?', 'हृदय: यापैकी काही?'], { options: opts('chest_pain', 'palpitations', 'leg_swelling', 'none') }),
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
export const ONTOLOGY_VERSION = 1;
export const YES_NO_LABELS = { yes: L.yes, no: L.no };
