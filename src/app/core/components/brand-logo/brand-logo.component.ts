import { Component, input } from '@angular/core';

/**
 * Marca de UML Studio.
 * Isotipo: una clase UML con sus tres compartimentos (nombre, atributos, operaciones);
 * las operaciones son el símbolo de código </>: del diagrama al código.
 * Logotipo: «UML» en IBM Plex Sans + «studio» en Instrument Serif cursiva.
 * Versiones en archivo: public/logo-mark.svg, public/logo.svg y public/favicon.svg.
 */
@Component({
  selector: 'app-brand-logo',
  standalone: true,
  template: `
    <div class="flex items-center gap-2.5 select-none" role="img" aria-label="UML Studio">
      <svg
        class="shrink-0 text-fg"
        [attr.width]="size()"
        [attr.height]="size()"
        viewBox="0 0 32 32"
        fill="none"
        aria-hidden="true"
      >
        <rect
          x="2.5"
          y="2.5"
          width="27"
          height="27"
          rx="3"
          stroke="currentColor"
          stroke-width="2.0"
        />
        <path d="M2.5 9h27M2.5 15.5h27" stroke="currentColor" stroke-width="2.0" />
        <path
          d="M11 5.75h10"
          stroke="var(--color-accent)"
          stroke-width="2.0"
          stroke-linecap="round"
        />
        <path
          d="M6.5 12.25h9"
          stroke="currentColor"
          stroke-width="1.6"
          stroke-linecap="round"
          opacity="0.55"
        />
        <path
          d="M11.5 19L8 22.5l3.5 3.5M20.5 19l3.5 3.5-3.5 3.5"
          stroke="currentColor"
          stroke-width="2.2"
          stroke-linecap="round"
          stroke-linejoin="round"
        />
        <path
          d="M17.4 18.6l-2.8 7.8"
          stroke="var(--color-accent)"
          stroke-width="2.2"
          stroke-linecap="round"
        />
      </svg>

      @if (showName()) {
        <div class="leading-none">
          <div class="flex items-baseline gap-[0.18em]" [style.font-size.px]="size() * 0.62">
            <span class="font-sans font-semibold tracking-[-0.02em] text-fg">UML</span>
            <span class="font-serif text-[1.18em] text-accent italic">studio</span>
          </div>
          @if (subtitle()) {
            <div class="mt-1 font-mono text-[10px] tracking-[0.08em] text-fg-subtle uppercase">
              {{ subtitle() }}
            </div>
          }
        </div>
      }
    </div>
  `,
})
export class BrandLogoComponent {
  /** Lado del isotipo en px; el nombre escala con él. */
  readonly size = input<number>(28);
  readonly showName = input<boolean>(true);
  readonly subtitle = input<string>('');
}
