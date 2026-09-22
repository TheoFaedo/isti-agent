import { computed, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { AgentService } from '../../core/service/agent.service';
import { MessageComposerComponent } from './message-composer';

describe('MessageComposerComponent', () => {
  const draft = signal('');
  const sendDraft = vi.fn(async () => undefined);

  beforeEach(async () => {
    draft.set('');
    sendDraft.mockClear();
    await TestBed.configureTestingModule({
      imports: [MessageComposerComponent],
      providers: [{ provide: AgentService, useValue: { draft, sendDraft, isSubmissionBlocked: computed(() => false), isContextLimitReached: computed(() => false), currentChat: signal({ id: null, name: 'New chat', history: [], context: [], updatedAt: new Date(), createdAt: new Date(), saved: false }), isSending: signal(false), compactionState: signal({ isCompacting: false, status: '' }), tokenCountState: signal({ inputTokens: 0, contextWindow: 200_000, isCounting: false, error: '' }), percentage: computed(() => 0), canRequestCompaction: computed(() => false), requestCompaction: vi.fn() } }],
    }).compileComponents();
  });

  it('delegates submission to the agent facade', async () => {
    const fixture = TestBed.createComponent(MessageComposerComponent);
    fixture.detectChanges();
    draft.set('Bonjour');
    await (fixture.componentInstance as any).submit({ preventDefault: vi.fn() });
    expect(sendDraft).toHaveBeenCalledOnce();
  });

  it('sends the draft when Enter is pressed', async () => {
    const fixture = TestBed.createComponent(MessageComposerComponent);
    const preventDefault = vi.fn();

    await (fixture.componentInstance as any).handleKeydown({ key: 'Enter', shiftKey: false, isComposing: false, preventDefault });

    expect(preventDefault).toHaveBeenCalledOnce();
    expect(sendDraft).toHaveBeenCalledOnce();
  });

  it('keeps the native line break when Shift+Enter is pressed', async () => {
    const fixture = TestBed.createComponent(MessageComposerComponent);
    const preventDefault = vi.fn();

    await (fixture.componentInstance as any).handleKeydown({ key: 'Enter', shiftKey: true, isComposing: false, preventDefault });

    expect(preventDefault).not.toHaveBeenCalled();
    expect(sendDraft).not.toHaveBeenCalled();
  });
});
