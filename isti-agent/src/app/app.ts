import { Component, computed, effect, inject, signal } from '@angular/core';
import { last, tap } from 'rxjs';
import { MessageApiService } from './core/service/message-api.service';
import { ChatHeaderComponent } from './feature/chat-header/chat-header';
import { ChatMessagesComponent } from './feature/chat-messages/chat-messages';
import { ChatWelcomeComponent } from './feature/chat-welcome/chat-welcome';
import { MessageComposerComponent } from './feature/message-composer/message-composer';
import { SidebarComponent } from './feature/sidebar/sidebar';
import { Chat, Message } from './shared/model/chat.model';
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

  protected readonly response = computed(
    () => this.currentChat().history[this.currentChat().history.length - 1]?.content ?? '',
  );
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
      content: message,
    });

    this.isSending.set(true);
    const assistMessageId = crypto.randomUUID();
    this.addMessage({
      id: assistMessageId,
      role: 'assistant',
      content: '',
    });
    this.messageApiService
      .requestOnce(this.currentChat().context)
      .pipe(
        tap((messageResult) => {
          const textBlock = Object.values(messageResult.blocks).find((b) => b.type === 'text');
          if (textBlock) {
            this.updateMessage(assistMessageId, textBlock.text);
          }
        }),
        last(),
        tap((messageResult) => {
          const toolBlock = Object.values(messageResult.blocks).find((b) => b.type === 'tool_use');
          if (toolBlock) {
            const tool = this.messageApiService.toolTable[toolBlock.name];
            if (tool) {
              const input = JSON.parse(toolBlock.input);
              const result = tool.action(input);
              result.then((r) => {
                this.addToolResult(assistMessageId, r);
              });
            }
          }
          this.isSending.set(false);
        }),
      )
      .subscribe({
        error: (err) => {
          console.error(err);
          this.updateMessage(assistMessageId, 'Erreur occured: ' + err.message);
          this.isSending.set(false);
        },
      });
  }

  protected useSuggestion(suggestion: string) {
    this.prompt.set(suggestion);
  }

  private addMessage(message: Message): void {
    this.currentChat.update((chat) => ({
      ...chat,
      history: [...chat.history, message],
      context: [...chat.history, message],
      updatedAt: new Date(),
    }));
  }

  private updateMessage(id: string, chunk: string): void {
    this.currentChat.update((chat) => ({
      ...chat,
      history: chat.history.map((message) =>
        message.id === id ? { ...message, content: chunk } : message,
      ),
      context: chat.context.map((message) =>
        message.id === id ? { ...message, content: chunk } : message,
      ),
      updatedAt: new Date(),
    }));
  }

  private addToolResult(id: string, result: string): void {
    this.currentChat.update((chat) => ({
      ...chat,
      history: chat.history.map((message) =>
        message.id === id ? { ...message, content: message.content + result } : message,
      ),
      context: chat.context.map((message) =>
        message.id === id ? { ...message, content: message.content + result } : message,
      ),
      updatedAt: new Date(),
    }));
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
