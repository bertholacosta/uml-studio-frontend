import {
  Component,
  DestroyRef,
  computed,
  inject,
  signal,
  input,
  output,
  effect,
  untracked,
  ElementRef,
  ViewChild,
  OnDestroy,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { NgIconComponent, provideIcons } from '@ng-icons/core';
import {
  heroSparkles,
  heroPlus,
  heroChevronUp,
  heroXMark,
  heroCheck,
  heroMicrophone,
  heroStop,
  heroClipboard,
  heroCamera,
  heroPhoto,
  heroArrowUp,
  heroArrowUpRight,
  heroChatBubbleLeftRight,
  heroPencilSquare,
  heroChevronDown,
  heroLightBulb,
  heroUserGroup,
  heroLockClosed,
  heroAdjustmentsHorizontal,
  heroEye,
  heroEyeSlash,
  heroArrowUturnLeft,
} from '@ng-icons/heroicons/outline';
import { AuthService } from '../../../../../core/services/auth.service';
import {
  AiAssistantService,
  ChatChannel,
  ChatMessage,
  TRAZO_USER_ID,
  TrazoDraft,
  TrazoSettings,
  TrazoSettingsValues,
} from '../../../../../core/services/ai-assistant.service';
import { TrazoSettingsModalComponent } from '../trazo-settings-modal/trazo-settings-modal.component';
import { CollaborationService } from '../../../../../core/services/collaboration.service';
import { UmlClassNode, UmlConnection } from '../../../../../core/models/diagram.model';
import { TranslatePipe, TranslationService } from '../../../../../core/i18n';
import { DictationStatus, LocalDictation, Recording } from './local-dictation';

/** Las fotos se reducen antes de enviarlas: el modelo no necesita más y viajan más rápido. */
const MAX_IMAGE_SIDE = 1600;
/** A partir de aquí se avisa de que el servidor del modelo puede estar arrancando. */
const SLOW_REPLY_MS = 12_000;
/** Si en este tiempo no llega la respuesta, se da por perdida (el backend espera hasta 3 min). */
const REPLY_TIMEOUT_MS = 240_000;
const TRAZO_MENTION = /(^|[^\p{L}\d_])@trazo\b/iu;
/** Palabra que se está escribiendo justo antes del cursor y empieza por @ o #. */
const MENTION_TRIGGER = /(^|\s)([@#])([\p{L}\d_-]*)$/u;

export interface ChatMember {
  userId: string;
  userName: string;
}

export interface ChatDiagram {
  id: string;
  name: string;
}

/** Opción del autocompletado de @personas y #diagramas. */
interface MentionOption {
  label: string;
  hint: string;
  insert: string;
  isTrazo?: boolean;
}

const emptyByChannel = <T>(value: () => T): Record<ChatChannel, T> => ({
  team: value(),
  direct: value(),
});

/** «Diagrama de ventas» → «#Diagrama-de-ventas», igual que en el backend. */
export const diagramTag = (name: string) => `#${name.trim().replace(/\s+/g, '-')}`;

@Component({
  selector: 'app-ai-assistant-panel',
  // El host no genera caja: en modo acoplado la columna es un hijo directo del layout flex del editor
  host: { class: 'contents' },
  standalone: true,
  imports: [CommonModule, FormsModule, NgIconComponent, TranslatePipe, TrazoSettingsModalComponent],
  providers: [
    provideIcons({
      heroAdjustmentsHorizontal,
      heroEye,
      heroEyeSlash,
      heroArrowUturnLeft,
      heroSparkles,
      heroPlus,
      heroChevronUp,
      heroXMark,
      heroCheck,
      heroMicrophone,
      heroStop,
      heroClipboard,
      heroCamera,
      heroPhoto,
      heroArrowUp,
      heroArrowUpRight,
      heroChatBubbleLeftRight,
      heroPencilSquare,
      heroChevronDown,
      heroLightBulb,
      heroUserGroup,
      heroLockClosed,
    }),
  ],
  templateUrl: './ai-assistant-panel.component.html',
})
export class AiAssistantPanelComponent implements OnDestroy {
  readonly authService = inject(AuthService);
  private readonly aiService = inject(AiAssistantService);
  readonly collaboration = inject(CollaborationService);
  private readonly i18n = inject(TranslationService);
  private readonly destroyRef = inject(DestroyRef);

  @ViewChild('chatScrollContainer') chatScrollContainerRef?: ElementRef<HTMLDivElement>;
  @ViewChild('imageInput') imageInputRef?: ElementRef<HTMLInputElement>;
  @ViewChild('webcamVideo') webcamVideoRef?: ElementRef<HTMLVideoElement>;
  @ViewChild('promptInput') promptInputRef?: ElementRef<HTMLTextAreaElement>;

  // Inputs
  readonly isOpen = input<boolean>(false);
  /** Barra flotante abajo al centro o columna acoplada a la derecha. */
  readonly dock = input<'bottom' | 'side'>('bottom');
  readonly dockChange = output<'bottom' | 'side'>();
  /** Fuera del editor (Trazo en Inicio y Proyectos): ocupa su contenedor y empieza en privado. */
  readonly embedded = input<boolean>(false);
  readonly closePanel = output<void>();
  readonly projectId = input<string | null>(null);
  /** Diagrama abierto en el editor (Trazo trabaja en él si no se indica otro con #). */
  readonly diagramId = input<string | null>(null);
  readonly diagrams = input<ChatDiagram[]>([]);
  readonly members = input<ChatMember[]>([]);
  readonly currentNodes = input<UmlClassNode[]>([]);
  readonly currentConnections = input<UmlConnection[]>([]);
  /** Los lectores conversan pero no editan, no envían imágenes ni aplican propuestas. */
  readonly canEdit = input<boolean>(true);
  /** El administrador del proyecto puede reiniciar el canal del equipo. */
  readonly isAdmin = input<boolean>(false);
  /** Propuesta que se ve ahora en el lienzo y la que se está calculando. */
  readonly previewingId = input<string | null>(null);
  readonly loadingPreviewId = input<string | null>(null);

  // Outputs
  readonly applyMutation = output<{
    nodes: UmlClassNode[];
    connections: UmlConnection[];
    summary: string;
    rawResponse?: any;
  }>();
  /** Abrir otro diagrama del proyecto (desde el enlace «en #Diagrama» de un mensaje). */
  readonly openDiagram = output<string>();
  /** Ver en el lienzo cómo quedaría una propuesta (o salir de la vista previa). */
  readonly previewProposal = output<ChatMessage>();
  /** Último cambio de Trazo pendiente de revisión en el diagrama abierto (o null). */
  readonly pendingReview = output<ChatMessage | null>();

  // Barra inferior: menú «+» y tarjeta de conversación plegable
  readonly isPlusMenuOpen = signal<boolean>(false);
  readonly isExpanded = signal<boolean>(false);

  // Estados reactivos internos
  readonly activeChannel = signal<ChatChannel>('team');
  readonly isAiProcessing = signal<boolean>(false);
  readonly aiPrompt = signal<string>('');
  readonly attachedImageBase64 = signal<string | null>(null);
  readonly attachedImageName = signal<string | null>(null);
  readonly isVoiceListening = signal<boolean>(false);
  /** Estado del dictado local tras grabar: descarga del modelo o transcripción; null si nada. */
  readonly voiceStatus = signal<string | null>(null);
  readonly showWebcamModal = signal<boolean>(false);

  /** Mensajes del canal del equipo y de la conversación privada. */
  readonly messagesByChannel = signal<Record<ChatChannel, ChatMessage[]>>(emptyByChannel(() => []));
  readonly chatMessages = computed(() => this.messagesByChannel()[this.activeChannel()]);
  readonly isLoadingConversation = signal<boolean>(false);
  /** Mensajes nuevos de otras personas que aún no se han visto en cada conversación. */
  readonly unread = signal<Record<ChatChannel, number>>(emptyByChannel(() => 0));
  readonly totalUnread = computed(() => this.unread().team + this.unread().direct);
  /** Propuestas que se están aplicando desde este navegador. */
  readonly applyingIds = signal<Set<string>>(new Set());
  /** Trazo tarda más de lo normal: su servidor (GPU en Modal) puede estar arrancando. */
  readonly isSlowReply = signal<boolean>(false);
  /** A quién responde Trazo ahora en la conversación visible (null si está libre). */
  readonly busyFor = computed(() => this.collaboration.trazoBusyFor()[this.activeChannel()]);
  /** Mensaje al que se está respondiendo («Responder»), en la conversación visible. */
  readonly replyingTo = signal<ChatMessage | null>(null);
  /** Mensaje resaltado un momento al saltar a él desde una cita. */
  readonly flashedId = signal<string | null>(null);

  /** Respuesta que Trazo está escribiendo en cada conversación (en vivo). */
  readonly drafts = signal<Record<ChatChannel, TrazoDraft | null>>(emptyByChannel(() => null));
  readonly activeDraft = computed(() => this.drafts()[this.activeChannel()]);
  /** Cuándo empezó cada borrador (para mostrar el tiempo que lleva Trazo). */
  private readonly draftStartedAt = new Map<string, number>();
  readonly now = signal(Date.now());
  private clock: ReturnType<typeof setInterval> | null = null;
  readonly draftSeconds = computed(() => {
    const draft = this.activeDraft();
    const started = draft && this.draftStartedAt.get(draft.replyTo);
    return started ? Math.max(0, Math.round((this.now() - started) / 1000)) : 0;
  });
  /** Pasos del avance: leer, escribir y preparar o aplicar los cambios. */
  readonly draftStep = computed(() => {
    const phase = this.activeDraft()?.phase;
    return phase === 'reading' ? 1 : phase === 'writing' ? 2 : 3;
  });
  /** Cambio de Trazo más reciente aún pendiente de revisión en el diagrama abierto. */
  readonly latestPendingReview = computed(() => {
    const diagramId = this.diagramId();
    if (!diagramId) return null;
    const all = [...this.messagesByChannel().team, ...this.messagesByChannel().direct];
    return (
      all
        .filter((m) => m.review?.state === 'pending' && m.diagramId === diagramId)
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
        .at(-1) ?? null
    );
  });

  // «Configurar Trazo»: configuración del proyecto, compartida por el equipo
  readonly trazoSettings = signal<TrazoSettings | null>(null);
  readonly showTrazoSettings = signal<boolean>(false);
  readonly isSavingSettings = signal<boolean>(false);
  readonly settingsError = signal<string | null>(null);

  // Autocompletado de @personas y #diagramas
  readonly mentionOptions = signal<MentionOption[]>([]);
  readonly mentionIndex = signal<number>(0);
  private mentionStart = -1;

  private conversationIds: Record<ChatChannel, string | null> = emptyByChannel(() => null);
  /** Mensaje propio que espera respuesta de Trazo (por su id provisional). */
  private pendingClientId: string | null = null;
  private slowTimer: ReturnType<typeof setTimeout> | null = null;
  private replyTimeout: ReturnType<typeof setTimeout> | null = null;

  private speechRecognition: any = null;
  private recording: Recording | null = null;
  private webcamMediaStream: MediaStream | null = null;

  readonly suggestions = computed(() => {
    const open = this.diagrams().find((d) => d.id === this.diagramId());
    const tag = open ? diagramTag(open.name) : '';
    if (this.embedded()) {
      // En el canal del equipo Trazo solo responde si lo mencionan
      const mention = this.activeChannel() === 'team' ? '@Trazo ' : '';
      return ['chat.hubSuggestion1', 'chat.hubSuggestion2', 'chat.hubSuggestion3'].map(
        (key) => `${mention}${this.i18n.t(key)}`,
      );
    }
    const keys =
      this.activeChannel() === 'team'
        ? ['chat.teamSuggestion1', 'chat.teamSuggestion2', 'chat.teamSuggestion3']
        : ['ai.suggestion1', 'ai.suggestion2', 'ai.suggestion3'];
    return keys.map((key) => this.i18n.t(key).replace('{diagram}', tag).replace(/\s+$/, ''));
  });

  constructor() {
    effect(() => {
      if (this.embedded()) untracked(() => this.activeChannel.set('direct'));
    });

    // Al cambiar de proyecto se cargan sus dos conversaciones y se sigue su canal
    effect(() => {
      const projectId = this.projectId();
      untracked(() => this.loadConversations(projectId));
    });

    // Si Trazo tarda, se avisa de que su servidor puede estar arrancando
    effect(() => {
      const busy = this.isAiProcessing() || this.busyFor() !== null;
      if (this.slowTimer) clearTimeout(this.slowTimer);
      this.slowTimer = null;
      if (!busy) {
        this.isSlowReply.set(false);
        return;
      }
      this.slowTimer = setTimeout(() => this.isSlowReply.set(true), SLOW_REPLY_MS);
    });

    this.collaboration.chatMessage$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((message) => this.upsertMessage(message));
    this.collaboration.trazoDraft$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((draft) => {
      if (draft.projectId !== this.projectId()) return;
      const conversationId = this.conversationIds[draft.channel];
      if (conversationId && draft.conversationId !== conversationId) return;
      // Si la respuesta final ya llegó, el borrador sobra
      const answered = this.messagesByChannel()[draft.channel].some(
        (m) => m.role === 'assistant' && m.replyTo === draft.replyTo,
      );
      if (answered) return;
      if (!this.draftStartedAt.has(draft.replyTo)) {
        this.draftStartedAt.set(draft.replyTo, Date.now());
        this.now.set(Date.now());
      }
      this.drafts.update((d) => ({ ...d, [draft.channel]: draft }));
      if (draft.channel === this.activeChannel()) this.scrollToBottom();
    });
    // El editor resalta en el lienzo el último cambio de Trazo pendiente de revisión
    effect(() => {
      const review = this.latestPendingReview();
      untracked(() => this.pendingReview.emit(review));
    });
    // Reloj del avance mientras Trazo responde
    effect(() => {
      const busy = this.drafts().team !== null || this.drafts().direct !== null;
      untracked(() => {
        if (busy && !this.clock) {
          this.clock = setInterval(() => this.now.set(Date.now()), 1000);
        } else if (!busy && this.clock) {
          clearInterval(this.clock);
          this.clock = null;
        }
      });
    });
    // Cuando Trazo queda libre no queda ningún borrador a medias
    effect(() => {
      const busy = this.collaboration.trazoBusyFor();
      untracked(() =>
        this.drafts.update((d) => ({
          team: busy.team === null ? null : d.team,
          direct: busy.direct === null ? null : d.direct,
        })),
      );
    });
    this.collaboration.trazoSettings$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((settings) => {
        if (settings.projectId && settings.projectId !== this.projectId()) return;
        // El evento no trae canEdit: se conserva el de esta persona
        this.trazoSettings.update((current) => ({ ...settings, canEdit: current?.canEdit }));
      });
    this.collaboration.chatReset$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((conversation) => {
        if (conversation.projectId !== this.projectId()) return;
        this.conversationIds[conversation.channel] = conversation.id;
        this.setMessages(conversation.channel, []);
        this.unread.update((u) => ({ ...u, [conversation.channel]: 0 }));
      });
  }

  openTrazoSettings(): void {
    this.settingsError.set(null);
    this.showTrazoSettings.set(true);
  }

  saveTrazoSettings(values: TrazoSettingsValues): void {
    const projectId = this.projectId();
    if (!projectId) return;
    this.isSavingSettings.set(true);
    this.settingsError.set(null);
    this.aiService.updateTrazoSettings(projectId, values).subscribe({
      next: (settings) => {
        this.isSavingSettings.set(false);
        this.trazoSettings.set(settings);
        this.showTrazoSettings.set(false);
      },
      error: (err) => {
        this.isSavingSettings.set(false);
        // El backend envuelve los errores en { error: { message } }
        const message = err?.error?.error?.message ?? err?.error?.message;
        this.settingsError.set(
          (Array.isArray(message) ? message.join(' ') : message) ||
            this.i18n.t('trazoSettings.saveError'),
        );
      },
    });
  }

  ngOnDestroy(): void {
    if (this.speechRecognition && this.isVoiceListening()) {
      this.speechRecognition.stop();
    }
    this.recording?.cancel();
    this.stopWebcam();
    if (this.slowTimer) clearTimeout(this.slowTimer);
    if (this.replyTimeout) clearTimeout(this.replyTimeout);
    if (this.clock) clearInterval(this.clock);
  }

  /** Mensaje actualizado por una acción del editor (p. ej. aceptar o deshacer un cambio). */
  receiveMessage(message: ChatMessage): void {
    this.upsertMessage(message);
  }

  get myUserId(): string | undefined {
    return this.authService.currentUser()?.id;
  }

  colorOf(message: ChatMessage): string {
    return this.collaboration.colorFor(message.author.userId, message.author.userName);
  }

  memberColor(member: ChatMember): string {
    return this.collaboration.colorFor(member.userId, member.userName);
  }

  initialOf(name: string): string {
    return (name.trim()[0] || '?').toUpperCase();
  }

  firstName(name: string): string {
    return name.trim().split(/\s+/)[0] || name;
  }

  tagOf(name: string): string {
    return diagramTag(name);
  }

  /** Nombre de quien hizo la pregunta que responde un mensaje de Trazo. */
  askerOf(message: { replyTo?: string }): string | null {
    if (!message.replyTo) return null;
    const asked = this.chatMessages().find((m) => m.id === message.replyTo);
    return asked ? this.firstName(asked.author.userName) : null;
  }

  /** Negritas, código, @menciones y #diagramas resaltados (el texto se escapa antes). */
  formatText(text: string): string {
    const escaped = text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
    return escaped
      .replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>')
      .replace(/`([^`\n]+)`/g, '<code>$1</code>')
      .replace(/(^|[^\p{L}\d_&])([@#][\p{L}\d_-]+)/gu, '$1<span class="chat-ref">$2</span>');
  }

  /** «Responder» a un mensaje: aparece citado sobre la barra de texto. */
  replyTo(message: ChatMessage): void {
    if (message.pending) return;
    this.replyingTo.set(message);
    this.expand();
    setTimeout(() => this.promptInputRef?.nativeElement.focus());
  }

  cancelReply(): void {
    this.replyingTo.set(null);
  }

  /** Salta al mensaje citado y lo resalta un momento. */
  jumpToMessage(messageId: string): void {
    const el = this.chatScrollContainerRef?.nativeElement.querySelector(
      `[data-message-id="${messageId}"]`,
    );
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    this.flashedId.set(messageId);
    setTimeout(() => {
      if (this.flashedId() === messageId) this.flashedId.set(null);
    }, 1600);
  }

  /** Texto corto de un mensaje para la cita. */
  quoteText(text: string): string {
    const clean = text.replace(/\s+/g, ' ').trim();
    return clean.length > 140 ? `${clean.slice(0, 139)}…` : clean;
  }

  selectChannel(channel: ChatChannel): void {
    // La cita es de la conversación anterior
    if (channel !== this.activeChannel()) this.replyingTo.set(null);
    this.activeChannel.set(channel);
    // Con el chat plegado (cambio desde la barra de texto) los mensajes aún no se han visto
    if (this.dock() === 'side' || this.isExpanded()) {
      this.unread.update((u) => ({ ...u, [channel]: 0 }));
    }
    this.closeMentions();
    this.scrollToBottom();
    setTimeout(() => this.promptInputRef?.nativeElement.focus());
  }

  onAiInputKeyDown(event: KeyboardEvent): void {
    const options = this.mentionOptions();
    if (options.length) {
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();
        const step = event.key === 'ArrowDown' ? 1 : -1;
        this.mentionIndex.set((this.mentionIndex() + step + options.length) % options.length);
        return;
      }
      if (event.key === 'Enter' || event.key === 'Tab') {
        event.preventDefault();
        this.pickMention(options[this.mentionIndex()]);
        return;
      }
      if (event.key === 'Escape') {
        this.closeMentions();
        return;
      }
    }
    if (event.key === 'Escape' && this.replyingTo()) {
      this.cancelReply();
      return;
    }
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      this.applyAiPrompt();
    }
  }

  /** Abre el autocompletado si se está escribiendo una @mención o un #diagrama. */
  onPromptInput(): void {
    this.autoGrow();
    const el = this.promptInputRef?.nativeElement;
    if (!el) return;
    const beforeCaret = el.value.slice(0, el.selectionStart ?? el.value.length);
    const match = beforeCaret.match(MENTION_TRIGGER);
    if (!match) {
      this.closeMentions();
      return;
    }
    const [, , trigger, query] = match;
    const q = query.toLowerCase();
    const options: MentionOption[] =
      trigger === '@'
        ? [
            {
              label: 'Trazo',
              hint: this.i18n.t('chat.trazoHint'),
              insert: '@Trazo',
              isTrazo: true,
            },
            ...this.members()
              .filter((m) => m.userId !== this.myUserId)
              .map((m) => ({
                label: m.userName,
                hint: '',
                insert: `@${this.firstName(m.userName)}`,
              })),
          ].filter((o) => o.label.toLowerCase().includes(q))
        : this.diagrams()
            .map((d) => ({
              label: diagramTag(d.name),
              hint: d.id === this.diagramId() ? this.i18n.t('chat.openDiagram') : '',
              insert: diagramTag(d.name),
            }))
            .filter((o) => o.label.toLowerCase().includes(q));

    this.mentionStart = beforeCaret.length - query.length - 1;
    this.mentionOptions.set(options.slice(0, 8));
    this.mentionIndex.set(0);
  }

  pickMention(option: MentionOption): void {
    const el = this.promptInputRef?.nativeElement;
    if (!el || this.mentionStart < 0) return;
    const value = el.value;
    const caret = el.selectionStart ?? value.length;
    const next = `${value.slice(0, this.mentionStart)}${option.insert} ${value.slice(caret)}`;
    const position = this.mentionStart + option.insert.length + 1;
    // Se escribe ya en el campo: si se espera a ngModel, lo que se teclee enseguida lo pisa
    el.value = next;
    el.setSelectionRange(position, position);
    this.aiPrompt.set(next);
    this.closeMentions();
    el.focus();
    this.autoGrow();
  }

  private closeMentions(): void {
    this.mentionOptions.set([]);
    this.mentionStart = -1;
  }

  /** Copia la sugerencia al cuadro de texto para que el usuario la ajuste antes de enviarla. */
  useSuggestion(text: string): void {
    this.aiPrompt.set(text);
    setTimeout(() => this.promptInputRef?.nativeElement.focus());
  }

  toggleDock(): void {
    const next = this.dock() === 'side' ? 'bottom' : 'side';
    if (next === 'bottom') this.isExpanded.set(true);
    this.dockChange.emit(next);
  }

  /** Empieza una conversación nueva (la anterior queda guardada en el historial). */
  newChat(): void {
    const projectId = this.projectId();
    const channel = this.activeChannel();
    if (!projectId || (channel === 'team' && !this.isAdmin())) return;
    const confirmKey = channel === 'team' ? 'chat.resetTeamConfirm' : 'chat.resetDirectConfirm';
    if (!confirm(this.i18n.t(confirmKey))) return;
    this.aiService.resetConversation(projectId, channel).subscribe((conversation) => {
      this.conversationIds[channel] = conversation.id;
      this.setMessages(channel, []);
    });
    this.aiPrompt.set('');
    this.removeAttachedImage();
  }

  expand(): void {
    this.isExpanded.set(true);
    this.unread.update((u) => ({ ...u, [this.activeChannel()]: 0 }));
    this.scrollToBottom();
  }

  /** Al enfocar la barra sin conversación (o con mensajes nuevos) se despliega. */
  onPromptFocus(): void {
    if (!this.chatMessages().length || this.totalUnread()) this.expand();
  }

  /** La barra crece con el texto (hasta el máximo del CSS). */
  autoGrow(): void {
    const el = this.promptInputRef?.nativeElement;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }

  // -------------------------------------------------------------
  // CONVERSACIONES
  // -------------------------------------------------------------
  private loadConversations(projectId: string | null): void {
    this.conversationIds = emptyByChannel(() => null);
    this.messagesByChannel.set(emptyByChannel(() => []));
    this.unread.set(emptyByChannel(() => 0));
    this.drafts.set(emptyByChannel(() => null));
    this.trazoSettings.set(null);
    this.showTrazoSettings.set(false);
    if (!projectId) return;

    this.aiService.getTrazoSettings(projectId).subscribe({
      next: (settings) => {
        if (projectId === this.projectId()) this.trazoSettings.set(settings);
      },
      error: () => {},
    });

    this.collaboration.joinProject(projectId);
    this.isLoadingConversation.set(true);
    let pending = 2;
    for (const channel of ['team', 'direct'] as ChatChannel[]) {
      this.aiService.getConversation(projectId, channel).subscribe({
        next: (conversation) => {
          if (projectId !== this.projectId()) return;
          this.conversationIds[channel] = conversation.id;
          // Lo que llegó por el socket mientras cargaba se conserva
          const known = new Set(conversation.messages.map((m) => m.id));
          const live = this.messagesByChannel()[channel].filter(
            (m) => !known.has(m.id) && (!m.conversationId || m.conversationId === conversation.id),
          );
          this.setMessages(channel, [...conversation.messages, ...live]);
          if (channel === this.activeChannel()) this.scrollToBottom();
        },
        complete: () => {
          if (--pending === 0) this.isLoadingConversation.set(false);
        },
        error: () => {
          if (--pending === 0) this.isLoadingConversation.set(false);
        },
      });
    }
  }

  private setMessages(channel: ChatChannel, messages: ChatMessage[]): void {
    this.messagesByChannel.update((all) => ({ ...all, [channel]: messages }));
  }

  /** Añade o actualiza un mensaje (el propio provisional se sustituye por el del servidor). */
  private upsertMessage(message: ChatMessage): void {
    if (message.projectId !== this.projectId()) return;
    const channel = message.channel;
    const conversationId = this.conversationIds[channel];
    if (conversationId && message.conversationId !== conversationId) return;

    let isNew = false;
    const list = this.messagesByChannel()[channel];
    const index = list.findIndex(
      (m) =>
        m.id === message.id || (!!message.clientId && m.pending && m.clientId === message.clientId),
    );
    if (index < 0) {
      isNew = true;
      this.setMessages(channel, [...list, message]);
    } else {
      const next = [...list];
      next[index] = { ...message, image: message.image || list[index].image };
      this.setMessages(channel, next);
    }

    // La respuesta final reemplaza a la que Trazo estaba escribiendo
    if (message.role === 'assistant' && this.drafts()[channel]?.replyTo === message.replyTo) {
      this.drafts.update((d) => ({ ...d, [channel]: null }));
    }

    // Llegó la respuesta de Trazo a mi mensaje
    if (message.role === 'assistant' && this.pendingClientId && message.replyTo) {
      const asked = this.messagesByChannel()[channel].find((m) => m.id === message.replyTo);
      if (asked?.clientId === this.pendingClientId) this.finishPending();
    }

    if (!isNew || message.author.userId === this.myUserId) {
      if (isNew && channel === this.activeChannel()) this.scrollToBottom();
      return;
    }
    const hidden =
      channel !== this.activeChannel() || (this.dock() === 'bottom' && !this.isExpanded());
    if (hidden) this.unread.update((u) => ({ ...u, [channel]: u[channel] + 1 }));
    else this.scrollToBottom();
  }

  // -------------------------------------------------------------
  // ENVÍO DE MENSAJES (TEXTO / VISIÓN)
  // -------------------------------------------------------------
  applyAiPrompt(): void {
    const text = this.aiPrompt().trim();
    const imageBase64 = this.attachedImageBase64();
    const channel = this.activeChannel();
    const projectId = this.projectId();

    if ((!text && !imageBase64) || this.isAiProcessing()) {
      return;
    }
    if (!projectId || (imageBase64 && !this.diagramId())) {
      this.addLocalError(this.i18n.t('ai.noDiagram'));
      return;
    }

    const quoted = this.replyingTo();
    // Responder a Trazo lo llama sin escribir @Trazo
    const callsTrazo =
      channel === 'direct' ||
      !!imageBase64 ||
      TRAZO_MENTION.test(text) ||
      (!!quoted && quoted.role === 'assistant');
    const mentions = this.mentionedUserIds(text);
    const quote = quoted
      ? {
          messageId: quoted.id,
          authorName: quoted.author.userName,
          isTrazo: quoted.role === 'assistant',
          text: this.quoteText(quoted.text),
        }
      : undefined;
    this.replyingTo.set(null);

    // Mensaje provisional: el servidor lo confirma y lo reparte
    const user = this.authService.currentUser();
    const clientId = `c-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    this.setMessages(channel, [
      ...this.messagesByChannel()[channel],
      {
        id: clientId,
        clientId,
        pending: true,
        conversationId: this.conversationIds[channel] || '',
        projectId,
        channel,
        role: 'user',
        author: { userId: user?.id || '', userName: user?.fullName || '' },
        text: text || this.i18n.t('ai.imageRequest'),
        mentions,
        quote,
        image: imageBase64 || undefined,
        status: 'success',
        createdAt: new Date().toISOString(),
      },
    ]);
    this.expand();

    if (callsTrazo) {
      this.isAiProcessing.set(true);
      this.pendingClientId = clientId;
      // Si la respuesta no llega (servidor de IA caído sin aviso), se libera la barra
      if (this.replyTimeout) clearTimeout(this.replyTimeout);
      this.replyTimeout = setTimeout(() => {
        if (this.pendingClientId !== clientId) return;
        this.finishPending();
        this.addLocalError(this.i18n.t('ai.noReply'));
      }, REPLY_TIMEOUT_MS);
    }

    const openDiagram = {
      activeDiagramId: this.diagramId() || undefined,
      currentNodes: this.currentNodes(),
      currentConnections: this.currentConnections(),
    };
    const request$ = imageBase64
      ? this.aiService.sendVisionPrompt(
          imageBase64,
          'image/jpeg',
          text || 'Analiza este boceto/diagrama y digitalízalo como entidades UML completas.',
          {
            diagramId: this.diagramId()!,
            channel,
            clientId,
            currentNodes: this.currentNodes(),
            currentConnections: this.currentConnections(),
          },
        )
      : this.aiService.sendMessage(projectId, {
          channel,
          text,
          mentions,
          clientId,
          quoteOf: quoted?.id,
          ...openDiagram,
        });

    // El servidor confirma el mensaje; la respuesta de Trazo y los cambios del diagrama llegan
    // por el socket (chat_message y diagram_synced), igual que a los demás
    request$.subscribe({
      next: (accepted) => {
        this.upsertMessage(accepted.message);
        if (accepted.status === 'sent' && this.pendingClientId === clientId) {
          this.finishPending();
        }
      },
      error: (err) => this.handleAiError(err, clientId, channel),
    });

    this.aiPrompt.set('');
    this.attachedImageBase64.set(null);
    this.attachedImageName.set(null);
    this.closeMentions();
    setTimeout(() => this.autoGrow());
  }

  /** Personas mencionadas como @Nombre (por su nombre de pila). */
  private mentionedUserIds(text: string): string[] {
    const ids = this.members()
      .filter((m) =>
        new RegExp(
          `(^|[^\\p{L}\\d_])@${this.firstName(m.userName).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\p{L}\\d_])`,
          'iu',
        ).test(text),
      )
      .map((m) => m.userId);
    if (TRAZO_MENTION.test(text)) ids.push(TRAZO_USER_ID);
    return [...new Set(ids)];
  }

  private finishPending(): void {
    this.pendingClientId = null;
    this.isAiProcessing.set(false);
    if (this.replyTimeout) clearTimeout(this.replyTimeout);
    this.replyTimeout = null;
  }

  private handleAiError(err: any, clientId: string, channel: ChatChannel): void {
    if (this.pendingClientId === clientId) this.finishPending();
    // El mensaje no llegó a guardarse: se retira el provisional
    this.setMessages(
      channel,
      this.messagesByChannel()[channel].filter((m) => !(m.pending && m.clientId === clientId)),
    );
    const msg = err.error?.message || err.message || this.i18n.t('ai.connectionError');
    this.addLocalError(this.i18n.t('ai.errorPrefix') + msg);
  }

  /** Aviso solo para esta persona (no se guarda en la conversación). */
  private addLocalError(text: string): void {
    const channel = this.activeChannel();
    this.setMessages(channel, [
      ...this.messagesByChannel()[channel],
      {
        id: 'local-err-' + Date.now(),
        conversationId: this.conversationIds[channel] || '',
        projectId: this.projectId() || '',
        channel,
        role: 'assistant',
        author: { userId: TRAZO_USER_ID, userName: 'Trazo' },
        text,
        status: 'error',
        createdAt: new Date().toISOString(),
      },
    ]);
    this.expand();
  }

  /** Abre el diagrama en el que trabajó Trazo, si no es el que está abierto. */
  goToDiagram(message: ChatMessage): void {
    if (message.diagramId && message.diagramId !== this.diagramId()) {
      this.openDiagram.emit(message.diagramId);
    }
  }

  /** Aplica la propuesta de Trazo a su diagrama; todos ven quién la aplicó. */
  applyProposal(message: ChatMessage): void {
    if (!this.canEdit() || this.applyingIds().has(message.id)) return;
    this.applyingIds.update((ids) => new Set(ids).add(message.id));
    const done = () =>
      this.applyingIds.update((ids) => {
        const next = new Set(ids);
        next.delete(message.id);
        return next;
      });
    const isOpen = message.diagramId === this.diagramId();

    this.aiService
      .applyProposal(
        message.id,
        isOpen
          ? {
              activeDiagramId: this.diagramId()!,
              currentNodes: this.currentNodes(),
              currentConnections: this.currentConnections(),
            }
          : {},
      )
      .subscribe({
        next: (res) => {
          done();
          if (res.assistantMessage) this.upsertMessage(res.assistantMessage);
          if (isOpen) {
            this.applyMutation.emit({
              nodes: res.nodes,
              connections: res.connections || [],
              summary: res.changesSummary,
              rawResponse: res,
            });
          }
        },
        error: (err) => {
          done();
          this.addLocalError(
            this.i18n.t('ai.errorPrefix') + (err.error?.message || err.message || ''),
          );
        },
      });
  }

  // -------------------------------------------------------------
  // DICTADO POR VOZ: WHISPER EN EL NAVEGADOR (IA LOCAL)
  // -------------------------------------------------------------
  /** Pulsar: graba. Pulsar otra vez: transcribe en el propio equipo y añade el texto. */
  async toggleVoiceRecognition(): Promise<void> {
    if (this.voiceStatus()) return; // transcribiendo la grabación anterior

    // El micrófono solo está disponible en HTTPS (o localhost)
    if (!window.isSecureContext) {
      this.addLocalError(
        'Dictado por voz: el micrófono solo funciona en páginas HTTPS. Abre la app con https://.',
      );
      return;
    }
    if (!LocalDictation.isSupported()) {
      this.toggleBrowserSpeech();
      return;
    }

    if (this.recording) {
      const recording = this.recording;
      this.recording = null;
      this.isVoiceListening.set(false);
      this.voiceStatus.set('Transcribiendo…');
      try {
        const text = await recording.stop((s) => this.showDictationStatus(s));
        if (text) {
          const current = this.aiPrompt().trim();
          this.aiPrompt.set(current ? `${current} ${text}` : text);
        } else {
          this.addLocalError(
            'Dictado por voz: no se entendió nada. Habla más cerca del micrófono.',
          );
        }
      } catch (err) {
        console.error('Dictado local', err);
        this.addLocalError(
          'Dictado por voz: no se pudo cargar el modelo de voz local. Revisa tu conexión (solo hace falta la primera vez).',
        );
      } finally {
        this.voiceStatus.set(null);
      }
      return;
    }

    try {
      this.recording = await LocalDictation.start();
      this.isVoiceListening.set(true);
      // Descarga el modelo mientras la persona habla, sin mostrar nada todavía
      LocalDictation.preload(() => undefined);
    } catch (err: any) {
      this.recording = null;
      this.isVoiceListening.set(false);
      this.addLocalError(
        err?.name === 'NotAllowedError'
          ? 'Dictado por voz: el navegador bloqueó el micrófono. Permítelo en el candado de la barra de direcciones.'
          : 'Dictado por voz: no se detectó ningún micrófono.',
      );
    }
  }

  private showDictationStatus(status: DictationStatus): void {
    this.voiceStatus.set(
      status.phase === 'loading'
        ? `Descargando modelo de voz${status.progress != null ? ` ${status.progress} %` : '…'}`
        : 'Transcribiendo…',
    );
  }

  // -------------------------------------------------------------
  // DICTADO POR VOZ DEL NAVEGADOR (WEB SPEECH API): respaldo si no hay dictado local
  // -------------------------------------------------------------
  private toggleBrowserSpeech(): void {
    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (!SpeechRecognition) {
      alert(
        'Tu navegador no soporta reconocimiento de voz nativo (Web Speech API). Usa Chrome o Edge.',
      );
      return;
    }

    // El micrófono solo está disponible en HTTPS (o localhost)
    if (!window.isSecureContext) {
      this.addLocalError(
        'Dictado por voz: el micrófono solo funciona en páginas HTTPS. Abre la app con https://.',
      );
      return;
    }

    if (this.isVoiceListening()) {
      this.speechRecognition?.stop();
      this.isVoiceListening.set(false);
      return;
    }

    try {
      this.speechRecognition = new SpeechRecognition();
      this.speechRecognition.lang = 'es-419'; // español latinoamericano
      // Sigue escuchando entre pausas y muestra lo que va entendiendo; se detiene al pulsar de nuevo
      this.speechRecognition.continuous = true;
      this.speechRecognition.interimResults = true;
      this.speechRecognition.maxAlternatives = 1;

      const baseText = this.aiPrompt().trim();
      let finalText = '';

      this.speechRecognition.onstart = () => {
        this.isVoiceListening.set(true);
      };

      this.speechRecognition.onresult = (event: any) => {
        let interim = '';
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const piece = event.results[i][0].transcript;
          if (event.results[i].isFinal) {
            finalText += `${piece} `;
          } else {
            interim += piece;
          }
        }
        const spoken = `${finalText}${interim}`.trim();
        if (spoken) {
          this.aiPrompt.set(baseText ? `${baseText} ${spoken}` : spoken);
        }
      };

      this.speechRecognition.onerror = (event: any) => {
        this.isVoiceListening.set(false);
        const reasons: Record<string, string> = {
          'not-allowed':
            'el navegador bloqueó el micrófono. Permítelo en el candado de la barra de direcciones.',
          'service-not-allowed':
            'el navegador no permite el reconocimiento de voz en esta página (¿HTTP en vez de HTTPS?).',
          network:
            'no se pudo contactar el servicio de voz del navegador (Google en Chrome, Microsoft en Edge). Revisa tu conexión.',
          'audio-capture': 'no se detectó ningún micrófono.',
          'language-not-supported': 'el idioma de dictado no está disponible.',
        };
        const reason = reasons[event?.error];
        // «no-speech» y «aborted» son normales (silencio o parada manual): sin aviso
        if (reason) {
          this.addLocalError(`Dictado por voz: ${reason}`);
        }
      };

      this.speechRecognition.onend = () => {
        this.isVoiceListening.set(false);
      };

      this.speechRecognition.start();
    } catch {
      this.isVoiceListening.set(false);
    }
  }

  // -------------------------------------------------------------
  // IMÁGENES / VISION (PEGAR, ARRASTRAR, ARCHIVO)
  // -------------------------------------------------------------
  triggerImageInput(): void {
    this.imageInputRef?.nativeElement?.click();
  }

  onImageSelected(event: Event): void {
    const target = event.target as HTMLInputElement;
    const file = target.files?.[0];
    if (file) {
      this.processImageFile(file);
    }
    target.value = '';
  }

  onPasteImage(event: ClipboardEvent): void {
    const items = event.clipboardData?.items;
    if (!items) return;

    for (let i = 0; i < items.length; i++) {
      if (items[i].type.indexOf('image') !== -1) {
        const blob = items[i].getAsFile();
        if (blob) {
          event.preventDefault();
          this.processImageFile(blob);
          break;
        }
      }
    }
  }

  pasteFromClipboard(): void {
    if (navigator.clipboard && navigator.clipboard.read) {
      navigator.clipboard
        .read()
        .then((items) => {
          for (const item of items) {
            const imageType = item.types.find((t) => t.startsWith('image/'));
            if (imageType) {
              item.getType(imageType).then((blob) => {
                this.processImageFile(blob);
              });
              return;
            }
          }
          alert(
            'No se encontró ninguna imagen en el portapapeles. Copia una captura con Ctrl+C o tecla Impr Pant primero.',
          );
        })
        .catch(() => {
          alert('Usa el atajo de teclado Ctrl+V dentro del cuadro de texto para pegar la imagen.');
        });
    } else {
      alert('Usa el atajo Ctrl+V dentro del cuadro de texto.');
    }
  }

  onDropImage(event: DragEvent): void {
    event.preventDefault();
    const files = event.dataTransfer?.files;
    if (files && files.length > 0 && files[0].type.startsWith('image/')) {
      this.processImageFile(files[0]);
    }
  }

  removeAttachedImage(): void {
    this.attachedImageBase64.set(null);
    this.attachedImageName.set(null);
  }

  private processImageFile(file: File | Blob): void {
    if (!this.canEdit()) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      const original = e.target?.result as string;
      this.attachedImageName.set((file as File).name || 'captura_pizarra.png');
      this.downscale(original).then((base64) => this.attachedImageBase64.set(base64));
    };
    reader.readAsDataURL(file);
  }

  /** Reduce la imagen a JPEG de como mucho MAX_IMAGE_SIDE px de lado. */
  private downscale(dataUrl: string): Promise<string> {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, MAX_IMAGE_SIDE / Math.max(img.width, img.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        const ctx = canvas.getContext('2d');
        if (!ctx) return resolve(dataUrl);
        // Fondo blanco: las capturas PNG transparentes se verían negras en JPEG
        ctx.fillStyle = '#fff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/jpeg', 0.85));
      };
      img.onerror = () => resolve(dataUrl);
      img.src = dataUrl;
    });
  }

  // -------------------------------------------------------------
  // CÁMARA WEB
  // -------------------------------------------------------------
  openWebcamModal(): void {
    this.showWebcamModal.set(true);
    setTimeout(() => {
      if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
        navigator.mediaDevices
          .getUserMedia({ video: { facingMode: 'environment' } })
          .then((stream) => {
            this.webcamMediaStream = stream;
            if (this.webcamVideoRef?.nativeElement) {
              this.webcamVideoRef.nativeElement.srcObject = stream;
            }
          })
          .catch((err) => {
            alert('No se pudo acceder a la cámara: ' + err.message);
            this.closeWebcamModal();
          });
      }
    }, 100);
  }

  closeWebcamModal(): void {
    this.stopWebcam();
    this.showWebcamModal.set(false);
  }

  private stopWebcam(): void {
    if (this.webcamMediaStream) {
      this.webcamMediaStream.getTracks().forEach((track) => track.stop());
      this.webcamMediaStream = null;
    }
  }

  captureWebcamPhoto(): void {
    if (!this.webcamVideoRef?.nativeElement) return;
    const video = this.webcamVideoRef.nativeElement;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
      this.downscale(dataUrl).then((base64) => this.attachedImageBase64.set(base64));
      this.attachedImageName.set(`foto_camara_${Date.now()}.jpg`);
    }
    this.closeWebcamModal();
  }

  private scrollToBottom(): void {
    setTimeout(() => {
      if (this.chatScrollContainerRef?.nativeElement) {
        const el = this.chatScrollContainerRef.nativeElement;
        el.scrollTop = el.scrollHeight;
      }
    }, 50);
  }
}
