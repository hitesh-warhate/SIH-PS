// Usage: node web/scripts/benchmark-wer.js results.tsv
// results.tsv has one utterance per line, tab separated: lang  condition  reference  hypothesis
//   lang: en | hi | mr      condition: quiet | noisy-ward | ...      hypothesis: what the engine returned for the recording
import { readFileSync } from 'node:fs';
import { summarize } from '../src/speech/wer.js';

const file = process.argv[2];
if (!file) {
  console.error('Usage: node web/scripts/benchmark-wer.js results.tsv');
  process.exit(1);
}
const rows = readFileSync(file, 'utf8').split(/\r?\n/).filter((l) => l.trim() && !l.startsWith('#')).map((l) => {
  const [lang, condition, reference, hypothesis = ''] = l.split('\t');
  return { lang, condition, reference, hypothesis };
});

console.log('| Language | Condition | Utterances | Words | WER |\n|---|---|---|---|---|');
for (const g of summarize(rows)) console.log(`| ${g.lang} | ${g.condition} | ${g.utterances} | ${g.words} | ${(g.wer * 100).toFixed(1)}% |`);
