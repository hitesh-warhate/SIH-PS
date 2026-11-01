# AYUSH question set v1: clinician review and sign-off

Generated from `server/config/ayush.v1.js` by `node server/scripts/export-ayush.js`. Do not edit by hand.

**Status:** draft: pending AYUSH clinician sign-off. **No AYUSH clinician has reviewed any of this.** The questions were written by the developers from the PRD's list of parameters. The clinician decides the wording, the options, and which parameters the patient can report and which need the physician's own observation. Hindi and Marathi are also drafts awaiting native-speaker review.

## What the system does with these answers

- AYUSH mode adds these questions after the standard ones. It is on when the encounter's department is an AYUSH department, and staff can switch it on or off for one patient. (That switch is the developers' assumption to confirm with the clinical team.)
- The patient's answers are recorded as the patient's own description, for the physician to confirm. **Options never name a dosha or state an assessment.** The summary says what the patient reported and what the physician must observe; it assesses nothing.
- Every listening mode works as in the standard interview: voice or touch, read-back for critical answers, red-flag checks, skip (recorded as "not answered", never "no").
- Answers are kept if the mode is switched off and on again; the interview resumes at the first unanswered question. The patient can save and continue later.

## Questions for the reviewer

1. Are the three groups right: **asked** (Prakriti, Vikriti, Satmya, Sattva, Ahara Shakti, Vyayama Shakti, Ahara-Vihara, Agni, Koshtha, Nidana, Samprapti account), **observed** (Sara, Samhanana, Pramana, the Samprapti assessment) and **derived** (Vaya from age)?
2. Are the plain-language options a fair description of each tendency? Would a patient understand them without training? Are any missing or leading?
3. Is it acceptable that Prakriti is captured from five self-report questions, as a note for the physician to confirm?
4. Is the length acceptable (28 questions after the standard interview)? Which could be dropped?
5. Are other systems in scope (Yoga, Unani, Siddha, Homeopathy)? The requirements list only Ayurvedic parameters.
6. Should AYUSH mode follow the department, as built, or be chosen some other way?

## Coverage of the required parameters

| Parameter | How it is handled |
|---|---|
| prakriti | asked of the patient |
| vikriti | asked of the patient |
| sara | to be observed by the physician |
| samhanana | to be observed by the physician |
| pramana | to be observed by the physician |
| satmya | asked of the patient |
| sattva | asked of the patient |
| ahara_shakti | asked of the patient |
| vyayama_shakti | asked of the patient |
| vaya | worked out from the registered age |
| ahara_vihara | asked of the patient |
| agni | asked of the patient |
| koshtha | asked of the patient |
| nidana | asked of the patient |
| samprapti | asked of the patient |

## Questions

### Dashavidha Pariksha (tenfold examination), as the patient reports it

Hindi: दशविध परीक्षा (दस प्रकार की जाँच), जैसा मरीज़ बताता है  
Marathi: दशविध परीक्षा (दहा प्रकारची तपासणी), रुग्ण सांगतो त्यानुसार

