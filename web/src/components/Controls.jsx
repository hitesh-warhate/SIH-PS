import { useEffect, useState } from 'react';
import { LANGUAGES, useI18n } from '../i18n/index.jsx';
import Icon from './Icon.jsx';

function useStoredFlag(key, onChange) {
  const [on, setOn] = useState(() => {
    try { return localStorage.getItem(key) === '1'; } catch { return false; }
  });
  useEffect(() => {
    onChange(on);
    try { localStorage.setItem(key, on ? '1' : '0'); } catch { /* storage unavailable */ }
  }, [key, on, onChange]);
  return [on, setOn];
}

const setTheme = (dark) => document.documentElement.classList.toggle('dark', dark);

// Light and dark, as a moon and a sun. The choice is remembered on this device.
export function ThemeToggle() {
  const { t } = useI18n();
  const [dark, setDark] = useStoredFlag('pc_dark', setTheme);
  const icon = (d) => <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d={d} fill="currentColor" /></svg>;
  return (
    <div className="theme-toggle" role="group" aria-label={t('settings.theme')}>
      <button type="button" aria-pressed={dark} aria-label={t('settings.dark')} title={t('settings.dark')} onClick={() => setDark(true)}>{icon('M20 14.500A8.500 8.500 0 019.500 4 8.500 8.500 0 1020 14.500z')}</button>
      <button type="button" aria-pressed={!dark} aria-label={t('settings.light')} title={t('settings.light')} onClick={() => setDark(false)}>{icon('M12 7a5 5 0 100 10 5 5 0 000-10zM11 1h2v3h-2zm0 19h2v3h-2zM1 11h3v2H1zm19 0h3v2h-3zM4.200 5.600L5.600 4.200l2.100 2.100-1.400 1.400zm12.100 12.100l1.400-1.400 2.100 2.100-1.400 1.400zM4.200 18.400l2.100-2.100 1.400 1.400-2.100 2.100zM16.300 6.300l2.100-2.100 1.400 1.400-2.100 2.100z')}</button>
    </div>
  );
}

// Applied once at start-up, so large text, contrast and theme hold on every page even when their switches are not on screen.
export function applyStoredPreferences() {
  try {
    document.documentElement.classList.toggle('large-text', localStorage.getItem('pc_large_text') === '1');
    document.documentElement.classList.toggle('high-contrast', localStorage.getItem('pc_high_contrast') === '1');
    document.documentElement.classList.toggle('dark', localStorage.getItem('pc_dark') === '1');
  } catch { /* storage unavailable: the defaults apply */ }
}

const setLargeText = (on) => document.documentElement.classList.toggle('large-text', on);
const setContrast = (on) => document.documentElement.classList.toggle('high-contrast', on);

export function LanguageSwitch() {
  const { lang, setLang, t } = useI18n();
  return (
    <div className="lang-switch" role="group" aria-label={t('icon.language')}>
      <Icon name="language" size={24} />
      {LANGUAGES.map((l) => (
        <button key={l.code} type="button" className={`touch lang-btn${l.code === lang ? ' is-active' : ''}`}
          aria-pressed={l.code === lang} onClick={() => setLang(l.code)}>
          {l.label}
        </button>
      ))}
    </div>
  );
}

export function AccessibilityToggles() {
  const { t } = useI18n();
  const [large, setLarge] = useStoredFlag('pc_large_text', setLargeText);
  const [contrast, setHc] = useStoredFlag('pc_high_contrast', setContrast);
  return (
    <div className="a11y-toggles">
      <label><input type="checkbox" checked={large} onChange={(e) => setLarge(e.target.checked)} /> {t('settings.largeText')}</label>
      <label><input type="checkbox" checked={contrast} onChange={(e) => setHc(e.target.checked)} /> {t('settings.highContrast')}</label>
    </div>
  );
}

// Text size, contrast and light or dark, folded behind one "Aa Display" button so the top bar stays simple.
export function DisplayMenu() {
  const { t } = useI18n();
  return (
    <details className="display-menu">
      <summary className="touch"><span className="aa" aria-hidden="true">Aa</span> {t('display.title')}</summary>
      <div className="display-pop">
        <AccessibilityToggles />
        <ThemeToggle />
      </div>
    </details>
  );
}
