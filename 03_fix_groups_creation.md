# 03 — Fix groups: create one for real [P1]

> **Goal:** a group can actually be created, and the group menu works.
> **Start only after:** files 01–02.
> **Next file:** `04_fix_add_row_pickers_completed.md`.
> **Plan reference:** Plan `03` (§3.2 LIST-04/05/12), Plan `10` (A.2, A.4, A.7).

## Current (observed 10:47)

- "Create group" textbox exists at the bottom of the sidebar below "+ New list"; clicking it focuses it, but **creating a group was not tested** (it would change data). Still **0 groups**.
- **Group by Categories is FIXED** (Round 2): Group menu offers "Categories"; selecting it shows the pill "Grouped by categories ×" and the heading "No category (3)". Do not regress it — file 12 re-tests it.
- Live To Do (10:45): "Create group" inserts an inline **"Untitled group" textbox** at the bottom of the sidebar (Enter creates, Escape cancels). Group right-click menu: Rename group, Move up, Move down, Ungroup lists (red) — the first group lacks Move up. Clicking a group header collapses/expands it: chevron flips down→left and child lists hide. Groups are expanded by default.

## Exact spec

### 3.1 Create a group — and prove it works (the untested part)

- Using **scratch data only**: click "Create group". Expected (match To Do): an inline "Untitled group" textbox appears at the bottom of the sidebar. Type a name, press `Enter` → the group appears, expanded, with "Drag lists here" empty state. `Esc` cancels; empty name is rejected with a shake (animation A20, plan 06).
- If the built app's textbox behaves differently (e.g. it creates on Enter from the bottom textbox directly), keep its behaviour **only if** it passes the same acceptance tests — do not rebuild a working flow to match To Do's exact textbox placement.
- Then, with scratch lists: drag a scratch list into the group (drop indicator on the group header), drag it back out, rename the group by double-clicking its name (`Enter` saves, `Esc` cancels), collapse/expand it via the chevron, and ungroup it via right-click → "Ungroup lists" (confirm: "Delete group 'X'? Lists inside will not be deleted." — lists survive, group is removed).
- **Delete all scratch groups/lists afterwards.** The owner's live account must still have 0 groups when you finish — do not leave a test group in the live account.

### 3.2 Group right-click menu (corrected — C3)

| Item | Behaviour |
|---|---|
| Rename group | Inline edit |
| Move up | Moves the group up one position; **disabled on the first group** (To Do: the first group lacks Move up) |
| Move down | Moves the group down one position; disabled on the last group |
| Ungroup lists (red) | Confirm dialog as in 3.1; lists become ungrouped |

### 3.3 Group header + drag

- Clicking a group header collapses/expands it (chevron down→left, child lists hide). Groups are expanded by default.
- Groups reorder by drag (same as lists). A group with 0 lists shows "Drag lists here" when expanded.
- There is no separate "…" menu on a group — Rename/Move/Ungroup live in the right-click menu (3.2). Do not add a second menu.

## Steps

1. Test group creation end-to-end with scratch data (3.1); fix whatever breaks.
2. Implement the group right-click menu (3.2) + drag reorder + collapse/expand (3.3).
3. Clean up all scratch groups/lists; verify the live account still has 0 groups.

## Acceptance tests

- [ ] A scratch group can be created (Enter), cancelled (Esc), renamed, collapsed/expanded, filled by drag, emptied by drag-out, reordered, and ungrouped (lists survive).
- [ ] Group right-click shows exactly Rename group / Move up / Move down / Ungroup lists (red); Move up is disabled/absent on the first group.
- [ ] Group by Categories still shows the pill "Grouped by categories ×" + "No category (3)" heading (regression test).
- [ ] Live account still has 0 groups and its 3 tasks unchanged after cleanup.
