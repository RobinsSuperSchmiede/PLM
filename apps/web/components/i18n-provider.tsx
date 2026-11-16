'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

import { dictionaries, loadDictionary, translate, type Dictionary, type TranslationKey } from '@/lib/i18n';
import { isLanguage } from '@/lib/languages';
import type { Language } from '@/lib/types';

const storageKey = 'plm-language';

type I18nContextValue = {
  language: Language;
  setLanguage: (language: Language) => void;
  t: (key: TranslationKey, vars?: Record<string, string | number>) => string;
};

const I18nContext = createContext<I18nContextValue | null>(null);

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [language, setLanguageState] = useState<Language>('de');
  // Until a language pack has loaded, English is shown (German and English are always there).
  const [dictionary, setDictionary] = useState<Dictionary>(dictionaries.de!);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(storageKey);
      if (isLanguage(stored)) setLanguageState(stored);
    } catch {
      // Storage may be unavailable (private mode); the server setting is applied once loaded.
    }
  }, []);

  useEffect(() => {
    document.documentElement.lang = language;
    let current = true;
    const ready = dictionaries[language];
    if (ready) {
      setDictionary(ready);
    } else {
      setDictionary(dictionaries.en!);
      loadDictionary(language).then((loaded) => { if (current) setDictionary(loaded); }).catch(() => undefined);
    }
    return () => { current = false; };
  }, [language]);

  const setLanguage = useCallback((next: Language) => {
    setLanguageState(next);
    try {
      window.localStorage.setItem(storageKey, next);
    } catch {
      // Ignore – the language is also persisted in the database settings.
    }
  }, []);

  const t = useCallback<I18nContextValue['t']>((key, vars) => translate(dictionary, key, vars), [dictionary]);
  const value = useMemo(() => ({ language, setLanguage, t }), [language, setLanguage, t]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const context = useContext(I18nContext);
  if (!context) throw new Error('useI18n must be used within I18nProvider');
  return context;
}
