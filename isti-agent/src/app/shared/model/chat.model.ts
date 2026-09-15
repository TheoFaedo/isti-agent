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
  content: string;
  role: 'user' | 'assistant';
}
