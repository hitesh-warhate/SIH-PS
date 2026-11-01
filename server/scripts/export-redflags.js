// Generates docs/redflag-rules-review.md: the rules and scenarios for clinician review and sign-off (Phase 3 DoD, repeated in Phase 9).
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { RULES, RULESET_STATUS, RULESET_VERSION } from '../config/redflag-rules.v1.js';
import { SCENARIOS } from '../test/scenarios.js';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const cond = (w) => (w.all ? w.all.map(cond).join(' AND ') : w.any ? w.any.map(cond).join(' OR ')
  : `${w.key} ${w.skipped ? 'was skipped' : 'eq' in w ? `= ${w.eq}` : 'in' in w ? `in [${w.in.join(', ')}]` : 'includes' in w ? `includes ${w.includes}` : `>= ${w.gte}`}`);
const show = (answers) => Object.entries(answers).map(([k, v]) => `${k}=${v === 'SKIP' ? 'skipped' : JSON.stringify(v)}`).join(', ');

const out = [
  `# Red-flag rules v${RULESET_VERSION}: clinician review and sign-off`, '',
  'Generated from `server/config/redflag-rules.v1.js` and `server/test/scenarios.js` by `node server/scripts/export-redflags.js`. Do not edit by hand.', '',
  `**Status:** ${RULESET_STATUS}. The rules were written by the developers from the PRD examples and general emergency teaching. **No clinician has reviewed them.** Missing a real emergency is the most serious failure in the product, so please check for gaps first, then for rules that would cause alert fatigue.`, '',
  '## What the system does', '',
  '- After every saved answer the rules are checked against everything answered so far. A matching rule raises one alert per encounter (the same rule never raises twice).',
  '- Staff and the doctor see the alert at once, with the answers that triggered it. The patient sees only "Please wait. Staff will be with you shortly."',
  '- **emergency** alerts sort first; **attention** alerts (a safety question left unanswered, or the worst level of pain) sort after them.',
  '- A skipped safety question is treated as a reason for staff attention, never as "no".', '',
  '## Questions for the reviewer', '',
  '1. Which emergency presentations are missing (for example severe breathlessness alone, suspected sepsis, severe abdominal pain with vomiting, pregnancy-related bleeding, self-harm, child-specific signs)?',
  '2. Is "chest pain with sweating" correct as an emergency alert on its own? Should nausea or radiation to the arm count?',
  '3. Should back pain with leg numbness or weakness (without bladder trouble) raise an attention alert?',
  '4. Should fever with rash, or fever with a very high temperature, alert?',
  '5. Is a pain score of 9 or 10 the right threshold for an attention alert? Is 8 or more with sudden headache right for the "thunderclap" rule?',
  '6. Are the must-not-alert scenarios below truly safe not to alert on?', '',
  '## Rules', '', '| Rule | Version | Level | Reason (English) | Raised when |', '|---|---|---|---|---|',
  ...RULES.map((r) => `| \`${r.id}\` | ${r.version} | ${r.level} | ${r.reason[0]} | ${cond(r.when)} |`), '',
  '### Reason text in Hindi and Marathi (draft, pending native-speaker review)', '', '| Rule | Hindi | Marathi |', '|---|---|---|',
  ...RULES.map((r) => `| \`${r.id}\` | ${r.reason[1]} | ${r.reason[2]} |`), '',
  '## Scenarios the test suite runs on every change', '',
  '### Must alert', '', '| Scenario | Answers | Rules that must fire |', '|---|---|---|',
  ...SCENARIOS.filter((s) => s.mustAlert).map((s) => `| ${s.name} | ${show(s.answers)} | ${s.mustAlert.join(', ')} |`), '',
  '### Must not alert', '', '| Scenario | Answers |', '|---|---|',
  ...SCENARIOS.filter((s) => s.mustNot).map((s) => `| ${s.name} | ${show(s.answers) || '(nothing answered)'} |`), '',
  '## Sign-off log', '', '| Date | Reviewer | Role | Decision | Comments and changes made |', '|---|---|---|---|---|', '| | | | | |', '',
];
writeFileSync(path.join(root, 'docs', 'redflag-rules-review.md'), out.join('\n'), 'utf8');
console.log(`Wrote docs/redflag-rules-review.md (${RULES.length} rules, ${SCENARIOS.length} scenarios)`);
