# 04 — Fix list pane: meta lines, empty states, Completed, Add-row pickers, Grid toolbar [P1]

> **Goal:** task rows carry their metadata, empty lists explain themselves, completed tasks have a home, and the Add row opens pickers instead of cycling.
> **Start only after:** files 01–03.
> **Next file:** `05_fix_detail_pane_addfile_assign_updated.md`.
> **Plan reference:** Plan `03` (§3.3, §3.7, §3.10), Plan `10` (A.4).

## Current (observed 09:57)

- Add row is at the TOP (fixed in Round 1), placeholder "Add a task", "Add" button (disabled when empty) at top right, "📅 Due date" / "🔁 Repeat" buttons below the textbox. **No reminder icon in the add row.**
- **No Completed section** (unverifiable — 0 completed tasks exist).
- **No empty states** (Tasks and My Day show a blank white area, no message/illustration).
- **No task meta lines** (rows show only title + ☆; even in All, no list name or due date under a task).
- **Add-row Due date button cycles Today → none and Repeat cycles daily → none, with no calendar/menu offered there** — that is the draft only, no task was created.
- Grid view: table with Done / Title / Due Date / Importance columns (works), but **no Add-a-task row and no visible toolbar**.

## Exact spec

### 4.1 Task meta lines (new)

- Row (52px single-line / 68px with meta): [18px circle checkbox] [title, 1 line, ellipsis] … [20px star].
- **Meta line under the title when any applies** (12px, secondary text): due date (overdue = red + bold; due today = blue; otherwise grey), steps progress ("2 of 5"), 📎 file count, 📝 note. A task with a note shows a small **"Note" label** under its title.
- **In All, every task row must also show its list name** in the meta line (e.g. "Test list 1 · Due Fri"). The 09:57 check found no list name under a task even in All — fix this explicitly.
- Completed tasks: struck through, filled blue checked circle.

### 4.2 Empty states (all missing — implement every row)

| View | Empty state |
|---|---|
| Any custom list, 0 tasks | Centred: "No tasks yet" + "Add a task above to get started." |
| My Day, 0 tasks | Blank pane + Add-a-task row (To Do shows a blank pane) + the Suggestions panel (file 06) |
| Planned, 0 tasks | Blank pane + Add row |
| Important, 0 tasks | "No important tasks — star a task to see it here." |
| Flagged email, 0 tasks | Envelope-with-blue-flag illustration + "Tasks from flagged email / Messages you flag will show up as tasks here." |
| Search, no results | "No results for 'x'" (file 09) |

A blank white area with no message is a bug, not a minimalist empty state.

### 4.3 Completed section (verify with scratch data)

- At the bottom of every list: header **"Completed (N)"** with a chevron to collapse/expand (remember the last state per list). Tasks inside are struck through, sorted by `completedAt` descending.
- **There is no hide-completed toggle in To Do** — do not add one. Collapsing the section is the only way to hide completed tasks.
- Test with scratch data: complete 2 tasks → "Completed (2)" appears; collapse it → tasks hide; uncomplete one → it returns to its original position (store `previousOrder`).

### 4.4 Add row: reminder icon + pickers that open (not cycle)

- Add a **"🔔 Remind me" icon** next to Due date and Repeat below the Add textbox (three icons total).
- **The Due date button must open the custom calendar** (same calendar as the detail pane: Sunday-first, past dates disabled, Cancel/Save) — it must NOT cycle Today → none. The Repeat button must open the **Repeat menu** (Daily, Weekdays, Weekly, Monthly, Yearly, Custom…) — it must NOT cycle daily → none. The Remind me icon must open the **Remind me picker** (Later today = next hour on the hour, Tomorrow 09:00, Next week Monday 09:00, Pick a date & time).
- Clicking an icon while typing sets that field on the task being typed; the chosen value shows as a chip under the textbox (with × to clear) before the task is created. Creating the task applies all chosen fields.
- Keep: "Add" button disabled when empty; `Enter` creates + refocuses a fresh empty input; pasted multi-line text creates one task per line (confirm if >20 lines).

### 4.5 Grid view toolbar

- Grid view needs a **visible toolbar**: the same Sort / Group controls as List view, the List/Grid tabs, and the view-switch announcement ("Grid view opened" / "List view opened" in an `aria-live` region).
- Grid view shows **no Add-a-task row** (correct — do not add one). The top Add row belongs to List view only.
- Columns stay Done / Title / Due Date / Importance. Cell editing: "Press Space or Enter to edit a cell, and escape to cancel." — verify with scratch data.
- Add a "Completed" section below the grid with the same columns.

## Steps

1. Implement meta lines + "Note" label + list name in All (4.1).
2. Implement every empty state in 4.2.
3. Build the "Completed (N)" section; verify with scratch data (4.3).
4. Add the Remind me icon; make Due/Repeat/Remind open their pickers (4.4) — remove the cycling behaviour entirely.
5. Add the Grid toolbar + Completed section + cell-editing verification (4.5).

## Acceptance tests

- [ ] A task with due date + 2/5 steps + note + file shows all four meta items; overdue is red/bold, due-today is blue; in All the list name shows too.
- [ ] Every empty state in 4.2 shows the exact text (or blank pane + Suggestions where specified).
- [ ] Completing 2 scratch tasks creates "Completed (2)"; collapse hides them; uncompleting restores position.
- [ ] Add-row Due opens the calendar, Repeat opens the repeat menu, Remind opens the reminder picker; none of them cycles; chosen values show as chips and apply on create.
- [ ] Grid view has a visible toolbar with Sort/Group; cell editing works (Space/Enter, Esc cancels); Completed section exists below the grid.
