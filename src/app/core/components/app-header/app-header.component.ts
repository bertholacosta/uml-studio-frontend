import { Component, inject, signal } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { NgIconComponent, provideIcons } from '@ng-icons/core';
import { heroArrowRightOnRectangle } from '@ng-icons/heroicons/outline';
import { AuthService } from '../../services/auth.service';
import { TranslatePipe, LanguageSelectorComponent } from '../../i18n';
import { BrandLogoComponent } from '../brand-logo/brand-logo.component';
import { UserProfileModalComponent } from '../../../features/diagrams/diagram-editor/components/user-profile-modal/user-profile-modal.component';

/** Barra superior de las páginas principales (Inicio y Proyectos). */
@Component({
  selector: 'app-header',
  standalone: true,
  imports: [
    RouterLink,
    RouterLinkActive,
    NgIconComponent,
    TranslatePipe,
    LanguageSelectorComponent,
    BrandLogoComponent,
    UserProfileModalComponent,
  ],
  providers: [provideIcons({ heroArrowRightOnRectangle })],
  template: `
    <header class="sticky top-0 z-30 border-b border-line bg-bg/90 backdrop-blur-md">
      <div class="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6">
        <div class="flex items-center gap-8">
          <a routerLink="/dashboard" aria-label="UML Studio">
            <app-brand-logo [size]="28" />
          </a>

          <nav class="flex items-center gap-1" aria-label="Principal">
            <a
              routerLink="/dashboard"
              routerLinkActive="!text-fg after:!bg-accent"
              data-tour="nav-dashboard"
              class="relative px-3 py-2 text-sm text-fg-muted transition-colors after:absolute after:inset-x-3 after:-bottom-[13px] after:h-px after:bg-transparent hover:text-fg"
            >
              {{ 'nav.home' | translate }}
            </a>
            <a
              routerLink="/projects"
              routerLinkActive="!text-fg after:!bg-accent"
              data-tour="nav-projects"
              class="relative px-3 py-2 text-sm text-fg-muted transition-colors after:absolute after:inset-x-3 after:-bottom-[13px] after:h-px after:bg-transparent hover:text-fg"
            >
              {{ 'nav.projects' | translate }}
            </a>
          </nav>
        </div>

        <div class="flex items-center gap-2">
          <app-language-selector />

          @if (authService.currentUser(); as user) {
            <div class="mx-1 h-5 w-px bg-line"></div>

            <button
              type="button"
              (click)="isProfileOpen.set(true)"
              [title]="'auth.profile' | translate"
              class="btn btn-ghost btn-sm !pl-1"
            >
              <span
                class="grid h-6 w-6 place-items-center rounded-full bg-overlay text-[11px] font-medium text-white ring-1 ring-line-strong"
              >
                {{ (user.fullName || 'U').charAt(0).toUpperCase() }}
              </span>
              <span class="hidden max-w-[160px] truncate text-fg sm:inline">{{
                user.fullName
              }}</span>
            </button>

            <button
              type="button"
              (click)="authService.logout()"
              [title]="'auth.logout' | translate"
              class="btn btn-ghost btn-sm btn-icon"
            >
              <ng-icon name="heroArrowRightOnRectangle" class="text-base"></ng-icon>
            </button>
          }
        </div>
      </div>
    </header>

    <app-user-profile-modal [isOpen]="isProfileOpen()" (close)="isProfileOpen.set(false)" />
  `,
})
export class AppHeaderComponent {
  readonly authService = inject(AuthService);
  readonly isProfileOpen = signal<boolean>(false);
}
