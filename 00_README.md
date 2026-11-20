# ToDo PWA (todo-232b3.web.app) — Round 3 Improvement Plan

**For AI agents: this is the THIRD round. Round 1 fixes are in `../Microsoft_To_Do_Clone_Fixes/` (00–11), Round 2 in `../Microsoft_To_Do_Clone_Fixes_Round2/` (00–12). Read this file first, then work through files 01–12 in order. One file at a time. Do not start the next file until the current file's acceptance tests pass.**

## What was checked this time

- **Both sides, same morning, in the user's own browser, read-only:**
  - **Microsoft To Do (reference):** 10:34–10:45 AM EST, Fri 2026-11-20, https://to-do.live.com/tasks, account Nayeem Ahmed (naiemahmed84@live.com), **v2.135.0, dark mode on**. Nothing created/renamed/deleted/completed/starred/moved/shared. One side effect to know: while testing detail-pane resizing the pane was widened from ~510px to ~1015px and the width persisted — the owner was told to drag its left edge back.
  - **Built app:** 10:35–10:47 AM EST, https://todo-232b3.web.app/ ("ToDo PWA" v0.1.0), account Nayeem Ahmed (naiemahmed84@gmail.com). No task/list/group created, renamed, deleted, completed, starred, moved or shared (Share clicked once, displayed the existing invitation link, nobody invited).
- **Current built-app data (unchanged since 09:57):** 3 tasks total — "test item1" and "test item 2" in Test list 1 (2), "Test list item 1" in Test list 2 (1); Tasks empty; My Day empty; 0 groups. No new test data.

## ⚠️ CORRECTIONS — the fresh To Do check overturns Round 1/2 specs

The 10:45 reference check contradicts several things Round 1 and Round 2 told agents to build. **This section wins over Round 1 and Round 2 wherever they conflict.** Do not "fix" the built app toward the old (wrong) spec.

| # | Old spec (Rounds 1–2) | Live To Do v2.135.0 (10:45 check) — the truth |
|---|---|---|
| C1 | Sidebar 360px; detail pane 360px | Sidebar **~380px** (1920px viewport); detail pane default **~510px**. The built app's pane (~510px) is already correct — **do NOT shrink it to 360px**. Sidebar target is 505px → **~380px**. |
| C2 | Smart-list right-click shows Sort by ▸ + Print list | **Smart lists have NO right-click menu at all** (nothing opens). |
| C3 | List right-click has Move up + Move down | List right-click has **Move down only** (no Move up). Group right-click has Move up + Move down (first group lacks Move up). |
| C4 | Search must show lists/groups as results + a dropdown | To Do search has **no dropdown** and **no Lists/Groups results** — tasks/notes/steps only, count line "15 Tasks, 0 Notes, and 0 Steps found", each result shows its list name on a second line. The built app returning lists is an **enhancement, keep it** — but Notes/Steps counts are still missing. |
| C5 | All shortcuts work (Ctrl+N/L/T/D/F, Ctrl+1, "?") | In live To Do, **only Ctrl+F works** (focuses search) and **Esc** works. Ctrl+1, Ctrl+L, Ctrl+N, Ctrl+D have **no observable effect**; "?" **types "?"** into the Add box. Help pane has only "Learn more" + "Sync — Up to date". The documented shortcuts are not functional in the app. |
| C6 | Empty lists show a message/illustration | To Do empty lists/My Day/Tasks show **only the Add-a-task row — no message, no illustration**. The built app's empty-state messages are an **enhancement, keep them**. |
| C7 | Detail pane footer shows Created + Updated | To Do footer shows **only "Created by <name> on <date>"** (current year: no year shown; older: year shown). **No Updated line exists.** Remove the Updated requirement. |
| C8 | Detail pane has a "Move to list" row | To Do has **no "Move to list" row** — moving is via task right-click → "Move task to…". The built app's Move to list is an **enhancement, keep it**. |
| C9 | Suggestions has sections (Yesterday/Due today/Overdue/Due tomorrow) + "Add all" | In this account To Do shows **only "Recently added"** + a **"More" link**; **no "Add all"** anywhere. Sections are conditional (they appear only when such tasks exist). The built app's "Add all" + lightbulb toggle are **enhancements, keep them**; add the missing "More" link. |
| C10 | Menus/panes animate (A1–A20) | In live To Do, **menus open instantly, list switching is near-instant; only the detail pane slides** in from the right. Animations A1–A20 are aspirational, not observed behaviour. Match To Do: pane slide only; do not add slow menu fades. |
| C11 | Sort menu = Importance, Due date, Added to My Day, Alphabetically, Creation date | 10:45 check on My Day shows **Importance, Due date, Alphabetically, Creation date** (no Added to My Day). Morning check saw Added to My Day on real lists only. Keep Added to My Day **on real lists only**; smart lists show the 4 options. |

