# 06 — Fix My Day Suggestions: add "More" [P2]

> **Goal:** Suggestions gains the "More" link To Do has; sections stay conditional.
> **Start only after:** files 01–05.
> **Next file:** `07_fix_list_right_click.md`.
> **Plan reference:** Plan `04` (§3.5), Plan `10` (A.3).

## Current (observed 10:47)

- My Day Suggestions has **"Add all"** and the 💡 **"Suggestions" toggle** in the My Day header (pressed state) — both are **enhancements over To Do; keep them**.
- Only one section, **"Recently added"** (the 3 tasks, each with its list name and a + button); **no "More" button and no other sections**.
- Live To Do (10:45): Suggestions pane heading "Suggestions" with Close X; header "Suggestions" button (lightbulb) toggles the pane. **Only one section observed: "Recently added"** — rows have a checkbox, title, list name with emoji, and a "+" Add to My Day button. A **"More" link at the bottom loads more items** into the same section. **No "Add all" button appeared anywhere.**

## Exact spec (CORRECTED, C9)

### 6.1 Sections are conditional — do not force empty ones

- Sections, in this order, **appear only when they have tasks**:
  1. Unfinished tasks from yesterday's My Day
  2. Tasks due today
  3. Overdue tasks
  4. Tasks due tomorrow
  5. Recently added (the fallback when the four above are empty)
- In the current account (no yesterday unfinished, no due/overdue tasks), **only "Recently added" is correct**. Do not invent tasks to fill sections 1–4, and do not show empty section headings.
- Verify sections 1–4 with **scratch data**: create a scratch task due today → "Due today" section appears; create one due yesterday (overdue) → "Overdue" appears; simulate yesterday's My Day (file 06, §6.3) → "Yesterday's unfinished" appears. Delete scratch data afterwards.

### 6.2 "More" link (the missing piece)

- At the bottom of the Suggestions pane, add a **"More" link**. Clicking it loads the next page of suggestions into the same section (To Do observed: 4 → 11).
- Paging: initial 10, "More" loads the next 10, up to 20 max. When no more remain, the link disappears.
- Keep the built app's **"Add all"** button (enhancement) and the lightbulb toggle (enhancement).

### 6.3 My Day reset (verify — untestable in the live checks)

- At **local midnight** (America/Toronto), My Day clears. Implementation: `myDayForDate: "YYYY-MM-DD"` on the task; the My Day view queries `myDayForDate == today`. A scheduled Function clears stale flags older than 2 days.
- Unfinished tasks stay in their home lists and re-appear in tomorrow's Suggestions (section 1). Completed My Day tasks stay completed.
- Adding a task directly in My Day creates it in the default `Tasks` list with `myDayForDate = today`.
- Verify by changing the device date in a test (do not wait until midnight).

### 6.4 Auto-add due-today (Settings — already exists)

- Settings → "Show 'Due Today' tasks in My Day" toggle (observed On). When On, tasks due today appear in My Day automatically (computed, not stored). Verify it works with scratch data — it was a toggle only in the 10:47 check, never behaviour-tested.

## Steps

1. Add the "More" link with paging (6.2).
2. Verify conditional sections 1–4 with scratch data (6.1).
3. Verify the midnight reset by changing the device date (6.3).
4. Verify the "Show Due Today in My Day" toggle (6.4).

## Acceptance tests

- [ ] Suggestions shows only sections that have tasks; with the current data, only "Recently added" shows (correct).
- [ ] "More" loads the next page of suggestions; it disappears when no more remain.
- [ ] Scratch tasks due today / overdue / yesterday-unfinished each create their section, in the order 1–5.
- [ ] [+] adds a task to My Day and removes it from Suggestions; "Add all" adds every suggestion; the lightbulb toggle reopens the panel after X closes it.
- [ ] At midnight (simulated), My Day clears; unfinished tasks re-appear in Suggestions the next day; completed ones do not.
- [ ] With "Show Due Today in My Day" On, a task due today appears in My Day without being added manually; with it Off, it does not.
