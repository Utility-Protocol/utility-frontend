"use client";

import { useI18nContext } from "./I18nProvider";

export function useTranslation() {
  const { t, locale, setLocale } = useI18nContext();

  const formatNumber = (value: number, opts?: Intl.NumberFormatOptions) => {
    return new Intl.NumberFormat(locale, opts).format(value);
  };

  const formatCurrency = (value: number, currency: string, opts?: Intl.NumberFormatOptions) => {
    return new Intl.NumberFormat(locale, { style: "currency", currency, ...opts }).format(value);
  };

  const formatDate = (date: Date | string | number, opts?: Intl.DateTimeFormatOptions) => {
    const d = typeof date === "string" || typeof date === "number" ? new Date(date) : date;
    return new Intl.DateTimeFormat(locale, opts).format(d);
  };

  return {
    t,
    locale,
    setLocale,
    formatNumber,
    formatCurrency,
    formatDate,
  };
}
