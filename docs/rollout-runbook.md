# Rollout runbook (DRAFT: not reviewed with hospital IT or the clinical lead)

Phase 10 Definition of Done items 6 and 7 need this reviewed with hospital IT and the clinical lead, and the go-live checklist signed. **Neither has happened.** Everything below is the developers' proposal.

## 1. Preconditions: no department goes live until

| # | Condition | Where it stands (2026-11-01) |
|---|---|---|
| 1 | The acceptance checklist is signed by the product owner, clinical lead and compliance reviewer | Not signed; 8 Severity 2 items open (`docs/defect-register.md`) |
| 2 | The supervised pilot is complete and its report accepted | Not started |
| 3 | Red-flag rules, ontology, icon labels, drug and interaction lists, and the AYUSH content signed by the right clinicians | Not signed |
| 4 | Voice recognition's data path decided (`docs/data-flow.md`) | Not decided |
| 5 | A real OTP provider, the ABDM sandbox and production approvals, and the hospital system connector working against the hospital's test system | Stubs only |
| 6 | Independent security test with no open critical or high finding; legal review of consent | Not done |
| 7 | Production database with point-in-time recovery, TLS, disk encryption, monitoring routed to a person, key management | Not set up |
| 8 | Terminals chosen and set up (`docs/terminal-setup-guide.md`) | Q2 open |
| 9 | Staff and doctors of that department trained and passed the practical check (`docs/training-guide.md`) | Nobody trained |
| 10 | Support rota agreed (section 4) and the rollback below rehearsed | Not agreed |

## 2. Rollout plan, department by department

Switch on one department at a time. The proposal below is for the hospital to reorder.

