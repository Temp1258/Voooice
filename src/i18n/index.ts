import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import zhCN from './locales/zh-CN';
import enUS from './locales/en-US';

export type Locale = 'zh-CN' | 'en-US';

const LOCALE_STORAGE_KEY = 'voooice-locale';

const translations: Record<Locale, Record<string, string>> = {
  'zh-CN': zhCN,
  'en-US': enUS,
};

/**
 * Translate a key, with optional parameter interpolation.
 * Supports `{param}` syntax: t('voiceprints.count', { count: '3' })
 */
function translate(locale: Locale, key: string, params?: Record<string, string>): string {
  let text = translations[locale][key];
  if (text === undefined) {
    // Fallback to zh-CN, then return the key itself
    text = translations['zh-CN'][key] ?? key;
  }
  if (params) {
    for (const [paramKey, paramValue] of Object.entries(params)) {
      text = text.replace(new RegExp(`\\{${paramKey}\\}`, 'g'), paramValue);
    }
  }
  return text;
}

function detectBrowserLocale(): Locale {
  if (typeof navigator === 'undefined') return 'zh-CN';
  const lang = navigator.language || (navigator as { userLanguage?: string }).userLanguage || '';
  if (lang.startsWith('en')) return 'en-US';
  return 'zh-CN';
}

function getInitialLocale(): Locale {
  if (typeof localStorage !== 'undefined') {
    const stored = localStorage.getItem(LOCALE_STORAGE_KEY);
    if (stored === 'zh-CN' || stored === 'en-US') return stored;
  }
  return detectBrowserLocale();
}

interface I18nContextValue {
  t: (key: string, params?: Record<string, string>) => string;
  locale: Locale;
  setLocale: (locale: Locale) => void;
}

const I18nContext = createContext<I18nContextValue | null>(null);

export interface I18nProviderProps {
  children: React.ReactNode;
}

export function I18nProvider({ children }: I18nProviderProps): React.ReactElement {
  const [locale, setLocaleState] = useState<Locale>(getInitialLocale);

  const setLocale = useCallback((newLocale: Locale) => {
    setLocaleState(newLocale);
    try {
      localStorage.setItem(LOCALE_STORAGE_KEY, newLocale);
    } catch {
      // localStorage may be unavailable
    }
  }, []);

  // Persist initial detected locale
  useEffect(() => {
    try {
      if (!localStorage.getItem(LOCALE_STORAGE_KEY)) {
        localStorage.setItem(LOCALE_STORAGE_KEY, locale);
      }
    } catch {
      // ignore
    }
  }, [locale]);

  const t = useCallback(
    (key: string, params?: Record<string, string>) => translate(locale, key, params),
    [locale],
  );

  return React.createElement(
    I18nContext.Provider,
    { value: { t, locale, setLocale } },
    children,
  );
}

export function useI18n(): I18nContextValue {
  const ctx = useContext(I18nContext);
  if (!ctx) {
    throw new Error('useI18n must be used within an I18nProvider');
  }
  return ctx;
}

// Re-export the standalone translate function for use outside React
export { translate as t };
