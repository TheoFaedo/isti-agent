import { Component, input } from '@angular/core';
import { Chat } from '../../shared/model/chat.model';
@Component({
  selector: 'app-chat-header',
  styleUrl: './chat-header.less',
  templateUrl: './chat-header.html',
})
export class ChatHeaderComponent {
  currentChat = input.required<Chat>();
}
