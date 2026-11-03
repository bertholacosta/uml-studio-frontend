import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { UmlClassNode, UmlConnection } from '../models/diagram.model';
import { environment } from '../../../environments/environment';

export interface ChatAuthor {
  userId: string;
  userName: string;
}

/** Mensaje de la conversación compartida con Trazo (lo ven todos los de la pizarra). */
export interface ChatMessage {
  id: string;
  conversationId: string;
  role: 'user' | 'assistant';
  author: ChatAuthor;
  text: string;
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
  diagramId: string;
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

/** Respuesta inmediata del servidor: la respuesta de Trazo llega después por el socket. */
export interface AiAccepted {
  status: 'queued';
  userMessage: ChatMessage;
}

/** Diagrama actual que acompaña a cada petición (la conversación la guarda el servidor). */
export interface AiDiagramContext {
  diagramId: string;
  currentNodes: UmlClassNode[];
  currentConnections: UmlConnection[];
  clientId?: string;
}

@Injectable({
  providedIn: 'root',
})
export class AiAssistantService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = `${environment.apiUrl}/ai`;

  getConversation(diagramId: string): Observable<ChatConversation> {
    return this.http
      .get<any>(`${this.apiUrl}/diagrams/${diagramId}/conversation`)
      .pipe(map((res) => (res && res.data ? res.data : res) as ChatConversation));
  }

  startConversation(diagramId: string): Observable<ChatConversation> {
    return this.http
      .post<any>(`${this.apiUrl}/diagrams/${diagramId}/conversation`, {})
      .pipe(map((res) => (res && res.data ? res.data : res) as ChatConversation));
  }

  sendTextPrompt(prompt: string, context: AiDiagramContext): Observable<AiAccepted> {
    return this.http
      .post<any>(`${this.apiUrl}/prompt`, { prompt, ...context })
      .pipe(map((res) => (res && res.data ? res.data : res) as AiAccepted));
  }

  sendVisionPrompt(
    imageBase64: string,
    mimeType: string,
    prompt: string | undefined,
    context: AiDiagramContext,
  ): Observable<AiAccepted> {
    return this.http
      .post<any>(`${this.apiUrl}/vision-diagram`, { imageBase64, mimeType, prompt, ...context })
      .pipe(map((res) => (res && res.data ? res.data : res) as AiAccepted));
  }

  /** Aplica al diagrama actual los cambios que Trazo propuso en un mensaje. */
  applyProposal(
    messageId: string,
    currentNodes: UmlClassNode[],
    currentConnections: UmlConnection[],
  ): Observable<AiResponse> {
    return this.http
      .post<any>(`${this.apiUrl}/messages/${messageId}/apply`, {
        currentNodes,
        currentConnections,
      })
      .pipe(map((res) => (res && res.data ? res.data : res) as AiResponse));
  }
}
