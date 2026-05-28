import { describe, it, expect } from 'vitest';
import { normalizeEvents } from '../../src/main/calendar-normalize';

const ACCT = 'me@example.com';

describe('normalizeEvents', () => {
  it('drops all-day events (start.date present)', () => {
    const out = normalizeEvents(ACCT, [
      { id: '1', summary: 'Birthday', start: { date: '2026-05-28' }, end: { date: '2026-05-29' }, htmlLink: 'x' },
    ]);
    expect(out).toEqual([]);
  });

  it('normalizes a timed event', () => {
    const out = normalizeEvents(ACCT, [
      {
        id: '1',
        summary: 'Standup',
        start: { dateTime: '2026-05-28T14:00:00+02:00' },
        end:   { dateTime: '2026-05-28T14:15:00+02:00' },
        htmlLink: 'https://calendar.google.com/event?eid=abc',
      },
    ]);
    expect(out).toHaveLength(1);
    expect(out[0]).toEqual({
      id: '1',
      accountEmail: ACCT,
      title: 'Standup',
      startMs: new Date('2026-05-28T14:00:00+02:00').getTime(),
      endMs:   new Date('2026-05-28T14:15:00+02:00').getTime(),
      htmlLink: 'https://calendar.google.com/event?eid=abc',
    });
  });

  it('uses "(no title)" when summary is missing', () => {
    const out = normalizeEvents(ACCT, [
      { id: '1', start: { dateTime: '2026-05-28T14:00:00Z' }, end: { dateTime: '2026-05-28T14:15:00Z' }, htmlLink: 'x' },
    ]);
    expect(out[0]?.title).toBe('(no title)');
  });

  it('skips events with no id', () => {
    const out = normalizeEvents(ACCT, [
      { summary: 'X', start: { dateTime: '2026-05-28T14:00:00Z' }, end: { dateTime: '2026-05-28T14:15:00Z' }, htmlLink: 'x' } as any,
    ]);
    expect(out).toEqual([]);
  });

  it('keeps declined and tentative events (responseStatus ignored at this layer)', () => {
    const out = normalizeEvents(ACCT, [
      {
        id: '1',
        summary: 'Optional',
        start: { dateTime: '2026-05-28T14:00:00Z' },
        end:   { dateTime: '2026-05-28T14:15:00Z' },
        htmlLink: 'x',
        attendees: [{ email: ACCT, self: true, responseStatus: 'declined' }],
      },
    ]);
    expect(out).toHaveLength(1);
  });
});
