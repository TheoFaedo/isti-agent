import { Component, computed, effect, inject, signal } from '@angular/core';
import { finalize, tap } from 'rxjs';
import { MessageApiService } from './core/service/message-api.service';
import { ChatHeaderComponent } from './feature/chat-header/chat-header';
import { ChatMessagesComponent } from './feature/chat-messages/chat-messages';
import { ChatWelcomeComponent } from './feature/chat-welcome/chat-welcome';
import { MessageComposerComponent } from './feature/message-composer/message-composer';
import { SidebarComponent } from './feature/sidebar/sidebar';
import { Chat, Message } from './shared/model/chat.model';
import { ChatService } from './core/service/chat.service';

const defaultChat: Chat = {
  id: null,
  name: 'New chat',
  history: [],
  context: [],
  updatedAt: new Date(),
  createdAt: new Date(),
  saved: false,
};

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

  private chats = this.chatService.chats();

  protected readonly prompt = signal<string>('');
  protected readonly isSending = signal(false);

  protected readonly currentChat = signal<Chat>(defaultChat);

  protected readonly response = computed(
    () => this.currentChat().history[this.currentChat().history.length - 1]?.content ?? '',
  );
  protected readonly hasResponse = computed(() => this.response().length > 0);

  protected send() {
    const message = this.prompt().trim();
    if (!message || this.isSending()) {
      return;
    }

    if (!this.currentChat().saved) {
      const chat = this.chatService.createNewChat(message);
      this.currentChat.set(chat);
    }

    console.log('currentChat', this.currentChat());

    this.addMessage({
      role: 'user',
      content: message,
    });

    console.log(this.currentChat());

    this.isSending.set(true);
    this.messageApiService
      .requestOnce(this.currentChat().context)
      .pipe(
        tap((r) =>
          this.addMessage({
            role: 'assistant',
            content: r,
          }),
        ),
        finalize(() => this.isSending.set(false)),
      )
      .subscribe({
        next: (r) => {
          this.chatService.updateChat(this.currentChat());
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

  onSelectChat(id: string) {
    const chat = this.chats.find((chat) => chat.id === id);
    if (chat) {
      this.currentChat.set(chat);
    }
  }
}
