import { Component, inject } from '@angular/core';
import { AgentService } from './core/service/agent.service';
import { ChatHeaderComponent } from './feature/chat-header/chat-header';
import { ChatMessagesComponent } from './feature/chat-messages/chat-messages';
import { ChatWelcomeComponent } from './feature/chat-welcome/chat-welcome';
import { MessageComposerComponent } from './feature/message-composer/message-composer';
import { SidebarComponent } from './feature/sidebar/sidebar';

@Component({
  imports: [SidebarComponent, ChatHeaderComponent, ChatWelcomeComponent, ChatMessagesComponent, MessageComposerComponent],
  selector: 'app-root',
  styleUrl: './app.less',
  templateUrl: './app.html',
})
export class App {
  protected readonly agent = inject(AgentService);
}
