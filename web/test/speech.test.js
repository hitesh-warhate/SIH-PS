import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSpeech, audioCue, LOCALES } from '../src/speech/speech.js';

test('locales cover English, Hindi and Marathi', () => {
  assert.deepEqual(LOCALES, { en: 'en-IN', hi: 'hi-IN', mr: 'mr-IN' });
});

test('speak uses the patient language and resolves when the utterance ends', async () => {
  const spoken = [];
  class Utterance { constructor(text) { this.text = text; } }
  const env = {
    SpeechSynthesisUtterance: Utterance,
    speechSynthesis: { cancel() {}, speak(u) { spoken.push(u); u.onend(); } },
  };
  const s = createSpeech(env);
  assert.equal(s.canSpeak, true);
  assert.equal(await s.speak('नमस्ते', 'hi', { rate: 0.7 }), true);
  assert.deepEqual([spoken[0].text, spoken[0].lang, spoken[0].rate], ['नमस्ते', 'hi-IN', 0.7]);
});

test('listen returns the transcript with its confidence, in the chosen language', async () => {
  let used;
  class Recognition {
    start() { used = this.lang; this.onresult({ results: [[{ transcript: ' सुनीता ', confidence: 0.82 }]] }); }
  }
  const s = createSpeech({ webkitSpeechRecognition: Recognition });
  assert.deepEqual(await s.listen('mr'), { transcript: 'सुनीता', confidence: 0.82 });
  assert.equal(used, 'mr-IN');
});

test('listen reports no-speech and unsupported browsers so the screen can fall back to touch', async () => {
  class Silent { start() { this.onerror({ error: 'no-speech' }); } }
  await assert.rejects(createSpeech({ SpeechRecognition: Silent }).listen('en'), /no-speech/);
  const none = createSpeech({});
  assert.equal(none.canListen, false);
  assert.equal(none.canSpeak, false);
  await assert.rejects(none.listen('en'), /unsupported/);
  assert.equal(await none.speak('hi', 'en'), false);
});

test('audio cue is silent and safe when the browser has no audio', () => {
  assert.equal(audioCue({}), false);
});
