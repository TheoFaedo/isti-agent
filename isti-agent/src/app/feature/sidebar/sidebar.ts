import { Component, computed, inject } from '@angular/core';
import { AgentService } from '../../core/service/agent.service';

@Component({ selector: 'app-sidebar', styleUrl: './sidebar.less', templateUrl: './sidebar.html' })
export class SidebarComponent {
  private readonly agent = inject(AgentService);

  onNewChat(): void {
    this.agent.newChat();
  }

  onChatSelect(chatId: string | null): void {
    if (chatId) {
      this.agent.selectChat(chatId);
    }
  }

  onChatDelete(chatId: string | null): void {
    if (chatId) {
      this.agent.deleteChat(chatId);
    }
  }

  public readonly chats = this.agent.chats;
  public readonly activeChatId = computed(() => this.agent.currentChat().id);
}
