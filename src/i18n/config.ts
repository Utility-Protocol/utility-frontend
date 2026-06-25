export const SUPPORTED_LOCALES = [
  "en-US",
  "es-MX",
  "pt-BR",
  "fr-FR",
  "de-DE",
  "ar-SA",
  "ja-JP",
  "zh-CN",
] as const;

export type Locale = (typeof SUPPORTED_LOCALES)[number];

export const DEFAULT_LOCALE: Locale = "en-US";

export function isRTL(locale: string) {
  return ["ar", "he"].some((p) => locale.startsWith(p));
}
