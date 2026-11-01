# Speech data collection protocol (DRAFT, not run)

Status: draft by the developers. **No recordings exist, so no word error rate has been measured** (`docs/asr-benchmark-report.md` holds the harness only). Recording people's voices is personal data and needs consent and the approvals in `docs/pilot-protocol.md` section 2.

## Why

To measure, for each of English, Hindi and Marathi, how often the recognition used by the product gets the words wrong, in the conditions the product will meet: different accents, older voices, and a noisy ward. The result decides whether voice answers can be trusted without confirmation, and what the thresholds for read-back should be.

## What to record

| Condition | Participants (proposed) | Notes |
|---|---|---|
| Quiet room, studio-like | 10 per language | A baseline |
| Quiet room, typical device microphone | 20 per language | Mix of ages (including 60 and over) and genders |
| Noisy ward or waiting area | 20 per language | Record the sound level; include a few at the terminal itself |
| Accent spread | Include speakers from several districts for Hindi and Marathi | Written down at the time, with consent |

Each participant reads a fixed list of 40 prompts and says 10 free answers to the product's own questions. The list covers: yes and no, the complaint options, durations ("two days", "since last week"), medicine and allergy names, numbers (pain out of ten), and short free text. Mixed-language speech (Hindi or Marathi with English drug names) is common and must be included.

## How it is scored

The word error rate is substitutions plus deletions plus insertions over the number of words in a careful human transcript, per language and per condition (`web/scripts/benchmark-wer.js` computes it). Also report the share of free answers whose ontology mapping was right, because a word error that does not change the meaning matters less than one that does.

## Handling

A separate consent form says what is recorded, who listens, how long it is kept, and that taking part is optional. Recordings are stored apart from the product database, labelled with a participant number only, and deleted at the end of the analysis or as the ethics approval says. The product itself never stores audio.

## Thresholds

The PRD says to set them after benchmarking. Propose them to the clinical lead and product owner once there are numbers; a common approach is a threshold per language below which the screen always asks the patient to confirm by touch (the product already confirms critical answers on screen and by audio).
