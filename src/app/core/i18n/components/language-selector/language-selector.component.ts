import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TranslationService } from '../../services/translation.service';
import { SupportedLanguage } from '../../models/language.type';

@Component({
  selector: 'app-language-selector',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="segmented" role="group" aria-label="Idioma / Language">
      <button
        type="button"
        (click)="setLang('es')"
        [attr.aria-pressed]="currentLang() === 'es'"
        title="Cambiar idioma a Español"
        [class.segmented-item-active]="currentLang() === 'es'"
        class="segmented-item !h-6 !px-2 font-mono !text-[11px]"
      >
        ES
      </button>
      <button
        type="button"
        (click)="setLang('en')"
        [attr.aria-pressed]="currentLang() === 'en'"
        title="Switch language to English"
        [class.segmented-item-active]="currentLang() === 'en'"
        class="segmented-item !h-6 !px-2 font-mono !text-[11px]"
      >
        EN
      </button>
    </div>
  `,
})
export class LanguageSelectorComponent {
  private readonly translationService = inject(TranslationService);

  readonly currentLang = this.translationService.currentLang;

  setLang(lang: SupportedLanguage): void {
    this.translationService.setLanguage(lang);
  }
}
