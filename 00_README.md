# ToDo PWA (todo-232b3.web.app) — Round 2 Improvement Plan

**For AI agents: this is the SECOND round. Round 1 fix files are in `../Microsoft_To_Do_Clone_Fixes/` (00–11). Read this file first, then work through files 01–12 in order. One file at a time. Do not start the next file until the current file's acceptance tests pass. Do not re-break anything marked FIXED below.**

## What was re-checked

- **When:** 09:52–09:57 AM EST, Fri 2026-11-20, read-only, in the user's own already-logged-in browser (Nayeem Ahmed, naiemahmed84@gmail.com). No task, list, or setting was changed — a sort was applied then removed, grouping toggled on then off, the sidebar collapsed then re-expanded, date/repeat pickers opened then Cancelled, add-row Due/Repeat buttons cycled then restored to unset. Final state left as found (All list, List view, sidebar expanded, counts unchanged).
- **App version:** ToDo PWA v0.1.0.
- **Current data:** 3 tasks total, 0 completed, 0 starred, 0 in My Day, 0 groups. Lists: My Day (0), All (3), Tasks (0), Test list 1 (2: "test item 2", "test item1"), Test list 2 (1: "Test list item 1"). New since 09:30: "Test list 2" + "Test list item 1" (created 09:45 a.m.) and "test item 2" (Test list 1 grew 1→2).
- **Reference:** Microsoft To Do web v2.135.0 (live check 2026-11-20). Full spec: `../Microsoft_To_Do_Clone_Plan/` (files 01–10, v1.1). File 10 there is the authority where it conflicts with anything else.

## Round 2 verdict — what the agents actually did since 09:30

### ✅ FIXED (3) — do not regress these

| # | Was (09:30) | Now (09:57) |
|---|---|---|
| Sort | Native `<select>`, 4 options | Real menu button, 5 options in order: Importance, Due date, Added to My Day, Alphabetically, Creation date. Group menu exists. Pill "Sorted by alphabetical" with Reverse (⇅) + Remove (×); Remove restores default order. |
| Settings | No panel at all | Full panel (⚙ in top bar): General (Confirm before deleting off, Add new tasks on top off, Move starred to top on, Play completion sound on, reminder notifications on, Theme System/Light/Dark), Smart-list toggles, Connected apps (Flagged email off, Teams, Google Tasks disabled, Outlook Calendar off), About (v0.1.0, Export your info, Import JSON backup, Copy Session and User ID). |
| Data bug | "test item1" in both Tasks and Test list 1 | Fixed. Tasks is empty (was 1), Test list 1 = 2, Test list 2 = 1, All = 3 (2+1). Detail pane shows "Move to list: Test list 1". |

### ⚠️ PARTIALLY FIXED (8) — finish these

