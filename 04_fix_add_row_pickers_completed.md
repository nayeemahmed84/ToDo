# 04 — Fix Add-row pickers + Completed section [P1]

> **Goal:** Remind me opens a menu (never cycles), Due opens a calendar, Repeat closes on Esc/outside click, Completed shows reliably.
> **Start only after:** files 01–03.
> **Next file:** `05_fix_detail_pane_resize_addfile.md`.
> **Plan reference:** Plan `03` (§3.3), Plan `10` (A.4).

## Current (observed 10:47)

- Add row is at the TOP with "Add a task", an "Add" button (disabled when empty), and icons "📅 Due date" / "🔔 Remind me" / "🔁 Repeat" below the textbox.
- **Due and Repeat now open picker menus (FIXED, no longer cycling)** — but Due offers only 3 quick options, **no calendar** (regression (c)).
- **Remind me still CYCLES** ("Remind me" → "Later today" → "Remind me") — STILL MISSING.
- **Regression (b): the Repeat picker menu does not close on Escape or on an outside click** — only by toggling Repeat again.
- **Regression (d): "Completed (0)" appears inconsistently** — once in All in the first tab, absent in the default All view and after re-sorting in a later tab.
- Grid view exists (Done/Title/Due Date/Importance, toast "Grid view opened") but has no Add-task row — **correct per To Do; do not add one**.
- Live To Do (10:45): Add-row icons in order are Add due date (calendar), Add a reminder (bell), Add repeat, then a text "Add" button. **Due opens a MENU** (Today Fri, Tomorrow Sat, Next week Mon, Pick a date — Pick a date opens a calendar popover: November 2026, Su–Sa headers, past dates greyed, today 20 selected, Save button). **Remind opens a menu:** Later today 2:00 PM; Tomorrow Sat, 9 AM; Next week Mon, 9 AM; Pick a date & time. **Repeat opens a menu:** Daily, Weekdays, Weekly, Monthly, Yearly, Custom. None of them cycle.
- Live To Do Completed section: header "Completed" + count (e.g. Costco 132), **collapsed by default** with a ">" chevron; clicking expands inline, chevron points down, completed tasks show filled blue check circles and strikethrough titles.

## Exact spec

### 4.1 Remind me — open a menu, never cycle

- Clicking 🔔 opens the Remind menu: **Later today <time>, Tomorrow <weekday>, 9 AM, Next week <weekday>, 9 AM, Pick a date & time**. (Live To Do at 10:34 showed "Later today 2:00 PM"; the morning check showed 11:00 AM then 12:00 PM — the Later-today time is a time later today, not a fixed clock time. Spec: **next hour on the hour**; if the observed value disagrees, record it and keep the next-hour rule.)
- **Remove the cycling behaviour entirely.** There is no state where clicking Remind me toggles between "Remind me" and "Later today" — every click opens the menu; choosing an option sets the reminder and shows it as a chip under the textbox (with × to clear); choosing nothing leaves it unset.
- Pick a date & time opens the reminder picker (calendar + Time combobox in 15-minute steps, 00:00–23:45, Cancel/Save) — already built in Round 1; verify it still opens from the Add row.

### 4.2 Due — add "Pick a date" with a real calendar (regression (c))

- Due menu: **Today, Tomorrow, Next week, Pick a date**. Pick a date opens the custom calendar popover (Sunday-first, past dates disabled, today highlighted, Cancel/Save) — the same calendar already in the detail pane. Do not build a second calendar.
- Choosing a date sets it as a chip under the textbox (with × to clear). The menu must close after a choice, on Esc, and on an outside click (4.3).

### 4.3 Every picker menu closes on Esc and on outside click (regression (b))

- **Root cause first:** the Repeat menu not closing on Esc/outside click means its close handler is missing or is bound to the toggle only. Fix the shared menu-close behaviour once (close on Esc, outside click, scroll, and when another menu opens) and apply it to **all** picker menus (Due, Remind, Repeat) and all context menus — do not patch Repeat alone.
- Test each menu: open it, press Esc → closed; open it, click outside → closed; open Due, then open Repeat → Due closed, Repeat open.

### 4.4 Completed section — make it deterministic (regression (d))

- At the bottom of every list: header **"Completed (N)"** with a chevron to collapse/expand (remember the last state per list). **Collapsed by default** (live To Do). Tasks inside are struck through, sorted by `completedAt` descending.
- **There is no hide-completed toggle in To Do** — do not add one. Collapsing the section is the only way to hide completed tasks.
- The flakiness ("Completed (0)" appearing in one tab but not another, disappearing after re-sort) suggests the section renders conditionally on stale state or on the sort. Fix: the section must render **whenever the list has completed tasks OR when the list is the All/Completed view** — and "Completed (0)" must **never** render for a list with 0 completed tasks (a (0) header is the bug: the section should be absent, not present-but-empty). Reproduce: complete 2 scratch tasks in All → "Completed (2)" appears in All and in the task's home list; reload → still there; re-sort → still there; uncomplete both → section disappears.
- Live To Do "…" menu on Important has a "Show completed tasks" (checked) item — add that item to the Important "…" menu only (it toggles the Completed section's visibility for that view).

### 4.5 Meta lines + empty states (no change, regression test only)

- All shows each task's list name as a meta line (observed 10:47 — keep it). Note: live To Do groups All under collapsible **list section headers** instead of per-row list names; the meta line is an accepted deviation — do not rebuild All into section headers in this file.
- Empty states present in the built app (Tasks: "No tasks yet / Add a task above to get started."; My Day: "Focus on your day…") are **enhancements over To Do** (C6 — To Do shows only the Add row). **Keep them.** Do not remove them to match To Do.

## Steps

1. Replace the Remind-me cycle with the Remind menu (4.1).
2. Add "Pick a date" + calendar to the Due menu (4.2).
3. Fix the shared menu-close behaviour and apply it everywhere (4.3).
4. Make the Completed section deterministic (4.4); test with scratch data.
5. Regression-test meta lines, empty states, and Grid (no Add row) (4.5).

## Acceptance tests

- [ ] Clicking 🔔 opens the Remind menu every time; it never cycles; choosing an option sets a chip; Pick a date & time opens the reminder picker.
- [ ] Due menu has Today / Tomorrow / Next week / Pick a date; Pick a date opens the calendar (past dates disabled, Cancel/Save).
- [ ] Every picker menu closes on Esc, on outside click, and when another menu opens.
- [ ] Completing 2 scratch tasks creates "Completed (2)" (collapsed by default) in All and in the home list; it survives reload and re-sort; uncompleting both removes the section; "Completed (0)" never renders.
- [ ] Important "…" menu has a "Show completed tasks" item.
- [ ] Meta lines and empty states still present; Grid still has no Add-a-task row.
