# Phase 0: actions only the team can take

Two Phase 0 Definition-of-Done items need people and accounts outside this repository. They are tracked here until someone does them.

## 1. ABDM sandbox application (DoD 0.07)

- [ ] Apply for ABDM sandbox access (Phases 1 and 8 depend on it; approval can take weeks).
- Owner: _unassigned_
- Date submitted: _pending_
- Reference / link: _pending_

## 2. Hindi and Marathi label review (DoD 0.07)

- [ ] Name an owner for native-speaker and clinician review of `web/src/i18n/hi.json` and `mr.json` (PRD Section 8.3 asks for this before release).
- Owner: _unassigned_
- Workflow: reviewer edits the JSON (or a spreadsheet export), a developer merges it, then sets `meta.reviewStatus` to `approved` for that language. A test confirms English is `approved` and the others are `pending` until then.

## 3. Also worth starting now (PRD Section 22.2, "Early starts")

- Legal review of consent wording (needed for Phase 1).
- Synthetic prescriptions and lab reports for the document pipeline (Phase 4).
- AYUSH clinical content authoring (Phase 7).
- Hosting decision for PostgreSQL (Open Question Q9).
