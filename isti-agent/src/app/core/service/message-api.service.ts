import { DOCUMENT } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Service, inject } from '@angular/core';
import { map, Observable } from 'rxjs';
import { Message } from '../../shared/model/chat.model';

export interface ClaudeResponse {
  content: {
    type: string;
    text: string;
  }[];
}

@Service()
export class MessageApiService {
  private readonly httpClient = inject(HttpClient);
  private readonly document = inject(DOCUMENT);
  private readonly workerUrl =
    this.document.location.hostname === 'localhost'
      ? 'http://localhost:8787'
      : 'https://isti-agent.theo-faedo.workers.dev';

  public requestOnce(messages: Message[]): Observable<string> {
    return this.httpClient
      .post<ClaudeResponse>(
        this.workerUrl,
        { messages },
        {
          headers: {
            'content-type': 'application/json',
          },
        },
      )
      .pipe(
        map((resp) =>
          resp.content
            .filter((b) => b.type === 'text')
            .map((b) => b.text)
            .join('\n\n'),
        ),
      );
  }
}
