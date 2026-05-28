import { getPassword, setPassword, deletePassword } from 'keytar';
import type { OAuthTokens } from './types';

const SERVICE = 'flight-alerts';

export async function saveTokens(email: string, tokens: OAuthTokens): Promise<void> {
  await setPassword(SERVICE, email, JSON.stringify(tokens));
}

export async function loadTokens(email: string): Promise<OAuthTokens | null> {
  const raw = await getPassword(SERVICE, email);
  if (!raw) return null;
  try { return JSON.parse(raw) as OAuthTokens; }
  catch { return null; }
}

export async function deleteTokens(email: string): Promise<boolean> {
  return deletePassword(SERVICE, email);
}
