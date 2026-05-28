# Flight Alerts — Design

**Date:** 2026-05-28
**Status:** Design approved, ready for implementation plan
**Platform:** macOS only (MVP)

## 1. Context & goal

Build a personal macOS desktop app that connects to one or more Google accounts, reads their primary calendars, and **5 minutes before each timed event** flies a small plane across the screen carrying a banner with the event title, start time, and account email. Clicking the banner opens the event in Google Calendar.

When multiple events fire concurrently, planes appear on **distinct horizontal lanes** so they don't overlap. Each Google account has a **fixed color** chosen by the user; all planes belonging to that account share that color.

This is the user's personal side-project — not tied to any work tooling. Identity for git commits: `jeancharles.fauvin@gmail.com`.

## 2. User-facing behavior

| Concern | Decision |
|---|---|
| App format | Electron desktop app (macOS) |
| When the plane appears | 5 minutes before event start (configurable: 1 / 2 / 5 / 10 / 15 min) |
| Plane animation | Single horizontal traversal left → right, ~6 seconds, with a colored banner trailing |
| Multiple concurrent events | Stacked on horizontal lanes (top of screen, just below the macOS menu bar; vertical spacing 60px) |
| Color | Fixed per account; user-chosen from a 12-color palette (custom hex also allowed) |
| Which events qualify | Events with a precise start time (`start.dateTime`). All-day events (`start.date`) are skipped. Declined events are **included** in the MVP — filtering is a future setting. |
| Click on banner | Opens `event.htmlLink` (the Google Calendar event page) in the system browser |
| Click on the plane glyph | Same behavior as the banner |
| Hover | The overlay window selectively disables click-through only where a plane is rendered, so the user can click |

The plane itself is the emoji `✈️` in the MVP (no custom SVG), oriented as-is, sitting on the leading edge of the banner. The banner reads: `HH:MM — <title> · <account-email>`.

## 3. Architecture

A single Electron app, **one main process** and **two renderer windows**:

```
┌─────────────────────────────────────────────────────────────┐
│  Main process (Node.js)                                      │
│  ─ AccountManager       OAuth + Keychain                    │
│  ─ CalendarSync         poll Google API, normalize          │
│  ─ FlightScheduler      timeouts + lane allocation          │
│  ─ Storage              config.json read/write              │
│  ─ Tray                 macOS menubar                       │
│  ─ IPC bridge           main ↔ renderers                    │
└──────────────┬──────────────────────────┬───────────────────┘
               │                          │
               ▼                          ▼
┌──────────────────────────┐  ┌────────────────────────────┐
│ Overlay window            │  │ Settings window (React)    │
│ ─ transparent, frameless  │  │ ─ opens on demand          │
│ ─ always-on-top           │  │ ─ accounts + colors        │
│ ─ all-workspaces          │  │ ─ delay + autostart        │
│ ─ click-through default,  │  │ ─ "Add Google account"     │
│   selectively enabled on  │  │   triggers OAuth in        │
│   plane hit-test          │  │   system browser           │
│ ─ vanilla TS/CSS for      │  │ ─ "Test" button per acct   │
│   animation               │  │                            │
└──────────────────────────┘  └────────────────────────────┘
```

The overlay window is always alive; it just sits invisible until a plane is spawned via IPC. This avoids per-event window creation/destruction overhead and lets us share state (lane occupancy) inside one renderer.

## 4. Components

### 4.1 AccountManager (main)

- `addAccount()` — opens the system browser to Google's OAuth consent URL using **PKCE** (no client secret embedded), runs a short-lived loopback HTTP server on `127.0.0.1:<random>` to receive the redirect, exchanges the auth code for tokens, persists `{access_token, refresh_token, expiry}` in the macOS Keychain under service `flight-alerts`, account `<email>`.
- `listAccounts()` — returns `[{email, color, enabled, status}]` from config + Keychain status.
- `removeAccount(email)` — revokes the refresh token via Google's revocation endpoint, then deletes the Keychain entry and removes the account from config.
- `getAccessToken(email)` — returns a valid access token, refreshing transparently using the stored refresh token. Marks the account `needs_reauth` on refresh failure.

OAuth scope: `https://www.googleapis.com/auth/calendar.readonly`.

### 4.2 CalendarSync (main)

- Runs every **5 minutes**, plus once on app start, plus on `powerMonitor.resume`.
- For each enabled account: `events.list` on calendar `primary` with `timeMin=now`, `timeMax=now+24h`, `singleEvents=true`, `orderBy=startTime`, `maxResults=250`.
- Filters: drop events with `start.date` (all-day). Keep declined / tentative.
- Normalizes into `NormalizedEvent { id, accountEmail, title, startMs, endMs, htmlLink }`.
- Emits an `events:updated` event on the main bus with the consolidated list across all accounts.

