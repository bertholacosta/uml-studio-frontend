export type SupportedLanguage = 'es' | 'en';

export interface LanguageOption {
  code: SupportedLanguage;
  label: string;
  shortLabel: string;
  flag: string;
}

export const SUPPORTED_LANGUAGES: LanguageOption[] = [
  {
    code: 'es',
    label: 'Español',
    shortLabel: 'ES',
    flag: '🇪🇸',
  },
  {
    code: 'en',
    label: 'English',
    shortLabel: 'EN',
    flag: '🇺🇸',
  },
];
