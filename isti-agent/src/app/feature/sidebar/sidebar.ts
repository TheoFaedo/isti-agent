import { Component, inject, input, output } from '@angular/core';
import { ChatService } from '../../core/service/chat.service';

@Component({ selector: 'app-sidebar', styleUrl: './sidebar.less', templateUrl: './sidebar.html' })
export class SidebarComponent {
  private readonly chatService = inject(ChatService);

  readonly selectChat = output<string>();
  readonly deleteChat = output<string>();
  readonly newChat = output<void>();
  readonly activeChatId = input<string | null>(null);

  onNewChat(): void {
    this.newChat.emit();
  }

  onChatSelect(chatId: string | null): void {
    if (chatId) {
      this.selectChat.emit(chatId);
    }
  }

  onChatDelete(chatId: string | null): void {
    if (chatId) {
      this.deleteChat.emit(chatId);
    }
  }

  public readonly chats = this.chatService.chats;
}
