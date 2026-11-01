# Analysis reference data: clinician and pharmacist review and sign-off

Generated from `server/config/drugs.v1.js`, `interactions.v1.js`, `labs.v1.js` and `server/test/fixtures/analysis-cases.js` by `node server/scripts/export-analysis-data.js`. Do not edit by hand.

**Status: DRAFT. Nobody qualified has reviewed any list in this file.** The lists were written by the developers as a starter set. The PRD asks for a recognised interaction source chosen with a clinician or pharmacist; **this is not one**, and the product must not be used in a clinic until that choice is made and the lists below are signed off (Phase 5 Definition of Done, item 4).

- Drug dictionary v1: draft: pending clinician and pharmacist review
- Interaction list v1: draft: pending clinician and pharmacist review. Source: PatientCase_AI starter list v1 (not a licensed or recognised source)
- Lab dictionary v1: draft: pending clinician and laboratory review

## How the analysis uses these lists

- A drug or test **not** in a list is flagged "to check" and is never matched by similarity. A one-letter slip such as "Metformim" stays unknown on purpose.
- A name is matched exactly (ignoring case, spaces and hyphens), after dropping presentation words such as SR, XR, HCl and tablet. Combination products (for example "Telma H") are not split, so they stay unknown.
- Interactions are checked between every pair of known drugs on the merged list (files plus the patient's own answers). Each rule names two drugs or drug classes and an effect; the doctor screen shows the effect in English, Hindi or Marathi.
- Allergies the patient reports are matched to a drug by name or by drug class (for example "penicillin" matches amoxicillin). Cross-reactions between classes (for example penicillin and cephalosporins) are **not** modelled.
- Lab values are converted only with the factors in the lab dictionary. An unknown unit is never converted: the result is shown, marked "unit cannot be compared", and left out of the direction of change.
- The lab table says whether a value went up, down or stayed the same. It never says what that means.

## Questions for the reviewer

1. Which recognised interaction source should replace the starter list (licence, update cycle, Indian brand coverage)?
2. Are any rules below wrong, missing an important pair, or set to the wrong severity?
3. Are the brand names correct and in common use in Indian OPDs? Which common brands are missing?
4. Are the lab unit conversions safe? (Urea and calcium conversions are included; blood urea nitrogen is not.)
5. Name matching for wrong-patient detection: a name matches when at least 67% of the shorter name's words appear in the other; an age differs when it is more than 3 years from the registered date of birth. Are these thresholds acceptable?

## Drug dictionary (62 generic drugs)

| Generic name | Classes | Brand names | Other names |
|---|---|---|---|
| metformin | biguanide | Glycomet, Glucophage, Obimet | metformin hydrochloride |
| glimepiride | sulfonylurea | Amaryl, Glimy | - |
| insulin | insulin | Mixtard, Lantus, Huminsulin, Actrapid | - |
| amlodipine | calcium_channel_blocker | Norvasc, Amlong, Amlokind | - |
| atenolol | beta_blocker | Tenormin, Aten | - |
| metoprolol | beta_blocker | Metolar, Betaloc | - |
| telmisartan | arb | Telma | - |
| losartan | arb | Losar, Cozaar | - |
| enalapril | ace_inhibitor | Envas, Enam | - |
| ramipril | ace_inhibitor | Cardace, Ramace | - |
| lisinopril | ace_inhibitor | Listril | - |
| spironolactone | potassium_sparing_diuretic | Aldactone | - |
| furosemide | loop_diuretic | Lasix | - |
| hydrochlorothiazide | thiazide_diuretic | Aquazide | - |
| atorvastatin | statin | Lipitor, Atorva, Storvas | - |
| rosuvastatin | statin | Rosuvas, Crestor | - |
| simvastatin | statin | Zocor | - |
| aspirin | antiplatelet, nsaid | Ecosprin, Disprin, Loprin | acetylsalicylic acid, asa |
| clopidogrel | antiplatelet | Plavix, Clopilet | - |
| warfarin | anticoagulant | Warf, Coumadin | - |
| ibuprofen | nsaid | Brufen | - |
| diclofenac | nsaid | Voveran, Voltaren | - |
| naproxen | nsaid | Naprosyn | - |
| paracetamol | analgesic | Crocin, Dolo, Calpol, Metacin, Pacimol | acetaminophen |
| tramadol | opioid | Tramazac | - |
| omeprazole | ppi | Omez, Prilosec | - |
| pantoprazole | ppi | Pan, Pantop | - |
| azithromycin | macrolide | Azithral, Zithromax, Azee | - |
| clarithromycin | macrolide | Claribid, Biaxin | - |
| erythromycin | macrolide | Erythrocin | - |
| amoxicillin | penicillin | Mox, Novamox, Amoxil | - |
| amoxicillin clavulanate | penicillin | Augmentin, Clavam | co-amoxiclav |
| ampicillin | penicillin | - | - |
| penicillin | penicillin | - | penicillin v, benzylpenicillin |
| cefixime | cephalosporin | Taxim-O, Suprax, Zifi | - |
| cefuroxime | cephalosporin | Zinnat, Ceftum | - |
| ciprofloxacin | fluoroquinolone | Ciplox, Cifran | - |
| levofloxacin | fluoroquinolone | Levaquin, Levoflox | - |
| co-trimoxazole | sulfonamide | Septran, Bactrim | cotrimoxazole, sulfamethoxazole trimethoprim |
| doxycycline | tetracycline | Doxy-1 | - |
| cetirizine | antihistamine | Okacet, Zyrtec, Cetzine | - |
| levocetirizine | antihistamine | Levocet | - |
| montelukast | leukotriene_antagonist | Montair, Singulair | - |
| salbutamol | beta2_agonist | Asthalin, Ventolin | albuterol |
| ambroxol | mucolytic | Ambrodil, Mucolite | - |
| levothyroxine | thyroid_hormone | Thyronorm, Eltroxin | - |
| sildenafil | pde5_inhibitor | Viagra | - |
| tadalafil | pde5_inhibitor | Cialis | - |
| isosorbide mononitrate | nitrate | Imdur, Monotrate | - |
| isosorbide dinitrate | nitrate | Sorbitrate | - |
| nitroglycerin | nitrate | GTN | glyceryl trinitrate |
| digoxin | cardiac_glycoside | Lanoxin | - |
| amiodarone | antiarrhythmic | Cordarone, Tachyra | - |
| fluoxetine | ssri | Prozac, Fludac | - |
| sertraline | ssri | Zoloft, Serta | - |
| escitalopram | ssri | Nexito, Cipralex | - |
| methotrexate | antimetabolite | Folitrax | - |
| allopurinol | xanthine_oxidase_inhibitor | Zyloric | - |
| potassium chloride | potassium_supplement | Slow-K | kcl |
| prednisolone | corticosteroid | Wysolone, Omnacortil | - |
| ondansetron | antiemetic | Emeset, Zofran | - |
| domperidone | antiemetic | Domstal, Motilium | - |

## Interaction rules (34)

| Drug or class A | Drug or class B | Severity | Effect shown to the doctor |
|---|---|---|---|
| warfarin | aspirin | major | bleeding_risk |
| warfarin | nsaid | major | bleeding_risk |
| warfarin | clopidogrel | major | bleeding_risk |
| warfarin | macrolide | major | inr_change |
| warfarin | co-trimoxazole | major | inr_change |
| warfarin | amiodarone | major | inr_change |
| warfarin | fluoroquinolone | moderate | inr_change |
| warfarin | ssri | major | bleeding_risk |
| aspirin | clopidogrel | moderate | bleeding_risk |
| clopidogrel | omeprazole | moderate | reduced_activation |
| nsaid | ace_inhibitor | moderate | kidney_and_blood_pressure |
| nsaid | arb | moderate | kidney_and_blood_pressure |
| nsaid | ssri | moderate | gi_bleeding |
| nsaid | corticosteroid | moderate | gi_bleeding |
| nsaid | fluoroquinolone | moderate | seizure_risk |
| nsaid | methotrexate | major | drug_toxicity |
| ace_inhibitor | potassium_sparing_diuretic | major | high_potassium |
| arb | potassium_sparing_diuretic | major | high_potassium |
| ace_inhibitor | potassium_supplement | moderate | high_potassium |
| arb | potassium_supplement | moderate | high_potassium |
| ace_inhibitor | arb | moderate | dual_blockade |
| simvastatin | clarithromycin | major | muscle_toxicity |
| simvastatin | amiodarone | moderate | muscle_toxicity |
| simvastatin | amlodipine | moderate | muscle_toxicity |
| atorvastatin | clarithromycin | moderate | muscle_toxicity |
| pde5_inhibitor | nitrate | major | severe_low_blood_pressure |
| digoxin | amiodarone | major | drug_toxicity |
| digoxin | macrolide | major | drug_toxicity |
| ssri | tramadol | major | serotonin_syndrome |
| ssri | aspirin | moderate | gi_bleeding |
| methotrexate | co-trimoxazole | major | drug_toxicity |
| insulin | beta_blocker | moderate | masked_low_sugar |
| sulfonylurea | fluoroquinolone | moderate | blood_sugar_change |
| sulfonylurea | co-trimoxazole | moderate | blood_sugar_change |

Effects: bleeding_risk, inr_change, reduced_activation, kidney_and_blood_pressure, gi_bleeding, seizure_risk, drug_toxicity, high_potassium, dual_blockade, muscle_toxicity, severe_low_blood_pressure, serotonin_syndrome, masked_low_sugar, blood_sugar_change.

## Lab tests (23)

| Test | Canonical unit | Other names | Safe unit conversions |
|---|---|---|---|
| Hemoglobin | g/dL | hemoglobin, haemoglobin, hb, hgb, हीमोग्लोबिन | g/l |
| Fasting Glucose | mg/dL | fasting glucose, fasting blood sugar, fasting blood glucose, fbs, fbg, glucose fasting, fasting sugar | mmol/l |
| Postprandial Glucose | mg/dL | postprandial glucose, post prandial glucose, post prandial blood sugar, postprandial blood sugar, ppbs, pp glucose | mmol/l |
| Random Glucose | mg/dL | random glucose, random blood sugar, random blood glucose, rbs | mmol/l |
| Glucose (timing not stated) | mg/dL | glucose, blood sugar, blood glucose, sugar, ग्लूकोज, शुगर | mmol/l |
| HbA1c | % | hba1c, glycated hemoglobin, glycosylated hemoglobin, a1c | mmol/mol |
| Creatinine | mg/dL | creatinine, serum creatinine, क्रिएटिनिन | umol/l |
| Urea | mg/dL | urea, blood urea, serum urea | mmol/l |
| Total Cholesterol | mg/dL | total cholesterol, cholesterol, serum cholesterol, कोलेस्ट्रॉल | mmol/l |
| LDL Cholesterol | mg/dL | ldl, ldl cholesterol, ldl-c | mmol/l |
| HDL Cholesterol | mg/dL | hdl, hdl cholesterol, hdl-c | mmol/l |
| Triglycerides | mg/dL | triglycerides, triglyceride, tg | mmol/l |
| Platelet Count | lakhs/cumm | platelet count, platelets, platelet, plt | /cumm, cells/cumm, /ul, 10^3/ul |
| Total Leukocyte Count | cells/cumm | wbc, wbc count, total leukocyte count, total leucocyte count, tlc, white blood cells | /cumm, /ul, 10^3/ul |
| Red Blood Cell Count | million/cumm | rbc, rbc count, red blood cells, red blood cell count | 10^6/ul |
| TSH | uIU/mL | tsh, thyroid stimulating hormone | miu/l |
| Total Bilirubin | mg/dL | total bilirubin, bilirubin total, bilirubin | umol/l |
| SGPT (ALT) | IU/L | sgpt, alt, alanine aminotransferase | u/l |
| SGOT (AST) | IU/L | sgot, ast, aspartate aminotransferase | u/l |
| Sodium | mmol/L | sodium, serum sodium, na | meq/l |
| Potassium | mmol/L | potassium, serum potassium, k | meq/l |
| Calcium | mg/dL | calcium, serum calcium | mmol/l |
| ESR | mm/hr | esr, erythrocyte sedimentation rate | none |

## What the test set produces for interactions and allergies

Every row below is checked by an automated test; the reviewer is asked whether each is clinically right.

| Test case | Pair | Severity | Effect |
|---|---|---|---|
| interactions-and-allergy | aspirin + warfarin | major | bleeding_risk |
| interactions-and-allergy | ibuprofen + warfarin | major | bleeding_risk |
| interactions-and-allergy | amoxicillin with reported allergy "penicillin" | allergy (class) | n/a |

## Test cases (13 synthetic multi-file cases)

| Case | Covers |
|---|---|
| brand-and-generic-duplicates | duplicate drugs under brand and generic names; timeline order |
| dose-change | a dose change |
| labs-rising-and-falling | out-of-range labs with rising and falling values; direction of change only |
| lab-without-range | a lab with no reference range |
| wrong-patient-file | a wrong-patient file |
| conflicting-data | conflicting data between files |
| missing-and-future-dates | a missing date |
| patient-reports-no-medicines | a patient who reports no medicines while a prescription lists some |
| interactions-and-allergy | interaction flags; allergy conflicts |
| unknown-drug-and-test | an unknown drug or test is flagged, not guessed |
| units-converted-only-when-safe | unit handling |
| duplicates-in-a-file-and-across-files | duplicates |
| nothing-to-analyse | an empty encounter |

## Sign-off log

| Date | Reviewer | Role | Lists reviewed | Decision | Comments and changes made |
|---|---|---|---|---|---|
| | | | | | |
