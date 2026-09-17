export type SseEventMap = Record<string, unknown>;

export type SseEvent<TMap extends SseEventMap> = {
  [TEvent in keyof TMap & string]: {
    event: TEvent;
    data: TMap[TEvent];
  };
}[keyof TMap & string];

// export type ClaudeStreamEventType =
//   | 'message_start'
//   | 'content_block_start'
//   | 'content_block_delta'
//   | 'content_block_stop'
//   | 'message_delta'
//   | 'message_stop'
//   | 'ping'
//   | 'error';

export type ClaudeStreamEventMap = {
  content_block_start: ClaudeStreamToolUseEvent | ClaudeStreamTextEvent;
  content_block_delta: ClaudeStreamInputDeltaEvent | ClaudeStreamTextDeltaEvent;
  message_delta: ClaudeStreamDeltaEvent;
  message_stop: {};
};

export type ClaudeStreamEvent = SseEvent<ClaudeStreamEventMap>;

export type ClaudeStreamTextEvent = {
  content_block: {
    type: 'text';
    text: string;
  };
  type: 'content_block_start';
  index: number;
};

export type ClaudeStreamToolUseEvent = {
  content_block: {
    type: 'tool_use';
    name: string;
  };
  type: 'content_block_start';
  index: number;
};

export type ClaudeStreamInputDeltaEvent = {
  delta: {
    type: 'input_json_delta';
    partial_json: string;
  };
  type: 'content_block_delta';
  index: number;
};

export type ClaudeStreamTextDeltaEvent = {
  delta: {
    type: 'text_delta';
    text: string;
  };
  type: 'content_block_delta';
  index: number;
};

export type ClaudeStreamDeltaEvent = {
  delta: {
    stop_reason: string;
    type: 'message_delta';
  };
  index: number;
  type: 'message_delta';
};

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
  name: string;
  input: string;
}

/** A content block reconstructed from Claude's SSE stream. */
export type Block = TextBlock | ToolUseBlock;

export function parseSseEvent(rawEvent: string): ClaudeStreamEvent[] {
  const event = rawEvent.match(/^event:\s*(.+)$/m)?.[1];
  const rawData = rawEvent.match(/^data:\s*(.+)$/m)?.[1];

  if (!event || !rawData) {
    return [];
  }

  try {
    const data: unknown = JSON.parse(rawData);

    return [
      {
        event: event as ClaudeStreamEvent['event'],
        data,
      } as ClaudeStreamEvent,
    ];
  } catch (ignored) {
    return [];
  }
}

export function parseTextBlock(streamEvents: readonly ClaudeStreamEvent[]): MessageResult {
  const registry: Record<number, Block> = {};
  let finishReason: string | undefined;
  let finished: boolean = false;

  for (const event of streamEvents) {
    if (event.event === 'message_stop') {
      finished = true;
      continue;
    }

    if (event.event === 'content_block_start') {
      const { content_block: block, index } = event.data;

      registry[index] =
        block.type === 'text'
          ? { type: 'text', text: block.text }
          : { type: 'tool_use', name: block.name, input: '' };
      continue;
    }

    const { delta, index } = event.data;
    const block = registry[index];

    if (event.event === 'message_delta') {
      finishReason = event.data.delta.stop_reason;
    }

    if (!block) {
      continue;
    }

    if (event.event === 'content_block_delta') {
      if (block.type === 'text' && delta?.type === 'text_delta') {
        registry[index] = { ...block, text: block.text + delta.text };
      } else if (block.type === 'tool_use' && delta?.type === 'input_json_delta') {
        registry[index] = { ...block, input: block.input + delta.partial_json };
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
