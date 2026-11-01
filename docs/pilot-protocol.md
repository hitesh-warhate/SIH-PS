# Supervised pilot protocol (DRAFT for the hospital, the ethics committee and the clinical lead)

Status: draft written by the developers. **It has not been reviewed or approved by anyone, and nothing in it may be done with real patients until the approvals in section 2 are in writing.** Numbers marked "proposed" are the developers' suggestions for the people named to decide.

## 1. Purpose

To find out, in one OPD with staff watching, whether patients can give a usable history unaided, whether doctors find the summary useful and safe, and what the success metrics in PRD Section 4.3 actually are. It is not a clinical trial and it must not change any patient's care: the doctor takes the history as usual wherever the summary is missing, wrong or not trusted.

## 2. Before anything starts (all in writing)

| Approval or decision | From | Status |
|---|---|---|
| Ethics approval, or a written waiver, for a service-improvement pilot | Hospital ethics committee | Not requested |
| Hospital management and OPD head agree, and a named clinical lead | Hospital | Not requested |
| Consent notice and patient information sheet in English, Hindi and Marathi, reviewed by legal and by native speakers | Legal or compliance, translators | Not done (`docs/compliance-checklist.md`) |
| Red-flag rules and ontology signed by a clinician | Clinical lead | Not done |
| Independent security test with no open critical or high finding | Security reviewer | Not done |
| Decision on voice recognition leaving the platform (D-01) | Product owner, legal | Not decided |
| Where the pilot database lives, who administers it, backup and retention | Hospital IT | Not decided |
| A named person who can switch the system off at any time, and the fall-back (patients go to the desk as before) | OPD head | Not decided |

## 3. Scope (proposed)

- One OPD, one department, one terminal area and one registration desk, for 2 to 4 weeks.
- 150 to 300 patients and 3 to 6 physicians (proposed; the clinical lead decides). Adults only. Patients under 18 are excluded until the children's data question is settled.
- Patients choose to take part; those who decline use the normal route with no penalty.
- A staff member stays near the terminals as an observer and helper. Every help given is recorded (it counts against "independent completion").
- Real patient data is used only here, only after section 2, and only on the pilot database.

## 4. What is collected

| Source | What | How |
|---|---|---|
| The system | Every metric in `docs/success-metrics.md`: independent completion, median intake time, listening mode, history completeness, physician edit rate, multi-file analysis time, consent integrity | `scripts/metrics.mjs` |
| The observer | Whether help was given, at which screen, why; where the patient hesitated; whether voice recognition worked; the language and listening mode | Observation sheet (`docs/usability-test-plan.md`, appendix) |
| Physicians | After each case (30 seconds): was the history usable when the patient arrived (yes, partly, no); anything wrong or missing; time saved or lost (estimate). At the end: a short interview | Paper or a form |
| Speech and documents | With a separate consent: recorded speech for the word error rate (`docs/asr-data-collection.md`) and the patient's documents for the accuracy test | Separate consent form; the pilot system does not keep audio |
| Problems | Any wrong summary, missed alert, or distress | A log kept by the observer, reviewed daily by the clinical lead |

## 5. Stop rules (proposed)

Stop at once and tell the clinical lead if: a red flag is missed or raised wrongly in a way that could have harmed a patient; a summary states something the patient did not say and the doctor relied on it; a patient's data is seen by someone who should not see it; the system is unavailable for more than an hour in a session; or the ethics committee or the OPD head asks. Review the log before restarting.

## 6. Success measures (proposed; the product owner and clinical lead set the numbers before the pilot starts)

| Measure | Proposed reading |
|---|---|
| Independent completion | Report; decide the acceptable level with the clinical lead beforehand |
| Doctors reporting a usable history on arrival ("Overall" row, Section 19) | Majority of cases and at least a clear majority of physicians |
| No missed red flag | Zero |
| No summary stating a diagnosis | Zero |
| Median intake time | Report; set with clinicians |
| Physician edit rate | Report and track |

## 7. After the pilot

A pilot report with the metrics, observer findings, physician feedback, every incident, and the changes made. Then the acceptance checklist (`docs/acceptance-checklist.md`) is reviewed with the product owner, the clinical lead and the compliance reviewer. Pilot data is kept or deleted as the ethics approval and the hospital's policy decide, and the temporary data rules in `docs/backup-and-retention.md` apply.
