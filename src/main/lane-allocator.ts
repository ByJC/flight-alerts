export interface LaneAllocatorOptions {
  animationMs: number;
  maxLanes: number;
  now?: () => number;
}

export interface LaneAllocation {
  lane: number;
  delayMs: number;
}

export class LaneAllocator {
  private occupiedUntil: number[] = []; // ms since epoch
  private overflowQueueEndAt = 0;
  private readonly animationMs: number;
  private readonly maxLanes: number;
  private readonly now: () => number;

  constructor(opts: LaneAllocatorOptions) {
    this.animationMs = opts.animationMs;
    this.maxLanes = opts.maxLanes;
    this.now = opts.now ?? Date.now;
  }

  allocate(): LaneAllocation {
    const t = this.now();
    for (let i = 0; i < this.maxLanes; i++) {
      const until = this.occupiedUntil[i] ?? 0;
      if (until <= t) {
        this.occupiedUntil[i] = t + this.animationMs;
        return { lane: i, delayMs: 0 };
      }
    }
    // All lanes busy — pick lane 0 with a stagger
    const baseDelay = Math.max(1000, this.overflowQueueEndAt - t + 1000);
    const startAt = t + baseDelay;
    this.overflowQueueEndAt = startAt;
    this.occupiedUntil[0] = startAt + this.animationMs;
    return { lane: 0, delayMs: baseDelay };
  }

  release(lane: number): void {
    if (lane >= 0 && lane < this.maxLanes) {
      this.occupiedUntil[lane] = 0;
    }
  }
}
