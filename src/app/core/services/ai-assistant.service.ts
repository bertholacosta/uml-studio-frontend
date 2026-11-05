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
  proposal?: { state: 'pending' | 'applied'; appliedBy?: ChatAuthor; appliedAt?: string };
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

  /** Aplica a su diagrama los cambios que Trazo propuso en un mensaje. */
  applyProposal(messageId: string, openDiagram: OpenDiagram): Observable<AiResponse> {
    return this.http
      .post<any>(`${this.apiUrl}/chat/messages/${messageId}/apply`, openDiagram)
      .pipe(map((res) => (res && res.data ? res.data : res) as AiResponse));
  }
}
