export type AccountStatus = 'ok' | 'needs_reauth';

export interface AccountConfig {
  email: string;
  color: string;
  enabled: boolean;
}

export interface Config {
  delayMinutes: number;
  dismissSeconds: number; // upper bound on how long a plane stays visible (acts as safety + future hover-pause)
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
  htmlLink: string;
  lane: number;
  dismissMs: number;
}

export interface OAuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
}
