# Acceptance checklist (PRD Section 19), with evidence

Written 2026-11-01 by the developers. **Nobody has signed it.** Each row says what the evidence is, and what is still missing. The status words are: **Met** (evidence exists for every clause), **Partly** (some clauses have evidence, the rest are listed), **Not met**.

| Area | Status | Evidence | What is missing |
|---|---|---|---|
| **Registration** | Partly | `phase1.test.js`, `e2e.test.js`: register by touch or voice answer in each language, OTP verification, PatientCase ID, a likely duplicate caught (409) before a new record | OTP is a mock provider (Q11). "Unaided by voice" was never tried with a real person or real speech. ABHA and Aadhaar checks are stubs |
| **Portals** | Met (builder evidence) | `security.test.js`: every staff, doctor and patient route against every other role; `summary.test.js`, `analysis-service.test.js`: the patient never sees analysis | Independent penetration test (`docs/security-report.md`) |
| **Module A** (interview) | Partly | `interview.test.js`, `bank.test.js`, `e2e.test.js`: voice or touch answers in three languages and three modes, mode applies to follow-ups, follow-ups follow the complaint, emergency answers alert staff and doctor, all listed Dashavidha parameters captured (`ayush.test.js`) | No new patient has completed it with no training (no usability test). No real speech recognition. The ontology, red-flag rules and AYUSH wording are unreviewed by clinicians |
| **Module B** (documents) | Partly | `documents-*.test.js`, `analysis-*.test.js`, OCR report: several files with per-file status, digitized, diagnoses, medicines with doses, labs with ranges and procedures extracted, one timeline, reconciliation, a lab table with direction, interactions and consistency flags, low-confidence items marked | Real prescriptions and real handwriting untested. Scanned PDFs not read. The interaction list is an unreviewed draft, not a recognised source |
| **Module C** (summary) | Partly | `summary.test.js`: one summary in the standard order from the interview and every file, accept, amend or reject, three languages, no diagnostic wording by automated scan | Audio confirmation not listened to and needs device voices. No clinician has read a sample for diagnostic wording |
| **Doctor dashboard** | Partly | `summary.test.js` and browser checks: priority queue, alert banner, split view, warning chips, accept, amend and reject, search, filter, print and text export | No clinician has used it; print not exercised; "export" is text download only (HIS push is under Module D) |
| **Module D** (consent, ABDM) | Not met | Consent is granular and revocable and enforced before every push (`integration.test.js`, `compliance.test.js`); temporary data is cleared after submission (`compliance.test.js`) | ABHA, Aadhaar and mobile OTP authentication are stubs. Data reaches only a local stand-in for the HIS and a stub for the ABHA PHR; nothing was tested against the ABDM sandbox or a real HIS. Consent audio uses browser speech. Voice may leave the platform |
| **Database** | Partly | Versioned migrations (9), field encryption (`compliance.test.js`), append-only partitioned audit log, tested restore (`docs/backup-and-retention.md`), purge job | Point-in-time recovery is not configured; encryption at rest and TLS are deployment duties |
| **Compliance** | Not met | `docs/compliance-checklist.md` drafted | No legal or compliance review; several decisions open (retention, breach, children, erasure terms); ABDM consent framework not integrated |
| **Overall** | Not met | None | The full journey has never been run with real patients, so "minimal staff assistance" and "the physician reports a usable history" are unproven |

## Phase 9 Definition of Done, status

| # | Item | Status | Where |
|---|---|---|---|
| 1 | Every Section 19 criterion checked with evidence | In progress: this table; four rows are Not met or have large gaps | this file |
| 2 | Every Section 4.3 metric has a measured value and an agreed target | Not met: 8 of 11 have no real value, none has an agreed target | `docs/success-metrics.md` |
| 3 | End-to-end tests pass in all three languages and all three listening modes | Met (API level, 9 combinations). Not run through the browser screens | `e2e.test.js` |
| 4 | Word error rate and OCR accuracy reported and meeting thresholds | Not met: no recordings; OCR synthetic only; no thresholds agreed | `docs/ocr-accuracy-report.md` |
| 5 | Usability testing in each language | Not done | `docs/usability-test-plan.md` |
| 6 | Load test results meet targets or the gap is recorded | Partly: results recorded, targets proposed and not agreed, real OCR throughput identified as the limit | `docs/load-test-report.md` |
| 7 | Clinicians signed ontology, icons, red flags; AYUSH clinician confirmed | Not done | review documents listed in `docs/test-plan.md` |
| 8 | Supervised pilot complete | Not started | `docs/pilot-protocol.md` |
| 9 | No Severity 1 or 2 defect open | **Not met:** open Sev 2 items listed | `docs/defect-register.md` |
| 10 | Product owner, clinical lead and compliance reviewer have signed | Not signed | below |

## Sign-off

| Role | Name | Date | Decision (accept, accept with conditions, reject) | Conditions |
|---|---|---|---|---|
| Product owner | | | | |
| Clinical lead | | | | |
| AYUSH clinical lead | | | | |
| Compliance reviewer | | | | |
| Security reviewer | | | | |
