import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  FormBuilder,
  FormGroup,
  ReactiveFormsModule,
  Validators,
  FormsModule,
} from '@angular/forms';
import { Router } from '@angular/router';
import { NgIconComponent, provideIcons } from '@ng-icons/core';
import {
  heroFolderPlus,
  heroFolder,
  heroUserGroup,
  heroDocumentChartBar,
  heroTrash,
  heroPencilSquare,
  heroArrowRightOnRectangle,
  heroUserCircle,
  heroMagnifyingGlass,
  heroPlus,
  heroXMark,
  heroEllipsisVertical,
  heroCube,
  heroShieldCheck,
  heroCheck,
  heroArrowTopRightOnSquare,
  heroPlayCircle,
} from '@ng-icons/heroicons/outline';

import { ProjectService } from '../../../core/services/project.service';
import { AuthService } from '../../../core/services/auth.service';
import { TourService } from '../../../core/tour/tour.service';
import { Project, ProjectRole } from '../../../core/models/project.model';
import { TranslatePipe } from '../../../core/i18n';
import { AppHeaderComponent } from '../../../core/components/app-header/app-header.component';
import { TrazoHubComponent } from '../../trazo-hub/trazo-hub.component';

@Component({
  selector: 'app-project-list',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    FormsModule,
    NgIconComponent,
    TranslatePipe,
    AppHeaderComponent,
    TrazoHubComponent,
  ],
  providers: [
    provideIcons({
      heroFolderPlus,
      heroFolder,
      heroUserGroup,
      heroDocumentChartBar,
      heroTrash,
      heroPencilSquare,
      heroArrowRightOnRectangle,
      heroUserCircle,
      heroMagnifyingGlass,
      heroPlus,
      heroXMark,
      heroEllipsisVertical,
      heroCube,
      heroShieldCheck,
      heroCheck,
      heroArrowTopRightOnSquare,
      heroPlayCircle,
    }),
  ],
  templateUrl: './project-list.component.html',
  styleUrls: ['./project-list.component.css'],
})
export class ProjectListComponent implements OnInit {
  private readonly fb = inject(FormBuilder);
  readonly projectService = inject(ProjectService);
  readonly authService = inject(AuthService);
  private readonly tour = inject(TourService);
  private readonly router = inject(Router);

  // Filtro de búsqueda
  readonly searchQuery = signal<string>('');

  // Modales
  readonly isCreateModalOpen = signal<boolean>(false);
  readonly isEditModalOpen = signal<boolean>(false);
  readonly isMembersModalOpen = signal<boolean>(false);
  readonly selectedProjectForMembers = signal<Project | null>(null);
  readonly selectedProjectForEdit = signal<Project | null>(null);

  // Formulario Crear Proyecto
  readonly createForm: FormGroup = this.fb.group({
    name: ['', [Validators.required, Validators.maxLength(120)]],
    description: [''],
    basePackage: ['com.example.app', [Validators.required, Validators.maxLength(150)]],
    javaVersion: [21, [Validators.required]],
    springBootVersion: ['3.3.0', [Validators.required]],
  });

  // Formulario Editar Proyecto
  readonly editForm: FormGroup = this.fb.group({
    name: ['', [Validators.required, Validators.maxLength(120)]],
    description: [''],
    basePackage: ['com.example.app', [Validators.required, Validators.maxLength(150)]],
    javaVersion: [21, [Validators.required]],
    springBootVersion: ['3.3.0', [Validators.required]],
  });

  // Formulario Agregar Miembro
  readonly addMemberForm: FormGroup = this.fb.group({
    email: ['', [Validators.required, Validators.email]],
    role: ['EDITOR', [Validators.required]],
  });

  readonly projects = computed(() => this.projectService.projects());

