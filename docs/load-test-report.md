# Load test report (Phase 9, first run)

Run on 2026-11-01 with `node --env-file=.env scripts/load-test.mjs <terminals> <files> <poolMax> <emergencyShare>`.

## What was simulated

Each "terminal" is one patient running the whole journey at the same moment as all the others: verify mobile, register, consent, answer the interview (about 14 questions after the emergency screen and complaint), upload 4 files, submit. 10% of terminals answer the emergency screen with chest pain. A staff screen and a doctor screen listen to the real alert stream, and 30 doctors open ready cases at the end. Targets in PRD Section 10: hospitals with **4,000 to 10,000 OPD patients a day** with many simultaneous terminals and multi-file uploads. A ten-hour day at 10,000 patients is about 1,000 an hour; a morning peak may be two to three times that.

## Results

| Terminals at once | DB pool | Journeys finished | Errors | Answer p50 / p95 | Upload p95 | Submit p50 / p95 | Red-flag alert, staff and doctor p50 / p95 | Analysis ready, median / max |
|---|---|---|---|---|---|---|---|---|
| 20 | 10 | 20 of 20 | 0 | 45 / 107 ms | 180 ms | 322 / 456 ms | 119 / 168 ms | 1.5 / 1.8 s |
| 50 | 10 | 50 of 50 | 0 | 93 / 144 ms | 340 ms | 473 / 619 ms | 177 / 248 ms | 4.9 / 5.4 s |
| 100 | 10 | 100 of 100 | 0 | 153 / 307 ms | 467 ms | 686 / 805 ms | 400 / 614 ms | 9.4 / 10.5 s |
| 100 | 25 | 100 of 100 | 0 | 172 / 268 ms | 550 ms | 829 / 1,099 ms | 370 / 479 ms | 9.5 / 10.9 s |
| 200 | 25 | 200 of 200 | 0 | 311 / 494 ms | 952 ms | 1,249 / 1,407 ms | 974 / 1,134 ms | 18.7 / 21.7 s |

The 200-terminal run completed 200 journeys in 18.6 s, which is the same as roughly 38,000 journeys an hour at that rate. Event-loop delay stayed under 25 ms at the 99th percentile in every run. Database connections were fully used and requests queued for one (the "pool waiting" figure reached 355 at 200 terminals).

## What this shows

- **Nothing failed.** No errors, no lost alerts (every emergency reached both screens), no incomplete journeys, up to 200 patients starting at the same instant.
- **Red-flag latency grows with the number of simultaneous patients**, from about 0.2 s at 50 to about 1 s at 200. All of it is queueing for the server; the alert itself is a single insert and a push.
- **The multi-file analysis wait grows almost linearly with the burst** (about 0.1 s per patient in the burst). With files read instantly this is the cost of the analysis, the database queue and the audit writes together; a patient who arrives when the system is not saturated waits 1.5 s or less. **With real document reading the wait will be much longer**: Phase 5 measured about 4.7 files a second with real OCR and two workers, so 200 patients with 4 files each (800 files) would take about three minutes to read on one server. Reading, not the analysis, is the scaling limit.
- A larger database pool did not help here: with the clients, the server and PostgreSQL all on one laptop the processor is the limit.

## Limits of this test

- Clients, server and database ran on one machine, so the clients competed with the server for the processor. Treat the figures as pessimistic for the server and optimistic for the network.
- Files were read by a stand-in engine, not Tesseract. Real reading is measured separately (`scripts/benchmark-analysis.mjs`).
- All patients arrived in one burst. A real morning ramps up over hours.
- One server process. Scaling out (several API processes, a shared job queue, a shared limiter) is Phase 10 and was not tested.
- Synthetic data, no network latency, no real browsers, no speech recognition.
- The result says nothing about the hospital's own network or its hospital-system endpoint.

## Proposed targets (for the product owner and clinical lead to agree)

The PRD says these are set after benchmarking. These are proposals only:

| Metric | Proposed target | Measured today |
|---|---|---|
| Red-flag alert reaching staff and doctor screens | p95 of 2 s or less with 200 patients answering at once; 3 s as an upper bound at any load | p95 1.1 s at 200 |
| Interview answer round trip | p95 of 500 ms or less at 100 simultaneous patients | p95 307 ms at 100 |
| Requests failing | 0 | 0 |
| Analysis ready after the last upload (files already read) | p95 of 10 s at 100 simultaneous patients | max 10.5 s at 100 (at the limit) |
| Time to read a file (real OCR) | to be set when the production OCR engine is chosen; at least keep up with the arrival rate | about 4.7 files a second per server (synthetic) |

## Gaps and follow-up

- Repeat on a separate client machine and on the production-like database host.
- Load-test the real OCR path with the target number of workers, and choose how many reading workers a hospital needs (800 files in 3 minutes is probably too slow for a morning rush).
- Test the doctor screens' queue and summary reads with several thousand cases in the day's queue.
- Test a long run (several hours) for memory growth and connection leaks.
