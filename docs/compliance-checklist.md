# Consent and DPDP Act 2023 checklist (Phase 8, FR-D8, FR-D9)

**This is not legal advice and has not been reviewed.** It is a working checklist written by the developers to give a legal or compliance reviewer something concrete to check. Phase 8 Definition of Done item 9 needs a named reviewer, a date and the findings below filled in. Nothing here claims compliance.

Status words: **Built** (the code does it and a test checks it), **Partly** (some of it), **Not built**, **Decision needed** (a person must decide).

| # | Topic | What the product does today | Status | Evidence | Reviewer finding |
|---|---|---|---|---|---|
| 1 | Notice and consent before any data is collected | Registration and consent come first; a patient who declines the history purpose ends the session with nothing clinical stored | Built | `phase1.test.js` | |
| 2 | Consent is specific and granular | Four purposes (history, documents, sharing with the hospital system, ABHA linking) are asked separately | Built | `phase1.test.js` | |
| 3 | Consent text is clear, in the patient's language, with audio | Screens in English, Hindi and Marathi with audio; Hindi and Marathi wording is a developer draft | Partly | web `design.test.js` | Native-speaker and legal review of the wording |
| 4 | Consent can be withdrawn as easily as it was given | One call revokes any purpose or all; the session ends if history is withdrawn | Built | `compliance.test.js` | |
| 5 | What happens on withdrawal | Before the doctor confirms: the answers or the files and their analysis are deleted and the event logged. After confirmation: the confirmed clinical record is kept and the log says so. A delivery still waiting is cancelled. A delivery already made cannot be recalled by this system | Built, **terms assumed** | `compliance.test.js` | **Decision needed:** are these the right terms for erasure versus the hospital's duty to keep records? |
| 6 | Purpose limitation | A purpose without consent is never sent (`not_sent` is recorded and audited) | Built | `integration.test.js` | |
| 7 | Data minimisation | Only the answers needed for the summary are asked; the FHIR bundle carries the ABHA identifier only with ABHA consent; raw voice transcripts are removed after submission | Built | `compliance.test.js`, `integration.test.js` | Is the question set proportionate? |
| 8 | Accuracy | The patient reviews answers; the doctor confirms or amends the summary | Built | `summary.test.js` | |
| 9 | Storage limitation and retention | A retention period is not decided. No job deletes confirmed records. Temporary data is removed on a time-to-live | Partly | `docs/backup-and-retention.md` | **Decision needed:** retention period and what happens after it |
| 10 | Security safeguards | Field encryption of identifiers, encrypted files, role checks, department scoping, append-only audit log, multi-factor option, login limiting, headers. See `docs/security-report.md` | Partly | `security.test.js`, `compliance.test.js` | Independent penetration test not done |
| 11 | Breach notification | No procedure, contact or tooling | **Not built** | | **Decision needed:** who is told, within what time, and how |
| 12 | Right to access, correction and erasure on request | No self-service. Staff would need a procedure; the data model supports looking up a patient's rows | **Not built** | | Process needed |
| 13 | Grievance redressal and the data protection contact | Not part of the product | **Decision needed** | | Name the officer and show the contact in the consent notice |
| 14 | Children's data (under 18) | The registration form takes an age. There is no guardian consent step | **Not built** | | The Act needs verifiable parental consent; decide how paediatric patients are handled |
| 15 | Processors and transfers | Voice recognition by the browser vendor may leave the platform (see `docs/data-flow.md`); an SMS vendor is undecided; ABDM and the HIS receive data by consent | **Decision needed** | `docs/data-flow.md` | Contracts and cross-border position |
| 16 | Audit of who accessed or changed data | Consent, access, edit, alert, sign-in and push events are logged in an append-only, partitioned table | Built | `compliance.test.js` | Is the access log detailed enough for your needs? |
| 17 | ABDM consent framework | The consent manager and artefacts are not integrated: the ABHA push is a stub until sandbox access exists | **Not built** | | Needs the ABDM sandbox and its approvals |
| 18 | Significant data fiduciary duties (if designated) | Not assessed | **Decision needed** | | Impact assessment, data protection officer, audit |

## Sign-off log

| Date | Reviewer | Role | Items reviewed | Decision | Findings and actions |
|---|---|---|---|---|---|
| | | | | | |
