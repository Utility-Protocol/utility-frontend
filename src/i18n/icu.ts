import IntlMessageFormat from "intl-messageformat";

export function formatMessage(
  message: string,
  values: Record<string, unknown> = {},
  locale = "en-US"
): string {
  try {
    const mf = new IntlMessageFormat(message, locale);
    return mf.format(values) as string;
  } catch (err) {
    if (process.env.NODE_ENV === "development") {
      console.warn("i18n.formatMessage error:", err);
      // helpful debug fallback
      return `[i18n:err] ${message}`;
    }
    return message;
  }
}
