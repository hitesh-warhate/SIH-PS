import { test } from 'node:test';
import assert from 'node:assert/strict';
import { summarize, wordErrorRate } from '../src/speech/wer.js';

test('word error rate counts substitutions, deletions and insertions', () => {
  assert.equal(wordErrorRate('i have chest pain', 'i have chest pain'), 0);
  assert.equal(wordErrorRate('i have chest pain', 'i have chest rain'), 0.25); // 1 substitution
  assert.equal(wordErrorRate('i have chest pain', 'i have pain'), 0.25);       // 1 deletion
  assert.equal(wordErrorRate('i have pain', 'i have chest pain'), 1 / 3);      // 1 insertion
  assert.equal(wordErrorRate('', 'anything'), 1);
  assert.equal(wordErrorRate('मला ताप आहे', 'मला ताप आहे।'), 0);
});

test('the summary sums errors per language and condition rather than averaging utterances', () => {
  const rows = [
    { lang: 'mr', condition: 'noisy-ward', reference: 'मला ताप आहे', hypothesis: 'मला ताप' },      // 1 / 3
    { lang: 'mr', condition: 'noisy-ward', reference: 'पोट दुखते', hypothesis: 'पोट दुखते' },      // 0 / 2
    { lang: 'en', condition: 'quiet', reference: 'fever for three days', hypothesis: 'fever for three days' },
  ];
  const [en, mr] = summarize(rows);
  assert.deepEqual([en.lang, en.wer, en.utterances], ['en', 0, 1]);
  assert.deepEqual([mr.lang, mr.words, mr.utterances], ['mr', 5, 2]);
  assert.equal(mr.wer, 1 / 5);
});
