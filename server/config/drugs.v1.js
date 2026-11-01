// Drug dictionary v1 (Phase 5): brand and generic names, plus the classes used for interaction and allergy checks.
// STATUS: DRAFT. A starter list of commonly prescribed drugs in Indian OPDs, written by the builder. It has NOT been reviewed by a
// clinician or pharmacist (Phase 5 Definition of Done, item 4). A drug that is not in this list is never guessed: it is flagged for review.
// Review with: node server/scripts/export-analysis-data.js  (writes docs/analysis-data-review.md)

export const DRUGS_VERSION = 1;
export const DRUGS_STATUS = 'draft: pending clinician and pharmacist review';

const d = (generic, classes, brands = [], aliases = []) => ({ generic, classes, brands, aliases });

export const DRUGS = [
  d('metformin', ['biguanide'], ['Glycomet', 'Glucophage', 'Obimet'], ['metformin hydrochloride']),
  d('glimepiride', ['sulfonylurea'], ['Amaryl', 'Glimy']),
  d('insulin', ['insulin'], ['Mixtard', 'Lantus', 'Huminsulin', 'Actrapid']),
  d('amlodipine', ['calcium_channel_blocker'], ['Norvasc', 'Amlong', 'Amlokind']),
  d('atenolol', ['beta_blocker'], ['Tenormin', 'Aten']),
  d('metoprolol', ['beta_blocker'], ['Metolar', 'Betaloc']),
  d('telmisartan', ['arb'], ['Telma']),
  d('losartan', ['arb'], ['Losar', 'Cozaar']),
  d('enalapril', ['ace_inhibitor'], ['Envas', 'Enam']),
  d('ramipril', ['ace_inhibitor'], ['Cardace', 'Ramace']),
  d('lisinopril', ['ace_inhibitor'], ['Listril']),
  d('spironolactone', ['potassium_sparing_diuretic'], ['Aldactone']),
  d('furosemide', ['loop_diuretic'], ['Lasix']),
  d('hydrochlorothiazide', ['thiazide_diuretic'], ['Aquazide']),
  d('atorvastatin', ['statin'], ['Lipitor', 'Atorva', 'Storvas']),
  d('rosuvastatin', ['statin'], ['Rosuvas', 'Crestor']),
  d('simvastatin', ['statin'], ['Zocor']),
  d('aspirin', ['antiplatelet', 'nsaid'], ['Ecosprin', 'Disprin', 'Loprin'], ['acetylsalicylic acid', 'asa']),
  d('clopidogrel', ['antiplatelet'], ['Plavix', 'Clopilet']),
  d('warfarin', ['anticoagulant'], ['Warf', 'Coumadin']),
  d('ibuprofen', ['nsaid'], ['Brufen']),
  d('diclofenac', ['nsaid'], ['Voveran', 'Voltaren']),
  d('naproxen', ['nsaid'], ['Naprosyn']),
  d('paracetamol', ['analgesic'], ['Crocin', 'Dolo', 'Calpol', 'Metacin', 'Pacimol'], ['acetaminophen']),
  d('tramadol', ['opioid'], ['Tramazac']),
  d('omeprazole', ['ppi'], ['Omez', 'Prilosec']),
  d('pantoprazole', ['ppi'], ['Pan', 'Pantop']),
  d('azithromycin', ['macrolide'], ['Azithral', 'Zithromax', 'Azee']),
  d('clarithromycin', ['macrolide'], ['Claribid', 'Biaxin']),
  d('erythromycin', ['macrolide'], ['Erythrocin']),
  d('amoxicillin', ['penicillin'], ['Mox', 'Novamox', 'Amoxil']),
  d('amoxicillin clavulanate', ['penicillin'], ['Augmentin', 'Clavam'], ['co-amoxiclav']),
  d('ampicillin', ['penicillin'], []),
  d('penicillin', ['penicillin'], [], ['penicillin v', 'benzylpenicillin']),
  d('cefixime', ['cephalosporin'], ['Taxim-O', 'Suprax', 'Zifi']),
  d('cefuroxime', ['cephalosporin'], ['Zinnat', 'Ceftum']),
  d('ciprofloxacin', ['fluoroquinolone'], ['Ciplox', 'Cifran']),
  d('levofloxacin', ['fluoroquinolone'], ['Levaquin', 'Levoflox']),
  d('co-trimoxazole', ['sulfonamide'], ['Septran', 'Bactrim'], ['cotrimoxazole', 'sulfamethoxazole trimethoprim']),
  d('doxycycline', ['tetracycline'], ['Doxy-1']),
  d('cetirizine', ['antihistamine'], ['Okacet', 'Zyrtec', 'Cetzine']),
  d('levocetirizine', ['antihistamine'], ['Levocet']),
  d('montelukast', ['leukotriene_antagonist'], ['Montair', 'Singulair']),
  d('salbutamol', ['beta2_agonist'], ['Asthalin', 'Ventolin'], ['albuterol']),
  d('ambroxol', ['mucolytic'], ['Ambrodil', 'Mucolite']),
  d('levothyroxine', ['thyroid_hormone'], ['Thyronorm', 'Eltroxin']),
  d('sildenafil', ['pde5_inhibitor'], ['Viagra']),
  d('tadalafil', ['pde5_inhibitor'], ['Cialis']),
  d('isosorbide mononitrate', ['nitrate'], ['Imdur', 'Monotrate']),
  d('isosorbide dinitrate', ['nitrate'], ['Sorbitrate']),
  d('nitroglycerin', ['nitrate'], ['GTN'], ['glyceryl trinitrate']),
  d('digoxin', ['cardiac_glycoside'], ['Lanoxin']),
  d('amiodarone', ['antiarrhythmic'], ['Cordarone', 'Tachyra']),
  d('fluoxetine', ['ssri'], ['Prozac', 'Fludac']),
  d('sertraline', ['ssri'], ['Zoloft', 'Serta']),
  d('escitalopram', ['ssri'], ['Nexito', 'Cipralex']),
  d('methotrexate', ['antimetabolite'], ['Folitrax']),
  d('allopurinol', ['xanthine_oxidase_inhibitor'], ['Zyloric']),
  d('potassium chloride', ['potassium_supplement'], ['Slow-K'], ['kcl']),
  d('prednisolone', ['corticosteroid'], ['Wysolone', 'Omnacortil']),
  d('ondansetron', ['antiemetic'], ['Emeset', 'Zofran']),
  d('domperidone', ['antiemetic'], ['Domstal', 'Motilium']),
];

