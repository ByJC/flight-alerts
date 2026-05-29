# Per-account plane icon Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let each Google account pick its own plane icon — an emoji from a palette (or freely typed) or a custom uploaded image — defaulting to ✈️, so existing configs are unchanged.

**Architecture:** Add an `AccountIcon` discriminated union (`emoji` | `image` data-URI) to the account config. Pure validation/size helpers live in `src/main/icon.ts` (node-testable). The Zod schema validates and defaults the field. The main process resolves the icon per account (`iconFor`, twin of `colorFor`) into the existing `PlaneSpawnPayload`, and the overlay renders a `<span>` (emoji) or `<img>` (image). Settings gets an `IconPicker` component mirroring the existing `ColorPicker`, with an in-renderer canvas downscale (~128px) before base64 encoding.

**Tech Stack:** Electron, TypeScript, React (settings renderer), Zod (config validation), Vitest (unit tests). No new dependencies.

---

## Spec

See `docs/superpowers/specs/2026-05-29-per-account-icon-design.md`.

## File structure

- `src/main/types.ts` — add `AccountIcon`, `AccountConfig.icon`, `PlaneSpawnPayload.icon`.
- `src/main/icon.ts` *(new)* — `DEFAULT_ACCOUNT_ICON`, `MAX_ICON_BYTES`, `dataUriByteSize`, `isValidIconImage`. Pure, node-testable, importable by both main and renderer (renderer already imports `../main/types`).
- `src/main/storage.ts` — extend Zod account schema with `icon` + default.
- `src/main/index.ts` — `iconFor(email)`, add `icon` to payload, set `icon` on `addAccount`.
- `src/overlay/overlay.ts` — render emoji vs image glyph.
- `src/overlay/overlay.css` — `img.glyph` sizing.
- `src/settings/downscale.ts` *(new)* — `fileToIconDataUri(file, maxSide)` (canvas downscale; renderer-only).
- `src/settings/IconPicker.tsx` *(new)* — picker UI (emoji palette + free entry + image upload).
- `src/settings/AccountRow.tsx` — mount `IconPicker`.
- `src/settings/settings.css` — picker styles.
- `tests/unit/icon.test.ts` *(new)* — pure helper tests.
- `tests/unit/storage.test.ts` — new icon cases + fix existing round-trip test.

## Testing reality

Only main-process logic is unit-tested in this repo (vitest, node env — no jsdom). So Tasks 1–2 are TDD. Task 3 (main wiring), Task 4 (overlay DOM), and Task 5 (React + canvas) have no existing test harness and would require introducing jsdom/canvas mocks — out of scope (YAGNI). Those are verified by `npm run typecheck` and a manual smoke run. Do **not** add a test framework for them.

---

### Task 1: Icon types + pure helpers

**Files:**
- Modify: `src/main/types.ts`
- Create: `src/main/icon.ts`
- Test: `tests/unit/icon.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/icon.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { DEFAULT_ACCOUNT_ICON, MAX_ICON_BYTES, dataUriByteSize, isValidIconImage } from '../../src/main/icon';

const tinyPng = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M8AAAMBAQDJ/pLvAAAAAElFTkSuQmCC';

describe('icon helpers', () => {
  it('default icon is the plane emoji', () => {
    expect(DEFAULT_ACCOUNT_ICON).toEqual({ type: 'emoji', value: '✈️' });
  });

  it('dataUriByteSize returns decoded byte length, not string length', () => {
    // The base64 payload of tinyPng decodes to far fewer bytes than its string length.
    const size = dataUriByteSize(tinyPng);
    expect(size).toBeGreaterThan(0);
    expect(size).toBeLessThan(tinyPng.length);
  });

  it('dataUriByteSize falls back to string length when no base64 marker', () => {
    expect(dataUriByteSize('not-a-data-uri')).toBe('not-a-data-uri'.length);
  });

  it('accepts a small valid png data URI', () => {
    expect(isValidIconImage(tinyPng)).toBe(true);
  });

  it('rejects a non-image data URI', () => {
    expect(isValidIconImage('data:text/plain;base64,aGk=')).toBe(false);
  });

  it('rejects an image data URI over the size limit', () => {
    const huge = 'data:image/png;base64,' + 'A'.repeat(MAX_ICON_BYTES * 2);
    expect(isValidIconImage(huge)).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/icon.test.ts`
