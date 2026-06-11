import { createContext } from 'react';
import type { Lang } from './translations';

interface LanguageContextValue {
  lang: Lang;
  setLang: (lang: Lang) => void;
}

export const LanguageContext = createContext<LanguageContextValue>({
  lang: 'ka',
  setLang: () => {},
});
