import type { Language } from '@/lib/types';

export const toDateKey = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

export const fromDateKey = (key: string) => new Date(`${key}T12:00:00`);

export const todayKey = () => toDateKey(new Date());

export function addDays(date: Date, amount: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + amount);
  return next;
}

const locales: Record<Language, string> = { de: 'de-DE', en: 'en-US' };

export function formatDate(key: string, language: Language, options: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short' }) {
  return fromDateKey(key).toLocaleDateString(locales[language], options);
}

export function formatDateTime(iso: string, language: Language) {
  return new Date(iso).toLocaleString(locales[language], { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

export function formatMonth(date: Date, language: Language) {
  return date.toLocaleDateString(locales[language], { month: 'long', year: 'numeric' });
}

export function weekdayNames(language: Language) {
  const monday = new Date(2024, 0, 1);
  return Array.from({ length: 7 }, (_, index) => addDays(monday, index).toLocaleDateString(locales[language], { weekday: 'short' }));
}

/** Relative label (today/tomorrow/yesterday) or a short date. */
export function relativeDay(key: string, language: Language, labels: { today: string; tomorrow: string; yesterday: string }) {
  const diff = Math.round((fromDateKey(key).getTime() - fromDateKey(todayKey()).getTime()) / 86_400_000);
  if (diff === 0) return labels.today;
  if (diff === 1) return labels.tomorrow;
  if (diff === -1) return labels.yesterday;
  return formatDate(key, language);
}

/** Value for a datetime-local input (YYYY-MM-DDTHH:MM) in the browser's local time. */
export const toDateTimeKey = (date: Date) =>
  `${toDateKey(date)}T${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
