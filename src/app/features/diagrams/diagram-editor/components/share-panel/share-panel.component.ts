import { Component, inject, input, output, signal, effect, untracked } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { NgIconComponent, provideIcons } from '@ng-icons/core';
import { heroXMark, heroTrash, heroLink, heroCheck } from '@ng-icons/heroicons/outline';
import { ProjectService } from '../../../../../core/services/project.service';
import { CollaborationService } from '../../../../../core/services/collaboration.service';
import { AuthService } from '../../../../../core/services/auth.service';
import { Project, ProjectRole } from '../../../../../core/models/project.model';
import { TranslatePipe, TranslationService } from '../../../../../core/i18n';

/**
 * Panel «Compartir» (estilo Miro): invitar por correo, personas con acceso al proyecto
 * y quién está conectado ahora mismo a la sala del diagrama.
 */
@Component({
  selector: 'app-share-panel',
  standalone: true,
  imports: [CommonModule, FormsModule, NgIconComponent, TranslatePipe],
  providers: [provideIcons({ heroXMark, heroTrash, heroLink, heroCheck })],
  templateUrl: './share-panel.component.html',
})
export class SharePanelComponent {
  private readonly projectService = inject(ProjectService);
  readonly collaborationService = inject(CollaborationService);
  readonly authService = inject(AuthService);
  private readonly i18n = inject(TranslationService);

  readonly projectId = input<string | null>(null);
  readonly diagramTitle = input<string>('');
  readonly closed = output<void>();

  readonly project = signal<Project | null>(null);
  readonly inviteEmail = signal('');
  readonly inviteRole = signal<ProjectRole>('EDITOR');
  readonly isInviting = signal(false);
  readonly inviteError = signal<string | null>(null);
  readonly linkCopied = signal(false);

  constructor() {
    effect(() => {
      const id = this.projectId();
      untracked(() => this.loadProject(id));
    });
  }

  isOwner(): boolean {
    return this.project()?.userRole === 'OWNER';
  }

  private loadProject(id: string | null): void {
    if (!id) {
      this.project.set(null);
      return;
    }
    this.projectService.getProject(id).subscribe({
      next: (p) => this.project.set(p),
      error: () => this.project.set(null),
    });
  }

  invite(): void {
    const project = this.project();
    const email = this.inviteEmail().trim();
    if (!project || !email || this.isInviting()) return;

    this.isInviting.set(true);
    this.inviteError.set(null);
    this.projectService.addMember(project.id, { email, role: this.inviteRole() }).subscribe({
      next: () => {
        this.isInviting.set(false);
        this.inviteEmail.set('');
        this.loadProject(project.id);
      },
      error: (err) => {
        this.isInviting.set(false);
        this.inviteError.set(err?.error?.message || err?.message || null);
      },
    });
  }

  changeRole(userId: string, role: ProjectRole): void {
    const project = this.project();
    if (!project) return;
    this.projectService.updateMemberRole(project.id, userId, { role }).subscribe({
      next: () => this.loadProject(project.id),
    });
  }

  removeMember(userId: string, name: string): void {
    const project = this.project();
    if (!project || !confirm(this.i18n.t('share.removeConfirm', { name }))) return;
    this.projectService.removeMember(project.id, userId).subscribe({
      next: () => this.loadProject(project.id),
    });
  }

  /** Copia el enlace al diagrama: quien lo abra necesita ser miembro del proyecto. */
  copyLink(): void {
    navigator.clipboard.writeText(window.location.href).then(() => {
      this.linkCopied.set(true);
      setTimeout(() => this.linkCopied.set(false), 1500);
    });
  }
}
