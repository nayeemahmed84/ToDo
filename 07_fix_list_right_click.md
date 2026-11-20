# 07 — Fix list right-click menu (corrected) [P1]

> **Goal:** right-clicking a list in the sidebar opens the exact list menu — with the corrected items.
> **Start only after:** files 01–03 (lists and groups exist to right-click).
> **Next file:** `08_fix_share_dialog_finish.md`.
> **Plan reference:** Plan `05` (§4.1–§4.2), Plan `10` (A.7–A.8).

## Current (observed 10:47)

- Task right-click is **fixed** (9 items, Round 1). Do not touch it.
- The "…" List options menu exists (Rename list, Change theme 5 swatches, Print list, Delete list). Do not touch it, except for the stacking fix (Round 2 file 01 — still fixed).
- **Right-clicking "Test list 1" and right-clicking "All" in the sidebar opened no menu at all.** Still missing in Round 3.
- Live To Do (10:45) — the corrected menus:
  - **Shared list:** Sharing options; Move list to… ▸; Remove from group; **Move down**; Duplicate list; Print list; Delete list (red).
  - **Unshared list:** Share list; Move list to… ▸; Remove from group; **Move down**; Duplicate list; Print list; Delete list (red).
  - **Smart list: no right-click menu (nothing opens).**
  - **Group:** Rename group; Move up; Move down; Ungroup lists (red).

## Exact menus (CORRECTED — C2, C3)

### 7.1 Right-click on a list

**Shared list:** Sharing options; Move list to… ▸ (submenu: group names only); Remove from group; Move down; Duplicate list; Print list; Delete list (red).
**Unshared list:** **Share list** (instead of Sharing options); Move list to… ▸; Remove from group; Move down; Duplicate list; Print list; Delete list (red).

- **There is NO "Move up" in the list menu** — Round 2 file 07 added it; that was wrong. Remove it. (Move up exists only in the **group** menu.)
- **There is NO Rename / Change theme / Sort by / Hide completed in the right-click menu** — those live in the "…" menu. Do not add them here.
- "Move down" is disabled at the bottom position. "Move list to…" submenu lists **group names only**.

### 7.2 Right-click on a smart list — NOTHING opens (C2)

- **Do not build a smart-list context menu.** Right-clicking My Day, Important, Planned, All, Completed, Flagged email, Assigned to me, or Tasks must open **nothing**.
- Round 2 file 07's "Sort by ▸ + Print list" smart-list menu was wrong — if it was implemented, **remove it**.
- Smart-list actions live in the "…" menu: My Day — Print list only; Important — "Show completed tasks" (checked) + Print list.

### 7.3 Right-click on a group

Covered in file 03 (Rename group; Move up; Move down; Ungroup lists (red)). Implement it there; in this file, verify it works once a group exists — do not implement it twice.

### 7.4 Global menu rules (same as Round 1, file 06)

- Right-click **selects the item first, then opens the menu** at the cursor.
- Menu: 8px radius, shadow `0 8px 16px rgba(0,0,0,.14), 0 0 2px rgba(0,0,0,.12)`, min-width 220px, item height 36px, 14px text, 16px icon left.
- Closes on click outside, `Esc`, selecting an item, scrolling, or opening another menu. Submenus open on hover. (Use the shared menu-close fix from file 04, §4.3 — do not build a second close mechanism.)
- Long-press (500ms) on touch opens the same menu as a bottom sheet.
- `Shift+F10` / `Menu` key opens the context menu for the focused item.
- Every action must also exist in the "…" menu, detail pane, or a shortcut — a keyboard-only user must never need right-click.

## Steps

1. Wire the sidebar list rows to the context-menu component (the task menu already uses it — reuse it, do not build a second menu system).
2. Implement the shared/unshared list menus (7.1) — Move down only, no Move up.
3. Verify smart lists open **nothing** on right-click (7.2); remove the Round 2 smart-list menu if it exists.
4. Verify the group menu from file 03 once a group exists.
5. Test `Shift+F10` on a focused list row.

## Acceptance tests

- [ ] Right-click on an unshared custom list shows exactly Share list / Move list to… / Remove from group / Move down / Duplicate list / Print list / Delete list (red), in that order — no Move up.
- [ ] Right-click on a shared list shows "Sharing options" instead of "Share list", everything else identical.
- [ ] Right-click on any smart list opens nothing.
- [ ] Move down reorders the list; Move list to… lists group names only.
- [ ] `Shift+F10` on a focused list opens the same menu; `Esc` closes it.
- [ ] Long-press on a phone opens the list menu as a bottom sheet.
