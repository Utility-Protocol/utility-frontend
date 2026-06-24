"use client";

import { useEffect, useState } from "react";
import { DEFAULT_LOCALE, Locale, SUPPORTED_LOCALES } from "@/i18n/config";

export function useLocale() {
  const [locale, setLocaleState] = useState<Locale>(() => {
    if (typeof window === "undefined") return DEFAULT_LOCALE;
    return (window.localStorage.getItem("locale") as Locale) || DEFAULT_LOCALE;
  });

  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === "locale") {
        setLocaleState((e.newValue as Locale) || DEFAULT_LOCALE);
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const setLocale = (l: Locale) => {
    if (!SUPPORTED_LOCALES.includes(l)) {
      console.warn("unsupported locale", l);
      return;
    }
    window.localStorage.setItem("locale", l);
    setLocaleState(l);
    window.dispatchEvent(new CustomEvent("localeChange", { detail: l }));
  };

  return { locale, setLocale } as const;
}
