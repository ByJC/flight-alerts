import https from 'node:https';
import type { NormalizedEvent } from './types';
import { normalizeEvents, type RawEvent } from './calendar-normalize';

export interface FetchOptions {
  backoffBaseMs?: number; // default 1000
  windowHours?: number;   // default 24
}

const CALENDAR_API_HOST = 'www.googleapis.com';
const CALENDAR_API_PATH = '/calendar/v3/calendars/primary/events';
const RETRYABLE_STATUSES = new Set([429, 500, 502, 503, 504]);
const MAX_ATTEMPTS = 5;
const MAX_BACKOFF_MS = 60_000;

function httpsGet(
  url: URL,
  headers: Record<string, string>,
): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname: url.hostname,
        path: url.pathname + url.search,
        method: 'GET',
        headers,
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (c: Buffer) => chunks.push(c));
        res.on('end', () =>
          resolve({
            status: res.statusCode ?? 0,
            body: Buffer.concat(chunks).toString('utf8'),
          }),
        );
        res.on('error', reject);
      },
    );
    req.on('error', reject);
    req.end();
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function fetchAccountEvents(
  email: string,
  accessToken: string,
  opts?: FetchOptions,
): Promise<NormalizedEvent[]> {
  const backoffBaseMs = opts?.backoffBaseMs ?? 1000;
  const windowHours = opts?.windowHours ?? 24;

  const now = new Date();
  const later = new Date(now.getTime() + windowHours * 60 * 60 * 1000);

  const url = new URL(`https://${CALENDAR_API_HOST}${CALENDAR_API_PATH}`);
  url.searchParams.set('timeMin', now.toISOString());
  url.searchParams.set('timeMax', later.toISOString());
  url.searchParams.set('singleEvents', 'true');
  url.searchParams.set('orderBy', 'startTime');
  url.searchParams.set('maxResults', '250');

  const headers = { Authorization: `Bearer ${accessToken}` };

  let lastStatus = 0;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const { status, body } = await httpsGet(url, headers);
    lastStatus = status;

    if (status === 200) {
      let json: { items?: RawEvent[] };
      try {
        json = JSON.parse(body) as { items?: RawEvent[] };
      } catch {
        throw new Error(`Calendar API: failed to parse response body`);
      }
      return normalizeEvents(email, json.items ?? []);
    }

    if (!RETRYABLE_STATUSES.has(status)) {
      // Non-retryable — throw immediately with status in the message.
      throw new Error(`Calendar API: non-retryable error ${status}`);
    }

    // Retryable: backoff before next attempt (no sleep after the last one).
    if (attempt < MAX_ATTEMPTS - 1) {
      const delayMs = Math.min(backoffBaseMs * Math.pow(2, attempt), MAX_BACKOFF_MS);
      await sleep(delayMs);
    }
  }

  throw new Error(`Calendar API: request failed after ${MAX_ATTEMPTS} attempts, last status ${lastStatus}`);
}
