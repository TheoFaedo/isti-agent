interface Env {
  ANTHROPIC_API_KEY: string;
  ALLOWED_ORIGIN: string;
}

const allowedMethods = 'POST, OPTIONS';

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
      const { messages } = (await request.json()) as { messages: unknown };
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
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 512,
          messages,
        }),
      });

      headers.set('Content-Type', anthropicResponse.headers.get('Content-Type') ?? 'application/json');
      return new Response(anthropicResponse.body, {
        status: anthropicResponse.status,
        headers,
      });
    } catch {
      return Response.json({ error: 'Invalid request' }, { status: 400, headers });
    }
  },
};
