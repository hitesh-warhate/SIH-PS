// Generates docs/analysis-data-review.md: the drug dictionary, interaction list, lab dictionary and test cases for clinician and
// pharmacist review and sign-off (Phase 5 Definition of Done, item 4).
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DRUGS, DRUGS_STATUS, DRUGS_VERSION } from '../config/drugs.v1.js';
import { INTERACTIONS_SOURCE, INTERACTIONS_STATUS, INTERACTIONS_VERSION, INTERACTION_RULES } from '../config/interactions.v1.js';
import { LABS_STATUS, LABS_VERSION, LAB_TESTS } from '../config/labs.v1.js';
import { ANALYSIS } from '../src/analysis/config.js';
import { analyze } from '../src/analysis/engine.js';
import { CASES } from '../test/fixtures/analysis-cases.js';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const effects = [...new Set(INTERACTION_RULES.map((r) => r.effect))];

const interactionRows = CASES.flatMap((c) => {
  const r = analyze(c.input);
  return [
    ...r.interactions.interactions.map((i) => `| ${c.id} | ${i.a} + ${i.b} | ${i.severity} | ${i.effect} |`),
    ...r.interactions.allergyConflicts.map((a) => `| ${c.id} | ${a.drug} with reported allergy "${a.allergen}" | allergy (${a.match}) | n/a |`),
  ];
});

const out = [
  '# Analysis reference data: clinician and pharmacist review and sign-off', '',
  'Generated from `server/config/drugs.v1.js`, `interactions.v1.js`, `labs.v1.js` and `server/test/fixtures/analysis-cases.js` by `node server/scripts/export-analysis-data.js`. Do not edit by hand.', '',
  '**Status: DRAFT. Nobody qualified has reviewed any list in this file.** The lists were written by the developers as a starter set. The PRD asks for a recognised interaction source chosen with a clinician or pharmacist; **this is not one**, and the product must not be used in a clinic until that choice is made and the lists below are signed off (Phase 5 Definition of Done, item 4).', '',
  `- Drug dictionary v${DRUGS_VERSION}: ${DRUGS_STATUS}`, `- Interaction list v${INTERACTIONS_VERSION}: ${INTERACTIONS_STATUS}. Source: ${INTERACTIONS_SOURCE}`, `- Lab dictionary v${LABS_VERSION}: ${LABS_STATUS}`, '',
  '## How the analysis uses these lists', '',
  '- A drug or test **not** in a list is flagged "to check" and is never matched by similarity. A one-letter slip such as "Metformim" stays unknown on purpose.',
  '- A name is matched exactly (ignoring case, spaces and hyphens), after dropping presentation words such as SR, XR, HCl and tablet. Combination products (for example "Telma H") are not split, so they stay unknown.',
  '- Interactions are checked between every pair of known drugs on the merged list (files plus the patient\'s own answers). Each rule names two drugs or drug classes and an effect; the doctor screen shows the effect in English, Hindi or Marathi.',
  '- Allergies the patient reports are matched to a drug by name or by drug class (for example "penicillin" matches amoxicillin). Cross-reactions between classes (for example penicillin and cephalosporins) are **not** modelled.',
  '- Lab values are converted only with the factors in the lab dictionary. An unknown unit is never converted: the result is shown, marked "unit cannot be compared", and left out of the direction of change.',
  '- The lab table says whether a value went up, down or stayed the same. It never says what that means.', '',
  '## Questions for the reviewer', '',
  '1. Which recognised interaction source should replace the starter list (licence, update cycle, Indian brand coverage)?',
  '2. Are any rules below wrong, missing an important pair, or set to the wrong severity?',
  '3. Are the brand names correct and in common use in Indian OPDs? Which common brands are missing?',
  '4. Are the lab unit conversions safe? (Urea and calcium conversions are included; blood urea nitrogen is not.)',
  `5. Name matching for wrong-patient detection: a name matches when at least ${Math.round(ANALYSIS.nameMatchRatio * 100)}% of the shorter name's words appear in the other; an age differs when it is more than ${ANALYSIS.ageToleranceYears} years from the registered date of birth. Are these thresholds acceptable?`, '',
  `## Drug dictionary (${DRUGS.length} generic drugs)`, '', '| Generic name | Classes | Brand names | Other names |', '|---|---|---|---|',
  ...DRUGS.map((d) => `| ${d.generic} | ${d.classes.join(', ')} | ${d.brands.join(', ') || '-'} | ${d.aliases.join(', ') || '-'} |`), '',
  `## Interaction rules (${INTERACTION_RULES.length})`, '', '| Drug or class A | Drug or class B | Severity | Effect shown to the doctor |', '|---|---|---|---|',
  ...INTERACTION_RULES.map((r) => `| ${r.a} | ${r.b} | ${r.severity} | ${r.effect} |`), '',
  `Effects: ${effects.join(', ')}.`, '',
  `## Lab tests (${LAB_TESTS.length})`, '', '| Test | Canonical unit | Other names | Safe unit conversions |', '|---|---|---|---|',
  ...LAB_TESTS.map((l) => `| ${l.canonical} | ${l.unit} | ${l.names.join(', ')} | ${Object.keys(l.convert).join(', ') || 'none'} |`), '',
  '## What the test set produces for interactions and allergies', '',
  'Every row below is checked by an automated test; the reviewer is asked whether each is clinically right.', '',
  '| Test case | Pair | Severity | Effect |', '|---|---|---|---|', ...interactionRows, '',
  `## Test cases (${CASES.length} synthetic multi-file cases)`, '', '| Case | Covers |', '|---|---|', ...CASES.map((c) => `| ${c.id} | ${c.covers.join('; ')} |`), '',
  '## Sign-off log', '', '| Date | Reviewer | Role | Lists reviewed | Decision | Comments and changes made |', '|---|---|---|---|---|---|', '| | | | | | |', '',
];
writeFileSync(path.join(root, 'docs', 'analysis-data-review.md'), out.join('\n'), 'utf8');
console.log(`Wrote docs/analysis-data-review.md (${DRUGS.length} drugs, ${INTERACTION_RULES.length} interaction rules, ${LAB_TESTS.length} lab tests, ${CASES.length} cases)`);
