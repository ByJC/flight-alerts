import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { FlightScheduler } from '../../src/main/flight-scheduler';
import type { NormalizedEvent } from '../../src/main/types';

const evt = (over: Partial<NormalizedEvent>): NormalizedEvent => ({
  id: 'e1', accountEmail: 'a@b.com', title: 'T', startMs: 0, endMs: 0, htmlLink: '', ...over,
});

describe('FlightScheduler', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('fires onSpawn at start - delay', () => {
    const onSpawn = vi.fn();
    const scheduler = new FlightScheduler({ delayMs: 5 * 60_000, onSpawn });
    vi.setSystemTime(0);
    scheduler.update([evt({ id: 'a', startMs: 10 * 60_000 })]);

    vi.setSystemTime(5 * 60_000 - 1);
    vi.advanceTimersByTime(5 * 60_000 - 1);
    expect(onSpawn).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(onSpawn).toHaveBeenCalledTimes(1);
    expect(onSpawn).toHaveBeenCalledWith(expect.objectContaining({ id: 'a' }));
  });

  it('fires immediately when already within the window', () => {
    const onSpawn = vi.fn();
    const scheduler = new FlightScheduler({ delayMs: 5 * 60_000, onSpawn });
    vi.setSystemTime(7 * 60_000); // 7 minutes in
    scheduler.update([evt({ id: 'a', startMs: 10 * 60_000 })]); // 3 min away, within 5-min window
    expect(onSpawn).toHaveBeenCalledTimes(1);
  });

  it('skips events that have already started', () => {
    const onSpawn = vi.fn();
    const scheduler = new FlightScheduler({ delayMs: 5 * 60_000, onSpawn });
    vi.setSystemTime(15 * 60_000);
    scheduler.update([evt({ id: 'a', startMs: 10 * 60_000 })]);
    expect(onSpawn).not.toHaveBeenCalled();
  });

  it('reschedules when startMs changes', () => {
    const onSpawn = vi.fn();
    const scheduler = new FlightScheduler({ delayMs: 5 * 60_000, onSpawn });
    vi.setSystemTime(0);
    scheduler.update([evt({ id: 'a', startMs: 10 * 60_000 })]);
    scheduler.update([evt({ id: 'a', startMs: 20 * 60_000 })]);
    vi.advanceTimersByTime(10 * 60_000);
    expect(onSpawn).not.toHaveBeenCalled(); // original was cleared
    vi.advanceTimersByTime(5 * 60_000); // now at 15min, new event fires at 20-5=15
    expect(onSpawn).toHaveBeenCalledTimes(1);
  });

  it('clears timeout when event is removed', () => {
    const onSpawn = vi.fn();
    const scheduler = new FlightScheduler({ delayMs: 5 * 60_000, onSpawn });
    vi.setSystemTime(0);
    scheduler.update([evt({ id: 'a', startMs: 10 * 60_000 })]);
    scheduler.update([]);
    vi.advanceTimersByTime(10 * 60_000);
    expect(onSpawn).not.toHaveBeenCalled();
  });

  it('does not double-schedule on identical updates', () => {
    const onSpawn = vi.fn();
    const scheduler = new FlightScheduler({ delayMs: 5 * 60_000, onSpawn });
    vi.setSystemTime(0);
    const e = evt({ id: 'a', startMs: 10 * 60_000 });
    scheduler.update([e]);
    scheduler.update([e]);
    vi.advanceTimersByTime(10 * 60_000);
    expect(onSpawn).toHaveBeenCalledTimes(1);
  });

  it('dispose() clears all pending timeouts', () => {
    const onSpawn = vi.fn();
    const scheduler = new FlightScheduler({ delayMs: 5 * 60_000, onSpawn });
    vi.setSystemTime(0);
    scheduler.update([evt({ id: 'a', startMs: 10 * 60_000 })]);
    scheduler.dispose();
    vi.advanceTimersByTime(10 * 60_000);
    expect(onSpawn).not.toHaveBeenCalled();
  });
});
