import { contextBridge, ipcRenderer } from 'electron';
import type { Config } from '../main/types';

contextBridge.exposeInMainWorld('flightAlerts', {
  getConfig: (): Promise<Config> => ipcRenderer.invoke('config:get'),
  updateConfig: (c: Config): Promise<void> => ipcRenderer.invoke('config:update', c),
  addAccount: (): Promise<{ email: string }> => ipcRenderer.invoke('account:add'),
  removeAccount: (email: string): Promise<void> => ipcRenderer.invoke('account:remove', email),
  testPlane: (email: string): Promise<void> => ipcRenderer.invoke('account:test', email),
});
