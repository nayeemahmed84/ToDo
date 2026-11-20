# 03 — Fix groups: create one for real, group menu + right-click, Categories grouping [P1]

> **Goal:** groups exist, can be created/renamed/ungrouped/reordered, and Group by Categories visibly groups tasks.
> **Start only after:** files 01–02.
> **Next file:** `04_fix_list_pane_meta_empty_completed.md`.
> **Plan reference:** Plan `03` (§3.2 LIST-04/05/12), Plan `10` (A.2, A.4, A.7).

## Current (observed 09:57)

- A "Create group" textbox now sits at the sidebar bottom (below "+ New list"); clicking focuses it.
- **Still 0 groups**, no group shown, no group right-click/menu, and **group creation itself was not tested** (it would create data).
- Group by Categories: toggling it produced **no visible grouping or pill** (all tasks are uncategorised, so its effect is unverifiable from the live data).

## Exact spec

### 3.1 Create a group — and prove it works

- Using **scratch data only**: type a group name in the "Create group" textbox, press `Enter`. Expected: a group appears in the sidebar, expanded, with "Drag lists here" empty state; `Esc` cancels; empty name is rejected with a shake (animation A20, plan 06).
- Then, with scratch lists: drag a scratch list into the group (drop indicator on the group header), drag it back out, rename the group by double-clicking its name (`Enter` saves, `Esc` cancels), collapse/expand it via the chevron (animated 180ms), and ungroup it via right-click → "Ungroup lists" (confirm: "Delete group 'X'? Lists inside will not be deleted." — lists survive, group is removed).
- Delete all scratch groups/lists afterwards. The owner's live account must still have 0 groups when you finish — **do not leave a test group in the live account**.

### 3.2 Group right-click menu (new)

| Item | Behaviour |
|---|---|
| Rename group | Inline edit |
| Move up | Moves the group up one position (also add "Move down" — To Do's list menu has both; the group menu observed has Move up only, so implement Move up + Move down and note the addition) |
| Ungroup lists (red) | Confirm dialog as in 3.1; lists become ungrouped |

### 3.3 Group "…" / header behaviour

- There is no separate "…" menu on a group in To Do — Rename/Move/Ungroup live in the right-click menu (3.2). Do not add a second menu.
- Groups reorder by drag (same as lists). A group with 0 lists shows "Drag lists here" when expanded.

### 3.4 Group by Categories — make the effect visible

- Group button in the list header → menu has exactly one item: **"Categories"** (checked when active). This already exists — verify it.
- With **categorised scratch tasks** (assign Blue to one task, Red to another, leave a third uncategorised), turning on Categories must show: a sort/group pill (e.g. "Grouped by categories" with a Remove control), and the task list split under colour headings **Blue / Red / No category** (in the order Blue, Green, Orange, Purple, Red, Yellow, then No category).
- Turning it off restores the flat list. The pill must be visible — "no visible grouping or pill" (the 09:57 finding) is a failure even when all tasks are uncategorised: in that case show a single "No category" heading so the grouping is visibly active.
- Category values (already correct in the detail pane): None / Blue / Green / Orange / Purple / Red / Yellow. A task has at most one category. Add `category` to the task document if it is not already stored as a field (it must survive reload and sync — test on a second device/session).

## Steps

1. Test group creation end-to-end with scratch data (3.1); fix whatever breaks.
2. Implement the group right-click menu (3.2) + drag reorder.
3. Prove Categories grouping with categorised scratch tasks (3.4), including the visible pill and "No category" heading.
4. Clean up all scratch groups/lists; verify the live account still has 0 groups.

## Acceptance tests

- [ ] A scratch group can be created, renamed, collapsed/expanded, filled by drag, emptied by drag-out, reordered, and ungrouped (lists survive).
- [ ] Group right-click shows exactly Rename group / Move up / Move down / Ungroup lists (red), in that order.
- [ ] Categories on: categorised scratch tasks group under Blue / Red / No category headings with a visible "Grouped by categories" pill; off: flat list returns.
- [ ] Category survives reload and a second session.
- [ ] Live account still has 0 groups and its 3 tasks unchanged after cleanup.
