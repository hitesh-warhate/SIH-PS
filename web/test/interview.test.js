import { test } from 'node:test';
import assert from 'node:assert/strict';
import { QUESTIONS } from '../../server/config/questions.v1.js';
import { matchSpoken, normalize, labelFor, isConfident } from '../src/interview/matching.js';
import { presentation, modeForNextQuestion, MODES } from '../src/interview/presentation.js';

const LANGS = ['en', 'hi', 'mr'];
const IDX = { en: 0, hi: 1, mr: 2 };
// the question as the patient API presents it in a language
const present = (q, lang) => ({
  ...q, text: q.text[IDX[lang]], options: q.options?.map((o) => ({ value: o.value, label: o.label[IDX[lang]] })),
});

test('every question in the bank can be answered by speaking, in every language', () => {
  let checked = 0;
  for (const raw of QUESTIONS) {
    for (const lang of LANGS) {
      const q = present(raw, lang);
      if (q.options && ['single', 'yes_no'].includes(q.type)) {
        for (const o of q.options) {
          assert.deepEqual(matchSpoken(q, lang, o.label), { value: o.value }, `${q.key}/${lang}: saying "${o.label}"`);
          checked++;
        }
      } else if (q.type === 'multi') {
        for (const o of q.options) {
          assert.deepEqual(matchSpoken(q, lang, o.label), { value: [o.value] }, `${q.key}/${lang}: saying "${o.label}"`);
          checked++;
        }
        const two = q.options.filter((o) => o.value !== 'none').slice(0, 2);
        assert.deepEqual(matchSpoken(q, lang, two.map((o) => o.label).join(' and ')).value.sort(), two.map((o) => o.value).sort(), `${q.key}/${lang}: two options`);
      } else if (q.type === 'number') {
        assert.deepEqual(matchSpoken(q, lang, '7'), { value: 7 });
        checked++;
      } else if (q.type === 'text') {
        assert.deepEqual(matchSpoken(q, lang, ' left side '), { value: 'left side' });
        checked++;
      }
    }
  }
  assert.ok(checked > 400, `only ${checked} spoken answers checked`);
});

test('yes and no are understood in English, Hindi and Marathi, and an unclear answer is not guessed', () => {
  const yn = present(QUESTIONS.find((q) => q.key === 'allergy.any'), 'en');
  for (const [said, want] of [['yes', 'yes'], ['हाँ', 'yes'], ['हां जी', 'yes'], ['होय', 'yes'], ['no', 'no'], ['नहीं', 'no'], ['नाही', 'no']]) {
    assert.deepEqual(matchSpoken(yn, 'en', said), { value: want }, said);
  }
  assert.equal(matchSpoken(yn, 'en', 'maybe'), null);
  assert.equal(matchSpoken(yn, 'en', 'yes no'), null);
  assert.equal(matchSpoken(yn, 'en', ''), null);
});

test('numbers are understood as digits, Devanagari digits and words, within range', () => {
  const sev = present(QUESTIONS.find((q) => q.key === 'pain.severity'), 'en');
  for (const [said, want] of [['7', 7], ['seven', 7], ['७', 7], ['सात', 7], ['दहा', 10], ['it is 4 out of ten', 4]]) {
    assert.deepEqual(matchSpoken(sev, 'en', said), { value: want }, said);
  }
  assert.equal(matchSpoken(sev, 'en', '15'), null);
  assert.equal(matchSpoken(sev, 'en', 'a lot'), null);
});

test('a longer option label wins over a shorter label it contains', () => {
  const emergency = present(QUESTIONS.find((q) => q.key === 'emergency.screen'), 'en');
  assert.deepEqual(matchSpoken(emergency, 'en', 'Chest pain with difficulty breathing'), { value: ['e_chest'] });
  const ros = present(QUESTIONS.find((q) => q.key === 'ros.cardio'), 'en');
  assert.deepEqual(matchSpoken(ros, 'en', 'chest pain'), { value: ['chest_pain'] });
});

test('answers read back to the patient use the labels of the current language', () => {
  const q = present(QUESTIONS.find((x) => x.key === 'pmh.conditions'), 'hi');
  assert.equal(labelFor(q, ['diabetes', 'tb']), 'मधुमेह (शुगर), टीबी (क्षय रोग)');
  assert.equal(normalize(' हाँ! '), 'हाँ');
});

test('recognizer confidence below the threshold is treated as not understood', () => {
  assert.equal(isConfident(0.9), true);
  assert.equal(isConfident(null), true); // some engines give no score
  assert.equal(isConfident(0.2), false);
});

test('the listening mode decides how every question is presented', () => {
  assert.deepEqual(presentation('listen_speak'), { speakPrompt: true, openMic: true, showOptions: false, tapAvailable: true });
  assert.deepEqual(presentation('listen_tap'), { speakPrompt: true, openMic: false, showOptions: true, tapAvailable: true });
  assert.deepEqual(presentation('read_tap'), { speakPrompt: false, openMic: false, showOptions: true, tapAvailable: true });
  assert.equal(presentation(null), null); // no mode yet: the selector is shown
  assert.equal(new Set(MODES.map((m) => JSON.stringify(presentation(m)))).size, 3);
  // the same rule applies to main questions and follow-ups alike: presentation takes the mode only
  assert.equal(presentation.length, 1);
});

test('a mode changed from the header applies from the next question', () => {
  assert.equal(modeForNextQuestion('listen_speak', null), 'listen_speak');
  assert.equal(modeForNextQuestion('listen_speak', 'read_tap'), 'read_tap');
});

test('every control icon has a text label in all three languages (FR-A10)', async () => {
  const { readFileSync } = await import('node:fs');
  const load = (l) => JSON.parse(readFileSync(new URL(`../src/i18n/${l}.json`, import.meta.url), 'utf8'));
  for (const lang of LANGS) {
    const d = load(lang);
    for (const icon of ['listen', 'repeat', 'slower', 'speak', 'tap', 'read', 'back', 'next', 'skip', 'help', 'followup', 'yesno']) assert.ok(d[`icon.${icon}`], `${lang} icon.${icon}`);
    for (const mode of MODES) assert.ok(d[`interview.mode.${mode}`], `${lang} interview.mode.${mode}`);
  }
});
