# OCR and extraction accuracy report (Phase 4, first run)

**What this is.** A first measurement of the document pipeline (read, classify, extract) on **17 synthetic documents** in English, Hindi and Marathi. Final accuracy targets are agreed in Phase 9.

**What this is not.** It is not a measurement on real prescriptions. Every name, drug and value is invented. The images were drawn by computer:

- `printed`: clean computer text (12 documents).
- `scan`: the same kind of text with tilt, grain, blur and JPEG compression, to look like a poor scanner (4 documents).
- `script`: a handwriting-style *font* in English (1 document). **This is not real handwriting.** Real handwritten English, Hindi and Marathi prescriptions have not been tested at all, and are the biggest risk (PRD 16.3). Treat handwriting accuracy as unknown.
- Drug and test names are in Latin letters, as on most Indian prescriptions; the other words are in the document language.

Numbers from a set this small, drawn by the same machine that wrote the extraction rules, will look better than real life. Use them to find bugs and to compare changes, not to promise accuracy.

## Run

- Date: 2026-11-01. Engine: `tesseract.js` 7 with the `eng+hin+mar` models, run in Node on a development laptop. Reproduce with `node server/scripts/benchmark-ocr.mjs`.
- 17 documents read in 12 seconds (two workers). Mean OCR line confidence 94%.
- A field counts as correct only when it matches the truth exactly (after trimming and case). "Extra" counts items the pipeline reported that are not in the truth (false positives).

### By document type

| Document type | Classified | Date | Diagnoses | Procedures | Medications (name, dose, frequency) | Lab values (name, value, unit, flag) | Extra meds / labs / diagnoses |
|---|---|---|---|---|---|---|---|
| Discharge summary | 100% (3/3) | 100% (3/3) | 100% (3/3) | 100% (3/3) | 100% (3/3) | n/a | 0 / 0 / 0 |
| Lab report | 100% (4/4) | 100% (4/4) | n/a | n/a | n/a | 92% (12/13) | 0 / 0 / 0 |
| Other | 100% (3/3) | 100% (3/3) | n/a | n/a | n/a | n/a | 0 / 0 / 0 |
| Prescription | 100% (7/7) | 100% (7/7) | 90% (9/10) | n/a | 88% (14/16) | n/a | 0 / 0 / 1 |

### By language

| Language | Classified | Date | Diagnoses | Procedures | Medications | Lab values | Extra |
|---|---|---|---|---|---|---|---|
| English | 100% (7/7) | 100% (7/7) | 100% (5/5) | 100% (1/1) | 78% (7/9) | 86% (6/7) | 0 / 0 / 0 |
| Hindi | 100% (5/5) | 100% (5/5) | 100% (4/4) | 100% (1/1) | 100% (5/5) | 100% (3/3) | 0 / 0 / 0 |
| Marathi | 100% (5/5) | 100% (5/5) | 75% (3/4) | 100% (1/1) | 100% (5/5) | 100% (3/3) | 0 / 0 / 1 |

### By style

| Style | Classified | Date | Diagnoses | Procedures | Medications | Lab values | Extra |
|---|---|---|---|---|---|---|---|
| Printed | 100% (12/12) | 100% (12/12) | 100% (9/9) | 100% (3/3) | 100% (10/10) | 100% (10/10) | 0 / 0 / 0 |
| Scan-like | 100% (4/4) | 100% (4/4) | 67% (2/3) | n/a | 100% (7/7) | 67% (2/3) | 0 / 0 / 1 |
| Handwriting-style font | 100% (1/1) | 100% (1/1) | 100% (1/1) | n/a | 0% (0/2) | n/a | 0 / 0 / 0 |

### Overall

| | Classified | Date | Diagnoses | Procedures | Medications | Lab values |
|---|---|---|---|---|---|---|
| All 17 documents | 100% (17/17) | 100% (17/17) | 92% (12/13) | 100% (3/3) | 89% (17/19) | 92% (12/13) |

## What went wrong, and what the pipeline did about it

Three documents had an error. All three are real OCR mistakes, not extraction bugs:

| Document | OCR mistake | Effect | Was it held for review? |
|---|---|---|---|
| `en-rx-script` (handwriting-style) | `500 mg` read as `500 me)`, `10 mg` as `10 Wg`, `at night` as `at vight` | Doses and one frequency missing | **Yes**: both medications are flagged for review because the dose or frequency is missing |
| `en-lab-scan` | A decimal point was lost: platelet range `1.5 - 4.5` read as `15-45`, so a normal 1.8 looked "low"; `uIU/mL` read as `ulU/mL`, range `0.4 - 4.0` as `04 - 4.0` | A false "low" flag and a wrong lower limit | **Yes**: a value an order of magnitude outside its own range, a range with a leading zero, and a corrected unit are all held for review |
| `mr-rx-scan` | `श्वसनदाह` read as `श्रसनदाह` | A wrong diagnosis word | **Yes**: the engine reported 91% confidence for the misread line, so Devanagari free text now takes an extra discount and is reviewed sooner |

The test `documents-ocr.test.js` checks this on every run: any lab result or medication that is not fully correct on a scan or handwriting-style document must be flagged for review.

**Lesson for the physician screen (Phase 6):** the OCR engine's own confidence cannot be trusted alone, because it was 91% on a wrong Marathi word. Show the scan beside each value, and always show flagged fields as "to check".

## Photo quality checks (measured)

| Case | Result |
|---|---|
| Clean prints and scan-like images | Pass (edge sharpness 28 to 52) |
| Blurred (blur 3 or more) | Flagged `blurry` (sharpness 4.6 or less, threshold 10) |
| Brightness reduced to 15% | Flagged `too_dark` |
| 300 px wide | Flagged `low_resolution` |
| Text running off the left, top or right edge | Flagged `cut_off_edges` |
| Blank white page | Flagged `blank_or_overexposed` |
| Not an image (right first bytes, garbage inside) | `unreadable` |

These thresholds were tuned on the synthetic images. They must be retuned on photos from the real terminal camera or scanner (Open Question Q2).

## Known gaps

- **Handwriting:** untested. A handwriting-style font is not handwriting.
- **Scanned PDFs:** a PDF that holds a picture instead of text is not read yet (the patient is asked to add a photo instead). PDFs with a text layer work. Reading scanned PDFs needs page rendering, planned with the next OCR work.
- **Languages in one document:** the engine runs English, Hindi and Marathi models together. Hindi and Marathi share a script and can be confused with each other; this was not measured separately.
- **Language data download:** Tesseract fetches the language models on first use. A deployment must ship them with the application (no internet on a hospital terminal).
- **Tables and multi-column layouts:** lab reports with tables read line by line; heavily formatted reports will need a layout-aware reader.
- **Imaging films:** out of scope until Open Question Q4 is answered.
- **Medicine name check:** names are taken as read; they are not checked against a drug list (Phase 5 adds interaction checks).

## Next measurements

1. Collect 30 or more *real or realistic* documents per language and type (with consent, never real patient data before the pilot), including photographs and handwriting.
2. Re-run `node server/scripts/benchmark-ocr.mjs` and add the results here.
3. Try a second engine behind `createTesseractEngine`'s interface (Bhashini, a cloud OCR, or a model tuned on prescriptions) and compare on the same set.
