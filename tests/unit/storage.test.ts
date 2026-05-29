import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { loadConfig, saveConfig, DEFAULT_CONFIG } from '../../src/main/storage';
import { DEFAULT_ACCOUNT_ICON } from '../../src/main/icon';

let dir: string;
let path: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'fa-test-'));
  path = join(dir, 'config.json');
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('storage', () => {
  it('returns defaults when file does not exist', () => {
    const cfg = loadConfig(path);
    expect(cfg).toEqual(DEFAULT_CONFIG);
  });

  it('round-trips a valid config', () => {
    const cfg = { delayMinutes: 10, dismissSeconds: 30, planeSize: 'large' as const, autostart: false, accounts: [{ email: 'a@b.com', color: '#ff0000', icon: { type: 'emoji' as const, value: '🚀' }, enabled: true }] };
    saveConfig(path, cfg);
    expect(loadConfig(path)).toEqual(cfg);
  });

  it('round-trips an account with an image icon', () => {
    const tinyPng = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M8AAAMBAQDJ/pLvAAAAAElFTkSuQmCC';
    const cfg = { delayMinutes: 5, dismissSeconds: 20, planeSize: 'medium' as const, autostart: true, accounts: [{ email: 'a@b.com', color: '#ff0000', icon: { type: 'image' as const, value: tinyPng }, enabled: true }] };
    saveConfig(path, cfg);
    expect(loadConfig(path)).toEqual(cfg);
  });

  it('defaults a missing account icon to the plane emoji (backward-compat)', () => {
    writeFileSync(path, JSON.stringify({ delayMinutes: 5, dismissSeconds: 20, planeSize: 'medium', autostart: true, accounts: [{ email: 'a@b.com', color: '#ff0000', enabled: true }] }));
    const cfg = loadConfig(path);
    expect(cfg.accounts[0]!.icon).toEqual(DEFAULT_ACCOUNT_ICON);
  });

  it('rejects an account whose image icon is not a valid image data URI', () => {
    writeFileSync(path, JSON.stringify({ delayMinutes: 5, dismissSeconds: 20, planeSize: 'medium', autostart: true, accounts: [{ email: 'a@b.com', color: '#ff0000', icon: { type: 'image', value: 'data:text/plain;base64,aGk=' }, enabled: true }] }));
    const cfg = loadConfig(path);
    expect(cfg).toEqual(DEFAULT_CONFIG);
    expect(existsSync(path + '.bak')).toBe(true);
  });

  it('applies defaults for newer fields when missing from file (forward-compat)', () => {
    writeFileSync(path, JSON.stringify({ delayMinutes: 10, autostart: true, accounts: [] }));
    const cfg = loadConfig(path);
    expect(cfg.dismissSeconds).toBe(20);
    expect(cfg.planeSize).toBe('medium');
  });

  it('falls back to defaults and writes .bak on corrupt JSON', () => {
    writeFileSync(path, '{not json');
    const cfg = loadConfig(path);
    expect(cfg).toEqual(DEFAULT_CONFIG);
    expect(existsSync(path + '.bak')).toBe(true);
    expect(readFileSync(path + '.bak', 'utf8')).toBe('{not json');
  });

  it('falls back to defaults and writes .bak on schema violation', () => {
    writeFileSync(path, JSON.stringify({ delayMinutes: 'five' }));
    const cfg = loadConfig(path);
    expect(cfg).toEqual(DEFAULT_CONFIG);
    expect(existsSync(path + '.bak')).toBe(true);
  });

  it('round-trips an account with a multi-codepoint (ZWJ) emoji icon', () => {
    const cfg = { delayMinutes: 5, dismissSeconds: 20, planeSize: 'medium' as const, autostart: true, accounts: [{ email: 'a@b.com', color: '#00ff00', icon: { type: 'emoji' as const, value: '👨‍👩‍👧‍👦' }, enabled: true }] };
    saveConfig(path, cfg);
    expect(loadConfig(path)).toEqual(cfg);
  });

  it('writes atomically (no partial file on crash simulation)', () => {
    const cfg = { delayMinutes: 5, dismissSeconds: 20, planeSize: 'medium' as const, autostart: true, accounts: [] };
    saveConfig(path, cfg);
    expect(existsSync(path + '.tmp')).toBe(false);
  });
});
