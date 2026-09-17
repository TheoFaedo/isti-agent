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
  role: 'user' | 'assistant';
  blocks: MessageBlock[];
}

export type MessageBlock = TextBlock | ToolUseBlock | ToolResultBlock;

export interface TextBlock {
  type: 'text';
  text: string;
}

export interface ToolUseBlock {
  type: 'tool_use';
  id: string;
  name: string;
  input: Record<string, unknown>;
}

export interface ToolResultBlock {
  type: 'tool_result';
  tool_use_id: string;
  content: string;
  is_error?: boolean;
}
