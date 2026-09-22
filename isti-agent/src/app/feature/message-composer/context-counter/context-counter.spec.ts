import { computed, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { AgentService } from '../../../core/service/agent.service';
import { ContextCounterComponent } from './context-counter';

describe('ContextCounterComponent', () => {
  it('delegates compaction to the agent facade', async () => {
    const requestCompaction = vi.fn();
    await TestBed.configureTestingModule({
      imports: [ContextCounterComponent],
      providers: [{ provide: AgentService, useValue: { isContextLimitReached: computed(() => false), isSubmissionBlocked: computed(() => false), compactionState: signal({ isCompacting: false, status: '' }), tokenCountState: signal({ inputTokens: 0, contextWindow: 200_000, isCounting: false, error: '' }), percentage: computed(() => 0), canRequestCompaction: computed(() => true), requestCompaction } }],
    }).compileComponents();
    const fixture = TestBed.createComponent(ContextCounterComponent);
    fixture.detectChanges();
    (fixture.componentInstance as any).requestCompaction();
    expect(requestCompaction).toHaveBeenCalledOnce();
  });
});
