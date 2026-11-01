// AYUSH question set v1 (Phase 7, FR-A14, FR-A15): the Dashavidha Pariksha parameters that a patient can report, Ahara-Vihara, Agni,
// Koshtha, Nidana and Samprapti. Same shape as the standard bank (questions.v1.js); every text is [English, Hindi, Marathi] with the
// Sanskrit term beside it.
//
// STATUS: DRAFT. Written by the developers from the PRD list. NO AYUSH CLINICIAN HAS REVIEWED THIS CONTENT. The clinician decides the wording,
// the options, and which parameters the patient can report and which need the physician's own observation (PRD Phase 7). Hindi and Marathi are
// also drafts pending native-speaker review. Review with: node server/scripts/export-ayush.js (writes docs/ayush-content-review.md).
//
// What the patient says is recorded for the physician to confirm. Nothing here assesses Prakriti, Vikriti or anything else: options are
// plain-language descriptions, never dosha names or conclusions.

export const AYUSH_VERSION = 1;
export const AYUSH_STATUS = 'draft: pending AYUSH clinician sign-off';

const L = {
  yes: ['Yes', 'हाँ', 'होय'], no: ['No', 'नहीं', 'नाही'], none: ['None of these', 'इनमें से कोई नहीं', 'यापैकी काही नाही'],
  thin: ['Thin or light', 'दुबला या हल्का', 'बारीक किंवा हलका'], medium: ['Medium', 'मध्यम', 'मध्यम'], broad: ['Broad or heavy', 'चौड़ा या भारी', 'रुंद किंवा जड'],
  skin_dry: ['Dry or rough', 'सूखी या खुरदरी', 'कोरडी किंवा खरखरीत'], skin_warm: ['Warm, reddish, easily irritated', 'गर्म, लालिमा लिए, जल्दी जलन वाली', 'उष्ण, लालसर, लवकर जळजळणारी'], skin_oily: ['Smooth or oily', 'चिकनी या तैलीय', 'गुळगुळीत किंवा तेलकट'],
  hunger_irregular: ['Irregular, sometimes strong, sometimes none', 'अनियमित, कभी तेज़ कभी बिल्कुल नहीं', 'अनियमित, कधी तीव्र कधी अजिबात नाही'], hunger_sharp: ['Strong; I get irritable if I miss a meal', 'तेज़; खाना छूटे तो चिड़चिड़ाहट', 'तीव्र; जेवण चुकले तर चिडचिड'], hunger_slow: ['Slow and steady; I can skip meals easily', 'धीमी और स्थिर; आसानी से भोजन छोड़ सकता/सकती हूँ', 'मंद आणि स्थिर; सहज जेवण टाळू शकतो/शकते'],
  sleep_light: ['Light and easily broken', 'हल्की, आसानी से टूटने वाली', 'हलकी, सहज तुटणारी'], sleep_moderate: ['Moderate', 'सामान्य', 'सामान्य'], sleep_deep: ['Deep and long', 'गहरी और लंबी', 'गाढ आणि दीर्घ'],
  mind_quick: ['Quick, worried or restless', 'तेज़, चिंतित या बेचैन', 'चपळ, चिंतित किंवा अस्वस्थ'], mind_sharp: ['Focused, determined, short-tempered', 'एकाग्र, दृढ़, जल्दी गुस्सा', 'एकाग्र, दृढ, तापट'], mind_calm: ['Calm, slow to anger, steady', 'शांत, देर से गुस्सा, स्थिर', 'शांत, उशिरा रागावणारा, स्थिर'],
  ch_dry: ['More dryness, gas, constipation or stiffness', 'अधिक सूखापन, गैस, कब्ज़ या अकड़न', 'जास्त कोरडेपणा, वायू, बद्धकोष्ठता किंवा जखडणे'],
  ch_heat: ['More burning, acidity, heat or anger', 'अधिक जलन, अम्लता, गर्मी या गुस्सा', 'जास्त जळजळ, आम्लता, उष्णता किंवा राग'],
  ch_heavy: ['More heaviness, mucus, sleepiness or swelling', 'अधिक भारीपन, बलगम, नींद या सूजन', 'जास्त जडपणा, कफ, झोप किंवा सूज'],
  sweet: ['Sweet', 'मीठा', 'गोड'], sour: ['Sour', 'खट्टा', 'आंबट'], salty: ['Salty', 'नमकीन', 'खारट'], pungent: ['Hot and spicy', 'तीखा', 'तिखट'], bitter: ['Bitter', 'कड़वा', 'कडू'], astringent: ['Astringent (dry in the mouth)', 'कसैला', 'तुरट'],
  calm: ['Calm and steady under stress', 'तनाव में शांत और स्थिर', 'ताणात शांत आणि स्थिर'], some_anx: ['Sometimes anxious or low', 'कभी-कभी चिंतित या उदास', 'कधीकधी चिंतित किंवा खिन्न'], often_anx: ['Often anxious or low', 'अक्सर चिंतित या उदास', 'वारंवार चिंतित किंवा खिन्न'],
  less: ['Less than most people', 'ज़्यादातर लोगों से कम', 'बहुतेकांपेक्षा कमी'], same: ['About the same', 'लगभग बराबर', 'साधारण सारखे'], more: ['More than most people', 'ज़्यादातर लोगों से ज़्यादा', 'बहुतेकांपेक्षा जास्त'],
  dig_fast: ['Light again within 3 to 4 hours', '3-4 घंटे में फिर हल्का', '3-4 तासांत पुन्हा हलके'], dig_mid: ['Within 5 to 6 hours', '5-6 घंटे में', '5-6 तासांत'], dig_slow: ['Stays heavy for more than 6 hours', '6 घंटे से अधिक भारी रहता है', '6 तासांपेक्षा जास्त जड राहते'],
  eff_low: ['Tire quickly, even with light work', 'हल्के काम में भी जल्दी थकान', 'हलक्या कामातही लवकर थकवा'], eff_mid: ['Can do moderate work without tiring', 'मध्यम काम बिना थके', 'मध्यम काम न थकता'], eff_high: ['Can do heavy work for long', 'भारी काम देर तक', 'जड काम दीर्घकाळ'],
  never: ['Never', 'कभी नहीं', 'कधीही नाही'], sometimes: ['Sometimes', 'कभी-कभी', 'कधीकधी'], regularly: ['Regularly', 'नियमित रूप से', 'नियमितपणे'],
  veg: ['Vegetarian', 'शाकाहारी', 'शाकाहारी'], mixed: ['Eat meat, fish or eggs', 'माँस, मछली या अंडे खाता/खाती हूँ', 'मांस, मासे किंवा अंडी खातो/खाते'], vegan: ['Vegan (no milk products)', 'वीगन (दूध उत्पाद नहीं)', 'व्हेगन (दुग्धजन्य नाही)'],
  regular: ['Regular times', 'नियमित समय पर', 'नियमित वेळी'], irregular: ['Irregular times', 'अनियमित समय पर', 'अनियमित वेळी'],
  sedentary: ['Mostly sitting', 'ज़्यादातर बैठे रहना', 'बहुतेक बसून'], moderate: ['Some walking or standing', 'कुछ चलना या खड़े रहना', 'काही चालणे किंवा उभे राहणे'], heavy: ['Heavy physical work', 'भारी शारीरिक काम', 'जड शारीरिक काम'],
  hunger_reg: ['Regular, at meal times', 'नियमित, भोजन के समय', 'नियमित, जेवणाच्या वेळी'], hunger_irr: ['Irregular', 'अनियमित', 'अनियमित'], hunger_low: ['Little or no hunger', 'भूख कम या नहीं', 'भूक कमी किंवा नाही'],
  b_many: ['More than once a day', 'दिन में एक से अधिक बार', 'दिवसातून एकापेक्षा जास्त वेळा'], b_once: ['Once a day', 'दिन में एक बार', 'दिवसातून एकदा'], b_2_3: ['Once in 2 to 3 days', '2-3 दिन में एक बार', '2-3 दिवसांतून एकदा'], b_rare: ['Less often than that', 'इससे कम', 'त्यापेक्षा कमी'],
  st_hard: ['Hard or dry', 'कड़ा या सूखा', 'कडक किंवा कोरडे'], st_normal: ['Formed and normal', 'सामान्य', 'सामान्य'], st_loose: ['Loose, sticky or oily', 'पतला, चिपचिपा या चिकना', 'पातळ, चिकट किंवा तेलकट'],
  tr_food: ['Certain foods', 'कुछ खाद्य पदार्थ', 'काही खाद्यपदार्थ'], tr_cold: ['Cold weather', 'ठंडा मौसम', 'थंड हवामान'], tr_hot: ['Hot weather', 'गर्म मौसम', 'उष्ण हवामान'], tr_stress: ['Stress or worry', 'तनाव या चिंता', 'ताण किंवा काळजी'],
  tr_sleep: ['Lack of sleep', 'नींद की कमी', 'झोपेची कमतरता'], tr_effort: ['Too much physical effort', 'अत्यधिक शारीरिक मेहनत', 'अतिशय शारीरिक श्रम'], tr_unknown: ['No known trigger', 'कोई ज्ञात कारण नहीं', 'कोणतेही ज्ञात कारण नाही'],
};
const opts = (...values) => values.map((value) => ({ value, label: L[value] }));
const YES_NO = opts('yes', 'no');
// `parameter` names the Ayurvedic parameter a question belongs to, so the coverage can be checked and shown to the clinician.
const q = (key, parameter, section, type, text, extra = {}) => ({ key, parameter, section, type, text, ayush: true, ...extra });

