# 12 — Final verification for Round 3

> **Goal:** prove Round 3 fixed what it claims, that Round 2's FIXED items are still fixed, and that the corrections C1–C11 are honoured.
> **Start only after:** files 01–11 all pass their acceptance tests.
> **Plan reference:** Plan `09` (§10–§15), Plan `10` (Appendix A), Round 2 `12_final_verification_round2.md`.

## Rule 0 — test with scratch data, never the owner's live data

The live account has 3 tasks ("test item1", "test item 2", "Test list item 1"), 0 completed, 0 starred, 0 in My Day, 0 groups. **Do not complete, star, delete, move, or share any of them.** Create a separate test account, or a clearly-named "Scratch" list, for every destructive test. Delete all scratch data afterwards and confirm the live account is unchanged: exactly 3 tasks, in the same lists, with the same counts.

## Part A — Round 2 FIXED items must still be fixed (regression tests)

| # | Test | Pass if |
|---|---|---|
| A1 Sort (case-insensitive) | Sort All alphabetically | Order is "test item 2", "test item1", "Test list item 1". Sort menu still 5 options in order (Importance, Due date, Added to My Day, Alphabetically, Creation date) with pill Reverse/Remove. |
| A2 Group by Categories | Group menu → Categories | Pill "Grouped by categories ×" + heading "No category (3)". |
| A3 Due/Repeat pickers | Click Due and Repeat in the Add row | Both open picker menus (no cycling). |
| A4 Data bug | Open All, Tasks, Test list 1, Test list 2 | "test item1" appears in **exactly one** list (Test list 1). Tasks = 0, Test list 1 = 2, Test list 2 = 1, All = 3. |
| A5 Settings | Click ⚙ in the top bar | Full panel opens: General, Smart lists, Connected apps, Notifications, About (v0.1.0, Export, Import, Copy Session and User ID). |

**If any of A1–A5 fails, stop. Fix it before running Part B.**

## Part B — Round 3 checklist (one line per file)

- [ ] **01:** Every header/button readable in the light theme (contrast ≥ 4.5:1, checker-verified). Sidebar ~380px (±10px) at 1920/1440/1024px. All/My Day/Test list headers + Duplicate/Share visible in light AND dark. System theme follows the OS on reload.
- [ ] **02:** Flagged email in the sidebar, `/tasks/flagged` renders its own view (never falls back to My Day) with the exact empty state. Flagged email stays visible at 0; Planned/Assigned hide when empty. All five auto-hide proofs pass.
- [ ] **03:** A scratch group can be created (Enter), cancelled (Esc), renamed, collapsed/expanded, filled/emptied by drag, reordered, and ungrouped (lists survive). Group right-click is exactly Rename / Move up / Move down / Ungroup (red); Move up disabled/absent on the first group.
- [ ] **04:** Remind me opens the menu every time (never cycles). Due menu has Today / Tomorrow / Next week / Pick a date (calendar, past dates disabled). Every picker menu closes on Esc, outside click, and when another menu opens. "Completed (2)" (collapsed by default) survives reload and re-sort; "Completed (0)" never renders. Important "…" has "Show completed tasks".
- [ ] **05:** Dragging the pane's left edge resizes it (320–800px) and persists across reload; default ~510px. "Add file" opens the system file chooser (verified in a real browser session); image + PDF upload/download/delete work; >25 MB and `.exe` rejected. Footer is "Created by <name> on <date>" with the exact year rule; **no Updated line**. "Move to list" still works.
- [ ] **06:** Suggestions shows only sections that have tasks; "More" loads the next page and disappears when no more remain; scratch due/overdue/yesterday tasks create their sections in order 1–5; "Add all" and the lightbulb toggle still work; midnight reset verified by changing the device date.
- [ ] **07:** Right-click on an unshared list shows exactly Share list / Move list to… / Remove from group / Move down / Duplicate list / Print list / Delete list (red) — **no Move up**. Shared list shows "Sharing options". **Right-click on any smart list opens nothing.** `Shift+F10` works.
- [ ] **08:** Typing a valid email enables "Invite"; inviting a test email adds a pending member and sends the invite; the second test account joins via the link. "Manage access" lists members with Remove; removing revokes access; Leave works. Dialog opens **centred** in light and dark. Copy link shows "Copied ✓" for 2s; the old copy-link toast never appears.
- [ ] **09:** Results page shows 'Searching for "<query>"' + "<N> Tasks, <M> Notes, and <K> Steps found", counts matching the rows listed. Notes/Steps counts work. "Test list" still returns the lists as results. No dropdown. Exit search + Options present. Offline search works.
- [ ] **10:** Ctrl+F focuses the app search box and does not open the browser Find bar. Esc closes everything including the Repeat menu. Enter/Delete/Space/Shift+F10 work. "?" types "?" in the Add box. Help pane has exactly "Learn more" + "Sync — Up to date" + Close (no shortcuts list).
- [ ] **11:** "What's new" clicked 3 times in a row (open, Esc, repeat) **never freezes the tab**; dialog opens within 500ms and shows the latest 3 releases. Detail pane slides; menus open instantly; list switching is near-instant. Completing a scratch task draws the checkmark + strikethrough; delete shows the Undo toast. `prefers-reduced-motion` disables animations. Install button + banner work; offline shell loads.

