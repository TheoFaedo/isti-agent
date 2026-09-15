import { Component, input, model, output } from '@angular/core';
import { form, FormField } from '@angular/forms/signals';

@Component({ imports: [FormField], selector: 'app-message-composer', styleUrl: './message-composer.less', templateUrl: './message-composer.html' })
export class MessageComposerComponent {
  readonly prompt = model<string>('');
  readonly isSending = input.required<boolean>();
  readonly submitted = output<void>();
  protected readonly promptForm = form(this.prompt);

  protected submit(event: SubmitEvent) {
    event.preventDefault();
    if (this.prompt().trim() && !this.isSending()) {
      this.submitted.emit();
    }
  }
}
