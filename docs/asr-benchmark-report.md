# ASR benchmark report (Phase 2)

**Status: harness ready, no measurements yet.** No speech recordings have been collected, so no word error rate (WER) is reported here. Nothing in this file is a measured result. This Definition-of-Done item stays open until the table below is filled from real recordings.

## Why this matters

Marathi speech recognition is the top risk (PRD Section 16.3). The PRD asks for a Marathi result in the first week of the phase. Tapping stays available for every question, so a poor result slows patients down but never blocks them.

## What exists

- The speech adapter (`web/src/speech/speech.js`) wraps the browser engine behind `speak` and `listen`. A different engine (Bhashini, AI4Bharat or another) can be put behind the same two functions.
- The WER calculation and summary (`web/src/speech/wer.js`), tested.
- The benchmark script: `node web/scripts/benchmark-wer.js results.tsv`.

## How to run the benchmark

1. **Script.** Pick 30 to 50 short utterances per language (English, Hindi, Marathi) from the question bank: option labels, short symptom sentences, numbers 0 to 10, yes and no, and medicine names.
2. **Record.** Use synthetic or volunteer speakers, never real patients. At least 5 speakers per language, mixed ages and accents. Record each utterance in two conditions: `quiet`, and `noisy-ward` (play recorded ward noise at 60 to 70 dB beside the speaker, or record in a busy corridor).
3. **Transcribe.** Run each recording through the engine under test and keep its text.
4. **Tabulate.** One line per utterance in `results.tsv`, tab separated: `lang`, `condition`, `reference`, `hypothesis`.
5. **Summarise.** Run the script and paste the table below, with the engine name, version and date.

## Results

| Engine | Language | Condition | Utterances | Words | WER |
|---|---|---|---|---|---|
| _not yet measured_ | mr | quiet | | | |
| _not yet measured_ | mr | noisy-ward | | | |
| _not yet measured_ | hi | quiet | | | |
| _not yet measured_ | hi | noisy-ward | | | |
| _not yet measured_ | en | quiet | | | |
| _not yet measured_ | en | noisy-ward | | | |

## Targets

The PRD sets no number: "set per language after benchmarking" (Section 4.3). Agree the target with clinicians once the first results exist, and record it in the tracker's Metrics sheet.

## Decision log

| Date | Decision | Reason |
|---|---|---|
| | | |
