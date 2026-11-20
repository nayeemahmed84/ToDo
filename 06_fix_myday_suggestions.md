# 06 — Fix My Day Suggestions [P2 — still missing in both rounds]

> **Goal:** Suggestions covers yesterday's unfinished work, today's due tasks, overdue, and tomorrow — with More, Add all, and a toggle.
> **Start only after:** files 01–05.
> **Next file:** `07_fix_list_right_click.md`.
> **Plan reference:** Plan `04` (§3.5), Plan `10` (A.3).

## Current (observed 09:57)

- Suggestions still auto-open in My Day (correct) and show only **"Recently added"** (3 items, now with the list name under each and a + add-to-My-Day button — that part improved).
- **No other sections, no More button, no Suggestions toggle button in the My Day header** (only ✕ Close suggestions in the pane). This gap is unchanged since 09:30.

## Target (Microsoft To Do v2.135.0)

- Header: sun icon + "My Day", date line e.g. "Friday, November 20".
- Suggestions panel auto-opens on entry; "Close suggestions" (X) hides it; a **"Suggestions" button (lightbulb) in the header reopens it**.
- Suggestions, in this order, max 20, each row with a complete-circle, task name, source list name, a star where important, and a **"+ Add to My Day"** button:
  1. **Unfinished tasks from yesterday's My Day**
  2. **Tasks due today**
  3. **Overdue tasks**
  4. **Tasks due tomorrow**
  5. Recently added (keep the existing section — the fallback when the four above are empty)
- **"More" button** loads more suggestions (observed in To Do: 4 → 11). **"Add all"** button at the top adds every suggestion at once.
- Clicking [+] adds the task (with the add animation, file 11) and removes it from Suggestions; the My Day count badge increments with a 150ms pop.

## Exact spec

### 6.1 Sections (implement 1–4; keep 5)

- Section headings must be visible: "Yesterday's unfinished", "Due today", "Overdue", "Due tomorrow", "Recently added" (use To Do's exact grouping — if To Do's UI shows different heading text, use the observed text and note it; do not invent headings).
- A section with 0 tasks is hidden (no empty heading). If all four are empty, only "Recently added" shows.
- Cap the initial list at 10, with **"More"** loading the next 10, up to the 20 max.

### 6.2 Toggle + Add all

- Add the lightbulb **"Suggestions" button to the My Day header**. X closes the panel; the lightbulb reopens it.
- **"Add all"** at the top of the panel.

### 6.3 My Day reset (verify — untestable in the live checks)

- At **local midnight** (America/Toronto), My Day clears. Implementation: `myDayForDate: "YYYY-MM-DD"` on the task; the My Day view queries `myDayForDate == today`. A scheduled Function clears stale flags older than 2 days.
- Unfinished tasks stay in their home lists and re-appear in tomorrow's Suggestions (section 1). Completed My Day tasks stay completed.
- Adding a task directly in My Day creates it in the default `Tasks` list with `myDayForDate = today`.
- Verify by changing the device date in a test (do not wait until midnight).

### 6.4 Auto-add due-today (Settings — already exists)

- Settings → "Show 'Due Today' tasks in My Day" toggle (observed On). When On, tasks due today appear in My Day automatically (computed, not stored). Verify it works — it was a toggle only in the 09:57 check, never behaviour-tested.

## Steps

1. Add the lightbulb "Suggestions" button to the My Day header.
2. Implement suggestion sections 1–4 (+ keep Recently added), in order, max 20, paging 10 with "More".
3. Add "Add all".
4. Verify the midnight reset by changing the device date in a test.
5. Verify the "Show Due Today in My Day" toggle actually adds due-today tasks.

## Acceptance tests

- [ ] Entering My Day auto-opens Suggestions; X closes it; the lightbulb button reopens it.
- [ ] Suggestions list yesterday's unfinished My Day tasks first, then due-today, overdue, due-tomorrow, then recently added — in that order, with visible section headings.
- [ ] [+] adds a task to My Day and removes it from Suggestions; "Add all" adds every suggestion.
- [ ] "More" loads the next page of suggestions.
- [ ] At midnight (simulated), My Day clears; unfinished tasks re-appear in Suggestions the next day; completed ones do not.
- [ ] With "Show Due Today in My Day" On, a task due today appears in My Day without being added manually; with it Off, it does not.
