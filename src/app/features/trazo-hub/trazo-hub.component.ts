import { Component, DestroyRef, computed, effect, inject, signal, untracked } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { NgIconComponent, provideIcons } from '@ng-icons/core';
import { heroSparkles } from '@ng-icons/heroicons/outline';
import { TranslatePipe } from '../../core/i18n';
import { CollaborationService } from '../../core/services/collaboration.service';
import { DiagramService } from '../../core/services/diagram.service';
import { ProjectService } from '../../core/services/project.service';
import {
  AiAssistantPanelComponent,
  ChatDiagram,
  ChatMember,
} from '../diagrams/diagram-editor/components/ai-assistant-panel/ai-assistant-panel.component';

const LAST_PROJECT_KEY = 'uml_studio_trazo_project';

/** Trazo fuera del editor: el chat del proyecto elegido, disponible en Inicio y Proyectos. */
@Component({
  selector: 'app-trazo-hub',
  standalone: true,
  imports: [FormsModule, NgIconComponent, TranslatePipe, AiAssistantPanelComponent],
  providers: [provideIcons({ heroSparkles })],
  templateUrl: './trazo-hub.component.html',
})
export class TrazoHubComponent {
  private readonly projectService = inject(ProjectService);
  private readonly diagramService = inject(DiagramService);
  private readonly collaboration = inject(CollaborationService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  readonly projects = this.projectService.projects;
  readonly isOpen = signal(false);
  readonly selectedId = signal<string | null>(this.readLastProject());
  readonly project = computed(() => {
    const projects = this.projects();
    return projects.find((p) => p.id === this.selectedId()) ?? projects[0] ?? null;
  });
  readonly diagrams = signal<ChatDiagram[]>([]);
  readonly members = signal<ChatMember[]>([]);

  constructor() {
    effect(() => {
      const projectId = this.project()?.id;
      if (!projectId || !this.isOpen()) return;
      untracked(() => this.loadProjectContext(projectId));
    });

    this.collaboration.diagramActivity$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(({ projectId, diagramId }) => {
        if (projectId !== this.project()?.id) return;
        if (this.diagrams().some((d) => d.id === diagramId)) return;
        this.loadDiagrams(projectId);
        // La página de fondo muestra cuántos diagramas tiene cada proyecto
        this.projectService.loadProjects().subscribe();
      });
  }

  selectProject(projectId: string): void {
    this.selectedId.set(projectId);
    this.diagrams.set([]);
    this.members.set([]);
    try {
      localStorage.setItem(LAST_PROJECT_KEY, projectId);
    } catch {}
  }

  openDiagram(diagramId: string): void {
    this.router.navigate(['/diagram'], {
      queryParams: { diagramId, projectId: this.project()?.id },
    });
  }

  private loadProjectContext(projectId: string): void {
    this.loadDiagrams(projectId);
    this.projectService.getProject(projectId).subscribe({
      next: (project) => {
        if (projectId !== this.project()?.id) return;
        this.members.set(
          (project?.members || []).map((m) => ({ userId: m.userId, userName: m.fullName })),
        );
      },
      error: () => {},
    });
  }

  private loadDiagrams(projectId: string): void {
    this.diagramService.loadDiagramsByProject(projectId).subscribe({
      next: (diagrams) => {
        if (projectId !== this.project()?.id) return;
        this.diagrams.set((diagrams || []).map((d) => ({ id: d.id, name: d.name })));
      },
      error: () => {},
    });
  }

  private readLastProject(): string | null {
    try {
      return localStorage.getItem(LAST_PROJECT_KEY);
    } catch {
      return null;
    }
  }
}
