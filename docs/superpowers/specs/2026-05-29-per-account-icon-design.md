# Per-account plane icon — design

Date: 2026-05-29
Status: Approved (pending implementation plan)

## Goal

Make the plane glyph configurable **per account**, the same way `color` already
is. Today the overlay renders a hardcoded `'✈️'` for every plane
(`src/overlay/overlay.ts:23`). Each account should be able to pick its own icon:
either an **emoji** from a palette (or freely typed) or a **custom uploaded
image**. The default remains the plane emoji, so existing setups are unchanged.

## Non-goals

- No per-event icons. Icon is resolved per account only.
- No icon library / predefined vector set bundled with the app.
- No preservation of the original full-resolution upload — images are
  downscaled to ~128px on upload (see Storage).
- No animation changes; the icon swaps in place of the current glyph.

## Data model

Add an `icon` field to `AccountConfig` as a discriminated union — explicit,
type-safe, and easy to extend later.

```ts
// src/main/types.ts
export type AccountIcon =
  | { type: 'emoji'; value: string }   // e.g. '✈️', '🚀', '🚗'
  | { type: 'image'; value: string };  // data URI, e.g. 'data:image/png;base64,...'

export interface AccountConfig {
  email: string;
  color: string;
  icon: AccountIcon;   // new
  enabled: boolean;
}
```

The default icon is `{ type: 'emoji', value: '✈️' }`, exported as a shared
constant (e.g. `DEFAULT_ACCOUNT_ICON`) so the Zod default, `addAccount`, and any
fallback all reference the same value.

### Backward compatibility

Existing `config.json` files have accounts with no `icon`. The Zod schema makes
`icon` optional at parse time with `.default(DEFAULT_ACCOUNT_ICON)`, so old
configs load cleanly and resolve to the plane emoji. This mirrors how
`dismissSeconds` and `planeSize` were introduced (see `src/main/storage.ts`).

## Storage & validation (Zod)

In `src/main/storage.ts`, extend `ConfigSchema`'s account object with:

```ts
icon: z.discriminatedUnion('type', [
  z.object({ type: z.literal('emoji'), value: z.string().min(1).max(8) }),
  z.object({ type: z.literal('image'), value: z.string().regex(/^data:image\/(png|jpeg|webp|svg\+xml);base64,/) }),
]).default(DEFAULT_ACCOUNT_ICON),
```

- Emoji: 1–8 chars (covers multi-codepoint emoji + ZWJ sequences).
- Image: must be a `data:image/...;base64,` URI.
- A hard size guard rejects images whose data URI exceeds ~200 KB after
  compression (validated at parse and/or at upload time).

`DEFAULT_CONFIG` is unchanged (it has no accounts). `saveConfig` already
re-validates via `ConfigSchema.parse`, so an invalid icon throws on save.

## Image handling on upload (renderer)

Custom images are stored inline as base64 **data URIs** in `config.json` (no
separate file lifecycle to manage — chosen for a self-contained personal app).

To keep the config small, the renderer downscales before encoding:

1. User picks a file via `<input type="file" accept="image/*">`.
2. Load into an `Image`, draw onto a `<canvas>` scaled so the longest side is
   **≤ 128px** (preserve aspect ratio).
3. Export via `canvas.toDataURL('image/png')` (or `image/webp` if smaller).
4. If the result still exceeds the ~200 KB guard, reject with a clear inline
   error.
5. SVG uploads may be stored as-is (they're already small and scale cleanly),
   subject to the same size guard.

## UI — `IconPicker` component (new)

New `src/settings/IconPicker.tsx`, built on the exact pattern of
`ColorPicker.tsx` (button + toggled popover, same CSS conventions in
`settings.css`). Placed in `AccountRow` next to the color swatch.

- **Trigger button**: shows the current icon — the emoji glyph, or a small
  thumbnail `<img>` of the data URI.
- **Popover** contains:
  - A palette of preset emojis: ✈️ 🚀 🚁 🚂 🚗 🚲 ⛵ 🛸 🚕 🛵 🏍️ 🚌 (a short
    fixed list; mirrors the fixed `PALETTE` array in `ColorPicker`).
  - A text input to type/paste any emoji (sets `{ type: 'emoji', value }`).
  - An **"Upload image"** button (`<input type="file">`) that runs the downscale
    pipeline and sets `{ type: 'image', value: dataUri }`.

`AccountRow` gets the icon through the same `onChange({ ...account, icon })`
flow it already uses for `color`.

## Propagation to the overlay

1. `PlaneSpawnPayload` (`src/main/types.ts`) gains `icon: AccountIcon`.
2. `src/main/index.ts`: add `iconFor(email)` — twin of `colorFor` — returning
   the account's icon or `DEFAULT_ACCOUNT_ICON`. Include it in the payload built
   in `spawnPlane()`. The test-spawn path (around `index.ts:129`) passes the
   default too.
3. `src/overlay/overlay.ts`: replace the hardcoded
   `glyph.textContent = '✈️'` with a branch on `p.icon.type`:
   - `emoji` → `<span class="glyph">` with `textContent = p.icon.value`.
   - `image` → `<img class="glyph">` with `src = p.icon.value`, sized to
     `--glyph-size` (square, `object-fit: contain`), keeping the existing
     `drop-shadow`.

CSS: in `overlay.css`, ensure `.plane .glyph` works for both a text span and an
`img` (set `width/height: var(--glyph-size)` and `object-fit: contain` on the
img variant; the existing `font-size`/`drop-shadow` already cover the span).

## Testing

- `tests/unit/storage.test.ts`:
  - Config with an `emoji` icon round-trips through parse/save.
  - Config with an `image` data-URI icon round-trips.
  - Config whose account omits `icon` loads with the default plane emoji
    (backward-compat).
  - Invalid icon (bad image string, oversized data URI) is rejected.
- Unit-test `iconFor` (or the payload builder) returns the account icon and
  falls back to the default for an unknown email.

## Files touched

- `src/main/types.ts` — `AccountIcon`, `AccountConfig.icon`, payload field,
  `DEFAULT_ACCOUNT_ICON`.
- `src/main/storage.ts` — Zod schema + default.
- `src/main/index.ts` — `iconFor`, payload wiring, test-spawn path.
- `src/overlay/overlay.ts` — render emoji vs image.
- `src/overlay/overlay.css` — image glyph sizing.
- `src/settings/IconPicker.tsx` — new component.
- `src/settings/AccountRow.tsx` — mount the picker.
- `src/settings/settings.css` — picker styles (reuse color picker styles where
  possible).
- `tests/unit/storage.test.ts` — new cases.
