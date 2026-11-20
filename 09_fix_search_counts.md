# 09 — Fix search counts [P2]

> **Goal:** search results show the same counts To Do shows — Tasks, Notes, Steps — matching the results exactly.
> **Start only after:** file 08.
> **Next file:** `10_fix_keyboard_corrected.md`.
> **Plan reference:** Plan `04` (§3.8 SEARCH-01–07), Plan `10` (A.10).

## Current (observed 10:47)

- Searching "Test list" returns the lists "Test list 1" and "Test list 2" plus the task "Test list item 1" with the attribution "Test list 2" beneath it. Counts shown inline as **"Tasks (1) Lists (2) Groups (0)"** — **no Notes/Steps counts**.
- Results are a full page, not a dropdown.
- Live To Do (10:45) — **correction C4:** top-bar search; typing navigates directly to `/tasks/search/<query>` — **no suggestion dropdown was observed**. Results page heading: 'Searching for "chocolate"'; count line: **"15 Tasks, 0 Notes, and 0 Steps found"**; section "Tasks 15"; each result row shows the title plus a second line with the list name and emoji (e.g. "🛒 Costco"); completed results are included with strikethrough and a "Completed task …" prefix. **No Lists/Groups section exists — lists and groups themselves do not appear as results.** "Exit search" X returns to the list; an "Options" button sits at the top right of the results page.

## Exact spec (CORRECTED, C4)

### 9.1 Counts — add Notes and Steps

- Results page header: **"Searching for '<query>'"**, then the count line in To Do's format: **"<N> Tasks, <M> Notes, and <K> Steps found"** (e.g. "15 Tasks, 0 Notes, and 0 Steps found").
- **Counts must match the results shown exactly.** Do not reproduce To Do's morning bug (totals that did not match the listed results) — if the count says 15 Tasks, 15 task rows must be listed.
- Keep the built app's inline section counts ("Tasks (1) Lists (2) Groups (0)") as the section headers, and add **"Notes (M)"** and **"Steps (K)"** sections with their counts. Hide a section entirely when its count is 0 — except keep the count line (9.1) showing the zeros.
- Steps are shown **inside their parent task**, with the step text highlighted — they are not a separate section, but their count is included in the count line and in a "Steps (K)" chip on the parent task row.

### 9.2 Lists/Groups results — keep as an enhancement (do not remove)

- The built app returning lists ("Test list 1", "Test list 2") and groups as results is **beyond To Do** (To Do does not do it). **Keep it** — it is useful and the owner has not asked to remove it. But it must not break the counts: the count line covers Tasks/Notes/Steps only (To Do's format); Lists/Groups counts stay as section headers ("Lists (2) Groups (0)").
- Clicking a **list** result navigates to that list. Clicking a **group** result navigates to the group's first list.

### 9.3 No dropdown required (correction)

- **Do not build a live dropdown.** To Do has none — typing navigates to the results page. The results page is the search surface.
- Typing 3+ chars navigates to `/tasks/search/<query>` (debounce 150ms; cancel stale queries). `Esc` in the search box clears it and returns to the previous list.
- Every task result shows its list name on a second line (already works — keep it). Completed results are included, with strikethrough and a "Completed task …" prefix.
- "Exit search" button returns to the previous list. Add the **"Options" button** at the top right of the results page (To Do has one; its contents were not observed — make it open the same options as the list "…" menu for the current view, and note if To Do's Options does something else).

### 9.4 Indexing + offline

- **V1:** client-side `onSnapshot` over the user's tasks + a Firestore composite query by `titleLower` prefix; debounce 150ms; cancel stale queries. Enough for the owner's ~455 tasks.
- Search must work offline (search the local cache) — a "Searching offline" hint appears when offline.

### 9.5 Empty results

- "No results for '<query>'" + a suggestion ("Check the spelling, or try a different word") + a button "Clear search".

## Steps

1. Add Notes and Steps to the count line and as sections/chips (9.1).
2. Keep Lists/Groups results; fix the counts so they never disagree with the rows shown (9.2).
3. Confirm there is no dropdown; wire the search box to navigate to the results page (9.3); add Exit search + Options.
4. Verify offline search (9.4) and the empty state (9.5).

## Acceptance tests

- [ ] The results page shows 'Searching for "<query>"' + the count line "<N> Tasks, <M> Notes, and <K> Steps found", and the counts match the rows listed.
- [ ] A task with a matching note appears in the Notes count and section; a task with a matching step appears in the Steps count with the step text highlighted inside its parent task.
- [ ] "Test list" still returns the lists "Test list 1"/"Test list 2" as list results (enhancement kept).
- [ ] Typing navigates to the results page (no dropdown); Esc clears and returns; Exit search returns; completed results show struck through with the "Completed task …" prefix.
- [ ] "No results for '<query>'" shows the exact empty state + Clear search.
- [ ] Search works offline (local cache) with the "Searching offline" hint.
