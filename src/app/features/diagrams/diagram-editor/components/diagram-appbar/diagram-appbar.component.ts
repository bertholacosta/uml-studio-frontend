import {
  Component,
  computed,
  inject,
  signal,
  input,
  output,
  ElementRef,
  ViewChild,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { NgIconComponent, provideIcons } from '@ng-icons/core';
import {
  heroCube,
  heroLockClosed,
  heroPencilSquare,
  heroUserGroup,
  heroTrash,
  heroDocumentChartBar,
  heroArrowDownTray,
  heroArrowUpTray,
  heroDocumentText,
  heroCodeBracket,
  heroSparkles,
  heroChevronDown,
  heroUserCircle,
  heroClipboardDocument,
  heroFolder,
  heroCloudArrowUp,
  heroEye,
  heroCheck,
  heroPhoto,
  heroUserPlus,
} from '@ng-icons/heroicons/outline';
import { AuthService } from '../../../../../core/services/auth.service';
import { CollaborationService } from '../../../../../core/services/collaboration.service';
import { TranslatePipe } from '../../../../../core/i18n';
import { BrandLogoComponent } from '../../../../../core/components/brand-logo/brand-logo.component';
import { SharePanelComponent } from '../share-panel/share-panel.component';

@Component({
  selector: 'app-diagram-appbar',
  standalone: true,
  imports: [
    CommonModule,
    RouterLink,
    NgIconComponent,
    TranslatePipe,
    BrandLogoComponent,
    SharePanelComponent,
  ],
  providers: [
    provideIcons({
      heroCube,
      heroLockClosed,
      heroPencilSquare,
      heroUserGroup,
      heroTrash,
      heroDocumentChartBar,
      heroArrowDownTray,
      heroArrowUpTray,
      heroDocumentText,
      heroCodeBracket,
      heroSparkles,
      heroChevronDown,
      heroUserCircle,
      heroClipboardDocument,
      heroFolder,
      heroCloudArrowUp,
      heroEye,
      heroCheck,
      heroPhoto,
      heroUserPlus,
    }),
  ],
  templateUrl: './diagram-appbar.component.html',
})
export class DiagramAppbarComponent {
  readonly authService = inject(AuthService);
  readonly collaborationService = inject(CollaborationService);

  @ViewChild('fileInput') fileInputRef!: ElementRef<HTMLInputElement>;

  // Inputs
  readonly diagramTitle = input<string>('Diagrama de Clases UML');
  readonly diagramId = input<string | null>(null);
  readonly projectId = input<string | null>(null);
  readonly isSaving = input<boolean>(false);
  readonly saveSuccessMessage = input<boolean>(false);
  readonly isReadOnly = input<boolean>(false);
  readonly hasUnsavedChanges = input<boolean>(false);

  // Outputs
  readonly saveDiagram = output<void>();
  readonly exportBmp = output<void>();
  readonly exportXmi = output<void>();
  readonly exportJson = output<void>();
  readonly viewJson = output<void>();
  readonly fileSelected = output<Event>();
  readonly openImportJson = output<void>();
  readonly openSpringBoot = output<void>();
  readonly openProfile = output<void>();

  // Estados de dropdowns locales
  readonly isExportDropdownOpen = signal<boolean>(false);
  readonly isImportDropdownOpen = signal<boolean>(false);
  readonly isShareOpen = signal<boolean>(false);

  /** Conectados sin contar al usuario actual (su avatar ya está en el botón de perfil). */
  readonly otherCollaborators = computed(() => {
    const myId = this.authService.currentUser()?.id;
    return this.collaborationService.collaborators().filter((c) => c.userId !== myId);
  });

  triggerFileInput(): void {
    this.isImportDropdownOpen.set(false);
    this.fileInputRef?.nativeElement?.click();
  }
}
