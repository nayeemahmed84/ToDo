# 12 — Final verification for Round 2

> **Goal:** prove Round 2 fixed what it claims, and that Round 1's three FIXED items are still fixed.
> **Start only after:** files 01–11 all pass their acceptance tests.
> **Plan reference:** Plan `09` (§10–§15), Plan `10` (Appendix A), Round 1 `11_fix_data_model_bugs.md`.

## Rule 0 — test with scratch data, never the owner's live data

The live account has 3 tasks ("test item1", "test item 2", "Test list item 1"), 0 completed, 0 starred, 0 in My Day, 0 groups. **Do not complete, star, delete, move, or share any of them.** Create a separate test account, or a clearly-named "Scratch" list, for every destructive test. Delete all scratch data afterwards and confirm the live account is unchanged: exactly 3 tasks, in the same lists, with the same counts.

## Part A — Round 1 FIXED items must still be fixed (regression tests)

| # | Test | Pass if |
|---|---|---|
| A1 Sort | Open the Sort menu in any list | 5 options in order: Importance, Due date, Added to My Day, Alphabetically, Creation date. Choosing Alphabetically shows the pill "Sorted by alphabetical" with Reverse (⇅) and Remove (×); Remove restores default order. |
| A2 Settings | Click ⚙ in the top bar | Full panel opens: General, Smart lists, Connected apps, About (v0.1.0, Export, Import, Copy Session and User ID). |
| A3 Data bug | Open All, Tasks, Test list 1, Test list 2 | "test item1" appears in **exactly one** list (Test list 1). Tasks = 0, Test list 1 = 2, Test list 2 = 1, All = 3. Detail pane shows "Move to list: Test list 1". |

**If any of A1–A3 fails, stop. Fix it before running Part B.**

## Part B — Round 2 checklist (one line per file)

- [ ] **01:** Sidebar measures 360px at 1920/1868/1440/1024px. All header visible. Duplicate + Share visible in custom-list headers. No menu ever visible behind a panel.
- [ ] **02:** Flagged email smart list exists at `/tasks/flagged` with the exact empty state. All six auto-hide proofs pass (file 02, §2.2).
- [ ] **03:** A scratch group can be created, renamed, collapsed, filled/emptied by drag, reordered, and ungrouped (lists survive). Group right-click menu is exactly Rename / Move up / Move down / Ungroup (red). Categories grouping shows Blue / Red / No category headings + visible pill.
- [ ] **04:** Meta lines show due date (overdue red/bold, due-today blue), steps, file count, Note label, and list name in All. Every empty state shows. "Completed (N)" collapses/expands; uncompleting restores position. Add-row Due/Repeat/Remind open pickers (no cycling). Grid has a visible toolbar.
- [ ] **05:** "Add file" opens a picker; image + PDF upload/download/delete work; >25 MB and `.exe` rejected. Assign works on a shared scratch list; "not shared yet" note on unshared lists. Footer shows Created + Updated; Updated advances on edit. Pane is 360px; resize handle drags 320–560px and persists.
- [ ] **06:** Suggestions shows Yesterday's unfinished, Due today, Overdue, Due tomorrow, Recently added, in order, with headings; More loads more; Add all works; lightbulb toggle reopens the panel; midnight reset verified by changing the device date.
- [ ] **07:** Right-click on an unshared list shows Share list / Move list to… / Remove from group / Move up / Move down / Duplicate list / Print list / Delete list (red). Shared list shows "Sharing options". Smart list shows only Sort by ▸ and Print list. `Shift+F10` works.
- [ ] **08:** Share opens the dialog (not a toast) from the header button and right-click; members + Copy link ("Copied ✓") + Invite via email + Manage access + access note all present; a second test account joins via the link; member edits sync live; member cannot delete/rename the list; leaving works; the old copy-link toast is gone.
- [ ] **09:** "Test list" search returns "Test list 1" and "Test list 2" as list results. Dropdown highlights + navigates with ↑/↓/Enter. Results page counts match the results shown; sections in order; every task result shows its list name. Offline search works.
- [ ] **10:** Every shortcut in file 10, §10.1 works. Ctrl+F focuses search and does not open the browser Find bar. "?" opens the shortcuts dialog. Shortcuts do not fire while typing (except Esc, Ctrl+F).
- [ ] **11:** Alphabetical sort is case-insensitive ("test item1", "test item 2", "Test list item 1"). "What's new" shows the latest 3 releases. A2/A6/A9/A10/A11/A12/A13 are visible in a screen recording. `prefers-reduced-motion` disables animations. Install button + banner work; offline shell loads.

## Part C — the live-account check (last step, before handing back)

1. Delete **all** scratch data (test account, Scratch lists, scratch groups, scratch tasks, scratch files).
2. Reload https://todo-232b3.web.app/ in the owner's browser.
3. Confirm: **3 tasks, 0 completed, 0 starred, 0 in My Day, 0 groups. Lists: My Day (0), All (3), Tasks (0), Test list 1 (2), Test list 2 (1).**
4. Confirm: no test list, group, or file remains; Settings are as the owner left them (theme, sound, toggles unchanged).
5. If anything is different, restore it and say exactly what was changed and restored.

## Part D — report back (write this into the handoff to the user)

- One line per file (01–11): FIXED / PARTIALLY / STILL MISSING, with the evidence (screenshot or exact label observed).
- The Part A regression results (A1–A3).
- The Part C live-account confirmation (exact counts).
- Any new regression found, with the exact steps to reproduce.
- The three unresolved owner questions from plan §15: final app name/icon ("ToDo PWA" vs "MyDay"), email provider for invites, custom domain vs `*.web.app`, Apple sign-in vs Google+Email first.

*Round 2 — 2026-11-20. Reference: Microsoft To Do web v2.135.0. Built app: https://todo-232b3.web.app/ ("ToDo PWA" v0.1.0).*
