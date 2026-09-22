import { computed, effect, inject, Service, signal } from '@angular/core';
import { lastValueFrom, tap } from 'rxjs';
import { Chat, Message, MessageBlock, ToolResultBlock, ToolUseBlock } from '../../shared/model/chat.model';
import { MessageResult } from '../../shared/util/sse.util';
import { ChatService } from './chat.service';
import { MessageApiService } from './message-api.service';

const defaultContextWindow = 200_000;

interface CompactionState {
  isCompacting: boolean;
  status: string;
}

interface TokenCountState {
  inputTokens: number;
  contextWindow: number;
  isCounting: boolean;
  error: string;
}

function createEmptyChat(): Chat {
  const now = new Date();
  return { id: null, name: 'New chat', history: [], context: [], updatedAt: now, createdAt: now, saved: false };
}

@Service()
export class AgentService {
  private readonly chatService = inject(ChatService);
  private readonly messageApiService = inject(MessageApiService);

  readonly chats = this.chatService.chats;
  readonly currentChat = signal<Chat>(createEmptyChat());
  readonly draft = signal('');
  readonly isSending = signal(false);
  readonly hasResponse = computed(() => this.currentChat().history.length > 0);
  readonly compactionState = signal<CompactionState>({ isCompacting: false, status: '' });
  readonly tokenCountState = signal<TokenCountState>({
    inputTokens: 0,
    contextWindow: defaultContextWindow,
    isCounting: false,
    error: '',
  });
  readonly isContextLimitReached = computed(() => {
    const { inputTokens, contextWindow } = this.tokenCountState();
    return inputTokens >= contextWindow * 0.9;
  });
  readonly isSubmissionBlocked = computed(
    () => this.isSending() || this.compactionState().isCompacting || this.tokenCountState().isCounting || this.isContextLimitReached(),
  );
  readonly percentage = computed(() => {
    const { inputTokens, contextWindow } = this.tokenCountState();
    return contextWindow > 0 ? Math.min(100, Math.round((inputTokens / contextWindow) * 100)) : 0;
  });
  readonly canRequestCompaction = computed(
    () => this.currentChat().context.length > 0 && !this.isSubmissionBlocked(),
  );

  private lastChatId: string | null | undefined;
  private wasSending = false;
  private countRequestId = 0;

  constructor() {
    effect(() => {
      const chat = this.currentChat();
      if (chat.saved) {
        this.chatService.updateChat(chat);
      }
    });
    effect(() => {
      const current = this.currentChat();
      if (!current.saved) return;
      const stored = this.chats().find((chat) => chat.id === current.id);
      if (stored && stored !== current) this.currentChat.set(stored);
    });
    effect(() => {
      const chat = this.currentChat();
      const sending = this.isSending();
      const changed = this.lastChatId !== chat.id;
      if (changed) {
        this.lastChatId = chat.id;
        this.compactionState.set({ isCompacting: false, status: '' });
        this.invalidatePendingCount();
        if (chat.context.length === 0) this.resetTokenDisplay();
        else if (!sending) void this.refreshTokenCount(chat);
      }
      if (this.wasSending && !sending && !changed) void this.refreshTokenCount(chat);
      this.wasSending = sending;
    });
  }

  selectChat(id: string): void {
    const chat = this.chats().find((candidate) => candidate.id === id);
    if (chat) this.currentChat.set(chat);
  }

  newChat(): void {
    this.currentChat.set(createEmptyChat());
    this.resetDraft();
  }

  deleteChat(id: string): void {
    this.chatService.deleteChat(id);
    if (this.currentChat().id === id) this.newChat();
  }

  setDraft(draft: string): void { this.draft.set(draft); }
  resetDraft(): void { this.draft.set(''); }

  async sendDraft(): Promise<void> {
    const message = this.draft().trim();
    if (!message || this.isSubmissionBlocked() || !(await this.validateDraft(message))) return;
    this.resetDraft();
    this.send(message);
  }

  async validateDraft(prompt: string): Promise<boolean> {
    if (this.isSubmissionBlocked()) return false;
    const chat = this.currentChat();
    const draft: Message = { id: crypto.randomUUID(), role: 'user', blocks: [{ type: 'text', text: prompt }] };
    const count = await this.countTokens([...chat.context, draft], chat);
    if (!this.isCurrentChat(chat) || count === null) return false;
    if (count >= this.tokenCountState().contextWindow * 0.9) {
      this.tokenCountState.update((state) => ({ ...state, error: 'Le prochain message atteindrait la limite. Compactez le contexte avant de l’envoyer.' }));
      return false;
    }
    return true;
  }

  requestCompaction(): void {
    if (this.canRequestCompaction()) void this.compactContext();
  }

  private send(text: string): void {
    if (!this.currentChat().saved) this.currentChat.set(this.chatService.createNewChat(text));
    this.addMessage({ id: crypto.randomUUID(), role: 'user', blocks: [{ type: 'text', text }] });
    this.isSending.set(true);
    const assistantId = crypto.randomUUID();
    this.addMessage({ id: assistantId, role: 'assistant', blocks: [] }, false);
    void this.completeResponse(assistantId, assistantId, []);
  }

  private addMessage(message: Message, includeInContext = true): void {
    this.currentChat.update((chat) => ({ ...chat, history: [...chat.history, message], context: includeInContext ? [...chat.context, message] : chat.context, updatedAt: new Date() }));
  }
  private updateVisibleMessageBlocks(id: string, blocks: MessageBlock[]): void {
    this.currentChat.update((chat) => ({ ...chat, history: chat.history.map((message) => message.id === id ? { ...message, blocks } : message), updatedAt: new Date() }));
  }
  private updateContextMessage(id: string, blocks: MessageBlock[]): void {
    this.currentChat.update((chat) => ({ ...chat, context: chat.context.some((message) => message.id === id) ? chat.context.map((message) => message.id === id ? { ...message, blocks } : message) : [...chat.context, { id, role: 'assistant', blocks }], updatedAt: new Date() }));
  }
  private addContextMessage(message: Message): void {
    this.currentChat.update((chat) => ({ ...chat, context: [...chat.context, message], updatedAt: new Date() }));
  }

