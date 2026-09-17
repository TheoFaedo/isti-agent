export type Chat =
  | {
      id: string;
      name: string;
      history: Message[];
      context: Message[];
      updatedAt: Date;
      createdAt: Date;
      saved: true;
    }
  | {
      id: null;
      name: string;
      history: Message[];
      context: Message[];
      updatedAt: Date;
      createdAt: Date;
      saved: false;
    };

export interface Message {
  id: string;
  content: string;
  role: 'user' | 'assistant';
}
