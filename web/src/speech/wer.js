// Word error rate for the ASR benchmark: (substitutions + deletions + insertions) / words in the reference.
export const words = (s) => String(s ?? '').toLowerCase().replace(/[.,!?;:()'"।]/g, ' ').split(/\s+/).filter(Boolean);

export function wordErrorRate(reference, hypothesis) {
  const r = words(reference);
  const h = words(hypothesis);
  if (!r.length) return h.length ? 1 : 0;
  let prev = Array.from({ length: h.length + 1 }, (_, j) => j);
  for (let i = 1; i <= r.length; i++) {
    const cur = [i];
    for (let j = 1; j <= h.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (r[i - 1] === h[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[h.length] / r.length;
}

// rows: [{ lang, condition, reference, hypothesis }] -> corpus-level WER per language and condition (errors summed, not averaged).
export function summarize(rows) {
  const groups = new Map();
  for (const row of rows) {
    const key = `${row.lang}\t${row.condition}`;
    const g = groups.get(key) ?? { lang: row.lang, condition: row.condition, errors: 0, words: 0, utterances: 0 };
    const n = words(row.reference).length;
    g.errors += wordErrorRate(row.reference, row.hypothesis) * n;
    g.words += n;
    g.utterances += 1;
    groups.set(key, g);
  }
  return [...groups.values()].map((g) => ({ ...g, wer: g.words ? g.errors / g.words : 0 }))
    .sort((a, b) => a.lang.localeCompare(b.lang) || a.condition.localeCompare(b.condition));
}