export const AYUSH_SECTIONS = [
  ['ayush_dashavidha', ['Dashavidha Pariksha (tenfold examination), as the patient reports it', 'दशविध परीक्षा (दस प्रकार की जाँच), जैसा मरीज़ बताता है', 'दशविध परीक्षा (दहा प्रकारची तपासणी), रुग्ण सांगतो त्यानुसार']],
  ['ayush_ahara_vihara', ['Ahara and Vihara (diet and daily routine)', 'आहार और विहार (भोजन और दिनचर्या)', 'आहार आणि विहार (आहार आणि दिनचर्या)']],
  ['ayush_agni_koshtha', ['Agni (digestive fire) and Koshtha (bowel habit)', 'अग्नि (पाचन शक्ति) और कोष्ठ (मल प्रवृत्ति)', 'अग्नी (पचनशक्ती) आणि कोष्ठ (मलप्रवृत्ती)']],
  ['ayush_nidana_samprapti', ['Nidana (what may have started it) and Samprapti (how it developed), as the patient describes it', 'निदान (संभावित कारण) और संप्राप्ति (कैसे बढ़ा), जैसा मरीज़ बताता है', 'निदान (संभाव्य कारण) आणि संप्राप्ती (कसे वाढले), रुग्ण सांगतो त्यानुसार']],
];

