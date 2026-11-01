# Test plan and results (Phase 9)

## Levels and what exists

| Level | What runs | Count (2026-11-01) | In CI |
|---|---|---|---|
| Unit | Question bank, dialogue rules, red-flag rules, normalisers, analysis engine (13 synthetic multi-file cases), summary generator and the no-diagnosis scan, FHIR checker, TOTP, extraction rules, job queue | part of 193 server tests | Yes |
| Integration (API and database) | Every route, role boundary, consent, documents with a stand-in reader, analysis, summary decisions, delivery to a local HTTP stand-in, purge and revocation, audit log, row-level security as a database role | part of 193 | Yes |
| Real document reading | Tesseract over 17 synthetic documents in three languages (`documents-ocr.test.js`) | 5 | Yes, but needs the language data download |
| End to end | The whole journey through the HTTP API for every language and every listening mode (9 runs), a duplicate caught at registration, an emergency alert reaching staff and doctor, and the success metrics | 12 (`e2e.test.js`) | Yes |
| Web | Translations in step across three languages, speech adapter, matching, word error rate code, alert state, design rules | 30 | Yes |
| Load | `scripts/load-test.mjs` (20 to 200 simultaneous terminals) | on demand | No |
| Real-OCR timing | `scripts/benchmark-analysis.mjs` | on demand | No |
| Backup and restore | `scripts/backup-restore-test.mjs` | on demand | No |
| Static checks | ESLint; `npm audit --omit=dev` | every push (the audit step was added, never run on a remote) | Yes |

**CI has never run on a remote**, because there is no remote repository yet. The workflow file is checked in; whether it passes there is unknown.

## Gaps in automated testing

- **No browser automation.** No test drives the React screens. The screens were checked by hand in the in-app browser during each phase (patient flow, upload, staff queue and deliveries, doctor workspace, AYUSH summary). A browser tool such as Playwright, with fake audio and camera input, is the next step.
- **No real speech.** Recognition and read-aloud depend on the browser and the device. The end-to-end tests submit answers with a modality of "voice" and a transcript; they do not recognise any sound.
- **No real device matrix.** No touch terminal, low-end phone or scanner was used.
- **No accessibility audit** with assistive technology or a checker beyond the design rules in `web/test/design.test.js`.
- **No chaos or long-run test** (a database restart mid-journey, a three-hour soak).

## Evaluations that need people (not done)

| Evaluation | Plan | Status |
|---|---|---|
| Speech word error rate, per language, quiet and noisy | `docs/asr-data-collection.md` | No recordings; harness only |
| OCR on a realistic set, printed and handwritten | Collect consented real or realistic documents, 30 or more per language and type, run `scripts/benchmark-ocr.mjs` | Synthetic only |
| Usability with elderly and low-literacy users in each language | `docs/usability-test-plan.md` | Not run |
| Clinical review of the ontology, icon labels, red-flag rules and AYUSH content | Generated review documents: `docs/clinical-review-ontology.md`, `docs/redflag-rules-review.md`, `docs/ayush-content-review.md`, `docs/analysis-data-review.md` | No reviewer has signed anything |
| Supervised pilot | `docs/pilot-protocol.md` | Not started; needs ethics and hospital approval |
| Independent security test | `docs/security-report.md` lists what it must cover | Not done |
| Legal and compliance review | `docs/compliance-checklist.md` | Not done |

## Defects

See `docs/defect-register.md`.

## Exit rule proposed for the pilot

Start only when: the ethics or hospital approval is in writing; the red-flag rules and the ontology have a clinician's signature; the independent security test has no open critical or high finding; the consent notice has been through legal review; and a rollback (the patient simply goes to the desk, the doctor takes the history as before) has been agreed with the OPD.
