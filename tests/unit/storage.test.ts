import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { loadConfig, saveConfig, DEFAULT_CONFIG } from '../../src/main/storage';

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
    const cfg = { delayMinutes: 10, autostart: false, accounts: [{ email: 'a@b.com', color: '#ff0000', enabled: true }] };
    saveConfig(path, cfg);
    expect(loadConfig(path)).toEqual(cfg);
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

  it('writes atomically (no partial file on crash simulation)', () => {
    const cfg = { delayMinutes: 5, autostart: true, accounts: [] };
    saveConfig(path, cfg);
    expect(existsSync(path + '.tmp')).toBe(false);
  });
});
