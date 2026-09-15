import { Component, computed, effect, input, linkedSignal, signal } from '@angular/core';
import { marked } from 'marked';
import { Chat, Message } from '../../shared/model/chat.model';

interface ChatHistory {
  message: Message;
  html: string | null;
}

@Component({
  selector: 'app-chat-messages',
  styleUrl: './chat-messages.less',
  templateUrl: './chat-messages.html',
})
export class ChatMessagesComponent {
  currentChat = input.required<Chat>({});
  currentChatTrackedById = computed(() => this.currentChat(), { equal: (a, b) => a.id === b.id });

  history = signal<ChatHistory[]>([]);

  isSending = input.required<boolean>();

  constructor() {
    effect(() => {
      this.history.set(
        this.currentChat().history.map((m) => ({
          message: m,
          html: marked.parse(m.content, { breaks: true, gfm: true }) as string,
        })),
      );
    });
  }
}