export const AYUSH_QUESTIONS = [
  // --- Prakriti: the person's lifelong tendencies, as the patient describes them ---
  q('ayush.prakriti.build', 'prakriti', 'ayush_dashavidha', 'single', ['Since childhood, how would you describe your body build? (Prakriti)', 'बचपन से आपका शरीर कैसा रहा है? (प्रकृति)', 'लहानपणापासून तुमची शरीरयष्टी कशी आहे? (प्रकृती)'], { options: opts('thin', 'medium', 'broad') }),
  q('ayush.prakriti.skin', 'prakriti', 'ayush_dashavidha', 'single', ['How is your skin usually? (Prakriti)', 'आपकी त्वचा आमतौर पर कैसी है? (प्रकृति)', 'तुमची त्वचा साधारणपणे कशी असते? (प्रकृती)'], { options: opts('skin_dry', 'skin_warm', 'skin_oily') }),
  q('ayush.prakriti.hunger', 'prakriti', 'ayush_dashavidha', 'single', ['How is your hunger by nature? (Prakriti)', 'स्वभाव से आपकी भूख कैसी है? (प्रकृति)', 'स्वभावतः तुमची भूक कशी असते? (प्रकृती)'], { options: opts('hunger_irregular', 'hunger_sharp', 'hunger_slow') }),
  q('ayush.prakriti.sleep', 'prakriti', 'ayush_dashavidha', 'single', ['How is your sleep by nature? (Prakriti)', 'स्वभाव से आपकी नींद कैसी है? (प्रकृति)', 'स्वभावतः तुमची झोप कशी असते? (प्रकृती)'], { options: opts('sleep_light', 'sleep_moderate', 'sleep_deep') }),
  q('ayush.prakriti.mind', 'prakriti', 'ayush_dashavidha', 'single', ['Which describes your temperament best? (Prakriti)', 'आपके स्वभाव का सबसे सही वर्णन कौन सा है? (प्रकृति)', 'तुमच्या स्वभावाचे सर्वात योग्य वर्णन कोणते? (प्रकृती)'], { options: opts('mind_quick', 'mind_sharp', 'mind_calm') }),
  // --- Vikriti: what has changed lately ---
  q('ayush.vikriti.change', 'vikriti', 'ayush_dashavidha', 'multi', ['Compared with your usual self, what has changed recently? (Vikriti)', 'अपनी सामान्य स्थिति की तुलना में हाल में क्या बदला है? (विकृति)', 'तुमच्या नेहमीच्या स्थितीच्या तुलनेत अलीकडे काय बदलले आहे? (विकृती)'], { options: opts('ch_dry', 'ch_heat', 'ch_heavy', 'none') }),
  // --- Satmya: what the body is used to ---
  q('ayush.satmya.taste', 'satmya', 'ayush_dashavidha', 'multi', ['Which tastes do you eat most often? (Satmya)', 'आप सबसे ज़्यादा कौन से स्वाद खाते हैं? (सात्म्य)', 'तुम्ही सर्वात जास्त कोणत्या चवी खाता? (सात्म्य)'], { options: opts('sweet', 'sour', 'salty', 'pungent', 'bitter', 'astringent') }),
  q('ayush.satmya.habits', 'satmya', 'ayush_dashavidha', 'text', ['Which foods or daily habits suit you well, and which do not? (Satmya)', 'कौन से भोजन या आदतें आपको सूट करती हैं और कौन सी नहीं? (सात्म्य)', 'कोणते अन्न किंवा सवयी तुम्हाला मानवतात आणि कोणत्या नाही? (सात्म्य)']),
  // --- Sattva: mental strength ---
  q('ayush.sattva.stress', 'sattva', 'ayush_dashavidha', 'single', ['How is your mind when you are under stress? (Sattva)', 'तनाव में आपका मन कैसा रहता है? (सत्त्व)', 'ताणात तुमचे मन कसे राहते? (सत्त्व)'], { options: opts('calm', 'some_anx', 'often_anx') }),
  // --- Ahara Shakti: capacity to eat and to digest ---
  q('ayush.aharashakti.quantity', 'ahara_shakti', 'ayush_dashavidha', 'single', ['How much do you usually eat compared with others? (Ahara Shakti)', 'आप दूसरों की तुलना में कितना खाते हैं? (आहार शक्ति)', 'इतरांच्या तुलनेत तुम्ही किती खाता? (आहार शक्ती)'], { options: opts('less', 'same', 'more') }),
  q('ayush.aharashakti.digestion', 'ahara_shakti', 'ayush_dashavidha', 'single', ['After a normal meal, how long until you feel light again? (Ahara Shakti)', 'सामान्य भोजन के बाद कितनी देर में हल्का महसूस होता है? (आहार शक्ति)', 'सामान्य जेवणानंतर किती वेळाने हलके वाटते? (आहार शक्ती)'], { options: opts('dig_fast', 'dig_mid', 'dig_slow') }),
  // --- Vyayama Shakti: capacity for exercise ---
  q('ayush.vyayama.capacity', 'vyayama_shakti', 'ayush_dashavidha', 'single', ['How much physical effort can you manage? (Vyayama Shakti)', 'आप कितनी शारीरिक मेहनत कर सकते हैं? (व्यायाम शक्ति)', 'तुम्ही किती शारीरिक श्रम करू शकता? (व्यायाम शक्ती)'], { options: opts('eff_low', 'eff_mid', 'eff_high') }),
  q('ayush.vyayama.habit', 'vyayama_shakti', 'ayush_dashavidha', 'single', ['Do you exercise or do yoga? (Vyayama)', 'क्या आप व्यायाम या योग करते हैं? (व्यायाम)', 'तुम्ही व्यायाम किंवा योग करता का? (व्यायाम)'], { options: opts('never', 'sometimes', 'regularly') }),

  // --- Ahara and Vihara ---
  q('ayush.ahara.diet', 'ahara_vihara', 'ayush_ahara_vihara', 'single', ['What kind of diet do you follow? (Ahara)', 'आप किस प्रकार का आहार लेते हैं? (आहार)', 'तुम्ही कोणता आहार घेता? (आहार)'], { options: opts('veg', 'mixed', 'vegan') }),
  q('ayush.ahara.meals', 'ahara_vihara', 'ayush_ahara_vihara', 'number', ['How many meals do you eat in a day? (Ahara)', 'आप दिन में कितनी बार भोजन करते हैं? (आहार)', 'तुम्ही दिवसातून किती वेळा जेवता? (आहार)'], { min: 1, max: 8 }),
  q('ayush.ahara.timing', 'ahara_vihara', 'ayush_ahara_vihara', 'single', ['Do you eat at regular times? (Ahara)', 'क्या आप नियमित समय पर खाते हैं? (आहार)', 'तुम्ही नियमित वेळी जेवता का? (आहार)'], { options: opts('regular', 'irregular') }),
  q('ayush.ahara.water', 'ahara_vihara', 'ayush_ahara_vihara', 'number', ['How many glasses of water do you drink in a day? (Ahara)', 'आप दिन में कितने गिलास पानी पीते हैं? (आहार)', 'तुम्ही दिवसातून किती ग्लास पाणी पिता? (आहार)'], { min: 0, max: 30 }),
  q('ayush.vihara.sleep_hours', 'ahara_vihara', 'ayush_ahara_vihara', 'number', ['How many hours do you sleep at night? (Vihara)', 'आप रात में कितने घंटे सोते हैं? (विहार)', 'तुम्ही रात्री किती तास झोपता? (विहार)'], { min: 0, max: 16 }),
  q('ayush.vihara.day_sleep', 'ahara_vihara', 'ayush_ahara_vihara', 'yes_no', ['Do you sleep during the day? (Vihara)', 'क्या आप दिन में सोते हैं? (विहार)', 'तुम्ही दिवसा झोपता का? (विहार)'], { options: YES_NO }),
  q('ayush.vihara.work', 'ahara_vihara', 'ayush_ahara_vihara', 'single', ['What is your daily work like? (Vihara)', 'आपका रोज़ का काम कैसा है? (विहार)', 'तुमचे रोजचे काम कसे आहे? (विहार)'], { options: opts('sedentary', 'moderate', 'heavy') }),

  // --- Agni and Koshtha ---
  q('ayush.agni.hunger', 'agni', 'ayush_agni_koshtha', 'single', ['How is your hunger these days? (Agni)', 'इन दिनों आपकी भूख कैसी है? (अग्नि)', 'सध्या तुमची भूक कशी आहे? (अग्नी)'], { options: opts('hunger_reg', 'hunger_irr', 'hunger_low') }),
  q('ayush.agni.heaviness', 'agni', 'ayush_agni_koshtha', 'yes_no', ['Do you feel heavy or bloated after meals? (Agni)', 'क्या भोजन के बाद भारीपन या पेट फूलना होता है? (अग्नि)', 'जेवणानंतर जडपणा किंवा पोट फुगणे होते का? (अग्नी)'], { options: YES_NO }),
  q('ayush.agni.acidity', 'agni', 'ayush_agni_koshtha', 'yes_no', ['Do you get burning, acidity or sour belching? (Agni)', 'क्या जलन, अम्लता या खट्टी डकार आती है? (अग्नि)', 'जळजळ, आम्लता किंवा आंबट ढेकर येते का? (अग्नी)'], { options: YES_NO }),
  q('ayush.koshtha.frequency', 'koshtha', 'ayush_agni_koshtha', 'single', ['How often do you pass stool? (Koshtha)', 'आप कितनी बार मल त्याग करते हैं? (कोष्ठ)', 'तुम्ही किती वेळा शौचास जाता? (कोष्ठ)'], { options: opts('b_many', 'b_once', 'b_2_3', 'b_rare') }),
  q('ayush.koshtha.stool', 'koshtha', 'ayush_agni_koshtha', 'single', ['What is the stool usually like? (Koshtha)', 'मल आमतौर पर कैसा होता है? (कोष्ठ)', 'शौच साधारणपणे कसे असते? (कोष्ठ)'], { options: opts('st_hard', 'st_normal', 'st_loose') }),

  // --- Nidana and Samprapti (the patient's own account; the physician makes the assessment) ---
  q('ayush.nidana.cause', 'nidana', 'ayush_nidana_samprapti', 'text', ['What do you think started this problem? Food, habits, stress, season, anything. (Nidana)', 'आपको क्या लगता है यह समस्या कैसे शुरू हुई? भोजन, आदतें, तनाव, मौसम, कुछ भी। (निदान)', 'तुम्हाला काय वाटते ही समस्या कशामुळे सुरू झाली? आहार, सवयी, ताण, ऋतू, काहीही. (निदान)']),
  q('ayush.nidana.triggers', 'nidana', 'ayush_nidana_samprapti', 'multi', ['What makes it worse? (Nidana)', 'किस चीज़ से यह बढ़ता है? (निदान)', 'कशामुळे हे वाढते? (निदान)'], { options: opts('tr_food', 'tr_cold', 'tr_hot', 'tr_stress', 'tr_sleep', 'tr_effort', 'tr_unknown') }),
  q('ayush.samprapti.course', 'samprapti', 'ayush_nidana_samprapti', 'text', ['How did it develop? Where did it start and what came next? (Samprapti)', 'यह कैसे बढ़ा? कहाँ से शुरू हुआ और फिर क्या हुआ? (संप्राप्ति)', 'हे कसे वाढले? कुठून सुरू झाले आणि पुढे काय झाले? (संप्राप्ती)']),
];

