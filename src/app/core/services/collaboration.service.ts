import { Injectable, signal, inject } from '@angular/core';
import { io, Socket } from 'socket.io-client';
import { Subject } from 'rxjs';
import { AuthService } from './auth.service';
import { UmlClassNode, UmlConnection } from '../models/diagram.model';
import { User } from '../models/user.model';
import { ChatConversation, ChatMessage } from './ai-assistant.service';
import { environment } from '../../../environments/environment';

export interface RemoteCursor {
  userId: string;
  userName: string;
  x: number;
  y: number;
  color: string;
}

export interface Collaborator {
  userId: string;
  userName: string;
  color: string;
  isConnected: boolean;
}

export interface NodeLock {
  nodeId: string;
  userId: string;
  userName: string;
  color: string;
}

@Injectable({
  providedIn: 'root',
})
export class CollaborationService {
  private readonly authService = inject(AuthService);
  private socket: Socket | null = null;
  private readonly socketUrl = environment.socketUrl;

  readonly isConnected = signal<boolean>(false);
  readonly currentDiagramId = signal<string | null>(null);
  readonly myColor = signal<string>('#3B82F6');
  readonly collaborators = signal<Collaborator[]>([]);
  readonly remoteCursors = signal<RemoteCursor[]>([]);
  readonly activeNodeLocks = signal<Map<string, NodeLock>>(new Map());

  // Observables para cambios remotos
  readonly remoteNodeDrag$ = new Subject<{
    nodeId: string;
    position: { x: number; y: number };
    userId: string;
  }>();
  readonly remoteDiagramSync$ = new Subject<{
    nodes: UmlClassNode[];
    connections: UmlConnection[];
    userId: string;
    action: string;
  }>();
  readonly nodeLockRejected$ = new Subject<{ nodeId: string; lockedBy: NodeLock }>();

  // Conversación compartida con Trazo: mensajes de cualquiera de la pizarra y estado de Trazo
  readonly aiMessage$ = new Subject<ChatMessage>();
  readonly aiConversationReset$ = new Subject<ChatConversation>();
  /** Nombre de la persona a la que Trazo está respondiendo, o null si está libre. */
  readonly aiBusyFor = signal<string | null>(null);

  // Control de frecuencia de cursores
  private lastCursorSent = 0;

  private getCurrentUser(): User | null {
    const fromAuth = this.authService.currentUser();
    if (fromAuth) return fromAuth;

    try {
      const stored = localStorage.getItem('uml_studio_user');
      if (stored) return JSON.parse(stored);
    } catch {}
    return null;
  }

