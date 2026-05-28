import { describe, it, expect, beforeEach } from 'vitest';
import { LaneAllocator } from '../../src/main/lane-allocator';

const ANIM_MS = 6000;
const MAX_LANES = 5;

describe('LaneAllocator', () => {
  let allocator: LaneAllocator;
  let now: number;

  beforeEach(() => {
    now = 1_000_000;
    allocator = new LaneAllocator({ animationMs: ANIM_MS, maxLanes: MAX_LANES, now: () => now });
  });

  it('returns lane 0 when no allocations', () => {
    expect(allocator.allocate()).toEqual({ lane: 0, delayMs: 0 });
  });

  it('returns lane 1 when lane 0 is occupied', () => {
    allocator.allocate(); // lane 0
    expect(allocator.allocate()).toEqual({ lane: 1, delayMs: 0 });
  });

  it('reuses lane 0 after its animation has finished', () => {
    allocator.allocate(); // lane 0
    now += ANIM_MS + 1;
    expect(allocator.allocate()).toEqual({ lane: 0, delayMs: 0 });
  });

  it('queues with stagger when all lanes are busy', () => {
    for (let i = 0; i < MAX_LANES; i++) allocator.allocate();
    const sixth = allocator.allocate();
    expect(sixth.lane).toBeGreaterThanOrEqual(0);
    expect(sixth.lane).toBeLessThan(MAX_LANES);
    expect(sixth.delayMs).toBeGreaterThanOrEqual(1000);
  });

  it('staggers two overflow allocations by 1s each', () => {
    for (let i = 0; i < MAX_LANES; i++) allocator.allocate();
    const a = allocator.allocate();
    const b = allocator.allocate();
    expect(b.delayMs).toBeGreaterThanOrEqual(a.delayMs + 1000);
  });

  it('release() frees a lane immediately', () => {
    const { lane } = allocator.allocate();
    allocator.release(lane);
    expect(allocator.allocate().lane).toBe(lane);
  });
});
