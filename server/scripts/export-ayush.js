// Generates docs/ayush-content-review.md: the AYUSH question set for AYUSH clinician review and sign-off (Phase 7 Definition of Done, item 2).
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  AYUSH_OBSERVED, AYUSH_QUESTIONS, AYUSH_SECTIONS, AYUSH_STATUS, AYUSH_VERSION, DASHAVIDHA, OTHER_TOPICS, VAYA,
} from '../config/ayush.v1.js';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const covered = (p) => AYUSH_QUESTIONS.some((x) => x.parameter === p) ? 'asked of the patient' : AYUSH_OBSERVED.some((o) => o.parameter === p) ? 'to be observed by the physician' : p === 'vaya' ? 'worked out from the registered age' : 'NOT COVERED';

const out = [
  `# AYUSH question set v${AYUSH_VERSION}: clinician review and sign-off`, '',
  'Generated from `server/config/ayush.v1.js` by `node server/scripts/export-ayush.js`. Do not edit by hand.', '',
  `**Status:** ${AYUSH_STATUS}. **No AYUSH clinician has reviewed any of this.** The questions were written by the developers from the PRD's list of parameters. The clinician decides the wording, the options, and which parameters the patient can report and which need the physician's own observation. Hindi and Marathi are also drafts awaiting native-speaker review.`, '',
  '## What the system does with these answers', '',
  '- AYUSH mode adds these questions after the standard ones. It is on when the encounter\'s department is an AYUSH department, and staff can switch it on or off for one patient. (That switch is the developers\' assumption to confirm with the clinical team.)',
  '- The patient\'s answers are recorded as the patient\'s own description, for the physician to confirm. **Options never name a dosha or state an assessment.** The summary says what the patient reported and what the physician must observe; it assesses nothing.',
  '- Every listening mode works as in the standard interview: voice or touch, read-back for critical answers, red-flag checks, skip (recorded as "not answered", never "no").',
  '- Answers are kept if the mode is switched off and on again; the interview resumes at the first unanswered question. The patient can save and continue later.', '',
  '## Questions for the reviewer', '',
  '1. Are the three groups right: **asked** (Prakriti, Vikriti, Satmya, Sattva, Ahara Shakti, Vyayama Shakti, Ahara-Vihara, Agni, Koshtha, Nidana, Samprapti account), **observed** (Sara, Samhanana, Pramana, the Samprapti assessment) and **derived** (Vaya from age)?',
  '2. Are the plain-language options a fair description of each tendency? Would a patient understand them without training? Are any missing or leading?',
  '3. Is it acceptable that Prakriti is captured from five self-report questions, as a note for the physician to confirm?',
  '4. Is the length acceptable (28 questions after the standard interview)? Which could be dropped?',
  '5. Are other systems in scope (Yoga, Unani, Siddha, Homeopathy)? The requirements list only Ayurvedic parameters.',
  '6. Should AYUSH mode follow the department, as built, or be chosen some other way?', '',
  '## Coverage of the required parameters', '', '| Parameter | How it is handled |', '|---|---|',
  ...[...DASHAVIDHA, ...OTHER_TOPICS].map((p) => `| ${p} | ${covered(p)} |`), '',
  '## Questions', '',
  ...AYUSH_SECTIONS.flatMap(([id, title]) => [
    `### ${title[0]}`, '', `Hindi: ${title[1]}  `, `Marathi: ${title[2]}`, '',
    '| Key | Parameter | Type | English | Options (English) | Hindi | Marathi |', '|---|---|---|---|---|---|---|',
    ...AYUSH_QUESTIONS.filter((x) => x.section === id).map((x) => `| \`${x.key}\` | ${x.parameter} | ${x.type}${x.min != null ? ` ${x.min} to ${x.max}` : ''} | ${x.text[0]} | ${(x.options ?? []).map((o) => o.label[0]).join('; ') || '-'} | ${x.text[1]} | ${x.text[2]} |`), '',
  ]),
  '### Option wording in Hindi and Marathi', '', '| Question | Option (English) | Hindi | Marathi |', '|---|---|---|---|',
  ...AYUSH_QUESTIONS.flatMap((x) => (x.options ?? []).filter((o) => !['yes', 'no', 'none'].includes(o.value)).map((o) => `| \`${x.key}\` | ${o.label[0]} | ${o.label[1]} | ${o.label[2]} |`)), '',
  '## Items for the physician to observe (never filled in by the system)', '', '| Parameter | English | Hindi | Marathi |', '|---|---|---|---|',
  ...AYUSH_OBSERVED.map((o) => `| ${o.parameter} | ${o.title[0]} | ${o.title[1]} | ${o.title[2]} |`), '',
  '## Vaya (worked out from the registered age)', '', '| Age | Shown as |', '|---|---|', `| under 16 | ${VAYA.bala[0]} |`, `| 16 to 60 | ${VAYA.madhya[0]} |`, `| over 60 | ${VAYA.jeerna[0]} |`, '',
  '## Sign-off log', '', '| Date | Reviewer | Qualification | Decision | Changes made |', '|---|---|---|---|---|', '| | | | | |', '',
];
writeFileSync(path.join(root, 'docs', 'ayush-content-review.md'), out.join('\n'), 'utf8');
console.log(`Wrote docs/ayush-content-review.md (${AYUSH_QUESTIONS.length} questions, ${AYUSH_OBSERVED.length} observed items)`);
