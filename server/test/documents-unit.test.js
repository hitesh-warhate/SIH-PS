import { test } from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { readFileSync } from 'node:fs';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { classify } from '../src/documents/classify.js';
import { extract, findDate, flagFor, parseFrequency, parseRange } from '../src/documents/extract.js';
import { sniff, pdfPageCount, pdfTextLines } from '../src/documents/files.js';
import { checkImageQuality } from '../src/documents/quality.js';
import { createJobQueue } from '../src/documents/queue.js';
import { score } from '../src/documents/accuracy.js';

const fixture = (name) => readFileSync(new URL(`./fixtures/docs/${name}`, import.meta.url));
const lines = (...texts) => [{ page: 1, lines: texts.map((text, i) => ({ text, confidence: 0.95, bbox: { x0: 10, y0: 10 + i * 40, x1: 500, y1: 40 + i * 40 } })) }];

test('file type is decided from the first bytes, not the name', async () => {
  assert.equal(sniff(fixture('en-rx-printed.png')).mime, 'image/png');
  assert.equal(sniff(fixture('en-rx-scan.jpg')).mime, 'image/jpeg');
  assert.equal(sniff(Buffer.from('%PDF-1.7 rest of file')).kind, 'pdf');
  assert.equal(sniff(Buffer.from('MZ this is an executable disguised as a photo')), null);
  assert.equal(sniff(Buffer.from('plain text file here')), null);
  assert.equal(sniff(Buffer.alloc(4)), null);
});

test('PDF page count and text layer', async () => {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  for (const text of ['Prescription', 'Tab Metformin 500 mg twice daily']) doc.addPage([595, 842]).drawText(text, { x: 50, y: 750, size: 14, font });
  const buf = Buffer.from(await doc.save());
  assert.equal(await pdfPageCount(buf), 2);
  assert.equal(await pdfPageCount(Buffer.from('%PDF-1.4 not really a pdf')), null);
  const pages = await pdfTextLines(buf);
  assert.equal(pages.length, 2);
  assert.equal(pages[1].lines[0].text, 'Tab Metformin 500 mg twice daily');
  assert.equal(pages[1].lines[0].confidence, 1);
  assert.ok(pages[1].lines[0].bbox.y0 < 842 / 4, 'position is measured from the top of the page');
});

test('photo quality: good scans pass; blurry, dark, tiny, blank and cut-off photos are asked to be retaken; garbage is unreadable', async () => {
  for (const f of ['en-rx-printed.png', 'hi-rx-scan.jpg', 'en-rx-script.png', 'mr-lab-printed.png']) assert.deepEqual((await checkImageQuality(fixture(f))).issues, [], f);
  const base = fixture('en-rx-printed.png');
  const issue = async (img) => (await checkImageQuality(img)).issues[0];
  assert.equal(await issue(await sharp(base).blur(5).png().toBuffer()), 'blurry');
  assert.equal(await issue(await sharp(base).modulate({ brightness: 0.15 }).png().toBuffer()), 'too_dark');
  assert.equal(await issue(await sharp(base).resize({ width: 300 }).png().toBuffer()), 'low_resolution');
  assert.equal(await issue(await sharp(base).extract({ left: 55, top: 0, width: 1100, height: 400 }).png().toBuffer()), 'cut_off_edges');
  assert.equal(await issue(await sharp({ create: { width: 1000, height: 600, channels: 3, background: '#fff' } }).png().toBuffer()), 'blank_or_overexposed');
  assert.equal(await issue(Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(300, 7)])), 'unreadable');
});

test('dates are read day first, in several formats, including Devanagari digits', () => {
  assert.equal(findDate('Date: 12/03/2026'), '2026-03-12');
  assert.equal(findDate('दिनांक: १२-०३-२०२६'), '2026-03-12');
  assert.equal(findDate('Seen on 5 Mar 2026'), '2026-03-05');
  assert.equal(findDate('2026-03-12'), '2026-03-12');
  assert.equal(findDate('13/13/2026'), null);
  assert.equal(findDate('no date here'), null);
});

test('dose frequencies are normalised across English, Hindi and Marathi', () => {
  const f = (t) => parseFrequency(t)?.code ?? null;
  assert.equal(f('twice daily'), 'twice daily');
  assert.equal(f('BD'), 'twice daily');
  assert.equal(f('1-0-1'), 'twice daily');
  assert.equal(f('1-1-1'), 'three times daily');
  assert.equal(f('1-0-0'), 'once daily');
  assert.equal(f('TDS'), 'three times daily');
  assert.equal(f('SOS'), 'as needed');
  assert.equal(f('at night'), 'at bedtime');
  assert.equal(f('दिन में दो बार'), 'twice daily');
  assert.equal(f('सुबह-शाम'), 'twice daily');
  assert.equal(f('दिवसातून एकदा'), 'once daily');
  assert.equal(f('दिवसातून दोनदा'), 'twice daily');
  assert.equal(f('गरज असल्यास'), 'as needed');
  assert.equal(f('with food'), null);
});