Expected: FAIL — cannot resolve `../../src/main/icon` (module does not exist).

- [ ] **Step 3: Add the `AccountIcon` type to `src/main/types.ts`**

Add above `AccountConfig`:

```ts
export type AccountIcon =
  | { type: 'emoji'; value: string }   // e.g. '✈️', '🚀'
  | { type: 'image'; value: string };  // data URI, e.g. 'data:image/png;base64,...'
```

Add the `icon` field to `AccountConfig` (now required):

```ts
export interface AccountConfig {
  email: string;
  color: string;
  icon: AccountIcon;
  enabled: boolean;
}
```

Add the `icon` field to `PlaneSpawnPayload` (place it next to `color`):

```ts
  color: string;
  icon: AccountIcon;
```

- [ ] **Step 4: Create `src/main/icon.ts`**

```ts
import type { AccountIcon } from './types';

export const DEFAULT_ACCOUNT_ICON: AccountIcon = { type: 'emoji', value: '✈️' };

// Upper bound for a stored image data URI (decoded bytes). Keeps config.json small.
export const MAX_ICON_BYTES = 200_000;

/** Decoded byte length of a base64 data URI; falls back to string length if not base64. */
export function dataUriByteSize(uri: string): number {
  const marker = uri.indexOf('base64,');
  if (marker === -1) return uri.length;
  const b64 = uri.slice(marker + 'base64,'.length);
  const padding = b64.endsWith('==') ? 2 : b64.endsWith('=') ? 1 : 0;
  return Math.floor((b64.length * 3) / 4) - padding;
}

/** A storable icon image: png/jpeg/webp/svg base64 data URI within the size limit. */
export function isValidIconImage(uri: string): boolean {
  return /^data:image\/(png|jpeg|webp|svg\+xml);base64,/.test(uri)
    && dataUriByteSize(uri) <= MAX_ICON_BYTES;
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run tests/unit/icon.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 6: Commit**

```bash
git add src/main/types.ts src/main/icon.ts tests/unit/icon.test.ts
git commit -m "feat(icon): AccountIcon type + pure validation/size helpers"
```

---

### Task 2: Storage schema + default

**Files:**
- Modify: `src/main/storage.ts`
- Test: `tests/unit/storage.test.ts:25-29` (fix existing) and new cases

- [ ] **Step 1: Write the failing tests**

In `tests/unit/storage.test.ts`, first update the **import** line (5) to add the icon helper:

```ts
import { loadConfig, saveConfig, DEFAULT_CONFIG } from '../../src/main/storage';
import { DEFAULT_ACCOUNT_ICON } from '../../src/main/icon';
```

Replace the existing "round-trips a valid config" test (currently lines 25-29) — the account now needs an `icon`:

```ts
  it('round-trips a valid config', () => {
    const cfg = { delayMinutes: 10, dismissSeconds: 30, planeSize: 'large' as const, autostart: false, accounts: [{ email: 'a@b.com', color: '#ff0000', icon: { type: 'emoji' as const, value: '🚀' }, enabled: true }] };
    saveConfig(path, cfg);
    expect(loadConfig(path)).toEqual(cfg);
  });
