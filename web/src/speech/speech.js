// Thin speech adapter (Phase 1). Wraps the browser speech APIs so screens can speak a prompt and listen for an answer.
// Phase 2 hardens it (Bhashini / AI4Bharat models, noise handling, benchmarks) behind this same interface.
export const LOCALES = { en: 'en-IN', hi: 'hi-IN', mr: 'mr-IN' };

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

    // Resolves { transcript, confidence }; rejects with Error('unsupported' | 'no-speech' | 'error').
    listen(lang) {
      if (!Recognition) return Promise.reject(new Error('unsupported'));
      return new Promise((resolve, reject) => {
        const r = new Recognition();
        r.lang = LOCALES[lang] ?? LOCALES.en;
        r.interimResults = false;
        r.maxAlternatives = 1;
        r.onresult = (e) => {
          const best = e.results?.[0]?.[0];
          if (best?.transcript) resolve({ transcript: best.transcript.trim(), confidence: best.confidence ?? null });
          else reject(new Error('no-speech'));
        };
        r.onnomatch = () => reject(new Error('no-speech'));
        r.onerror = (e) => reject(new Error(e.error === 'no-speech' ? 'no-speech' : 'error'));
        r.start();
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
