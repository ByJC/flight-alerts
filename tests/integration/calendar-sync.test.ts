import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import nock from 'nock';
import { fetchAccountEvents } from '../../src/main/calendar-sync';

beforeEach(() => { nock.disableNetConnect(); });
afterEach(() => { nock.cleanAll(); nock.enableNetConnect(); vi.useRealTimers(); });

describe('fetchAccountEvents', () => {
  it('returns normalized events on 200', async () => {
    nock('https://www.googleapis.com')
      .get('/calendar/v3/calendars/primary/events')
      .query(true)
      .reply(200, {
        items: [
          { id: '1', summary: 'A', start: { dateTime: '2026-05-28T14:00:00Z' }, end: { dateTime: '2026-05-28T14:15:00Z' }, htmlLink: 'h1' },
          { id: '2', summary: 'B', start: { date: '2026-05-28' }, end: { date: '2026-05-29' }, htmlLink: 'h2' },
        ],
      });
    const out = await fetchAccountEvents('me@x.com', 'tok', { backoffBaseMs: 1 });
    expect(out).toHaveLength(1);
    expect(out[0]?.id).toBe('1');
  });

  it('retries on 429 then succeeds', async () => {
    nock('https://www.googleapis.com')
      .get('/calendar/v3/calendars/primary/events').query(true).reply(429)
      .get('/calendar/v3/calendars/primary/events').query(true).reply(200, { items: [] });
    const out = await fetchAccountEvents('me@x.com', 'tok', { backoffBaseMs: 1 });
    expect(out).toEqual([]);
  });

  it('retries on 500 up to 5 times then throws', async () => {
    for (let i = 0; i < 5; i++) {
      nock('https://www.googleapis.com').get('/calendar/v3/calendars/primary/events').query(true).reply(500);
    }
    await expect(fetchAccountEvents('me@x.com', 'tok', { backoffBaseMs: 1 })).rejects.toThrow();
  });

  it('does not retry on 401 (auth issue)', async () => {
    nock('https://www.googleapis.com').get('/calendar/v3/calendars/primary/events').query(true).reply(401);
    await expect(fetchAccountEvents('me@x.com', 'tok', { backoffBaseMs: 1 })).rejects.toThrow(/401/);
  });
});