Rate-limit handling: exponential backoff (1s / 2s / 4s / 8s / 16s, max 60s), max 5 retries on 429/5xx, then bail for this cycle and retry next cycle.

### 4.3 FlightScheduler (main)

- Subscribes to `events:updated`.
- Maintains a `Map<eventId, { timeoutHandle, startMs, accountEmail }>`.
- On each update, **diffs** old vs new:
  - New event → schedule `setTimeout` for `startMs - delayMs`.
  - Removed event → clear its timeout.
  - Modified event (different `startMs`) → clear and re-schedule. Title or color changes on an already-airborne plane are **not** reflected mid-animation (acceptable: animations are short).
- If `startMs - delayMs <= now < startMs` for a new event → spawn immediately.
- If `startMs <= now` → ignore (we missed it).
- On fire, asks `LaneAllocator` for a free lane, then sends `plane:spawn` IPC to the overlay with `{ id, title, startMs, accountEmail, color, htmlLink, lane }`.

### 4.4 LaneAllocator (main)

- Knows the animation duration (`6s`) and a max number of concurrent lanes (`5`).
- Returns the lowest lane index whose previous occupant's animation has finished.
- If all 5 lanes are busy → queue spawns and stagger by 1 second.

### 4.5 Storage (main)

- Config file: `~/Library/Application Support/flight-alerts/config.json`.
- Schema:
  ```json
  {
    "delayMinutes": 5,
    "autostart": true,
    "accounts": [
      { "email": "perso@gmail.com", "color": "#a78bfa", "enabled": true },
      { "email": "jc@pencil.com",   "color": "#34d399", "enabled": true }
    ]
  }
  ```
- Load: validate against a Zod schema; on failure, back up to `config.json.bak`, reset to defaults, log a warning.
- Save: write atomically (write to `config.json.tmp`, then `rename`).
- Tokens are **never** in this file — Keychain only.

### 4.6 Tray (main)

- Template image of a plane glyph (auto dark/light mode).
- Menu items: `Open Settings…`, `Pause notifications` (toggle), `Quit`.
- "Pause" is in-memory only; notifications resume on next app launch.

### 4.7 Overlay renderer

- Single full-screen transparent window, `frame: false`, `transparent: true`, `alwaysOnTop: 'floating'`, `visibleOnAllWorkspaces: true`, `focusable: false`, `hasShadow: false`, `resizable: false`.
- `setIgnoreMouseEvents(true, { forward: true })` by default.
- On `plane:spawn` IPC, appends a `<div class="plane lane-N">` containing the emoji + a `<span class="banner">` styled with `background: var(--color)`.
- Animation: CSS `@keyframes` translating `translateX(-150px → calc(100vw + 150px))` over 6 seconds, then `animationend` removes the element and tells main `lane:freed`.
- Hit-testing: on `mousemove`, the renderer checks whether the pointer is over any plane element; if so, sends `overlay:capture-mouse` to main (`setIgnoreMouseEvents(false)`); otherwise `overlay:release-mouse`. This keeps everything else click-through.
- Click on a plane element calls `window.open(htmlLink)` which is intercepted by main and opened via `shell.openExternal`.

### 4.8 Settings renderer (React)

- Lists accounts with: avatar (Gravatar from email hash), email, color swatch (clickable → picker), enable toggle, "Test" button (spawns a fake plane), "Remove" button.
- Top-level controls: delay selector (1/2/5/10/15), "Launch at login" toggle (calls main → `app.setLoginItemSettings`), "Add Google account" button.
- "Test" sends `plane:spawn` with a fixture event so the user can confirm the color and animation.
- Status indicators: green dot for healthy accounts, red dot + "Reconnect" CTA for `needs_reauth` accounts.

## 5. Data flow

```
Settings UI ──OAuth──▶ AccountManager ──tokens──▶ Keychain
                            │
                            │ access_token
                            ▼
                       CalendarSync ──GET /events──▶ Google
                            │ events:updated
                            ▼
                        Scheduler ──setTimeout──▶ (fires at start-delay)
                            │ plane:spawn
                            ▼
                         Overlay ──✈️──▶ click ──▶ shell.openExternal(htmlLink)
```

**Lifecycle of one plane:**
1. Sync at 13:50 returns event "Daily standup" at 14:00 (account perso@gmail).
2. Scheduler schedules `setTimeout` for 13:55:00.
3. At 13:55:00 → `plane:spawn` to overlay with `lane=0`.
4. Overlay renders the plane, animates 6 seconds, removes element, emits `lane:freed`.
5. If between 13:50 and 13:55 the event is deleted/moved in Google → next sync's diff clears the timeout, optionally schedules a new one.

