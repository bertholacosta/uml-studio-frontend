import {
  Component,
  ElementRef,
  OnDestroy,
  ViewChild,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { TourService } from './tour.service';
import { TranslatePipe, TranslationService } from '../i18n';

interface Box {
  top: number;
  left: number;
  width: number;
  height: number;
}

const HOLE_PADDING = 6;
const MARGIN = 16;
const GAP = 14;

/**
 * Capa del recorrido guiado: oscurece la pantalla, deja un «hueco» sobre el elemento del paso
 * (lo único que recibe clics y teclado) y muestra la tarjeta con las instrucciones.
 */
@Component({
  selector: 'app-tour-overlay',
  standalone: true,
  imports: [TranslatePipe],
  styles: `
    .tour-block {
      position: fixed;
      z-index: 9000;
      background: rgb(0 0 0 / 0.68);
    }
    .tour-ring {
      position: fixed;
      z-index: 9001;
      pointer-events: none;
      border: 2px solid var(--color-accent);
      border-radius: 8px;
      box-shadow: 0 0 0 4px rgb(255 107 44 / 0.18);
      animation: tour-pulse 1.8s ease-in-out infinite;
    }
    @keyframes tour-pulse {
      50% {
        box-shadow: 0 0 0 9px rgb(255 107 44 / 0.08);
      }
    }
    @media (prefers-reduced-motion: reduce) {
      .tour-ring {
        animation: none;
      }
    }
  `,
  template: `
    @if (tour.currentStep(); as step) {
      @if (hole(); as h) {
        <div
          class="tour-block"
          [style.top.px]="0"
          [style.left.px]="0"
          [style.right.px]="0"
          [style.height.px]="h.top"
        ></div>
        <div
          class="tour-block"
          [style.top.px]="h.top + h.height"
          [style.left.px]="0"
          [style.right.px]="0"
          [style.bottom.px]="0"
        ></div>
        <div
          class="tour-block"
          [style.top.px]="h.top"
          [style.left.px]="0"
          [style.width.px]="h.left"
          [style.height.px]="h.height"
        ></div>
        <div
          class="tour-block"
          [style.top.px]="h.top"
          [style.left.px]="h.left + h.width"
          [style.right.px]="0"
          [style.height.px]="h.height"
        ></div>
        <div
          class="tour-ring"
          [style.top.px]="h.top"
          [style.left.px]="h.left"
          [style.width.px]="h.width"
          [style.height.px]="h.height"
        ></div>
      } @else {
        <div
          class="tour-block"
          [style.top.px]="0"
          [style.left.px]="0"
          [style.right.px]="0"
          [style.bottom.px]="0"
        ></div>
      }

      <section
        #card
        tabindex="-1"
        role="dialog"
        aria-modal="true"
        aria-labelledby="tour-title"
        aria-describedby="tour-body"
        class="fixed z-[9002] w-[min(360px,calc(100vw-32px))] rounded-xl border border-line-strong bg-surface p-5 shadow-2xl shadow-black outline-none"
        [style.top.px]="cardPos().top"
        [style.left.px]="cardPos().left"
      >
        <div class="flex items-center justify-between gap-3">
          <span class="eyebrow">
            {{
              'tour.stepOf' | translate: { current: tour.stepIndex() + 1, total: tour.steps.length }
            }}
          </span>
          <button
            type="button"
            (click)="tour.skip()"
            [title]="'tour.close' | translate"
            class="btn btn-ghost btn-icon !-mr-2 !h-7 !w-7"
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              aria-hidden="true"
            >
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div class="mt-3 h-0.5 w-full overflow-hidden rounded-full bg-line">
          <div
            class="h-full bg-accent transition-[width] duration-300"
            [style.width.%]="progress()"
          ></div>
        </div>

        <h2 id="tour-title" class="mt-4 text-lg font-medium tracking-[-0.01em] text-fg">
          {{ step.title[lang()] }}
        </h2>
        <p
          id="tour-body"
          class="mt-2 text-sm leading-relaxed text-fg-muted [&_code]:rounded-xs [&_code]:bg-elevated [&_code]:px-1 [&_code]:font-mono [&_code]:text-[12px] [&_code]:text-fg [&_strong]:font-medium [&_strong]:text-fg"
          [innerHTML]="step.body[lang()]"
        ></p>

        @if (step.hint) {
          <p
            class="mt-4 flex items-center gap-2 rounded-md border border-accent/30 bg-accent-soft px-3 py-2 text-[13px] text-accent-fg"
            aria-live="polite"
          >
            <span class="relative flex h-2 w-2 shrink-0">
              <span
                class="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent opacity-60 motion-reduce:hidden"
              ></span>
              <span class="relative inline-flex h-2 w-2 rounded-full bg-accent"></span>
            </span>
            {{ step.hint[lang()] }}
          </p>
        }

        <div class="mt-5 flex items-center justify-between gap-2">
          <button type="button" (click)="tour.skip()" class="btn btn-ghost btn-sm !px-2">
            {{ 'tour.skip' | translate }}
          </button>
          @if (step.advance.type !== 'event') {
            <button
              #nextButton
              type="button"
              (click)="tour.next()"
              [disabled]="step.advance.type === 'input' && !inputFilled()"
              class="btn btn-primary btn-sm"
            >
              {{ isLastStep() ? ('tour.finish' | translate) : ('tour.next' | translate) }}
            </button>
          } @else {
            <span class="font-mono text-[11px] text-fg-subtle">{{
              'tour.waiting' | translate
            }}</span>
          }
        </div>
      </section>
    }

    @if (tour.notice(); as notice) {
      <div
        role="status"
        class="fixed bottom-6 left-1/2 z-[9003] flex w-[min(460px,calc(100vw-32px))] -translate-x-1/2 items-center gap-3 rounded-lg border border-line-strong bg-surface px-4 py-3 text-sm text-fg shadow-2xl shadow-black"
      >
        <span
          class="h-2 w-2 shrink-0 rounded-full"
          [class.bg-success]="notice === 'completed'"
          [class.bg-accent]="notice === 'skipped'"
        ></span>
        <span class="flex-1">{{
          (notice === 'completed' ? 'tour.completedNotice' : 'tour.skippedNotice') | translate
        }}</span>
        <button type="button" (click)="tour.notice.set(null)" class="btn btn-ghost btn-xs">
          {{ 'tour.close' | translate }}
        </button>
      </div>
    }
  `,
})
export class TourOverlayComponent implements OnDestroy {
  readonly tour = inject(TourService);
  private readonly translation = inject(TranslationService);

  @ViewChild('card') private cardRef?: ElementRef<HTMLElement>;

  readonly hole = signal<Box | null>(null);
  readonly cardPos = signal<{ top: number; left: number }>({ top: 0, left: 0 });
  readonly inputFilled = signal<boolean>(false);

  readonly lang = computed<'es' | 'en'>(() =>
    this.translation.currentLang() === 'en' ? 'en' : 'es',
  );
  readonly progress = computed(() => ((this.tour.stepIndex() + 1) / this.tour.steps.length) * 100);
  readonly isLastStep = computed(() => this.tour.stepIndex() === this.tour.steps.length - 1);

  private targetEl: Element | null = null;
  private frame = 0;
  private interval?: ReturnType<typeof setInterval>;
  private focusedStep = -1;

  private readonly onKeyDown = (event: KeyboardEvent): void => this.handleKeyDown(event);

  constructor() {
    // Bucle de seguimiento solo mientras el recorrido está activo
    effect(() => {
      if (this.tour.isActive()) {
        this.focusedStep = -1;
        window.addEventListener('keydown', this.onKeyDown, true);
        this.startLoop();
      } else {
        window.removeEventListener('keydown', this.onKeyDown, true);
        this.stopLoop();
        this.hole.set(null);
        this.targetEl = null;
      }
    });

    effect(() => {
      this.tour.stepIndex();
      this.inputFilled.set(false);
    });
  }

  ngOnDestroy(): void {
    window.removeEventListener('keydown', this.onKeyDown, true);
    this.stopLoop();
  }

  private startLoop(): void {
    if (this.frame) return;
    const tick = () => {
      this.update();
      this.frame = requestAnimationFrame(tick);
    };
    this.frame = requestAnimationFrame(tick);
    // Respaldo: requestAnimationFrame se pausa si la ventana no se está pintando
    this.interval = setInterval(() => this.update(), 150);
  }

  private stopLoop(): void {
    cancelAnimationFrame(this.frame);
    clearInterval(this.interval);
    this.frame = 0;
    this.interval = undefined;
  }

  /** Recalcula en cada fotograma la posición del elemento resaltado y de la tarjeta. */
  private update(): void {
    const step = this.tour.currentStep();
    if (!step) return;

    const selector = step.target?.(this.tour.context()) ?? null;
    const el = selector ? document.querySelector(selector) : null;
    const rect = el?.getBoundingClientRect();
    const visible = !!rect && rect.width > 0 && rect.height > 0;
    this.targetEl = visible ? el : null;

    const nextHole: Box | null = visible
      ? {
          top: Math.max(0, rect!.top - HOLE_PADDING),
          left: Math.max(0, rect!.left - HOLE_PADDING),
          width: Math.min(window.innerWidth, rect!.width + HOLE_PADDING * 2),
          height: Math.min(window.innerHeight, rect!.height + HOLE_PADDING * 2),
        }
      : null;
    if (!sameBox(this.hole(), nextHole)) this.hole.set(nextHole);

    if (step.advance.type === 'input' && el instanceof HTMLInputElement) {
      const filled = el.value.trim().length > 0;
      if (filled !== this.inputFilled()) this.inputFilled.set(filled);
    }

    const card = this.cardRef?.nativeElement;
    const pos = placeCard(nextHole, card?.offsetWidth ?? 360, card?.offsetHeight ?? 240);
    const current = this.cardPos();
    if (pos.top !== current.top || pos.left !== current.left) this.cardPos.set(pos);

    // Al entrar en un paso: enfocar el campo a rellenar o la tarjeta (lectores de pantalla)
    if (this.focusedStep !== this.tour.stepIndex() && (visible || !selector) && card) {
      this.focusedStep = this.tour.stepIndex();
      if (step.advance.type === 'input' && el instanceof HTMLElement) {
        el.focus();
      } else if (!card.contains(document.activeElement)) {
        card.focus({ preventScroll: true });
      }
    }
  }

  /** Bloquea el teclado fuera del elemento resaltado y de la tarjeta. Esc omite el recorrido. */
  private handleKeyDown(event: KeyboardEvent): void {
    const step = this.tour.currentStep();
    if (!step) return;

    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopImmediatePropagation();
      this.tour.skip();
      return;
    }

    const origin = event.target as Node | null;
    const inTarget = !!origin && !!this.targetEl?.contains(origin);
    const inCard = !!origin && !!this.cardRef?.nativeElement.contains(origin);

    // En un campo de texto, Enter equivale a «Siguiente» (evita enviar el formulario antes de tiempo)
    if (inTarget && step.advance.type === 'input' && event.key === 'Enter') {
      event.preventDefault();
      event.stopImmediatePropagation();
      const value = this.targetEl instanceof HTMLInputElement ? this.targetEl.value.trim() : '';
      if (value) this.tour.next();
      return;
    }

    if (!inTarget && !inCard) {
      event.preventDefault();
      event.stopImmediatePropagation();
    }
  }
}

