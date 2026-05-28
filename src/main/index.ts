import { app, BrowserWindow, shell, powerMonitor, Notification } from 'electron';
import { join } from 'node:path';
import { config as dotenvConfig } from 'dotenv';
import { logger } from './logger';

// Dev: dotenv reads .env from cwd (the project root).
// Packaged: .env is bundled inside Contents/Resources via electron-builder extraResources.
if (app.isPackaged) {
  dotenvConfig({ path: join(process.resourcesPath, '.env') });
} else {
  dotenvConfig();
}
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
const ANIMATION_MS = 10000;
const MAX_LANES = 5;

let config: Config;
let overlay: BrowserWindow | null = null;
let settingsWin: BrowserWindow | null = null;
let paused = false;

const clientId = process.env['GOOGLE_CLIENT_ID'];
const clientSecret = process.env['GOOGLE_CLIENT_SECRET'];
if (!clientId || !clientSecret) {
  logger.error('GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET env vars are required. See .env.example.');
  app.quit();
}
const accountManager = new AccountManager(clientId!, clientSecret!);
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
  scheduler.setDelayMs(config.delayMinutes * 60_000);

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
      scheduler.setDelayMs(c.delayMinutes * 60_000);
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
      // Gate to Google URLs (defense in depth)
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
// Keep app alive when all windows close — tray icon keeps the process running.
app.on('window-all-closed', () => { /* intentional no-op — tray keeps the app alive */ });

if (!app.requestSingleInstanceLock()) app.quit();
