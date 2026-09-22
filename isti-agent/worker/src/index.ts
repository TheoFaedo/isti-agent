interface Env {
  ANTHROPIC_API_KEY: string;
  TYPESAFE_API_KEY: string;
  ALLOWED_ORIGIN: string;
}

const allowedMethods = 'POST, OPTIONS';
const model = {
  id: 'claude-haiku-4-5-20251001',
  contextWindow: 200_000,
} as const;
const jevModel = 'jev-1.13.0';
const preservedRecentMessages = 6;
const safeToDiscardThreshold = 0.7;
const maxJevStateCharacters = 72_000;
const maximumJevQuestionsPerRequest = 25;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function corsHeaders(request: Request, env: Env): Headers {
  const headers = new Headers({
    'Access-Control-Allow-Methods': allowedMethods,
    'Access-Control-Allow-Headers': 'Content-Type',
    Vary: 'Origin',
  });

  if (request.headers.get('Origin') === env.ALLOWED_ORIGIN) {
    headers.set('Access-Control-Allow-Origin', env.ALLOWED_ORIGIN);
  }

  return headers;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const headers = corsHeaders(request, env);

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers });
    }

    if (request.method !== 'POST') {
      return new Response('Method not allowed', { status: 405, headers });
    }

    try {
      const pathname = new URL(request.url).pathname;
      if (pathname === '/compact') {
        return await compactContext(request, env, headers);
      }
      if (pathname === '/tokens') {
        return await countTokens(request, env, headers);
      }

      const { messages, tools, system } = (await request.json()) as {
        messages: unknown;
        tools: unknown;
        system: unknown;
      };
      if (!Array.isArray(messages)) {
        return Response.json({ error: 'Invalid request' }, { status: 400, headers });
      }

      const anthropicResponse = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-api-key': env.ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          stream: true,
          model: model.id,
          max_tokens: 512,
          messages,
          tools,
          system,
        }),
      });

      if (!anthropicResponse.ok) {
        return new Response(anthropicResponse.body, {
          status: anthropicResponse.status,
          headers,
        });
      }

      headers.set(
        'Content-Type',
        anthropicResponse.headers.get('Content-Type') ?? 'application/json',
      );
      return new Response(anthropicResponse.body, {
        status: anthropicResponse.status,
        headers,
      });
    } catch {
      return Response.json({ error: 'Invalid request' }, { status: 400, headers });
    }
  },
};

async function countTokens(request: Request, env: Env, headers: Headers): Promise<Response> {
  const body: unknown = await request.json();
  if (!isRecord(body) || !Array.isArray(body.messages)) {
    return Response.json({ error: 'Invalid request' }, { status: 400, headers });
  }

  const anthropicResponse = await fetch('https://api.anthropic.com/v1/messages/count_tokens', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: model.id,
      messages: body.messages,
      tools: body.tools,
      system: body.system,
    }),
  });

  if (!anthropicResponse.ok) {
    return new Response(anthropicResponse.body, { status: anthropicResponse.status, headers });
  }

  const response: unknown = await anthropicResponse.json();
  if (!isRecord(response) || typeof response.input_tokens !== 'number') {
    return Response.json({ error: 'Invalid response' }, { status: 502, headers });
  }

  return Response.json(
    { inputTokens: response.input_tokens, contextWindow: model.contextWindow },
    { headers },
  );
}

async function compactContext(request: Request, env: Env, headers: Headers): Promise<Response> {
  const body: unknown = await request.json();
  if (!isRecord(body) || !Array.isArray(body.messages)) {
    return Response.json({ error: 'Invalid request' }, { status: 400, headers });
  }

  const messages = body.messages.filter(
    (message): message is Record<string, unknown> =>
      isRecord(message) && typeof message.id === 'string',
  );
  if (messages.length === 0) {
    return Response.json({ discardedMessageIds: [] }, { headers });
  }

  // Never remove the opening request or recent turns: Jev only evaluates older context.
  const candidates = messages.slice(1, -preservedRecentMessages);
  if (candidates.length === 0) {
    return Response.json({ discardedMessageIds: [] }, { headers });
  }

  const stateMessages = fitMessagesForJev(messages);
  const stateMessageIds = new Set(stateMessages.map((message) => message.id));
  const eligibleCandidates = candidates.filter((message) => stateMessageIds.has(message.id));
  const answers: Record<string, unknown> = {};

  for (let start = 0; start < eligibleCandidates.length; start += maximumJevQuestionsPerRequest) {
    const questions = Object.fromEntries(
      eligibleCandidates.slice(start, start + maximumJevQuestionsPerRequest).map((message) => [
        `discard_${message.id}`,
        {
          type: 'noul',
          instructions:
            `Is message ${message.id} safe to remove from the active conversation? ` +
            'Keep it if it could be needed to complete the current task.',
          criteria: {
            true: 'It is safely obsolete or redundant.',
            false: 'It may still matter and must be kept.',
          },
        },
      ]),
    );
    const jevResponse = await fetch('https://api.typesafe.ai/v1/systemone', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${env.TYPESAFE_API_KEY}`,
      },
      body: JSON.stringify({
        model: jevModel,
        state: {
          goal: 'Compact conservatively; preserve requests, constraints, decisions, findings, tool results, and errors.',
          messages: stateMessages,
        },
        questions,
      }),
    });

    if (!jevResponse.ok) {
      return new Response(jevResponse.body, { status: jevResponse.status, headers });
    }

    const response: unknown = await jevResponse.json();
    if (!isRecord(response) || !isRecord(response.answers)) {
      return Response.json({ error: 'Invalid Jev response' }, { status: 502, headers });
    }
    Object.assign(answers, response.answers);
  }

  const discardedMessageIds = extractDiscardedMessageIds(answers, eligibleCandidates);
  return Response.json({ discardedMessageIds }, { headers });
}

function fitMessagesForJev(messages: Record<string, unknown>[]): Record<string, unknown>[] {
  const fitted: Record<string, unknown>[] = [];
  for (const message of [...messages].reverse()) {
    const preview = previewMessageForJev(message);
    if (JSON.stringify([preview, ...fitted]).length > maxJevStateCharacters) {
      continue;
    }
    fitted.unshift(preview);
  }
  return fitted;
}

function previewMessageForJev(message: Record<string, unknown>): Record<string, unknown> {
  return {
    id: message.id,
    role: message.role,
    blocks: Array.isArray(message.blocks)
      ? message.blocks.map((block) => previewBlockForJev(block))
      : [],
  };
}

function previewBlockForJev(block: unknown): unknown {
  if (!isRecord(block)) {
    return block;
  }
  if (typeof block.text === 'string') {
    return { ...block, text: shortenForJev(block.text) };
  }
  if (typeof block.content === 'string') {
    return { ...block, content: shortenForJev(block.content) };
  }
  return block;
}

function shortenForJev(value: string): string {
  const maximumCharacters = 1_200;
  if (value.length <= maximumCharacters) {
    return value;
  }
  return `${value.slice(0, 800)}\n[… ${value.length - maximumCharacters} characters omitted …]\n${value.slice(-400)}`;
}

function extractDiscardedMessageIds(
  answers: Record<string, unknown>,
  candidates: Record<string, unknown>[],
): string[] {
  return candidates.flatMap((message) => {
    const id = message.id;
    const answer = typeof id === 'string' ? answers[`discard_${id}`] : undefined;
    return isRecord(answer) &&
      typeof answer.noul === 'number' &&
      answer.noul >= safeToDiscardThreshold
      ? [id]
      : [];
  });
}
