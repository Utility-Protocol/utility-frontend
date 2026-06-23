"use client";

import React, { createContext, useContext, useEffect, useState } from "react";
import { DEFAULT_LOCALE, isRTL, Locale, SUPPORTED_LOCALES } from "./config";
import { formatMessage } from "./icu";

type Translations = Record<string, string>;

type I18nContextValue = {
  locale: Locale;
  t: (key: string, values?: Record<string, any>) => string;
  setLocale: (l: Locale) => void;
  translations: Translations | null;
};

const I18nContext = createContext<I18nContextValue | undefined>(undefined);

export function useI18nContext() {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useI18nContext must be used within I18nProvider");
  return ctx;
}

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(() => {
    if (typeof window === "undefined") return DEFAULT_LOCALE;
    return (window.localStorage.getItem("locale") as Locale) || (DEFAULT_LOCALE as Locale);
  });
  const [translations, setTranslations] = useState<Translations | null>(null);

  useEffect(() => {
    let mounted = true;
    async function load() {
      try {
        // dynamic import of JSON bundles; ensure they're not in the initial chunk
        const mod = await import(/* webpackChunkName: "locale-[request]" */ `./locales/${locale}.json`);
        if (!mounted) return;
        setTranslations(mod.default || mod);
      } catch (e) {
        if (locale !== DEFAULT_LOCALE) {
          // try fallback
          const mod = await import(/* webpackChunkName: "locale-en-US" */ `./locales/${DEFAULT_LOCALE}.json`);
          setTranslations(mod.default || mod);
        } else {
          setTranslations({});
        }
      }
    }
    load();
    return () => {
      mounted = false;
    };
  }, [locale]);

  useEffect(() => {
    if (typeof document !== "undefined") {
      document.documentElement.lang = locale;
      document.documentElement.dir = isRTL(locale) ? "rtl" : "ltr";
    }
  }, [locale]);

  const setLocale = (l: Locale) => {
    if (!SUPPORTED_LOCALES.includes(l)) {
      console.warn("Attempt to set unsupported locale", l);
      return;
    }
    window.localStorage.setItem("locale", l);
    setLocaleState(l);
  };

  const t = (key: string, values: Record<string, any> = {}) => {
    const msg = translations?.[key] ?? undefined;
    if (!msg) {
      if (process.env.NODE_ENV === "development") {
        console.warn(`i18n: missing key ${key} for locale ${locale}`);
        return `[${key}]`;
      }
      // fallback to key or en-US
      return key;
    }
    return formatMessage(msg, values, locale);
  };

  const ctx: I18nContextValue = {
    locale,
    t,
    setLocale,
    translations,
  };

  return <I18nContext.Provider value={ctx}>{children}</I18nContext.Provider>;
}
