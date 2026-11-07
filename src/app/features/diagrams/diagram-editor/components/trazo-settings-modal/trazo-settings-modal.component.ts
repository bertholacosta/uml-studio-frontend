import { Component, computed, effect, input, output, signal, untracked } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { NgIconComponent, provideIcons } from '@ng-icons/core';
import {
  heroXMark,
  heroCheck,
  heroBolt,
  heroLightBulb,
  heroAcademicCap,
} from '@ng-icons/heroicons/outline';
import { TranslatePipe } from '../../../../../core/i18n';
import {
  TrazoCreativity,
  TrazoDelivery,
  TrazoSettings,
  TrazoSettingsValues,
  TrazoStyle,
} from '../../../../../core/services/ai-assistant.service';

/**
 * «Configurar Trazo»: cómo entrega los cambios, con qué estilo responde y qué modelo usa.
 * La configuración es del proyecto (la comparte todo el equipo) y solo la cambian los
 * editores; Trazo sigue actuando solo cuando le hablan.
 */
@Component({
  selector: 'app-trazo-settings-modal',
  standalone: true,
  imports: [CommonModule, FormsModule, NgIconComponent, TranslatePipe],
  providers: [provideIcons({ heroXMark, heroCheck, heroBolt, heroLightBulb, heroAcademicCap })],
  templateUrl: './trazo-settings-modal.component.html',
})
export class TrazoSettingsModalComponent {
  readonly settings = input.required<TrazoSettings>();
  readonly canEdit = input<boolean>(false);
  readonly isSaving = input<boolean>(false);
  readonly error = input<string | null>(null);

  readonly save = output<TrazoSettingsValues>();
  readonly closed = output<void>();

  readonly deliveries: { id: TrazoDelivery; icon: string }[] = [
    { id: 'apply', icon: 'heroBolt' },
    { id: 'propose', icon: 'heroLightBulb' },
    { id: 'explain', icon: 'heroAcademicCap' },
  ];
  readonly styles: TrazoStyle[] = ['brief', 'mentor'];
  readonly creativities: TrazoCreativity[] = ['precise', 'balanced', 'creative'];

  /** Borrador que se edita; vuelve a la configuración guardada cuando esta cambia. */
  readonly draft = signal<TrazoSettingsValues>({
    delivery: 'apply',
    style: 'mentor',
    creativity: 'balanced',
    model: '',
  });

  readonly isDirty = computed(() => {
    const s = this.settings();
    const d = this.draft();
    return (
      s.delivery !== d.delivery ||
      s.style !== d.style ||
      s.creativity !== d.creativity ||
      s.model !== d.model
    );
  });

  constructor() {
    effect(() => {
      const s = this.settings();
      untracked(() =>
        this.draft.set({
          delivery: s.delivery,
          style: s.style,
          creativity: s.creativity,
          model: s.model,
        }),
      );
    });
  }

  set<K extends keyof TrazoSettingsValues>(key: K, value: TrazoSettingsValues[K]): void {
    if (!this.canEdit()) return;
    this.draft.update((d) => ({ ...d, [key]: value }));
  }

  submit(): void {
    if (!this.canEdit() || !this.isDirty() || this.isSaving()) return;
    this.save.emit(this.draft());
  }
}
