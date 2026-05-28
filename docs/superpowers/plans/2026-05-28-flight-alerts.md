# Flight Alerts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a personal macOS Electron app that, 5 minutes before each Google Calendar event, flies a colored emoji plane across the screen carrying a banner with the event title, time, and account. Multiple concurrent events stack on horizontal lanes. Click → opens the event in Google Calendar.

**Architecture:** Single Electron app with one main process and two renderers (transparent always-on-top overlay + on-demand React settings window). Main process owns OAuth via PKCE (system browser + loopback redirect), Google Calendar polling, scheduling timeouts, and lane allocation. Tokens live in macOS Keychain; user config in `~/Library/Application Support/flight-alerts/config.json`. Overlay is always alive and click-through except where a plane is rendered.

**Tech Stack:** Electron, TypeScript (`strict`), electron-vite, React 18 (settings only — overlay is vanilla TS/CSS), keytar, electron-log, zod, vitest, nock.

**Spec:** `docs/superpowers/specs/2026-05-28-flight-alerts-design.md`

---

## File structure

```
flight-alerts/
├── package.json
├── tsconfig.json
├── tsconfig.node.json
├── electron.vite.config.ts
├── .env.example
├── src/
│   ├── main/
│   │   ├── index.ts                # app entry, lifecycle, wiring
│   │   ├── types.ts                # shared domain types
│   │   ├── logger.ts               # electron-log setup
│   │   ├── storage.ts              # config.json (zod, atomic writes)
│   │   ├── lane-allocator.ts       # pure lane assignment logic
│   │   ├── flight-scheduler.ts     # setTimeout management + diffing
│   │   ├── calendar-normalize.ts   # pure event normalization
│   │   ├── google-oauth.ts         # PKCE flow + token refresh (pure-ish)
│   │   ├── keychain.ts             # keytar wrapper
│   │   ├── account-manager.ts      # combines OAuth + keychain + config
│   │   ├── calendar-sync.ts        # polling loop + Google fetch
│   │   ├── windows.ts              # overlay + settings window factories
│   │   ├── tray.ts                 # macOS menubar
│   │   └── ipc.ts                  # typed IPC handlers
│   ├── preload/
│   │   ├── overlay.ts
│   │   └── settings.ts
│   ├── overlay/
│   │   ├── index.html
│   │   ├── overlay.ts
│   │   └── overlay.css
│   └── settings/
│       ├── index.html
│       ├── main.tsx
│       ├── App.tsx
│       ├── AccountRow.tsx
│       ├── ColorPicker.tsx
│       └── settings.css
└── tests/
    ├── unit/
    │   ├── lane-allocator.test.ts
    │   ├── flight-scheduler.test.ts
    │   ├── calendar-normalize.test.ts
    │   └── storage.test.ts
    └── integration/
        ├── google-oauth.test.ts
        └── calendar-sync.test.ts
```

---

## Task 1: Project bootstrap

**Files:**
- Create: `package.json`, `tsconfig.json`, `tsconfig.node.json`, `electron.vite.config.ts`, `src/main/index.ts`, `src/preload/settings.ts`, `src/preload/overlay.ts`, `src/settings/index.html`, `src/settings/main.tsx`, `src/settings/App.tsx`, `src/overlay/index.html`, `src/overlay/overlay.ts`

- [ ] **Step 1: Create `package.json`**

```json
{
  "name": "flight-alerts",
  "version": "0.1.0",
  "private": true,
  "description": "Personal macOS app that flies planes across the screen 5 min before each Google Calendar event",
  "main": "out/main/index.js",
  "scripts": {
    "dev": "electron-vite dev",
    "build": "electron-vite build && electron-builder",
    "preview": "electron-vite preview",
    "test": "vitest run",
    "test:watch": "vitest",
    "typecheck": "tsc --noEmit -p tsconfig.json && tsc --noEmit -p tsconfig.node.json",
    "postinstall": "electron-builder install-app-deps"
  },
  "devDependencies": {
    "@types/node": "^22.0.0",
    "@types/react": "^18.3.0",
    "@types/react-dom": "^18.3.0",
    "@vitejs/plugin-react": "^4.3.0",
    "electron": "^33.0.0",
    "electron-builder": "^25.0.0",
    "electron-vite": "^3.0.0",
    "nock": "^13.5.0",
    "typescript": "^5.5.0",
    "vite": "^5.4.0",
    "vitest": "^2.1.0"
  },
  "dependencies": {
    "electron-log": "^5.2.0",
    "keytar": "^7.9.0",
    "react": "^18.3.0",
    "react-dom": "^18.3.0",
    "zod": "^3.23.0"
  }
}
```

- [ ] **Step 2: Create `tsconfig.json` (for renderers)**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "jsx": "react-jsx",
    "lib": ["ES2022", "DOM"],
    "types": ["vite/client"]
  },
  "include": ["src/settings/**/*", "src/overlay/**/*", "src/preload/**/*"]
}
```

- [ ] **Step 3: Create `tsconfig.node.json` (for main + tests)**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "lib": ["ES2022"],
    "types": ["node"]
  },
  "include": ["src/main/**/*", "tests/**/*", "electron.vite.config.ts"]
}
```

- [ ] **Step 4: Create `electron.vite.config.ts`**

```ts
import { defineConfig, externalizeDepsPlugin } from 'electron-vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: { outDir: 'out/main' },
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      outDir: 'out/preload',
      rollupOptions: {
        input: {
          settings: resolve(__dirname, 'src/preload/settings.ts'),
          overlay: resolve(__dirname, 'src/preload/overlay.ts'),
        },
      },
    },
  },
  renderer: {
    plugins: [react()],
    build: {
      outDir: 'out/renderer',
      rollupOptions: {
        input: {
          settings: resolve(__dirname, 'src/settings/index.html'),
          overlay: resolve(__dirname, 'src/overlay/index.html'),
        },
      },
    },
  },
});
```

- [ ] **Step 5: Create minimal `src/main/index.ts`**

```ts
import { app, BrowserWindow } from 'electron';
import { join } from 'node:path';

app.whenReady().then(() => {
  const win = new BrowserWindow({
    width: 600,
    height: 400,
    show: true,
    webPreferences: {
      preload: join(__dirname, '../preload/settings.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(`${process.env['ELECTRON_RENDERER_URL']}/settings/index.html`);
  } else {
    win.loadFile(join(__dirname, '../renderer/settings/index.html'));
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
```

- [ ] **Step 6: Create minimal preload stubs**

`src/preload/settings.ts`:
```ts
// Settings preload — IPC bridge will be added in Task 9.
```

`src/preload/overlay.ts`:
```ts
// Overlay preload — IPC bridge will be added in Task 9.
```

- [ ] **Step 7: Create minimal settings renderer**

`src/settings/index.html`:
```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <title>Flight Alerts — Settings</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="./main.tsx"></script>
  </body>
</html>
```

`src/settings/main.tsx`:
```tsx
import React from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';

createRoot(document.getElementById('root')!).render(<App />);
```

`src/settings/App.tsx`:
```tsx
export function App() {
  return <main style={{ padding: 24 }}><h1>Flight Alerts</h1><p>Hello.</p></main>;
}
```

- [ ] **Step 8: Create minimal overlay renderer**

`src/overlay/index.html`:
```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <title>Overlay</title>
  </head>
  <body>
    <script type="module" src="./overlay.ts"></script>
  </body>
</html>
```

`src/overlay/overlay.ts`:
```ts
// Overlay logic added in Task 12.
console.log('overlay loaded');
```

- [ ] **Step 9: Install and run**

```bash
npm install
npm run dev
```

Expected: a 600×400 window opens showing "Flight Alerts" and "Hello.".

- [ ] **Step 10: Commit**

```bash
git add package.json tsconfig.json tsconfig.node.json electron.vite.config.ts src/
git commit -m "feat: bootstrap Electron + Vite + React scaffold"
```

---

## Task 2: Shared types + logger

**Files:**
- Create: `src/main/types.ts`, `src/main/logger.ts`

- [ ] **Step 1: Create `src/main/types.ts`**

