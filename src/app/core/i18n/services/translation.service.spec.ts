import { describe, it, expect, beforeEach } from 'vitest';
import { TranslationService } from './translation.service';

class MockStorage {
  private store: Record<string, string> = {};
  getItem(key: string): string | null {
    return this.store[key] ?? null;
  }
  setItem(key: string, value: string): void {
    this.store[key] = value;
  }
  clear(): void {
    this.store = {};
  }
  removeItem(key: string): void {
    delete this.store[key];
  }
}

describe('TranslationService', () => {
  let service: TranslationService;

  beforeEach(() => {
    localStorage.clear();
    service = new TranslationService();
  });

  it('debe crearse e iniciar en español por defecto si no hay storage', () => {
    expect(service).toBeTruthy();
    expect(service.currentLang()).toBe('es');
  });

  it('debe traducir claves simples y anidadas en español', () => {
    service.setLanguage('es');
    expect(service.translate('auth.login.title')).toBe('Bienvenido de nuevo');
    expect(service.translate('common.save')).toBe('Guardar');
  });

  it('debe cambiar de idioma a inglés y traducir correctamente', () => {
    service.setLanguage('en');
    expect(service.currentLang()).toBe('en');
    expect(service.translate('auth.login.title')).toBe('Welcome back');
    expect(service.translate('common.save')).toBe('Save');
    expect(localStorage.getItem('app_lang')).toBe('en');
  });

  it('debe interpolar parámetros {{param}} correctamente', () => {
    service.setLanguage('es');
    expect(service.translate('projects.diagramsCount', { count: 5 })).toBe('5 diagramas');

    service.setLanguage('en');
    expect(service.translate('projects.diagramsCount', { count: 5 })).toBe('5 diagrams');
  });

  it('debe alternar entre español e inglés con toggleLanguage', () => {
    service.setLanguage('es');
    service.toggleLanguage();
    expect(service.currentLang()).toBe('en');

    service.toggleLanguage();
    expect(service.currentLang()).toBe('es');
  });

  it('debe retornar la misma clave si no existe en el diccionario', () => {
    expect(service.translate('clave.inexistente.123')).toBe('clave.inexistente.123');
  });
});
