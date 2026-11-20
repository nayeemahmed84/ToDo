# 01 — Fix light-theme white-on-white + sidebar width [P0]

> **Goal:** every header and button is readable in the light theme, and the sidebar is ~380px.
> **Start only after:** reading `00_README.md` (corrections C1, C10).
> **Next file:** `02_fix_flagged_email.md`.
> **Plan reference:** Plan `02` (§2.1), Plan `10` (A.1–A.2).

## Current (observed 10:47, 1920px viewport)

- Sidebar still **~505px** (was ~505px in Round 1, ~490px in Round 2 — it has never moved).
- **Regression (a): header text and buttons render white-on-white in the light theme and are intermittently invisible** — list titles, Duplicate/Share buttons, and the My Day Print/Sort/Group toolbar. They render correctly in Dark theme, and a text-selection drag briefly revealed "Duplicate"/"Share". This is the single worst bug in the app right now: the main controls are invisible in the default theme.
- Menu-behind-Settings is FIXED (Round 2) — do not regress it.
- Sidebar collapse to the ~65px icon rail works (keep it).

## Exact spec

### 1.1 White-on-white — find the root cause (do not patch one button)

- The pattern (invisible in light, visible in dark, revealed by text selection) means a **colour token is wrong in the light theme**: either the header text uses a dark-theme foreground variable (`--text-on-dark`, `--color-white`) on a light background, or the light-theme surface and the light-theme text resolve to the same value.
- Audit **every** text/background token pair in the light theme, not just the headers: list titles, Duplicate/Share buttons, Print/Sort/Group toolbar, Add-a-task placeholder, task titles, meta lines, sort pill, detail-pane labels, Settings labels, toast text. For each, verify contrast ≥ 4.5:1 in the light theme (use a contrast checker, not your eyes).
- Likely culprits to check first: (1) a CSS variable that is only defined under `[data-theme="dark"]` and falls back to white in light; (2) a hardcoded `color: #fff` on a component that is light-surfaced in the light theme; (3) the header inheriting the old gradient's white text after the gradient was removed in Round 1.
- Fix the token, not the symptom — do not add a per-button colour override. After the fix, the same component must read correctly in Light, Dark, and System (System must follow the OS and switch live).
- **Theme disclosure from the 10:47 check:** the agent set the theme explicitly to "Light" to restore the light appearance after testing Dark/System (System stayed dark after a reload). The stored theme value may now read "Light" rather than the "System" it showed at the start (the app rendered light either way). While fixing the theme tokens, also verify: choosing "System" follows the OS immediately and on reload; choosing "Light"/"Dark" sticks on reload. Report what the stored value is after your fix.

### 1.2 Sidebar width: 505px → ~380px (CORRECTED target)

- **Correction C1:** the live To Do sidebar measures **~380px at 1920px**, not 360px. Round 1/2's 360px target was wrong. Set the sidebar to **380px** at desktop widths (≥1024px). Tolerance ±10px.
- Find the rule that sets ~505px (likely a percentage, flex-basis, or fixed value left over from the first build) and replace it with a fixed 380px.
- Verify by measuring a screenshot at 1920px, 1440px, and 1024px. At each width the list pane must not be squeezed off-screen and the All header (file 01, §1.3) must be visible.
- Collapse: hamburger toggles to the ~65px icon rail (already works — keep it).

### 1.3 All / custom-list headers must render in BOTH themes

- Reproduce in the **light** theme: open All, My Day, Test list 1, Test list 2. The heading + Print/Sort/Group/List-options row must be **visible** in each, in light and in dark.
- Duplicate and Share buttons in custom-list headers must be visible and clickable in both themes at 1440px and 1920px.
- If the header appears after the 380px fix but the white-on-white remains, the cause is 1.1, not the width — fix the token.

## Steps

1. Reproduce (a) in the light theme; screenshot every affected surface.
2. Audit and fix the light-theme colour tokens (1.1); verify contrast ≥ 4.5:1 everywhere.
3. Set the sidebar to 380px (1.2); re-measure at 1920/1440/1024px.
4. Verify every header renders in light AND dark (1.3); verify System follows the OS on reload.

## Acceptance tests

- [ ] Every header, button, and toolbar is readable in the light theme (contrast ≥ 4.5:1, verified with a checker, not by eye).
- [ ] Sidebar measures ~380px (±10px) at 1920px, 1440px, and 1024px.
- [ ] All, My Day, Test list 1, Test list 2 headers + Duplicate/Share buttons are visible in light AND dark themes.
- [ ] System theme follows the OS immediately and after reload; Light/Dark stick after reload.
- [ ] Sidebar collapse to the ~65px rail still works; menu-behind-Settings stays fixed.
