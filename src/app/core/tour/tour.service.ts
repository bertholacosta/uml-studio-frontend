import { Injectable, computed, effect, inject, signal, untracked } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '../services/auth.service';
import { ProjectService } from '../services/project.service';
import { TOUR_STEPS, TOUR_TASKS } from './tour-steps';
import {
  TourCheckpoint,
  TourContext,
  TourEvent,
  TourEventPayload,
  TourStatus,
  TourStep,
  TourTask,
} from './tour.model';

/**
 * Recorrido guiado («Primeros pasos»): estado, avance por acciones reales y recuerdo por usuario en el navegador.
 * Si se cambian los pasos de forma importante, sube la versión de los prefijos para mostrarlo de nuevo.
 */
@Injectable({ providedIn: 'root' })
export class TourService {
  static readonly STORAGE_PREFIX = 'uml_studio_tour_v1:';
  static readonly PROGRESS_PREFIX = 'uml_studio_tour_progress_v1:';
  static readonly CHECKPOINT_PREFIX = 'uml_studio_tour_checkpoint_v1:';

  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);
  private readonly projectService = inject(ProjectService);

  readonly steps: TourStep[] = TOUR_STEPS;
  readonly tasks: TourTask[] = TOUR_TASKS;
  readonly isActive = signal<boolean>(false);
  readonly stepIndex = signal<number>(0);
  readonly context = signal<TourContext>({ nodeIds: [] });
  /** Aviso breve al terminar u omitir el recorrido. */
  readonly notice = signal<TourStatus | null>(null);
  /** Resultado guardado del usuario actual: null si nunca lo terminó ni lo omitió. */
  readonly status = signal<TourStatus | null>(null);
  /** Tareas de «Primeros pasos» completadas por el usuario actual. */
  readonly completedTaskIds = signal<string[]>([]);
  /** Punto donde se omitió; existe solo si se puede continuar. */
  readonly checkpoint = signal<TourCheckpoint | null>(null);

  readonly currentStep = computed<TourStep | null>(() =>
    this.isActive() ? this.steps[this.stepIndex()] : null,
  );
  readonly allTasksDone = computed(() =>
    this.tasks.every((t) => this.completedTaskIds().includes(t.id)),
  );

  private noticeTimer?: ReturnType<typeof setTimeout>;
  /** Al continuar: paso al que saltar en cuanto se abra el editor del proyecto guardado. */
  private resumeStepId: string | null = null;

  constructor() {
    // Al iniciar sesión (o registrarse) arranca solo la primera vez; al cerrar sesión se interrumpe sin marcarlo como visto
    effect(() => {
      const user = this.authService.currentUser();
      untracked(() => {
        this.status.set(user ? this.getStatus(user.id) : null);
        this.completedTaskIds.set(user ? this.readProgress(user.id) : []);
        this.checkpoint.set(user ? this.readCheckpoint(user.id) : null);
        if (user) {
          this.autoStartIfNeeded();
        } else {
          this.isActive.set(false);
        }
      });
    });
  }

  /** Inicia el recorrido solo si este usuario aún no lo terminó ni lo omitió. */
  autoStartIfNeeded(): void {
    const userId = this.authService.currentUser()?.id;
    if (!userId || this.isActive() || this.getStatus(userId)) return;
    this.start();
  }

  /** Empieza desde el paso 1 en Inicio. */
  start(): void {
    this.begin('welcome', { nodeIds: [] }, '/dashboard');
  }

  /**
   * Continúa un recorrido omitido. Lo que no se guardó se pierde al salir del editor, así que:
   * - antes de crear el proyecto → desde «Ve a tus proyectos»;
   * - con el proyecto creado → reabre ese proyecto; si el diagrama ya estaba guardado salta al paso donde se dejó,
   *   si no, sigue desde la creación de clases.
   */
  resume(): void {
    const cp = this.checkpoint();
    if (!cp) {
      this.start();
      return;
    }

    const at = this.indexOf(cp.stepId);
    const projectExists =
      !!cp.projectId && this.projectService.projects().some((p) => p.id === cp.projectId);

    if (at <= this.indexOf('project-create') || !projectExists) {
      this.begin('go-projects', { nodeIds: [] }, '/dashboard');
      return;
    }

    this.resumeStepId = at > this.indexOf('save') ? cp.stepId : null;
    this.begin('open-project', { projectId: cp.projectId, nodeIds: [] }, '/projects');
  }

  private begin(stepId: string, context: TourContext, route: string): void {
    this.clearCheckpoint();
    this.context.set(context);
    this.stepIndex.set(Math.max(0, this.indexOf(stepId)));
    this.isActive.set(true);
    if (!this.router.url.startsWith(route)) {
      this.router.navigate([route]);
    }
  }

  private indexOf(stepId: string): number {
    return this.steps.findIndex((s) => s.id === stepId);
  }

  next(): void {
    if (!this.isActive()) return;
    this.markTasksAfter(this.steps[this.stepIndex()].id);
    if (this.stepIndex() >= this.steps.length - 1) {
      this.end('completed');
    } else {
      this.stepIndex.update((i) => i + 1);
    }
  }

  skip(): void {
    if (this.isActive()) this.end('skipped');
  }

  /** Los componentes avisan aquí de las acciones del usuario. */
  notify(event: TourEvent, payload: TourEventPayload = {}): void {
    const step = this.currentStep();
    if (!step) return;

    if (step.advance.type === 'event' && step.advance.event === event) {
      this.context.update((ctx) => ({
        projectId: payload.projectId ?? ctx.projectId,
        nodeIds: payload.nodeId ? [...ctx.nodeIds, payload.nodeId] : ctx.nodeIds,
      }));
      if (step.id === 'open-project' && this.resumeStepId) {
        // Diagrama ya guardado: retoma directamente donde se omitió
        this.stepIndex.set(this.indexOf(this.resumeStepId));
        this.resumeStepId = null;
        return;
      }
      this.next();
      return;
    }

    if (step.revert?.event === event) {
      const index = this.steps.findIndex((s) => s.id === step.revert!.toStep);
      if (index >= 0) this.stepIndex.set(index);
    }
  }

  getStatus(userId: string): TourStatus | null {
    try {
      const value = localStorage.getItem(TourService.STORAGE_PREFIX + userId);
      return value === 'completed' || value === 'skipped' ? value : null;
    } catch {
      return null;
    }
  }

  private markTasksAfter(stepId: string): void {
    const userId = this.authService.currentUser()?.id;
    const reached = this.tasks.filter((t) => t.completesAfterStep === stepId).map((t) => t.id);
    if (!userId || reached.length === 0) return;

    const done = Array.from(new Set([...this.completedTaskIds(), ...reached]));
    this.completedTaskIds.set(done);
    try {
      localStorage.setItem(TourService.PROGRESS_PREFIX + userId, JSON.stringify(done));
    } catch {
      // Sin almacenamiento el progreso solo dura la sesión actual
    }
  }

  private readProgress(userId: string): string[] {
    try {
      const raw = JSON.parse(localStorage.getItem(TourService.PROGRESS_PREFIX + userId) || '[]');
      return Array.isArray(raw) ? raw.filter((id): id is string => typeof id === 'string') : [];
    } catch {
      return [];
    }
  }

  private readCheckpoint(userId: string): TourCheckpoint | null {
    try {
      const raw = JSON.parse(
        localStorage.getItem(TourService.CHECKPOINT_PREFIX + userId) || 'null',
      );
      return raw && typeof raw.stepId === 'string' ? raw : null;
    } catch {
      return null;
    }
  }

  private saveCheckpoint(userId: string, cp: TourCheckpoint): void {
    this.checkpoint.set(cp);
    try {
      localStorage.setItem(TourService.CHECKPOINT_PREFIX + userId, JSON.stringify(cp));
    } catch {
      // Sin almacenamiento solo se podrá empezar de nuevo
    }
  }

  private clearCheckpoint(): void {
    this.checkpoint.set(null);
    const userId = this.authService.currentUser()?.id;
    if (!userId) return;
    try {
      localStorage.removeItem(TourService.CHECKPOINT_PREFIX + userId);
    } catch {
      // Nada que limpiar
    }
  }

  private end(status: TourStatus): void {
    const leftAt = this.currentStep()?.id;
    this.isActive.set(false);
    this.resumeStepId = null;
    this.status.set(status);
    const userId = this.authService.currentUser()?.id;
    if (userId && status === 'skipped' && leftAt) {
      this.saveCheckpoint(userId, { stepId: leftAt, projectId: this.context().projectId });
    } else {
      this.clearCheckpoint();
    }
    if (userId) {
      try {
        localStorage.setItem(TourService.STORAGE_PREFIX + userId, status);
      } catch {
        // Sin almacenamiento disponible el recorrido simplemente volverá a ofrecerse
      }
    }
    clearTimeout(this.noticeTimer);
    this.notice.set(status);
    this.noticeTimer = setTimeout(() => this.notice.set(null), 6000);
  }
}
