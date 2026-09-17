import { Component, effect, input, signal } from '@angular/core';
import { marked } from 'marked';
import { Chat, MessageBlock } from '../../shared/model/chat.model';

interface ChatHistory {
  id: string;
  role: 'user' | 'assistant';
  blocks: RenderedBlock[];
}

type RenderedBlock = { type: 'text'; html: string } | { type: 'tool_use'; name: string };

function renderBlocks(blocks: MessageBlock[]): RenderedBlock[] {
  return blocks.flatMap<RenderedBlock>((block) => {
    if (block.type === 'text') {
      return [
        { type: 'text', html: marked.parse(block.text, { breaks: true, gfm: true }) as string },
      ];
    }

    if (block.type === 'tool_use') {
      return [{ type: 'tool_use', name: block.name }];
    }

    return [];
  });
}

@Component({
  selector: 'app-chat-messages',
  styleUrl: './chat-messages.less',
  templateUrl: './chat-messages.html',
})
export class ChatMessagesComponent {
  currentChat = input.required<Chat>({});

  history = signal<ChatHistory[]>([]);

  isSending = input.required<boolean>();

  constructor() {
    effect(() => {
      this.history.set(
        this.currentChat().history.map((m) => ({
          id: m.id,
          role: m.role,
          blocks: renderBlocks(m.blocks),
        })),
      );
    });
  }
}
