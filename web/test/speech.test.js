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

test('listen returns the transcript with its confidence and the other guesses, in the chosen language', async () => {
  let used;
  class Recognition {
    start() { used = this; this.onresult({ results: [[{ transcript: ' सुनीता ', confidence: 0.82 }, { transcript: 'सुनिता' }]] }); }
  }
  const s = createSpeech({ webkitSpeechRecognition: Recognition });
  assert.deepEqual(await s.listen('mr'), { transcript: 'सुनीता', confidence: 0.82, alternatives: ['सुनीता', 'सुनिता'] });
  assert.equal(used.lang, 'mr-IN');
  assert.equal(used.maxAlternatives, 5);
});

test('listen shows words while speaking, and stops reading the prompt aloud first', async () => {
  let cancelled = 0;
  const interim = [];
  class Recognition {
    start() {
      this.onresult({ results: [Object.assign([{ transcript: 'chest' }], { isFinal: false })] });
      this.onresult({ results: [Object.assign([{ transcript: 'chest pain', confidence: 0.9 }], { isFinal: true })] });
      this.onend();
    }
  }
  const s = createSpeech({ SpeechRecognition: Recognition, speechSynthesis: { cancel() { cancelled++; } } });
  const r = await s.listen('en', { onInterim: (x) => interim.push(x) });
  assert.equal(r.transcript, 'chest pain');
  assert.deepEqual(interim, ['chest']);
  assert.equal(cancelled, 1);
});

test('listen tells a blocked or missing microphone apart from silence', async () => {
  const failing = (error) => createSpeech({ SpeechRecognition: class { start() { this.onerror({ error }); } } }).listen('en');
  await assert.rejects(failing('not-allowed'), /denied/);
  await assert.rejects(failing('audio-capture'), /no-mic/);
  await assert.rejects(failing('network'), /network/);
  await assert.rejects(failing('no-speech'), /no-speech/);
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