// Words that describe a drug's presentation, not its identity ("Metformin SR" is still metformin). Combination products such as
// "Telma H" are deliberately NOT stripped to a single drug; they stay unknown and are flagged for review.
export const DRUG_NAME_SUFFIXES = ['hcl', 'hydrochloride', 'sodium', 'sr', 'xr', 'er', 'cr', 'mr', 'forte', 'tablet', 'tablets', 'tab', 'cap', 'capsule', 'syrup', 'syp'];

// What a patient may call an allergy that is really a class. Keys and values are class names in DRUGS.
export const ALLERGY_CLASS_TERMS = {
  penicillin: 'penicillin', penicillins: 'penicillin', pencillin: 'penicillin', पेनिसिलिन: 'penicillin',
  sulfa: 'sulfonamide', sulpha: 'sulfonamide', sulfonamide: 'sulfonamide', sulphonamide: 'sulfonamide', सल्फा: 'sulfonamide',
  nsaid: 'nsaid', nsaids: 'nsaid', cephalosporin: 'cephalosporin', cephalosporins: 'cephalosporin',
  macrolide: 'macrolide', macrolides: 'macrolide', quinolone: 'fluoroquinolone', quinolones: 'fluoroquinolone', fluoroquinolone: 'fluoroquinolone',
  tetracycline: 'tetracycline', statin: 'statin', statins: 'statin',
};
