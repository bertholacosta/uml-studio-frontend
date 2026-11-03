import {
  Component,
  DestroyRef,
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
} from '@ng-icons/heroicons/outline';
import { AuthService } from '../../../../../core/services/auth.service';
import {
  AiAssistantService,
  AiDiagramContext,
  AiResponse,
  ChatMessage,
} from '../../../../../core/services/ai-assistant.service';
import { CollaborationService } from '../../../../../core/services/collaboration.service';
import { UmlClassNode, UmlConnection } from '../../../../../core/models/diagram.model';

/** Las fotos se reducen antes de enviarlas: el modelo no necesita más y viajan más rápido. */
const MAX_IMAGE_SIDE = 1600;

import { TranslatePipe, TranslationService } from '../../../../../core/i18n';

@Component({
  selector: 'app-ai-assistant-panel',
  // El host no genera caja: en modo acoplado la columna es un hijo directo del layout flex del editor
  host: { class: 'contents' },
  standalone: true,
  imports: [CommonModule, FormsModule, NgIconComponent, TranslatePipe],
  providers: [
    provideIcons({
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
  readonly closePanel = output<void>();
  readonly diagramId = input<string | null>(null);
  readonly currentNodes = input<UmlClassNode[]>([]);
  readonly currentConnections = input<UmlConnection[]>([]);
  /** Los lectores conversan con Trazo pero no editan, no envían imágenes ni aplican propuestas. */
  readonly canEdit = input<boolean>(true);

  // Outputs
  readonly applyMutation = output<{
    nodes: UmlClassNode[];
    connections: UmlConnection[];
    summary: string;
    rawResponse?: any;
  }>();

  // Barra inferior: menú «+» y tarjeta de conversación plegable
  readonly isPlusMenuOpen = signal<boolean>(false);
  readonly isExpanded = signal<boolean>(false);

  // Estados reactivos internos
  readonly isAiProcessing = signal<boolean>(false);
  readonly aiPrompt = signal<string>('');
  readonly attachedImageBase64 = signal<string | null>(null);
  readonly attachedImageName = signal<string | null>(null);
  readonly isVoiceListening = signal<boolean>(false);
  readonly showWebcamModal = signal<boolean>(false);

  // Conversación compartida de la pizarra (vacía: pantalla de inicio con sugerencias)
  readonly aiChatMessages = signal<ChatMessage[]>([]);
  readonly isLoadingConversation = signal<boolean>(false);
  /** Mensajes de otras personas llegados con la conversación plegada. */
  readonly unreadCount = signal<number>(0);
  /** Propuestas que se están aplicando desde este navegador. */
  readonly applyingIds = signal<Set<string>>(new Set());
  private conversationId: string | null = null;

  readonly suggestionKeys = ['ai.suggestion1', 'ai.suggestion2', 'ai.suggestion3'];

  private speechRecognition: any = null;
  private webcamMediaStream: MediaStream | null = null;

  constructor() {
    // Al abrir otro diagrama se carga su conversación
    effect(() => {
      const diagramId = this.diagramId();
      untracked(() => this.loadConversation(diagramId));
    });

    this.collaboration.aiMessage$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((message) => this.upsertMessage(message));
    this.collaboration.aiConversationReset$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((conversation) => {
        if (conversation.diagramId !== this.diagramId()) return;
        this.conversationId = conversation.id;
        this.aiChatMessages.set([]);
        this.unreadCount.set(0);
      });
  }

  ngOnDestroy(): void {
    if (this.speechRecognition && this.isVoiceListening()) {
      this.speechRecognition.stop();
    }
    this.stopWebcam();
  }

  get myUserId(): string | undefined {
    return this.authService.currentUser()?.id;
  }

  colorOf(message: ChatMessage): string {
    return this.collaboration.colorFor(message.author.userId, message.author.userName);
  }

  initialOf(name: string): string {
    return (name.trim()[0] || '?').toUpperCase();
  }

  firstName(name: string): string {
    return name.trim().split(/\s+/)[0] || name;
  }

  /** Nombre de quien hizo la pregunta que responde un mensaje de Trazo. */
  askerOf(message: ChatMessage): string | null {
    if (!message.replyTo) return null;
    const asked = this.aiChatMessages().find((m) => m.id === message.replyTo);
    return asked ? this.firstName(asked.author.userName) : null;
  }

  /** Negritas y código en línea del texto de Trazo (el texto se escapa antes). */
  formatReply(text: string): string {
    const escaped = text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
    return escaped
      .replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>')
      .replace(/`([^`\n]+)`/g, '<code>$1</code>');
  }

  onAiInputKeyDown(event: KeyboardEvent): void {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      this.applyAiPrompt();
    }
  }

  /** Copia la sugerencia al cuadro de texto para que el usuario la ajuste antes de enviarla. */
  useSuggestion(key: string): void {
    this.aiPrompt.set(this.i18n.t(key));
    setTimeout(() => this.promptInputRef?.nativeElement.focus());
  }

  toggleDock(): void {
    const next = this.dock() === 'side' ? 'bottom' : 'side';
    if (next === 'bottom') this.isExpanded.set(true);
    this.dockChange.emit(next);
  }

  /** Empieza una conversación nueva para toda la pizarra (la anterior queda guardada). */
  newChat(): void {
    const diagramId = this.diagramId();
    if (!diagramId || !this.canEdit()) return;
    if (!confirm(this.i18n.t('ai.newChatConfirm'))) return;
    this.aiService.startConversation(diagramId).subscribe((conversation) => {
      this.conversationId = conversation.id;
      this.aiChatMessages.set([]);
    });
    this.aiPrompt.set('');
    this.removeAttachedImage();
  }

  expand(): void {
    this.isExpanded.set(true);
    this.unreadCount.set(0);
    this.scrollToBottom();
  }

  /** Al enfocar la barra sin conversación (o con mensajes nuevos) se despliega. */
  onPromptFocus(): void {
    if (!this.aiChatMessages().length || this.unreadCount()) this.expand();
  }

  /** La barra crece con el texto (hasta el máximo del CSS). */
  autoGrow(): void {
    const el = this.promptInputRef?.nativeElement;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }

  // -------------------------------------------------------------
  // CONVERSACIÓN COMPARTIDA
  // -------------------------------------------------------------
  private loadConversation(diagramId: string | null): void {
    this.conversationId = null;
    this.aiChatMessages.set([]);
    this.unreadCount.set(0);
    if (!diagramId) return;

    this.isLoadingConversation.set(true);
    this.aiService.getConversation(diagramId).subscribe({
      next: (conversation) => {
        if (diagramId !== this.diagramId()) return;
        this.conversationId = conversation.id;
        // Lo que llegó por el socket mientras cargaba se conserva
        const known = new Set(conversation.messages.map((m) => m.id));
        const live = this.aiChatMessages().filter(
          (m) => !known.has(m.id) && (!m.conversationId || m.conversationId === conversation.id),
        );
        this.aiChatMessages.set([...conversation.messages, ...live]);
        this.isLoadingConversation.set(false);
        if (conversation.messages.length) this.scrollToBottom();
      },
      error: () => this.isLoadingConversation.set(false),
    });
  }

  /** Añade o actualiza un mensaje (el propio provisional se sustituye por el del servidor). */
  private upsertMessage(message: ChatMessage): void {
    if (this.conversationId && message.conversationId !== this.conversationId) return;

    let isNew = false;
    this.aiChatMessages.update((list) => {
      const index = list.findIndex(
        (m) =>
          m.id === message.id ||
          (!!message.clientId && m.pending && m.clientId === message.clientId),
      );
      if (index < 0) {
        isNew = true;
        return [...list, message];
      }
      const next = [...list];
      next[index] = { ...message, image: message.image || list[index].image };
      return next;
    });

    if (!isNew) return;
    // Lo que pregunta o recibe otra persona también aparece aquí
    if (message.author.userId !== this.myUserId && this.dock() === 'bottom' && !this.isExpanded()) {
      this.unreadCount.update((n) => n + 1);
    }
    this.scrollToBottom();
  }

  // -------------------------------------------------------------
  // PROMPT / ENVÍO DE MENSAJES (TEXTO / VISIÓN)
  // -------------------------------------------------------------
  applyAiPrompt(): void {
    const promptText = this.aiPrompt().trim();
    const imageBase64 = this.attachedImageBase64();

    if ((!promptText && !imageBase64) || this.isAiProcessing()) {
      return;
    }

    const diagramId = this.diagramId();
    if (!diagramId) {
      this.addLocalError(this.i18n.t('ai.noDiagram'));
      return;
    }

    // Mensaje provisional: el servidor lo confirma y lo reparte a toda la pizarra
    const user = this.authService.currentUser();
    const clientId = `c-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    this.aiChatMessages.update((msgs) => [
      ...msgs,
      {
        id: clientId,
        clientId,
        pending: true,
        conversationId: this.conversationId || '',
        role: 'user',
        author: { userId: user?.id || '', userName: user?.fullName || '' },
        text: promptText || this.i18n.t('ai.imageRequest'),
        image: imageBase64 || undefined,
        status: 'success',
        createdAt: new Date().toISOString(),
      },
    ]);

    this.isAiProcessing.set(true);
    this.expand();

    const context: AiDiagramContext = {
      diagramId,
      currentNodes: this.currentNodes(),
      currentConnections: this.currentConnections(),
      clientId,
    };
    const request$ = imageBase64
      ? this.aiService.sendVisionPrompt(
          imageBase64,
          'image/jpeg',
          promptText || 'Analiza este boceto/diagrama y digitalízalo como entidades UML completas.',
          context,
        )
      : this.aiService.sendTextPrompt(promptText, context);

    request$.subscribe({
      next: (res) => this.handleAiResponse(res),
      error: (err) => this.handleAiError(err, clientId),
    });

    this.aiPrompt.set('');
    this.attachedImageBase64.set(null);
    this.attachedImageName.set(null);
    setTimeout(() => this.autoGrow());
  }

  private handleAiResponse(res: AiResponse): void {
    this.isAiProcessing.set(false);
    if (res.userMessage) this.upsertMessage(res.userMessage);
    if (res.assistantMessage) this.upsertMessage(res.assistantMessage);

    // Las respuestas y las propuestas no tocan el diagrama
    if (
      res.success &&
      (res.action === 'diagram_mutated' || res.action === 'vision_extract') &&
      res.nodes
    ) {
      this.applyMutation.emit({
        nodes: res.nodes,
        connections: res.connections || [],
        summary: res.changesSummary || res.message,
        rawResponse: res,
      });
    }
    this.scrollToBottom();
  }

  private handleAiError(err: any, clientId?: string): void {
    this.isAiProcessing.set(false);
    // El mensaje no llegó a guardarse: se retira el provisional
    if (clientId) {
      this.aiChatMessages.update((msgs) =>
        msgs.filter((m) => !(m.pending && m.clientId === clientId)),
      );
    }
    const msg = err.error?.message || err.message || this.i18n.t('ai.connectionError');
    this.addLocalError(this.i18n.t('ai.errorPrefix') + msg);
  }

  /** Aviso solo para esta persona (no se guarda en la conversación compartida). */
  private addLocalError(text: string): void {
    this.aiChatMessages.update((msgs) => [
      ...msgs,
      {
        id: 'local-err-' + Date.now(),
        conversationId: this.conversationId || '',
        role: 'assistant',
        author: { userId: 'ai_assistant', userName: 'Trazo' },
        text,
        status: 'error',
        createdAt: new Date().toISOString(),
      },
    ]);
    this.expand();
  }

  /** Aplica la propuesta de Trazo al diagrama; la sala ve quién la aplicó. */
  applyProposal(message: ChatMessage): void {
    if (!this.canEdit() || this.applyingIds().has(message.id)) return;
    this.applyingIds.update((ids) => new Set(ids).add(message.id));
    const done = () =>
      this.applyingIds.update((ids) => {
        const next = new Set(ids);
        next.delete(message.id);
        return next;
      });

    this.aiService
      .applyProposal(message.id, this.currentNodes(), this.currentConnections())
      .subscribe({
        next: (res) => {
          done();
          if (res.assistantMessage) this.upsertMessage(res.assistantMessage);
          this.applyMutation.emit({
            nodes: res.nodes,
            connections: res.connections || [],
            summary: res.changesSummary,
            rawResponse: res,
          });
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
  // DICTADO POR VOZ (WEB SPEECH API)
  // -------------------------------------------------------------
  toggleVoiceRecognition(): void {
    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (!SpeechRecognition) {
      alert(
        'Tu navegador no soporta reconocimiento de voz nativo (Web Speech API). Usa Chrome o Edge.',
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
      this.speechRecognition.lang = 'es-ES';
      this.speechRecognition.continuous = false;
      this.speechRecognition.interimResults = false;

      this.speechRecognition.onstart = () => {
        this.isVoiceListening.set(true);
      };

      this.speechRecognition.onresult = (event: any) => {
        const transcript = event.results[0][0].transcript;
        if (transcript) {
          const current = this.aiPrompt().trim();
          this.aiPrompt.set(current ? `${current} ${transcript}` : transcript);
        }
        this.isVoiceListening.set(false);
      };

      this.speechRecognition.onerror = () => {
        this.isVoiceListening.set(false);
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