```ts
export type AccountStatus = 'ok' | 'needs_reauth';

export interface AccountConfig {
  email: string;
  color: string; // hex like "#a78bfa"
  enabled: boolean;
}

export interface Config {
  delayMinutes: number; // 1, 2, 5, 10, 15
  autostart: boolean;
  accounts: AccountConfig[];
}

export interface NormalizedEvent {
  id: string;          // Google event id
  accountEmail: string;
  title: string;
  startMs: number;     // epoch ms
  endMs: number;       // epoch ms
  htmlLink: string;    // Google Calendar event page URL
}

export interface PlaneSpawnPayload {
  eventId: string;
  title: string;
  startMs: number;
  accountEmail: string;
  color: string;
  htmlLink: string;
  lane: number;
}

export interface OAuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: number; // epoch ms
}
```

- [ ] **Step 2: Create `src/main/logger.ts`**

```ts
import log from 'electron-log/main';

log.transports.file.level = 'info';
log.transports.console.level = 'debug';
log.transports.file.maxSize = 5 * 1024 * 1024;

export const logger = log;
```

- [ ] **Step 3: Run typecheck**

```bash
npm run typecheck
```

Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add src/main/types.ts src/main/logger.ts
git commit -m "feat: add shared types and logger setup"
```

---

## Task 3: Storage module (config.json with zod)

**Files:**
- Create: `src/main/storage.ts`
- Test: `tests/unit/storage.test.ts`
- Modify: `package.json` (add vitest config)

- [ ] **Step 1: Add vitest config to `package.json`**

In `package.json` add at the end (before the closing brace of the top-level object):

```json
  "vitest": {
    "include": ["tests/**/*.test.ts"],
    "environment": "node"
  }
```

(If using a separate `vitest.config.ts` is preferred, create one instead — but the inline config is simpler for this project.)

- [ ] **Step 2: Write failing test `tests/unit/storage.test.ts`**

```ts
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
```

- [ ] **Step 3: Run test (should fail)**

```bash
npm test -- tests/unit/storage.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 4: Implement `src/main/storage.ts`**

```ts
import { existsSync, readFileSync, writeFileSync, renameSync } from 'node:fs';
import { z } from 'zod';
import type { Config } from './types';
import { logger } from './logger';

const ConfigSchema = z.object({
  delayMinutes: z.number().int().positive(),
  autostart: z.boolean(),
  accounts: z.array(
    z.object({
      email: z.string().email(),
      color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
      enabled: z.boolean(),
    }),
  ),
});

export const DEFAULT_CONFIG: Config = {
  delayMinutes: 5,
  autostart: true,
  accounts: [],
};

export function loadConfig(path: string): Config {
  if (!existsSync(path)) return { ...DEFAULT_CONFIG };

  const raw = readFileSync(path, 'utf8');
  try {
    const parsed = JSON.parse(raw);
    return ConfigSchema.parse(parsed);
  } catch (err) {
    logger.warn(`Invalid config at ${path}, falling back to defaults`, err);
    writeFileSync(path + '.bak', raw);
    return { ...DEFAULT_CONFIG };
  }
}

export function saveConfig(path: string, config: Config): void {
  ConfigSchema.parse(config); // throws on misuse
  const tmp = path + '.tmp';
  writeFileSync(tmp, JSON.stringify(config, null, 2));
  renameSync(tmp, path);
}
```

- [ ] **Step 5: Run test (should pass)**

```bash
npm test -- tests/unit/storage.test.ts
```

Expected: PASS (all 5 tests).

- [ ] **Step 6: Commit**

```bash
git add package.json src/main/storage.ts tests/unit/storage.test.ts
git commit -m "feat: storage module with zod validation and atomic writes"
```

---

## Task 4: LaneAllocator

**Files:**
- Create: `src/main/lane-allocator.ts`
- Test: `tests/unit/lane-allocator.test.ts`

- [ ] **Step 1: Write failing test `tests/unit/lane-allocator.test.ts`**

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { LaneAllocator } from '../../src/main/lane-allocator';

const ANIM_MS = 6000;
const MAX_LANES = 5;

describe('LaneAllocator', () => {
  let allocator: LaneAllocator;
  let now: number;

  beforeEach(() => {
    now = 1_000_000;
    allocator = new LaneAllocator({ animationMs: ANIM_MS, maxLanes: MAX_LANES, now: () => now });
  });

  it('returns lane 0 when no allocations', () => {
    expect(allocator.allocate()).toEqual({ lane: 0, delayMs: 0 });
  });

  it('returns lane 1 when lane 0 is occupied', () => {
    allocator.allocate(); // lane 0
    expect(allocator.allocate()).toEqual({ lane: 1, delayMs: 0 });
  });

  it('reuses lane 0 after its animation has finished', () => {
    allocator.allocate(); // lane 0
    now += ANIM_MS + 1;
    expect(allocator.allocate()).toEqual({ lane: 0, delayMs: 0 });
  });

  it('queues with stagger when all lanes are busy', () => {
    for (let i = 0; i < MAX_LANES; i++) allocator.allocate();
    const sixth = allocator.allocate();
    expect(sixth.lane).toBeGreaterThanOrEqual(0);
    expect(sixth.lane).toBeLessThan(MAX_LANES);
    expect(sixth.delayMs).toBeGreaterThanOrEqual(1000);
  });

  it('staggers two overflow allocations by 1s each', () => {
    for (let i = 0; i < MAX_LANES; i++) allocator.allocate();
    const a = allocator.allocate();
    const b = allocator.allocate();
    expect(b.delayMs).toBeGreaterThanOrEqual(a.delayMs + 1000);
  });

  it('release() frees a lane immediately', () => {
    const { lane } = allocator.allocate();
    allocator.release(lane);
    expect(allocator.allocate().lane).toBe(lane);
  });
});
```

- [ ] **Step 2: Run test (should fail)**

```bash
npm test -- tests/unit/lane-allocator.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/main/lane-allocator.ts`**

```ts
export interface LaneAllocatorOptions {
  animationMs: number;
  maxLanes: number;
  now?: () => number;
}

export interface LaneAllocation {
  lane: number;
  delayMs: number;
}

export class LaneAllocator {
  private occupiedUntil: number[] = []; // ms since epoch
  private overflowQueueEndAt = 0;
  private readonly animationMs: number;
  private readonly maxLanes: number;
  private readonly now: () => number;

  constructor(opts: LaneAllocatorOptions) {
    this.animationMs = opts.animationMs;
    this.maxLanes = opts.maxLanes;
    this.now = opts.now ?? Date.now;
  }

  allocate(): LaneAllocation {
    const t = this.now();
    for (let i = 0; i < this.maxLanes; i++) {
      const until = this.occupiedUntil[i] ?? 0;
      if (until <= t) {
        this.occupiedUntil[i] = t + this.animationMs;
        return { lane: i, delayMs: 0 };
      }
    }
    // All lanes busy — pick lane 0 with a stagger
    const baseDelay = Math.max(1000, this.overflowQueueEndAt - t + 1000);
    const startAt = t + baseDelay;
    this.overflowQueueEndAt = startAt;
    this.occupiedUntil[0] = startAt + this.animationMs;
    return { lane: 0, delayMs: baseDelay };
  }

  release(lane: number): void {
    if (lane >= 0 && lane < this.maxLanes) {
      this.occupiedUntil[lane] = 0;
    }
  }
}
```

- [ ] **Step 4: Run test (should pass)**

```bash
npm test -- tests/unit/lane-allocator.test.ts
```

Expected: PASS (all 6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/main/lane-allocator.ts tests/unit/lane-allocator.test.ts
git commit -m "feat: pure LaneAllocator with stagger overflow"
```

---

## Task 5: Calendar normalize (pure)

**Files:**
- Create: `src/main/calendar-normalize.ts`
- Test: `tests/unit/calendar-normalize.test.ts`

- [ ] **Step 1: Write failing test `tests/unit/calendar-normalize.test.ts`**

