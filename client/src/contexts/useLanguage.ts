import { useContext } from 'react';
import { LanguageContext } from './LanguageContext';
import { translations } from './translations';

export function useLanguage() {
  const { lang, setLang } = useContext(LanguageContext);
  const t = translations[lang];
  return { lang, setLang, t };
}
