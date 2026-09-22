import { DOCUMENT } from '@angular/common';
import { Service, inject } from '@angular/core';
import { filter, map, Observable, tap } from 'rxjs';
import { Message } from '../../shared/model/chat.model';
import { HttpClient, HttpEventType } from '@angular/common/http';
import {
  ClaudeStreamEvent,
  MessageResult,
  parseBlocks,
  parseSseEvent,
} from '../../shared/util/sse.util';
import { Tool } from '../../shared/model/tool.model';
import { TOOLS } from '../../shared/util/tool.util';

interface StreamEvent {
  loaded: number;
  partialText: string;
  total: number | undefined;
  type: HttpEventType.DownloadProgress;
}

interface StreamResponse {
  body: string;
  ok: boolean;
  type: HttpEventType.Response;
}

interface CompactContextResponse {
  discardedMessageIds: unknown;
}

export interface TokenCount {
  contextWindow: number;
  inputTokens: number;
}

@Service()
export class MessageApiService {
  private readonly document = inject(DOCUMENT);
  private readonly httpClient = inject(HttpClient);
  private readonly workerUrl =
    this.document.location.hostname === 'localhost'
      ? 'http://localhost:8787'
      : 'https://isti-agent.theo-faedo.workers.dev';

  private readonly systemPrompts = [
    {
      text: "Tu ne dois utiliser les tools que si c'est explicitement demandé",
      type: 'text',
    },
    {
      text: 'La date du jour est ' + new Date().toLocaleDateString(),
      type: 'text',
    },
  ];

  public toolTable: Record<string, Tool> = TOOLS.reduce(
    (acc, tool) => {
      acc[tool.definition.name] = tool;
      return acc;
    },
    {} as Record<string, Tool>,
  );

  public requestOnce(messages: Message[]): Observable<MessageResult> {
    return this.httpClient
      .post<StreamEvent | StreamResponse>(
        this.workerUrl,
        this.createConversationPayload(messages),
        { observe: 'events', responseType: 'text', reportDownloadProgress: true },
      )
      .pipe(
        filter(
          (event) =>
            event.type === HttpEventType.DownloadProgress || event.type === HttpEventType.Response,
        ),
        map((event) =>
          event.type === HttpEventType.DownloadProgress ? event.partialText : event.body,
        ),
        map((payload: string) => payload.split('\n\n')),
        map((rawEvents: string[]) =>
          rawEvents.reduce(
            (acc: ClaudeStreamEvent[], event) => acc.concat(parseSseEvent(event)),
            [],
          ),
        ),
        map((events: ClaudeStreamEvent[]) => parseBlocks(events)),
      );
  }

  public countTokens(messages: Message[]): Observable<TokenCount> {
    return this.httpClient.post<TokenCount>(
      this.workerUrl + '/tokens',
      this.createConversationPayload(messages),
    );
  }

  public compactContext(messages: Message[]): Observable<string[]> {
    return this.httpClient
      .post<CompactContextResponse>(this.workerUrl + '/compact', {
        messages: messages.map(({ id, role, blocks }) => ({ id, role, blocks })),
      })
      .pipe(map((response) => this.getDiscardedMessageIds(response)));
  }

  private getDiscardedMessageIds({ discardedMessageIds }: CompactContextResponse): string[] {
    if (!Array.isArray(discardedMessageIds)) {
      return [];
    }

    return discardedMessageIds.filter((id): id is string => typeof id === 'string');
  }

  private createConversationPayload(messages: Message[]) {
    return {
      messages: messages.map(({ role, blocks }) => ({ role, content: blocks })),
      tools: TOOLS.map((tool) => tool.definition),
      system: this.systemPrompts,
    };
  }
}
