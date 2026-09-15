import { effect, Service, signal } from '@angular/core';
import { Chat, Message } from '../../shared/model/chat.model';

@Service()
export class ChatService {
  private readonly _chats = signal<Chat[]>([]);
  public chats = this._chats.asReadonly();

  constructor() {
    this._chats.set(this.loadChats());

    effect(() => {
      this.saveChats(this._chats());
    });
  }

  public createNewChat(message: string): Chat {
    const chat: Chat = {
      id: crypto.randomUUID(),
      name: message.slice(0, 20),
      history: [],
      context: [],
      updatedAt: new Date(),
      createdAt: new Date(),
      saved: true,
    };
    this._chats.update((chats) => [...chats, chat]);
    return chat;
  }

  public deleteChat(chatId: string): void {
    this._chats.update((chats) => chats.filter((chat) => chat.id !== chatId));
  }

  public updateChat(chat: Chat): void {
    this._chats.update((chats) => chats.map((c) => (c.id === chat.id ? chat : c)));
  }

  private saveChats(chats: Chat[]): void {
    localStorage.setItem('chats', JSON.stringify(chats));
  }

  private loadChats(): Chat[] {
    const chats = localStorage.getItem('chats');
    return chats ? JSON.parse(chats) : [];
  }
}
