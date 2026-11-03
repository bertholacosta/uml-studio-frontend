import '@angular/compiler';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { of } from 'rxjs';
import { AiAssistantService, AiResponse, ChatConversation } from './ai-assistant.service';

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
    (service as any).apiUrl = 'http://localhost:3000/api/ai';
  });

  it('debe enviar el prompt, el diagrama y el id provisional a /ai/prompt', () => {
    const mockAiResponse: AiResponse = {
      success: true,
      action: 'diagram_mutated',
      message: 'Ana, creé Factura',
      nodes: [],
      connections: [],
      changesSummary: 'Cambio aplicado',
      modelUsed: 'trazo',
    };

    mockHttpClient.post.mockReturnValue(of({ data: mockAiResponse }));

    service
      .sendTextPrompt('Crea tabla Factura', {
        diagramId: 'diag-123',
        currentNodes: [],
        currentConnections: [],
        clientId: 'c-1',
      })
      .subscribe((res) => {
        expect(res).toEqual(mockAiResponse);
        expect(res.modelUsed).toBe('trazo');
      });

    expect(mockHttpClient.post).toHaveBeenCalledWith(
      expect.stringContaining('/ai/prompt'),
      expect.objectContaining({
        prompt: 'Crea tabla Factura',
        diagramId: 'diag-123',
        clientId: 'c-1',
      }),
    );
  });

  it('debe pedir la conversación compartida del diagrama', () => {
    const conversation: ChatConversation = {
      id: 'conv-1',
      diagramId: 'diag-123',
      startedBy: { userId: 'u1', userName: 'Ana Pérez' },
      createdAt: '2026-11-03T18:00:00Z',
      messages: [],
      hasMore: false,
    };
    mockHttpClient.get.mockReturnValue(of({ data: conversation }));

    service.getConversation('diag-123').subscribe((res) => expect(res).toEqual(conversation));
    expect(mockHttpClient.get).toHaveBeenCalledWith(
      'http://localhost:3000/api/ai/diagrams/diag-123/conversation',
    );
  });

  it('debe aplicar una propuesta sobre el diagrama actual', () => {
    mockHttpClient.post.mockReturnValue(of({ data: {} }));
    service.applyProposal('m-1', [], []).subscribe();
    expect(mockHttpClient.post).toHaveBeenCalledWith(
      'http://localhost:3000/api/ai/messages/m-1/apply',
      { currentNodes: [], currentConnections: [] },
    );
  });
});
