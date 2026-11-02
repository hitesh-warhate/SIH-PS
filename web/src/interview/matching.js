// Turns a spoken answer into an ontology value (the voice half of "answerable by speaking or tapping", FR-A2).
// Pure functions, no browser APIs, so the whole question bank can be checked automatically in every language.
const DIGITS = { '०': '0', '१': '1', '२': '2', '३': '3', '४': '4', '५': '5', '६': '6', '७': '7', '८': '8', '९': '9' };

export const normalize = (s) => String(s ?? '').toLowerCase().replace(/[०-९]/g, (d) => DIGITS[d]).replace(/[.,!?;:()'"।/-]/g, ' ').replace(/\s+/g, ' ').trim();

// Recognizers set to Hindi or Marathi sometimes return the answer in Latin letters ("haan", "nahi"), so both scripts are accepted.
const YES = ['yes', 'yeah', 'yep', 'ok', 'okay', 'haan', 'han', 'haa', 'hoy', 'ho', 'हाँ', 'हां', 'जी हाँ', 'जी', 'होय', 'हो'];
const NO = ['no', 'nope', 'nahi', 'nahin', 'nai', 'nako','नहीं', 'नही', 'ना', 'नाही', 'नको'];
const NUMBER_WORDS = {
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  शून्य: 0, एक: 1, दो: 2, तीन: 3, चार: 4, पाँच: 5, पांच: 5, छह: 6, छः: 6, सात: 7, आठ: 8, नौ: 9, दस: 10,
  शुन्य: 0, दोन: 2, पाच: 5, सहा: 6, नऊ: 9, दहा: 10,
};
const REPEAT = { double: 2, triple: 3, डबल: 2, ट्रिपल: 3 };

const words = (s) => normalize(s).split(' ');
const hasPhrase = (text, phrase) => ` ${normalize(text)} `.includes(` ${normalize(phrase)} `);

// Digits from a dictated number: "nine eight seven", "98765 43210", "९८७६५", "double five" all become digits, in order.
// Used for mobile numbers, codes and ages, where the recognizer often writes the digits as words or with spaces.
export function spokenDigits(transcript) {
  let out = '';
  let repeat = 1;
  for (const w of words(transcript)) {
    if (REPEAT[w]) { repeat = REPEAT[w]; continue; }
    const d = /^\d+$/.test(w) ? w : NUMBER_WORDS[w] !== undefined ? String(NUMBER_WORDS[w]) : '';
    if (d) out += d.length === 1 ? d.repeat(repeat) : d;
    repeat = 1;
  }
  return out;
}

// Words that carry meaning in an option label ("pain", "chest"), without the small joining words.
const STOP = new Set(['a', 'an', 'the', 'of', 'and', 'or', 'in', 'on', 'with', 'to', 'my', 'i', 'is', 'it', 'have', 'has', 'am', 'are', 'any', 'these', 'this', 'that', 'some', 'very',
  'है', 'हैं', 'में', 'और', 'या', 'का', 'की', 'के', 'से', 'मुझे', 'मेरा', 'मेरी', 'आहे', 'आणि', 'किंवा', 'मला', 'माझा', 'माझी', 'चा', 'ची', 'चे', 'ने', 'ला']);
const keyWords = (s) => words(s).filter((w) => w.length > 1 && !STOP.has(w));

// The share of an option's key words that the patient said (0 to 1), for answers that do not repeat the label word for word.
function overlap(text, label) {
  const said = new Set(words(text));
  const need = keyWords(label);
  if (!need.length) return 0;
  return need.filter((w) => said.has(w)).length / need.length;
}
// Share of key words needed: half for a one-answer question (with one option clearly ahead), more where several answers can be picked.
const FUZZY_MIN = { single: 0.5, multi: 0.6 };

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
      let kept = hits.filter((o, i) => !hits.slice(0, i).some((longer) => normalize(longer.label).includes(normalize(o.label))));
      // Nothing said word for word: accept the option whose key words were mostly said ("my chest hurts badly" → "Chest pain"
      // only if enough of its words are there), and only when one option is clearly ahead, so an unclear answer is never guessed.
      if (!kept.length) {
        const scored = question.options.map((o) => ({ o, s: overlap(text, o.label) })).filter((x) => x.s >= FUZZY_MIN[question.type]).sort((a, b) => b.s - a.s);
        if (question.type === 'single') kept = scored.length && (scored.length === 1 || scored[0].s > scored[1].s) ? [scored[0].o] : [];
        else kept = scored.map((x) => x.o);
      }
      if (!kept.length) return null;
      if (question.type === 'single') return kept.length === 1 ? { value: kept[0].value } : null;
      const values = kept.map((o) => o.value);
      return { value: values.includes('none') && values.length > 1 ? values.filter((v) => v !== 'none') : values };
    }
    default: return null;
  }
}

// Tries the recognizer's guesses in order (best first) and returns the first that gives a clear answer, with the words that matched.
export function matchSpokenAny(question, lang, alternatives) {
  for (const said of alternatives ?? []) {
    const m = matchSpoken(question, lang, said);
    if (m) return { ...m, transcript: said };
  }
  return null;
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