  connect(): void {
    if (this.socket) {
      if (!this.socket.connected) {
        this.socket.connect();
      }
      return;
    }

    this.socket = io(this.socketUrl, {
      transports: ['websocket', 'polling'],
      autoConnect: true,
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      // Función para que cada reconexión envíe el token JWT vigente
      auth: (cb) => cb({ token: this.authService.token() }),
    });

    this.socket.on('connect', () => {
      this.isConnected.set(true);
      const diagramId = this.currentDiagramId();
      if (diagramId) {
        this.emitJoinRoom(diagramId);
      }
    });

    this.socket.on('disconnect', () => {
      this.isConnected.set(false);
      this.aiBusyFor.set(null);
      this.remoteCursors.set([]);
      this.activeNodeLocks.set(new Map());
    });

    this.socket.on(
      'room_participants_updated',
      (data: { diagramId?: string; participants: Collaborator[] }) => {
        if (data && data.participants) {
          this.collaborators.set(data.participants);
        }
      },
    );

    this.socket.on('user_joined', (data: { userId: string; userName: string; color: string }) => {
      this.collaborators.update((list) => {
        if (!list.some((c) => c.userId === data.userId)) {
          return [
            ...list,
            { userId: data.userId, userName: data.userName, color: data.color, isConnected: true },
          ];
        }
        return list;
      });
    });

    this.socket.on('user_left', (data: { userId: string; userName?: string }) => {
      this.collaborators.update((list) => list.filter((c) => c.userId !== data.userId));
      this.remoteCursors.update((cursors) => cursors.filter((c) => c.userId !== data.userId));

      // Limpiar bloqueos de este usuario si quedaron
      this.activeNodeLocks.update((map) => {
        const next = new Map(map);
        for (const [nodeId, lock] of next.entries()) {
          if (lock.userId === data.userId) {
            next.delete(nodeId);
          }
        }
        return next;
      });
    });

    this.socket.on('node_locked', (lock: NodeLock) => {
      this.activeNodeLocks.update((map) => {
        const next = new Map(map);
        next.set(lock.nodeId, lock);
        return next;
      });
    });

    this.socket.on('node_lock_rejected', (data: { nodeId: string; lockedBy: NodeLock }) => {
      this.activeNodeLocks.update((map) => {
        const next = new Map(map);
        next.set(data.nodeId, data.lockedBy);
        return next;
      });
      this.nodeLockRejected$.next(data);
    });

    this.socket.on('node_unlocked', (data: { nodeId: string; userId: string }) => {
      this.activeNodeLocks.update((map) => {
        const next = new Map(map);
        next.delete(data.nodeId);
        return next;
      });
    });

    this.socket.on('cursor_moved', (data: RemoteCursor) => {
      const currentUserId = this.getCurrentUser()?.id;
      if (data.userId === currentUserId) return;

      this.remoteCursors.update((cursors) => {
        const index = cursors.findIndex((c) => c.userId === data.userId);
        if (index >= 0) {
          const updated = [...cursors];
          updated[index] = data;
          return updated;
        }
        return [...cursors, data];
      });
    });

    this.socket.on(
      'node_dragged',
      (data: { nodeId: string; position: { x: number; y: number }; userId: string }) => {
        const currentUserId = this.getCurrentUser()?.id;
        if (data.userId === currentUserId) return;
        this.remoteNodeDrag$.next(data);
      },
    );

    this.socket.on(
      'diagram_synced',
      (data: {
        nodes: UmlClassNode[];
        connections: UmlConnection[];
        userId: string;
        action: string;
      }) => {
        const currentUserId = this.getCurrentUser()?.id;
        if (data.userId === currentUserId) return;
        this.remoteDiagramSync$.next(data);
      },
    );

    this.socket.on('ai_message', (message: ChatMessage) => this.aiMessage$.next(message));
    this.socket.on('ai_conversation_reset', (conversation: ChatConversation) =>
      this.aiConversationReset$.next(conversation),
    );
    this.socket.on('ai_status', (data: { busy: boolean; userName?: string }) =>
      this.aiBusyFor.set(data.busy ? data.userName || '' : null),
    );
  }

  joinRoom(diagramId: string): void {
    this.currentDiagramId.set(diagramId);
    this.connect();

    if (this.socket && this.socket.connected) {
      this.emitJoinRoom(diagramId);
    }
  }

  private emitJoinRoom(diagramId: string): void {
    const user = this.getCurrentUser();
    const userId = user?.id || `anon_${Math.random().toString(36).substring(2, 7)}`;
    const userName = user?.fullName || user?.email || 'Colaborador';

    const assignedColor = this.generateUserColor(userName + userId);
    this.myColor.set(assignedColor);

    this.socket?.emit(
      'join_room',
      {
        diagramId,
        userId,
        userName,
        color: assignedColor,
      },
      (res: { success: boolean; participants?: Collaborator[]; activeLocks?: NodeLock[] }) => {
        if (res && res.success) {
          if (res.participants) {
            this.collaborators.set(res.participants);
          }
          if (res.activeLocks) {
            const map = new Map<string, NodeLock>();
            for (const lock of res.activeLocks) {
              map.set(lock.nodeId, lock);
            }
            this.activeNodeLocks.set(map);
          }
        }
      },
    );
  }

