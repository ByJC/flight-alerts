export type AccountStatus = 'ok' | 'needs_reauth';

export type AccountIcon =
  | { type: 'emoji'; value: string }   // e.g. '✈️', '🚀'
  | { type: 'image'; value: string };  // data URI, e.g. 'data:image/png;base64,...'

export interface AccountConfig {
  email: string;
  color: string;
  icon: AccountIcon;
  enabled: boolean;
}

export type PlaneSize = 'small' | 'medium' | 'large';

export interface Config {
  delayMinutes: number;
  dismissSeconds: number; // upper bound on how long a plane stays visible (acts as safety + future hover-pause)
  planeSize: PlaneSize;
  autostart: boolean;
  accounts: AccountConfig[];
}

export interface NormalizedEvent {
  id: string;
  accountEmail: string;
  title: string;
  startMs: number;
  endMs: number;
  htmlLink: string;
}

export interface PlaneSpawnPayload {
  eventId: string;
  title: string;
  startMs: number;
  accountEmail: string;
  color: string;
  icon: AccountIcon;
  htmlLink: string;
  lane: number;
  dismissMs: number;
  size: PlaneSize;
}

export interface OAuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
}
