import { LOCALE_TAGS, type Locale } from "@/i18n/config";

export function euros(locale: Locale, n: number | null): string | null {
  if (n === null || !Number.isFinite(n)) return null;
  return new Intl.NumberFormat(LOCALE_TAGS[locale].intl, { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(n);
}

export function numero(locale: Locale, n: number | string): string {
  return new Intl.NumberFormat(LOCALE_TAGS[locale].intl, { maximumFractionDigits: 0 }).format(Number(n));
}

export function metros(locale: Locale, m: number): string {
  return m >= 1000 ? `${new Intl.NumberFormat(LOCALE_TAGS[locale].intl, { maximumFractionDigits: 1 }).format(m / 1000)} km` : `${numero(locale, Math.round(m / 10) * 10)} m`;
}
