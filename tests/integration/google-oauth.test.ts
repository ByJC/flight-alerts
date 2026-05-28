import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import nock from 'nock';
import { exchangeCodeForTokens, refreshAccessToken, buildAuthUrl, makePkcePair } from '../../src/main/google-oauth';

const CLIENT_ID = 'test-client.apps.googleusercontent.com';
const REDIRECT = 'http://127.0.0.1:55555/callback';

beforeEach(() => { nock.disableNetConnect(); });
afterEach(() => { nock.cleanAll(); nock.enableNetConnect(); });

describe('google-oauth', () => {
  it('makePkcePair returns a verifier and a SHA-256-based challenge', () => {
    const { verifier, challenge } = makePkcePair();
    expect(verifier).toMatch(/^[A-Za-z0-9_-]{43,128}$/);
    expect(challenge).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it('buildAuthUrl includes the required params', () => {
    const url = new URL(buildAuthUrl({ clientId: CLIENT_ID, redirectUri: REDIRECT, challenge: 'abc', state: 'xyz' }));
    expect(url.origin + url.pathname).toBe('https://accounts.google.com/o/oauth2/v2/auth');
    expect(url.searchParams.get('client_id')).toBe(CLIENT_ID);
    expect(url.searchParams.get('redirect_uri')).toBe(REDIRECT);
    expect(url.searchParams.get('response_type')).toBe('code');
    expect(url.searchParams.get('scope')).toBe('https://www.googleapis.com/auth/calendar.readonly email');
    expect(url.searchParams.get('code_challenge')).toBe('abc');
    expect(url.searchParams.get('code_challenge_method')).toBe('S256');
    expect(url.searchParams.get('state')).toBe('xyz');
    expect(url.searchParams.get('access_type')).toBe('offline');
    expect(url.searchParams.get('prompt')).toBe('consent');
  });

  it('exchangeCodeForTokens posts and returns tokens', async () => {
    nock('https://oauth2.googleapis.com')
      .post('/token', (body) => {
        return body.client_id === CLIENT_ID &&
               body.code === 'auth-code' &&
               body.code_verifier === 'verifier-123' &&
               body.grant_type === 'authorization_code' &&
               body.redirect_uri === REDIRECT;
      })
      .reply(200, { access_token: 'at', refresh_token: 'rt', expires_in: 3600 });

    const tokens = await exchangeCodeForTokens({
      clientId: CLIENT_ID, code: 'auth-code', verifier: 'verifier-123', redirectUri: REDIRECT,
    });
    expect(tokens.accessToken).toBe('at');
    expect(tokens.refreshToken).toBe('rt');
    expect(tokens.expiresAt).toBeGreaterThan(Date.now());
  });

  it('refreshAccessToken returns a new access token and preserves the refresh token', async () => {
    nock('https://oauth2.googleapis.com')
      .post('/token', (b) => b.grant_type === 'refresh_token' && b.refresh_token === 'rt')
      .reply(200, { access_token: 'at-new', expires_in: 3600 });

    const tokens = await refreshAccessToken({ clientId: CLIENT_ID, refreshToken: 'rt' });
    expect(tokens.accessToken).toBe('at-new');
    expect(tokens.refreshToken).toBe('rt');
  });

  it('throws on token endpoint error', async () => {
    nock('https://oauth2.googleapis.com').post('/token').reply(400, { error: 'invalid_grant' });
    await expect(
      refreshAccessToken({ clientId: CLIENT_ID, refreshToken: 'rt' }),
    ).rejects.toThrow(/invalid_grant/);
  });
});
