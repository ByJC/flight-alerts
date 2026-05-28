import { createHash, randomBytes } from 'node:crypto';
import { request as httpsRequest } from 'node:https';
import type { OAuthTokens } from './types';

const SCOPE = 'https://www.googleapis.com/auth/calendar.readonly email';
const AUTH_ENDPOINT = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';

function base64url(buf: Buffer): string {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function makePkcePair(): { verifier: string; challenge: string } {
  const verifier = base64url(randomBytes(64));
  const challenge = base64url(createHash('sha256').update(verifier).digest());
  return { verifier, challenge };
}

export function buildAuthUrl(opts: {
  clientId: string;
  redirectUri: string;
  challenge: string;
  state: string;
}): string {
  const url = new URL(AUTH_ENDPOINT);
  url.searchParams.set('client_id', opts.clientId);
  url.searchParams.set('redirect_uri', opts.redirectUri);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', SCOPE);
  url.searchParams.set('code_challenge', opts.challenge);
  url.searchParams.set('code_challenge_method', 'S256');
  url.searchParams.set('state', opts.state);
  url.searchParams.set('access_type', 'offline');
  url.searchParams.set('prompt', 'consent');
  return url.toString();
}

function postToken(body: Record<string, string>): Promise<any> {
  return new Promise((resolve, reject) => {
    const payload = new URLSearchParams(body).toString();
    const url = new URL(TOKEN_ENDPOINT);

    const req = httpsRequest(
      {
        hostname: url.hostname,
        path: url.pathname,
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Content-Length': Buffer.byteLength(payload),
        },
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => chunks.push(chunk));
        res.on('end', () => {
          const text = Buffer.concat(chunks).toString('utf8');
          let json: any;
          try {
            json = JSON.parse(text);
          } catch {
            return reject(new Error(`OAuth token error: failed to parse response: ${text}`));
          }
          if ((res.statusCode ?? 0) >= 400) {
            return reject(new Error(`OAuth token error: ${JSON.stringify(json)}`));
          }
          resolve(json);
        });
        res.on('error', reject);
      },
    );

    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

export async function exchangeCodeForTokens(opts: {
  clientId: string;
  code: string;
  verifier: string;
  redirectUri: string;
}): Promise<OAuthTokens> {
  const j = await postToken({
    client_id: opts.clientId,
    code: opts.code,
    code_verifier: opts.verifier,
    grant_type: 'authorization_code',
    redirect_uri: opts.redirectUri,
  });
  return {
    accessToken: j.access_token,
    refreshToken: j.refresh_token,
    expiresAt: Date.now() + (j.expires_in - 60) * 1000,
  };
}

export async function refreshAccessToken(opts: {
  clientId: string;
  refreshToken: string;
}): Promise<OAuthTokens> {
  const j = await postToken({
    client_id: opts.clientId,
    refresh_token: opts.refreshToken,
    grant_type: 'refresh_token',
  });
  return {
    accessToken: j.access_token,
    refreshToken: opts.refreshToken,
    expiresAt: Date.now() + (j.expires_in - 60) * 1000,
  };
}