| # | Done | Still to do |
|---|---|---|
| 1. Layout | Top bar exists (☰, "ToDo PWA", centred Search, "Sync — Up to date" ✓, Settings ⚙, Help ?, avatar "N"). Gradient gone (white/light-grey sidebar, white lists). Account header + Dark/Sound/Export/Import gone from sidebar bottom. | Sidebar still **~490px** (was ~505px) at 1868px viewport — target 360px. See file 01. |
| 2. Smart lists | "All" added (count 3). Settings → Smart lists toggles all checked: Important, Planned, All, Completed, Assigned to me + Auto-hide empty (checked) + Show Due Today in My Day. | Sidebar shows only My Day, All, Tasks — the rest are auto-hidden because empty (correct behaviour, verify with data). **"Flagged email" is only a toggle under Connected apps, not a smart list.** See file 02. |
| 3. Groups | "Create group" textbox now sits below "+ New list"; clicking focuses it. | Still 0 groups, no group shown, no group right-click/menu, creation untested. See file 03. |
| 4. List pane | Add row now at TOP, placeholder "Add a task", "Add" button (disabled when empty) at top right, "📅 Due date" / "🔁 Repeat" buttons below the textbox. | No reminder icon in add row. No Completed section (unverifiable — 0 completed tasks). No empty states (blank white area). No task meta lines (title + ☆ only; even in All, no list name/due date). Add-row Due/Repeat **cycle** Today→none / daily→none instead of opening a calendar/menu. See file 04. |
| 6. Detail pane | ~463px (was ~470), "Drag to resize" handle (not drag-tested), header "Complete task" button, "Remind me" (Later today 10:00, Tomorrow 9:00 AM, Pick a date & time), "Assign to", "Add file", "Move to list" (new). Custom date calendar (Nov 2026, days 1–19 disabled, Previous disabled, Cancel/Save). Repeat now Never/Daily/Weekly/Monthly/Weekdays/Yearly/Custom…; Custom dialog (interval spinbutton, recurrence combobox days/weeks/months/years, Su–Sa buttons, Cancel/Save). Categories unchanged (correct). | "Add file" click produced **no visible picker/dialog**. "Assign to" only shows "This list is not shared yet — share it to assign tasks." Footer still only "Created Fri, Nov 20, 2026, 09:45 a.m." — no Updated date. Delete moved to bottom right (correct). See file 05. |
| 8. Menus | Task right-click now 9 items in order: Add to My Day, Mark as important, Mark as completed, Due today, Due tomorrow, Create new list from this task, Move task to… ▸, Copy task to… ▸, Delete task. "…" menu exists (Rename list, Change theme 5 swatches #0078d4 blue, #e74856 red, #8764b8 purple, #107c10 green, #0099bc teal, Print list, Delete list). | **Right-clicking a list in the sidebar produced NO menu.** No group right-click (no groups exist). See file 07. |
| 11. Search | Moved to top bar, opens a full results page ("Search: 'test'" with the 3 matching tasks). | Still title-only: "Test list" returned only the task "Test list item 1", not the lists "Test list 1"/"Test list 2". No dropdown, no counts by Tasks/Notes/Steps/Lists/Groups, no list attribution on results. See file 09. |
| 13. Sync / animations | Sync indicator exists: "Sync — Up to date" ✓ in top bar and Help menu. | Menus/detail pane still appear instantly (no slide/FLIP/completion animation observed). No install prompt/button anywhere (page, Settings, Help). See file 11. |

### ❌ STILL MISSING (3) — untouched since 09:30

| # | Gap | File |
|---|---|---|
| 7. My Day Suggestions | Still only "Recently added" (3 items, now with list name under each + add button). No other sections, no More button, no Suggestions toggle in the My Day header (only ✕ Close suggestions in the pane). | 06 |
| 9. Share | Still just copies a link + toast "Share link copied to clipboard!" — no members, no invite-via-email, no access note. | 08 |
| 12. Keyboard | Only Esc works. Ctrl+F did not focus search (typing "x" went nowhere). Ctrl+1 stayed on All. Ctrl+L had no app effect. "?" did nothing. Help menu has only "Sync — Up to date" and "What's new" — no shortcuts list. | 10 |

### 🐛 NEW REGRESSIONS / HALF-FINISHED (found in this round — fix in Round 2)

| # | Regression | File |
|---|---|---|
| a | **All list header invisible:** the "All" heading + Print/Sort/Group/List-options row exist in the page structure and are clickable, but are not visibly rendered (blank header area). The same row renders visibly in My Day and Test list 2. | 01 |
| b | **Duplicate and Share buttons exist in the page structure but were not visibly rendered** in the header. | 01 |
| c | **Help → "What's new" opens a dialog with no visible content** (title only). | 11 |
| d | **"Add file" click produced no visible picker/dialog.** | 05 |
| e | Group by Categories produced no visible grouping or pill when toggled (all tasks uncategorised, so unverifiable — test with categorised scratch data). | 03 |
| f | Grid view has no Add-a-task row and no visible toolbar. | 04 |
| g | **Alphabetical sort is case-sensitive:** "test item 2", "test item1", "Test list item 1" (lowercase before uppercase). Must be case-insensitive. | 11 |
| h | **List options menu stayed open behind the Settings panel** (overlay stacking quirk). | 01 |

## Priority order for Round 2

| Priority | File | Fix |
|---|---|---|
| **P0** | `08_fix_share.md` | Real Share dialog — the owner's reason for building this; untouched in both rounds |
| **P0** | `01_fix_sidebar_header_regressions.md` | Sidebar 490→360px + regressions (a), (b), (h) |
| **P0** | `11_fix_animations_sort_install.md` | Case-insensitive sort (g) + What's new content (c) — small, high-visibility bugs |
| **P1** | `05_fix_detail_pane_addfile_assign_updated.md` | Add file picker (d), Assign to (needs Share), Updated date, resize-handle test, pane 463→360px |
| **P1** | `07_fix_list_right_click.md` | List right-click menu (still no menu at all) |
| **P1** | `03_fix_groups.md` | Create a group for real, group menu + right-click, Categories grouping visible (e) |
| **P1** | `04_fix_list_pane_meta_empty_completed.md` | Meta lines, empty states, Completed section, reminder icon, Add-row Due/Repeat open pickers, Grid toolbar (f) |
| **P2** | `06_fix_myday_suggestions.md` | Suggestions sections, More, toggle, Add all |
| **P2** | `02_fix_flagged_email_smart_lists.md` | Flagged email as a smart list; verify auto-hide with data |
| **P2** | `09_fix_search.md` | Dropdown, counts, list attribution, surface lists |
| **P2** | `10_fix_keyboard.md` | All shortcuts + "?" dialog |
| **P2** | `11_fix_animations_sort_install.md` | Animations A1–A20, install prompt/button |
| — | `12_final_verification_round2.md` | Regression tests for the 3 FIXED items + full checklist, scratch data only |

## Rules (same as Round 1, plus)

1. **Do not regress a FIXED item.** File 12 re-tests Sort, Settings, and the one-task-one-list fix. If your change breaks one, fix it before moving on.
2. **Test with scratch data, never the owner's live data.** The live account now has 3 tasks ("test item1", "test item 2", "Test list item 1"). Create a separate test account or a clearly-named "Scratch" list for completing/starring/deleting/dragging/sharing tests. Delete scratch data afterwards and confirm the live account is unchanged.
3. **A feature that exists in the DOM but is not visible is broken.** Regressions (a), (b), (c), (d) are all of this type — verify every new control by looking at it, not by finding it in the page structure.
4. **Read the cited plan file before coding.** Each fix file cites the exact plan section. Do not invent labels, menu items, or times.
5. **No Microsoft branding.** Keep "ToDo PWA" and its own logo.

## Files

- `00_README.md` — this file
- `01_fix_sidebar_header_regressions.md`
- `02_fix_flagged_email_smart_lists.md`
- `03_fix_groups.md`
- `04_fix_list_pane_meta_empty_completed.md`
- `05_fix_detail_pane_addfile_assign_updated.md`
- `06_fix_myday_suggestions.md`
- `07_fix_list_right_click.md`
- `08_fix_share.md`
- `09_fix_search.md`
- `10_fix_keyboard.md`
- `11_fix_animations_sort_install.md`
- `12_final_verification_round2.md`

*Round 2 — 2026-11-20, 09:57. Reference: Microsoft To Do web v2.135.0. Built app: https://todo-232b3.web.app/ ("ToDo PWA" v0.1.0). Round 1 fixes: `../Microsoft_To_Do_Clone_Fixes/`.*