## Round 3 verdict — what changed since 09:57

### ✅ FIXED in Round 2 (3) — do not regress

| # | Now |
|---|---|
| Sort case-insensitive | All sorts as "test item 2", "test item1", "Test list item 1" — correct case-insensitive order. |
| Group by Categories | Group menu offers "Categories"; selecting it shows pill "Grouped by categories ×" + heading "No category (3)". |
| Due/Repeat pickers | Due and Repeat in the Add row now open picker menus (no longer cycle Today→none / daily→none). |

### ⚠️ PARTIALLY FIXED (5)

| # | Done | Still to do |
|---|---|---|
| 1. Layout | Menu-behind-Settings fixed. | Sidebar still **~505px** (target now ~380px, C1). **All/custom-list headers are in the DOM but INVISIBLE in the light theme (white-on-white)** — they render in Dark theme. Duplicate/Share exist in DOM, invisible in light, but Share works. |
| 4. List pane | All shows each task's list name as a meta line; empty states present; Remind me (🔔) icon present in Add row; Grid view exists (Done/Title/Due Date/Importance, toast "Grid view opened"). | **Remind me still CYCLES** ("Remind me" → "Later today" → "Remind me"). Due menu has only 3 quick options, **no calendar**. "Completed (0)" appears inconsistently. Grid has no Add row (correct per To Do). |
| 6. Suggestions | "Add all" + 💡 "Suggestions" toggle exist in the My Day header (pressed state). | Only "Recently added" section; **no "More" link**, no other sections. |
| 8. Share | **Real "Share list" dialog now exists**: members "Nayeem Ahmed (Owner)", invitation link https://todo-232b3.web.app/?share=4RjKEJf2sBs86lc8HG5m + "Copy link", "Invite via email" textbox, note "Anyone with this link and an account can join and edit this list." | "Invite" button is **disabled**; **no "Manage access"** section; dialog opens **bottom-left, not centred**. |
| 9. Search | "Test list" returns lists "Test list 1"/"Test list 2" + task "Test list item 1" with attribution "Test list 2". Counts inline "Tasks (1) Lists (2) Groups (0)". | **No Notes/Steps counts.** No dropdown (correct per To Do, C4 — do not add one). |

### ❌ STILL MISSING (5)

| # | Gap | File |
|---|---|---|
| 2. Flagged email | No smart list; `/tasks/flagged` falls back to My Day (no empty state). Toggle exists and is ON in Settings → Smart lists and Connected apps. | 02 |
| 5. Detail pane | Pane ~510px (correct width now, C1) but **"Drag to resize" handle exists in DOM and two drag attempts did not change the width**. "Add file" click: no visible in-page change, no visible file picker (inconclusive). Footer only "Created Fri, Nov 20, 2026, 09:40 a.m." (correct per C7 — no Updated). | 05 |
| 7. List right-click | Right-clicking "Test list 1" and "All" opened **no menu at all**. | 07 |
| 10. Keyboard | Ctrl+F, Ctrl+1, Ctrl+L, Ctrl+N, Ctrl+D, "?" each had **no observable effect**. Help has only "Sync — Up to date" + "What's new". | 10 |
| 11. Animations/install | No animations observed; **no install prompt/button anywhere**. | 11 |

### 🐛 NEW REGRESSIONS (Round 3)