| Key | Parameter | Type | English | Options (English) | Hindi | Marathi |
|---|---|---|---|---|---|---|
| `ayush.prakriti.build` | prakriti | single | Since childhood, how would you describe your body build? (Prakriti) | Thin or light; Medium; Broad or heavy | बचपन से आपका शरीर कैसा रहा है? (प्रकृति) | लहानपणापासून तुमची शरीरयष्टी कशी आहे? (प्रकृती) |
| `ayush.prakriti.skin` | prakriti | single | How is your skin usually? (Prakriti) | Dry or rough; Warm, reddish, easily irritated; Smooth or oily | आपकी त्वचा आमतौर पर कैसी है? (प्रकृति) | तुमची त्वचा साधारणपणे कशी असते? (प्रकृती) |
| `ayush.prakriti.hunger` | prakriti | single | How is your hunger by nature? (Prakriti) | Irregular, sometimes strong, sometimes none; Strong; I get irritable if I miss a meal; Slow and steady; I can skip meals easily | स्वभाव से आपकी भूख कैसी है? (प्रकृति) | स्वभावतः तुमची भूक कशी असते? (प्रकृती) |
| `ayush.prakriti.sleep` | prakriti | single | How is your sleep by nature? (Prakriti) | Light and easily broken; Moderate; Deep and long | स्वभाव से आपकी नींद कैसी है? (प्रकृति) | स्वभावतः तुमची झोप कशी असते? (प्रकृती) |
| `ayush.prakriti.mind` | prakriti | single | Which describes your temperament best? (Prakriti) | Quick, worried or restless; Focused, determined, short-tempered; Calm, slow to anger, steady | आपके स्वभाव का सबसे सही वर्णन कौन सा है? (प्रकृति) | तुमच्या स्वभावाचे सर्वात योग्य वर्णन कोणते? (प्रकृती) |
| `ayush.vikriti.change` | vikriti | multi | Compared with your usual self, what has changed recently? (Vikriti) | More dryness, gas, constipation or stiffness; More burning, acidity, heat or anger; More heaviness, mucus, sleepiness or swelling; None of these | अपनी सामान्य स्थिति की तुलना में हाल में क्या बदला है? (विकृति) | तुमच्या नेहमीच्या स्थितीच्या तुलनेत अलीकडे काय बदलले आहे? (विकृती) |
| `ayush.satmya.taste` | satmya | multi | Which tastes do you eat most often? (Satmya) | Sweet; Sour; Salty; Hot and spicy; Bitter; Astringent (dry in the mouth) | आप सबसे ज़्यादा कौन से स्वाद खाते हैं? (सात्म्य) | तुम्ही सर्वात जास्त कोणत्या चवी खाता? (सात्म्य) |
| `ayush.satmya.habits` | satmya | text | Which foods or daily habits suit you well, and which do not? (Satmya) | - | कौन से भोजन या आदतें आपको सूट करती हैं और कौन सी नहीं? (सात्म्य) | कोणते अन्न किंवा सवयी तुम्हाला मानवतात आणि कोणत्या नाही? (सात्म्य) |
| `ayush.sattva.stress` | sattva | single | How is your mind when you are under stress? (Sattva) | Calm and steady under stress; Sometimes anxious or low; Often anxious or low | तनाव में आपका मन कैसा रहता है? (सत्त्व) | ताणात तुमचे मन कसे राहते? (सत्त्व) |
| `ayush.aharashakti.quantity` | ahara_shakti | single | How much do you usually eat compared with others? (Ahara Shakti) | Less than most people; About the same; More than most people | आप दूसरों की तुलना में कितना खाते हैं? (आहार शक्ति) | इतरांच्या तुलनेत तुम्ही किती खाता? (आहार शक्ती) |
| `ayush.aharashakti.digestion` | ahara_shakti | single | After a normal meal, how long until you feel light again? (Ahara Shakti) | Light again within 3 to 4 hours; Within 5 to 6 hours; Stays heavy for more than 6 hours | सामान्य भोजन के बाद कितनी देर में हल्का महसूस होता है? (आहार शक्ति) | सामान्य जेवणानंतर किती वेळाने हलके वाटते? (आहार शक्ती) |
| `ayush.vyayama.capacity` | vyayama_shakti | single | How much physical effort can you manage? (Vyayama Shakti) | Tire quickly, even with light work; Can do moderate work without tiring; Can do heavy work for long | आप कितनी शारीरिक मेहनत कर सकते हैं? (व्यायाम शक्ति) | तुम्ही किती शारीरिक श्रम करू शकता? (व्यायाम शक्ती) |
| `ayush.vyayama.habit` | vyayama_shakti | single | Do you exercise or do yoga? (Vyayama) | Never; Sometimes; Regularly | क्या आप व्यायाम या योग करते हैं? (व्यायाम) | तुम्ही व्यायाम किंवा योग करता का? (व्यायाम) |

