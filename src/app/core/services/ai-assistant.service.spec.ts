import '@angular/compiler';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { of } from 'rxjs';
import { AiAssistantService, ChatAccepted, ChatConversation } from './ai-assistant.service';

describe('AiAssistantService', () => {
  let service: AiAssistantService;
  let mockHttpClient: any;

  beforeEach(() => {
    mockHttpClient = {
      get: vi.fn(),
      post: vi.fn(),
    };
    service = Object.create(AiAssistantService.prototype);
    (service as any).http = mockHttpClient;
    (service as any).apiUrl = 'http://localhost:3000/api';
  });

  it('envía el mensaje al canal del equipo con menciones y el diagrama abierto', () => {
    // Si menciona a Trazo queda en cola: su respuesta llega por el socket
    const accepted: ChatAccepted = {
      status: 'queued',
      message: {
        id: 'm-1',
        conversationId: 'conv-1',
        projectId: 'p-1',
        channel: 'team',
        role: 'user',
        author: { userId: 'u1', userName: 'Ana Pérez' },
        text: '@Trazo crea Factura en #Ventas',
        mentions: ['ai_assistant'],
        clientId: 'c-1',
        status: 'success',
        createdAt: '2026-11-03T18:00:00Z',
      },
    };
    mockHttpClient.post.mockReturnValue(of({ data: accepted }));

    service
      .sendMessage('p-1', {
        channel: 'team',
        text: '@Trazo crea Factura en #Ventas',
        mentions: ['ai_assistant'],
        clientId: 'c-1',
        activeDiagramId: 'd-1',
        currentNodes: [],
        currentConnections: [],
      })
      .subscribe((res) => expect(res).toEqual(accepted));

    expect(mockHttpClient.post).toHaveBeenCalledWith(
      'http://localhost:3000/api/chat/projects/p-1/messages',
      expect.objectContaining({
        channel: 'team',
        mentions: ['ai_assistant'],
        activeDiagramId: 'd-1',
      }),
    );
  });

  it('pide el canal del equipo o la conversación privada del proyecto', () => {
    const conversation: ChatConversation = {
      id: 'conv-1',
      projectId: 'p-1',
      channel: 'direct',
      startedBy: { userId: 'u1', userName: 'Ana Pérez' },
      createdAt: '2026-11-03T18:00:00Z',
      messages: [],
      hasMore: false,
    };
    mockHttpClient.get.mockReturnValue(of({ data: conversation }));

    service.getConversation('p-1', 'direct').subscribe((res) => expect(res).toEqual(conversation));
    expect(mockHttpClient.get).toHaveBeenCalledWith(
      'http://localhost:3000/api/chat/projects/p-1/direct',
    );
  });

  it('aplica una propuesta enviando el diagrama abierto', () => {
    mockHttpClient.post.mockReturnValue(of({ data: {} }));
    service
      .applyProposal('m-1', { activeDiagramId: 'd-1', currentNodes: [], currentConnections: [] })
      .subscribe();
    expect(mockHttpClient.post).toHaveBeenCalledWith(
      'http://localhost:3000/api/chat/messages/m-1/apply',
      { activeDiagramId: 'd-1', currentNodes: [], currentConnections: [] },
    );
  });
});
