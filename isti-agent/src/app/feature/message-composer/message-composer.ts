import { Component, inject } from '@angular/core';
import { form, FormField } from '@angular/forms/signals';
import { AgentService } from '../../core/service/agent.service';
import { ContextCounterComponent } from './context-counter/context-counter';

@Component({
  imports: [ContextCounterComponent, FormField],
  selector: 'app-message-composer',
  styleUrl: './message-composer.less',
  templateUrl: './message-composer.html',
})
export class MessageComposerComponent {
  protected readonly agent = inject(AgentService);
  protected readonly promptForm = form(this.agent.draft);

  protected async submit(event: SubmitEvent): Promise<void> {
    event.preventDefault();
    await this.agent.sendDraft();
  }

  protected async handleKeydown(event: KeyboardEvent): Promise<void> {
    if (event.key !== 'Enter' || event.shiftKey || event.isComposing) return;

    event.preventDefault();
    await this.agent.sendDraft();
  }

  protected canSubmit(): boolean {
    return !!this.agent.draft().trim() && !this.agent.isSubmissionBlocked();
  }
}