test('reference ranges and flags; a missing range is range_unavailable, never "normal"', () => {
  assert.deepEqual(parseRange('12.0 - 15.5'), { low: 12, high: 15.5, text: '12.0 - 15.5' });
  assert.equal(parseRange('< 200').high, 200);
  assert.equal(parseRange('> 5').low, 5);
  assert.equal(parseRange('(70-100)').high, 100);
  assert.equal(parseRange('see comments'), null);
  assert.equal(flagFor(10.2, { low: 12, high: 15.5 }), 'low');
  assert.equal(flagFor(16, { low: 12, high: 15.5 }), 'high');
  assert.equal(flagFor(13, { low: 12, high: 15.5 }), 'normal');
  assert.equal(flagFor(231, { low: null, high: 200 }), 'high');
  assert.equal(flagFor(5, null), 'range_unavailable');
});

test('medications: form, name, dose, frequency; an incomplete line is kept but held for review', () => {
  const r = extract(lines('1. Tab. Metformin 500mg 1-0-1', 'Cap Omeprazole 20 mg once daily', 'Tab Atorvastatin', 'Syp Ambroxol 5 ml thrice daily'));
  const by = (n) => r.medications.find((m) => m.name === n);
  assert.deepEqual([by('Metformin').dose, by('Metformin').frequency, by('Metformin').needs_review], ['500 mg', 'twice daily (1-0-1)', false]);
  assert.deepEqual([by('Omeprazole').form, by('Omeprazole').frequency], ['cap', 'once daily']);
  assert.deepEqual([by('Atorvastatin').dose, by('Atorvastatin').frequency, by('Atorvastatin').needs_review], [null, null, true]);
  assert.equal(by('Ambroxol').dose, '5 ml');
  assert.ok(by('Atorvastatin').confidence < by('Metformin').confidence, 'an incomplete line is less certain');
});

test('lab results: value, unit and range; names with digits; no range gives range_unavailable', () => {
  const r = extract(lines('Hemoglobin 10.2 g/dL 12.0 - 15.5', 'HbA1c 7.8 % < 5.7', 'Creatinine 0.9 mg/dL', 'Age 45 years', 'Fasting Glucose: 142 mg/dL (70-100)'));
  const lab = (n) => r.labs.find((l) => l.test_name === n);
  assert.deepEqual([lab('Hemoglobin').value, lab('Hemoglobin').unit, lab('Hemoglobin').flag], [10.2, 'g/dL', 'low']);
  assert.deepEqual([lab('HbA1c').unit, lab('HbA1c').flag], ['%', 'high']);
  assert.equal(lab('Creatinine').flag, 'range_unavailable');
  assert.equal(lab('Fasting Glucose').flag, 'high');
  assert.equal(r.labs.length, 4, 'a line such as "Age 45 years" is not a lab result');
});

test('a dropped decimal point in a range is held for review instead of raising a false flag as certain', () => {
  const r = extract(lines('Platelet Count 1.8 lakhs/cumm 15 - 45', 'TSH 6.2 ulU/mL 04 - 4.0'));
  const plt = r.labs.find((l) => l.test_name === 'Platelet Count');
  assert.equal(plt.needs_review, true);
  assert.ok(plt.confidence < 0.75);
  const tsh = r.labs.find((l) => l.test_name === 'TSH');
  assert.equal(tsh.unit, 'uIU/mL'); // read as the unit it almost certainly is...
  assert.equal(tsh.needs_review, true); // ...but marked as a correction to check
});

test('diagnoses and procedures in English, Hindi and Marathi; a label on its own line takes the next line', () => {
  const r = extract(lines('Diagnosis: Type 2 diabetes, hypertension', 'निदान: मधुमेह और उच्च रक्तचाप', 'शस्त्रक्रिया: अपेंडिसेक्टॉमी', 'Procedure:', 'Laparoscopic cholecystectomy'));
  const v = (t) => r.entities.filter((e) => e.entity_type === t).map((e) => e.value);
  assert.deepEqual(v('diagnosis'), ['Type 2 diabetes', 'hypertension', 'मधुमेह', 'उच्च रक्तचाप']);
  assert.deepEqual(v('procedure'), ['अपेंडिसेक्टॉमी', 'Laparoscopic cholecystectomy']);
});

