import { Locale } from "@/i18n/config";

export function formatNumber(value: number, locale: Locale, opts?: Intl.NumberFormatOptions) {
  return new Intl.NumberFormat(locale, opts).format(value);
}

export function formatCurrency(value: number, locale: Locale, currency: string) {
  return new Intl.NumberFormat(locale, { style: "currency", currency }).format(value);
}

export function formatDate(date: Date | string | number, locale: Locale, opts?: Intl.DateTimeFormatOptions) {
  const d = typeof date === "string" || typeof date === "number" ? new Date(date) : date;
  return new Intl.DateTimeFormat(locale, opts).format(d);
}
