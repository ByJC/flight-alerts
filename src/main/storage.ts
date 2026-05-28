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
