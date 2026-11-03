import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { NgIconComponent, provideIcons } from '@ng-icons/core';
import {
  heroCheck,
  heroEllipsisVertical,
  heroArrowPath,
  heroPlay,
  heroArrowRight,
  heroCube,
} from '@ng-icons/heroicons/outline';
import { AppHeaderComponent } from '../../core/components/app-header/app-header.component';
import { AuthService } from '../../core/services/auth.service';
import { ProjectService } from '../../core/services/project.service';
import { TourService } from '../../core/tour/tour.service';
import { TranslatePipe, TranslationService } from '../../core/i18n';
import { Project } from '../../core/models/project.model';

/** Página principal tras iniciar sesión: «Primeros pasos» y proyectos recientes. */
@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [AppHeaderComponent, RouterLink, NgIconComponent, TranslatePipe],
  providers: [
    provideIcons({
      heroCheck,
      heroEllipsisVertical,
      heroArrowPath,
      heroPlay,
      heroArrowRight,
      heroCube,
    }),
  ],
  templateUrl: './dashboard.component.html',
})
export class DashboardComponent implements OnInit {
  readonly authService = inject(AuthService);
  readonly projectService = inject(ProjectService);
  readonly tour = inject(TourService);
  private readonly translation = inject(TranslationService);
  private readonly router = inject(Router);

  readonly isMenuOpen = signal<boolean>(false);

  readonly lang = computed<'es' | 'en'>(() =>
    this.translation.currentLang() === 'en' ? 'en' : 'es',
  );
  readonly firstName = computed(
    () => (this.authService.currentUser()?.fullName || '').trim().split(/\s+/)[0] || '',
  );
  readonly doneCount = computed(
    () => this.tour.tasks.filter((t) => this.tour.completedTaskIds().includes(t.id)).length,
  );
  readonly progressPercent = computed(() => (this.doneCount() / this.tour.tasks.length) * 100);
  /** Ya lo intentó (omitido, a medias o completado): se ofrece el menú de opciones. */
  readonly hasAttempted = computed(() => this.tour.status() !== null || this.doneCount() > 0);
  /** Título del paso donde se omitió, para mostrar desde dónde se continúa. */
  readonly leftAtTitle = computed(() => {
    const cp = this.tour.checkpoint();
    const step = cp ? this.tour.steps.find((s) => s.id === cp.stepId) : null;
    return step ? step.title[this.lang()] : '';
  });
  readonly recentProjects = computed<Project[]>(() => this.projectService.projects().slice(0, 4));

  ngOnInit(): void {
    this.projectService.loadProjects().subscribe();
  }

  isTaskDone(taskId: string): boolean {
    return this.tour.completedTaskIds().includes(taskId);
  }

  startTour(): void {
    this.isMenuOpen.set(false);
    this.tour.start();
  }

  continueTour(): void {
    this.isMenuOpen.set(false);
    this.tour.resume();
  }

  openProject(project: Project): void {
    this.router.navigate(['/diagram'], {
      queryParams: { projectId: project.id, projectName: project.name },
    });
  }
}
