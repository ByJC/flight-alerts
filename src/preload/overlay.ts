import { contextBridge, ipcRenderer } from 'electron';
import type { PlaneSpawnPayload } from '../main/types';

contextBridge.exposeInMainWorld('overlay', {
  onPlaneSpawn: (cb: (p: PlaneSpawnPayload) => void) => {
    ipcRenderer.on('plane:spawn', (_e, p: PlaneSpawnPayload) => cb(p));
  },
  setMouseCapture: (capture: boolean) => ipcRenderer.send('overlay:mouse-capture', capture),
  openExternal: (url: string): Promise<void> => ipcRenderer.invoke('shell:open', url),
});