  private async completeResponse(visibleId: string, contextId: string, previousBlocks: MessageBlock[]): Promise<void> {
    try {
      const result = await lastValueFrom(this.messageApiService.requestOnce(this.currentChat().context).pipe(tap((stream) => {
        const blocks = this.toMessageBlocks(stream);
        this.updateVisibleMessageBlocks(visibleId, [...previousBlocks, ...blocks]);
        this.updateContextMessage(contextId, blocks);
      })));
      await this.handleStreamResult(visibleId, result, previousBlocks);
    } catch (error) {
      console.error(error);
      const message = error instanceof Error ? error.message : 'Erreur inconnue';
      this.updateVisibleMessageBlocks(visibleId, [...previousBlocks, { type: 'text', text: 'Erreur occurred: ' + message }]);
      this.isSending.set(false);
    }
  }

  private async handleStreamResult(visibleId: string, result: MessageResult, previousBlocks: MessageBlock[]): Promise<void> {
    if (result.finishReason !== 'tool_use') { this.isSending.set(false); return; }
    const blocks = this.toMessageBlocks(result);
    const results = await Promise.all(blocks.filter((block): block is ToolUseBlock => block.type === 'tool_use').map((block) => this.executeTool(block)));
    this.addContextMessage({ id: crypto.randomUUID(), role: 'user', blocks: results });
    await this.completeResponse(visibleId, crypto.randomUUID(), [...previousBlocks, ...blocks]);
  }
  private async executeTool(block: ToolUseBlock): Promise<ToolResultBlock> {
    const tool = this.messageApiService.toolTable[block.name];
    if (!tool) return { type: 'tool_result', tool_use_id: block.id, content: `Outil introuvable : ${block.name}`, is_error: true };
    try { return { type: 'tool_result', tool_use_id: block.id, content: await tool.action(block.input as Record<string, string>) }; }
    catch (error) { return { type: 'tool_result', tool_use_id: block.id, content: error instanceof Error ? error.message : 'Erreur lors de l’exécution de l’outil', is_error: true }; }
  }
  private toMessageBlocks(result: MessageResult): MessageBlock[] {
    return Object.values(result.blocks).map((block) => block.type === 'text' ? block : { ...block, input: this.parseToolInput(block.input) });
  }
  private parseToolInput(input: string): Record<string, unknown> {
    try { const parsed: unknown = JSON.parse(input); return this.isRecord(parsed) ? parsed : {}; } catch { return {}; }
  }
  private isRecord(value: unknown): value is Record<string, unknown> { return typeof value === 'object' && value !== null && !Array.isArray(value); }

  async compactContext(): Promise<void> {
    const chat = this.currentChat();
    if (this.isSubmissionBlocked() || chat.context.length === 0) return;
    this.compactionState.set({ isCompacting: true, status: 'Jev analyse le contexte…' });
    try {
      const discarded = new Set(await lastValueFrom(this.messageApiService.compactContext(chat.context)));
      if (!this.isCurrentChat(chat)) return;
      const context = chat.context.filter((message) => !discarded.has(message.id));
      const updated = { ...chat, context, updatedAt: new Date() } as Chat;
      this.currentChat.set(updated);
      if (updated.saved) this.chatService.updateChat(updated);
      const removed = chat.context.length - context.length;
      this.compactionState.update((state) => ({ ...state, status: removed === 0 ? 'Jev a conservé tout le contexte.' : `Jev a retiré ${removed} message${removed > 1 ? 's' : ''} du contexte.` }));
      await this.refreshTokenCount(updated);
    } catch (error) {
      console.error('La compactation du contexte a échoué.', error);
      if (this.isCurrentChat(chat)) this.compactionState.update((state) => ({ ...state, status: 'La compactation du contexte a échoué.' }));
    } finally {
      if (this.isCurrentChat(chat)) this.compactionState.update((state) => ({ ...state, isCompacting: false }));
    }
  }
  private async refreshTokenCount(chat: Chat): Promise<void> { await this.countTokens(chat.context, chat); }
  private async countTokens(messages: Message[], chat: Chat): Promise<number | null> {
    const requestId = ++this.countRequestId;
    this.tokenCountState.update((state) => ({ ...state, isCounting: true, error: '' }));
    try {
      const { inputTokens, contextWindow } = await lastValueFrom(this.messageApiService.countTokens(messages));
      if (requestId === this.countRequestId && this.isCurrentChat(chat)) { this.tokenCountState.update((state) => ({ ...state, inputTokens, contextWindow })); return inputTokens; }
      return null;
    } catch (error) {
      console.error('Le comptage des tokens a échoué.', error);
      if (requestId === this.countRequestId && this.isCurrentChat(chat)) this.tokenCountState.update((state) => ({ ...state, error: 'Le comptage du contexte est indisponible. Le dernier total connu est affiché.' }));
      return null;
    } finally { if (requestId === this.countRequestId) this.tokenCountState.update((state) => ({ ...state, isCounting: false })); }
  }
  private invalidatePendingCount(): void { this.countRequestId++; this.tokenCountState.update((state) => ({ ...state, isCounting: false })); }
  private isCurrentChat(chat: Chat): boolean { return this.currentChat().id === chat.id; }
  private resetTokenDisplay(): void { this.tokenCountState.set({ inputTokens: 0, contextWindow: defaultContextWindow, isCounting: false, error: '' }); }
}
