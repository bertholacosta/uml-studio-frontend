import { Pipe, PipeTransform, inject } from '@angular/core';
import { TranslationService } from '../services/translation.service';

/**
 * Pipe standalone para traducción reactiva de textos en plantillas Angular.
 * Uso: {{ 'auth.login.title' | translate }} o {{ 'projects.diagramsCount' | translate:{ count: 4 } }}
 */
@Pipe({
  name: 'translate',
  standalone: true,
  pure: false,
})
export class TranslatePipe implements PipeTransform {
  private readonly translationService = inject(TranslationService);

  transform(key: string, params?: Record<string, string | number>): string {
    if (!key) return '';
    // Consumir el signal currentLang para registrar la dependencia reactiva
    this.translationService.currentLang();
    return this.translationService.translate(key, params);
  }
}