  // Proyectos filtrados
  readonly filteredProjects = computed(() => {
    const q = this.searchQuery().toLowerCase().trim();
    const list = this.projectService.projects();
    if (!q) return list;
    return list.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        (p.description && p.description.toLowerCase().includes(q)) ||
        p.basePackage.toLowerCase().includes(q),
    );
  });

  ngOnInit(): void {
    this.tour.notify('projects-opened');
    this.projectService.loadProjects().subscribe();
  }

  // --- CREAR PROYECTO ---
  openCreateModal(): void {
    this.createForm.reset({
      name: '',
      description: '',
      basePackage: 'com.example.app',
      javaVersion: 21,
      springBootVersion: '3.3.0',
    });
    this.isCreateModalOpen.set(true);
    this.tour.notify('create-modal-opened');
  }

  closeCreateModal(): void {
    this.isCreateModalOpen.set(false);
    this.tour.notify('create-modal-closed');
  }

  onCreateSubmit(): void {
    if (this.createForm.invalid) {
      this.createForm.markAllAsTouched();
      return;
    }

    this.projectService.createProject(this.createForm.value).subscribe({
      next: (project) => {
        this.tour.notify('project-created', { projectId: project.id });
        this.closeCreateModal();
      },
    });
  }

  // --- EDITAR PROYECTO ---
  openEditModal(project: Project, event?: MouseEvent): void {
    if (event) event.stopPropagation();
    this.selectedProjectForEdit.set(project);
    this.editForm.patchValue({
      name: project.name,
      description: project.description || '',
      basePackage: project.basePackage,
      javaVersion: project.javaVersion,
      springBootVersion: project.springBootVersion,
    });
    this.isEditModalOpen.set(true);
  }

  closeEditModal(): void {
    this.isEditModalOpen.set(false);
    this.selectedProjectForEdit.set(null);
  }

  onEditSubmit(): void {
    const project = this.selectedProjectForEdit();
    if (!project || this.editForm.invalid) {
      this.editForm.markAllAsTouched();
      return;
    }

    this.projectService.updateProject(project.id, this.editForm.value).subscribe({
      next: () => {
        this.closeEditModal();
      },
    });
  }

  openDiagram(project: Project): void {
    this.router.navigate(['/diagram'], {
      queryParams: { projectId: project.id, projectName: project.name },
    });
  }

  // --- GESTIÓN DE MIEMBROS ---
  openMembersModal(project: Project, event?: MouseEvent): void {
    if (event) event.stopPropagation();
    this.selectedProjectForMembers.set(project);
    this.addMemberForm.reset({ email: '', role: 'EDITOR' });
    this.isMembersModalOpen.set(true);
  }

  closeMembersModal(): void {
    this.isMembersModalOpen.set(false);
    this.selectedProjectForMembers.set(null);
  }

  onAddMemberSubmit(): void {
    const project = this.selectedProjectForMembers();
    if (!project || this.addMemberForm.invalid) {
      this.addMemberForm.markAllAsTouched();
      return;
    }

    this.projectService.addMember(project.id, this.addMemberForm.value).subscribe({
      next: () => {
        this.addMemberForm.reset({ email: '', role: 'EDITOR' });
        this.projectService.getProject(project.id).subscribe((p) => {
          this.selectedProjectForMembers.set(p);
        });
      },
    });
  }

  onRemoveMember(userId: string): void {
    const project = this.selectedProjectForMembers();
    if (!project) return;

    if (confirm('¿Estás seguro de remover a este miembro del proyecto?')) {
      this.projectService.removeMember(project.id, userId).subscribe({
        next: () => {
          this.projectService.getProject(project.id).subscribe((p) => {
            this.selectedProjectForMembers.set(p);
          });
        },
      });
    }
  }

  onRoleChange(userId: string, newRole: ProjectRole): void {
    const project = this.selectedProjectForMembers();
    if (!project) return;

    this.projectService.updateMemberRole(project.id, userId, { role: newRole }).subscribe({
      next: () => {
        this.projectService.getProject(project.id).subscribe((p) => {
          this.selectedProjectForMembers.set(p);
        });
      },
    });
  }

  onDeleteProject(project: Project, event: MouseEvent): void {
    event.stopPropagation();
    if (
      confirm(
        `¿Estás seguro de eliminar el proyecto "${project.name}" y todos sus diagramas asociados?`,
      )
    ) {
      this.projectService.deleteProject(project.id).subscribe();
    }
  }
}