| # | Regression | File |
|---|---|---|
| a | **Light theme white-on-white:** header text and buttons render white-on-white and are intermittently invisible — list titles, Duplicate/Share, My Day Print/Sort/Group toolbar. Renders correctly in Dark theme. | 01 |
| b | **Repeat picker menu does not close on Escape or outside click** — only by toggling Repeat again. | 04 |
| c | Due-date picker offers only 3 quick options, **no calendar**. | 04 |
| d | **"Completed (0)" section appears inconsistently** (once in All in the first tab, absent in default All view and after re-sorting). | 04 |
| e | **Share dialog positioned bottom-left, not centred.** | 08 |
| f | **"What's new" FROZE the tab twice** (page control lost in two separate tabs; fresh tabs needed to continue). Dialog content never seen. **Critical.** | 11 |

### Regression check — still good

Sort menu 5 options + pill Reverse/Remove unchanged. Settings panel complete. "test item1" in exactly one list (Test list 1).

## Priority order for Round 3

| Priority | File | Fix |
|---|---|---|
| **P0** | `11_fix_whats_new_freeze.md` | "What's new" tab freeze (f) — critical |
| **P0** | `01_fix_light_theme_sidebar.md` | White-on-white light theme (a) + sidebar 505→~380px |
| **P0** | `08_fix_share_dialog_finish.md` | Enable Invite, Manage access, centre dialog (e) |
| **P1** | `07_fix_list_right_click.md` | List right-click (still no menu) — corrected menus (C2, C3) |
| **P1** | `05_fix_detail_pane_resize_addfile.md` | Resize handle actually drags; Add file chooser; footer format (C7) |
| **P1** | `04_fix_add_row_pickers_completed.md` | Remind-me cycling, Due calendar (c), Repeat menu close (b), Completed flakiness (d) |
| **P1** | `02_fix_flagged_email.md` | Flagged email smart list + route |
| **P2** | `06_fix_myday_suggestions_more.md` | "More" link; conditional sections (C9) |
| **P2** | `09_fix_search_counts.md` | Notes/Steps counts (C4) |
| **P2** | `10_fix_keyboard_corrected.md` | Ctrl+F + Esc perfect; the rest documented as non-functional in To Do (C5) |
| **P2** | `11_fix_whats_new_freeze.md` | Animations per C10 + install prompt |
| — | `12_final_verification_round3.md` | Regression tests incl. the 3 Round-2 FIXED items + all corrections C1–C11 |

## Rules

1. **The corrections table (C1–C11) overrides Round 1 and Round 2.** If a Round 1/2 file tells you to build something this file says To Do does not do, follow this file.
2. **Do not regress a FIXED item.** File 12 re-tests them. If your change breaks one, fix it before moving on.
3. **Test with scratch data, never the owner's live data.** Live account: 3 tasks ("test item1", "test item 2", "Test list item 1"). Create a separate test account or a "Scratch" list for destructive tests. Delete scratch data afterwards and confirm the live account is unchanged.
4. **A feature in the DOM but not visible is broken.** Regressions (a) and the earlier (b) are this type — verify by looking, not by finding it in the page structure.
5. **A feature that freezes the tab is critical** (f). Reproduce it, find the cause, fix it, and prove the tab stays responsive.
6. **No Microsoft branding.** Keep "ToDo PWA" and its own logo.

## Files

- `00_README.md` — this file
- `01_fix_light_theme_sidebar.md`
- `02_fix_flagged_email.md`
- `03_fix_groups_creation.md`
- `04_fix_add_row_pickers_completed.md`
- `05_fix_detail_pane_resize_addfile.md`
- `06_fix_myday_suggestions_more.md`
- `07_fix_list_right_click.md`
- `08_fix_share_dialog_finish.md`
- `09_fix_search_counts.md`
- `10_fix_keyboard_corrected.md`
- `11_fix_whats_new_freeze.md`
- `12_final_verification_round3.md`

*Round 3 — 2026-11-20, 10:47. Reference: Microsoft To Do web v2.135.0 (fresh check 10:34–10:45). Built app: https://todo-232b3.web.app/ ("ToDo PWA" v0.1.0). Round 1: `../Microsoft_To_Do_Clone_Fixes/`. Round 2: `../Microsoft_To_Do_Clone_Fixes_Round2/`.*
