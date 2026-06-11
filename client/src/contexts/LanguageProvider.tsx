import { useState, type ReactNode } from 'react';
import { LanguageContext } from './LanguageContext';
import type { Lang } from './translations';

const STORAGE_KEY = 'app_lang';

function getSavedLang(): Lang {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v === 'en' || v === 'ka') return v;
  } catch { /* storage blocked */ }
  return 'ka';
}

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(getSavedLang);

  const setLang = (next: Lang) => {
    setLangState(next);
    try { localStorage.setItem(STORAGE_KEY, next); } catch { /* ignore */ }
  };

  return (
    <LanguageContext.Provider value={{ lang, setLang }}>
      {children}
    </LanguageContext.Provider>
  );
}