  leaveRoom(): void {
    const user = this.getCurrentUser();
    const diagramId = this.currentDiagramId();
    if (this.socket && user) {
      this.socket.emit('leave_room', {
        diagramId,
        userId: user.id,
      });
    }
    this.remoteCursors.set([]);
    this.collaborators.set([]);
    this.activeNodeLocks.set(new Map());
    this.aiBusyFor.set(null);
  }

  requestNodeLock(nodeId: string): void {
    const user = this.getCurrentUser();
    const diagramId = this.currentDiagramId();

    const currentLock: NodeLock = {
      nodeId,
      userId: user?.id || 'anon',
      userName: user?.fullName || user?.email || 'Usuario',
      color: this.myColor(),
    };

    this.activeNodeLocks.update((map) => {
      const next = new Map(map);
      next.set(nodeId, currentLock);
      return next;
    });

    if (!this.socket || !diagramId || !user) return;

    this.socket.emit('lock_node', {
      diagramId,
      nodeId,
      userId: user.id,
      userName: user.fullName || user.email || 'Usuario',
      color: this.myColor(),
    });
  }

  releaseNodeLock(nodeId: string): void {
    const user = this.getCurrentUser();
    const diagramId = this.currentDiagramId();

    this.activeNodeLocks.update((map) => {
      const next = new Map(map);
      next.delete(nodeId);
      return next;
    });

    if (!this.socket || !diagramId || !user) return;

    this.socket.emit('unlock_node', {
      diagramId,
      nodeId,
      userId: user.id,
    });
  }

  sendCursorPosition(x: number, y: number): void {
    const now = Date.now();
    if (now - this.lastCursorSent < 25) return; // ~40 fps
    this.lastCursorSent = now;

    const user = this.getCurrentUser();
    const diagramId = this.currentDiagramId();
    if (!this.socket || !diagramId) return;

    this.socket.emit('cursor_move', {
      diagramId,
      userId: user?.id || 'anon',
      userName: user?.fullName || user?.email || 'Usuario',
      color: this.myColor(),
      x: Math.round(x),
      y: Math.round(y),
    });
  }

  sendNodeDrag(nodeId: string, position: { x: number; y: number }): void {
    const user = this.getCurrentUser();
    const diagramId = this.currentDiagramId();
    if (!this.socket || !diagramId) return;

    this.socket.emit('node_drag', {
      diagramId,
      nodeId,
      position,
      userId: user?.id || 'anon',
    });
  }

  sendDiagramSync(nodes: UmlClassNode[], connections: UmlConnection[], action = 'update'): void {
    const user = this.getCurrentUser();
    const diagramId = this.currentDiagramId();
    if (!this.socket || !diagramId) return;

    this.socket.emit('diagram_sync', {
      diagramId,
      nodes,
      connections,
      userId: user?.id || 'anon',
      action,
    });
  }

  disconnect(): void {
    this.leaveRoom();
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
    this.isConnected.set(false);
  }

  /** Color estable de una persona (el mismo que ven todos para su cursor y sus mensajes). */
  colorFor(userId: string, userName: string): string {
    return this.generateUserColor(userName + userId);
  }

  private generateUserColor(seed: string): string {
    const palette = [
      '#EF4444', // Rojo Coral
      '#F59E0B', // Ámbar Oro
      '#10B981', // Verde Esmeralda
      '#3B82F6', // Azul Cobalto
      '#6366F1', // Índigo Real
      '#8B5CF6', // Púrpura Eléctrico
      '#EC4899', // Rosa Magenta
      '#06B6D4', // Cian Neón
      '#F97316', // Naranja Fuego
    ];
    let hash = 0;
    for (let i = 0; i < seed.length; i++) {
      hash = seed.charCodeAt(i) + ((hash << 5) - hash);
    }
    const index = Math.abs(hash) % palette.length;
    return palette[index];
  }
}
