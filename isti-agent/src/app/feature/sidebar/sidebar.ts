import { Component, inject, output } from '@angular/core';
import { ChatService } from '../../core/service/chat.service';

@Component({ selector: 'app-sidebar', styleUrl: './sidebar.less', templateUrl: './sidebar.html' })
export class SidebarComponent {
  private readonly chatService = inject(ChatService);

  selectChat = output<string>();

  onChatSelect(chatId: string) {
    this.selectChat.emit(chatId);
  }

  public chats = this.chatService.chats;
}