```ts
import { describe, it, expect } from 'vitest';
import { normalizeEvents } from '../../src/main/calendar-normalize';

const ACCT = 'me@example.com';

describe('normalizeEvents', () => {
  it('drops all-day events (start.date present)', () => {
    const out = normalizeEvents(ACCT, [
      { id: '1', summary: 'Birthday', start: { date: '2026-05-28' }, end: { date: '2026-05-29' }, htmlLink: 'x' },
    ]);
    expect(out).toEqual([]);
  });

  it('normalizes a timed event', () => {
    const out = normalizeEvents(ACCT, [
      {
        id: '1',
        summary: 'Standup',
        start: { dateTime: '2026-05-28T14:00:00+02:00' },
        end:   { dateTime: '2026-05-28T14:15:00+02:00' },
        htmlLink: 'https://calendar.google.com/event?eid=abc',
      },
    ]);
    expect(out).toHaveLength(1);
    expect(out[0]).toEqual({
      id: '1',
      accountEmail: ACCT,
      title: 'Standup',
      startMs: new Date('2026-05-28T14:00:00+02:00').getTime(),
      endMs:   new Date('2026-05-28T14:15:00+02:00').getTime(),
      htmlLink: 'https://calendar.google.com/event?eid=abc',
    });
  });

  it('uses "(no title)" when summary is missing', () => {
    const out = normalizeEvents(ACCT, [
      { id: '1', start: { dateTime: '2026-05-28T14:00:00Z' }, end: { dateTime: '2026-05-28T14:15:00Z' }, htmlLink: 'x' },
    ]);
    expect(out[0]?.title).toBe('(no title)');
  });

  it('skips events with no id', () => {
    const out = normalizeEvents(ACCT, [
      { summary: 'X', start: { dateTime: '2026-05-28T14:00:00Z' }, end: { dateTime: '2026-05-28T14:15:00Z' }, htmlLink: 'x' } as any,
    ]);
    expect(out).toEqual([]);
  });

  it('keeps declined and tentative events (responseStatus ignored at this layer)', () => {
    const out = normalizeEvents(ACCT, [
      {
        id: '1',
        summary: 'Optional',
        start: { dateTime: '2026-05-28T14:00:00Z' },
        end:   { dateTime: '2026-05-28T14:15:00Z' },
        htmlLink: 'x',
        attendees: [{ email: ACCT, self: true, responseStatus: 'declined' }],
      },
    ]);
    expect(out).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run test (should fail)**

```bash
npm test -- tests/unit/calendar-normalize.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/main/calendar-normalize.ts`**

```ts
import type { NormalizedEvent } from './types';

// Minimal subset of the Google Calendar Event shape we care about.
export interface RawEvent {
  id?: string;
  summary?: string;
  start?: { dateTime?: string; date?: string };
  end?:   { dateTime?: string; date?: string };
  htmlLink?: string;
}

export function normalizeEvents(accountEmail: string, raw: RawEvent[]): NormalizedEvent[] {
  const out: NormalizedEvent[] = [];
  for (const e of raw) {
    if (!e.id) continue;
    const startIso = e.start?.dateTime;
    const endIso   = e.end?.dateTime;
    if (!startIso || !endIso) continue; // skip all-day or malformed
    const startMs = Date.parse(startIso);
    const endMs   = Date.parse(endIso);
    if (Number.isNaN(startMs) || Number.isNaN(endMs)) continue;
    out.push({
      id: e.id,
      accountEmail,
      title: e.summary ?? '(no title)',
      startMs,
      endMs,
      htmlLink: e.htmlLink ?? '',
    });
  }
  return out;
}
```

- [ ] **Step 4: Run test (should pass)**

```bash
npm test -- tests/unit/calendar-normalize.test.ts
```

Expected: PASS (all 5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/main/calendar-normalize.ts tests/unit/calendar-normalize.test.ts
git commit -m "feat: pure Google event normalizer (drops all-day, malformed)"
```

---

## Task 6: FlightScheduler

**Files:**
- Create: `src/main/flight-scheduler.ts`
- Test: `tests/unit/flight-scheduler.test.ts`

- [ ] **Step 1: Write failing test `tests/unit/flight-scheduler.test.ts`**

```ts
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { FlightScheduler } from '../../src/main/flight-scheduler';
import type { NormalizedEvent } from '../../src/main/types';

const evt = (over: Partial<NormalizedEvent>): NormalizedEvent => ({
  id: 'e1', accountEmail: 'a@b.com', title: 'T', startMs: 0, endMs: 0, htmlLink: '', ...over,
});

describe('FlightScheduler', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('fires onSpawn at start - delay', () => {
    const onSpawn = vi.fn();
    const scheduler = new FlightScheduler({ delayMs: 5 * 60_000, onSpawn });
    vi.setSystemTime(0);
    scheduler.update([evt({ id: 'a', startMs: 10 * 60_000 })]);

    vi.setSystemTime(5 * 60_000 - 1);
    vi.advanceTimersByTime(5 * 60_000 - 1);
    expect(onSpawn).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(onSpawn).toHaveBeenCalledTimes(1);
    expect(onSpawn).toHaveBeenCalledWith(expect.objectContaining({ id: 'a' }));
  });

  it('fires immediately when already within the window', () => {
    const onSpawn = vi.fn();
    const scheduler = new FlightScheduler({ delayMs: 5 * 60_000, onSpawn });
    vi.setSystemTime(7 * 60_000); // 7 minutes in
    scheduler.update([evt({ id: 'a', startMs: 10 * 60_000 })]); // 3 min away, within 5-min window
    expect(onSpawn).toHaveBeenCalledTimes(1);
  });

  it('skips events that have already started', () => {
    const onSpawn = vi.fn();
    const scheduler = new FlightScheduler({ delayMs: 5 * 60_000, onSpawn });
    vi.setSystemTime(15 * 60_000);
    scheduler.update([evt({ id: 'a', startMs: 10 * 60_000 })]);
    expect(onSpawn).not.toHaveBeenCalled();
  });

  it('reschedules when startMs changes', () => {
    const onSpawn = vi.fn();
    const scheduler = new FlightScheduler({ delayMs: 5 * 60_000, onSpawn });
    vi.setSystemTime(0);
    scheduler.update([evt({ id: 'a', startMs: 10 * 60_000 })]);
    scheduler.update([evt({ id: 'a', startMs: 20 * 60_000 })]);
    vi.advanceTimersByTime(10 * 60_000);
    expect(onSpawn).not.toHaveBeenCalled(); // original was cleared
    vi.advanceTimersByTime(5 * 60_000); // now at 15min, new event fires at 20-5=15
    expect(onSpawn).toHaveBeenCalledTimes(1);
  });

  it('clears timeout when event is removed', () => {
    const onSpawn = vi.fn();
    const scheduler = new FlightScheduler({ delayMs: 5 * 60_000, onSpawn });
    vi.setSystemTime(0);
    scheduler.update([evt({ id: 'a', startMs: 10 * 60_000 })]);
    scheduler.update([]);
    vi.advanceTimersByTime(10 * 60_000);
    expect(onSpawn).not.toHaveBeenCalled();
  });

  it('does not double-schedule on identical updates', () => {
    const onSpawn = vi.fn();
    const scheduler = new FlightScheduler({ delayMs: 5 * 60_000, onSpawn });
    vi.setSystemTime(0);
    const e = evt({ id: 'a', startMs: 10 * 60_000 });
    scheduler.update([e]);
    scheduler.update([e]);
    vi.advanceTimersByTime(10 * 60_000);
    expect(onSpawn).toHaveBeenCalledTimes(1);
  });

  it('dispose() clears all pending timeouts', () => {
    const onSpawn = vi.fn();
    const scheduler = new FlightScheduler({ delayMs: 5 * 60_000, onSpawn });
    vi.setSystemTime(0);
    scheduler.update([evt({ id: 'a', startMs: 10 * 60_000 })]);
    scheduler.dispose();
    vi.advanceTimersByTime(10 * 60_000);
    expect(onSpawn).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test (should fail)**

```bash
npm test -- tests/unit/flight-scheduler.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/main/flight-scheduler.ts`**

```ts
import type { NormalizedEvent } from './types';

export interface FlightSchedulerOptions {
  delayMs: number;
  onSpawn: (event: NormalizedEvent) => void;
  now?: () => number;
}

