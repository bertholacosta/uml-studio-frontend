import { Routes } from '@angular/router';
import { authGuard } from './core/guards/auth.guard';

// Cada página se descarga al visitarla: el editor (Foblex, Socket.IO, generador de código)
// no pesa en la carga del login ni del panel de inicio
export const routes: Routes = [
  {
    path: 'login',
    loadComponent: () =>
      import('./features/auth/login/login.component').then((m) => m.LoginComponent),
  },
  {
    path: 'register',
    loadComponent: () =>
      import('./features/auth/register/register.component').then((m) => m.RegisterComponent),
  },
  {
    path: 'dashboard',
    loadComponent: () =>
      import('./features/dashboard/dashboard.component').then((m) => m.DashboardComponent),
    canActivate: [authGuard],
  },
  {
    path: 'projects',
    loadComponent: () =>
      import('./features/projects/project-list/project-list.component').then(
        (m) => m.ProjectListComponent,
      ),
    canActivate: [authGuard],
  },
  // El editor recibe el diagrama por query params: /diagram?diagramId=…&projectId=…
  {
    path: 'diagram',
    loadComponent: () =>
      import('./features/diagrams/diagram-editor/diagram-editor.component').then(
        (m) => m.DiagramEditorComponent,
      ),
    canActivate: [authGuard],
  },
  { path: '', redirectTo: 'dashboard', pathMatch: 'full' },
  { path: '**', redirectTo: 'dashboard' },
];
