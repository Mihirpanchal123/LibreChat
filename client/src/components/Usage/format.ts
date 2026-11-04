import { CREDITS_PER_USD } from 'librechat-data-provider';

export function formatCompact(value: number, locale: string) {
  return new Intl.NumberFormat(locale, { notation: 'compact', maximumFractionDigits: 1 }).format(
    value,
  );
}

export function formatExact(value: number, locale: string) {
  return new Intl.NumberFormat(locale).format(value);
}

export function formatCost(credits: number, locale: string) {
  const usd = credits / CREDITS_PER_USD;
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: usd > 0 && usd < 0.01 ? 4 : 2,
  }).format(usd);
}

export function formatDateTime(value: string, locale: string) {
  return new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(
    new Date(value),
  );
}

export function responseStatus(error: unknown) {
  return (error as { response?: { status?: number } } | undefined)?.response?.status;
}
