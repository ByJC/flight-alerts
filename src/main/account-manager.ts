import { createServer, type Server } from 'node:http';
import { shell } from 'electron';
import { logger } from './logger';
import { buildAuthUrl, exchangeCodeForTokens, makePkcePair, refreshAccessToken } from './google-oauth';
import { loadTokens, saveTokens, deleteTokens } from './keychain';
import type { OAuthTokens } from './types';

export interface AddAccountResult {
  email: string;
}

export class AccountManager {
  constructor(
    private readonly clientId: string,
    private readonly clientSecret: string,
  ) {}

  async addAccount(): Promise<AddAccountResult> {
    const { verifier, challenge } = makePkcePair();
    const state = makePkcePair().verifier.slice(0, 16);

    const { server, port, codePromise } = await this.startLoopbackServer(state);
    const redirectUri = `http://127.0.0.1:${port}/callback`;

    const authUrl = buildAuthUrl({ clientId: this.clientId, redirectUri, challenge, state });
    await shell.openExternal(authUrl);

    try {
      const code = await codePromise;
      const tokens = await exchangeCodeForTokens({
        clientId: this.clientId,
        clientSecret: this.clientSecret,
        code,
        verifier,
        redirectUri,
      });
      const email = await this.fetchEmail(tokens.accessToken);
      await saveTokens(email, tokens);
      return { email };
    } finally {
      server.close();
    }
  }

  async removeAccount(email: string): Promise<void> {
    const tokens = await loadTokens(email);
    if (tokens?.refreshToken) {
      try {
        await fetch(`https://oauth2.googleapis.com/revoke?token=${tokens.refreshToken}`, { method: 'POST' });
      } catch (e) { logger.warn(`revoke failed for ${email}`, e); }
    }
    await deleteTokens(email);
  }

  async getAccessToken(email: string): Promise<string> {
    const tokens = await loadTokens(email);
    if (!tokens) throw new Error(`No tokens for ${email}`);
    if (tokens.expiresAt > Date.now()) return tokens.accessToken;
    const fresh = await refreshAccessToken({
      clientId: this.clientId,
      clientSecret: this.clientSecret,
      refreshToken: tokens.refreshToken,
    });
    await saveTokens(email, fresh);
    return fresh.accessToken;
  }

  private async fetchEmail(accessToken: string): Promise<string> {
    const r = await fetch('https://openidconnect.googleapis.com/v1/userinfo', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!r.ok) throw new Error('userinfo failed');
    const j = await r.json() as { email: string };
    return j.email;
  }

  private async startLoopbackServer(expectedState: string): Promise<{
    server: Server; port: number; codePromise: Promise<string>;
  }> {
    return new Promise((resolveStart, rejectStart) => {
      let resolveCode!: (v: string) => void;
      let rejectCode!: (e: Error) => void;
      const codePromise = new Promise<string>((res, rej) => { resolveCode = res; rejectCode = rej; });

      const server = createServer((req, res) => {
        if (!req.url) return;
        const url = new URL(req.url, 'http://127.0.0.1');
        if (url.pathname !== '/callback') { res.writeHead(404); res.end(); return; }
        const code = url.searchParams.get('code');
        const state = url.searchParams.get('state');
        const error = url.searchParams.get('error');
        res.writeHead(200, { 'Content-Type': 'text/html' });
        if (error) {
          res.end('<h1>Authorization denied.</h1><p>You can close this window.</p>');
          rejectCode(new Error(`oauth error: ${error}`));
          return;
        }
        if (!code || state !== expectedState) {
          res.end('<h1>Invalid callback.</h1><p>You can close this window.</p>');
          rejectCode(new Error('invalid callback'));
          return;
        }
        res.end('<h1>You can close this window.</h1>');
        resolveCode(code);
      });

      server.listen(0, '127.0.0.1', () => {
        const addr = server.address();
        if (!addr || typeof addr === 'string') { rejectStart(new Error('bad addr')); return; }
        resolveStart({ server, port: addr.port, codePromise });
      });

      // 5-minute timeout
      const t = setTimeout(() => rejectCode(new Error('oauth timeout')), 5 * 60_000);
      codePromise.finally(() => clearTimeout(t));
    });
  }
}
