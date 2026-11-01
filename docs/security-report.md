# Security review report (Phase 8, first run)

**This is the project's own automated review. It is not an independent penetration test.** Phase 8 Definition of Done item 7 asks for a penetration test (or an equivalent review) with no open critical or high findings. What follows is the equivalent review the developers could do, the one defect it found, and the findings that remain open. An independent tester is still needed.

## What was checked, and how

| Area | Check | Result |
|---|---|---|
| Role boundaries | Every staff route (10), doctor route (11) and patient route (8) is called with no session and with each wrong role (`security.test.js`) | 401 with no session, 403 for the wrong role, on all of them |
| Portal gateway | Each role against each portal | Pass |
| Tokens | Signed with another secret, expired, `alg: none`, payload swapped, a valid token for the wrong role | All refused |
| Horizontal access | Patient B deletes, replaces and lists Patient A's files; reads A's answers | Refused (404) or empty |
| Department isolation | A doctor in another department opens the analysis, summary, scan, queue, consult, accept, rerun | 404 on all; not in the queue |
| Database role | As the doctor database role: other departments' encounters, documents and answers invisible; no write; no `users`, `consents`, `patient_identifiers`, `audit_logs` | Pass (`compliance.test.js`) |
| Audit log | UPDATE, DELETE and TRUNCATE on the table and on a partition | All refused |
| Input | Malformed JSON, oversized body, SQL-injection and traversal strings, objects instead of strings, NUL characters, an executable uploaded as a document | Clean 400, 401, 413 or 415; tables intact |
| Output | A text answer containing HTML is escaped in the FHIR narrative | Pass |
| Sessions | Cookie is `HttpOnly` and `SameSite=Lax`; `Secure` in production | Pass |
| Sign-in | Failed attempts limited per user and address (429); every outcome audited; the password never logged | Pass |
| Second factor | TOTP matches the RFC 6238 vectors; secret stored encrypted; required for sign-in once enrolled; enforceable (`REQUIRE_MFA`) | Pass |
| Headers | `nosniff`, frame denial, referrer policy, CSP `default-src 'none'`, HSTS in production | Pass |
| Plain text | Mobile number and ABHA number searched in every text and JSON column and in the logs | Found only inside the FHIR bundle sent with ABHA consent |
| Dependencies | `npm audit` | **0 vulnerabilities in production dependencies.** 6 moderate in the development tool chain (ESLint and `minimatch`), not shipped |

## Defect found and fixed

- **A NUL character in a request reached PostgreSQL and produced a 500** (`invalid byte sequence`, logged with the database error). Fixed: such requests are refused with 400 before any query (`security.js: rejectNul`). Severity: low (no data exposed, no crash), found by the hostile-input test.

## Open findings

Severity is the developers' judgement.

| # | Finding | Severity | Notes |
|---|---|---|---|
| 1 | **No independent penetration test.** | High (process) | Item 7 cannot be ticked. |
| 2 | **Browser speech recognition may send audio to the browser vendor's cloud** | High (privacy) | See `docs/data-flow.md`. A product decision, not a code defect. |
| 3 | **Row-level security is not used by the running application.** The app connects as the table owner, which bypasses the policies. They are tested by switching to `pc_doctor`, and the API enforces the same department rule in code | Medium | To make them bite, the doctor-facing code paths must connect as `pc_doctor` with `app.department_id` set per request. Measure query speed when that is done. |
| 4 | **Logging out does not revoke the token.** The cookie is cleared, but a stolen token stays valid until it expires (8 hours) | Medium | Needs a session table or a revocation list. |
| 5 | Keys come from environment variables; there is no managed key service and no key rotation. Ciphertext carries a version tag (`v1`) so rotation can be added | Medium | Decide hosting (Q9). |
| 6 | Name, date of birth, address, answers and summaries are not encrypted at field level | Medium | The requirement covers identifiers and mobile numbers. Database disk encryption is a deployment duty. |
| 7 | TLS is not terminated by the application and has not been tested | Medium | Deployment duty. |
| 8 | The sign-in limiter is in process memory, so it resets on restart and is per server | Low | Use a shared store with several servers (Phase 10). |
| 9 | The patient portal has no rate limit on OTP sends beyond the existing per-mobile limit, and no limit on file uploads per session beyond the file count | Low | Review in Phase 9 load tests. |
| 10 | Staff and doctor accounts have no password-reset, lock-out review or password-strength rule | Low | Admin tooling is Phase 10. |
| 11 | CSRF protection relies on `SameSite=Lax` cookies and JSON bodies; there are no anti-CSRF tokens | Low | Acceptable for an API used only by the same-origin app; revisit if embedded elsewhere. |
| 12 | The ABDM and HIS integrations were tested only against a local stand-in HTTP server | Medium | Real endpoints may differ in authentication and error handling. |

## What an independent test must still cover

Authentication and session handling against a deployed instance behind TLS; the row-level-security role once wired in; the file upload path (image parsing is done by `sharp`, `pdfjs-dist` and `pdf-lib`: malformed-file fuzzing); the SSE alert stream; the interaction with the real HIS and ABDM endpoints; and the deployment (secrets, network, backups).
