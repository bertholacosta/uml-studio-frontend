import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { Router } from '@angular/router';
import { TourService } from './tour.service';
import { AuthService } from '../services/auth.service';
import { ProjectService } from '../services/project.service';
import { User } from '../models/user.model';

describe('TourService', () => {
  let service: TourService;
  const currentUser = signal<User | null>({
    id: 'user-1',
    fullName: 'Usuario Demo',
    email: 'demo@example.com',
    isActive: true,
  } as User);
  const router = { url: '/projects', navigate: vi.fn() };
  const projects = signal<{ id: string }[]>([{ id: 'p-1' }]);
  const stepIndexOf = (id: string) => service.steps.findIndex((s) => s.id === id);

  beforeEach(() => {
    localStorage.clear();
    currentUser.set({
      id: 'user-1',
      fullName: 'Usuario Demo',
      email: 'demo@example.com',
      isActive: true,
    } as User);
    router.url = '/dashboard';
    router.navigate.mockClear();
    TestBed.configureTestingModule({
      providers: [
        { provide: AuthService, useValue: { currentUser } },
        { provide: Router, useValue: router },
        { provide: ProjectService, useValue: { projects } },
      ],
    });
    service = TestBed.inject(TourService);
  });

  it('arranca solo la primera vez para cada usuario', () => {
    service.autoStartIfNeeded();
    expect(service.isActive()).toBe(true);

    service.skip();
    expect(service.isActive()).toBe(false);
    expect(localStorage.getItem(TourService.STORAGE_PREFIX + 'user-1')).toBe('skipped');

    service.autoStartIfNeeded();
    expect(service.isActive()).toBe(false);
  });

  it('se puede reiniciar manualmente aunque ya se haya omitido', () => {
    localStorage.setItem(TourService.STORAGE_PREFIX + 'user-1', 'skipped');
    router.url = '/diagram';
    service.start();
    expect(service.isActive()).toBe(true);
    expect(service.stepIndex()).toBe(0);
    expect(router.navigate).toHaveBeenCalledWith(['/dashboard']);
  });

  it('avanza solo con la acción esperada y guarda lo creado', () => {
    service.start();
    service.next(); // bienvenida → ir a Proyectos
    expect(service.currentStep()?.id).toBe('go-projects');
    service.notify('projects-opened');
    expect(service.currentStep()?.id).toBe('new-project');

    service.notify('class-added', { nodeId: 'x' }); // acción equivocada: no avanza
    expect(service.currentStep()?.id).toBe('new-project');

    service.notify('create-modal-opened');
    expect(service.currentStep()?.id).toBe('project-name');

    service.next();
    service.notify('project-created', { projectId: 'p-1' });
    expect(service.context().projectId).toBe('p-1');
    expect(service.currentStep()?.id).toBe('open-project');
    expect(service.completedTaskIds()).toEqual(['project']);
    expect(JSON.parse(localStorage.getItem(TourService.PROGRESS_PREFIX + 'user-1')!)).toEqual([
      'project',
    ]);
  });

  it('vuelve al paso anterior si se cancela el modal', () => {
    service.start();
    service.stepIndex.set(stepIndexOf('edit-class-1'));
    service.notify('node-modal-closed');
    expect(service.currentStep()?.id).toBe('open-class-1');
  });

  it('arranca solo al iniciar sesión por primera vez y se detiene al cerrar sesión', () => {
    currentUser.set(null);
    TestBed.tick();
    expect(service.isActive()).toBe(false);

    currentUser.set({
      id: 'user-2',
      fullName: 'Nuevo',
      email: 'nuevo@example.com',
      isActive: true,
    } as User);
    TestBed.tick();
    expect(service.isActive()).toBe(true);

    currentUser.set(null);
    TestBed.tick();
    expect(service.isActive()).toBe(false);
    expect(service.getStatus('user-2')).toBeNull();
  });

  it('al omitir guarda el punto de retorno y continuar retoma desde ahí', () => {
    service.start();
    service.next(); // go-projects
    service.skip();
    expect(service.checkpoint()?.stepId).toBe('go-projects');

    service.resume();
    expect(service.isActive()).toBe(true);
    expect(service.currentStep()?.id).toBe('go-projects');
    expect(service.checkpoint()).toBeNull();
  });

  it('con el proyecto creado pero sin guardar, continuar reabre el proyecto y sigue en el editor', () => {
    service.start();
    service.stepIndex.set(stepIndexOf('connect'));
    service.context.set({ projectId: 'p-1', nodeIds: ['a', 'b'] });
    service.skip();

    router.url = '/dashboard';
    service.resume();
    expect(service.currentStep()?.id).toBe('open-project');
    expect(service.context()).toEqual({ projectId: 'p-1', nodeIds: [] });
    expect(router.navigate).toHaveBeenCalledWith(['/projects']);

    service.notify('editor-ready');
    expect(service.currentStep()?.id).toBe('toolbox');
  });

  it('con el diagrama ya guardado, continuar salta directo al paso donde se dejó', () => {
    service.start();
    service.stepIndex.set(stepIndexOf('generate'));
    service.context.set({ projectId: 'p-1', nodeIds: [] });
    service.skip();

    service.resume();
    service.notify('editor-ready');
    expect(service.currentStep()?.id).toBe('generate');
  });

  it('si el proyecto ya no existe, continúa desde «Ve a tus proyectos»', () => {
    service.start();
    service.stepIndex.set(stepIndexOf('connect'));
    service.context.set({ projectId: 'borrado', nodeIds: [] });
    service.skip();

    service.resume();
    expect(service.currentStep()?.id).toBe('go-projects');
  });

  it('al terminar el último paso queda como completado', () => {
    service.start();
    service.stepIndex.set(service.steps.length - 1);
    service.next();
    expect(service.isActive()).toBe(false);
    expect(service.getStatus('user-1')).toBe('completed');
    expect(service.notice()).toBe('completed');
    expect(service.status()).toBe('completed');
    expect(service.completedTaskIds()).toContain('generate');
  });
});
