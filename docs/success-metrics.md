# Success metrics (PRD Section 4.3), measured values and who sets each target

Written 2026-11-01. **No pilot has been run**, so every row that needs real patients, real speech or real documents is still empty. Rows that have a number say where it comes from and how far it can be trusted. Targets are marked "set after pilot" in the PRD; this table says who should set each one.

`node --env-file=.env scripts/metrics.mjs [since] [until]` computes the system-recorded rows from the database. It was checked on synthetic journeys (`e2e.test.js`); it has not been used on pilot data.

| Metric | Measured value | Source and limits | Target | Who sets it, and when |
|---|---|---|---|---|
| Independent completion rate | **Not measured** (tooling ready) | Counted from sessions that submitted with no help request and no staff registration. Needs pilot patients | Clear majority; number open | Product owner and clinical lead, after the pilot |
| Self-registration completion rate | **Not measured** | Registrations by route are counted; there is no denominator, because an abandoned registration leaves no record. Needs the usability test (observed starts and finishes) | Open | Product owner, after the usability test |
| Median intake time | **Not measured** (tooling ready). An automated journey takes under a second, which means nothing | Consent to submission; the language screen is not recorded so this starts slightly late | Set with clinicians | Clinical lead, after the pilot |
| Listening-mode usage | **Not measured** (tooling ready) | The mode the patient chose | Tracked, no target | n/a |
| ASR word error rate, per language | **Not measured.** No recordings exist | Harness: `web/scripts/benchmark-wer.js`. Protocol: `docs/asr-data-collection.md` | Per language, after benchmarking | Clinical lead and product owner, after the benchmark |
| OCR field accuracy | **Synthetic only:** printed 100% on every field; scan-like 67% to 100% by field; handwriting-style font 0 of 2 medications; overall dates 100%, diagnoses 92%, medications 89%, lab values 92% (17 invented documents, real Tesseract, 2026-11-01) | `docs/ocr-accuracy-report.md`. Real prescriptions and real handwriting untested | Per document type, after benchmarking | Clinical lead, after a realistic test set exists |
| Multi-file analysis time | **Median 1.2 s (5 files) and 3.2 s (15 files)** after the last upload with real OCR, one patient at a time; **median 9.4 s, max 10.5 s with 100 patients at once** (files read instantly) | `docs/analysis-report.md`, `docs/load-test-report.md`. Laptop, synthetic | Proposed: p95 of 10 s at 100 simultaneous patients | Product owner, with the load test |
| History completeness | **Not measured** (tooling ready) | Share of reachable questions answered and of the seven standard sections with an answer | Per specialty | Clinical lead, per specialty |
| Physician edit rate | **Not measured** (tooling ready) | Summaries amended or rejected, and the share of items edited | Track and reduce | Clinical lead |
| Red-flag alert latency | **Median 0.18 s, p95 0.25 s with 50 patients at once; p95 1.1 s with 200 at once** (real alert stream, stand-in screens, one machine) | `docs/load-test-report.md`. Real screens and networks untested | Proposed: p95 2 s or less at 200 patients | Clinical lead and product owner |
| Consent integrity | **100% on synthetic journeys** (consent recorded before the first answer or file, in every automated journey) | Computed from the audit log. Pilot data needed to mean anything | 100% | Fixed by the PRD |

## Reading this table

Eight of the eleven metrics have no real-world value yet, because they need people. That is expected before a pilot, and it is why Phase 9 is not complete. The numbers that exist describe how fast the software is on a laptop with invented patients. They do not say whether elderly patients can complete the interview, whether recognition works in a noisy ward, or whether doctors find the summary useful.
