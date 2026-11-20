# 01 — Fix sidebar width + header regressions (a), (b), (h) [P0]

> **Goal:** sidebar is 360px, the All header and Duplicate/Share buttons are actually visible, and menus stack above Settings.
> **Start only after:** reading `00_README.md`.
> **Next file:** `02_fix_flagged_email_smart_lists.md`.
> **Plan reference:** Plan `02` (§2.1), Plan `10` (A.1–A.2).

## Current (observed 09:57, 1868px viewport)

- Top bar exists and is correct: ☰ toggle, "ToDo PWA", centred Search, "Sync — Up to date" ✓, Settings ⚙, Help ?, avatar "N". Gradient is gone (white/light-grey sidebar, white lists). Account header + Dark/Sound/Export/Import are gone from the sidebar bottom. Sidebar collapses to a ~65px icon rail (works).
- **Sidebar is still ~490px wide (was ~505px). Target is 360px.**
- **Regression (a):** in the **All** list, the "All" heading + Print/Sort/Group/List-options row exist in the page structure and are clickable, but are **not visibly rendered** (blank header area). The same row renders visibly in My Day and Test list 2.
- **Regression (b): Duplicate and Share buttons exist in the page structure but were not visibly rendered** in the header.
- **Regression (h): the List options menu stayed open behind the Settings panel** (overlay stacking quirk).

## Exact spec

### 1.1 Sidebar width: 490px → 360px

- Sidebar width **360px** at desktop widths (≥1024px). The 490px width is not a rounding error — find the rule that sets it (likely a `width: 26%`, `flex-basis`, or a fixed 490–505px value left over from Round 1) and replace it with a fixed 360px.
- Collapse: hamburger toggles to the ~65px icon rail (already works — keep it). When collapsed, the list pane widens and only the toggle remains.
- Verify at 1920px, 1868px (the observed viewport), 1440px, and 1024px. At each width, measure the sidebar with a ruler/screenshot — do not trust the stylesheet alone.
- Sidebar content order (unchanged): smart lists → groups → ungrouped lists → "+ New list" + textbox → "Create group".

### 1.2 Regression (a): All list header must render

- Reproduce: open **All** (3 tasks). The heading "All" and the header row (Print, Sort, Group, List options "…") must be **visible**, exactly as they render in My Day and Test list 2.
- Likely causes to check, in order: (1) the All view renders a different header component that inherits a white-on-white colour or `opacity: 0` / `visibility: hidden`; (2) the header is rendered but pushed off-screen by the 490px sidebar + main-pane flex layout; (3) a conditional hides the header when the view is a computed smart list. Fix the cause, not the symptom — do not add a second All header.
- After the 360px sidebar fix (1.1), re-check All first: if the header appears, the cause was (2) and the fix is the width change. If it is still blank, investigate (1) and (3).
- Acceptance: screenshot All, My Day, and Test list 2 side by side — all three headers must be visible and identical in structure.

### 1.3 Regression (b): Duplicate and Share buttons must render

- In a custom list's header (e.g. Test list 1), **Duplicate** and **Share** buttons must be visible and clickable — not merely present in the DOM.
- Check: are they hidden by the same rule that hides the All header? Do they render at narrower widths? Do they have an icon-only state with no accessible label? Give each a visible label (text or icon + `aria-label` + tooltip) and verify by screenshot at 1440px and 1868px.
- Share must open the real Share dialog (file 08) — in this file, only make the button visible and wired to open the dialog; the dialog itself is file 08.

### 1.4 Regression (h): overlay stacking

- Reproduce: open the List options "…" menu, then open Settings (⚙) without closing the menu. The menu must either close when Settings opens, or render **above** the Settings panel — it must never sit visible-but-trapped behind the panel.
- Fix: (1) close all menus/popovers when a modal/panel opens (simplest, preferred); AND (2) audit `z-index` so the stacking order is: toast > modal/dialog > context menu > panel > header > content. Document the scale in code (`--z-menu`, `--z-panel`, `--z-modal`, `--z-toast`).
- Test: open each menu in turn, then open Settings, then Help, then the detail pane — no menu may remain visible behind another surface.

## Steps

1. Set the sidebar to a fixed 360px; remove any percentage/flex-basis width.
2. Re-check the All header; fix the root cause if still blank.
3. Make Duplicate + Share visibly render in custom-list headers.
4. Close menus on panel open + set the `z-index` scale; verify (h) is gone.
5. Screenshot All / My Day / Test list 1 / Test list 2 at 1440px and 1868px.

## Acceptance tests

- [ ] Sidebar measures 360px (±4px) at 1920px, 1868px, 1440px, and 1024px.
- [ ] All list: "All" heading + Print/Sort/Group/"…" row are visible (screenshot matches My Day's header).
- [ ] Custom list header: Duplicate and Share buttons are visible and clickable at 1440px and 1868px.
- [ ] Opening Settings, Help, or the detail pane closes any open menu; no menu is ever visible behind a panel.
- [ ] Sidebar collapse to the ~65px rail still works; re-expand restores 360px.