| Step | Scope | Duration | Move on when |
|---|---|---|---|
| 0 | Staging with synthetic data: the whole journey, an alert, a delivery to the hospital's test system, a restore | 1 week | Hospital IT signs the technical check |
| 1 | **Pilot OPD**: one department, 2 to 4 terminals, a staff member beside them, patients volunteer (`docs/pilot-protocol.md`) | 2 to 4 weeks | Pilot report accepted; no stop rule triggered; no Severity 1 or 2 open |
| 2 | Same department, all its terminals, still with a helper | 1 to 2 weeks | Independent completion and doctor feedback at the level the clinical lead set |
| 3 | Next department (one with different needs, for example paediatrics is out of scope until children's consent is settled; the AYUSH OPD needs the AYUSH sign-off) | 2 weeks each | Same measures |
| 4 | Remaining OPDs, one at a time | as above | |
| 5 | Review at 3 months: metrics, defects, training refresh, load, backup drills | | |

Each step starts only after the previous department has run a week without a Severity 1 or 2 incident.

## 3. Go-live day for a department

**Morning, before OPD opens** (hospital IT): health page all green (`/admin/health`); yesterday's backup verified; the hospital system test delivery delivered; terminals restarted and each passed the 15-minute acceptance check; staff accounts exist and signed in; the department's AYUSH setting right; on-call webhook tested with a deliberate alert.

**During OPD**: a trained helper beside the terminals; the nurse watches **Alerts**; IT watches **System health**; the clinical lead is reachable.

**End of day**: any **FAILED** deliveries retried or explained; the day's incidents written down; the metrics report (`scripts/metrics.mjs`) saved; a note of what patients struggled with.

## 4. Support and escalation

| Level | Who | Handles | Expected response |
|---|---|---|---|
| 1 | Department helper or nurse in charge | Patient confusion, a terminal that needs restarting, a patient who prefers the desk | Immediate |
| 2 | Hospital IT on-call | A terminal or network fault, a failed delivery that retry did not fix, an account problem (admin console), a health alert | Within 30 minutes in OPD hours (proposal) |
| 3 | Developers or the vendor | A software fault, a wrong summary pattern, a data issue, a restore | Same day (proposal) |
| Clinical | Clinical lead | Any suspected wrong alert, missed alert, or a summary that states something untrue | Immediately; see stop rules |

Contact names, numbers and the rota are blank until the hospital fills them in: `__________`.

**Incident rule.** Anything touching patient safety (a missed or wrong red flag, a summary a doctor relied on that was wrong) or privacy (data seen by the wrong person) is reported to the clinical lead and the compliance contact the same day and written down with what happened, who was affected and what was changed.

## 5. When things go wrong (first steps)

| Symptom | First steps |
|---|---|
| Health shows **database** down | Check the database server and disk; the app cannot take answers. Tell level 1 to send patients to the desk. Restore only if the data is damaged (section 6) |
| **Reading queue** degraded or down | Files are waiting or failing: check the reading engine status on the same page; restart the API process; files waiting are re-queued on restart. Patients can still finish; their papers will appear on the doctor's screen when read |
| **Document reading** down | Usually missing or unreachable language data. Restart; check disk and memory. Doctors are told summaries may lack file data |
| **Hospital system** deliveries failed | Open **Record delivery**; read the last error; if the hospital's endpoint is down wait and press **Try again**; if the bundle is marked invalid, tell the developers (it will not send) |
| **Replica** degraded | Only the reports lag; screens are unaffected. Check replication on the database host |
| **Speech** signal degraded | Many patients cannot be understood: check the room noise, microphones and the browser's recognition; tell helpers to offer touch |
| A summary looks wrong | The doctor rejects it and takes the history; note the case id and tell the clinical lead |
| An alert did not appear | **Stop rule.** Tell the clinical lead; do not restart until the case is preserved (`audit_logs` and the alert tables are the evidence) |
| A staff or doctor account is compromised | Admin disables the account (its sessions end at once), resets the password and second factor, and checks the audit log for what it did |

## 6. Rollback

Rollback is cheap by design: the product adds a path, it does not replace the desk.

1. **Switch off one department's terminals:** close the start page on its terminals (kiosk off), or stop sending patients to them. Patients go to the desk and the doctor takes the history as before. Nothing else needs changing.
2. **Hold deliveries:** if the hospital system is receiving bad data, point `HIS_URL` at the hospital's test system and restart, so confirmed summaries are not pushed to production (**do not use `HIS_MODE=mock`: it acknowledges without sending, so deliveries would be marked delivered and lost**; production refuses it). Fix the problem, point back, and retry anything that failed from **Record delivery**.
3. **Software rollback:** deploy the previous release. Migrations only add (never edit applied ones) so the previous release runs on the newer schema; if a migration must be undone, restore the database from the last good backup (cost: everything since it).
4. **Data rollback:** `docs/restore-drill-report.md`. Know the data-loss window before relying on this.
5. **Tell people:** the department, the nurse in charge and the clinical lead. Write down why.

A rollback leaves patients' saved answers and confirmed summaries where they are; nothing is deleted by switching a department off.

## 7. Go-live checklist (per department)

| Item | Done | By | Date |
|---|---|---|---|
| Section 1 preconditions all met or explicitly accepted by the product owner in writing | | | |
| Terminals set up and checked | | | |
| Staff and doctors trained and passed the practical check | | | |
| Accounts created; second factor on | | | |
| Department and AYUSH setting right in the admin console | | | |
| Hospital system and ABHA delivery working against production endpoints | | | |
| Monitoring routed to the on-call person; test alert received | | | |
| Latest backup restored successfully in the last week | | | |
| Support rota and escalation contacts filled in | | | |
| Rollback rehearsed | | | |
| Patient help cards and consent notices printed in three languages | | | |
| **Signed: product owner** | | | |
| **Signed: clinical lead** | | | |
| **Signed: hospital IT head** | | | |
| **Signed: compliance reviewer** | | | |

## 8. Known gaps that affect rollout

No offline mode (Open Question Q3): a network failure stops intake, though answers already given are kept. Terminal hardware not chosen (Q2). Scanned PDFs are not read. Real OCR throughput is about 4.7 files a second per server, so a morning rush of 800 files takes about 3 minutes to read (add reading workers). Children are out of scope until the consent question is decided. Hindi and Marathi wording needs native review. Only one server process has been tested; a second API process needs the sign-in limiter, the alert stream and the job queue moved to shared stores.
