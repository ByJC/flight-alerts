import type { AccountIcon } from './types';

export const DEFAULT_ACCOUNT_ICON: AccountIcon = { type: 'emoji', value: '✈️' };

// Upper bound for a stored image data URI (decoded bytes). Keeps config.json small.
export const MAX_ICON_BYTES = 200_000;

/** Decoded byte length of a base64 data URI; falls back to string length if not base64. */
export function dataUriByteSize(uri: string): number {
  const marker = uri.indexOf('base64,');
  if (marker === -1) return uri.length;
  const b64 = uri.slice(marker + 'base64,'.length);
  const padding = b64.endsWith('==') ? 2 : b64.endsWith('=') ? 1 : 0;
  return Math.floor((b64.length * 3) / 4) - padding;
}

/** A storable icon image: png/jpeg/webp/svg base64 data URI within the size limit. */
export function isValidIconImage(uri: string): boolean {
  return /^data:image\/(png|jpeg|webp|svg\+xml);base64,/.test(uri)
    && dataUriByteSize(uri) > 0
    && dataUriByteSize(uri) <= MAX_ICON_BYTES;
}