// Parameters the patient cannot report. The summary lists them as "to be observed by the physician" and never fills them in.
// Which parameters belong here is the AYUSH clinician's decision (PRD Phase 7); this is the developers' proposal.
export const AYUSH_OBSERVED = [
  { parameter: 'sara', title: ['Sara (tissue quality)', 'सार (धातु गुणवत्ता)', 'सार (धातू गुणवत्ता)'] },
  { parameter: 'samhanana', title: ['Samhanana (body compactness)', 'संहनन (शरीर की सुगठितता)', 'संहनन (शरीराची सुघटितता)'] },
  { parameter: 'pramana', title: ['Pramana (body measurements)', 'प्रमाण (शरीर के माप)', 'प्रमाण (शरीराची मापे)'] },
  { parameter: 'samprapti_assessment', title: ['Samprapti (assessment of how the disease developed)', 'संप्राप्ति (रोग के विकास का आकलन)', 'संप्राप्ती (रोगाच्या विकासाचे मूल्यांकन)'] },
];

// Vaya (age group) is not asked: it is worked out from the registered age (Bala under 16, Madhya 16 to 60, Jeerna over 60).
export const VAYA = { bala: ['Bala (child)', 'बाल (बच्चा)', 'बाल (मूल)'], madhya: ['Madhya (adult)', 'मध्य (वयस्क)', 'मध्य (प्रौढ)'], jeerna: ['Jeerna (older adult)', 'जीर्ण (वृद्ध)', 'जीर्ण (वृद्ध)'] };
export const vayaOf = (age) => (age == null ? null : age < 16 ? 'bala' : age <= 60 ? 'madhya' : 'jeerna');

// The ten Dashavidha Pariksha parameters and the other required topics, to check coverage.
export const DASHAVIDHA = ['prakriti', 'vikriti', 'sara', 'samhanana', 'pramana', 'satmya', 'sattva', 'ahara_shakti', 'vyayama_shakti', 'vaya'];
export const OTHER_TOPICS = ['ahara_vihara', 'agni', 'koshtha', 'nidana', 'samprapti'];
