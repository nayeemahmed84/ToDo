# 07 — Fix list right-click menu [P1]

> **Goal:** right-clicking a list in the sidebar opens the exact list menu.
> **Start only after:** files 01–03 (lists and groups exist to right-click).
> **Next file:** `08_fix_share.md`.
> **Plan reference:** Plan `05` (§4.1–§4.2), Plan `10` (A.7–A.8).

## Current (observed 09:57)

- Task right-click is **fixed**: 9 items in order (Add to My Day, Mark as important, Mark as completed, Due today, Due tomorrow, Create new list from this task, Move task to… ▸, Copy task to… ▸, Delete task). Do not touch it.
- The "…" List options menu exists (Rename list, Change theme 5 swatches, Print list, Delete list). Do not touch it, except for the stacking fix in file 01.
- **Right-clicking a list in the sidebar produced NO menu.** There is no group right-click (no groups exist — see file 03).

## Exact menus

### 7.1 Right-click on a list

**Shared list:** Sharing options; Move list to… ▸ (submenu: group names only); Remove from group; Move down; Duplicate list; Print list; Delete list (red).
**Unshared list:** **Share list** (instead of Sharing options); Move list to… ▸; Remove from group; Move down; Duplicate list; Print list; Delete list (red).

**There is NO Rename / Change theme / Sort by / Hide completed in the right-click menu** — those live in the "…" menu. Do not add them here.
"Move up / Move down": the observed list menu has "Move down" only in the report — implement **both** Move up and Move down (Move up is disabled at the top position, Move down disabled at the bottom), and note the addition.
"Move list to…" submenu lists **group names only** (e.g. Work, Travel, Learn, Inventory for convenience).

### 7.2 Right-click on a smart list

- Smart lists show a reduced menu: **Sort by ▸, Hide/Show completed** — no, correct per live inspection: smart lists in the "…" menu show only "Print list", and the right-click menu for smart lists was not observed. **Rule: right-click on a smart list shows only Sort by ▸ and Print list.** Rename/Duplicate/Share/Delete/Move are **absent**, not disabled. Do not add a delete option for a smart list anywhere.

### 7.3 Right-click on a group

Covered in file 03 (Rename group; Move up; Move down; Ungroup lists (red)). Implement it there; in this file, verify it works once a group exists — do not implement it twice.

### 7.4 Global menu rules (same as Round 1, file 06)

- Right-click **selects the item first, then opens the menu** at the cursor.
- Menu: 8px radius, shadow `0 8px 16px rgba(0,0,0,.14), 0 0 2px rgba(0,0,0,.12)`, min-width 220px, item height 36px, 14px text, 16px icon left.
- Closes on click outside, `Esc`, selecting an item, scrolling, or opening another menu. Submenus open on hover.
- Long-press (500ms) on touch opens the same menu as a bottom sheet.
- `Shift+F10` / `Menu` key opens the context menu for the focused item.
- Every action must also exist in the "…" menu, detail pane, or a shortcut — a keyboard-only user must never need right-click.

## Steps

1. Wire the sidebar list rows to the context-menu component (the task menu already uses it — reuse it, do not build a second menu system).
2. Implement the shared/unshared list menus (7.1) and the smart-list menu (7.2).
3. Verify the group menu from file 03 once a group exists.
4. Test `Shift+F10` on a focused list row.

## Acceptance tests

- [ ] Right-click on an unshared custom list shows exactly Share list / Move list to… / Remove from group / Move up / Move down / Duplicate list / Print list / Delete list (red), in that order.
- [ ] Right-click on a shared list shows "Sharing options" instead of "Share list", everything else identical.
- [ ] Right-click on a smart list shows only Sort by ▸ and Print list.
- [ ] Move up/down reorder the list; Move list to… lists group names only.
- [ ] `Shift+F10` on a focused list opens the same menu; `Esc` closes it.
- [ ] Long-press on a phone opens the list menu as a bottom sheet.
