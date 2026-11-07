import {
  Component,
  signal,
  ViewChild,
  ElementRef,
  OnInit,
  OnDestroy,
  HostListener,
  inject,
  computed,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import {
  FFlowModule,
  FFlowComponent,
  FCreateConnectionEvent,
  FReassignConnectionEvent,
  FCreateNodeEvent,
  FSelectionChangeEvent,
  FCanvasComponent,
  FZoomDirective,
  FCanvasChangeEvent,
} from '@foblex/flow';
import { NgIconComponent, provideIcons } from '@ng-icons/core';
import {
  heroTrash,
  heroXMark,
  heroClipboardDocument,
  heroCheck,
  heroLockClosed,
  heroPencilSquare,
  heroMinus,
  heroPlus,
  heroArrowsPointingOut,
  heroQuestionMarkCircle,
  heroSun,
  heroMoon,
} from '@ng-icons/heroicons/outline';

import { AuthService } from '../../../core/services/auth.service';
import { DiagramService } from '../../../core/services/diagram.service';
import { ProjectService } from '../../../core/services/project.service';
import { CollaborationService, NodeLock } from '../../../core/services/collaboration.service';
import { AiAssistantService } from '../../../core/services/ai-assistant.service';
import { XmiService } from '../../../core/services/xmi.service';
import { withFreshIds } from '../../../core/utils/fresh-ids';
import { BmpExportService } from '../../../core/services/bmp-export.service';
import { TourService } from '../../../core/tour/tour.service';
import {
  UmlRelationshipType,
  UmlClassNode,
  UmlConnection,
  SaveDiagramAstRequest,
} from '../../../core/models/diagram.model';

import { DiagramAppbarComponent } from './components/diagram-appbar/diagram-appbar.component';
import { DiagramToolboxComponent } from './components/diagram-toolbox/diagram-toolbox.component';
import {
  AiAssistantPanelComponent,
  ChatDiagram,
  ChatMember,
} from './components/ai-assistant-panel/ai-assistant-panel.component';
import { UserProfileModalComponent } from './components/user-profile-modal/user-profile-modal.component';
import { SpringBootModalComponent } from './components/spring-boot-modal/spring-boot-modal.component';
import { ClassEditPanelComponent } from './components/class-edit-panel/class-edit-panel.component';
import { RelationEditPanelComponent } from './components/relation-edit-panel/relation-edit-panel.component';
import { DiagramHistory } from './diagram-history';
import { TranslatePipe } from '../../../core/i18n';

export interface UmlDiagramProject {
  version: string;
  name: string;
  createdDate: string;
  nodes: UmlClassNode[];
  connections: UmlConnection[];
}

type ConnectorSide = 'top' | 'right' | 'bottom' | 'left';
export type CanvasTheme = 'light' | 'dark';
const CANVAS_THEME_KEY = 'uml_studio_canvas_theme';
const AI_DOCK_KEY = 'uml_studio_ai_dock';

// Medidas de la caja UML; deben coincidir con las clases .uml-class-* de styles.css
const CLASS_LAYOUT = {
  minWidth: 200,
  headerHeight: 40,
  rowHeight: 28,
  compartmentPadding: 0,
  emptyCompartment: 12,
  paddingX: 12,
  border: 2,
};

// Zona ocupada por las islas flotantes del editor: los paneles de edición no se colocan debajo
const ISLAND_INSET = { left: 76, top: 72 };

// Sufijo del conector dentro del id: lado (_top…) o la caja completa (__box) con la que se dibujan las líneas
const SIDE_SUFFIX = /(?:_(?:top|bottom|left|right)|__box)$/;

/** Estado del guardado automático que muestra la barra superior. */
export type SaveState = 'saved' | 'pending' | 'saving' | 'error';
/** Se guarda tras este rato sin editar… */
const AUTOSAVE_IDLE_MS = 1500;
/** …o como mucho cada tanto aunque se edite sin parar. */
const AUTOSAVE_MAX_WAIT_MS = 8000;
/** Reintentos tras un fallo: 2 s, 4 s, 8 s… hasta 30 s. */
const AUTOSAVE_RETRY_MS = { first: 2000, max: 30000 };

@Component({
  standalone: true,
  selector: 'app-diagram-editor',
  imports: [
    CommonModule,
    FormsModule,
    FFlowModule,
    NgIconComponent,
    DiagramAppbarComponent,
    DiagramToolboxComponent,
    AiAssistantPanelComponent,
    UserProfileModalComponent,
    SpringBootModalComponent,
    ClassEditPanelComponent,
    RelationEditPanelComponent,
    TranslatePipe,
  ],
  providers: [
    provideIcons({
      heroTrash,
      heroXMark,
      heroClipboardDocument,
      heroCheck,
      heroLockClosed,
      heroPencilSquare,
      heroMinus,
      heroPlus,
      heroArrowsPointingOut,
      heroQuestionMarkCircle,
      heroSun,
      heroMoon,
    }),
  ],
  templateUrl: './diagram-editor.component.html',
  styleUrl: './diagram-editor.component.css',
})
export class DiagramEditorComponent implements OnInit, OnDestroy {
  readonly authService = inject(AuthService);
  readonly diagramService = inject(DiagramService);
  readonly projectService = inject(ProjectService);
  readonly collaborationService = inject(CollaborationService);
  readonly aiAssistantService = inject(AiAssistantService);
  readonly xmiService = inject(XmiService);
  readonly bmpExportService = inject(BmpExportService);
  private readonly tour = inject(TourService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  @ViewChild(FFlowComponent) flow?: FFlowComponent;
  @ViewChild(FCanvasComponent) canvas?: FCanvasComponent;
  @ViewChild(FZoomDirective) fZoom?: FZoomDirective;
  @ViewChild('flowContainer') flowContainerRef?: ElementRef<HTMLElement>;

  // Contexto del diagrama y proyecto
  currentDiagramId = signal<string | null>(null);
  currentProjectId = signal<string | null>(null);
  /** Miembros y diagramas del proyecto, para las @menciones y los #diagramas del chat. */
  readonly projectMembers = signal<ChatMember[]>([]);
  readonly projectDiagrams = signal<ChatDiagram[]>([]);
  currentDiagramName = signal<string>('Diagrama UML');
  saveSuccessMessage = signal<boolean>(false);
  hasUnsavedChanges = signal<boolean>(false);
  readonly saveState = signal<SaveState>('saved');
  zoomLevel = signal<number>(100);

  // Guardado automático: cada edición sube la versión y programa un guardado
  private editVersion = 0;
  private autosaveTimer: ReturnType<typeof setTimeout> | null = null;
  /** Desde cuándo hay cambios esperando (para el tope AUTOSAVE_MAX_WAIT_MS). */
  private pendingSince = 0;
  private saveInFlight = false;
  /** Llegó un guardado manual mientras otro estaba en curso. */
  private manualSaveQueued = false;
  private saveFailures = 0;

  markAsUnsaved(): void {
    if (this.isReadOnly()) return;
    this.hasUnsavedChanges.set(true);
    this.editVersion++;
    if (!this.saveInFlight && this.saveState() !== 'error') this.saveState.set('pending');
    if (this.saveFailures === 0) this.scheduleAutosave();
  }

  // Rol del usuario actual en el proyecto
  currentUserRole = signal<string>('EDITOR');
  readonly isReadOnly = computed(() => this.currentUserRole() === 'VIEWER');

  // Lienzo: cuadrícula, transformación y selección
  readonly gridSize = 20;
  readonly connectorSides: ConnectorSide[] = ['top', 'right', 'bottom', 'left'];
  readonly canvasTransform = signal<{ x: number; y: number; scale: number }>({
    x: 0,
    y: 0,
    scale: 1,
  });
  readonly selectedNodeIds = signal<string[]>([]);
  readonly selectedConnIds = signal<string[]>([]);
  readonly selectedNodeId = computed(() => {
    const ids = this.selectedNodeIds();
    return ids.length === 1 && this.selectedConnIds().length === 0 ? ids[0] : null;
  });
  // Se incrementa cuando cambian posiciones mutadas en sitio (arrastre) para recalcular paneles
  private readonly layoutVersion = signal(0);

  // Tema del lienzo: claro por defecto; es la única parte de la app con modo claro
  readonly canvasTheme = signal<CanvasTheme>(this.readCanvasTheme());

  // Asistente (barra inferior) y menú de ayuda
  isAiPanelOpen = signal<boolean>(true);
  /** Asistente como barra flotante abajo o acoplado como columna a la derecha (se recuerda). */
  readonly aiDock = signal<'bottom' | 'side'>(this.readAiDock());
  readonly isHelpMenuOpen = signal<boolean>(false);

  // Atajos del menú de ayuda; `keysKey` se usa cuando la tecla se nombra distinto según el idioma
  readonly shortcuts: { labelKey: string; keys?: string; keysKey?: string }[] = [
    { labelKey: 'toolbar.shortcuts.undo', keys: 'Ctrl+Z' },
    { labelKey: 'toolbar.shortcuts.redo', keys: 'Ctrl+Y' },
    { labelKey: 'toolbar.shortcuts.duplicate', keys: 'Ctrl+D' },
    { labelKey: 'toolbar.shortcuts.copyPaste', keys: 'Ctrl+C / V' },
    { labelKey: 'toolbar.shortcuts.delete', keysKey: 'toolbar.shortcuts.deleteKeys' },
    { labelKey: 'toolbar.shortcuts.multiSelect', keysKey: 'toolbar.shortcuts.multiSelectKeys' },
    { labelKey: 'toolbar.shortcuts.move', keys: '← ↑ → ↓' },
    { labelKey: 'toolbar.shortcuts.assistant', keys: 'Ctrl+I' },
  ];

  // Tipos de datos predefinidos
  readonly predefinedTypes: string[] = [
    'UUID',
    'String',
    'Integer',
    'Long',
    'Boolean',
    'Double',
    'Float',
    'BigDecimal',
    'LocalDate',
    'LocalDateTime',
    'Date',
    'Text',
    'byte[]',
  ];

  // Tipos de retorno predefinidos
  readonly predefinedReturnTypes: string[] = [
    'void',
    'UUID',
    'String',
    'Integer',
    'Long',
    'Boolean',
    'Double',
    'BigDecimal',
    'LocalDate',
    'LocalDateTime',
    'List<Object>',
    'Object',
  ];

  // Herramienta de relación elegida en la paleta y clase origen ya marcada
  readonly relationTool = signal<UmlRelationshipType | null>(null);
  readonly relationSourceId = signal<string | null>(null);

  // Paneles flotantes de edición (estilo Apollon)
  readonly editingNodeId = signal<string | null>(null);
  readonly editingConnId = signal<string | null>(null);
  readonly editingNode = computed(
    () => this.nodes().find((n) => n.id === this.editingNodeId()) || null,
  );
  readonly editingConnection = computed(
    () => this.connections().find((c) => c.id === this.editingConnId()) || null,
  );

  readonly classPanelPos = computed(() => {
    this.layoutVersion();
    const node = this.editingNode();
    if (!node) return { left: 0, top: 0 };
    const t = this.canvasTransform();
    const { width: cw, height: ch } = this.getContainerSize();
    const panelW = 360;
    const gap = 14;
    const nodeW = this.getNodeWidth(node);
    let left = (node.position.x + nodeW) * t.scale + t.x + gap;
    if (left + panelW > cw - 8) {
      left = node.position.x * t.scale + t.x - panelW - gap;
    }
    const top = node.position.y * t.scale + t.y;
    return {
      // Margen para no quedar bajo las islas (barra de herramientas a la izquierda, barras superiores)
      left: this.clamp(left, ISLAND_INSET.left, cw - panelW - 8),
      top: this.clamp(top, ISLAND_INSET.top, ch - 440),
    };
  });

  readonly relationPanelPos = computed(() => {
    this.layoutVersion();
    const conn = this.editingConnection();
    if (!conn) return { left: 0, top: 0 };
    const nodeMap = new Map(this.nodes().map((n) => [n.id, n]));
    const s = nodeMap.get(this.baseId(conn.sourceNodeId, conn.sourceId));
    const tg = nodeMap.get(this.baseId(conn.targetNodeId, conn.targetId));
    if (!s || !tg) return { left: 0, top: 0 };
    const t = this.canvasTransform();
    const { width: cw, height: ch } = this.getContainerSize();
    const panelW = 320;
    const mid = {
      x: (s.position.x + this.getNodeWidth(s) / 2 + tg.position.x + this.getNodeWidth(tg) / 2) / 2,
      y:
        (s.position.y + this.getNodeHeight(s) / 2 + tg.position.y + this.getNodeHeight(tg) / 2) / 2,
    };
    const left = mid.x * t.scale + t.x + 24;
    const top = mid.y * t.scale + t.y - 120;
    return {
      left: this.clamp(left, ISLAND_INSET.left, cw - panelW - 8),
      top: this.clamp(top, ISLAND_INSET.top, ch - 560),
    };
  });

  // Modal JSON
  showJsonModal = signal<boolean>(false);
  jsonContent = signal<string>('');
  jsonModalMode = signal<'import' | 'export'>('export');

  // Modal Perfil
  isProfileModalOpen = signal<boolean>(false);

  // Modal Spring Boot
  showSpringBootModal = signal<boolean>(false);

  // Nodos y Conexiones del Diagrama
  nodes = signal<UmlClassNode[]>([]);
  connections = signal<UmlConnection[]>([]);

  // Deshacer / rehacer
  private readonly history = new DiagramHistory();
  readonly canUndo = signal(false);
  readonly canRedo = signal(false);
  private commitTimer: ReturnType<typeof setTimeout> | null = null;
  // Mientras es true, varias operaciones se agrupan en un solo paso del historial
  private batchingHistory = false;
  private syncTimer: ReturnType<typeof setTimeout> | null = null;

  // Portapapeles interno (copiar / pegar clases)
  private clipboard: { nodes: UmlClassNode[]; connections: UmlConnection[] } | null = null;

  private measureCtx: CanvasRenderingContext2D | null = null;
  private fontFamilies: { sans: string; mono: string } | null = null;

  ngOnInit(): void {
    this.tour.notify('editor-ready');
    this.collaborationService.remoteNodeDrag$.subscribe((data) => {
      this.nodes.update((list) =>
        list.map((n) => (n.id === data.nodeId ? { ...n, position: data.position } : n)),
      );
      this.updateConnectionEndpoints();
      this.history.reset(this.snapshot());
    });

    this.collaborationService.remoteDiagramSync$.subscribe((data) => {
      if (data.action === 'ai_mutation' && data.nodes) {
        // Los cambios de Trazo ya los guardó el servidor
        this.applyAiMutationWithAnimation(data.nodes, data.connections || [], true);
      } else if (data.nodes) {
        const cleanNodes = this.applyAiNodesMutation(data.nodes);
        this.nodes.set(cleanNodes);
        const cleanConns = this.sanitizeClientConnections(data.connections || [], cleanNodes);
        this.connections.set(cleanConns);
        this.updateConnectionEndpoints();
        setTimeout(() => this.updateConnectionEndpoints(), 60);
      }
      // Los cambios de otros usuarios no se deshacen desde aquí
      this.resetHistory(true);
    });

    this.collaborationService.nodeLockRejected$.subscribe((data) => {
      if (this.editingNodeId() === data.nodeId) {
        this.editingNodeId.set(null);
        alert(`🔒 La tabla está siendo editada por ${data.lockedBy.userName}. Por favor espera.`);
      }
    });

    this.route.queryParams.subscribe((params) => {
      // Lo pendiente del diagrama anterior se guarda antes de cambiar de diagrama
      this.flushAutosave();
      const diagramId = params['diagramId'];
      const projectId = params['projectId'];
      const projectName = params['projectName'];

      if (projectId) {
        this.currentProjectId.set(projectId);
        this.projectService.getProject(projectId).subscribe({
          next: (project) => {
            this.projectMembers.set(
              (project?.members || []).map((m) => ({ userId: m.userId, userName: m.fullName })),
            );
            const user = this.authService.currentUser();
            if (user && project) {
              if (project.userRole) {
                this.currentUserRole.set(project.userRole);
              } else if (project.createdBy === user.id) {
                this.currentUserRole.set('OWNER');
              } else if (project.members) {
                const myMember = project.members.find((m: any) => m.userId === user.id);
                if (myMember) {
                  this.currentUserRole.set(myMember.role);
                }
              }
            }
          },
          error: () => {},
        });
      }

      if (projectName) {
        this.currentDiagramName.set(projectName);
      }

      if (diagramId) {
        this.currentDiagramId.set(diagramId);
        this.loadDiagramFromBackend(diagramId);
      }
      if (projectId) {
        this.diagramService.loadDiagramsByProject(projectId).subscribe((diagrams) => {
          this.projectDiagrams.set((diagrams || []).map((d) => ({ id: d.id, name: d.name })));
          if (!diagramId && diagrams && diagrams.length > 0) {
            const first = diagrams[0];
            this.currentDiagramId.set(first.id);
            this.currentDiagramName.set(first.name);
            this.loadDiagramFromBackend(first.id);
          }
        });
      }
    });

    this.updateConnectionEndpoints();
    this.resetHistory(true);
  }

  ngOnDestroy(): void {
    if (this.editingNodeId()) {
      this.collaborationService.releaseNodeLock(this.editingNodeId()!);
    }
    if (this.commitTimer) clearTimeout(this.commitTimer);
    this.flushPendingSync('update');
    this.flushAutosave();
    if (this.autosaveTimer) clearTimeout(this.autosaveTimer);
    this.collaborationService.leaveRoom();
  }

  loadDiagramFromBackend(diagramId: string): void {
    this.diagramService.loadDiagram(diagramId).subscribe((diagram) => {
      this.currentDiagramName.set(diagram.name);

      if (diagram.nodes && diagram.nodes.length > 0) {
        this.nodes.set(
          diagram.nodes.map((n) => ({
            id: n.id,
            name: n.name,
            position: { x: n.positionX, y: n.positionY },
            width: n.width || CLASS_LAYOUT.minWidth,
            height: n.height || undefined,
            isAnchor: n.isAnchor,
            assocMainConnId: n.assocMainConnId || undefined,
            attributes: (n.attributes || []).map((a) => ({
              name: a.name,
              type: this.normalizeDataType(a.type),
            })),
            methods: (n.methods || []).map((m) => ({
              name: m.name,
              parameters: m.parameters,
              returnType: this.normalizeReturnType(m.returnType),
            })),
          })),
        );
      }

      if (diagram.connections && diagram.connections.length > 0) {
        this.connections.set(
          diagram.connections.map((c) => ({
            id: c.id,
            sourceNodeId: c.sourceNodeId || undefined,
            targetNodeId: c.targetNodeId || undefined,
            sourceId: c.sourceId,
            targetId: c.targetId,
            type: c.type as UmlRelationshipType,
            name: c.name || undefined,
            sourceMultiplicity: c.sourceMultiplicity || '',
            targetMultiplicity: c.targetMultiplicity || '',
            assocAnchorNodeId: c.assocAnchorNodeId || undefined,
          })),
        );
      }

      this.collaborationService.joinRoom(diagramId);

      this.hasUnsavedChanges.set(false);
      this.saveState.set('saved');
      this.saveFailures = 0;
      this.updateConnectionEndpoints();
      this.resetHistory(true);
      setTimeout(() => {
        this.updateConnectionEndpoints();
        this.resetHistory(true);
      }, 50);
    });
  }

  normalizeDataType(type: string): string {
    if (!type) return 'String';
    const found = this.predefinedTypes.find((t) => t.toLowerCase() === type.trim().toLowerCase());
    return found || 'String';
  }

  normalizeReturnType(type: string): string {
    if (!type) return 'void';
    const found = this.predefinedReturnTypes.find(
      (rt) => rt.toLowerCase() === type.trim().toLowerCase(),
    );
    return found || 'void';
  }

  getNodeLock(nodeId: string): NodeLock | undefined {
    return this.collaborationService.activeNodeLocks().get(nodeId);
  }

  isNodeLockedByOther(nodeId: string): boolean {
    const lock = this.collaborationService.activeNodeLocks().get(nodeId);
    const currentUserId = this.authService.currentUser()?.id;
    return !!lock && lock.userId !== currentUserId;
  }

  getNodeName(nodeId?: string): string {
    return this.nodes().find((n) => n.id === nodeId)?.name || '';
  }

  /** Id base del nodo de un extremo (sin el sufijo del lado del conector). */
  private baseId(nodeId: string | undefined, connectorId: string | undefined): string {
    return nodeId || (connectorId || '').replace(SIDE_SUFFIX, '');
  }

  private clamp(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(value, Math.max(min, max)));
  }

  private getContainerSize(): { width: number; height: number } {
    const el = this.flowContainerRef?.nativeElement;
    return { width: el?.clientWidth || 1200, height: el?.clientHeight || 800 };
  }

  // ======================================================================
  // TECLADO
  // ======================================================================

  @HostListener('window:beforeunload', ['$event'])
  onBeforeUnload(event: BeforeUnloadEvent): void {
    if (!this.hasUnsavedChanges() || this.isReadOnly()) return;
    // Lo pendiente se envía con keepalive (sobrevive al cierre); si no se puede, se avisa
    const diagramId = this.currentDiagramId();
    this.flushPendingSync('update');
    if (diagramId && this.diagramService.saveAstOnUnload(diagramId, this.buildSavePayload())) {
      return;
    }
    event.preventDefault();
    event.returnValue = '';
  }

  @HostListener('window:keydown', ['$event'])
  handleKeyDown(event: KeyboardEvent): void {
    const mod = event.ctrlKey || event.metaKey;
    const key = event.key.toLowerCase();
    const target = event.target as HTMLElement | null;
    const tag = (target?.tagName || '').toLowerCase();
    const isTyping = ['input', 'textarea', 'select'].includes(tag) || !!target?.isContentEditable;

    if (event.key === 'Escape') {
      this.isHelpMenuOpen.set(false);
      this.setRelationTool(null);
      this.closeClassPanel();
      this.closeRelationPanel();
      this.flow?.clearSelection();
      this.showJsonModal.set(false);
      this.showSpringBootModal.set(false);
      return;
    }
    if (mod && key === 's') {
      event.preventDefault();
      if (!this.isReadOnly()) this.saveToBackend();
      return;
    }
    if (mod && key === 'i') {
      event.preventDefault();
      this.isAiPanelOpen.set(!this.isAiPanelOpen());
      return;
    }

    // El resto de atajos actúan sobre el lienzo, no mientras se escribe ni con modales abiertos
    if (
      isTyping ||
      this.isReadOnly() ||
      this.showJsonModal() ||
      this.showSpringBootModal() ||
      this.isProfileModalOpen()
    )
      return;

    if (mod && key === 'z' && !event.shiftKey) {
      event.preventDefault();
      this.undo();
    } else if (mod && (key === 'y' || (key === 'z' && event.shiftKey))) {
      event.preventDefault();
      this.redo();
    } else if (mod && key === 'a') {
      event.preventDefault();
      this.flow?.selectAll();
    } else if (mod && key === 'c') {
      this.copySelection();
    } else if (mod && key === 'x') {
      this.copySelection();
      this.deleteSelection();
    } else if (mod && key === 'v') {
      event.preventDefault();
      this.pasteClipboard();
    } else if (mod && key === 'd') {
      event.preventDefault();
      this.copySelection();
      this.pasteClipboard();
    } else if (event.key === 'Delete' || event.key === 'Backspace') {
      event.preventDefault();
      this.deleteSelection();
    } else if (event.key.startsWith('Arrow')) {
      // Paso fino de 1px para alinear a mano (Shift: 10px)
      const step = event.shiftKey ? 10 : 1;
      const delta = {
        ArrowUp: { x: 0, y: -step },
        ArrowDown: { x: 0, y: step },
        ArrowLeft: { x: -step, y: 0 },
        ArrowRight: { x: step, y: 0 },
      }[event.key];
      if (delta && this.selectedNodeIds().length > 0) {
        event.preventDefault();
        this.moveSelection(delta.x, delta.y);
      }
    }
  }

  // ======================================================================
  // GUARDADO E HISTORIAL
  // ======================================================================

  /** Guardado manual (botón o Ctrl+S): inmediato y con confirmación visible. */
  saveToBackend(): void {
    if (this.isReadOnly()) return;
    if (!this.currentDiagramId()) {
      this.openExportModal();
      return;
    }
    this.persist(false);
  }

  /**
   * Programa el guardado automático: tras AUTOSAVE_IDLE_MS sin editar, o como mucho a los
   * AUTOSAVE_MAX_WAIT_MS del primer cambio pendiente aunque se siga editando.
   */
  private scheduleAutosave(): void {
    if (this.isReadOnly() || !this.currentDiagramId()) return;
    const now = Date.now();
    if (!this.pendingSince) this.pendingSince = now;
    const wait = Math.min(AUTOSAVE_IDLE_MS, this.pendingSince + AUTOSAVE_MAX_WAIT_MS - now);
    this.setAutosaveTimer(Math.max(0, wait));
  }

  private setAutosaveTimer(delayMs: number): void {
    if (this.autosaveTimer) clearTimeout(this.autosaveTimer);
    this.autosaveTimer = setTimeout(() => {
      this.autosaveTimer = null;
      this.persist(true);
    }, delayMs);
  }

  /** Guarda ya lo pendiente (al cambiar de diagrama o salir del editor). */
  private flushAutosave(): void {
    if (this.hasUnsavedChanges() && !this.saveInFlight) this.persist(true);
  }

  /**
   * Envía el diagrama al servidor. Si ya hay un guardado en curso, se repite al terminar; si
   * falla, se reintenta con espera creciente. Solo el guardado manual avisa al equipo: los
   * demás ya tienen el diagrama por la sincronización en vivo, y reenviarlo cada pocos segundos
   * pisaría lo que estén escribiendo.
   */
  private persist(auto: boolean): void {
    const diagramId = this.currentDiagramId();
    if (this.isReadOnly() || !diagramId) return;
    if (this.autosaveTimer) {
      clearTimeout(this.autosaveTimer);
      this.autosaveTimer = null;
    }
    if (this.saveInFlight) {
      if (!auto) this.manualSaveQueued = true;
      return;
    }
    if (auto && !this.hasUnsavedChanges()) return;

    const version = this.editVersion;
    this.saveInFlight = true;
    this.pendingSince = 0;
    this.saveState.set('saving');
    this.diagramService.saveAst(diagramId, this.buildSavePayload()).subscribe({
      next: () => {
        this.saveInFlight = false;
        this.saveFailures = 0;
        // Si cambió de diagrama mientras tanto, el estado ya es el del diagrama nuevo
        if (this.currentDiagramId() !== diagramId) return;
        const dirty = this.editVersion !== version;
        this.hasUnsavedChanges.set(dirty);
        this.saveState.set(dirty ? 'pending' : 'saved');
        if (!auto) {
          this.saveSuccessMessage.set(true);
          this.tour.notify('diagram-saved');
          setTimeout(() => this.saveSuccessMessage.set(false), 2500);
          this.collaborationService.sendDiagramSync(this.nodes(), this.connections(), 'save');
        }
        const manual = this.manualSaveQueued;
        this.manualSaveQueued = false;
        if (manual) this.persist(false);
        else if (dirty) this.scheduleAutosave();
      },
      error: () => {
        this.saveInFlight = false;
        this.manualSaveQueued = false;
        if (this.currentDiagramId() !== diagramId) return;
        this.saveFailures++;
        this.saveState.set('error');
        const delay = Math.min(
          AUTOSAVE_RETRY_MS.max,
          AUTOSAVE_RETRY_MS.first * 2 ** (this.saveFailures - 1),
        );
        this.setAutosaveTimer(delay);
      },
    });
  }

  private buildSavePayload(): SaveDiagramAstRequest {
    return {
      nodes: this.nodes().map((n) => ({
        id: n.id,
        name: n.isAnchor ? n.name || 'Anchor' : n.name,
        positionX: n.position.x,
        positionY: n.position.y,
        width: n.isAnchor ? 0 : this.getNodeWidth(n),
        height: n.isAnchor ? 0 : this.getNodeHeight(n),
        isAnchor: n.isAnchor,
        assocMainConnId: n.assocMainConnId,
        attributes: n.attributes.filter((a) => a.name.trim()),
        methods: n.methods.filter((m) => m.name.trim()),
      })),
      connections: this.connections().map((c) => ({
        id: c.id,
        sourceNodeId: this.baseId(c.sourceNodeId, c.sourceId),
        targetNodeId: this.baseId(c.targetNodeId, c.targetId),
        sourceId: c.sourceId,
        targetId: c.targetId,
        type: c.type,
        name: c.name || null,
        sourceMultiplicity: c.sourceMultiplicity || '',
        targetMultiplicity: c.targetMultiplicity || '',
        assocAnchorNodeId: c.assocAnchorNodeId || null,
      })),
    };
  }

  private snapshot(): { nodes: UmlClassNode[]; connections: UmlConnection[] } {
    return { nodes: this.nodes(), connections: this.connections() };
  }

  private refreshHistoryFlags(): void {
    this.canUndo.set(this.history.canUndo);
    this.canRedo.set(this.history.canRedo);
  }

  private resetHistory(clearStacks = false): void {
    if (this.commitTimer) {
      clearTimeout(this.commitTimer);
      this.commitTimer = null;
    }
    this.history.reset(this.snapshot(), clearStacks);
    this.refreshHistoryFlags();
  }

  /** Confirma el estado actual como paso deshacible (con retardo para agrupar escritura o arrastres). */
  private commitHistory(delayMs = 0): void {
    if (this.batchingHistory) return;
    if (this.commitTimer) clearTimeout(this.commitTimer);
    const run = () => {
      this.commitTimer = null;
      this.history.commit(this.snapshot());
      this.refreshHistoryFlags();
    };
    if (delayMs > 0) this.commitTimer = setTimeout(run, delayMs);
    else run();
  }

  private flushPendingCommit(): void {
    if (this.commitTimer) {
      clearTimeout(this.commitTimer);
      this.commitTimer = null;
      this.history.commit(this.snapshot());
      this.refreshHistoryFlags();
    }
  }

  /** Envía el diagrama a los colaboradores, agrupando cambios rápidos (escritura en paneles). */
  private scheduleSync(action: string, delayMs = 250): void {
    if (this.syncTimer) clearTimeout(this.syncTimer);
    this.syncTimer = setTimeout(() => {
      this.syncTimer = null;
      this.collaborationService.sendDiagramSync(this.nodes(), this.connections(), action);
    }, delayMs);
  }

  private flushPendingSync(action: string): void {
    if (this.syncTimer) {
      clearTimeout(this.syncTimer);
      this.syncTimer = null;
      this.collaborationService.sendDiagramSync(this.nodes(), this.connections(), action);
    }
  }

  /** Cierre común de una edición: marca sin guardar, recalcula extremos, sincroniza y apila en el historial. */
  private afterMutation(action: string): void {
    this.markAsUnsaved();
    this.updateConnectionEndpoints();
    this.collaborationService.sendDiagramSync(this.nodes(), this.connections(), action);
    this.commitHistory();
  }

  undo(): void {
    if (this.isReadOnly()) return;
    this.flushPendingCommit();
    const prev = this.history.undo();
    if (prev) this.applySnapshot(prev, 'undo');
  }

  redo(): void {
    if (this.isReadOnly()) return;
    this.flushPendingCommit();
    const next = this.history.redo();
    if (next) this.applySnapshot(next, 'redo');
  }

  private applySnapshot(
    snapshot: { nodes: UmlClassNode[]; connections: UmlConnection[] },
    action: string,
  ): void {
    this.closeClassPanel(false);
    this.closeRelationPanel();
    this.nodes.set(snapshot.nodes);
    this.connections.set(snapshot.connections);
    this.markAsUnsaved();
    this.updateConnectionEndpoints();
    this.collaborationService.sendDiagramSync(this.nodes(), this.connections(), action);
    // updateConnectionEndpoints puede reajustar lados; se toma como nueva base sin crear paso
    this.history.reset(this.snapshot());
    this.refreshHistoryFlags();
  }

  private readCanvasTheme(): CanvasTheme {
    try {
      return localStorage.getItem(CANVAS_THEME_KEY) === 'dark' ? 'dark' : 'light';
    } catch {
      return 'light';
    }
  }

  setCanvasTheme(theme: CanvasTheme): void {
    this.canvasTheme.set(theme);
    try {
      localStorage.setItem(CANVAS_THEME_KEY, theme);
    } catch {
      // Sin almacenamiento disponible el tema solo dura la sesión
    }
  }

  private readAiDock(): 'bottom' | 'side' {
    try {
      return localStorage.getItem(AI_DOCK_KEY) === 'side' ? 'side' : 'bottom';
    } catch {
      return 'bottom';
    }
  }

  setAiDock(dock: 'bottom' | 'side'): void {
    this.aiDock.set(dock);
    try {
      localStorage.setItem(AI_DOCK_KEY, dock);
    } catch {
      // Sin almacenamiento disponible la posición solo dura la sesión
    }
  }

  // ======================================================================
  // LIENZO
  // ======================================================================

  /** Foblex avisa al soltar la clase: queda donde se suelta, salvo para enderezar una relación casi recta. */
  onNodePositionChange(node: UmlClassNode, newPosition: { x: number; y: number }): void {
    if (this.isReadOnly() || this.isNodeLockedByOther(node.id)) return;
    const straightened = this.straightenRelations(node, newPosition);
    node.position = straightened;
    if (straightened.x !== newPosition.x || straightened.y !== newPosition.y) {
      // Nuevo objeto para que Foblex mueva la clase a la posición enderezada
      this.nodes.update((list) =>
        list.map((n) => (n.id === node.id ? { ...n, position: straightened } : n)),
      );
    }
    this.markAsUnsaved();
    this.updateConnectionEndpoints();
    this.layoutVersion.update((v) => v + 1);
    this.collaborationService.sendNodeDrag(node.id, straightened);
    this.commitHistory(300);
  }

  /**
   * Si al soltar una clase alguna de sus relaciones queda a pocos píxeles de ser horizontal o vertical,
   * la alinea del todo (centros a la misma altura o en la misma columna). Fuera de ese margen no la mueve.
   */
  private straightenRelations(
    node: UmlClassNode,
    position: { x: number; y: number },
  ): { x: number; y: number } {
    const threshold = 10;
    const w = this.getNodeWidth(node);
    const h = this.getNodeHeight(node);
    const center = { x: position.x + w / 2, y: position.y + h / 2 };
    const nodeMap = new Map(this.nodes().map((n) => [n.id, n]));
    let bestDx: number | null = null;
    let bestDy: number | null = null;

    for (const conn of this.connections()) {
      if (conn.type === 'association_class') continue;
      const s = this.baseId(conn.sourceNodeId, conn.sourceId);
      const t = this.baseId(conn.targetNodeId, conn.targetId);
      const otherId = s === node.id ? t : t === node.id ? s : null;
      const other = otherId ? nodeMap.get(otherId) : undefined;
      if (!other || other.isAnchor || other.id === node.id) continue;
      const oc = {
        x: other.position.x + this.getNodeWidth(other) / 2,
        y: other.position.y + this.getNodeHeight(other) / 2,
      };
      const dx = oc.x - center.x;
      const dy = oc.y - center.y;
      if (Math.abs(dx) <= threshold && (bestDx === null || Math.abs(dx) < Math.abs(bestDx)))
        bestDx = dx;
      if (Math.abs(dy) <= threshold && (bestDy === null || Math.abs(dy) < Math.abs(bestDy)))
        bestDy = dy;
    }

    return {
      x: Math.round(position.x + (bestDx ?? 0)),
      y: Math.round(position.y + (bestDy ?? 0)),
    };
  }

  onCanvasMouseMove(event: MouseEvent): void {
    const container = this.flowContainerRef?.nativeElement;
    if (!container) return;

    const rect = container.getBoundingClientRect();
    const t = this.canvasTransform();
    const canvasX = (event.clientX - rect.left - t.x) / t.scale;
    const canvasY = (event.clientY - rect.top - t.y) / t.scale;

    this.collaborationService.sendCursorPosition(canvasX, canvasY);
  }

  /** Selecciona clases desde código; Foblex no emite fSelectionChange en ese caso. */
  private selectNodes(ids: string[]): void {
    this.selectedNodeIds.set(ids);
    this.selectedConnIds.set([]);
    setTimeout(() => this.flow?.select(ids, []));
  }

  onSelectionChange(event: FSelectionChangeEvent): void {
    this.selectedNodeIds.set(event.nodeIds);
    this.selectedConnIds.set(event.connectionIds);
    // Al seleccionar otra cosa (o hacer clic en el fondo) se cierran los paneles, como en Apollon
    const editingNode = this.editingNodeId();
    if (editingNode && !event.nodeIds.includes(editingNode)) this.closeClassPanel();
    const editingConn = this.editingConnId();
    if (editingConn && !event.connectionIds.includes(editingConn)) this.closeRelationPanel();
  }

  // ======================================================================
  // GEOMETRÍA DE LAS CLASES
  // ======================================================================

  private textWidth(text: string, font: string): number {
    if (!this.measureCtx) {
      this.measureCtx = document.createElement('canvas').getContext('2d');
      const styles = getComputedStyle(document.documentElement);
      this.fontFamilies = {
        sans: styles.getPropertyValue('--font-sans').trim() || 'sans-serif',
        mono: styles.getPropertyValue('--font-mono').trim() || 'monospace',
      };
    }
    if (!this.measureCtx) return text.length * 7;
    this.measureCtx.font = font;
    return this.measureCtx.measureText(text).width;
  }

  /** Ancho visible: el guardado como mínimo, ampliado para que ningún texto se corte. */
  getNodeWidth(node: UmlClassNode): number {
    if (node.isAnchor) return 0;
    this.textWidth('', '11px monospace');
    const fonts = this.fontFamilies!;
    const row = `13.5px ${fonts.sans}`;
    const widths = [
      this.textWidth(node.name || '', `700 15px ${fonts.sans}`),
      ...(node.attributes || []).map((a) => this.textWidth(`− ${a.name || '…'}: ${a.type}`, row)),
      ...(node.methods || []).map((m) =>
        this.textWidth(`+ ${m.name || '…'}(${m.parameters || ''}): ${m.returnType || 'void'}`, row),
      ),
    ];
    const content = Math.ceil(
      Math.max(0, ...widths) + CLASS_LAYOUT.paddingX * 2 + CLASS_LAYOUT.border * 2 + 4,
    );
    return Math.max(node.width || CLASS_LAYOUT.minWidth, content);
  }

  getNodeHeight(node: UmlClassNode): number {
    if (node.isAnchor) return 0;
    const compartment = (count: number) =>
      count > 0
        ? count * CLASS_LAYOUT.rowHeight + CLASS_LAYOUT.compartmentPadding
        : CLASS_LAYOUT.emptyCompartment;
    return (
      CLASS_LAYOUT.border * 2 +
      CLASS_LAYOUT.headerHeight +
      compartment((node.attributes || []).length) +
      CLASS_LAYOUT.border +
      compartment((node.methods || []).length)
    );
  }

  getOptimalConnectorId(
    sourceNode: UmlClassNode,
    targetNode: UmlClassNode,
  ): { sourceId: string; targetId: string } {
    const sWidth = this.getNodeWidth(sourceNode);
    const sHeight = this.getNodeHeight(sourceNode);
    const tWidth = this.getNodeWidth(targetNode);
    const tHeight = this.getNodeHeight(targetNode);

    const sCenter = {
      x: sourceNode.position.x + sWidth / 2,
      y: sourceNode.position.y + sHeight / 2,
    };
    const tCenter = {
      x: targetNode.position.x + tWidth / 2,
      y: targetNode.position.y + tHeight / 2,
    };

    const dx = tCenter.x - sCenter.x;
    const dy = tCenter.y - sCenter.y;

    let sourceSide = '_right';
    let targetSide = '_left';

    if (Math.abs(dx) >= Math.abs(dy)) {
      if (dx >= 0) {
        sourceSide = '_right';
        targetSide = '_left';
      } else {
        sourceSide = '_left';
        targetSide = '_right';
      }
    } else {
      if (dy >= 0) {
        sourceSide = '_bottom';
        targetSide = '_top';
      } else {
        sourceSide = '_top';
        targetSide = '_bottom';
      }
    }

    return {
      sourceId: sourceNode.id + (sourceNode.isAnchor ? '' : sourceSide),
      targetId: targetNode.id + (targetNode.isAnchor ? '' : targetSide),
    };
  }

  getConnectorPoint(node: UmlClassNode, side: string): { x: number; y: number } {
    const w = this.getNodeWidth(node);
    const h = this.getNodeHeight(node);
    switch (side) {
      case 'left':
        return { x: node.position.x, y: node.position.y + h / 2 };
      case 'right':
        return { x: node.position.x + w, y: node.position.y + h / 2 };
      case 'top':
        return { x: node.position.x + w / 2, y: node.position.y };
      case 'bottom':
        return { x: node.position.x + w / 2, y: node.position.y + h };
      default:
        return { x: node.position.x + w / 2, y: node.position.y + h / 2 };
    }
  }

  /**
   * Punto medio de la línea recta entre dos clases (de centro a centro, recortada en cada borde),
   * como en StarUML: ahí cuelga la clase de asociación.
   */
  private relationMidpoint(a: UmlClassNode, b: UmlClassNode): { x: number; y: number } {
    const box = (n: UmlClassNode) => ({ w: this.getNodeWidth(n), h: this.getNodeHeight(n) });
    const center = (n: UmlClassNode) => ({
      x: n.position.x + box(n).w / 2,
      y: n.position.y + box(n).h / 2,
    });
    const ca = center(a);
    const cb = center(b);
    const clip = (
      c: { x: number; y: number },
      n: UmlClassNode,
      toward: { x: number; y: number },
    ) => {
      const dx = toward.x - c.x;
      const dy = toward.y - c.y;
      const { w, h } = box(n);
      const t = Math.min(
        dx ? w / 2 / Math.abs(dx) : Infinity,
        dy ? h / 2 / Math.abs(dy) : Infinity,
        1,
      );
      return { x: c.x + dx * t, y: c.y + dy * t };
    };
    const pa = clip(ca, a, cb);
    const pb = clip(cb, b, ca);
    return { x: (pa.x + pb.x) / 2, y: (pa.y + pb.y) / 2 };
  }

  /** Guarda el lado más cercano de cada relación (para el backend) y recoloca las anclas de las clases de asociación. */
  updateConnectionEndpoints(): void {
    const nodeMap = new Map(this.nodes().map((n) => [n.id, n]));

    // 1. Lado más cercano de cada relación entre clases
    this.connections.update((conns) =>
      conns
        .filter(
          (conn) =>
            nodeMap.has(this.baseId(conn.sourceNodeId, conn.sourceId)) &&
            nodeMap.has(this.baseId(conn.targetNodeId, conn.targetId)),
        )
        .map((conn) => {
          const baseSourceId = this.baseId(conn.sourceNodeId, conn.sourceId);
          const baseTargetId = this.baseId(conn.targetNodeId, conn.targetId);
          const sourceNode = nodeMap.get(baseSourceId);
          const targetNode = nodeMap.get(baseTargetId);

          if (sourceNode && targetNode && !sourceNode.isAnchor && !targetNode.isAnchor) {
            const optimal = this.getOptimalConnectorId(sourceNode, targetNode);
            if (
              conn.sourceNodeId === baseSourceId &&
              conn.targetNodeId === baseTargetId &&
              conn.sourceId === optimal.sourceId &&
              conn.targetId === optimal.targetId
            ) {
              return conn;
            }
            return {
              ...conn,
              sourceNodeId: baseSourceId,
              targetNodeId: baseTargetId,
              sourceId: optimal.sourceId,
              targetId: optimal.targetId,
            };
          }
          return conn;
        }),
    );

    // 2. Las anclas de las clases de asociación van al punto medio de su relación
    for (const conn of this.connections()) {
      if (!conn.assocAnchorNodeId) continue;
      const anchorNode = nodeMap.get(conn.assocAnchorNodeId);
      const sourceNode = nodeMap.get(this.baseId(conn.sourceNodeId, conn.sourceId));
      const targetNode = nodeMap.get(this.baseId(conn.targetNodeId, conn.targetId));
      if (!anchorNode || !sourceNode || !targetNode) continue;
      const mid = this.relationMidpoint(sourceNode, targetNode);
      anchorNode.position = { x: Math.round(mid.x), y: Math.round(mid.y) };
    }

    // 3. La línea discontinua «link» va del ancla al lado más cercano de la clase de asociación
    this.connections.update((conns) =>
      conns.map((conn) => {
        if (conn.type !== 'association_class' || !conn.sourceNodeId || !conn.targetNodeId)
          return conn;
        const sourceNode = nodeMap.get(conn.sourceNodeId);
        const targetNode = nodeMap.get(conn.targetNodeId);
        if (!sourceNode || !targetNode || !sourceNode.isAnchor) return conn;
        const optimal = this.getOptimalConnectorId(sourceNode, targetNode);
        if (conn.sourceId === sourceNode.id && conn.targetId === optimal.targetId) return conn;
        return { ...conn, sourceId: sourceNode.id, targetId: optimal.targetId };
      }),
    );
  }

  /** Conector con el que se dibuja un extremo: la clase completa (línea de borde a borde) o el ancla. */
  getRenderedEndpoint(conn: UmlConnection, end: 'source' | 'target'): string {
    const nodeId = this.baseId(
      end === 'source' ? conn.sourceNodeId : conn.targetNodeId,
      end === 'source' ? conn.sourceId : conn.targetId,
    );
    const node = this.nodes().find((n) => n.id === nodeId);
    return node && !node.isAnchor
      ? `${nodeId}__box`
      : end === 'source'
        ? conn.sourceId
        : conn.targetId;
  }

  isConnectionSelected(connId: string): boolean {
    const selId = this.selectedNodeId();
    if (!selId) return false;
    const conn = this.connections().find((c) => c.id === connId);
    if (!conn) return false;
    return (
      this.baseId(conn.sourceNodeId, conn.sourceId) === selId ||
      this.baseId(conn.targetNodeId, conn.targetId) === selId
    );
  }

  isNeighborNode(nodeId: string): boolean {
    const selId = this.selectedNodeId();
    if (!selId || nodeId === selId) return false;
    return this.connections().some((c) => {
      const s = this.baseId(c.sourceNodeId, c.sourceId);
      const t = this.baseId(c.targetNodeId, c.targetId);
      return (s === selId && t === nodeId) || (t === selId && s === nodeId);
    });
  }

  isDiamondAtStart(conn: UmlConnection): boolean {
    const sMult = (conn.sourceMultiplicity || '').trim();
    const tMult = (conn.targetMultiplicity || '').trim();
    const isTargetOne = tMult === '1' || tMult === '0..1';
    const isSourceMany = sMult.includes('*') || sMult.toLowerCase().includes('n');

    if (isTargetOne && isSourceMany) {
      return false;
    }
    return true;
  }

  onFlowLoaded(): void {
    const t = this.canvas?.transform;
    if (t) {
      this.canvasTransform.set({
        x: t.position?.x || 0,
        y: t.position?.y || 0,
        scale: t.scale || 1,
      });
    }
    this.updateConnectionEndpoints();
  }

  // ======================================================================
  // RELACIONES
  // ======================================================================

  /** Arrastrar desde un punto de una clase y soltar en cualquier parte de otra crea una asociación. */
  onConnectionCreated(event: FCreateConnectionEvent): void {
    if (this.isReadOnly() || !event.targetId) return;
    this.flushPendingCommit();

    const baseSourceId = event.sourceId.replace(SIDE_SUFFIX, '');
    const baseTargetId = event.targetId.replace(SIDE_SUFFIX, '');
    if (baseSourceId === baseTargetId) return;

    if (this.isNodeLockedByOther(baseSourceId) || this.isNodeLockedByOther(baseTargetId)) {
      alert('🔒 No se pueden crear conexiones hacia/desde una tabla que está siendo editada.');
      return;
    }

    const nodeMap = new Map(this.nodes().map((n) => [n.id, n]));
    const sourceNode = nodeMap.get(baseSourceId);
    const targetNode = nodeMap.get(baseTargetId);
    if (!sourceNode || !targetNode || sourceNode.isAnchor || targetNode.isAnchor) return;

    this.createRelation(sourceNode, targetNode, this.relationTool() || 'association');
  }

  // ======================================================================
  // HERRAMIENTAS DE RELACIÓN (paleta, estilo StarUML)
  // ======================================================================

  setRelationTool(type: UmlRelationshipType | null): void {
    if (this.isReadOnly()) return;
    this.relationTool.set(type);
    this.relationSourceId.set(null);
    if (type) {
      this.closeClassPanel();
      this.closeRelationPanel();
      this.tour.notify('relation-selected');
    }
  }

  /** Con una herramienta activa: primer clic elige el origen, el segundo crea la relación. */
  onNodeClickForRelation(node: UmlClassNode, event: MouseEvent): void {
    const tool = this.relationTool();
    if (!tool || node.isAnchor || this.isReadOnly()) return;
    event.stopPropagation();
    if (this.isNodeLockedByOther(node.id)) return;

    const sourceId = this.relationSourceId();
    if (!sourceId) {
      this.relationSourceId.set(node.id);
      return;
    }
    if (sourceId === node.id) {
      this.relationSourceId.set(null);
      return;
    }
    const sourceNode = this.nodes().find((n) => n.id === sourceId);
    if (sourceNode) {
      this.flushPendingCommit();
      this.createRelation(sourceNode, node, tool);
    }
  }

  /** Crea la relación del tipo indicado; la clase de asociación crea además la clase intermedia. */
  private createRelation(
    sourceNode: UmlClassNode,
    targetNode: UmlClassNode,
    type: UmlRelationshipType,
  ): void {
    const isAssocClass = type === 'association_class';
    // Herencia, realización y dependencia no llevan multiplicidad en UML
    const withMultiplicity = [
      'association',
      'aggregation',
      'composition',
      'association_class',
    ].includes(type);
    const optimal = this.getOptimalConnectorId(sourceNode, targetNode);
    const newConnection: UmlConnection = {
      id: `conn_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
      sourceNodeId: sourceNode.id,
      targetNodeId: targetNode.id,
      sourceId: optimal.sourceId,
      targetId: optimal.targetId,
      type: isAssocClass ? 'association' : type,
      sourceMultiplicity: isAssocClass ? '0..*' : withMultiplicity ? '1' : '',
      targetMultiplicity: isAssocClass ? '0..*' : withMultiplicity ? '1..*' : '',
    };

    this.batchingHistory = true;
    try {
      this.connections.update((list) => [...list, newConnection]);
      if (isAssocClass) {
        this.addAssociationClass(newConnection);
      } else {
        this.afterMutation('create_conn');
      }
    } finally {
      this.batchingHistory = false;
    }
    this.commitHistory();
    this.relationTool.set(null);
    this.relationSourceId.set(null);
    this.tour.notify('connection-created');
  }

  /** Arrastrar un extremo de la línea a otra clase la reasigna. */
  onConnectionReassigned(event: FReassignConnectionEvent): void {
    if (this.isReadOnly()) return;
    this.flushPendingCommit();
    const conn = this.connections().find((c) => c.id === event.connectionId);
    if (!conn || conn.type === 'association_class') return;

    const nextSource = this.baseId(undefined, event.nextSourceId || conn.sourceId);
    const nextTarget = this.baseId(undefined, event.nextTargetId || conn.targetId);
    if (nextSource === nextTarget) return;
    const nodeMap = new Map(this.nodes().map((n) => [n.id, n]));
    if (nodeMap.get(nextSource)?.isAnchor || nodeMap.get(nextTarget)?.isAnchor) return;

    this.connections.update((list) =>
      list.map((c) =>
        c.id === conn.id
          ? {
              ...c,
              sourceNodeId: nextSource,
              targetNodeId: nextTarget,
              sourceId: event.nextSourceId || c.sourceId,
              targetId: event.nextTargetId || c.targetId,
            }
          : c,
      ),
    );
    this.afterMutation('reassign_conn');
  }

  openRelationPanel(conn: UmlConnection, event?: MouseEvent): void {
    if (event) event.stopPropagation();
    if (this.isReadOnly() || conn.type === 'association_class') return;
    this.closeClassPanel();
    this.editingConnId.set(conn.id);
  }

  closeRelationPanel(): void {
    if (!this.editingConnId()) return;
    this.flushPendingSync('update_conn');
    this.flushPendingCommit();
    this.editingConnId.set(null);
  }

  onRelationPanelChange(updated: UmlConnection): void {
    const previous = this.connections().find((c) => c.id === updated.id);
    // Cambiar el tipo es un paso propio; lo que se escribe se agrupa
    const isDiscrete = !!previous && previous.type !== updated.type;
    if (isDiscrete) this.flushPendingCommit();
    this.connections.update((list) => list.map((c) => (c.id === updated.id ? updated : c)));
    this.markAsUnsaved();
    this.scheduleSync('update_conn');
    this.commitHistory(isDiscrete ? 0 : 500);
  }

  swapConnectionDirection(connId: string): void {
    this.flushPendingCommit();
    this.connections.update((list) =>
      list.map((c) =>
        c.id === connId
          ? {
              ...c,
              sourceNodeId: c.targetNodeId,
              targetNodeId: c.sourceNodeId,
              sourceId: c.targetId,
              targetId: c.sourceId,
              sourceMultiplicity: c.targetMultiplicity,
              targetMultiplicity: c.sourceMultiplicity,
            }
          : c,
      ),
    );
    this.afterMutation('update_conn');
  }

  /** Crea o quita la clase de asociación ligada al punto medio de la relación. */
  toggleAssociationClass(connId: string): void {
    const conn = this.connections().find((c) => c.id === connId);
    if (!conn || this.isReadOnly()) return;
    this.flushPendingCommit();
    if (conn.assocAnchorNodeId) {
      this.removeAssociationClass(conn);
    } else {
      this.addAssociationClass(conn);
    }
  }

  private addAssociationClass(conn: UmlConnection): void {
    const nodeMap = new Map(this.nodes().map((n) => [n.id, n]));
    const sourceNode = nodeMap.get(this.baseId(conn.sourceNodeId, conn.sourceId));
    const targetNode = nodeMap.get(this.baseId(conn.targetNodeId, conn.targetId));
    if (!sourceNode || !targetNode) return;

    const timestamp = Date.now();
    const anchorId = `anchor_${timestamp}`;
    const assocNodeId = `node_${timestamp}_assoc`;
    const assocName = `${sourceNode.name}_${targetNode.name}`;
    const attributes = [
      { name: 'id', type: 'UUID' },
      { name: 'fechaRegistro', type: 'LocalDateTime' },
    ];

    // Punto medio de la relación; si la línea es más vertical que horizontal, la clase va a un lado
    const mid = this.relationMidpoint(sourceNode, targetNode);
    const midX = Math.round(mid.x);
    const midY = Math.round(mid.y);
    const dx = Math.abs(targetNode.position.x - sourceNode.position.x);
    const dy = Math.abs(targetNode.position.y - sourceNode.position.y);
    const verticalLane = dy > dx;
    const position = this.findFreeSpotNear(
      { x: midX, y: midY },
      {
        width: CLASS_LAYOUT.minWidth,
        height: this.getNodeHeight({
          id: '',
          name: assocName,
          position: { x: 0, y: 0 },
          width: 0,
          attributes,
          methods: [],
        }),
      },
      verticalLane,
    );

    const anchorNode: UmlClassNode = {
      id: anchorId,
      name: '',
      position: { x: midX, y: midY },
      width: 0,
      height: 0,
      attributes: [],
      methods: [],
      isAnchor: true,
    };

    const assocNode: UmlClassNode = {
      id: assocNodeId,
      name: assocName,
      position,
      width: CLASS_LAYOUT.minWidth,
      attributes,
      methods: [],
      assocMainConnId: conn.id,
    };

    const dashedConnection: UmlConnection = {
      id: `conn_${timestamp}_assoc_dashed`,
      sourceNodeId: anchorId,
      targetNodeId: assocNodeId,
      sourceId: anchorId,
      targetId: `${assocNodeId}_top`,
      type: 'association_class',
      name: '«link»',
    };

    this.nodes.update((list) => [...list, anchorNode, assocNode]);
    this.connections.update((list) => [
      ...list.map((c) => (c.id === conn.id ? { ...c, assocAnchorNodeId: anchorId } : c)),
      dashedConnection,
    ]);
    this.afterMutation('create_assoc_class');
  }

  /**
   * Busca un hueco libre junto al punto medio de la relación para la clase de asociación:
   * a los lados si la línea es vertical, arriba o abajo si es horizontal, alejándose hasta no pisar otra clase.
   */
  private findFreeSpotNear(
    mid: { x: number; y: number },
    size: { width: number; height: number },
    verticalLane: boolean,
  ): { x: number; y: number } {
    const gap = 60;
    const margin = this.gridSize;
    const others = this.nodes()
      .filter((n) => !n.isAnchor)
      .map((n) => ({
        x: n.position.x,
        y: n.position.y,
        w: this.getNodeWidth(n),
        h: this.getNodeHeight(n),
      }));
    const isFree = (x: number, y: number) =>
      others.every(
        (o) =>
          x + size.width + margin <= o.x ||
          o.x + o.w + margin <= x ||
          y + size.height + margin <= o.y ||
          o.y + o.h + margin <= y,
      );

    const bases = verticalLane
      ? [
          { x: mid.x - gap - size.width, y: mid.y - size.height / 2, dx: 0, dy: 1 },
          { x: mid.x + gap, y: mid.y - size.height / 2, dx: 0, dy: 1 },
        ]
      : [
          { x: mid.x - size.width / 2, y: mid.y + gap, dx: 1, dy: 0 },
          { x: mid.x - size.width / 2, y: mid.y - gap - size.height, dx: 1, dy: 0 },
        ];
    for (let step = 0; step < 12; step++) {
      // Se alterna hacia un lado y otro del punto medio a lo largo del tramo
      const shift = Math.ceil(step / 2) * (step % 2 ? 1 : -1) * (size.height / 2 + margin);
      for (const b of bases) {
        const x = this.snap(b.x + b.dx * shift * 2);
        const y = this.snap(b.y + b.dy * shift);
        if (isFree(x, y)) return { x, y };
      }
    }
    return { x: this.snap(bases[0].x), y: this.snap(bases[0].y) };
  }

  private removeAssociationClass(conn: UmlConnection): void {
    const nodesToDelete = new Set<string>();
    if (conn.assocAnchorNodeId) nodesToDelete.add(conn.assocAnchorNodeId);
    this.nodes().forEach((n) => {
      if (n.assocMainConnId === conn.id) nodesToDelete.add(n.id);
    });

    this.nodes.update((list) => list.filter((n) => !nodesToDelete.has(n.id)));
    this.connections.update((list) =>
      list
        .filter(
          (c) =>
            !nodesToDelete.has(this.baseId(c.sourceNodeId, c.sourceId)) &&
            !nodesToDelete.has(this.baseId(c.targetNodeId, c.targetId)),
        )
        .map((c) => (c.id === conn.id ? { ...c, assocAnchorNodeId: undefined } : c)),
    );
    this.afterMutation('remove_assoc_class');
  }

  removeConnection(connId: string, event?: MouseEvent): void {
    if (event) event.stopPropagation();
    if (this.isReadOnly()) return;
    this.flushPendingCommit();

    const conn = this.connections().find((c) => c.id === connId);
    const connsToDelete = new Set<string>([connId]);
    const nodesToDelete = new Set<string>();

    if (conn) {
      if (conn.assocAnchorNodeId) {
        nodesToDelete.add(conn.assocAnchorNodeId);
      }
      this.nodes().forEach((n) => {
        if (n.assocMainConnId === conn.id) {
          nodesToDelete.add(n.id);
        }
      });

      if (conn.type === 'association_class') {
        const sourceNode = this.nodes().find(
          (n) => n.id === this.baseId(conn.sourceNodeId, conn.sourceId),
        );
        const targetNode = this.nodes().find(
          (n) => n.id === this.baseId(conn.targetNodeId, conn.targetId),
        );
        if (sourceNode?.isAnchor) nodesToDelete.add(sourceNode.id);
        if (targetNode?.isAnchor) nodesToDelete.add(targetNode.id);
      }
    }

    this.connections().forEach((c) => {
      if (
        nodesToDelete.has(this.baseId(c.sourceNodeId, c.sourceId)) ||
        nodesToDelete.has(this.baseId(c.targetNodeId, c.targetId))
      ) {
        connsToDelete.add(c.id);
      }
    });

    if (nodesToDelete.size > 0) {
      this.nodes.update((list) => list.filter((n) => !nodesToDelete.has(n.id)));
    }
    this.connections.update((list) => list.filter((c) => !connsToDelete.has(c.id)));

    if (this.editingConnId() && connsToDelete.has(this.editingConnId()!)) {
      this.editingConnId.set(null);
    }
    this.afterMutation('delete_conn');
  }

  // ======================================================================
  // CLASES
  // ======================================================================

  private snap(value: number): number {
    return Math.round(value / this.gridSize) * this.gridSize;
  }

  /** Clic en la paleta: agrega la clase en el centro de la vista. */
  addClass(): void {
    if (this.isReadOnly()) return;
    const t = this.canvasTransform();
    const { width, height } = this.getContainerSize();
    const offset = (this.nodes().filter((n) => !n.isAnchor).length % 5) * this.gridSize * 2;
    this.addClassAt({
      x: (width / 2 - t.x) / t.scale - CLASS_LAYOUT.minWidth / 2 + offset,
      y: (height / 2 - t.y) / t.scale - 60 + offset,
    });
  }

  /** Soltar el elemento de la paleta sobre el lienzo. */
  onPaletteDrop(event: FCreateNodeEvent): void {
    if (this.isReadOnly()) return;
    const rect = event.externalItemRect;
    this.addClassAt({ x: rect.x, y: rect.y });
  }

  private addClassAt(position: { x: number; y: number }): void {
    this.flushPendingCommit();
    const count = this.nodes().filter((n) => !n.isAnchor).length + 1;
    const newNode: UmlClassNode = {
      id: `class_${Date.now()}`,
      name: `Clase${count}`,
      position: { x: this.snap(position.x), y: this.snap(position.y) },
      width: CLASS_LAYOUT.minWidth,
      attributes: [],
      methods: [],
    };

    this.nodes.update((list) => [...list, newNode]);
    this.afterMutation('add_node');
    this.tour.notify('class-added', { nodeId: newNode.id });
    this.selectNodes([newNode.id]);
  }

  removeClass(nodeId: string, event?: MouseEvent): void {
    if (event) event.stopPropagation();
    if (this.isReadOnly()) return;
    this.flushPendingCommit();

    if (this.editingNodeId() === nodeId) this.closeClassPanel(false);

    const nodesToDelete = new Set<string>([nodeId]);
    const connsToDelete = new Set<string>();

    // 1. Conexiones que tocan directamente al nodo
    const directConns = this.connections().filter(
      (c) =>
        this.baseId(c.sourceNodeId, c.sourceId) === nodeId ||
        this.baseId(c.targetNodeId, c.targetId) === nodeId,
    );

    directConns.forEach((c) => {
      connsToDelete.add(c.id);

      // Si la conexión tiene un ancla asociada (relación con clase de asociación)
      if (c.assocAnchorNodeId) {
        nodesToDelete.add(c.assocAnchorNodeId);
      }

      // Clases de asociación vinculadas a esta conexión principal
      this.nodes().forEach((n) => {
        if (n.assocMainConnId === c.id) {
          nodesToDelete.add(n.id);
        }
      });
    });

    // 2. Si el propio nodo es una clase de asociación, se elimina su ancla
    const targetNode = this.nodes().find((n) => n.id === nodeId);
    if (targetNode?.assocMainConnId) {
      const mainConn = this.connections().find((c) => c.id === targetNode.assocMainConnId);
      if (mainConn?.assocAnchorNodeId) {
        nodesToDelete.add(mainConn.assocAnchorNodeId);
      }
    }

    // 3. Anclas y clases unidas por la línea discontinua «link»
    this.connections().forEach((c) => {
      if (c.type === 'association_class') {
        const sourceBase = this.baseId(c.sourceNodeId, c.sourceId);
        const targetBase = this.baseId(c.targetNodeId, c.targetId);
        if (nodesToDelete.has(sourceBase)) nodesToDelete.add(targetBase);
        if (nodesToDelete.has(targetBase)) nodesToDelete.add(sourceBase);
      }
    });

    // 4. Conexiones que tocan cualquier nodo marcado
    this.connections().forEach((c) => {
      if (
        nodesToDelete.has(this.baseId(c.sourceNodeId, c.sourceId)) ||
        nodesToDelete.has(this.baseId(c.targetNodeId, c.targetId))
      ) {
        connsToDelete.add(c.id);
      }
    });

    // 5. Eliminación en cascada; la relación que tenía la clase de asociación vuelve a ser normal
    this.nodes.update((list) => list.filter((n) => !nodesToDelete.has(n.id)));
    this.connections.update((list) =>
      list
        .filter((c) => !connsToDelete.has(c.id))
        .map((c) =>
          c.assocAnchorNodeId && nodesToDelete.has(c.assocAnchorNodeId)
            ? { ...c, assocAnchorNodeId: undefined }
            : c,
        ),
    );

    if (this.editingConnId() && connsToDelete.has(this.editingConnId()!)) {
      this.editingConnId.set(null);
    }
    this.selectedNodeIds.update((ids) => ids.filter((id) => !nodesToDelete.has(id)));
    this.afterMutation('remove_node');
  }

  openClassPanel(node: UmlClassNode, event?: MouseEvent): void {
    if (event) event.stopPropagation();
    if (this.isReadOnly() || node.isAnchor) return;
    if (this.editingNodeId() === node.id) return;

    if (this.isNodeLockedByOther(node.id)) {
      const lock = this.getNodeLock(node.id);
      alert(`🔒 Esta tabla está bloqueada por ${lock?.userName || 'otro usuario'}.`);
      return;
    }

    this.closeRelationPanel();
    this.closeClassPanel(false);
    this.collaborationService.requestNodeLock(node.id);
    this.editingNodeId.set(node.id);
    if (!this.selectedNodeIds().includes(node.id)) {
      this.selectNodes([node.id]);
    }
    this.tour.notify('node-modal-opened');
  }

  /** Cierra el panel de clase. Los cambios ya están aplicados; `notifyTour` avisa al recorrido guiado. */
  closeClassPanel(notifyTour = true): void {
    const nodeId = this.editingNodeId();
    if (!nodeId) return;
    this.flushPendingSync('update_node');
    this.flushPendingCommit();
    this.collaborationService.releaseNodeLock(nodeId);
    this.editingNodeId.set(null);
    if (notifyTour) {
      this.tour.notify('node-saved');
      this.tour.notify('node-modal-closed');
    }
  }

  onClassPanelChange(updated: UmlClassNode): void {
    this.nodes.update((list) => list.map((n) => (n.id === updated.id ? updated : n)));
    this.markAsUnsaved();
    this.updateConnectionEndpoints();
    this.scheduleSync('update_node');
    this.commitHistory(500);
  }

  // ======================================================================
  // SELECCIÓN: BORRAR, COPIAR, PEGAR, MOVER
  // ======================================================================

  deleteSelection(): void {
    if (this.isReadOnly()) return;
    const connIds = this.selectedConnIds();
    const nodeIds = this.selectedNodeIds().filter((id) => !this.isNodeLockedByOther(id));
    if (connIds.length === 0 && nodeIds.length === 0) return;
    this.flushPendingCommit();
    this.batchingHistory = true;
    try {
      connIds.forEach((id) => {
        if (this.connections().some((c) => c.id === id)) this.removeConnection(id);
      });
      nodeIds.forEach((id) => {
        if (this.nodes().some((n) => n.id === id)) this.removeClass(id);
      });
    } finally {
      this.batchingHistory = false;
    }
    this.commitHistory();
    this.selectedConnIds.set([]);
    this.selectedNodeIds.set([]);
  }

  copySelection(): void {
    const ids = new Set(this.selectedNodeIds());
    const nodes = this.nodes().filter((n) => ids.has(n.id) && !n.isAnchor);
    if (nodes.length === 0) return;
    const connections = this.connections().filter(
      (c) =>
        c.type !== 'association_class' &&
        !c.assocAnchorNodeId &&
        ids.has(this.baseId(c.sourceNodeId, c.sourceId)) &&
        ids.has(this.baseId(c.targetNodeId, c.targetId)),
    );
    this.clipboard = JSON.parse(JSON.stringify({ nodes, connections }));
  }

  pasteClipboard(): void {
    if (this.isReadOnly() || !this.clipboard) return;
    this.flushPendingCommit();
    const stamp = Date.now();
    const idMap = new Map<string, string>();
    const offset = this.gridSize * 2;

    const newNodes: UmlClassNode[] = this.clipboard.nodes.map((n, i) => {
      const id = `class_${stamp}_${i}`;
      idMap.set(n.id, id);
      return {
        ...n,
        id,
        assocMainConnId: undefined,
        position: { x: n.position.x + offset, y: n.position.y + offset },
      };
    });
    const newConns: UmlConnection[] = this.clipboard.connections.map((c, i) => {
      const s = idMap.get(this.baseId(c.sourceNodeId, c.sourceId))!;
      const t = idMap.get(this.baseId(c.targetNodeId, c.targetId))!;
      return {
        ...c,
        id: `conn_${stamp}_${i}`,
        sourceNodeId: s,
        targetNodeId: t,
        sourceId: `${s}_right`,
        targetId: `${t}_left`,
      };
    });

    this.nodes.update((list) => [...list, ...newNodes]);
    this.connections.update((list) => [...list, ...newConns]);
    // Pegar varias veces seguidas desplaza cada copia
    this.clipboard = JSON.parse(JSON.stringify({ nodes: newNodes, connections: newConns }));
    this.afterMutation('paste');
    this.selectNodes(newNodes.map((n) => n.id));
  }

  private moveSelection(dx: number, dy: number): void {
    const ids = new Set(this.selectedNodeIds().filter((id) => !this.isNodeLockedByOther(id)));
    if (ids.size === 0) return;
    this.nodes.update((list) =>
      list.map((n) =>
        ids.has(n.id) && !n.isAnchor
          ? { ...n, position: { x: n.position.x + dx, y: n.position.y + dy } }
          : n,
      ),
    );
    this.markAsUnsaved();
    this.updateConnectionEndpoints();
    this.nodes().forEach((n) => {
      if (ids.has(n.id)) this.collaborationService.sendNodeDrag(n.id, n.position);
    });
    this.commitHistory(400);
  }

  // ======================================================================
  // IA E IMPORTACIÓN
  // ======================================================================

  /** Propuesta de Trazo aplicada desde este navegador: el servidor ya la guardó y la difundió. */
  onAiMutation(event: {
    nodes: UmlClassNode[];
    connections: UmlConnection[];
    summary: string;
  }): void {
    if (event.nodes) {
      this.applyAiMutationWithAnimation(event.nodes, event.connections || [], true);
    }
  }

  /** Abre otro diagrama del proyecto (desde el enlace «#Diagrama» de un mensaje de Trazo). */
  openDiagramFromChat(diagramId: string): void {
    this.flushAutosave();
    this.router.navigate(['/diagram'], {
      queryParams: { diagramId, projectId: this.currentProjectId() },
    });
  }

  private applyAiMutationWithAnimation(
    targetNodes: UmlClassNode[],
    targetConns: UmlConnection[],
    persisted = false,
  ): void {
    this.closeClassPanel(false);
    this.closeRelationPanel();
    const cleanNodes = this.applyAiNodesMutation(targetNodes);
    this.nodes.set(cleanNodes);
    const cleanConns = this.sanitizeClientConnections(targetConns, cleanNodes);
    this.connections.set(cleanConns);
    if (!persisted) this.markAsUnsaved();
    else if (this.saveInFlight) {
      // Un guardado anterior aún en curso podría pisar lo de Trazo: se vuelve a guardar después
      this.editVersion++;
      this.hasUnsavedChanges.set(true);
    } else {
      if (this.autosaveTimer) clearTimeout(this.autosaveTimer);
      this.autosaveTimer = null;
      this.pendingSince = 0;
      this.hasUnsavedChanges.set(false);
      this.saveState.set('saved');
    }
    this.updateConnectionEndpoints();
    setTimeout(() => {
      this.updateConnectionEndpoints();
      this.fitView();
    }, 100);
  }

  private applyAiNodesMutation(targetNodes: any[]): UmlClassNode[] {
    return targetNodes.map((n, i) => ({
      id: n.id || `class_ai_${Date.now()}_${i}`,
      name: n.name || `Clase_${i + 1}`,
      position: {
        x: n.position?.x ?? n.positionX ?? 100 + (i % 3) * 260,
        y: n.position?.y ?? n.positionY ?? 100 + Math.floor(i / 3) * 220,
      },
      width: n.width || CLASS_LAYOUT.minWidth,
      height: n.height,
      isAnchor: n.isAnchor,
      assocMainConnId: n.assocMainConnId,
      attributes: (n.attributes || []).map((a: any) => ({
        name: a.name,
        type: this.normalizeDataType(a.type),
      })),
      methods: (n.methods || []).map((m: any) => ({
        name: m.name,
        parameters: m.parameters || '',
        returnType: this.normalizeReturnType(m.returnType),
      })),
    }));
  }

  private sanitizeClientConnections(conns: any[], validNodes: UmlClassNode[]): UmlConnection[] {
    const nodeIds = new Set(validNodes.map((n) => n.id));
    return conns
      .filter(
        (c) =>
          nodeIds.has(this.baseId(c.sourceNodeId, c.sourceId)) &&
          nodeIds.has(this.baseId(c.targetNodeId, c.targetId)),
      )
      .map((c) => ({
        id: c.id || `conn_ai_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
        sourceNodeId: this.baseId(c.sourceNodeId, c.sourceId),
        targetNodeId: this.baseId(c.targetNodeId, c.targetId),
        sourceId: c.sourceId || `${c.sourceNodeId}_right`,
        targetId: c.targetId || `${c.targetNodeId}_left`,
        type: (c.type as UmlRelationshipType) || 'association',
        name: c.name || undefined,
        sourceMultiplicity: c.sourceMultiplicity || '',
        targetMultiplicity: c.targetMultiplicity || '',
        assocAnchorNodeId: c.assocAnchorNodeId || undefined,
      }));
  }

  async downloadBmpFile(): Promise<void> {
    const containerEl = this.flowContainerRef?.nativeElement;
    if (containerEl) {
      await this.bmpExportService.exportElementToBmp(containerEl, this.currentDiagramName());
    } else {
      this.bmpExportService.exportToBmp(
        this.nodes(),
        this.connections(),
        this.currentDiagramName(),
      );
    }
  }

  downloadXmiFile(): void {
    const diagId = this.currentDiagramId();
    if (diagId) {
      this.xmiService.exportDiagram(diagId).subscribe({
        next: (blob: Blob) => {
          const url = window.URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `${this.currentDiagramName().toLowerCase().replace(/\s+/g, '_')}_ea.xmi`;
          a.click();
          window.URL.revokeObjectURL(url);
        },
      });
    } else {
      alert('Debes guardar el diagrama antes de exportar XMI.');
    }
  }

  downloadJsonFile(): void {
    const project: UmlDiagramProject = {
      version: '1.0',
      name: this.currentDiagramName(),
      createdDate: new Date().toISOString(),
      nodes: this.nodes(),
      connections: this.connections(),
    };

    const blob = new Blob([JSON.stringify(project, null, 2)], { type: 'application/json' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${this.currentDiagramName().toLowerCase().replace(/\s+/g, '_')}_ast.json`;
    a.click();
    window.URL.revokeObjectURL(url);
  }

  openExportModal(): void {
    const project: UmlDiagramProject = {
      version: '1.0',
      name: this.currentDiagramName(),
      createdDate: new Date().toISOString(),
      nodes: this.nodes(),
      connections: this.connections(),
    };
    this.jsonContent.set(JSON.stringify(project, null, 2));
    this.jsonModalMode.set('export');
    this.showJsonModal.set(true);
  }

  openImportModal(): void {
    this.jsonContent.set('');
    this.jsonModalMode.set('import');
    this.showJsonModal.set(true);
  }

  applyImportedJson(): void {
    if (this.isReadOnly()) return;
    try {
      const project = JSON.parse(this.jsonContent()) as UmlDiagramProject;
      if (!this.loadImportedDiagram(project, 'apply_json')) {
        alert('Estructura JSON inválida: faltan nodos o conexiones.');
        return;
      }
      this.showJsonModal.set(false);
    } catch (e) {
      alert('Error en el formato JSON: ' + e);
    }
  }

  copyJsonToClipboard(): void {
    navigator.clipboard.writeText(this.jsonContent()).then(() => {
      alert('¡JSON copiado al portapapeles!');
    });
  }

  onFileSelected(event: Event): void {
    if (this.isReadOnly()) return;
    const target = event.target as HTMLInputElement;
    const file = target.files?.[0];
    if (!file) return;
    const isXmi = /\.(xmi|xml)$/i.test(file.name);

    file
      .text()
      .then((content) => {
        if (!isXmi) {
          if (!this.loadImportedDiagram(JSON.parse(content), 'import_json')) {
            alert('El archivo JSON no contiene un diagrama válido.');
          }
          return;
        }
        // El backend interpreta el XMI (mismo parser que la importación de Enterprise Architect)
        // sin guardarlo: el diagrama queda en el lienzo como cambio pendiente
        this.xmiService.importXmi({ xmiContent: content }).subscribe({
          next: (ast) => {
            if (!ast?.nodes?.length) {
              alert('El archivo XMI no contiene clases UML legibles.');
              return;
            }
            this.loadImportedDiagram(ast, 'import_xmi');
            if (ast.name) this.currentDiagramName.set(ast.name);
          },
          error: (err) =>
            alert(
              'Error al leer el archivo XMI: ' +
                (err?.error?.error?.message || err?.message || err),
            ),
        });
      })
      .catch((err) => alert('Error al leer el archivo: ' + err))
      .finally(() => (target.value = ''));
  }

  /**
   * Carga en el lienzo un diagrama importado (JSON o XMI) como cambio pendiente.
   * Los ids se renuevan para que importar dos veces el mismo archivo no choque al guardar.
   */
  private loadImportedDiagram(
    project: { nodes?: UmlClassNode[]; connections?: UmlConnection[] },
    action: string,
  ): boolean {
    if (!Array.isArray(project?.nodes) || !Array.isArray(project?.connections)) return false;

    const fresh = withFreshIds(project.nodes, project.connections);
    this.nodes.set(
      fresh.nodes.map((n) => ({
        ...n,
        width: n.width || CLASS_LAYOUT.minWidth,
        attributes: (n.attributes || []).map((a) => ({
          name: a.name,
          type: this.normalizeDataType(a.type),
        })),
        methods: (n.methods || []).map((m) => ({
          name: m.name,
          parameters: m.parameters || '',
          returnType: this.normalizeReturnType(m.returnType),
        })),
      })),
    );
    this.connections.set(fresh.connections);
    this.updateConnectionEndpoints();
    this.markAsUnsaved();
    this.collaborationService.sendDiagramSync(this.nodes(), this.connections(), action);
    this.commitHistory();
    // Foblex mide las clases nuevas antes de colocarlas y el encuadre cambia la vista:
    // se redibuja después de encuadrar o las relaciones quedan desplazadas hasta recargar
    setTimeout(() => {
      this.canvas?.fitToScreen({ x: 140, y: 120 }, false);
      requestAnimationFrame(() => requestAnimationFrame(() => this.flow?.redraw()));
    }, 50);
    return true;
  }

  triggerSpringBootGeneration(): void {
    this.openCodeGenerator();
  }

  openCodeGenerator(): void {
    this.showSpringBootModal.set(true);
    this.tour.notify('codegen-opened');
  }

  openProfileModal(): void {
    this.isProfileModalOpen.set(true);
  }

  onCanvasChange(event: FCanvasChangeEvent): void {
    const scale = event.scale ?? this.canvasTransform().scale;
    this.zoomLevel.set(Math.round(scale * 100));
    this.canvasTransform.set({ x: event.position?.x ?? 0, y: event.position?.y ?? 0, scale });
  }

  zoomIn(): void {
    this.fZoom?.zoomIn();
  }

  zoomOut(): void {
    this.fZoom?.zoomOut();
  }

  resetView(): void {
    if (this.canvas) {
      this.canvas.resetScaleAndCenter();
      this.zoomLevel.set(100);
    } else if (this.fZoom) {
      this.fZoom.reset();
      this.zoomLevel.set(100);
    }
  }

  /** Ajusta el diagrama a la pantalla dejando libre la zona de las islas flotantes. */
  fitView(): void {
    this.canvas?.fitToScreen({ x: 140, y: 120 });
  }
}
