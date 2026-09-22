import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { Chat } from '../../shared/model/chat.model';
import { ChatService } from './chat.service';
import { AgentService } from './agent.service';
import { MessageApiService } from './message-api.service';

function savedChat(id: string): Chat {
  const now = new Date();
  return { id, name: 'Conversation', history: [], context: [], createdAt: now, updatedAt: now, saved: true };
}

describe('AgentService', () => {
  let chats: ReturnType<typeof signal<Chat[]>>;
  let agent: AgentService;

  beforeEach(() => {
    chats = signal<Chat[]>([savedChat('existing')]);
    const chatService = {
      chats: chats.asReadonly(),
      createNewChat: vi.fn((text: string) => {
        const chat = { ...savedChat('created'), name: text.slice(0, 20) };
        chats.update((items) => [...items, chat]);
        return chat;
      }),
      deleteChat: vi.fn((id: string) => chats.update((items) => items.filter((chat) => chat.id !== id))),
      updateChat: vi.fn((updated: Chat) => chats.update((items) => items.map((chat) => chat.id === updated.id ? updated : chat))),
    };
    const messageApi = {
      countTokens: vi.fn(() => of({ inputTokens: 10, contextWindow: 200 })),
      requestOnce: vi.fn(() => of({ blocks: { 0: { type: 'text' as const, text: 'Réponse' } }, finishReason: 'end_turn', finished: true })),
      compactContext: vi.fn(() => of([])),
      toolTable: {},
    };
    TestBed.configureTestingModule({
      providers: [
        { provide: ChatService, useValue: chatService },
        { provide: MessageApiService, useValue: messageApi },
      ],
    });
    agent = TestBed.inject(AgentService);
  });

  it('selects, deletes and resets the shared draft with a new chat', () => {
    agent.setDraft('À conserver temporairement');
    agent.selectChat('existing');
    expect(agent.currentChat().id).toBe('existing');

    agent.deleteChat('existing');
    expect(chats()).toEqual([]);
    expect(agent.currentChat().saved).toBe(false);
    expect(agent.draft()).toBe('');
  });

  it('creates a chat and exposes the streamed response in history and context', async () => {
    agent.setDraft('Bonjour');
    await agent.sendDraft();
    await Promise.resolve();

    expect(agent.currentChat().saved).toBe(true);
    expect(agent.currentChat().history.map((message) => message.role)).toEqual(['user', 'assistant']);
    expect(agent.currentChat().history[1].blocks).toEqual([{ type: 'text', text: 'Réponse' }]);
    expect(agent.currentChat().context).toHaveLength(2);
    expect(agent.isSending()).toBe(false);
  });
});
