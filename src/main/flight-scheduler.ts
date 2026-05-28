import type { NormalizedEvent } from './types';

export interface FlightSchedulerOptions {
  delayMs: number;
  onSpawn: (event: NormalizedEvent) => void;
  now?: () => number;
}

interface Scheduled {
  event: NormalizedEvent;
  timeout: ReturnType<typeof setTimeout>;
}

export class FlightScheduler {
  private readonly opts: FlightSchedulerOptions;
  private readonly now: () => number;
  private readonly scheduled = new Map<string, Scheduled>();

  constructor(opts: FlightSchedulerOptions) {
    this.opts = opts;
    this.now = opts.now ?? Date.now;
  }

  update(events: NormalizedEvent[]): void {
    const incoming = new Map(events.map((e) => [e.id, e]));

    // Remove or reschedule existing
    for (const [id, sched] of this.scheduled) {
      const next = incoming.get(id);
      if (!next || next.startMs !== sched.event.startMs) {
        clearTimeout(sched.timeout);
        this.scheduled.delete(id);
      }
    }

    // Add or re-add
    for (const e of events) {
      if (this.scheduled.has(e.id)) continue;
      this.schedule(e);
    }
  }

  private schedule(e: NormalizedEvent): void {
    const fireAt = e.startMs - this.opts.delayMs;
    const t = this.now();
    if (e.startMs <= t) return; // already started — skip
    if (fireAt <= t) {
      // Within the warning window already — fire immediately
      this.opts.onSpawn(e);
      return;
    }
    const handle = setTimeout(() => {
      this.scheduled.delete(e.id);
      this.opts.onSpawn(e);
    }, fireAt - t);
    this.scheduled.set(e.id, { event: e, timeout: handle });
  }

  dispose(): void {
    for (const { timeout } of this.scheduled.values()) clearTimeout(timeout);
    this.scheduled.clear();
  }
}