interface Scheduled {
  event: NormalizedEvent;
  timeout: ReturnType<typeof setTimeout>;
}

export class FlightScheduler {
  private readonly opts: FlightSchedulerOptions;
  private readonly now: () => number;
  private readonly scheduled = new Map<string, Scheduled>();

  constructor(opts: FlightSchedulerOptions) {
    this.opts = opts;
    this.now = opts.now ?? Date.now;
  }

  update(events: NormalizedEvent[]): void {
    const incoming = new Map(events.map((e) => [e.id, e]));

    // Remove or reschedule existing
    for (const [id, sched] of this.scheduled) {
      const next = incoming.get(id);
      if (!next || next.startMs !== sched.event.startMs) {
        clearTimeout(sched.timeout);
        this.scheduled.delete(id);
      }
    }

    // Add or re-add
    for (const e of events) {
      if (this.scheduled.has(e.id)) continue;
      this.schedule(e);
    }
  }

  private schedule(e: NormalizedEvent): void {
    const fireAt = e.startMs - this.opts.delayMs;
    const t = this.now();
    if (e.startMs <= t) return; // already started — skip
    if (fireAt <= t) {
      // Within the warning window already — fire immediately
      this.opts.onSpawn(e);
      return;
    }
    const handle = setTimeout(() => {
      this.scheduled.delete(e.id);
      this.opts.onSpawn(e);
    }, fireAt - t);
    this.scheduled.set(e.id, { event: e, timeout: handle });
  }

  dispose(): void {
    for (const { timeout } of this.scheduled.values()) clearTimeout(timeout);
    this.scheduled.clear();
  }
}
```

- [ ] **Step 4: Run test (should pass)**

```bash
npm test -- tests/unit/flight-scheduler.test.ts
```

Expected: PASS (all 7 tests).

- [ ] **Step 5: Commit**

```bash
git add src/main/flight-scheduler.ts tests/unit/flight-scheduler.test.ts
git commit -m "feat: FlightScheduler with diffing and immediate-window handling"
```

---

## Task 7: Google OAuth PKCE flow

**Files:**
- Create: `src/main/google-oauth.ts`, `.env.example`
- Test: `tests/integration/google-oauth.test.ts`

This task implements PKCE token exchange and refresh. The browser-opening / loopback-server piece (`startAuthFlow`) is wired in Task 9; here we keep the I/O-free pieces unit-testable.

**Prerequisite (manual, document in `.env.example`):** The user creates a Google Cloud project, enables the Calendar API, creates an "OAuth client ID" of type **Desktop app**, and copies the client ID into `.env` as `GOOGLE_CLIENT_ID=...`. No client secret is needed for PKCE installed apps.

- [ ] **Step 1: Create `.env.example`**

```
# Get this from console.cloud.google.com → APIs & Services → Credentials → Create OAuth client ID (Desktop app)
GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
```

- [ ] **Step 2: Write failing test `tests/integration/google-oauth.test.ts`**

```ts
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
```

- [ ] **Step 3: Run test (should fail)**

```bash
npm test -- tests/integration/google-oauth.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 4: Implement `src/main/google-oauth.ts`**

```ts
import { createHash, randomBytes } from 'node:crypto';
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

async function postToken(body: Record<string, string>): Promise<any> {
  const res = await fetch(TOKEN_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(body).toString(),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(`OAuth token error: ${JSON.stringify(json)}`);
  return json;
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
```

- [ ] **Step 5: Run test (should pass)**

```bash
npm test -- tests/integration/google-oauth.test.ts
```

Expected: PASS (all 5 tests).

- [ ] **Step 6: Commit**

```bash
git add .env.example src/main/google-oauth.ts tests/integration/google-oauth.test.ts
git commit -m "feat: Google OAuth PKCE token exchange and refresh"
```

---

## Task 8: Keychain wrapper + AccountManager

**Files:**
- Create: `src/main/keychain.ts`, `src/main/account-manager.ts`

This task wires keytar + google-oauth + storage. The loopback server (`startAuthFlow`) lives here because it's I/O-heavy; smoke-test it manually in Task 9.

- [ ] **Step 1: Create `src/main/keychain.ts`**

```ts
import keytar from 'keytar';
import type { OAuthTokens } from './types';

const SERVICE = 'flight-alerts';

export async function saveTokens(email: string, tokens: OAuthTokens): Promise<void> {
  await keytar.setPassword(SERVICE, email, JSON.stringify(tokens));
}

export async function loadTokens(email: string): Promise<OAuthTokens | null> {
  const raw = await keytar.getPassword(SERVICE, email);
  if (!raw) return null;
  try { return JSON.parse(raw) as OAuthTokens; }
  catch { return null; }
}

export async function deleteTokens(email: string): Promise<boolean> {
  return keytar.deletePassword(SERVICE, email);
}
```

- [ ] **Step 2: Create `src/main/account-manager.ts`**

