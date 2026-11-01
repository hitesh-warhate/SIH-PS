# Usability test plan (DRAFT, not run)

Status: written by the developers. **No usability test has been run.** The people, the consent forms and the site are still to arrange, and any session with real people needs the approvals in `docs/pilot-protocol.md` section 2 (a usability session with invented data and no personal information from the participant may need less; ask the ethics committee).

## Goal

Find out whether a first-time, non-technical patient can complete registration, the interview and the document upload without training, in each of English, Hindi and Marathi, and which screens cause trouble. The PRD asks for elderly and low-literacy participants in particular.

## Participants (proposed)

| Group | Per language | Notes |
|---|---|---|
| Age 60 or over, little or no experience of smartphones | 5 | Include some with poor eyesight or hearing |
| Low literacy (reads little or not at all) | 5 | Recruit through the hospital's own patients and their relatives, not through staff |
| Typical adult OPD patient | 3 | A baseline |
| Patients with a hearing or speech impairment | 2 in total | The PRD lists this as an open question; start with a few |

That is 13 per language, 39 in all, with 5 per group being the usual minimum to find the main problems. The clinical lead may choose fewer groups for a first round.

## Setup

The real terminal hardware if it exists (Open Question Q2), or a tablet in a quiet room and then in the OPD waiting area. Synthetic identity and a printed sheet of "your" details and two or three real-looking but invented papers, so no participant's own data is used. One facilitator who does not help unless asked or after 60 seconds of being stuck, and one note-taker. Screen and sound recorded only with the participant's separate consent.

## Tasks

1. Choose your language and register as a new patient, using the details on your sheet.
2. Say "yes" or "no" to the consent choices after hearing them, and change one choice afterwards.
3. Answer the questions about the problem on your sheet (a fever for two days; then a different sheet with chest pain), once by speaking and once by touching. Change one answer from the review screen.
4. Ask for help from the screen.
5. Add two papers using the camera or file picker, retake one, remove one.
6. Finish, and say what you think happens next.
7. Staff-side: a nurse sees the alert for the chest-pain sheet and acknowledges it. A doctor opens the case and accepts or amends the summary (separate sessions with clinicians).

## What is recorded for each participant and task

Completed unaided (yes, with a hint, with help, no); time taken; each place of hesitation or error; whether voice recognition understood them; the listening mode they chose; what they said they thought each icon meant; a rating of ease (a five-face scale for low-literacy participants) and a short interview. For doctors: the number of clicks and the seconds to open, read and accept or amend a summary.

## Measures reported

Independent completion rate per task, per language and per group; self-registration completion rate; median intake time; listening-mode usage; icon comprehension; top ten issues, each with how many participants hit it, a severity, and a decision (fix, accept with the product owner's name, or defer). Fixes are made before the pilot.

## Observation sheet (copy for each participant)

| Participant ID | Language | Group | Date | Facilitator |
|---|---|---|---|---|

| Task | Result (unaided / hint / help / failed) | Seconds | Where stuck | Voice understood? (yes / partly / no) | Notes |
|---|---|---|---|---|---|
| 1 Register | | | | | |
| 2 Consent | | | | | |
| 3 Interview by voice | | | | | |
| 3 Interview by touch | | | | | |
| 4 Help | | | | | |
| 5 Documents | | | | | |
| 6 Finish | | | | | |