### Ahara and Vihara (diet and daily routine)

Hindi: आहार और विहार (भोजन और दिनचर्या)  
Marathi: आहार आणि विहार (आहार आणि दिनचर्या)

| Key | Parameter | Type | English | Options (English) | Hindi | Marathi |
|---|---|---|---|---|---|---|
| `ayush.ahara.diet` | ahara_vihara | single | What kind of diet do you follow? (Ahara) | Vegetarian; Eat meat, fish or eggs; Vegan (no milk products) | आप किस प्रकार का आहार लेते हैं? (आहार) | तुम्ही कोणता आहार घेता? (आहार) |
| `ayush.ahara.meals` | ahara_vihara | number 1 to 8 | How many meals do you eat in a day? (Ahara) | - | आप दिन में कितनी बार भोजन करते हैं? (आहार) | तुम्ही दिवसातून किती वेळा जेवता? (आहार) |
| `ayush.ahara.timing` | ahara_vihara | single | Do you eat at regular times? (Ahara) | Regular times; Irregular times | क्या आप नियमित समय पर खाते हैं? (आहार) | तुम्ही नियमित वेळी जेवता का? (आहार) |
| `ayush.ahara.water` | ahara_vihara | number 0 to 30 | How many glasses of water do you drink in a day? (Ahara) | - | आप दिन में कितने गिलास पानी पीते हैं? (आहार) | तुम्ही दिवसातून किती ग्लास पाणी पिता? (आहार) |
| `ayush.vihara.sleep_hours` | ahara_vihara | number 0 to 16 | How many hours do you sleep at night? (Vihara) | - | आप रात में कितने घंटे सोते हैं? (विहार) | तुम्ही रात्री किती तास झोपता? (विहार) |
| `ayush.vihara.day_sleep` | ahara_vihara | yes_no | Do you sleep during the day? (Vihara) | Yes; No | क्या आप दिन में सोते हैं? (विहार) | तुम्ही दिवसा झोपता का? (विहार) |
| `ayush.vihara.work` | ahara_vihara | single | What is your daily work like? (Vihara) | Mostly sitting; Some walking or standing; Heavy physical work | आपका रोज़ का काम कैसा है? (विहार) | तुमचे रोजचे काम कसे आहे? (विहार) |

### Agni (digestive fire) and Koshtha (bowel habit)

Hindi: अग्नि (पाचन शक्ति) और कोष्ठ (मल प्रवृत्ति)  
Marathi: अग्नी (पचनशक्ती) आणि कोष्ठ (मलप्रवृत्ती)

| Key | Parameter | Type | English | Options (English) | Hindi | Marathi |
|---|---|---|---|---|---|---|
| `ayush.agni.hunger` | agni | single | How is your hunger these days? (Agni) | Regular, at meal times; Irregular; Little or no hunger | इन दिनों आपकी भूख कैसी है? (अग्नि) | सध्या तुमची भूक कशी आहे? (अग्नी) |
| `ayush.agni.heaviness` | agni | yes_no | Do you feel heavy or bloated after meals? (Agni) | Yes; No | क्या भोजन के बाद भारीपन या पेट फूलना होता है? (अग्नि) | जेवणानंतर जडपणा किंवा पोट फुगणे होते का? (अग्नी) |
| `ayush.agni.acidity` | agni | yes_no | Do you get burning, acidity or sour belching? (Agni) | Yes; No | क्या जलन, अम्लता या खट्टी डकार आती है? (अग्नि) | जळजळ, आम्लता किंवा आंबट ढेकर येते का? (अग्नी) |
| `ayush.koshtha.frequency` | koshtha | single | How often do you pass stool? (Koshtha) | More than once a day; Once a day; Once in 2 to 3 days; Less often than that | आप कितनी बार मल त्याग करते हैं? (कोष्ठ) | तुम्ही किती वेळा शौचास जाता? (कोष्ठ) |
| `ayush.koshtha.stool` | koshtha | single | What is the stool usually like? (Koshtha) | Hard or dry; Formed and normal; Loose, sticky or oily | मल आमतौर पर कैसा होता है? (कोष्ठ) | शौच साधारणपणे कसे असते? (कोष्ठ) |

