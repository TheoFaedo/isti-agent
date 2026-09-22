import { Component, inject } from '@angular/core';
import { AgentService } from '../../../core/service/agent.service';

@Component({
  selector: 'app-context-counter',
  styleUrl: './context-counter.less',
  templateUrl: './context-counter.html',
})
export class ContextCounterComponent {
  protected readonly agent = inject(AgentService);
  readonly isContextLimitReached = this.agent.isContextLimitReached;
  readonly isSubmissionBlocked = this.agent.isSubmissionBlocked;
  protected readonly compactionState = this.agent.compactionState;
  protected readonly tokenCountState = this.agent.tokenCountState;
  protected readonly percentage = this.agent.percentage;
  protected readonly canRequestCompaction = this.agent.canRequestCompaction;

  protected requestCompaction(): void {
    this.agent.requestCompaction();
  }
}
