import IntlMessageFormat from "intl-messageformat";

export function formatMessage(
  message: string,
  values: Record<string, any> = {},
  locale: string = "en-US"
) {
  try {
    const mf = new IntlMessageFormat(message, locale);
    return mf.format(values) as string;
  } catch (e) {
    if (process.env.NODE_ENV === "development") {
      // helpful debug fallback
      return `[i18n:err] ${message}`;
    }
    return message;
  }
}
