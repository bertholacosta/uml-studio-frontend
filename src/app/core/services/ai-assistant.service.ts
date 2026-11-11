import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { UmlClassNode, UmlConnection } from '../models/diagram.model';
import { environment } from '../../../environments/environment';

/** team: canal del equipo del proyecto; direct: conversación privada con Trazo. */
export type ChatChannel = 'team' | 'direct';

/** Id con el que se menciona a Trazo (es un miembro más del canal). */
export const TRAZO_USER_ID = 'ai_assistant';

export interface ChatAuthor {
  userId: string;
  userName: string;
}

/** Mensaje del canal del equipo o de la conversación privada con Trazo. */
export interface ChatMessage {
  id: string;
  conversationId: string;
  projectId: string;
  channel: ChatChannel;
  role: 'user' | 'assistant';
  author: ChatAuthor;
  text: string;
  mentions?: string[];
  /** Diagrama sobre el que trabajó Trazo o al que se refiere el mensaje. */
  diagramId?: string;
  diagramName?: string;
  clientId?: string;
  replyTo?: string;
  intent?: 'answer' | 'edit' | 'propose' | 'clarify' | 'vision';
  status: 'success' | 'clarification' | 'error';
  changesSummary?: string;
  operationsCount?: number;
  /** replaced: alguien respondió pidiendo cambios y Trazo dejó una propuesta nueva. */
  proposal?: {
    state: 'pending' | 'applied' | 'replaced';
    appliedBy?: ChatAuthor;
    appliedAt?: string;
  };
  /** Mensaje al que responde («Responder», como en WhatsApp). */
  quote?: { messageId: string; authorName: string; isTrazo: boolean; text: string };
  /** Cambio de Trazo en el lienzo: resaltado mientras está pendiente; se acepta o se deshace. */
  review?: {
    state: 'pending' | 'accepted' | 'reverted';
    by?: ChatAuthor;
    at?: string;
    /** Diagrama antes y después del cambio (solo mientras está pendiente). */
    before?: { nodes: UmlClassNode[]; connections: UmlConnection[] };
    after?: { nodes: UmlClassNode[]; connections: UmlConnection[] };
  };
  image?: string;
  model?: string;
  latencyMs?: number;
  createdAt: string;
  /** Solo en el navegador: mensaje enviado que el servidor aún no confirmó. */
  pending?: boolean;
}

export interface ChatConversation {
  id: string;
  projectId: string;
  channel: ChatChannel;
  startedBy: ChatAuthor;
  createdAt: string;
  messages: ChatMessage[];
  hasMore: boolean;
}

export interface AiResponse {
  success: boolean;
  action: string;
  message: string;
  nodes: UmlClassNode[];
  connections: UmlConnection[];
  changesSummary: string;
  modelUsed?: string;
  userMessage?: ChatMessage;
  assistantMessage?: ChatMessage;
}

/** En qué está Trazo mientras responde. */
export type TrazoDraftPhase = 'reading' | 'writing' | 'preparing' | 'applying';

/** Respuesta de Trazo mientras la escribe (evento trazo_draft); la reemplaza el mensaje final. */
export interface TrazoDraft {
  projectId: string;
  conversationId: string;
  channel: ChatChannel;
  /** Mensaje al que responde. */
  replyTo: string;
  diagramId?: string;
  diagramName?: string;
  phase: TrazoDraftPhase;
  /** Texto escrito hasta ahora. */
  text: string;
  /** Cambios que ya decidió, como pasos («crea la clase Pago con id: UUID»). */
  actions: string[];
}

/** Cómo quedaría el diagrama con una propuesta de Trazo (sin guardarlo). */
export interface ProposalPreview {
  messageId: string;
  diagramId: string;
  changesSummary: string;
  nodes: UmlClassNode[];
  connections: UmlConnection[];
  /** Operaciones que ya no se pueden aplicar al diagrama actual. */
  skipped: string[];
}

/** Respuesta inmediata: «queued» si llamó a Trazo, cuya respuesta llega después por el socket. */
export interface ChatAccepted {
  status: 'sent' | 'queued';
  message: ChatMessage;
}

/** Diagrama que tiene abierto quien escribe: Trazo lo usa si es el lienzo sobre el que trabaja. */
export interface OpenDiagram {
  activeDiagramId?: string;
  currentNodes?: UmlClassNode[];
  currentConnections?: UmlConnection[];
}

export interface SendChatMessage extends OpenDiagram {
  channel: ChatChannel;
  text: string;
  mentions?: string[];
  clientId?: string;
  /** Id del mensaje al que se responde; si es de Trazo, no hace falta @Trazo. */
  quoteOf?: string;
}

/** apply: aplica los cambios pedidos; propose: siempre propone; explain: solo explica. */
export type TrazoDelivery = 'apply' | 'propose' | 'explain';
export type TrazoStyle = 'brief' | 'mentor';
export type TrazoCreativity = 'precise' | 'balanced' | 'creative';

/** Lo que se elige en «Configurar Trazo». */
export interface TrazoSettingsValues {
  delivery: TrazoDelivery;
  style: TrazoStyle;
  creativity: TrazoCreativity;
  model: string;
}

