import { useState } from 'react';
import { useI18n } from '../i18n/index.jsx';
import { audioCue, speech } from '../speech/speech.js';
import { spokenDigits } from '../interview/matching.js';
import Icon from './Icon.jsx';

// Big choice button for patient screens: 64 px minimum, label always visible, audio cue on selection.
export function Choice({ children, onClick, selected = false, disabled = false, variant }) {
  return (
    <button type="button" className={`touch choice${selected ? ' is-selected' : ''}${variant ? ` choice-${variant}` : ''}`}
      aria-pressed={selected} disabled={disabled} onClick={() => { audioCue(); onClick(); }}>
      {children}
    </button>
  );
}

// Why listening failed, as translation keys the patient can act on.
export const MIC_ERROR = { unsupported: 'flow.mic.unsupported', denied: 'flow.mic.denied', 'no-mic': 'flow.mic.noMic', network: 'flow.mic.network', 'no-digits': 'flow.mic.noDigits' };

// Text field that can be filled by voice or typed. The words appear in the box while the patient speaks,
// and the captured text stays visible and editable for confirmation.
export function VoiceField({ label, value, onChange, onVoice, digits = false, type = 'text', hint, maxLength }) {
  const { t, lang } = useI18n();
  const [status, setStatus] = useState('');
  const [live, setLive] = useState(null); // the words heard so far, while listening
  const listen = async () => {
    audioCue();
    setStatus(t('flow.mic.listening'));
    setLive('');
    try {
      const { transcript, confidence, alternatives = [transcript] } = await speech.listen(lang, { onInterim: setLive });
      let text = transcript;
      if (digits) {
        // Numbers often come back as words or with spaces ("nine eight seven…"): take the guess with the expected count of digits.
        const options = alternatives.map(spokenDigits).filter(Boolean);
        text = options.find((d) => !maxLength || d.length === maxLength) ?? options[0] ?? '';
        if (!text) throw new Error('no-digits');
      }
      if (maxLength) text = text.slice(0, maxLength);
      onChange(text);
      onVoice?.({ transcript, confidence });
      setStatus(t('flow.mic.captured', { text }));
    } catch (e) {
      setStatus(t(MIC_ERROR[e.message] ?? 'flow.mic.retry'));
    } finally {
      setLive(null);
    }
  };
  const listening = live !== null;
  return (
    <div className="field">
      <label>{label}</label>
      <div className="field-row">
        <input value={listening ? live : value} type={type} inputMode={digits ? 'numeric' : undefined} maxLength={listening ? undefined : maxLength}
          readOnly={listening} className={listening ? 'is-live' : undefined} placeholder={listening ? t('flow.mic.listening') : undefined}
          onChange={(e) => onChange(digits ? e.target.value.replace(/\D/g, '') : e.target.value)} />
        <button type="button" className={`touch icon-button${listening ? ' is-listening' : ''}`} onClick={listen} disabled={listening} aria-label={t('icon.speak')}>
          <Icon name="speak" size={28} /><span>{t('icon.speak')}</span>
        </button>
      </div>
      {hint && <small>{hint}</small>}
      {status && !listening && <small role="status" className="mic-status">{status}</small>}
    </div>
  );
}
