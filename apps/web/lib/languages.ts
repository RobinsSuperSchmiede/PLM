import type { Language } from '@/lib/types';

/** Interface languages, each named in its own language. */
export const languages: { code: Language; label: string; flag: string; locale: string }[] = [
  { code: 'de', label: 'Deutsch', flag: '🇩🇪', locale: 'de-DE' },
  { code: 'en', label: 'English', flag: '🇬🇧', locale: 'en-US' },
  { code: 'es', label: 'Español', flag: '🇪🇸', locale: 'es-ES' },
  { code: 'pt', label: 'Português (Brasil)', flag: '🇧🇷', locale: 'pt-BR' },
  { code: 'zh', label: '中文（简体）', flag: '🇨🇳', locale: 'zh-CN' },
  { code: 'ja', label: '日本語', flag: '🇯🇵', locale: 'ja-JP' },
];

export const languageCodes = languages.map((entry) => entry.code);

export function isLanguage(value: unknown): value is Language {
  return typeof value === 'string' && (languageCodes as string[]).includes(value);
}

/** BCP 47 locale for dates and numbers. */
export function localeOf(language: Language): string {
  return languages.find((entry) => entry.code === language)?.locale ?? 'en-US';
}