### Nidana (what may have started it) and Samprapti (how it developed), as the patient describes it

Hindi: निदान (संभावित कारण) और संप्राप्ति (कैसे बढ़ा), जैसा मरीज़ बताता है  
Marathi: निदान (संभाव्य कारण) आणि संप्राप्ती (कसे वाढले), रुग्ण सांगतो त्यानुसार

| Key | Parameter | Type | English | Options (English) | Hindi | Marathi |
|---|---|---|---|---|---|---|
| `ayush.nidana.cause` | nidana | text | What do you think started this problem? Food, habits, stress, season, anything. (Nidana) | - | आपको क्या लगता है यह समस्या कैसे शुरू हुई? भोजन, आदतें, तनाव, मौसम, कुछ भी। (निदान) | तुम्हाला काय वाटते ही समस्या कशामुळे सुरू झाली? आहार, सवयी, ताण, ऋतू, काहीही. (निदान) |
| `ayush.nidana.triggers` | nidana | multi | What makes it worse? (Nidana) | Certain foods; Cold weather; Hot weather; Stress or worry; Lack of sleep; Too much physical effort; No known trigger | किस चीज़ से यह बढ़ता है? (निदान) | कशामुळे हे वाढते? (निदान) |
| `ayush.samprapti.course` | samprapti | text | How did it develop? Where did it start and what came next? (Samprapti) | - | यह कैसे बढ़ा? कहाँ से शुरू हुआ और फिर क्या हुआ? (संप्राप्ति) | हे कसे वाढले? कुठून सुरू झाले आणि पुढे काय झाले? (संप्राप्ती) |

### Option wording in Hindi and Marathi

