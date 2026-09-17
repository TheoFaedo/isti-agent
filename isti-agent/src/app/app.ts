import { Component, computed, effect, inject, signal } from '@angular/core';
import { lastValueFrom, tap } from 'rxjs';
import { MessageApiService } from './core/service/message-api.service';
import { ChatHeaderComponent } from './feature/chat-header/chat-header';
import { ChatMessagesComponent } from './feature/chat-messages/chat-messages';
import { ChatWelcomeComponent } from './feature/chat-welcome/chat-welcome';
import { MessageComposerComponent } from './feature/message-composer/message-composer';
import { SidebarComponent } from './feature/sidebar/sidebar';
import {
  Chat,
  Message,
  MessageBlock,
  ToolResultBlock,
  ToolUseBlock,
} from './shared/model/chat.model';
import { MessageResult } from './shared/util/sse.util';
import { ChatService } from './core/service/chat.service';

function createEmptyChat(): Chat {
  const now = new Date();

  return {
    id: null,
    name: 'New chat',
    history: [],
    context: [],
    updatedAt: now,
    createdAt: now,
    saved: false,
  };
}

@Component({
  imports: [
    SidebarComponent,
    ChatHeaderComponent,
    ChatWelcomeComponent,
    ChatMessagesComponent,
    MessageComposerComponent,
  ],
  selector: 'app-root',
  styleUrl: './app.less',
  templateUrl: './app.html',
})
export class App {
  private readonly chatService = inject(ChatService);
  private readonly messageApiService = inject(MessageApiService);

  private readonly chats = this.chatService.chats;

  protected readonly prompt = signal<string>('');
  protected readonly isSending = signal(false);

  protected readonly currentChat = signal<Chat>(createEmptyChat());

  protected readonly hasResponse = computed(() => this.currentChat().history.length > 0);

  constructor() {
    effect(() => {
      const current = this.currentChat();
      if (current.saved) {
        this.chatService.updateChat(current);
      }
    });
  }

  protected send() {
    const message = this.prompt().trim();
    if (!message || this.isSending()) {
      return;
    }

    if (!this.currentChat().saved) {
      const chat = this.chatService.createNewChat(message);
      this.currentChat.set(chat);
    }

    this.addMessage({
      id: crypto.randomUUID(),
      role: 'user',
      blocks: [{ type: 'text', text: message }],
    });

    this.isSending.set(true);
    const assistMessageId = crypto.randomUUID();
    this.addMessage(
      {
        id: assistMessageId,
        role: 'assistant',
        blocks: [],
      },
      false,
    );
    void this.completeResponse(assistMessageId, assistMessageId, []);
  }

  protected useSuggestion(suggestion: string) {
    this.prompt.set(suggestion);
  }

  private addMessage(message: Message, includeInContext: boolean = true): void {
    this.currentChat.update((chat) => ({
      ...chat,
      history: [...chat.history, message],
      context: includeInContext ? [...chat.context, message] : chat.context,
      updatedAt: new Date(),
    }));
  }

  private updateVisibleMessageBlocks(id: string, blocks: MessageBlock[]): void {
    this.currentChat.update((chat) => ({
      ...chat,
      history: chat.history.map((message) =>
        message.id === id ? { ...message, blocks } : message,
      ),
      updatedAt: new Date(),
    }));
  }

  private updateContextMessage(id: string, blocks: MessageBlock[]): void {
    this.currentChat.update((chat) => ({
      ...chat,
      context: chat.context.some((message) => message.id === id)
        ? chat.context.map((message) => (message.id === id ? { ...message, blocks } : message))
        : [...chat.context, { id, role: 'assistant', blocks }],
      updatedAt: new Date(),
    }));
  }

  private addContextMessage(message: Message): void {
    this.currentChat.update((chat) => ({
      ...chat,
      context: [...chat.context, message],
      updatedAt: new Date(),
    }));
  }

  private async completeResponse(
    visibleMessageId: string,
    contextMessageId: string,
    previousBlocks: MessageBlock[],
  ): Promise<void> {
    try {
      const result = await lastValueFrom(
        this.messageApiService.requestOnce(this.currentChat().context).pipe(
          tap((streamResult) => {
            const blocks = this.toMessageBlocks(streamResult);
            this.updateVisibleMessageBlocks(visibleMessageId, [...previousBlocks, ...blocks]);
            this.updateContextMessage(contextMessageId, blocks);
          }),
        ),
      );

      await this.handleStreamResult(visibleMessageId, result, previousBlocks);
    } catch (error) {
      console.error(error);
      const message = error instanceof Error ? error.message : 'Erreur inconnue';
      this.updateVisibleMessageBlocks(visibleMessageId, [
        ...previousBlocks,
        { type: 'text', text: 'Erreur occurred: ' + message },
      ]);
      this.isSending.set(false);
    }
  }

  private async handleStreamResult(
    visibleMessageId: string,
    result: MessageResult,
    previousBlocks: MessageBlock[],
  ): Promise<void> {
    if (result.finishReason === 'end_turn' || result.finishReason === 'next_turn') {
      this.isSending.set(false);
      return;
    }

    if (result.finishReason !== 'tool_use') {
      this.isSending.set(false);
      return;
    }

    const blocks = this.toMessageBlocks(result);
    const toolResults = await Promise.all(
      blocks
        .filter((block): block is ToolUseBlock => block.type === 'tool_use')
        .map((block) => this.executeTool(block)),
    );
    this.addContextMessage({
      id: crypto.randomUUID(),
      role: 'user',
      blocks: toolResults,
    });

    await this.completeResponse(visibleMessageId, crypto.randomUUID(), [
      ...previousBlocks,
      ...blocks,
    ]);
  }

  private async executeTool(block: ToolUseBlock): Promise<ToolResultBlock> {
    const tool = this.messageApiService.toolTable[block.name];
    if (!tool) {
      return {
        type: 'tool_result',
        tool_use_id: block.id,
        content: `Outil introuvable : ${block.name}`,
        is_error: true,
      };
    }

    try {
      return {
        type: 'tool_result',
        tool_use_id: block.id,
        content: await tool.action(block.input as Record<string, string>),
      };
    } catch (error) {
      return {
        type: 'tool_result',
        tool_use_id: block.id,
        content: error instanceof Error ? error.message : 'Erreur lors de l’exécution de l’outil',
        is_error: true,
      };
    }
  }

  private toMessageBlocks(result: MessageResult): MessageBlock[] {
    return Object.values(result.blocks).map((block) =>
      block.type === 'text' ? block : { ...block, input: this.parseToolInput(block.input) },
    );
  }

  private parseToolInput(input: string): Record<string, unknown> {
    try {
      const parsed: unknown = JSON.parse(input);
      return this.isRecord(parsed) ? parsed : {};
    } catch {
      return {};
    }
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }

  onSelectChat(id: string): void {
    const chat = this.chats().find((chat) => chat.id === id);
    if (chat) {
      this.currentChat.set(chat);
    }
  }

  onNewChat(): void {
    this.currentChat.set(createEmptyChat());
    this.prompt.set('');
  }

  onDeleteChat(id: string): void {
    this.chatService.deleteChat(id);

    if (this.currentChat().id === id) {
      this.onNewChat();
    }
  }
}
