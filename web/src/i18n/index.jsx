import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import en from './en.json';
import hi from './hi.json';
import mr from './mr.json';

export const LANGUAGES = [
  { code: 'en', label: 'English' },
  { code: 'hi', label: 'हिंदी' },
  { code: 'mr', label: 'मराठी' },
];
export const dictionaries = { en, hi, mr };

const I18nContext = createContext(null);

// Language lives in this provider, above the router, so switching it never resets the user's place or state.
export function I18nProvider({ children }) {
  const [lang, setLangState] = useState(() => {
    try {
      const saved = localStorage.getItem('pc_lang');
      return saved in dictionaries ? saved : 'en';
    } catch {
      return 'en';
    }
  });

  const setLang = useCallback((code) => {
    if (!(code in dictionaries)) return;
    setLangState(code);
    try { localStorage.setItem('pc_lang', code); } catch { /* storage unavailable */ }
  }, []);

  useEffect(() => { document.documentElement.lang = lang; }, [lang]);

  const value = useMemo(() => {
    const t = (key, params = {}) => {
      const text = dictionaries[lang][key] ?? dictionaries.en[key] ?? key;
      return text.replace(/\{(\w+)\}/g, (_, k) => params[k] ?? `{${k}}`);
    };
    return { lang, setLang, t };
  }, [lang, setLang]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('useI18n must be used inside I18nProvider');
  return ctx;
}
