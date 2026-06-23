"use client";

import React from "react";
import { useTranslation } from "@/i18n/useTranslation";
import { SUPPORTED_LOCALES, Locale } from "@/i18n/config";

const FLAGS: Record<string, string> = {
  "en-US": "🇺🇸",
  "es-MX": "🇲🇽",
  "pt-BR": "🇧🇷",
  "fr-FR": "🇫🇷",
  "de-DE": "🇩🇪",
  "ar-SA": "🇸🇦",
  "ja-JP": "🇯🇵",
  "zh-CN": "🇨🇳",
};

export function LanguageSwitcher() {
  const { locale, setLocale, t } = useTranslation();

  return (
    <label className="flex items-center gap-2">
      <span>{FLAGS[locale] ?? "🌐"}</span>
      <select
        aria-label={t("settings.language")}
        value={locale}
        onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setLocale(e.target.value as Locale)}
        className="rounded border px-2 py-1"
      >
        {SUPPORTED_LOCALES.map((l) => (
          <option key={l} value={l}>
            {FLAGS[l]} {l}
          </option>
        ))}
      </select>
    </label>
  );
}
