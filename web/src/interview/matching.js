// Turns a spoken answer into an ontology value (the voice half of "answerable by speaking or tapping", FR-A2).
// Pure functions, no browser APIs, so the whole question bank can be checked automatically in every language.
const DIGITS = { '०': '0', '१': '1', '२': '2', '३': '3', '४': '4', '५': '5', '६': '6', '७': '7', '८': '8', '९': '9' };

export const normalize = (s) => String(s ?? '').toLowerCase().replace(/[०-९]/g, (d) => DIGITS[d]).replace(/[.,!?;:()'"।/-]/g, ' ').replace(/\s+/g, ' ').trim();

const YES = ['yes', 'yeah', 'yep', 'ok', 'okay', 'हाँ', 'हां', 'जी हाँ', 'जी', 'होय', 'हो'];
const NO = ['no', 'nope', 'नहीं', 'नही', 'ना', 'नाही', 'नको'];
const NUMBER_WORDS = {
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  शून्य: 0, एक: 1, दो: 2, तीन: 3, चार: 4, पाँच: 5, पांच: 5, छह: 6, छः: 6, सात: 7, आठ: 8, नौ: 9, दस: 10,
  शुन्य: 0, दोन: 2, पाच: 5, सहा: 6, नऊ: 9, दहा: 10,
};

const words = (s) => normalize(s).split(' ');
const hasPhrase = (text, phrase) => ` ${normalize(text)} `.includes(` ${normalize(phrase)} `);

// Returns { value } or null when nothing in the transcript matches (the caller counts that as a failed recognition).
export function matchSpoken(question, lang, transcript) {
  const text = normalize(transcript);
  if (!text) return null;
  switch (question.type) {
    case 'text': return { value: String(transcript).trim() };
    case 'yes_no': {
      const w = words(text);
      const yes = YES.some((y) => (y.includes(' ') ? hasPhrase(text, y) : w.includes(normalize(y))));
      const no = NO.some((n) => w.includes(normalize(n)));
      if (yes === no) return null; // neither, or both: ambiguous, ask again
      return { value: yes ? 'yes' : 'no' };
    }
    case 'number': {
      const digit = text.match(/\d+(\.\d+)?/);
      const n = digit ? Number(digit[0]) : words(text).map((w) => NUMBER_WORDS[w]).find((v) => v !== undefined);
      if (n === undefined || n < (question.min ?? 0) || n > (question.max ?? 120)) return null;
      return { value: n };
    }
    case 'single':
    case 'multi': {
      // A longer label wins over a shorter one that it contains ("Chest pain with difficulty breathing" over "Chest pain").
      const hits = question.options.filter((o) => hasPhrase(text, o.label)).sort((a, b) => b.label.length - a.label.length);
      const kept = hits.filter((o, i) => !hits.slice(0, i).some((longer) => normalize(longer.label).includes(normalize(o.label))));
      if (!kept.length) return null;
      if (question.type === 'single') return kept.length === 1 ? { value: kept[0].value } : null;
      const values = kept.map((o) => o.value);
      return { value: values.includes('none') && values.length > 1 ? values.filter((v) => v !== 'none') : values };
    }
    default: return null;
  }
}

export function labelFor(question, value) {
  if (question.type === 'yes_no') return question.options?.find((o) => o.value === value)?.label ?? value;
  if (question.type === 'single') return question.options.find((o) => o.value === value)?.label ?? String(value);
  if (question.type === 'multi') return value.map((v) => question.options.find((o) => o.value === v)?.label ?? v).join(', ');
  return String(value);
}

// Below this recognizer confidence the answer is treated as not understood.
export const MIN_CONFIDENCE = 0.4;
export const isConfident = (confidence) => confidence == null || confidence >= MIN_CONFIDENCE;