## 6. Persistence

| Data | Where |
|---|---|
| User config (accounts, colors, delay, autostart) | `~/Library/Application Support/flight-alerts/config.json` |
| OAuth tokens (access + refresh) | macOS Keychain, service=`flight-alerts`, account=`<email>` |
| Logs | `~/Library/Logs/flight-alerts/main.log` (rotated at 5MB, via `electron-log`) |
| Cached events (most recent snapshot, for offline graceful degradation) | In-memory only — re-fetched on each cycle |

## 7. Error handling

| Case | Behavior |
|---|---|
| OAuth flow closed/refused | Settings shows "Account not added"; no intrusive toast |
| Refresh token invalid (account revoked) | macOS native notification "Reconnect <email>" → click opens Settings; account marked `needs_reauth` (red dot) |
| Google API 429 / 5xx | Exponential backoff, max 5 retries; keep last snapshot if all fail |
| No network | `net.isOnline()` check, skip cycle, retry on `online` event |
| Keychain inaccessible | Fatal at startup → error window with troubleshooting link |
| Config JSON corrupt | Backup to `.bak`, reset to defaults, log warning |
| Overlay window unexpectedly closed | Main detects, recreates the window; events stay scheduled |
| Mac wakes from sleep | `powerMonitor.resume` triggers immediate re-sync (timeouts may have drifted) |
| All 5 lanes busy | Queue overflow spawns and stagger them 1 second apart |

## 8. Security

- `contextIsolation: true`, `nodeIntegration: false`, no `enableRemoteModule`.
- Preload script exposes only a typed, minimal IPC surface (`window.flightAlerts.*`).
- Strict CSP on both renderers — no inline scripts, no remote scripts.
- OAuth client is a Google "Installed app" credential — no client secret embedded; **PKCE only**.
- Tokens never logged, never sent over IPC to renderers, never written to disk outside Keychain.
- `shell.openExternal` is gated to URLs matching `https://*.google.com/*` for the click-to-open feature (other URLs are refused).

## 9. Testing

**Principle: test pure logic aggressively; smoke-test the UI by hand.**

### Unit (Vitest)
- `FlightScheduler`: feed event fixtures, assert correct timeouts; assert diff behavior on re-sync; assert lane release; assert "already in progress" event is skipped.
- `CalendarSync.normalize()`: all-day skipped, timed normalized, recurring expanded via `singleEvents`, declined included.
- `LaneAllocator`: temporal conflicts → correct lane indices, max-lane queueing.
- `Storage`: load/save round-trip, corrupt-file fallback.

### Integration
- `AccountManager` against a **mock Google OAuth server**: full PKCE flow, refresh, revocation.
- `CalendarSync` against a **mock `events.list` endpoint**: pagination, 429 retry, 5xx fallback.

### Manual smoke (`npm run smoke`)
- Boots the app with one fake account and 3 fixture events at `now+10s`, `now+15s`, `now+10s` (collision).
- Visually verify: 3 planes, distinct lanes, correct colors, click opens a URL.

### Not automated
- Visual rendering of the overlay (CSS, animation smoothness).
- `Tray` and `app.setLoginItemSettings` (native macOS APIs).
- `powerMonitor.resume` (verified manually by sleeping the Mac).

## 10. Tech stack summary

- **Runtime:** Electron (latest stable), Node.js (bundled by Electron).
- **Language:** TypeScript everywhere (`strict: true`).
- **UI (Settings):** React 18 + Vite.
- **UI (Overlay):** Vanilla TypeScript + CSS animations (no framework — overhead would be silly for a few `<div>`s).
- **Bundler / dev:** `electron-vite`.
- **OAuth helpers:** `openid-client` (handles PKCE), or manual `fetch` against Google's endpoints — to decide during planning.
- **Keychain:** `keytar`.
- **Schema validation:** `zod`.
- **Logging:** `electron-log`.
- **Tests:** `vitest` + `nock` (for Google API mocks).
- **Packaging:** `electron-builder` → notarized `.dmg` for distribution (signing/notarizing is a stretch goal — local `npm run build` is the MVP target).

## 11. Out of scope (MVP)

- Windows / Linux support.
- Multiple calendars per account (only `primary`).
- Filtering rules (decline / focus time / keyword regex) — design supports adding this later in `CalendarSync` filters.
- Snooze / skip individual events.
- Custom plane SVG / non-emoji glyphs.
- Sound effects.
- Multi-monitor lane assignment (the overlay covers the primary display only).
- Auto-update / crash reporting.

## 12. Open questions

None at design time — all decisions captured above. Implementation choices (specific OAuth library, exact CSS animation curve, lane vertical spacing pixel-precision) will be made during the build.
