# 11 — Fix animations, case-insensitive sort (g), What's new (c), install prompt [P0/P2]

> **Goal:** the app moves like To Do (A1–A20), "What's new" has content, alphabetical sort is case-insensitive, and the PWA can be installed.
> **Start only after:** files 01–10 (animations attach to the UI those files build).
> **Next file:** `12_final_verification_round2.md`.
> **Plan reference:** Plan `06` (§7, A1–A20), Plan `08` (§9 PWA), Plan `10` (A.11).

## Current (observed 09:57)

- **Menus and the detail pane appeared instantly in screenshots; no slide/FLIP/completion animation was observed** (completion animation could not be tested without completing a task).
- **Regression (g): alphabetical sort is case-sensitive** — "test item 2", "test item1", "Test list item 1" (lowercase before uppercase). Must be case-insensitive.
- **Regression (c): Help → "What's new" opens a dialog with no visible content (title only).**
- **No install prompt or install button was observed anywhere** (page, Settings, Help).
- Sync indicator exists: "Sync — Up to date" ✓ in the top bar and Help menu (keep it; file 13's job is to make it change state, not this file).

## Exact spec

### 11.1 Regression (g): case-insensitive alphabetical sort [P0 — do first]

- Alphabetical sort must compare **`title.toLowerCase()`** (locale-aware: `localeCompare` with `{ sensitivity: "base" }`).
- Expected order for the live data: "Test list item 1", "test item1", "test item 2" (i.e. "Test list…" < "test item1" < "test item 2" — compare "test list item 1" < "test item1" < "test item 2": "test item" vs "test list" — "i" < "l", so "test item1" and "test item 2" come **before** "Test list item 1"). The exact expected order is: **"test item1", "test item 2", "Test list item 1"**.
- Verify with scratch tasks named "apple", "Banana", "cherry", "Apricot" → order must be apple, Apricot, Banana, cherry.
- Apply the same case-insensitive comparison to the **list** sort (Alphabetically in the sidebar sort) and to **search** ranking (already case-insensitive — verify).

### 11.2 Regression (c): "What's new" must have content [P0 — do second]

- The "What's new" dialog must list the actual changes in this version, in plain language, e.g.:
  - "New: top bar with search, Settings, and sync status"
  - "New: All smart list and Settings panel"
  - "New: sort menu with reverse and remove"
  - "New: custom date and reminder pickers"
  - "Fixed: a task now belongs to exactly one list"
- The content is **data-driven**: read it from a `CHANGELOG.md` / versioned release-notes file in the repo, not hard-coded in the component. Each release adds an entry; the dialog shows the latest 3 releases with dates.
- Empty dialog (title only) is a regression — the dialog must never render with no body content; if the changelog is empty, show "No release notes yet."

### 11.3 Animations A1–A20 (plan 06 — the full list, unchanged)

Implement all of these; the 09:57 check observed **none** of them:

- **A1** Add task: row slides/fades in from the top (180ms ease-out), checkbox pops.
- **A2** Complete task: checkmark draws (200ms), title strikes through with a line wipe (200ms), row fades to 50% opacity, then slides down to the Completed section (FLIP, 250ms). **Play the completion sound if enabled.**
- **A3** Uncomplete: reverse of A2.
- **A4** Star: star fills with a 150ms pop (scale 1 → 1.3 → 1); row FLIPs to the top if "Move starred tasks to top" is On.
- **A5** Add to My Day: sun icon fills, toast "Added to My Day" (not a dialog).
- **A6** Delete task: row collapses (height → 0, 200ms) then disappears; toast with Undo (5s).
- **A7** Drag reorder: dragged row lifts (shadow + 2% scale), other rows FLIP to their new positions; on drop, the row settles with a 100ms bounce.
- **A8** List switch: content cross-fades (150ms) — no flash of the old list's tasks.
- **A9** Detail pane: slides in from the right (250ms ease-out); closes by sliding out.
- **A10** Sidebar collapse: width animates 360px → 65px (200ms ease-in-out).
- **A11** Sort change: rows FLIP to new order (250ms).
- **A12** Menu open: scale 0.95 → 1 + fade (120ms); submenu slides in from the left (150ms).
- **A13** Toast: slides up from the bottom (200ms), auto-dismisses after 4s, Undo button on delete toasts.
- **A14** Suggestion [+] click: row shrinks and fades, then the My Day count badge pops (150ms).
- **A15** Add step: step row fades in; completing a step strikes it through.
- **A16** Search: dropdown fades in; results page cross-fades.
- **A17** Theme change: colours cross-fade (200ms), no flash.
- **A18** My Day reset: at midnight the list fades out and back in empty.
- **A19** Sync: "Syncing…" spinner → "Sync — Up to date" ✓ with a 150ms checkmark pop.
- **A20** Invalid action (e.g. empty group name): the input shakes (300ms).
- **Reduced motion:** `prefers-reduced-motion` disables all of the above (instant state changes only). Test with reduced motion on.
- **Performance:** 60fps on a mid-range phone; no animation may block input for >100ms.

### 11.4 PWA install (still missing)

- The app is a PWA (plan §9) but **no install prompt or install button was observed**. Add both:
  1. **Install button** in Settings → About ("Install app") — visible only when the `beforeinstallprompt` event has fired (i.e. the browser allows installing); hidden on iOS (where installation is via Share → Add to Home Screen — show that instruction instead).
  2. **Install prompt banner** (dismissible, shown once per version) on first visit when installable.
- Verify: `manifest.json` (name, short_name, icons 192 + 512, `display: standalone`, theme colour), service worker registered, offline shell loads (airplane mode → the app shell + cached data open, with an "You're offline" banner).
- iOS: `apple-touch-icon`, `apple-mobile-web-app-capable`, `apple-mobile-web-app-status-bar-style`. Test Add to Home Screen on a real iPhone if available; otherwise verify the meta tags are present.

## Steps

1. Fix the sort comparator (11.1) — verify with the four scratch task names.
2. Wire "What's new" to a changelog file (11.2).
3. Implement A1–A20 (11.3) one at a time, testing each with scratch data.
4. Add the install button + banner + verify the manifest/service worker/offline shell (11.4).

## Acceptance tests

- [ ] Alphabetical sort of "apple", "Banana", "cherry", "Apricot" gives apple, Apricot, Banana, cherry; the live tasks sort as "test item1", "test item 2", "Test list item 1".
- [ ] "What's new" shows the latest 3 releases with dates; never renders empty.
- [ ] A2: completing a scratch task draws the checkmark, strikes the title, plays the sound (if enabled), and FLIPs the row to Completed. A6: deleting shows the Undo toast for 5s and Undo restores the task.
- [ ] A9/A10/A11/A12/A13 are visible in a screen recording (not just in code).
- [ ] `prefers-reduced-motion` disables all animations.
- [ ] Install button appears in Settings → About when installable; the banner shows once per version; the offline shell loads in airplane mode with the "You're offline" banner.