function sameBox(a: Box | null, b: Box | null): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return (
    Math.round(a.top) === Math.round(b.top) &&
    Math.round(a.left) === Math.round(b.left) &&
    Math.round(a.width) === Math.round(b.width) &&
    Math.round(a.height) === Math.round(b.height)
  );
}

/** Coloca la tarjeta junto al elemento sin salirse de la pantalla. */
function placeCard(hole: Box | null, cw: number, ch: number): { top: number; left: number } {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const clamp = (v: number, min: number, max: number) =>
    Math.min(Math.max(v, min), Math.max(min, max));

  if (!hole) {
    return { top: Math.round((vh - ch) / 2), left: Math.round((vw - cw) / 2) };
  }

  const below = {
    top: hole.top + hole.height + GAP,
    left: clamp(hole.left, MARGIN, vw - cw - MARGIN),
  };
  const above = { top: hole.top - GAP - ch, left: clamp(hole.left, MARGIN, vw - cw - MARGIN) };
  const right = {
    top: clamp(hole.top, MARGIN, vh - ch - MARGIN),
    left: hole.left + hole.width + GAP,
  };
  const left = { top: clamp(hole.top, MARGIN, vh - ch - MARGIN), left: hole.left - GAP - cw };

  const fits = {
    below: below.top + ch <= vh - MARGIN,
    above: above.top >= MARGIN,
    right: right.left + cw <= vw - MARGIN,
    left: left.left >= MARGIN,
  };

  // Elementos altos (paneles, modales): mejor a un lado
  const order: (keyof typeof fits)[] =
    hole.height > vh * 0.45
      ? ['right', 'left', 'below', 'above']
      : ['below', 'above', 'right', 'left'];
  const options = { below, above, right, left };
  for (const key of order) {
    if (fits[key])
      return { top: Math.round(options[key].top), left: Math.round(options[key].left) };
  }

  // Sin espacio libre: esquina inferior derecha, encima del área resaltada
  return { top: vh - ch - MARGIN, left: vw - cw - MARGIN };
}
