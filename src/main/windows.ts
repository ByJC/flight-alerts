import { BrowserWindow, screen } from 'electron';
import { join } from 'node:path';

const isDev = !!process.env['ELECTRON_RENDERER_URL'];

function loadRenderer(win: BrowserWindow, name: 'settings' | 'overlay'): void {
  if (isDev) {
    // Vite dev server serves files at their original filesystem path (relative to project root).
    // Our HTML entries live at src/<name>/index.html.
    win.loadURL(`${process.env['ELECTRON_RENDERER_URL']}/src/${name}/index.html`);
  } else {
    // Production: matches the rollup output structure (preserves source dirs).
    win.loadFile(join(__dirname, `../renderer/src/${name}/index.html`));
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
  win.on('ready-to-show', () => {
    win.show();
    if (isDev) win.webContents.openDevTools({ mode: 'detach' });
  });
  loadRenderer(win, 'settings');
  return win;
}
