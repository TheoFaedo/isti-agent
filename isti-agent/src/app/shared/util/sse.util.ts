type TextContentBlock = {
  type: 'text';
  text: string;
};

type ToolUseContentBlock = {
  type: 'tool_use';
  id: string;
  name: string;
};

type ClaudeStreamData =
  | {
      type: 'content_block_start';
      index: number;
      content_block: TextContentBlock | ToolUseContentBlock;
    }
  | {
      type: 'content_block_delta';
      index: number;
      delta:
        { type: 'input_json_delta'; partial_json: string } | { type: 'text_delta'; text: string };
    }
  | {
      type: 'message_delta';
      delta: { stop_reason: string };
    }
  | {
      type: 'message_stop';
    };

type SseEvent<TData extends { type: string }> = {
  [TType in TData['type']]: {
    event: TType;
    data: Extract<TData, { type: TType }>;
  };
}[TData['type']];

export type ClaudeStreamEvent = SseEvent<ClaudeStreamData>;

export interface MessageResult {
  blocks: Record<number, Block>;
  finishReason: string | undefined;
  finished: boolean;
}

export interface TextBlock {
  type: 'text';
  text: string;
}

export interface ToolUseBlock {
  type: 'tool_use';
  id: string;
  name: string;
  input: string;
}

/** A content block reconstructed from Claude's SSE stream. */
export type Block = TextBlock | ToolUseBlock;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isClaudeStreamData(value: unknown): value is ClaudeStreamData {
  if (!isRecord(value) || typeof value['type'] !== 'string') {
    return false;
  }

  switch (value['type']) {
    case 'message_stop':
      return true;

    case 'message_delta':
      return isRecord(value['delta']) && typeof value['delta']['stop_reason'] === 'string';

    case 'content_block_start':
      return (
        typeof value['index'] === 'number' &&
        isRecord(value['content_block']) &&
        ((value['content_block']['type'] === 'text' &&
          typeof value['content_block']['text'] === 'string') ||
          (value['content_block']['type'] === 'tool_use' &&
            typeof value['content_block']['id'] === 'string' &&
            typeof value['content_block']['name'] === 'string'))
      );

    case 'content_block_delta':
      return (
        typeof value['index'] === 'number' &&
        isRecord(value['delta']) &&
        ((value['delta']['type'] === 'text_delta' && typeof value['delta']['text'] === 'string') ||
          (value['delta']['type'] === 'input_json_delta' &&
            typeof value['delta']['partial_json'] === 'string'))
      );

    default:
      return false;
  }
}

function createSseEvent(data: ClaudeStreamData): ClaudeStreamEvent {
  switch (data.type) {
    case 'content_block_start':
      return { event: 'content_block_start', data };
    case 'content_block_delta':
      return { event: 'content_block_delta', data };
    case 'message_delta':
      return { event: 'message_delta', data };
    case 'message_stop':
      return { event: 'message_stop', data };
  }
}

export function parseSseEvent(rawEvent: string): ClaudeStreamEvent[] {
  const eventName = rawEvent.match(/^event:\s*(.+)$/m)?.[1];
  const rawData = rawEvent.match(/^data:\s*(.+)$/m)?.[1];

  if (!eventName || !rawData) {
    return [];
  }

  try {
    const data: unknown = JSON.parse(rawData);

    if (!isClaudeStreamData(data) || data.type !== eventName) {
      return [];
    }

    return [createSseEvent(data)];
  } catch {
    return [];
  }
}

export function parseTextBlock(streamEvents: readonly ClaudeStreamEvent[]): MessageResult {
  const registry: Record<number, Block> = {};
  let finishReason: string | undefined;
  let finished: boolean = false;

  for (const event of streamEvents) {
    switch (event.event) {
      case 'message_stop':
        finished = true;
        break;

      case 'message_delta':
        finishReason = event.data.delta.stop_reason;
        break;

      case 'content_block_start': {
        const { content_block, index } = event.data;

        registry[index] =
          content_block.type === 'text'
            ? { type: 'text', text: content_block.text }
            : {
                type: 'tool_use',
                id: content_block.id,
                name: content_block.name,
                input: '',
              };
        break;
      }

      case 'content_block_delta': {
        const { delta, index } = event.data;
        const block = registry[index];

        if (block?.type === 'text' && delta.type === 'text_delta') {
          registry[index] = { ...block, text: block.text + delta.text };
        }

        if (block?.type === 'tool_use' && delta.type === 'input_json_delta') {
          registry[index] = { ...block, input: block.input + delta.partial_json };
        }
        break;
      }
    }
  }

  return {
    blocks: registry,
    finishReason: finishReason,
    finished: finished,
  };
}

/** Alias whose name reflects that text and tool-use blocks are both reconstructed. */
export const parseBlocks = parseTextBlock;
