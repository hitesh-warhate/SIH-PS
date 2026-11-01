# Defect and risk register (Phase 9)

Triage on 2026-11-01 by the developers. Severity: **1** blocks use or endangers a patient; **2** breaks a required behaviour or a promise the product makes, or exposes data; **3** a workaround exists; **4** cosmetic. Phase 9's rule is that no Severity 1 or 2 item may be open at acceptance. Several of the items below are not code defects but a missing decision or approval; they are listed because they stop acceptance all the same.

## Open, Severity 2 (acceptance is blocked)

| ID | Item | Why it is Sev 2 | What closes it |
|---|---|---|---|
| D-01 | Voice recognition in the browser can send audio to the browser vendor (`docs/data-flow.md`) | Breaks FR-D6 (voice processed inside the platform) and the consent promise | Decision (Q9): an on-premises speech service, or a consent notice that says so and legal approval |
| D-02 | Red-flag rules, ontology and icon labels have no clinician sign-off | The rules decide who is alerted; a gap could miss an emergency | Clinician review of `docs/redflag-rules-review.md` and `docs/clinical-review-ontology.md` |
| D-03 | Drug dictionary and interaction list are developer drafts, and the interaction list is not a recognised source | A missing or wrong interaction could mislead a doctor | Choose a source; pharmacist review of `docs/analysis-data-review.md` |
| D-04 | Real handwritten prescriptions, the biggest accuracy risk, have never been read | Wrong medicines or doses reach the summary (mitigated: low confidence is flagged, but untested) | Realistic handwritten test set and agreed accuracy thresholds |
| D-06 | No independent penetration test | Required by Phase 8 | Independent tester (`docs/security-report.md`) |
| D-07 | The ABHA and Aadhaar checks, the OTP provider, and the ABDM push are stubs | Module D's central promise is untested | ABDM sandbox access (Phase 0 external action) and an OTP vendor (Q11) |
| D-08 | No legal or compliance review; erasure, retention, breach and children's data undecided | Breaks the Compliance acceptance row | `docs/compliance-checklist.md` reviewed and decided |

## Open, Severity 3

| ID | Item | Notes |
|---|---|---|
| D-09 | Row-level security is not used by the running application | The API enforces the same rule; defence in depth only until wired in |
| D-10 | Scanned (picture-only) PDFs are not read | The patient is asked for a photo |
| D-11 | A Phase 4 retry test failed once in several full runs and did not repeat in about 20 isolated and loaded runs | Probably a timing race in the job-queue test; not reproduced under CPU load in this phase either |
| D-12 | The audio confirmation and print were never exercised in a real browser with a device voice or a printer | Written, not verified |
| D-13 | A rotated photo (rotation stored in its metadata) may get its highlight in the wrong place | Doctor scan view |
| D-14 | One-patient-at-a-time OCR throughput of about 4.7 files a second; 800 files take about 3 minutes | Needs more workers for a morning rush |
| D-15 | The sign-in limiter and the SSE hub are in process memory | Needs a shared store before several servers run |
| D-16 | Hindi and Marathi wording is a developer draft everywhere (screens, summaries, AYUSH, consent) | Native-speaker and clinician review |
| D-17 | The department that decides AYUSH mode is not assigned to patients anywhere; staff switch it per patient | Assumption to confirm |
| D-18 | Doctor routing is by department only; there is no assignment of a patient to a named doctor | Phase 3 decision still open |
| D-19 | 6 moderate findings in development dependencies (ESLint chain), none in production dependencies | Not shipped |

## Closed during Phase 9

| ID | Item | Fix |
|---|---|---|
| D-20 | (Phase 8) A NUL character in a request produced a 500 | Refused with 400 before any query |
| D-21 | The dependency scan was not in CI | `npm audit --omit=dev` added to `.github/workflows/ci.yml` |
| D-22 | No way to read the success metrics from the system | `src/metrics.js` and `scripts/metrics.mjs`, tested in `e2e.test.js` |

| D-05 | (Phase 8) Logging out did not revoke the session token | Fixed in Phase 10: a session epoch ends every session of an account on logout, disabling, or a password or second-factor reset (`admin.test.js`) |

## Risks to watch (not defects)

Ethics and hospital approval lead time; recruitment of elderly and low-literacy participants in three languages; AYUSH clinician availability; the ABDM sandbox application; the number of reading workers a hospital needs; and the interview length for AYUSH patients (28 more questions).
