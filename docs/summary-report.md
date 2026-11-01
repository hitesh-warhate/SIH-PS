# Summary and doctor workspace report (Phase 6, first run)

Everything here uses **synthetic data**. No clinician has used or reviewed the screens or the summary wording.

## What was checked

| Check | Result |
|---|---|
| A submitted case gets a draft in the standard order (7 interview sections plus prior investigations), text in three languages, a source on every item, and the files included and failed listed | Automated test pass; shown in the browser |
| A skipped or unasked question has no text and is listed under "not answered" with its question | Pass |
| No diagnostic wording: every question, with every kind of file in 13 analysis cases, in three languages; the scanner itself is tested on positive and negative examples | Pass (a wording list written by the developers, see gaps) |
| Accept, amend, reject and manual documentation each record who and when; the AI draft (version 1) is unchanged; what changed is listed per version | Pass |
| Lifecycle: open only from Ready; accept, amend and reject only from In consultation; manual only after a reject; no second decision | Pass (409 on each invalid move) |
| Queue: alerts first, completed last, status chips, counters, search by name, token and complaint, filter by status and alerts, warning counts | Pass |
| The original scan is served to the doctor only, byte for byte; each value carries its page position and confidence | Pass |
| Browser walkthrough with real OCR output: queue and search, open case, labs tab with the scan and highlighted position beside a value, keyboard shortcuts 1 and 3, amend one line and see versions v1 (AI draft), v2 (refreshed draft before opening), v3 (amended, by the doctor) | Worked |
| Full suite | 140 server and 30 web tests pass, lint clean, build passes |

## Known gaps

- **Not done: the usability test with a clinician** (clicks and seconds to accept or amend; Definition of Done item 4) and the **clinician reading of sample summaries** (item 2). The no-diagnosis scan is automated only and its word list is the developers' own.
- **Audio confirmation** is written (browser speech synthesis in the patient's language) but nobody has listened to it; Hindi and Marathi need an installed device voice.
- **Print** was not exercised in the browser (it opens the system print dialog). The download button builds a text file from the current language.
- Hindi and Marathi wording, in the summary templates and in the screens, is a developer draft awaiting native-speaker and clinician review.
- Push to HIS and ABHA (DB-11) is Phase 8.
- A draft that nobody has opened is rebuilt when files or answers change, which adds a version; this is why a demo case showed two AI-draft versions.
- Doctor routing is by department only (the Phase 3 decision about assigning patients to a named doctor is still open).
- One run of the full suite showed a Phase 4 retry test (`a failing engine is retried`) failing once; it did not repeat in 12 isolated runs. Treated as a timing flake and not yet explained.
- The scan highlight uses OCR page coordinates; a photo with a rotation stored in its metadata may be highlighted in the wrong place. PDFs open as a link, with no highlight.
