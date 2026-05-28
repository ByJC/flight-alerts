import type { PlaneSpawnPayload } from '../main/types';

declare global {
  interface Window {
    overlay: {
      onPlaneSpawn(cb: (p: PlaneSpawnPayload) => void): void;
      setMouseCapture(capture: boolean): void;
      releaseLane(lane: number): void;
      openExternal(url: string): Promise<void>;
    };
  }
}
export {};
