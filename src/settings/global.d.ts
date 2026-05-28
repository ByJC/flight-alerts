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
