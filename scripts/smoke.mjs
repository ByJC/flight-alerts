// Run: npm run smoke
// Manual e2e smoke checklist — visual verification is the actual test.

console.log(`
Flight Alerts — manual smoke checklist
=======================================

1. Make sure .env exists with GOOGLE_CLIENT_ID set (see .env.example).
2. Run: npm run dev
3. Add at least one Google account via tray icon → Open Settings → + Add account.
4. In Settings, click "Test" three times rapidly on the same account.
5. Confirm:
     - three planes traverse the screen left -> right
     - they sit on lanes 0, 1, 2 (~60 px apart, just below the menu bar)
     - each banner shows TIME — TITLE  ACCOUNT
     - colors match the account's color in Settings
     - hovering a plane captures the cursor (banner is clickable)
     - clicking opens https://calendar.google.com
6. Wait for a real event within the configured delay (default 5 min) and confirm
   the real plane appears with the actual title.
7. Toggle "Pause notifications" in the tray menu and Test again — nothing spawns.
   Toggle back and Test — spawns resume.
`);