/** Archivo exportado del chat, listo para descargar. */
export interface ExportedChat {
  filename: string;
  mimeType: string;
  content: string;
}

/** Configuración de Trazo del proyecto (compartida por todo el equipo). */
export interface TrazoSettings extends TrazoSettingsValues {
  /** Modelos que ofrece el servidor; el primero es el predeterminado. */
  models: string[];
  /** Si quien la consulta puede cambiarla (no llega en el evento del socket). */
  canEdit?: boolean;
  updatedBy?: ChatAuthor;
  updatedAt?: string;
}

@Injectable({
  providedIn: 'root',
})
export class AiAssistantService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = environment.apiUrl;

  getConversation(projectId: string, channel: ChatChannel): Observable<ChatConversation> {
    return this.http
      .get<any>(`${this.apiUrl}/chat/projects/${projectId}/${channel}`)
      .pipe(map((res) => (res && res.data ? res.data : res) as ChatConversation));
  }

  /** Empieza una conversación nueva (el canal del equipo solo lo reinicia el administrador). */
  resetConversation(projectId: string, channel: ChatChannel): Observable<ChatConversation> {
    return this.http
      .post<any>(`${this.apiUrl}/chat/projects/${projectId}/${channel}/reset`, {})
      .pipe(map((res) => (res && res.data ? res.data : res) as ChatConversation));
  }

  /**
   * Historial completo del canal (también las conversaciones archivadas) como archivo:
   * Markdown para leer o JSON con todos los datos. Las fechas van en la zona horaria local.
   */
  exportConversation(
    projectId: string,
    channel: ChatChannel,
    format: 'md' | 'json',
  ): Observable<ExportedChat> {
    const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
    return this.http
      .get<any>(`${this.apiUrl}/chat/projects/${projectId}/${channel}/export`, {
        params: { format, timeZone },
      })
      .pipe(map((res) => (res && res.data ? res.data : res) as ExportedChat));
  }

  sendMessage(projectId: string, message: SendChatMessage): Observable<ChatAccepted> {
    return this.http
      .post<any>(`${this.apiUrl}/chat/projects/${projectId}/messages`, message)
      .pipe(map((res) => (res && res.data ? res.data : res) as ChatAccepted));
  }

  /** Imagen para que Trazo la digitalice en `diagramId`; se publica en `channel`. */
  sendVisionPrompt(
    imageBase64: string,
    mimeType: string,
    prompt: string | undefined,
    context: {
      diagramId: string;
      channel: ChatChannel;
      clientId?: string;
      currentNodes: UmlClassNode[];
      currentConnections: UmlConnection[];
    },
  ): Observable<ChatAccepted> {
    return this.http
      .post<any>(`${this.apiUrl}/ai/vision-diagram`, { imageBase64, mimeType, prompt, ...context })
      .pipe(map((res) => (res && res.data ? res.data : res) as ChatAccepted));
  }

  getTrazoSettings(projectId: string): Observable<TrazoSettings> {
    return this.http
      .get<any>(`${this.apiUrl}/projects/${projectId}/trazo-settings`)
      .pipe(map((res) => (res && res.data ? res.data : res) as TrazoSettings));
  }

  /** Cambia cómo trabaja Trazo en el proyecto; Trazo lo anuncia en el canal del equipo. */
  updateTrazoSettings(projectId: string, values: TrazoSettingsValues): Observable<TrazoSettings> {
    return this.http
      .put<any>(`${this.apiUrl}/projects/${projectId}/trazo-settings`, values)
      .pipe(map((res) => (res && res.data ? res.data : res) as TrazoSettings));
  }

  /** Vista previa de una propuesta: cómo quedaría el diagrama abierto, sin guardarlo. */
  previewProposal(messageId: string, openDiagram: OpenDiagram): Observable<ProposalPreview> {
    return this.http
      .post<any>(`${this.apiUrl}/chat/messages/${messageId}/preview`, openDiagram)
      .pipe(map((res) => (res && res.data ? res.data : res) as ProposalPreview));
  }

  /**
   * Acepta o deshace todo lo que Trazo cambió en un mensaje. Para deshacer se envía el diagrama
   * abierto: se revierte solo lo de Trazo, sin perder lo que el equipo cambió después.
   */
  reviewChange(
    messageId: string,
    decision: 'accept' | 'revert',
    openDiagram: OpenDiagram = {},
  ): Observable<AiResponse> {
    return this.http
      .post<any>(`${this.apiUrl}/chat/messages/${messageId}/review`, { decision, ...openDiagram })
      .pipe(map((res) => (res && res.data ? res.data : res) as AiResponse));
  }

  /** Aplica a su diagrama los cambios que Trazo propuso en un mensaje. */
  applyProposal(messageId: string, openDiagram: OpenDiagram): Observable<AiResponse> {
    return this.http
      .post<any>(`${this.apiUrl}/chat/messages/${messageId}/apply`, openDiagram)
      .pipe(map((res) => (res && res.data ? res.data : res) as AiResponse));
  }
}
