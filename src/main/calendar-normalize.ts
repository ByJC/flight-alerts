import type { NormalizedEvent } from './types';

// Minimal subset of the Google Calendar Event shape we care about.
export interface RawEventAttendee {
  email?: string;
  self?: boolean;
  responseStatus?: string;
}

export interface RawEvent {
  id?: string;
  summary?: string;
  start?: { dateTime?: string; date?: string };
  end?:   { dateTime?: string; date?: string };
  htmlLink?: string;
  attendees?: RawEventAttendee[];
}

export function normalizeEvents(accountEmail: string, raw: RawEvent[]): NormalizedEvent[] {
  const out: NormalizedEvent[] = [];
  for (const e of raw) {
    if (!e.id) continue;
    const startIso = e.start?.dateTime;
    const endIso   = e.end?.dateTime;
    if (!startIso || !endIso) continue; // skip all-day or malformed
    const startMs = Date.parse(startIso);
    const endMs   = Date.parse(endIso);
    if (Number.isNaN(startMs) || Number.isNaN(endMs)) continue;
    out.push({
      id: e.id,
      accountEmail,
      title: e.summary ?? '(no title)',
      startMs,
      endMs,
      htmlLink: e.htmlLink ?? '',
    });
  }
  return out;
}
