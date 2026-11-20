# 09 — Fix search: dropdown, counts, lists, attribution [P2]

> **Goal:** search finds tasks, notes, steps, lists, and groups, shows counts, and says which list each result belongs to.
> **Start only after:** file 08.
> **Next file:** `10_fix_keyboard.md`.
> **Plan reference:** Plan `04` (§3.8 SEARCH-01–07), Plan `10` (A.10).

## Current (observed 09:57)

- Search moved to the top bar (fixed in Round 1) and opens a full results page ("Search: 'test'" with the 3 matching tasks).
- **Still title-only:** searching "Test list" returned only the task "Test list item 1", not the lists "Test list 1" / "Test list 2".
- **No dropdown, no counts by Tasks/Notes/Steps/Lists/Groups, and results show no list attribution.**
- In To Do, searching "Bread" reported "50 Tasks, 7 Notes, and 0 Steps found" — the **totals did not match the listed results** (a To Do bug). Do NOT reproduce that mismatch: counts must match the results shown.

## Exact spec

### 9.1 Live dropdown (typing, before Enter)

- Typing in the top-bar search box opens a dropdown below it (max-height 400px, scrollable).
- Matches tasks, notes, steps, **lists, and groups** — by substring, case-insensitive, and by **pinyin/soundex-insensitive** matching is not required; substring only.
- Dropdown rows: icon (task = circle, note = note icon, step = checkbox, list = list icon, group = folder icon) + matched text with the query **highlighted** + list name for task results.
- `↑/↓` moves, `Enter` opens the highlighted result, `Esc` closes. Typing 3+ chars triggers search (debounce 150ms).
- Clicking a **task** result opens the detail pane for that task (in its own list). Clicking a **list** result navigates to that list. Clicking a **group** result navigates to the group's first list.

### 9.2 Results page (Enter / "See all results")

- URL: `/tasks/search/<query>`. Header: "Search results for '<query>'".
- **Counts header, matching the results exactly:** e.g. "3 Tasks, 1 Note, 0 Steps, 2 Lists, 1 Group found". Do not show a count for a section that is empty — hide empty sections entirely.
- Sections in order: **Tasks / Notes / Lists / Groups** (steps are shown inside their parent task, with the step text highlighted — they are not a separate section, but their count is included in the header).
- **Every task result shows its list name** (e.g. "Test list item 1 — Test list 2"). This is the 09:57 gap: results showed no list attribution.
- Clicking a result behaves as in 9.1. "Exit search" button returns to the previous list.

### 9.3 Indexing (how to make it fast)

- **V1:** client-side `onSnapshot` over the user's tasks + a Firestore composite query by `titleLower` prefix; debounce 150ms; cancel stale queries. This is enough for the owner's ~455 tasks.
- **V2 (later, not this file):** Algolia/Typesense or a Cloud Function maintaining a `search_index` collection. Do not build V2 now.
- Search must work offline (search the local cache) — a "Searching offline" hint appears when offline.

### 9.4 Empty results

- "No results for '<query>'" + a suggestion ("Check the spelling, or try a different word") + a button "Clear search".

## Steps

1. Extend the search index to notes, steps, list names, and group names (9.1).
2. Build the live dropdown with keyboard navigation + highlight (9.1).
3. Build the results page with exact counts, sections in order, and list attribution on every task result (9.2).
4. Add the empty state (9.4); verify offline search (9.3).

## Acceptance tests

- [ ] Typing "Test list" in the search box shows "Test list 1" and "Test list 2" as list results (not just the task "Test list item 1").
- [ ] The dropdown highlights the query, navigates with ↑/↓/Enter, and closes on Esc.
- [ ] The results page shows the counts header and the counts match the results listed (no "50 Tasks" when 3 are shown).
- [ ] Sections are in order Tasks / Notes / Lists / Groups; empty sections are hidden; every task result shows its list name.
- [ ] Clicking a task result opens its detail pane in its own list; clicking a list result navigates to it.
- [ ] "No results for '<query>'" shows the exact empty state + Clear search.
- [ ] Search works offline (local cache) with the "Searching offline" hint.
