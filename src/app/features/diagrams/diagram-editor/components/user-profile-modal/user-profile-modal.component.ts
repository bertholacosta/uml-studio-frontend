import { Component, inject, signal, input, output, effect, untracked } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { NgIconComponent, provideIcons } from '@ng-icons/core';
import {
  heroUserCircle,
  heroXMark,
  heroCheck,
  heroArrowPath,
  heroEye,
  heroEyeSlash,
} from '@ng-icons/heroicons/outline';
import { AuthService } from '../../../../../core/services/auth.service';
import { TranslatePipe } from '../../../../../core/i18n';

@Component({
  selector: 'app-user-profile-modal',
  standalone: true,
  imports: [CommonModule, FormsModule, NgIconComponent, TranslatePipe],
  providers: [
    provideIcons({
      heroUserCircle,
      heroXMark,
      heroCheck,
      heroArrowPath,
      heroEye,
      heroEyeSlash,
    }),
  ],
  templateUrl: './user-profile-modal.component.html',
})
export class UserProfileModalComponent {
  readonly authService = inject(AuthService);

  readonly isOpen = input<boolean>(false);
  readonly close = output<void>();

  readonly isRefreshing = signal<boolean>(false);
  readonly isSaving = signal<boolean>(false);
  readonly isDirty = signal<boolean>(false);
  readonly editFullName = signal<string>('');
  readonly editPassword = signal<string>('');
  readonly saveSuccessMessage = signal<string | null>(null);
  readonly showPassword = signal<boolean>(false);

  private wasOpen = false;

  constructor() {
    effect(() => {
      const open = this.isOpen();
      if (open && !this.wasOpen) {
        this.wasOpen = true;
        untracked(() => {
          this.initForm();
        });
      } else if (!open) {
        this.wasOpen = false;
      }
    });
  }

  private initForm(): void {
    this.isDirty.set(false);
    this.editFullName.set(this.authService.currentUser()?.fullName || '');
    this.editPassword.set('');
    this.showPassword.set(false);
    this.saveSuccessMessage.set(null);
    this.refreshProfile(false);
  }

  togglePassword(): void {
    this.showPassword.update((val) => !val);
  }

  closeModal(): void {
    this.close.emit();
  }

  onFullNameChange(value: string): void {
    this.isDirty.set(true);
    this.editFullName.set(value);
  }

  onPasswordChange(value: string): void {
    this.isDirty.set(true);
    this.editPassword.set(value);
  }

  refreshProfile(force: boolean = false): void {
    this.isRefreshing.set(true);
    this.authService.fetchProfile().subscribe({
      next: (user) => {
        this.isRefreshing.set(false);
        if (force || !this.isDirty()) {
          this.editFullName.set(user.fullName || '');
          if (force) {
            this.editPassword.set('');
            this.isDirty.set(false);
          }
        }
      },
      error: () => {
        this.isRefreshing.set(false);
      },
    });
  }

  saveProfile(): void {
    const fullName = this.editFullName().trim();
    if (!fullName) {
      alert('El nombre completo no puede estar vacío.');
      return;
    }

    const password = this.editPassword().trim();
    if (password && password.length < 6) {
      alert('La contraseña debe tener al menos 6 caracteres.');
      return;
    }

    this.isSaving.set(true);
    const payload: { fullName?: string; password?: string } = { fullName };
    if (password) {
      payload.password = password;
    }

    this.authService.updateProfile(payload).subscribe({
      next: () => {
        this.isSaving.set(false);
        this.isDirty.set(false);
        this.editPassword.set('');
        this.saveSuccessMessage.set('¡Perfil y datos actualizados con éxito!');
        setTimeout(() => this.saveSuccessMessage.set(null), 3000);
      },
      error: (err) => {
        this.isSaving.set(false);
        alert('Error al actualizar el perfil: ' + (err.error?.message || err.message));
      },
    });
  }
}
