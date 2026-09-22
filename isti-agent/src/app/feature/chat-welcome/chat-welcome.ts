import { Component, inject } from '@angular/core';
import { AgentService } from '../../core/service/agent.service';
@Component({ selector: 'app-chat-welcome', styleUrl: './chat-welcome.less', templateUrl: './chat-welcome.html' })
export class ChatWelcomeComponent { protected readonly agent = inject(AgentService); }
