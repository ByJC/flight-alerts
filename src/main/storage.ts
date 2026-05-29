import { existsSync, readFileSync, writeFileSync, renameSync } from 'node:fs';
import { z } from 'zod';
import type { Config } from './types';
import { DEFAULT_ACCOUNT_ICON, isValidIconImage } from './icon';
import { logger } from './logger';

const ConfigSchema = z.object({
  delayMinutes: z.number().int().positive(),
  // Optional in the parsed JSON so configs written before these fields existed still load cleanly;
  // resolved to a Config (required) by the Zod defaults.
  dismissSeconds: z.number().int().positive().default(20),
  planeSize: z.enum(['small', 'medium', 'large']).default('medium'),
  autostart: z.boolean(),
  accounts: z.array(
    z.object({
      email: z.string().email(),
      color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
      icon: z
        .discriminatedUnion('type', [
          z.object({ type: z.literal('emoji'), value: z.string().min(1).max(8) }),
          z.object({ type: z.literal('image'), value: z.string().refine(isValidIconImage, 'invalid image data URI') }),
        ])
        .default(DEFAULT_ACCOUNT_ICON),
      enabled: z.boolean(),
    }),
  ),
});

export const DEFAULT_CONFIG: Config = {
  delayMinutes: 5,
  dismissSeconds: 20,
  planeSize: 'medium',
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
