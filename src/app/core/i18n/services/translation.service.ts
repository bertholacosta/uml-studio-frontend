import { Injectable, computed, signal } from '@angular/core';
import { LanguageOption, SUPPORTED_LANGUAGES, SupportedLanguage } from '../models/language.type';
import { es } from '../translations/es';
import { en } from '../translations/en';

@Injectable({
  providedIn: 'root',
})
export class TranslationService {
  private readonly storageKey = 'app_lang';
  private readonly dictionaries: Record<SupportedLanguage, any> = {
    es,
    en,
  };

  readonly languages: LanguageOption[] = SUPPORTED_LANGUAGES;
  readonly currentLang = signal<SupportedLanguage>(this.getInitialLanguage());

  readonly currentLanguageOption = computed(() => {
    return this.languages.find((l) => l.code === this.currentLang()) ?? this.languages[0];
  });

  constructor() {
    this.updateHtmlLangAttribute(this.currentLang());
  }

  /**
   * Cambia el idioma activo de la aplicación y persiste en localStorage.
   */
  setLanguage(lang: SupportedLanguage): void {
    if (this.currentLang() === lang) return;
    this.currentLang.set(lang);
    try {
      localStorage.setItem(this.storageKey, lang);
    } catch {
      // Ignorar error si localStorage no está disponible
    }
    this.updateHtmlLangAttribute(lang);
  }

  /**
   * Alterna entre inglés y español.
   */
  toggleLanguage(): void {
    const nextLang: SupportedLanguage = this.currentLang() === 'es' ? 'en' : 'es';
    this.setLanguage(nextLang);
  }

  /**
   * Traduce una clave (soporta notación de punto 'auth.login.title') con reemplazo de parámetros {{param}}.
   */
  translate(key: string, params?: Record<string, string | number>): string {
    const lang = this.currentLang();
    const dictionary = this.dictionaries[lang] || this.dictionaries.es;

    let result = this.resolveKey(dictionary, key);

    // Si no se encuentra en el idioma activo, buscar en español por defecto
    if (result === undefined && lang !== 'es') {
      result = this.resolveKey(this.dictionaries.es, key);
    }

    if (result === undefined || typeof result !== 'string') {
      return key;
    }

    // Reemplazo de parámetros {{param}}
    if (params) {
      return Object.entries(params).reduce((str, [paramKey, paramValue]) => {
        return str.replace(new RegExp(`{{\\s*${paramKey}\\s*}}`, 'g'), String(paramValue));
      }, result);
    }

    return result;
  }

  /**
   * Alias conveniente de translate().
   */
  t(key: string, params?: Record<string, string | number>): string {
    return this.translate(key, params);
  }

  private resolveKey(obj: any, path: string): any {
    if (!obj || !path) return undefined;
    const parts = path.split('.');
    let current = obj;
    for (const part of parts) {
      if (current === undefined || current === null) return undefined;
      current = current[part];
    }
    return current;
  }

  private getInitialLanguage(): SupportedLanguage {
    try {
      if (typeof localStorage !== 'undefined' && localStorage.getItem) {
        const saved = localStorage.getItem(this.storageKey);
        if (saved === 'es' || saved === 'en') {
          return saved;
        }
      }
    } catch {
      // Fallback
    }
    return 'es';
  }

  private updateHtmlLangAttribute(lang: SupportedLanguage): void {
    if (typeof document !== 'undefined' && document.documentElement) {
      document.documentElement.lang = lang;
    }
  }
}
