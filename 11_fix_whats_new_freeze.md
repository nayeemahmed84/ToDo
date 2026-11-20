# 11 — Fix "What's new" tab freeze + animations + install [P0/P2]

> **Goal:** "What's new" opens without freezing the tab; animations match To Do (pane slide only); the PWA can be installed.
> **Start only after:** files 01–10.
> **Next file:** `12_final_verification_round3.md`.
> **Plan reference:** Plan `06` (§7, A1–A20), Plan `08` (§9 PWA), Plan `10` (A.11).

## Current (observed 10:47)

- **Regression (f) — CRITICAL: clicking "What's new" froze the tab twice** (page control lost in two separate tabs; fresh tabs were needed to continue). Its dialog content was never seen.
- **No animations observed** — list switches, the detail pane and menus appear instantly; no slide/fade was seen (completion was not tested).
- **No install prompt or install button was found anywhere** in the app.
- Alphabetical sort is case-insensitive — **FIXED** (Round 2). Do not regress it.
- Live To Do (10:45) — **correction C10:** the detail pane slides in from the right; **menus open instantly with no visible transition; switching lists is near-instant; the Completed section expands inline; the sort pill appears/disappears instantly.** Only the pane slide is an observed animation.

## Exact spec

### 11.1 Regression (f): "What's new" freeze — fix first, before anything else in this file

- **Reproduce it:** click Help ("?" button, top right) → "What's new" in the built app, in a test browser session. It froze the tab twice in the 10:47 check (page control lost in two separate tabs). Reproduce at least twice before changing code, and record exactly what happens (does the tab freeze on click, on dialog open, or on render? does the page recover?).
- Likely causes to check, in order: (1) the dialog renders a changelog that triggers an infinite render loop (state update inside render, or a `useEffect` without a dependency array that re-fires); (2) the dialog tries to fetch a changelog file that never resolves and blocks the main thread (synchronous fetch / large JSON parse in render); (3) an animation/transition that never completes and keeps the compositor busy.
- Fix the cause, not the symptom — do not just remove the "What's new" button. After the fix, clicking it must open the dialog **within 500ms** and the tab must stay responsive (scroll, click, Esc all work).
- **Regression test (add to file 12):** click "What's new" 3 times in a row (open, Esc, open, Esc, open, Esc) — the tab must stay responsive every time, and the dialog must show content every time.

### 11.2 "What's new" content (Round 2 file 11, §11.2 — still required)

- The dialog must list the actual changes in this version, in plain language, e.g.:
  - "New: top bar with search, Settings, and sync status"
  - "New: All smart list and Settings panel"
  - "New: sort menu with reverse and remove"
  - "New: custom date and reminder pickers"
  - "Fixed: a task now belongs to exactly one list"
- The content is **data-driven**: read it from a `CHANGELOG.md` / versioned release-notes file in the repo, not hard-coded in the component. Each release adds an entry; the dialog shows the latest 3 releases with dates.
- The dialog must never render with no body content; if the changelog is empty, show "No release notes yet."

### 11.3 Animations — match To Do, not A1–A20 (CORRECTED, C10)

- **Only the detail pane slides** in from the right (250ms ease-out) and out on close. That is the one animation live To Do has.
- **Menus open instantly** (no fade/scale). **List switching is near-instant** (no cross-fade). **The sort pill appears/disappears instantly.** Do not add the A1–A20 animation set from plan §7 — it is aspirational, not observed behaviour, and slow animations were never in To Do.
- **Keep these, because they are feedback, not decoration:** the completion checkmark drawing + strikethrough (A2, without the FLIP slide — the row moves to Completed instantly after the 200ms strike), the star pop (A4, 150ms, only the scale — no FLIP), the toast sliding up (A13, 200ms, auto-dismiss 4s, Undo on delete toasts), the invalid-action shake (A20, 300ms).
- **Reduced motion:** `prefers-reduced-motion` disables all of the above (instant state changes only). Test with reduced motion on.
- **Performance:** 60fps on a mid-range phone; no animation may block input for >100ms.

### 11.4 PWA install (still missing)

- The app is a PWA (plan §9) but **no install prompt or install button was observed**. Add both:
  1. **Install button** in Settings → About ("Install app") — visible only when the `beforeinstallprompt` event has fired (i.e. the browser allows installing); hidden on iOS (where installation is via Share → Add to Home Screen — show that instruction instead).
  2. **Install prompt banner** (dismissible, shown once per version) on first visit when installable.
- Verify: `manifest.json` (name, short_name, icons 192 + 512, `display: standalone`, theme colour), service worker registered, offline shell loads (airplane mode → the app shell + cached data open, with an "You're offline" banner).
- iOS: `apple-touch-icon`, `apple-mobile-web-app-capable`, `apple-mobile-web-app-status-bar-style`. Test Add to Home Screen on a real iPhone if available; otherwise verify the meta tags are present.

## Steps

1. Reproduce the "What's new" freeze twice; diagnose; fix the cause (11.1).
2. Wire "What's new" to a changelog file (11.2).
3. Implement the pane slide + the feedback animations in 11.3; remove any slow menu/list fades if they exist.
4. Add the install button + banner + verify the manifest/service worker/offline shell (11.4).

## Acceptance tests

- [ ] Clicking "What's new" 3 times in a row (open, Esc, repeat) never freezes the tab; the dialog opens within 500ms each time and shows the latest 3 releases with dates.
- [ ] The detail pane slides in/out; menus open instantly; list switching is near-instant; the sort pill appears/disappears instantly.
- [ ] Completing a scratch task draws the checkmark, strikes the title, and (if sound is on) plays the sound; deleting shows the Undo toast for 5s and Undo restores the task.
- [ ] `prefers-reduced-motion` disables all animations.
- [ ] Alphabetical sort is still case-insensitive ("test item 2", "test item1", "Test list item 1").
- [ ] Install button appears in Settings → About when installable; the banner shows once per version; the offline shell loads in airplane mode with the "You're offline" banner.
