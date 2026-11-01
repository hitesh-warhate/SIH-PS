import { useState } from 'react';
import { useI18n } from '../i18n/index.jsx';
import { audioCue, speech } from '../speech/speech.js';
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

// Text field that can be filled by voice or typed. The captured text stays visible and editable for confirmation.
export function VoiceField({ label, value, onChange, onVoice, digits = false, type = 'text', hint, maxLength }) {
  const { t, lang } = useI18n();
  const [status, setStatus] = useState('');
  const listen = async () => {
    audioCue();
    setStatus(t('flow.mic.listening'));
    try {
      const { transcript, confidence } = await speech.listen(lang);
      const text = digits ? transcript.replace(/\D/g, '') : transcript;
      onChange(text);
      onVoice?.({ transcript, confidence });
      setStatus(t('flow.mic.captured', { text }));
    } catch (e) {
      setStatus(e.message === 'unsupported' ? t('flow.mic.unsupported') : t('flow.mic.retry'));
    }
  };
  return (
    <div className="field">
      <label>{label}</label>
      <div className="field-row">
        <input value={value} type={type} inputMode={digits ? 'numeric' : undefined} maxLength={maxLength}
          onChange={(e) => onChange(digits ? e.target.value.replace(/\D/g, '') : e.target.value)} />
        <button type="button" className="touch icon-button" onClick={listen} aria-label={t('icon.speak')}>
          <Icon name="speak" size={28} /><span>{t('icon.speak')}</span>
        </button>
      </div>
      {hint && <small>{hint}</small>}
      {status && <small role="status">{status}</small>}
    </div>
  );
}