```

Add these new tests inside the `describe('storage', ...)` block:

```ts
  it('round-trips an account with an image icon', () => {
    const tinyPng = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M8AAAMBAQDJ/pLvAAAAAElFTkSuQmCC';
    const cfg = { delayMinutes: 5, dismissSeconds: 20, planeSize: 'medium' as const, autostart: true, accounts: [{ email: 'a@b.com', color: '#ff0000', icon: { type: 'image' as const, value: tinyPng }, enabled: true }] };
    saveConfig(path, cfg);
    expect(loadConfig(path)).toEqual(cfg);
  });

  it('defaults a missing account icon to the plane emoji (backward-compat)', () => {
    writeFileSync(path, JSON.stringify({ delayMinutes: 5, dismissSeconds: 20, planeSize: 'medium', autostart: true, accounts: [{ email: 'a@b.com', color: '#ff0000', enabled: true }] }));
    const cfg = loadConfig(path);
    expect(cfg.accounts[0]!.icon).toEqual(DEFAULT_ACCOUNT_ICON);
  });

  it('rejects an account whose image icon is not a valid image data URI', () => {
    writeFileSync(path, JSON.stringify({ delayMinutes: 5, dismissSeconds: 20, planeSize: 'medium', autostart: true, accounts: [{ email: 'a@b.com', color: '#ff0000', icon: { type: 'image', value: 'data:text/plain;base64,aGk=' }, enabled: true }] }));
    const cfg = loadConfig(path);
    expect(cfg).toEqual(DEFAULT_CONFIG); // falls back on schema violation
    expect(existsSync(path + '.bak')).toBe(true);
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/unit/storage.test.ts`
Expected: FAIL — the image round-trip and backward-compat tests fail because `icon` is not yet in the schema (icon dropped/not defaulted), and the reject test does not write a `.bak` (schema currently accepts the unknown `icon` key by ignoring it).

- [ ] **Step 3: Add the icon schema to `src/main/storage.ts`**

Add the import near the top (after the `types` import):

```ts
import { DEFAULT_ACCOUNT_ICON, isValidIconImage } from './icon';
```

In `ConfigSchema`, extend the account object — add the `icon` field between `color` and `enabled`:

```ts
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
```

(`DEFAULT_CONFIG` is unchanged — it has no accounts.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/unit/storage.test.ts`
Expected: PASS (all cases, including the updated round-trip).

- [ ] **Step 5: Run the full suite + typecheck**

Run: `npm test && npm run typecheck`
Expected: all tests PASS; typecheck has no errors.

- [ ] **Step 6: Commit**

```bash
git add src/main/storage.ts tests/unit/storage.test.ts
git commit -m "feat(storage): validate + default per-account icon"
```

---

### Task 3: Main-process payload wiring

**Files:**
- Modify: `src/main/index.ts` (add `iconFor`; payload `icon`; `addAccount` icon)

No unit test (the repo does not test `index.ts`; `colorFor` is likewise untested). Verified by typecheck.

- [ ] **Step 1: Import the default icon**

In `src/main/index.ts`, add to the existing imports from `./types`/local modules:

```ts
import { DEFAULT_ACCOUNT_ICON } from './icon';
```

- [ ] **Step 2: Add `iconFor`, twin of `colorFor`**

Immediately after the `colorFor` function (currently `index.ts:48-50`):

```ts
function iconFor(email: string): import('./types').AccountIcon {
  return config.accounts.find((a) => a.email === email)?.icon ?? DEFAULT_ACCOUNT_ICON;
}
```

- [ ] **Step 3: Add `icon` to the spawn payload**

In `spawnPlane()` (currently `index.ts:56-66`), add the `icon` field right after the `color` line:

```ts
    color: colorFor(event.accountEmail),
    icon: iconFor(event.accountEmail),
```

- [ ] **Step 4: Set `icon` when adding an account**

In `addAccount` (currently `index.ts:116`), update the pushed account literal:

```ts
        config.accounts.push({ email, color: pickNextColor(config.accounts), icon: DEFAULT_ACCOUNT_ICON, enabled: true });
```

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck`
Expected: no errors. (Payload now requires `icon`; the test-spawn path at `index.ts:129` flows through `spawnPlane`, which fills `icon` via `iconFor`, so no other change is needed.)

- [ ] **Step 6: Commit**

```bash
git add src/main/index.ts
git commit -m "feat(main): resolve per-account icon into spawn payload"
```

---

### Task 4: Overlay renders emoji or image

**Files:**
- Modify: `src/overlay/overlay.ts:21-23` (glyph creation)
- Modify: `src/overlay/overlay.css` (img glyph sizing)

No unit test (no DOM harness). Verified by typecheck + manual smoke.

- [ ] **Step 1: Replace the hardcoded glyph in `src/overlay/overlay.ts`**

Replace the current three lines:

```ts
  const glyph = document.createElement('span');
  glyph.className = 'glyph';
  glyph.textContent = '✈️';
```

with:

```ts
  let glyph: HTMLElement;
  if (p.icon.type === 'image') {
    const img = document.createElement('img');
    img.src = p.icon.value;
    img.alt = '';
    glyph = img;
  } else {
    glyph = document.createElement('span');
    glyph.textContent = p.icon.value;
  }
  glyph.className = 'glyph';
```

(`el.append(glyph, banner, close)` and the existing `glyph.addEventListener('click', ...)` already work for both element types.)

- [ ] **Step 2: Add image-glyph sizing to `src/overlay/overlay.css`**

Immediately after the existing `.plane .glyph { ... }` rule (currently lines 68-74):

```css
.plane img.glyph {
  width: var(--glyph-size);
  height: var(--glyph-size);
  object-fit: contain;
}
```

(The shared `.plane .glyph` rule already provides the right margin, drop-shadow, and cursor for both span and img; `font-size`/`line-height` are simply ignored by the img.)

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/overlay/overlay.ts src/overlay/overlay.css
git commit -m "feat(overlay): render per-account emoji or image glyph"
```

---

### Task 5: Settings IconPicker (downscale + UI)

**Files:**
- Create: `src/settings/downscale.ts`
- Create: `src/settings/IconPicker.tsx`
- Modify: `src/settings/AccountRow.tsx`
- Modify: `src/settings/settings.css`

No unit test (React + canvas, no jsdom/canvas harness). Verified by typecheck + manual smoke.

- [ ] **Step 1: Create the downscale helper `src/settings/downscale.ts`**

```ts
/**
 * Read an image File, downscale so its longest side is <= maxSide (preserving
 * aspect ratio), and return a PNG data URI. SVGs are returned unchanged (already
 * small and resolution-independent).
 */
export async function fileToIconDataUri(file: File, maxSide = 128): Promise<string> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error ?? new Error('read failed'));
    reader.readAsDataURL(file);
  });

  if (file.type === 'image/svg+xml') return dataUrl;

  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const i = new Image();
    i.onload = () => resolve(i);
    i.onerror = () => reject(new Error('decode failed'));
    i.src = dataUrl;
  });

  const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
  const w = Math.max(1, Math.round(img.width * scale));
  const h = Math.max(1, Math.round(img.height * scale));

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('no 2d context');
  ctx.drawImage(img, 0, 0, w, h);
  return canvas.toDataURL('image/png');
}
```

- [ ] **Step 2: Create `src/settings/IconPicker.tsx`**

Mirrors `ColorPicker.tsx` (button + toggled popover).

```tsx
import { useRef, useState } from 'react';
import type { AccountIcon } from '../main/types';
import { MAX_ICON_BYTES, dataUriByteSize } from '../main/icon';
import { fileToIconDataUri } from './downscale';

const EMOJIS = ['✈️', '🚀', '🚁', '🚂', '🚗', '🚲', '⛵', '🛸', '🚕', '🛵', '🏍️', '🚌'];

export function IconPicker({ value, onChange }: { value: AccountIcon; onChange: (icon: AccountIcon) => void }) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleFile = async (file: File) => {
    setError(null);
    try {
      const uri = await fileToIconDataUri(file);
      if (dataUriByteSize(uri) > MAX_ICON_BYTES) {
        setError('Image too large — pick a smaller one.');
        return;
      }
      onChange({ type: 'image', value: uri });
      setOpen(false);
    } catch {
      setError('Could not read that image.');
    }
  };

  return (
    <div style={{ position: 'relative' }}>
      <button type="button" className="icon-trigger" onClick={() => setOpen((o) => !o)} aria-label="Choose icon">
        {value.type === 'image' ? <img src={value.value} alt="" /> : <span>{value.value}</span>}
      </button>
      {open && (
        <div className="icon-popover" style={{ position: 'absolute', top: 32, left: 0, zIndex: 10 }}>
          <div className="emoji-grid">
            {EMOJIS.map((e) => (
              <button
                type="button"
                key={e}
                className={value.type === 'emoji' && value.value === e ? 'selected' : ''}
                onClick={() => { onChange({ type: 'emoji', value: e }); setOpen(false); }}
              >
                {e}
              </button>
            ))}
          </div>
          <input
            className="emoji-input"
            type="text"
            maxLength={8}
            placeholder="Or type an emoji"
            onKeyDown={(ev) => {
              if (ev.key !== 'Enter') return;
              const v = (ev.target as HTMLInputElement).value.trim();
              if (v) { onChange({ type: 'emoji', value: v }); setOpen(false); }
            }}
          />
          <button type="button" className="upload-btn" onClick={() => fileRef.current?.click()}>
            Upload image…
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            hidden
            onChange={(ev) => {
              const f = ev.target.files?.[0];
              if (f) handleFile(f);
              ev.target.value = '';
            }}
          />
          {error && <p className="icon-error">{error}</p>}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Mount the picker in `src/settings/AccountRow.tsx`**

Add the import beside the existing `ColorPicker` import:

```tsx
import { ColorPicker } from './ColorPicker';
import { IconPicker } from './IconPicker';
```

Add the `IconPicker` right after the `ColorPicker` line in the returned JSX:

```tsx
      <ColorPicker value={account.color} onChange={(c) => onChange({ ...account, color: c })} />
      <IconPicker value={account.icon} onChange={(icon) => onChange({ ...account, icon })} />
```

- [ ] **Step 4: Add picker styles to `src/settings/settings.css`**

Append at the end of the file:

```css
.icon-trigger {
  width: 32px; height: 32px;
  padding: 0;
  display: flex; align-items: center; justify-content: center;
  font-size: 18px; line-height: 1;
}
.icon-trigger img { width: 22px; height: 22px; object-fit: contain; }

.icon-popover {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 8px;
  background: #fff;
  border: 1px solid #ccc;
  border-radius: 8px;
  width: 220px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
}
.icon-popover .emoji-grid {
  display: grid;
  grid-template-columns: repeat(6, 1fr);
  gap: 4px;
}
.icon-popover .emoji-grid button {
  padding: 4px;
  font-size: 18px;
  border: 1px solid transparent;
}
.icon-popover .emoji-grid button.selected { border-color: #111; }
.icon-popover .emoji-input { padding: 4px 6px; border: 1px solid #ccc; border-radius: 6px; font: inherit; }
.icon-popover .upload-btn { font: inherit; }
.icon-popover .icon-error { color: #ef4444; margin: 0; font-size: 12px; }
```

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 6: Manual smoke run**

Run: `npm run dev`
Verify, in the Settings window:
1. Each account row shows an icon button (✈️ by default).
2. Clicking it opens the popover; picking an emoji updates the button and persists (reopen Settings → still set).
3. Typing an emoji + Enter sets it.
4. "Upload image…" → pick a PNG → button shows the thumbnail; an oversized image shows the error message.
5. Click **Test** on a row → the flying plane shows that account's icon (emoji or image).

- [ ] **Step 7: Commit**

```bash
git add src/settings/downscale.ts src/settings/IconPicker.tsx src/settings/AccountRow.tsx src/settings/settings.css
git commit -m "feat(settings): per-account icon picker with emoji + image upload"
```

---

## Final verification

- [ ] Run: `npm test` — all unit tests pass (including new `icon.test.ts` and updated `storage.test.ts`).
- [ ] Run: `npm run typecheck` — no errors.
- [ ] Confirm via the manual smoke run (Task 5, Step 6) that icons render in both Settings and the overlay, and that an existing config without `icon` still loads with the plane default.