| Question | Option (English) | Hindi | Marathi |
|---|---|---|---|
| `ayush.prakriti.build` | Thin or light | दुबला या हल्का | बारीक किंवा हलका |
| `ayush.prakriti.build` | Medium | मध्यम | मध्यम |
| `ayush.prakriti.build` | Broad or heavy | चौड़ा या भारी | रुंद किंवा जड |
| `ayush.prakriti.skin` | Dry or rough | सूखी या खुरदरी | कोरडी किंवा खरखरीत |
| `ayush.prakriti.skin` | Warm, reddish, easily irritated | गर्म, लालिमा लिए, जल्दी जलन वाली | उष्ण, लालसर, लवकर जळजळणारी |
| `ayush.prakriti.skin` | Smooth or oily | चिकनी या तैलीय | गुळगुळीत किंवा तेलकट |
| `ayush.prakriti.hunger` | Irregular, sometimes strong, sometimes none | अनियमित, कभी तेज़ कभी बिल्कुल नहीं | अनियमित, कधी तीव्र कधी अजिबात नाही |
| `ayush.prakriti.hunger` | Strong; I get irritable if I miss a meal | तेज़; खाना छूटे तो चिड़चिड़ाहट | तीव्र; जेवण चुकले तर चिडचिड |
| `ayush.prakriti.hunger` | Slow and steady; I can skip meals easily | धीमी और स्थिर; आसानी से भोजन छोड़ सकता/सकती हूँ | मंद आणि स्थिर; सहज जेवण टाळू शकतो/शकते |
| `ayush.prakriti.sleep` | Light and easily broken | हल्की, आसानी से टूटने वाली | हलकी, सहज तुटणारी |
| `ayush.prakriti.sleep` | Moderate | सामान्य | सामान्य |
| `ayush.prakriti.sleep` | Deep and long | गहरी और लंबी | गाढ आणि दीर्घ |
| `ayush.prakriti.mind` | Quick, worried or restless | तेज़, चिंतित या बेचैन | चपळ, चिंतित किंवा अस्वस्थ |
| `ayush.prakriti.mind` | Focused, determined, short-tempered | एकाग्र, दृढ़, जल्दी गुस्सा | एकाग्र, दृढ, तापट |
| `ayush.prakriti.mind` | Calm, slow to anger, steady | शांत, देर से गुस्सा, स्थिर | शांत, उशिरा रागावणारा, स्थिर |
| `ayush.vikriti.change` | More dryness, gas, constipation or stiffness | अधिक सूखापन, गैस, कब्ज़ या अकड़न | जास्त कोरडेपणा, वायू, बद्धकोष्ठता किंवा जखडणे |
| `ayush.vikriti.change` | More burning, acidity, heat or anger | अधिक जलन, अम्लता, गर्मी या गुस्सा | जास्त जळजळ, आम्लता, उष्णता किंवा राग |
| `ayush.vikriti.change` | More heaviness, mucus, sleepiness or swelling | अधिक भारीपन, बलगम, नींद या सूजन | जास्त जडपणा, कफ, झोप किंवा सूज |
| `ayush.satmya.taste` | Sweet | मीठा | गोड |
| `ayush.satmya.taste` | Sour | खट्टा | आंबट |
| `ayush.satmya.taste` | Salty | नमकीन | खारट |
| `ayush.satmya.taste` | Hot and spicy | तीखा | तिखट |
| `ayush.satmya.taste` | Bitter | कड़वा | कडू |
| `ayush.satmya.taste` | Astringent (dry in the mouth) | कसैला | तुरट |
| `ayush.sattva.stress` | Calm and steady under stress | तनाव में शांत और स्थिर | ताणात शांत आणि स्थिर |
| `ayush.sattva.stress` | Sometimes anxious or low | कभी-कभी चिंतित या उदास | कधीकधी चिंतित किंवा खिन्न |
| `ayush.sattva.stress` | Often anxious or low | अक्सर चिंतित या उदास | वारंवार चिंतित किंवा खिन्न |
| `ayush.aharashakti.quantity` | Less than most people | ज़्यादातर लोगों से कम | बहुतेकांपेक्षा कमी |
| `ayush.aharashakti.quantity` | About the same | लगभग बराबर | साधारण सारखे |
| `ayush.aharashakti.quantity` | More than most people | ज़्यादातर लोगों से ज़्यादा | बहुतेकांपेक्षा जास्त |
| `ayush.aharashakti.digestion` | Light again within 3 to 4 hours | 3-4 घंटे में फिर हल्का | 3-4 तासांत पुन्हा हलके |
| `ayush.aharashakti.digestion` | Within 5 to 6 hours | 5-6 घंटे में | 5-6 तासांत |
| `ayush.aharashakti.digestion` | Stays heavy for more than 6 hours | 6 घंटे से अधिक भारी रहता है | 6 तासांपेक्षा जास्त जड राहते |
| `ayush.vyayama.capacity` | Tire quickly, even with light work | हल्के काम में भी जल्दी थकान | हलक्या कामातही लवकर थकवा |
| `ayush.vyayama.capacity` | Can do moderate work without tiring | मध्यम काम बिना थके | मध्यम काम न थकता |
| `ayush.vyayama.capacity` | Can do heavy work for long | भारी काम देर तक | जड काम दीर्घकाळ |
| `ayush.vyayama.habit` | Never | कभी नहीं | कधीही नाही |
| `ayush.vyayama.habit` | Sometimes | कभी-कभी | कधीकधी |
| `ayush.vyayama.habit` | Regularly | नियमित रूप से | नियमितपणे |
| `ayush.ahara.diet` | Vegetarian | शाकाहारी | शाकाहारी |
| `ayush.ahara.diet` | Eat meat, fish or eggs | माँस, मछली या अंडे खाता/खाती हूँ | मांस, मासे किंवा अंडी खातो/खाते |
| `ayush.ahara.diet` | Vegan (no milk products) | वीगन (दूध उत्पाद नहीं) | व्हेगन (दुग्धजन्य नाही) |
| `ayush.ahara.timing` | Regular times | नियमित समय पर | नियमित वेळी |
| `ayush.ahara.timing` | Irregular times | अनियमित समय पर | अनियमित वेळी |
| `ayush.vihara.work` | Mostly sitting | ज़्यादातर बैठे रहना | बहुतेक बसून |
| `ayush.vihara.work` | Some walking or standing | कुछ चलना या खड़े रहना | काही चालणे किंवा उभे राहणे |
| `ayush.vihara.work` | Heavy physical work | भारी शारीरिक काम | जड शारीरिक काम |
| `ayush.agni.hunger` | Regular, at meal times | नियमित, भोजन के समय | नियमित, जेवणाच्या वेळी |
| `ayush.agni.hunger` | Irregular | अनियमित | अनियमित |
| `ayush.agni.hunger` | Little or no hunger | भूख कम या नहीं | भूक कमी किंवा नाही |
| `ayush.koshtha.frequency` | More than once a day | दिन में एक से अधिक बार | दिवसातून एकापेक्षा जास्त वेळा |
| `ayush.koshtha.frequency` | Once a day | दिन में एक बार | दिवसातून एकदा |
| `ayush.koshtha.frequency` | Once in 2 to 3 days | 2-3 दिन में एक बार | 2-3 दिवसांतून एकदा |
| `ayush.koshtha.frequency` | Less often than that | इससे कम | त्यापेक्षा कमी |
| `ayush.koshtha.stool` | Hard or dry | कड़ा या सूखा | कडक किंवा कोरडे |
| `ayush.koshtha.stool` | Formed and normal | सामान्य | सामान्य |
| `ayush.koshtha.stool` | Loose, sticky or oily | पतला, चिपचिपा या चिकना | पातळ, चिकट किंवा तेलकट |
| `ayush.nidana.triggers` | Certain foods | कुछ खाद्य पदार्थ | काही खाद्यपदार्थ |
| `ayush.nidana.triggers` | Cold weather | ठंडा मौसम | थंड हवामान |
| `ayush.nidana.triggers` | Hot weather | गर्म मौसम | उष्ण हवामान |
| `ayush.nidana.triggers` | Stress or worry | तनाव या चिंता | ताण किंवा काळजी |
| `ayush.nidana.triggers` | Lack of sleep | नींद की कमी | झोपेची कमतरता |
| `ayush.nidana.triggers` | Too much physical effort | अत्यधिक शारीरिक मेहनत | अतिशय शारीरिक श्रम |
| `ayush.nidana.triggers` | No known trigger | कोई ज्ञात कारण नहीं | कोणतेही ज्ञात कारण नाही |

## Items for the physician to observe (never filled in by the system)

| Parameter | English | Hindi | Marathi |
|---|---|---|---|
| sara | Sara (tissue quality) | सार (धातु गुणवत्ता) | सार (धातू गुणवत्ता) |
| samhanana | Samhanana (body compactness) | संहनन (शरीर की सुगठितता) | संहनन (शरीराची सुघटितता) |
| pramana | Pramana (body measurements) | प्रमाण (शरीर के माप) | प्रमाण (शरीराची मापे) |
| samprapti_assessment | Samprapti (assessment of how the disease developed) | संप्राप्ति (रोग के विकास का आकलन) | संप्राप्ती (रोगाच्या विकासाचे मूल्यांकन) |

## Vaya (worked out from the registered age)

| Age | Shown as |
|---|---|
| under 16 | Bala (child) |
| 16 to 60 | Madhya (adult) |
| over 60 | Jeerna (older adult) |

## Sign-off log

| Date | Reviewer | Qualification | Decision | Changes made |
|---|---|---|---|---|
| | | | | |
