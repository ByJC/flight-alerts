import { ipcMain, type BrowserWindow } from 'electron';
import type { Config, PlaneSpawnPayload } from './types';

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
