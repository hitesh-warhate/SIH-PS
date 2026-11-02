// Thin speech adapter (Phase 1). Wraps the browser speech APIs so screens can speak a prompt and listen for an answer.
// Phase 2 hardens it (Bhashini / AI4Bharat models, noise handling, benchmarks) behind this same interface.
export const LOCALES = { en: 'en-IN', hi: 'hi-IN', mr: 'mr-IN' };

// How long a single listen may run before it is stopped, so a missed "end of speech" never leaves the microphone open.
const MAX_LISTEN_MS = 12_000;
// Browser error codes, folded into the few cases the screens explain differently.
const ERRORS = { 'no-speech': 'no-speech', aborted: 'no-speech', 'not-allowed': 'denied', 'service-not-allowed': 'denied', 'audio-capture': 'no-mic', network: 'network' };

export function createSpeech(env = globalThis) {
  const synth = env.speechSynthesis;
  const Recognition = env.SpeechRecognition ?? env.webkitSpeechRecognition;
  const Utterance = env.SpeechSynthesisUtterance;

  return {
    canSpeak: Boolean(synth && Utterance),
    canListen: Boolean(Recognition),

    speak(text, lang, { rate = 1 } = {}) {
      if (!synth || !Utterance) return Promise.resolve(false);
      synth.cancel();
      return new Promise((resolve) => {
        const u = new Utterance(text);
        u.lang = LOCALES[lang] ?? LOCALES.en;
        u.rate = rate;
        u.onend = () => resolve(true);
        u.onerror = () => resolve(false);
        synth.speak(u);
      });
    },

    stopSpeaking() { synth?.cancel(); },

    // Resolves { transcript, confidence, alternatives }: the best guess plus the recognizer's other guesses, best first.
    // `onInterim(text)` receives the words while the patient is still speaking, so the screen can show them live.
    // Rejects with Error('unsupported' | 'no-speech' | 'denied' | 'no-mic' | 'network' | 'error').
    listen(lang, { onInterim } = {}) {
      if (!Recognition) return Promise.reject(new Error('unsupported'));
      // The prompt being read aloud would otherwise be picked up by the microphone as the patient's answer.
      synth?.cancel();
      return new Promise((resolve, reject) => {
        const r = new Recognition();
        r.lang = LOCALES[lang] ?? LOCALES.en;
        r.interimResults = Boolean(onInterim);
        r.continuous = false;
        r.maxAlternatives = 5;
        let settled = false;
        const finish = (fn, arg) => { if (settled) return; settled = true; clearTimeout(timer); fn(arg); };
        const timer = setTimeout(() => { try { r.stop(); } catch { /* already stopped */ } }, MAX_LISTEN_MS);

        r.onresult = (e) => {
          const results = Array.from(e.results ?? []);
          const final = results.find((res) => res.isFinal !== false);
          if (!final) {
            onInterim?.(results.map((res) => res[0]?.transcript ?? '').join(' ').trim());
            return;
          }
          const alternatives = Array.from(final).map((a) => a?.transcript?.trim()).filter(Boolean);
          if (!alternatives.length) return finish(reject, new Error('no-speech'));
          finish(resolve, { transcript: alternatives[0], confidence: final[0].confidence ?? null, alternatives });
        };
        r.onnomatch = () => finish(reject, new Error('no-speech'));
        r.onerror = (e) => finish(reject, new Error(ERRORS[e.error] ?? 'error'));
        r.onend = () => finish(reject, new Error('no-speech'));
        try { r.start(); } catch { finish(reject, new Error('error')); }
      });
    },
  };
}

// Short tone on every selection, so the choice is confirmed without reading (PRD 8.3).
export function audioCue(env = globalThis) {
  const Ctx = env.AudioContext ?? env.webkitAudioContext;
  if (!Ctx) return false;
  try {
    const ctx = new Ctx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.frequency.value = 660;
    gain.gain.value = 0.08;
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.08);
    osc.onended = () => ctx.close();
    return true;
  } catch {
    return false;
  }
}

export const speech = createSpeech();
