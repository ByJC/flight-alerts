import { describe, it, expect } from 'vitest';
import { DEFAULT_ACCOUNT_ICON, MAX_ICON_BYTES, dataUriByteSize, isValidIconImage } from '../../src/main/icon';

const tinyPng = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M8AAAMBAQDJ/pLvAAAAAElFTkSuQmCC';

describe('icon helpers', () => {
  it('default icon is the plane emoji', () => {
    expect(DEFAULT_ACCOUNT_ICON).toEqual({ type: 'emoji', value: '✈️' });
  });

  it('dataUriByteSize returns decoded byte length, not string length', () => {
    const b64 = tinyPng.slice(tinyPng.indexOf('base64,') + 'base64,'.length);
    const expected = Buffer.from(b64, 'base64').length;
    expect(dataUriByteSize(tinyPng)).toBe(expected);
    expect(dataUriByteSize(tinyPng)).toBeLessThan(tinyPng.length);
  });

  it('dataUriByteSize falls back to string length when no base64 marker', () => {
    expect(dataUriByteSize('not-a-data-uri')).toBe('not-a-data-uri'.length);
  });

  it('accepts a small valid png data URI', () => {
    expect(isValidIconImage(tinyPng)).toBe(true);
  });

  it('rejects a non-image data URI', () => {
    expect(isValidIconImage('data:text/plain;base64,aGk=')).toBe(false);
  });

  it('rejects an image data URI over the size limit', () => {
    const huge = 'data:image/png;base64,' + 'A'.repeat(MAX_ICON_BYTES * 2);
    expect(isValidIconImage(huge)).toBe(false);
  });

  it('accepts a valid webp data URI', () => {
    expect(isValidIconImage('data:image/webp;base64,UklGRhoAAABXRUJQVlA4TA0AAAAvAAAAEAcQERGIiP4HAA==')).toBe(true);
  });

  it('rejects an image data URI with an empty payload', () => {
    expect(isValidIconImage('data:image/png;base64,')).toBe(false);
  });
});
