import { computed, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { App } from './app';
import { AgentService } from './core/service/agent.service';

describe('App', () => {
  beforeEach(async () => {
    const chat = signal({ id: null, name: 'New chat', history: [], context: [], updatedAt: new Date(), createdAt: new Date(), saved: false } as const);
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [{ provide: AgentService, useValue: { currentChat: chat, hasResponse: computed(() => false), isSending: signal(false), chats: signal([]), draft: signal(''), isSubmissionBlocked: computed(() => false), isContextLimitReached: computed(() => false), compactionState: signal({ isCompacting: false, status: '' }), tokenCountState: signal({ inputTokens: 0, contextWindow: 200_000, isCounting: false, error: '' }), percentage: computed(() => 0), canRequestCompaction: computed(() => false), newChat: vi.fn(), selectChat: vi.fn(), deleteChat: vi.fn(), setDraft: vi.fn(), sendDraft: vi.fn(), requestCompaction: vi.fn() } }],
    }).compileComponents();
  });

  it('should create the composition container', () => {
    expect(TestBed.createComponent(App).componentInstance).toBeTruthy();
  });
});
