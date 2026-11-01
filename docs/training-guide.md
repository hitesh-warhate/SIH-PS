# Training material for staff and doctors (DRAFT, nobody has been trained)

Written by the developers. **No group has been trained and no practical check has been run** (Phase 10 Definition of Done item 5). Clinical and hospital wording should be edited by the clinical lead and the training officer before use.

## 1. Registration desk and nurse (about 45 minutes)

**What the product does for you.** Patients register and answer questions at a terminal in their language. If a patient is in danger (chest pain with breathlessness, stroke signs, fainting, heavy bleeding), your screen shows a red alert straight away. The patient is told only to wait for staff.

**You will use three screens.**

| Screen | What you do |
|---|---|
| **Alerts** | Read the red and amber alerts. Each shows the token, the patient's name, why it was raised and the answers that triggered it. Go to the patient. Press **Acknowledge** when you have seen them. Help requests ("I need help") appear beside the alerts |
| **Queue** | Today's patients: token, complaint, status and alerts. Alerts come first. Use the **AYUSH mode** column to switch the Ayurvedic history on or off for one patient |
| **Register patient** | Register someone who cannot use the terminal: ask for their details and enter them. Say "yes" or "no" to a possible duplicate only after you have looked at the person in front of you |
| **Record delivery** | See whether the confirmed summaries reached the hospital system and ABHA. A red **FAILED** line needs attention: press **Try again**, and tell the IT contact if it fails again |

**Helping a patient.** Do not answer for the patient. Offer to read the question, point to the speaker icon (listen), the microphone (speak) and the hand (touch). If the voice cannot understand them after three tries the screen offers touch. If they want help, press the help button on their screen or come to the desk. Tick the "helped" box on the observation sheet during the pilot.

**What patients may ask.** "Who will see my answers?" The doctor, and the hospital system or ABHA only if they said yes to those choices on the consent screen. "Can I change my mind?" Yes: the consent screen's withdraw option removes what has not yet been confirmed by the doctor.

**Never do.** Never read out or write down someone's mobile number or ABHA number on paper left on the desk. Never share your sign-in. Sign out when you leave the desk.

## 2. Doctor (about 20 minutes)

1. Sign in (with your second factor, if it is on). The **Patient workspace** shows today's queue on the left. Red cases are first.
2. Click a patient. The **Summary** tab shows what the patient said and what their files say, each line with where it came from. **"Not answered" does not mean "no".** The summary states no diagnosis.
3. **Open case** (O) when you call the patient in. Read or edit. **Accept** (A) if it is right. **Amend** after editing any line (click Edit beside it). **Reject** if you will take the history yourself, then type your own notes.
4. Check the chips beside the name: out-of-range labs, interactions, allergies, record checks (a file may belong to another patient). Each jumps to the right tab. **Open the original scan beside any value** with "View scan". Values marked "to check" were read with low confidence.
5. Language buttons switch the summary between English, Hindi and Marathi. Large text and keyboard keys (J, K, 1 to 6, O, A) are on the screen.

**The tools are help, not a verdict.** The interaction list and the drug dictionary are drafts that a pharmacist has not yet reviewed; a missing warning is not a clearance. Check every flagged value against the scan.

## 3. Admin and hospital IT (about 60 minutes)

Create and disable accounts (a temporary password is shown once), set departments and their AYUSH setting, read the audit log, watch **System health**, and read the **Reports**. Practice the failure steps in `docs/rollout-runbook.md` (a failed push, a stuck reading queue, a restore).

## 4. Practical check (everyone, 10 minutes, record the result)

| Role | Task | Pass when |
|---|---|---|
| Nurse | A trainer enters a chest-pain answer on a practice terminal | Acknowledges the alert within a minute and finds the patient's token |
| Nurse | Register a practice patient, then a likely duplicate | Chooses correctly and explains why |
| Doctor | Open a practice case that has an interaction chip and a file that belongs to someone else | Finds both, opens the scan, amends one line and accepts |
| Doctor | Reject a draft | Writes the manual note and completes the case |
| Admin | Create a staff account, disable it, and show that its session ended | Does all three |
| Admin | Find a deliberately failed delivery and retry it | Does it |

| Date | Group | Trainer | Attendees | Passed first time | Notes |
|---|---|---|---|---|---|
| | | | | | |

## 5. Patient help card (print, in three languages, near each terminal)

Short and plain, to be checked by native speakers: "Touch your language. The speaker reads each question aloud. Speak your answer or touch it. You can go back. Press the help button and a person will come. Your answers go only to your doctor. You can stop at any time."
