# Cross-document analysis report (Phase 5, first run)

**What this is.** What was built for FR-B8 to FR-B12 and FR-B15, how it was checked, and what has and has not been measured. Everything here uses **synthetic data**. Nothing has been checked by a clinician or pharmacist.

## What the analysis produces

For one encounter the engine (`server/src/analysis/engine.js`) takes every file that has been read, plus the patient's answers about medicines and allergies, and produces five results. They are stored in `analysis_results` as JSONB, one row per encounter and kind.

| Kind | Requirement | What it holds |
|---|---|---|
| `timeline` | FR-B8 | Every file in date order with its source file name, type, diagnoses and procedures written, and counts. A file with no date goes last and is marked "date missing". |
| `med_reconciliation` | FR-B9 | One row per drug: brand and generic names merged, every file and the patient's own answer where it appears, dose and frequency changes (up, down, changed) between dated files, and a drug listed twice on one prescription. |
| `lab_table` | FR-B10 | One row per test: every result with date, unit, reference range, a flag (low, high, in range, no range) and the direction of change from the result before (up, down, unchanged). No interpretation. |
| `interactions` | FR-B11 | Drug pairs from the combined list that match a rule, and drugs that conflict with an allergy the patient reported. Drugs that could not be checked are listed. |
| `consistency` | FR-B12 | Possible wrong-patient file (name, age, sex), conflicts between files, missing or future dates, a patient who reports no medicines while files list some, files that could not be read, duplicate files, unknown drugs and tests, units that cannot be compared. |

The engine is a pure function. The same input gives the same output, and "today" is the visit date it is given, so a result does not change because the clock moved.

## How a re-run is triggered

The analysis is rebuilt, after a short delay that merges bursts of changes, when:

- a file is added, removed, replaced (retaken) or reordered,
- a file finishes being read (or is given up on),
- the patient changes a medicine or allergy answer (including a follow-up answer removed because an earlier answer changed),
- the doctor presses "Run the analysis again".

Each run stores a hash of its input. If nothing changed, nothing is rewritten and the run is logged as `unchanged`. Every run is logged in `analysis_runs`, which is where the timings below come from.

## What is never guessed

- A drug or test that is not in the dictionary is shown as it was written, flagged "to check", and left out of interaction and allergy checks (it appears under "not checked"). There is no fuzzy matching: `Metformim` stays unknown, and a combination product such as `Telma H` is not turned into telmisartan.
- A unit is converted only with a factor in `server/config/labs.v1.js` (for example mmol/L to mg/dL for glucose). An unknown unit is shown, marked "unit cannot be compared", and left out of the direction of change.
- A lab flag that rests on a value or range the reader was unsure of (a lost decimal point, say) is shown as "to check" and is not counted as out of range.
- A name written in Devanagari is not compared with a registered name in Latin letters (and the reverse): the result is "not comparable", not a mismatch.

## Wrong-patient detection

Per file, the name, age and sex written on the document are compared with the registered patient (the extractor now reads these fields from the usual header layouts in English, Hindi and Marathi).

- **name**: differs when none of the shorter name's words appear in the other; initials, word order and one-letter slips are allowed; "partly matches" when under 67% of the words match.
- **age**: differs when more than 3 years from the age worked out from the registered date of birth at the document's date.
- **sex**: differs when both are known and unequal.

Two or more strong signals give "high" (needs attention). One strong signal gives "possible" (check). A partial name alone gives "low" (for information). These thresholds are judgement calls in `server/src/analysis/config.js`. They have only been tried on invented cases; they must be tuned on real documents.

## Checks that ran

| Check | Result |
|---|---|
| 13 synthetic multi-file cases (`server/test/fixtures/analysis-cases.js`) cover brand and generic duplicates, a dose change, rising and falling labs, a lab with no range, a wrong-patient file, conflicting data, a missing date, a patient reporting no medicines, interactions and an allergy, unknown drug and test, unit conversion, duplicate files, and an empty encounter | 13/13 pass |
| Same input gives the same output | Pass for every case |
| Lab table contains no interpretation wording (searched for improving, worsening, stable, abnormal, risk and similar) | Pass for every case |
| All five kinds stored once per encounter and reload identically; a forced re-run stores the same payload | Pass |
| Add, reorder and remove a file each re-run with the right result; medicine and allergy answers re-run | Pass |
| Nothing from the analysis in Patient-portal responses; a patient or staff session cannot read the doctor routes | Pass |
| Document links: one FHIR `DocumentReference` per file, no identifier values copied | Pass |
| A file that cannot be read does not stop the analysis and is reported | Pass |
| Full suite, including real Tesseract OCR | 131 server tests and 30 web tests pass; lint clean; build passes |

## Time from upload complete to analysis ready (DoD item 7)

"Upload complete" is when the last file was received. "Analysis ready" is when all five results were stored. The time includes reading (OCR) the files that were still being read.

| Set | Real Tesseract OCR (2 workers, models loaded) | Fake OCR engine (test suite) |
|---|---|---|
| 5 files | median 1.21 s, max 1.24 s (3 runs) | 0.14 s |
| 15 files | median 3.23 s, max 3.35 s (3 runs) | 0.31 s |

- The analysis itself takes 2 to 3 ms; almost all of the wait is OCR.
- The first OCR use in a fresh process took 16.5 s (loading the three language models). A deployment should load them at start-up.
- Run on one development laptop, synthetic printed and scan-like images, one patient at a time. This is not a pilot figure. Reproduce with `node --env-file=.env scripts/benchmark-analysis.mjs` from `server/`. The PRD does not set a target for this metric yet; it should be agreed in Phase 9.

## What the real run showed

A demo patient (synthetic) with five files was read by real OCR and viewed on the doctor screen:

- Brand and generic names merged (Brufen answered by the patient became ibuprofen); warfarin with azithromycin and warfarin with ibuprofen were flagged; the patient's penicillin allergy matched none of the listed drugs, which is correct.
- Two lab values from the poor scan lost a decimal point in the reference range (platelets "1.5 - 4.5" read as "15 - 45", TSH "0.4 - 4.0" as "4 - 4"). They were shown "to check" and not counted as out of range. This is the Phase 4 limitation, now visible to the doctor instead of silently wrong.

## Known gaps

- **The reference lists are unreviewed drafts.** The drug dictionary (62 drugs), interaction list (34 rules) and lab dictionary (23 tests) were written by the developers. The PRD asks for a recognised interaction source chosen with a clinician or pharmacist; **this starter list is not one.** Definition of Done item 4 stays open until a reviewer signs `docs/analysis-data-review.md`.
- Cross-reactions between allergy classes (penicillin and cephalosporins, for example) are not modelled.
- Medicines the patient types in are matched by name only; a misspelling stays unknown.
- Reading name, age and sex from a document depends on OCR of the header lines. Real letterheads vary widely and have not been tested; handwriting is untested.
- Dose-change detection compares doses and daily frequency between dated files. It does not know which prescription is current, and says so by listing every file.
- The doctor screen is a first version of the Phase 6 workspace: it lists the five results and the links but has no side-by-side view of the original scan yet.
- The FHIR `DocumentReference` is built and stored; pushing it to ABHA or a hospital system is Phase 8 and needs the ABDM sandbox.