test('every extracted field has a confidence and a region (page and position) on the original scan', () => {
  const r = extract(lines('Date: 12/03/2026', 'Diagnosis: Anaemia', 'Tab Iron 100 mg once daily', 'Hemoglobin 9.0 g/dL 12.0 - 15.5'));
  for (const f of [...r.entities, ...r.medications, ...r.labs]) {
    assert.ok(f.confidence > 0 && f.confidence <= 1);
    assert.equal(typeof f.needs_review, 'boolean');
    assert.equal(f.region.page, 1);
    for (const k of ['x0', 'y0', 'x1', 'y1']) assert.equal(typeof f.region[k], 'number');
  }
});

test('low OCR confidence marks a field for review and Devanagari free text is reviewed sooner', () => {
  const low = [{ page: 1, lines: [{ text: 'Tab Metformin 500 mg twice daily', confidence: 0.6, bbox: { x0: 0, y0: 0, x1: 1, y1: 1 } }, { text: 'निदान: तीव्र ब्रोंकाइटिस', confidence: 0.9, bbox: { x0: 0, y0: 2, x1: 1, y1: 3 } }] }];
  const r = extract(low);
  assert.equal(r.medications[0].needs_review, true);
  assert.equal(r.entities[0].needs_review, true, '0.9 x 0.95 x 0.85 is below the review threshold');
});

test('documents are classified from their text in all three languages, and weak evidence is "other"', () => {
  assert.equal(classify('Prescription Rx Tab Metformin 500 mg twice daily').type, 'prescription');
  assert.equal(classify('Laboratory Report Reference Range Hemoglobin 10.2 g/dL').type, 'lab_report');
  assert.equal(classify('Discharge Summary Date of admission Final diagnosis').type, 'discharge_summary');
  assert.equal(classify('डिस्चार्ज सारांश भर्ती की तारीख Tab Cefixime 200 mg दिन में दो बार').type, 'discharge_summary');
  assert.equal(classify('जाँच रिपोर्ट सामान्य सीमा Hemoglobin 10.2 g/dL').type, 'lab_report');
  assert.equal(classify('तपासणी अहवाल संदर्भ मर्यादा Hemoglobin 10.2 g/dL').type, 'lab_report');
  assert.equal(classify('Medical certificate: advised rest for three days').type, 'other');
});

test('scoring compares extraction with the truth, field by field', () => {
  const truth = { docType: 'prescription', date: '2026-03-12', diagnoses: ['Diabetes'], procedures: [], meds: [{ name: 'Metformin', dose: '500 mg', frequency: 'twice daily' }], labs: [] };
  const good = score(truth, { docType: 'prescription', date: '2026-03-12', diagnoses: ['diabetes.'], procedures: [], meds: [{ name: 'metformin', dose: '500 mg', frequency: 'twice daily (1-0-1)' }], labs: [] });
  assert.deepEqual([good.class, good.date, good.diagnoses, good.medications], [[1, 1], [1, 1], [1, 1], [1, 1]]);
  const bad = score(truth, { docType: 'other', date: null, diagnoses: [], procedures: [], meds: [{ name: 'Metformin', dose: null, frequency: null }, { name: 'Extra', dose: null, frequency: null }], labs: [] });
  assert.deepEqual([bad.class[0], bad.date[0], bad.medications[0], bad.extra.medications], [0, 0, 0, 1]);
});

test('the job queue runs files in parallel, retries with back-off, and one failure never stops the others', async () => {
  const log = [];
  let running = 0, peak = 0;
  const failures = { bad: 99, flaky: 2 };
  const gaveUp = [];
  const q = createJobQueue({
    concurrency: 3, maxAttempts: 3, baseDelayMs: 5,
    run: async (id) => {
      running++; peak = Math.max(peak, running);
      await new Promise((r) => setTimeout(r, 20));
      running--;
      if (failures[id]-- > 0) { log.push(`${id}:fail`); throw new Error('boom'); }
      log.push(`${id}:ok`);
    },
    onGiveUp: (id) => gaveUp.push(id),
  });
  ['a', 'b', 'bad', 'flaky', 'c'].forEach((id) => q.enqueue(id));
  await q.idle();
  assert.ok(peak >= 2 && peak <= 3, `ran ${peak} at a time`);
  for (const id of ['a', 'b', 'c', 'flaky']) assert.ok(log.includes(`${id}:ok`), id);
  assert.equal(log.filter((x) => x === 'flaky:fail').length, 2, 'retried until it worked');
  assert.equal(log.filter((x) => x === 'bad:fail').length, 3, 'gave up after the maximum attempts');
  assert.deepEqual(gaveUp, ['bad']);
});

test('a job that is not worth retrying is not retried', async () => {
  let runs = 0;
  const q = createJobQueue({ run: async () => { runs++; throw new Error('corrupt'); }, isRetryable: () => false, baseDelayMs: 1 });
  q.enqueue('x');
  await q.idle();
  assert.equal(runs, 1);
});
