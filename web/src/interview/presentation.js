// How a question is presented in each listening mode (PRD 8.2). One function decides it for every question,
// main or follow-up, so the chosen mode carries into adaptive follow-ups (FR-A11).
export const MODES = ['listen_speak', 'listen_tap', 'read_tap'];

export function presentation(mode) {
  switch (mode) {
    case 'listen_speak': return { speakPrompt: true, openMic: true, showOptions: false, tapAvailable: true };
    case 'listen_tap': return { speakPrompt: true, openMic: false, showOptions: true, tapAvailable: true };
    case 'read_tap': return { speakPrompt: false, openMic: false, showOptions: true, tapAvailable: true };
    default: return null; // no mode chosen yet: show the selector
  }
}

// A mode changed from the header applies from the next question, never to the one already on screen.
export function modeForNextQuestion(current, pending) {
  return pending ?? current;
}

// The icons that make up each mode card (🔊 + 🎤, 🔊 + 👆, 📖 + 👆).
export const MODE_ICONS = { listen_speak: ['listen', 'speak'], listen_tap: ['listen', 'tap'], read_tap: ['read', 'tap'] };