## Part C — the corrections audit (C1–C11 — check each one)

- [ ] C1: sidebar ~380px (not 360); pane ~510px (not 360).
- [ ] C2: smart lists open nothing on right-click.
- [ ] C3: list menu has Move down only; group menu has Move up + Move down.
- [ ] C4: no search dropdown; count line "N Tasks, M Notes, and K Steps found"; lists/groups results kept as an enhancement.
- [ ] C5: Ctrl+F + Esc work; Ctrl+1/L/N/D and "?" are NOT implemented as silent fidelity features (any implementation is labelled an enhancement).
- [ ] C6: empty-state messages kept as an enhancement (not removed to match To Do).
- [ ] C7: footer is Created-only; no Updated line.
- [ ] C8: "Move to list" kept as an enhancement.
- [ ] C9: Suggestions sections conditional; "More" link present; "Add all" + lightbulb kept as enhancements.
- [ ] C10: only the pane slides; menus instant; list switching near-instant.
- [ ] C11: "Added to My Day" sort option appears on real lists only, not on smart lists.

## Part D — the live-account check (last step, before handing back)

1. Delete **all** scratch data (test account, Scratch lists, scratch groups, scratch tasks, scratch files).
2. Reload https://todo-232b3.web.app/ in the owner's browser.
3. Confirm: **3 tasks, 0 completed, 0 starred, 0 in My Day, 0 groups. Lists: My Day (0), All (3), Tasks (0), Test list 1 (2), Test list 2 (1).**
4. Confirm: no test list, group, or file remains; Settings are as the owner left them (theme, sound, toggles unchanged). Note: the 10:47 check set the theme explicitly to "Light" (it had shown "System" while rendering light) — confirm the stored theme value and report it.
5. If anything is different, restore it and say exactly what was changed and restored.

## Part E — report back (write this into the handoff to the user)

- One line per file (01–11): FIXED / PARTIALLY / STILL MISSING, with the evidence (screenshot or exact label observed).
- The Part A regression results (A1–A5) and the Part C corrections audit (C1–C11).
- The Part D live-account confirmation (exact counts + stored theme value).
- Any new regression found, with the exact steps to reproduce.
- The three unresolved owner questions from plan §15: final app name/icon ("ToDo PWA" vs "MyDay"), email provider for invites, custom domain vs `*.web.app`, Apple sign-in vs Google+Email first.

*Round 3 — 2026-11-20. Reference: Microsoft To Do web v2.135.0 (fresh check 10:34–10:45). Built app: https://todo-232b3.web.app/ ("ToDo PWA" v0.1.0).*