```ts
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
  constructor(private readonly clientId: string) {}

  async addAccount(): Promise<AddAccountResult> {
    const { verifier, challenge } = makePkcePair();
    const state = makePkcePair().verifier.slice(0, 16);

    const { server, port, codePromise } = await this.startLoopbackServer(state);
    const redirectUri = `http://127.0.0.1:${port}/callback`;

    const authUrl = buildAuthUrl({ clientId: this.clientId, redirectUri, challenge, state });
    await shell.openExternal(authUrl);

    try {
      const code = await codePromise;
      const tokens = await exchangeCodeForTokens({ clientId: this.clientId, code, verifier, redirectUri });
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
    const fresh = await refreshAccessToken({ clientId: this.clientId, refreshToken: tokens.refreshToken });
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
```

- [ ] **Step 3: Run typecheck**

```bash
npm run typecheck
```

Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add src/main/keychain.ts src/main/account-manager.ts
git commit -m "feat: AccountManager with PKCE loopback and Keychain storage"
```

---

## Task 9: CalendarSync (polling + backoff)

**Files:**
- Create: `src/main/calendar-sync.ts`
- Test: `tests/integration/calendar-sync.test.ts`

- [ ] **Step 1: Write failing test `tests/integration/calendar-sync.test.ts`**

```ts
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import nock from 'nock';
import { fetchAccountEvents } from '../../src/main/calendar-sync';

beforeEach(() => { nock.disableNetConnect(); });
afterEach(() => { nock.cleanAll(); nock.enableNetConnect(); vi.useRealTimers(); });

describe('fetchAccountEvents', () => {
  it('returns normalized events on 200', async () => {
    nock('https://www.googleapis.com')
      .get('/calendar/v3/calendars/primary/events')
      .query(true)
      .reply(200, {
        items: [
          { id: '1', summary: 'A', start: { dateTime: '2026-05-28T14:00:00Z' }, end: { dateTime: '2026-05-28T14:15:00Z' }, htmlLink: 'h1' },
          { id: '2', summary: 'B', start: { date: '2026-05-28' }, end: { date: '2026-05-29' }, htmlLink: 'h2' },
        ],
      });
    const out = await fetchAccountEvents('me@x.com', 'tok', { backoffBaseMs: 1 });
    expect(out).toHaveLength(1);
    expect(out[0]?.id).toBe('1');
  });

  it('retries on 429 then succeeds', async () => {
    nock('https://www.googleapis.com')
      .get('/calendar/v3/calendars/primary/events').query(true).reply(429)
      .get('/calendar/v3/calendars/primary/events').query(true).reply(200, { items: [] });
    const out = await fetchAccountEvents('me@x.com', 'tok', { backoffBaseMs: 1 });
    expect(out).toEqual([]);
  });

  it('retries on 500 up to 5 times then throws', async () => {
    for (let i = 0; i < 5; i++) {
      nock('https://www.googleapis.com').get('/calendar/v3/calendars/primary/events').query(true).reply(500);
    }
    await expect(fetchAccountEvents('me@x.com', 'tok', { backoffBaseMs: 1 })).rejects.toThrow();
  });

  it('does not retry on 401 (auth issue)', async () => {
    nock('https://www.googleapis.com').get('/calendar/v3/calendars/primary/events').query(true).reply(401);
    await expect(fetchAccountEvents('me@x.com', 'tok', { backoffBaseMs: 1 })).rejects.toThrow(/401/);
  });
});
```

- [ ] **Step 2: Run test (should fail)**

```bash
npm test -- tests/integration/calendar-sync.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/main/calendar-sync.ts`**

```ts
import { logger } from './logger';
import { normalizeEvents, type RawEvent } from './calendar-normalize';
import type { NormalizedEvent } from './types';

export interface FetchOptions {
  backoffBaseMs?: number; // default 1000 — overridable for tests
  windowHours?: number;   // default 24
}

const RETRYABLE = new Set([429, 500, 502, 503, 504]);

export async function fetchAccountEvents(
  email: string,
  accessToken: string,
  opts: FetchOptions = {},
): Promise<NormalizedEvent[]> {
  const base = opts.backoffBaseMs ?? 1000;
  const windowH = opts.windowHours ?? 24;
  const now = new Date();
  const end = new Date(now.getTime() + windowH * 3600 * 1000);
  const url = new URL('https://www.googleapis.com/calendar/v3/calendars/primary/events');
  url.searchParams.set('timeMin', now.toISOString());
  url.searchParams.set('timeMax', end.toISOString());
  url.searchParams.set('singleEvents', 'true');
  url.searchParams.set('orderBy', 'startTime');
  url.searchParams.set('maxResults', '250');

  let lastErr: unknown = null;
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const r = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
      if (r.ok) {
        const j = await r.json() as { items?: RawEvent[] };
        return normalizeEvents(email, j.items ?? []);
      }
      if (!RETRYABLE.has(r.status)) {
        const body = await r.text();
        throw new Error(`Google API ${r.status}: ${body}`);
      }
      lastErr = new Error(`Google API ${r.status}`);
    } catch (e) {
      lastErr = e;
    }
    const delay = Math.min(60_000, base * Math.pow(2, attempt));
    await new Promise((res) => setTimeout(res, delay));
  }
  throw new Error(`fetchAccountEvents failed after retries: ${(lastErr as Error)?.message}`);
}
```

- [ ] **Step 4: Run test (should pass)**

```bash
npm test -- tests/integration/calendar-sync.test.ts
```

Expected: PASS (all 4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/main/calendar-sync.ts tests/integration/calendar-sync.test.ts
git commit -m "feat: Google Calendar fetcher with exponential backoff"
```

---

## Task 10: IPC bridge + preload

**Files:**
- Create: `src/main/ipc.ts`
- Modify: `src/preload/settings.ts`, `src/preload/overlay.ts`

- [ ] **Step 1: Create `src/main/ipc.ts`**

```ts
import { ipcMain, type BrowserWindow } from 'electron';
import type { AccountConfig, Config, PlaneSpawnPayload } from './types';

export interface IpcHandlers {
  getConfig: () => Config;
  updateConfig: (c: Config) => void;
  addAccount: () => Promise<{ email: string }>;
  removeAccount: (email: string) => Promise<void>;
  testPlane: (email: string) => void;
  setOverlayMouseCapture: (capture: boolean) => void;
  openExternal: (url: string) => Promise<void>;
}

export function registerIpc(h: IpcHandlers): void {
  ipcMain.handle('config:get', () => h.getConfig());
  ipcMain.handle('config:update', (_e, c: Config) => h.updateConfig(c));
  ipcMain.handle('account:add', () => h.addAccount());
  ipcMain.handle('account:remove', (_e, email: string) => h.removeAccount(email));
  ipcMain.handle('account:test', (_e, email: string) => h.testPlane(email));
  ipcMain.on('overlay:mouse-capture', (_e, capture: boolean) => h.setOverlayMouseCapture(capture));
  ipcMain.handle('shell:open', (_e, url: string) => h.openExternal(url));
}

export function sendPlaneSpawn(win: BrowserWindow, payload: PlaneSpawnPayload): void {
  win.webContents.send('plane:spawn', payload);
}
```

- [ ] **Step 2: Replace `src/preload/settings.ts`**

```ts
import { contextBridge, ipcRenderer } from 'electron';
import type { Config } from '../main/types';

contextBridge.exposeInMainWorld('flightAlerts', {
  getConfig: (): Promise<Config> => ipcRenderer.invoke('config:get'),
  updateConfig: (c: Config): Promise<void> => ipcRenderer.invoke('config:update', c),
  addAccount: (): Promise<{ email: string }> => ipcRenderer.invoke('account:add'),
  removeAccount: (email: string): Promise<void> => ipcRenderer.invoke('account:remove', email),
  testPlane: (email: string): Promise<void> => ipcRenderer.invoke('account:test', email),
});
```

- [ ] **Step 3: Replace `src/preload/overlay.ts`**

```ts
import { contextBridge, ipcRenderer } from 'electron';
import type { PlaneSpawnPayload } from '../main/types';

contextBridge.exposeInMainWorld('overlay', {
  onPlaneSpawn: (cb: (p: PlaneSpawnPayload) => void) => {
    ipcRenderer.on('plane:spawn', (_e, p: PlaneSpawnPayload) => cb(p));
  },
  setMouseCapture: (capture: boolean) => ipcRenderer.send('overlay:mouse-capture', capture),
  openExternal: (url: string): Promise<void> => ipcRenderer.invoke('shell:open', url),
});
```

- [ ] **Step 4: Add ambient declarations**

Create `src/settings/global.d.ts`:
```ts
import type { Config } from '../main/types';

declare global {
  interface Window {
    flightAlerts: {
      getConfig(): Promise<Config>;
      updateConfig(c: Config): Promise<void>;
      addAccount(): Promise<{ email: string }>;
      removeAccount(email: string): Promise<void>;
      testPlane(email: string): Promise<void>;
    };
  }
}
export {};
```

Create `src/overlay/global.d.ts`:
```ts
import type { PlaneSpawnPayload } from '../main/types';

declare global {
  interface Window {
    overlay: {
      onPlaneSpawn(cb: (p: PlaneSpawnPayload) => void): void;
      setMouseCapture(capture: boolean): void;
      openExternal(url: string): Promise<void>;
    };
  }
}
export {};
```

- [ ] **Step 5: Run typecheck**

```bash
npm run typecheck
```

Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add src/main/ipc.ts src/preload/settings.ts src/preload/overlay.ts src/settings/global.d.ts src/overlay/global.d.ts
git commit -m "feat: typed IPC bridge + preload exposures"
```

---

## Task 11: Windows + Tray + main wiring

**Files:**
- Create: `src/main/windows.ts`, `src/main/tray.ts`
- Modify: `src/main/index.ts`

- [ ] **Step 1: Create `src/main/windows.ts`**

```ts
import { BrowserWindow, screen } from 'electron';
import { join } from 'node:path';

const isDev = !!process.env['ELECTRON_RENDERER_URL'];

function loadRenderer(win: BrowserWindow, name: 'settings' | 'overlay'): void {
  if (isDev) {
    win.loadURL(`${process.env['ELECTRON_RENDERER_URL']}/${name}/index.html`);
  } else {
    win.loadFile(join(__dirname, `../renderer/${name}/index.html`));
  }
}

export function createOverlayWindow(): BrowserWindow {
  const display = screen.getPrimaryDisplay();
  const { x, y, width, height } = display.workArea;
  const win = new BrowserWindow({
    x, y, width, height,
    transparent: true,
    frame: false,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    focusable: false,
    hasShadow: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    show: true,
    webPreferences: {
      preload: join(__dirname, '../preload/overlay.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  win.setAlwaysOnTop(true, 'floating');
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: false });
  win.setIgnoreMouseEvents(true, { forward: true });
  loadRenderer(win, 'overlay');
  return win;
}

export function createSettingsWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 720,
    height: 560,
    title: 'Flight Alerts',
    show: false,
    webPreferences: {
      preload: join(__dirname, '../preload/settings.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  win.on('ready-to-show', () => win.show());
  loadRenderer(win, 'settings');
  return win;
}
```

- [ ] **Step 2: Create `src/main/tray.ts`**

```ts
import { Tray, Menu, nativeImage, app, type BrowserWindow } from 'electron';
import { join } from 'node:path';

export interface TrayHandlers {
  openSettings: () => void;
  togglePause: () => boolean; // returns new paused state
  isPaused: () => boolean;
}

export function createTray(handlers: TrayHandlers): Tray {
  // 16×16 monochrome template PNG — placeholder: replace `tray.png` after task done.
  // For now we use an empty image; menubar still works.
  const icon = nativeImage.createFromPath(join(__dirname, '../../assets/trayTemplate.png'));
  icon.setTemplateImage(true);
  const tray = new Tray(icon.isEmpty() ? nativeImage.createEmpty() : icon);
  tray.setToolTip('Flight Alerts');

  const rebuild = () => {
    const menu = Menu.buildFromTemplate([
      { label: 'Open Settings…', click: handlers.openSettings },
      { type: 'separator' },
      {
        label: handlers.isPaused() ? 'Resume notifications' : 'Pause notifications',
        click: () => { handlers.togglePause(); rebuild(); },
      },
      { type: 'separator' },
      { label: 'Quit', click: () => app.quit() },
    ]);
    tray.setContextMenu(menu);
  };
  rebuild();
  return tray;
}
```

- [ ] **Step 3: Add asset placeholder**

```bash
mkdir -p assets
# Drop a 16×16 transparent template PNG at assets/trayTemplate.png — for now an empty file works
touch assets/trayTemplate.png
```

The user will replace this with a real plane glyph later. The code handles an empty image gracefully.

- [ ] **Step 4: Rewrite `src/main/index.ts` to wire everything**

```ts
import { app, BrowserWindow, shell, powerMonitor, Notification } from 'electron';
import { join } from 'node:path';
import 'dotenv/config';
import { logger } from './logger';
import { loadConfig, saveConfig } from './storage';
import { AccountManager } from './account-manager';
import { fetchAccountEvents } from './calendar-sync';
import { FlightScheduler } from './flight-scheduler';
import { LaneAllocator } from './lane-allocator';
import { createOverlayWindow, createSettingsWindow } from './windows';
import { createTray } from './tray';
import { registerIpc, sendPlaneSpawn } from './ipc';
import type { Config, NormalizedEvent } from './types';

const CONFIG_PATH = join(app.getPath('userData'), 'config.json');
const SYNC_INTERVAL_MS = 5 * 60_000;
const ANIMATION_MS = 6000;
const MAX_LANES = 5;

let config: Config;
let overlay: BrowserWindow | null = null;
let settingsWin: BrowserWindow | null = null;
let paused = false;

const clientId = process.env['GOOGLE_CLIENT_ID'];
if (!clientId) {
  logger.error('GOOGLE_CLIENT_ID env var is required. See .env.example.');
  app.quit();
}
const accountManager = new AccountManager(clientId!);
const lanes = new LaneAllocator({ animationMs: ANIMATION_MS, maxLanes: MAX_LANES });
const scheduler = new FlightScheduler({
  delayMs: 5 * 60_000, // overwritten in init() below
  onSpawn: (e) => spawnPlane(e),
});

function colorFor(email: string): string {
  return config.accounts.find((a) => a.email === email)?.color ?? '#888888';
}

function spawnPlane(event: NormalizedEvent): void {
  if (paused) return;
  if (!overlay) return;
  const { lane, delayMs } = lanes.allocate();
  const send = () => sendPlaneSpawn(overlay!, {
    eventId: event.id,
    title: event.title,
    startMs: event.startMs,
    accountEmail: event.accountEmail,
    color: colorFor(event.accountEmail),
    htmlLink: event.htmlLink,
    lane,
  });
  if (delayMs > 0) setTimeout(send, delayMs); else send();
}

async function syncOnce(): Promise<void> {
  const events: NormalizedEvent[] = [];
  for (const acct of config.accounts.filter((a) => a.enabled)) {
    try {
      const tok = await accountManager.getAccessToken(acct.email);
      const evs = await fetchAccountEvents(acct.email, tok);
      events.push(...evs);
    } catch (e: any) {
      logger.warn(`sync failed for ${acct.email}: ${e?.message}`);
      if (String(e?.message).includes('401') || String(e?.message).includes('invalid_grant')) {
        new Notification({ title: 'Flight Alerts', body: `Reconnect ${acct.email} in Settings.` }).show();
      }
    }
  }
  scheduler.update(events);
}

function openSettings(): void {
  if (settingsWin && !settingsWin.isDestroyed()) { settingsWin.focus(); return; }
  settingsWin = createSettingsWindow();
  settingsWin.on('closed', () => { settingsWin = null; });
}

async function init(): Promise<void> {
  config = loadConfig(CONFIG_PATH);
  scheduler['opts'].delayMs = config.delayMinutes * 60_000; // re-bind delay (see Task 6 note)

  overlay = createOverlayWindow();
  createTray({
    openSettings,
    togglePause: () => (paused = !paused),
    isPaused: () => paused,
  });

  registerIpc({
    getConfig: () => config,
    updateConfig: (c) => {
      config = c;
      saveConfig(CONFIG_PATH, c);
      scheduler['opts'].delayMs = c.delayMinutes * 60_000;
      app.setLoginItemSettings({ openAtLogin: c.autostart });
      syncOnce();
    },
    addAccount: async () => {
      const { email } = await accountManager.addAccount();
      if (!config.accounts.some((a) => a.email === email)) {
        config.accounts.push({ email, color: pickNextColor(config.accounts), enabled: true });
        saveConfig(CONFIG_PATH, config);
      }
      syncOnce();
      return { email };
    },
    removeAccount: async (email) => {
      await accountManager.removeAccount(email);
      config.accounts = config.accounts.filter((a) => a.email !== email);
      saveConfig(CONFIG_PATH, config);
      syncOnce();
    },
    testPlane: (email) => {
      spawnPlane({
        id: 'test-' + Date.now(),
        accountEmail: email,
        title: 'Test event',
        startMs: Date.now() + 60_000,
        endMs: Date.now() + 120_000,
        htmlLink: 'https://calendar.google.com',
      });
    },
    setOverlayMouseCapture: (capture) => overlay?.setIgnoreMouseEvents(!capture, { forward: true }),
    openExternal: async (url) => {
      // Gate to Google Calendar URLs (defense in depth — even if a renderer is compromised)
      try {
        const u = new URL(url);
        if (u.hostname === 'calendar.google.com' || u.hostname.endsWith('.google.com')) {
          await shell.openExternal(url);
        } else {
          logger.warn(`refusing to open non-Google URL: ${url}`);
        }
      } catch { logger.warn(`refusing invalid URL: ${url}`); }
    },
  });

  app.setLoginItemSettings({ openAtLogin: config.autostart });

  await syncOnce();
  setInterval(syncOnce, SYNC_INTERVAL_MS);
  powerMonitor.on('resume', () => syncOnce());
}

function pickNextColor(accts: { color: string }[]): string {
  const palette = ['#a78bfa','#34d399','#fb7185','#fbbf24','#60a5fa','#f472b6','#22d3ee','#a3e635','#fb923c','#c084fc','#4ade80','#f87171'];
  const used = new Set(accts.map((a) => a.color));
  return palette.find((c) => !used.has(c)) ?? palette[0]!;
}

app.whenReady().then(init);
app.on('window-all-closed', (e) => e.preventDefault()); // keep running in the background

if (!app.requestSingleInstanceLock()) app.quit();
```

Note: `scheduler['opts']` is a quick way to mutate `delayMs` after construction. Refactor to a setter if the engineer prefers — feel free to add `setDelayMs` to `FlightScheduler` and reschedule existing timeouts. For the MVP, the delay change only affects events scheduled after the change.

- [ ] **Step 5: Add `dotenv` dependency**

```bash
npm install dotenv
```

- [ ] **Step 6: Smoke test**

```bash
# Put your GOOGLE_CLIENT_ID in a local .env file first
cp .env.example .env
# edit .env to set GOOGLE_CLIENT_ID
npm run dev
```

Expected:
- Tray icon (likely invisible — empty PNG) appears in menubar; right-click shows menu.
- Overlay window is open (transparent, no UI yet — confirmed via Activity Monitor: 2 Electron windows).
- App stays alive even with no windows visible.

- [ ] **Step 7: Commit**

```bash
git add src/main/windows.ts src/main/tray.ts src/main/index.ts assets/trayTemplate.png package.json package-lock.json
git commit -m "feat: wire main process — overlay, tray, sync loop, IPC"
```

---

## Task 12: Overlay renderer (plane animation + hit-testing)

**Files:**
- Modify: `src/overlay/index.html`, `src/overlay/overlay.ts`
- Create: `src/overlay/overlay.css`

- [ ] **Step 1: Replace `src/overlay/index.html`**

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <title>Overlay</title>
    <link rel="stylesheet" href="./overlay.css" />
  </head>
  <body>
    <div id="lanes"></div>
    <script type="module" src="./overlay.ts"></script>
  </body>
</html>
```

- [ ] **Step 2: Create `src/overlay/overlay.css`**

```css
:root {
  --lane-top: 28px;          /* below macOS menu bar */
  --lane-spacing: 60px;
  --plane-height: 44px;
  --animation-duration: 6s;
}

html, body {
  margin: 0;
  padding: 0;
  width: 100%;
  height: 100%;
  background: transparent;
  overflow: hidden;
  -webkit-app-region: no-drag;
}

#lanes { position: absolute; inset: 0; pointer-events: none; }

.plane {
  position: absolute;
  height: var(--plane-height);
  display: flex;
  align-items: center;
  white-space: nowrap;
  pointer-events: auto;            /* hit-testing toggle is in main */
  animation: fly var(--animation-duration) linear forwards;
  will-change: transform;
  cursor: pointer;
  user-select: none;
}

.plane .glyph { font-size: 32px; line-height: 1; margin-right: 6px; filter: drop-shadow(0 1px 2px rgba(0,0,0,0.3)); }

.plane .banner {
  background: var(--color);
  color: #111;
  padding: 6px 12px;
  border-radius: 6px;
  font: 600 13px/1 -apple-system, BlinkMacSystemFont, sans-serif;
  box-shadow: 0 4px 12px rgba(0,0,0,0.25);
}

.plane .banner .acct {
  font-weight: 400;
  opacity: 0.75;
  margin-left: 6px;
  font-size: 11px;
}

@keyframes fly {
  from { transform: translateX(-260px); }
  to   { transform: translateX(calc(100vw + 40px)); }
}
```

- [ ] **Step 3: Implement `src/overlay/overlay.ts`**

```ts
import type { PlaneSpawnPayload } from '../main/types';

const lanesEl = document.getElementById('lanes')!;
const planes: HTMLElement[] = [];

function formatTime(ms: number): string {
  const d = new Date(ms);
  return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
}

function spawnPlane(p: PlaneSpawnPayload): void {
  const el = document.createElement('div');
  el.className = 'plane';
  el.style.top = `calc(var(--lane-top) + ${p.lane} * var(--lane-spacing))`;
  el.style.setProperty('--color', p.color);
  el.dataset['url'] = p.htmlLink;

  const glyph = document.createElement('span');
  glyph.className = 'glyph';
  glyph.textContent = '✈️';

  const banner = document.createElement('span');
  banner.className = 'banner';
  banner.innerHTML = `${formatTime(p.startMs)} — ${escapeHtml(p.title)}<span class="acct">${escapeHtml(p.accountEmail)}</span>`;

  el.append(glyph, banner);
  el.addEventListener('click', () => {
    if (p.htmlLink) window.overlay.openExternal(p.htmlLink);
  });
  el.addEventListener('animationend', () => {
    el.remove();
    const idx = planes.indexOf(el);
    if (idx >= 0) planes.splice(idx, 1);
  });

  lanesEl.appendChild(el);
  planes.push(el);
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;' }[c]!));
}

// Hit-testing: capture mouse only when over a plane.
let captured = false;
window.addEventListener('mousemove', (e) => {
  const overPlane = planes.some((el) => {
    const r = el.getBoundingClientRect();
    return e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
  });
  if (overPlane !== captured) {
    captured = overPlane;
    window.overlay.setMouseCapture(captured);
  }
});

window.overlay.onPlaneSpawn(spawnPlane);
```

- [ ] **Step 4: Smoke test**

```bash
npm run dev
```

Open the Settings window from the tray (we haven't built it yet — for now, manually trigger a test spawn).

Easiest: open Electron devtools on the overlay window. From the main process console (or via a one-line script in `src/main/index.ts` for testing), call:

```ts
// Temporarily in init() for smoke testing — REMOVE before commit:
setTimeout(() => spawnPlane({
  id: 'smoke', accountEmail: 'me@x.com', title: 'Smoke test',
  startMs: Date.now(), endMs: Date.now() + 60_000, htmlLink: 'https://google.com',
}), 2000);
```

Expected: 2 seconds after launch, a plane traverses the screen left-to-right at lane 0, with a colored banner. Hovering captures the cursor; clicking opens google.com.

Remove the temp smoke code before committing.

- [ ] **Step 5: Commit**

```bash
git add src/overlay/
git commit -m "feat: overlay renderer — plane animation, banner, hit-testing"
```

---

## Task 13: Settings UI — account list

**Files:**
- Modify: `src/settings/App.tsx`
- Create: `src/settings/AccountRow.tsx`, `src/settings/ColorPicker.tsx`, `src/settings/settings.css`

- [ ] **Step 1: Create `src/settings/settings.css`**

```css
* { box-sizing: border-box; }

body {
  font: 13px/1.4 -apple-system, BlinkMacSystemFont, sans-serif;
  margin: 0;
  padding: 24px;
  color: #111;
  background: #fafafa;
}

h1 { font-size: 18px; margin: 0 0 16px; }
h2 { font-size: 13px; text-transform: uppercase; letter-spacing: 0.05em; color: #666; margin: 24px 0 8px; }

button {
  background: #fff;
  border: 1px solid #ccc;
  border-radius: 6px;
  padding: 6px 12px;
  font: inherit;
  cursor: pointer;
}
button.primary { background: #1a73e8; color: #fff; border-color: #1a73e8; }
button:hover { background: #f0f0f0; }
button.primary:hover { background: #1660c5; }

.account-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 12px;
  background: #fff;
  border: 1px solid #e3e3e3;
  border-radius: 8px;
  margin-bottom: 6px;
}
.account-row .swatch {
  width: 24px; height: 24px; border-radius: 50%;
  border: 2px solid #fff;
  box-shadow: 0 0 0 1px #ccc;
  cursor: pointer;
}
.account-row .email { flex: 1; }
.account-row .status-ok    { width: 8px; height: 8px; border-radius: 50%; background: #34d399; }
.account-row .status-warn  { width: 8px; height: 8px; border-radius: 50%; background: #ef4444; }

.controls {
  display: flex;
  gap: 16px;
  align-items: center;
  padding: 12px;
  background: #fff;
  border: 1px solid #e3e3e3;
  border-radius: 8px;
  margin-top: 8px;
}

.picker {
  display: grid;
  grid-template-columns: repeat(6, 1fr);
  gap: 6px;
  padding: 8px;
  background: #fff;
  border: 1px solid #ccc;
  border-radius: 8px;
  width: 200px;
  box-shadow: 0 4px 12px rgba(0,0,0,0.1);
}
.picker .swatch { width: 24px; height: 24px; border-radius: 50%; cursor: pointer; border: 2px solid transparent; }
.picker .swatch.selected { border-color: #111; }
```

- [ ] **Step 2: Create `src/settings/ColorPicker.tsx`**

```tsx
import { useState } from 'react';

const PALETTE = ['#a78bfa','#34d399','#fb7185','#fbbf24','#60a5fa','#f472b6','#22d3ee','#a3e635','#fb923c','#c084fc','#4ade80','#f87171'];

export function ColorPicker({ value, onChange }: { value: string; onChange: (c: string) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ position: 'relative' }}>
      <button
        type="button"
        className="swatch"
        style={{ background: value }}
        onClick={() => setOpen((o) => !o)}
        aria-label="Choose color"
      />
      {open && (
        <div className="picker" style={{ position: 'absolute', top: 32, left: 0, zIndex: 10 }}>
          {PALETTE.map((c) => (
            <div
              key={c}
              className={`swatch ${c === value ? 'selected' : ''}`}
              style={{ background: c }}
              onClick={() => { onChange(c); setOpen(false); }}
            />
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Create `src/settings/AccountRow.tsx`**

```tsx
import type { AccountConfig } from '../main/types';
import { ColorPicker } from './ColorPicker';

export function AccountRow({
  account, onChange, onRemove, onTest,
}: {
  account: AccountConfig;
  onChange: (next: AccountConfig) => void;
  onRemove: () => void;
  onTest: () => void;
}) {
  return (
    <div className="account-row">
      <ColorPicker value={account.color} onChange={(c) => onChange({ ...account, color: c })} />
      <span className="email">{account.email}</span>
      <span className="status-ok" title="Healthy" />
      <label>
        <input
          type="checkbox"
          checked={account.enabled}
          onChange={(e) => onChange({ ...account, enabled: e.target.checked })}
        />
        Enabled
      </label>
      <button onClick={onTest}>Test</button>
      <button onClick={onRemove}>Remove</button>
    </div>
  );
}
```

- [ ] **Step 4: Replace `src/settings/App.tsx`**

```tsx
import { useEffect, useState } from 'react';
import './settings.css';
import type { Config, AccountConfig } from '../main/types';
import { AccountRow } from './AccountRow';

export function App() {
  const [config, setConfig] = useState<Config | null>(null);

  useEffect(() => { window.flightAlerts.getConfig().then(setConfig); }, []);

  if (!config) return <p>Loading…</p>;

  const update = (next: Config) => {
    setConfig(next);
    window.flightAlerts.updateConfig(next);
  };

  const updateAccount = (email: string, patch: Partial<AccountConfig>) => {
    update({
      ...config,
      accounts: config.accounts.map((a) => (a.email === email ? { ...a, ...patch } : a)),
    });
  };

  const removeAccount = async (email: string) => {
    if (!confirm(`Remove ${email}?`)) return;
    await window.flightAlerts.removeAccount(email);
    const fresh = await window.flightAlerts.getConfig();
    setConfig(fresh);
  };

  const addAccount = async () => {
    try {
      await window.flightAlerts.addAccount();
      const fresh = await window.flightAlerts.getConfig();
      setConfig(fresh);
    } catch (e: any) {
      alert(`Failed to add account: ${e?.message ?? e}`);
    }
  };

  return (
    <main>
      <h1>Flight Alerts</h1>

      <h2>Accounts</h2>
      {config.accounts.map((a) => (
        <AccountRow
          key={a.email}
          account={a}
          onChange={(next) => updateAccount(a.email, next)}
          onRemove={() => removeAccount(a.email)}
          onTest={() => window.flightAlerts.testPlane(a.email)}
        />
      ))}
      <button className="primary" onClick={addAccount}>+ Add Google account</button>

      <h2>Preferences</h2>
      <div className="controls">
        <label>
          Warn me{' '}
          <select
            value={config.delayMinutes}
            onChange={(e) => update({ ...config, delayMinutes: Number(e.target.value) })}
          >
            {[1, 2, 5, 10, 15].map((n) => <option key={n} value={n}>{n} minutes</option>)}
          </select>{' '}
          before each event
        </label>
        <label>
          <input
            type="checkbox"
            checked={config.autostart}
            onChange={(e) => update({ ...config, autostart: e.target.checked })}
          />{' '}
          Launch at login
        </label>
      </div>
    </main>
  );
}
```

- [ ] **Step 5: Smoke test**

```bash
npm run dev
```

Expected: tray icon → "Open Settings…" → window shows current config (empty accounts initially). Clicking "Add Google account" opens the browser → consent → callback → account appears in the list with an auto-assigned color. The "Test" button spawns a plane on the overlay.

- [ ] **Step 6: Commit**

```bash
git add src/settings/
git commit -m "feat: settings UI with account list, color picker, preferences"
```

---

## Task 14: End-to-end smoke + final polish

**Files:**
- Modify: `src/main/index.ts` (refinements)
- Create: `scripts/smoke.mjs`
- Modify: `package.json` (smoke script)

- [ ] **Step 1: Add helper to `FlightScheduler` for runtime delay updates**

In `src/main/flight-scheduler.ts`, add a method (then update existing `update()` to read the current delay):

```ts
// Add this method on FlightScheduler:
setDelayMs(ms: number): void {
  this.opts.delayMs = ms;
}
```

Then in `src/main/index.ts`, replace the two occurrences of `scheduler['opts'].delayMs = ...` with `scheduler.setDelayMs(...)`.

- [ ] **Step 2: Add smoke script `scripts/smoke.mjs`**

```js
// Run: npm run smoke
// Boots the app with 3 fixture events at t+10s, t+15s, t+10s and verifies the planes appear.
// This script simply runs `npm run dev` and prints a checklist — visual verification is manual.

console.log(`
Manual smoke checklist:

1. Run: npm run dev
2. Add at least one Google account via the tray → Open Settings → + Add account.
3. In Settings, click "Test" three times rapidly.
4. Confirm: three planes traverse the screen, at lanes 0/1/2, each colored with the account color, banner text readable, hover captures cursor, click opens calendar.google.com.
5. Wait until a real event is within 5 minutes — confirm a real plane spawns with the correct title.
`);
```

Add to `package.json`:
```json
"smoke": "node scripts/smoke.mjs"
```

- [ ] **Step 3: Verify full flow manually**

```bash
npm run smoke   # prints the checklist
npm run dev     # in another terminal
```

Walk through the checklist. Expected: all steps pass.

- [ ] **Step 4: Run all tests**

```bash
npm test
npm run typecheck
```

Expected: all green.

- [ ] **Step 5: Commit**

```bash
git add src/main/flight-scheduler.ts src/main/index.ts scripts/smoke.mjs package.json
git commit -m "feat: smoke script + scheduler delay setter; e2e walkthrough"
```

---

## Task 15: Packaging (DMG)

**Files:**
- Modify: `package.json` (add `build` config)

- [ ] **Step 1: Add `build` config to `package.json`**

At the top level of `package.json`, add:

```json
  "build": {
    "appId": "com.jeancharles.flight-alerts",
    "productName": "Flight Alerts",
    "directories": {
      "output": "release"
    },
    "files": [
      "out/**/*",
      "assets/**/*",
      "package.json"
    ],
    "mac": {
      "category": "public.app-category.productivity",
      "target": [{ "target": "dmg", "arch": ["arm64", "x64"] }],
      "icon": "assets/icon.icns",
      "extendInfo": {
        "LSUIElement": true
      }
    }
  }
```

`LSUIElement: true` makes the app menubar-only (no Dock icon).

- [ ] **Step 2: Add an icon placeholder**

```bash
# Drop an .icns icon at assets/icon.icns. Until then, electron-builder uses a default.
touch assets/icon.icns
```

The user can generate one later with `iconutil` from a PNG.

- [ ] **Step 3: Build and verify**

```bash
npm run build
open release/
```

Expected: a `.dmg` file appears in `release/`. Mount it, drag the app to Applications, launch — works the same as `npm run dev` but as an installed app.

(Signing/notarizing is **out of scope** for the MVP — Gatekeeper will require ctrl-click → Open on first launch.)

- [ ] **Step 4: Commit**

```bash
git add package.json assets/icon.icns
git commit -m "build: electron-builder config for macOS DMG (unsigned MVP)"
```

---

## Done

You now have:
- A signed-in macOS Electron app that polls Google Calendar every 5 minutes across N accounts.
- 5 minutes before each timed event, a colored plane traverses the screen with the title, time, and account.
- Concurrent events stack on horizontal lanes.
- Click on a banner opens the event in Google Calendar.
- Settings: accounts, per-account color, delay, autostart, test button.
- Tokens in Keychain. Config in `Application Support`. Logs in `Logs`. No telemetry.
- Unit tests for all pure logic. Integration tests for OAuth and Google API with nock.

**Out of scope (future):** Windows/Linux support, declined-event filter, snooze, custom plane SVG, multi-monitor, sound, code signing/notarization.
