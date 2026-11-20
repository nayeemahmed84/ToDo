# Microsoft To Do Clone — Firebase + PWA Build Plan

> **Purpose:** A single, build-ready specification so any AI agent (or human developer) can rebuild Microsoft To Do 100% accurately — same screens, same behaviours, same animations, same right-click menus, same keyboard flows — as a new app running on **Firebase** and as a **PWA for web + iOS mobile**.
>
> **Why this exists:** Microsoft To Do retires **30 June 2027** on Windows, Mac, Android, iOS and web. For personal accounts Microsoft is not offering Planner as a replacement and advises choosing another app. There is no automatic export/import to another app. This clone is the replacement.
>
> **Owner / first user:** Nayeem (Mollah Nayeem Ahmed, America/Toronto, `naiemahmed84@live.com` — his Microsoft account). His real data to seed / test with: **12 lists, 455 tasks — 41 open, 414 completed** — migrated to Google Tasks on 2026-11-18. Lists: Grocery, Travel Preparation Checklist, Countries to Travel, Costco, Dollarama, Food basic, Murray wholesale, Shoppers, Walmart, FKK, Cigarette jiang, Products at home. Plus 9 shared store lists (shared with Tanmoy Nawaj Khan and Ghazi Shahariar Fahim) that Google Tasks could *not* share — **sharing must work in this clone**. Source manifest: `workspace/todo-to-google-tasks/manifest.jsonl`.
>
> **Version 1.1 — 2026-11-20 (live inspection, app 2.135.0, signed in as Nayeem Ahmed, dark mode on).** Appendix A at the end of this file records everything found by a live read-only inspection of https://to-do.live.com/tasks/ on 2026-11-20. **Where Appendix A conflicts with §2–§9, Appendix A wins.** The main body was written from docs + prior knowledge; the appendix corrects it with observed labels, menus, and settings.
>
> **How to use this file:** Build in the order in §12. Do not skip a section and claim parity. Every feature in §3–§7 is **MUST**, unless marked `V2`. At the end of each phase, run the acceptance checklist in §13. If a behaviour is not in this file, match Microsoft To Do's observed behaviour, not your own invention — and add it to this file.
>
> **Reference behaviour sources:** Microsoft Support — keyboard shortcuts: https://support.microsoft.com/en-us/todo/using-keyboard-shortcuts-in-microsoft-to-do · To Do help: https://support.microsoft.com/en-us/todo · Web app: https://todo.microsoft.com/ / https://to-do.live.com/tasks/

---

## 0. Non-negotiables — read first

1. **Pixel-faithful clone first, improvements second.** No re-design, no renamed menus, no "better" flow in V1. Improvements go in §11 as V2, behind a flag.
2. **Offline-first.** The app must work fully offline on web and on iOS PWA, and sync when back online. A task created offline must never be lost.
3. **Optimistic UI everywhere.** Every click updates the UI instantly (<50 ms perceived), then syncs to Firebase. Never block on the network. Never show a spinner for a local action.
4. **No data loss on sync conflict.** Last-write-wins *per field*, never per document. Deleted wins only if the delete timestamp is newer than the last edit.
5. **Accessibility is not optional.** Full keyboard use, visible focus, screen-reader labels, 4.5:1 contrast, reduced-motion support.
6. **iOS PWA is a first-class target, not an afterthought.** It must install to Home Screen, open full-screen, work offline, respect safe areas, and feel native. See §9 for iOS limits — design around them, do not ignore them.
7. **Do not copy Microsoft branding.** Name, logo, and icon must be original (e.g. "Nayeem To Do" / "MyDay Tasks" — owner to confirm). Do not use Microsoft logos, Fluent icons copied 1:1, or the name "Microsoft To Do" in the UI. Behaviour and layout may be cloned; trademarks may not.

---

## 1. Product overview

### 1.1 What it is

A personal task manager with three levels:

```
Group (optional folder for lists)
 └─ List (a collection, e.g. "Costco")
     └─ Task (one line, e.g. "Buy milk")
         └─ Step (checklist item inside a task — text + checkbox only)
```

Plus **Smart Lists** — automatic, read-only views computed from all tasks:

| Smart list | Rule |
|---|---|
| **My Day** | Tasks explicitly added to My Day for *today*. Resets at midnight local time. Tasks created directly in My Day live in the default `Tasks` list underneath. |
| **Important** | `task.isImportant == true` (starred). |
| **Planned** | `task.dueDate != null OR task.reminderAt != null`. Grouped: Overdue / Earlier / Today / Tomorrow / Later (see §3.5). |
| **Assigned to me** | `task.assignedTo == currentUser && task.createdBy != currentUser`. |
| **Flagged email** | V1: show empty state "No flagged emails — Outlook/flagged-email import is V2". Do NOT fake it. |
| **Tasks** | Default catch-all list. Every task belongs to exactly one user list; tasks with no list land here. |

### 1.2 Users & roles

- **Owner:** creates lists, tasks, groups; shares lists; deletes anything they own.
- **Member (shared list):** can add / complete / edit tasks and steps in that shared list, add notes/files. Cannot rename/delete/share the list, cannot remove the owner, cannot see other lists of the owner.
- **Viewer (V2):** read-only. Not in V1.
- One person, one account. Multi-account switching is V2. Sign in with Google + Apple + Email/Password in V1 (see §8.1). Microsoft sign-in is V2 — do not depend on it.

### 1.3 Platforms

| Platform | Target |
|---|---|
| Web (Chrome, Edge, Firefox, Safari desktop) | Full app, full keyboard + right-click |
| iOS PWA (Safari → Add to Home Screen, iOS 16.4+) | Full app, touch-first, long-press = right-click, push via FCM where iOS allows (see §9.4) |
| Android PWA | Full app (same codebase, no extra work) |
| Native apps | Out of scope — PWA only in V1 |

---

## 2. Design system — exact look & feel

Clone the Microsoft To Do web look. These tokens are the source of truth; do not invent a new palette.

### 2.1 Layout — desktop web (≥1024 px)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ Top bar (48px): [☰] [Search ………………………]        [Sync] [⚙ Settings] [Avatar] │
├──────────────┬──────────────────────────────────────┬───────────────────────┤
│ Sidebar      │ List header + task list              │ Detail pane (360px) │
│ 280px        │                                      │ (only when a task   │
│              │ Add a task [+ due date] [reminder]   │  is selected)       │
│ My Day       │ Task row                             │                     │
│ Important    │ Task row                             │ Title (editable)    │
│ Planned      │ Task row                             │ Steps               │
│ Assigned     │ ── Completed (n) ── [Show/Hide]      │ Add to My Day       │
│ Flagged      │ Completed task row (struck through)  │ Remind me           │
│ Tasks        │                                      │ Add due date        │
│ ─────────    │                                      │ Repeat              │
│ Groups ▸     │                                      │ Add file            │
│  Lists…      │                                      │ Notes               │
│ + New list   │                                      │ Created … · Delete  │
│ + New group  │                                      │                     │
└──────────────┴──────────────────────────────────────┴───────────────────────┘
```

- **Sidebar:** 280 px, collapsible to 48 px icon rail (`Ctrl+1` / hamburger). Background `#F5F5F5` light / `#1F1F1F` dark. Smart lists at top, then groups (collapsible), then user lists alphabetically *in the order the user dragged them* — default is creation order, user order wins after any drag.
- **Main pane:** max-width none; list header shows list name (36 px, semibold), list options `…`, sort menu, and (My Day only) lightbulb Suggestions button + date line "Tuesday, November 20".
- **Detail pane:** 360 px, slides in from the right (see §7.1). On <1024 px it becomes a full-screen overlay sheet. On mobile it is a bottom sheet / full-screen page.
- **Top bar:** 48 px, white / dark `#2B2B2B`. Search is centred, 480 px max, rounded 4 px, placeholder "Search".

### 2.2 Colours

| Token | Light | Dark | Use |
|---|---|---|---|
| `--bg` | `#FFFFFF` | `#1B1B1B` | Main pane |
| `--sidebar-bg` | `#F5F5F5` | `#202020` | Sidebar |
| `--surface` | `#FFFFFF` | `#2B2B2B` | Cards, menus, detail pane |
| `--surface-hover` | `#F3F2F1` | `#333333` | Row hover |
| `--surface-active` | `#EDEBE9` | `#3A3A3A` | Selected list / task |
| `--text` | `#323130` | `#F3F2F1` | Primary text |
| `--text-2` | `#605E5C` | `#C8C6C4` | Secondary / meta |
| `--text-3` | `#8A8886` | `#8A8886` | Placeholder, counts |
| `--border` | `#EDEBE9` | `#3B3B3B` | Dividers |
| `--accent` | `#0078D4` | `#4CC2FF` | Links, focus, My Day sun, primary buttons |
| `--accent-hover` | `#106EBE` | `#6ECFFF` | Accent hover |
| `--danger` | `#D13438` | `#F1707B` | Delete |
| `--star` | `#0078D4` | `#4CC2FF` | Important star (filled = accent, not gold) |
| `--complete` | `#605E5C` | `#A19F9D` | Completed text |
| `--overdue` | `#D13438` | `#F1707B` | Overdue date |
| `--today` | `#0078D4` | `#4CC2FF` | Due today |
| `--checkbox` | `#605E5C` | `#C8C6C4` | Unchecked ring |
| `--shadow-menu` | `0 8px 16px rgba(0,0,0,.14), 0 0 2px rgba(0,0,0,.12)` | same, darker | Menus |
| `--shadow-pane` | `-8px 0 16px rgba(0,0,0,.08)` | `-8px 0 16px rgba(0,0,0,.4)` | Detail pane |

**List themes:** each list may pick a theme colour (default blue `#0078D4`) and a background photo (V1: solid colour + 6 preset gradients; photo backgrounds V2). The theme colour tints: list header accent, checkbox hover, "Add a task" underline, detail-pane accent. Never tint the whole page — only accents.

**Dark mode:** follow system by default; toggle in Settings → Appearance: Light / Dark / System. Persist per user (`users/{uid}.settings.theme`).

### 2.3 Typography

- Font stack: `"Segoe UI", system-ui, -apple-system, "Helvetica Neue", Arial, sans-serif` on web/Windows; on iOS PWA use `-apple-system, "SF Pro Text", "Segoe UI", sans-serif` — same sizes, same weights.
- List title: 28 px / 600 (desktop), 24 px mobile.
- Task title: 14 px / 400, line-height 20 px. Completed: same + `line-through`, colour `--complete`.
- Meta line under task (due date, steps "2 of 5", note icon, file icon): 12 px / 400, `--text-2`. Overdue in `--overdue`, due today in `--today`.
- Sidebar list name: 14 px / 400; active list 600.
- Buttons / menu items: 14 px / 400.
- Detail pane title: 16 px / 600, editable inline.

### 2.4 Icons & density

- Use Fluent-style outline icons (24 px in sidebar, 20 px in rows, 16 px inline). Do NOT copy Microsoft's icon font files; draw equivalent SVGs or use an open Fluent-compatible set and document the licence.
- Row height: task row 52 px (single line) / 68 px with meta line. Sidebar row 36 px. Comfortable density only in V1.
- Checkbox: 18 px circle, 1.5 px ring. Hover: ring turns accent + shows check. Checked: accent fill, white check, then task animates (see §7).
- Star (Important): 20 px outline star on the right of the row; filled accent when important; hover fills.
- Drag handle: 6-dot grip appears on row hover (desktop only), cursor `grab` → `grabbing`.

### 2.5 Responsive breakpoints

| Width | Layout |
|---|---|
| ≥1280 px | 3-pane: sidebar 280 + list + detail 360 |
| 1024–1279 px | Sidebar 280 + list; detail overlays list (360 px, shadow) |
| 768–1023 px | Sidebar collapsible (hamburger, overlay drawer); list full; detail full-screen overlay |
| <768 px (iOS PWA / phone) | Bottom nav? **No — match To Do mobile:** hamburger drawer for lists, list full-width, detail full-screen sheet, FAB "+" to add task, bottom safe-area padding. See §9. |

---

## 3. Functional specification

### 3.1 Authentication & account

| ID | Requirement |
|---|---|
| AUTH-01 | Sign in with Google, Apple, Email + Password. Sign-up with Email + Password (verify email before first sync — allow local use immediately, block sharing until verified). |
| AUTH-02 | Stay signed in across restarts (Firebase Auth persistence `indexedDBLocalPersistence` on web, `browserLocalPersistence` fallback). Sign out from avatar menu → clears local cache only after confirming cloud sync is complete; if offline, warn "You have N unsynced changes — sign out anyway?" |
| AUTH-03 | Avatar menu: account email, "Manage account" (opens Firebase Auth user page — V1: profile screen in-app), Settings, Sign out. |
| AUTH-04 | Password reset via email. No password is ever stored in Firestore. |
| AUTH-05 | One user = one workspace. No workspaces / teams in V1. |

### 3.2 Sidebar, lists & groups

| ID | Requirement |
|---|---|
| LIST-01 | Smart lists always at top, in this order, cannot be reordered/deleted/renamed: My Day, Important, Planned, Assigned to me, Flagged email, Tasks. Each shows a count badge (open tasks only) except My Day (shows today's count). |
| LIST-02 | Hide/show smart lists in Settings → Smart Lists (toggles for Important, Planned, Assigned to me, Flagged email; **My Day and Tasks cannot be hidden**). Hidden smart lists disappear from sidebar immediately, no confirm. |
| LIST-03 | **Create list:** "+ New list" at sidebar bottom, or `Ctrl+L` (web) / `Ctrl+Shift+L` (Mac/web conflict — see §6). Inline text field appears at bottom of list section, focused, placeholder "New list". `Enter` creates + opens it; `Esc` cancels; empty name is rejected with inline shake (see §7) and stays open. Duplicate names allowed (To Do allows them). Max 255 chars. |
| LIST-04 | **Create group:** "+ New group" (or the group icon next to New list). Same inline flow. Group name placeholder "New group". |
| LIST-05 | **Group behaviour:** click chevron to collapse/expand (animated 180 ms, see §7). Drag a list onto a group header to move it in; drag out to ungroup. A group with 0 lists shows "Drag lists here" empty state when expanded. Delete group: confirm dialog — lists inside are NOT deleted, they move to ungrouped. Rename group: double-click name, or right-click → Rename group. |
| LIST-06 | **Rename list:** double-click list name in sidebar, or right-click → Rename list, or list header `…` → Rename list. Inline edit, `Enter` saves, `Esc` cancels, click-away saves. |
| LIST-07 | **Delete list:** right-click → Delete list, or header `…` → Delete list. Confirm dialog: "Delete list 'X'? This will permanently delete N tasks." [Cancel] [Delete] (danger). Deleting a list deletes its tasks, steps, files (Storage objects), and shares. Undo: toast with Undo for 5 s — restore from trash (see LIST-14). |
| LIST-08 | **Duplicate list:** right-click → Duplicate list. Creates "<Name> (copy)" with all tasks copied (new IDs, same titles, due dates, steps, notes; files are *referenced* copy — new Storage copy in V2, shared reference in V1 with a note in code; completed state copied; My Day flags NOT copied; shares NOT copied). Opens the copy. |
| LIST-09 | **List options menu (`…` in list header):** Rename list, Change theme, Sort by ▸ (see §3.7), Hide completed tasks / Show completed tasks, Duplicate list, Share list, Print list (V2 — show disabled with tooltip "Coming soon" in V1? **No — omit entirely in V1**), Delete list. Smart lists show a reduced menu: Sort by, Hide/Show completed, and (My Day) "Suggestions" toggle — no Rename/Delete/Share. |
| LIST-10 | **Change theme:** colour picker (10 swatches: blue `#0078D4`, purple `#8764B8`, teal `#038387`, green `#107C10`, orange `#CA5010`, red `#D13438`, pink `#E3008C`, dark blue `#004578`, dark green `#004B1C`, grey `#605E5C`) + 6 gradients. Applies instantly, syncs. |
| LIST-11 | **Share list:** header `…` → Share list, or right-click → Share list. Dialog: invite by email (must be a registered user in V1 — if not registered, show "No account with this email yet — they can sign up, then you can share"), list of current members with role + Remove, "Copy link" (V1: link opens app and shows a Join request — owner approves; direct auto-join by link is V2). Owner sees "You are the owner". Shared list shows a people icon + member avatars in sidebar. |
| LIST-12 | **Reorder lists:** drag list row by grip (desktop) or long-press + drag (touch). Drop indicator is a 2 px accent line. Order persists per user (`users/{uid}.settings.listOrder`). Smart lists never move. Groups reorder the same way. |
| LIST-13 | **List counts:** sidebar badge = open (incomplete) task count in that list. `0` shows no badge. Completed-only lists show no badge. |
| LIST-14 | **Trash / Undo:** deleted lists/tasks go to `trash/{uid}` for 30 days, restorable from Settings → Trash. Toast Undo (5 s) restores immediately. After 30 days a scheduled Function hard-deletes. Empty trash button with confirm. |
| LIST-15 | **Empty list state:** centred illustration + "No tasks yet" + "Add a task above to get started." No illustration asset? Use a simple SVG (document it). |

### 3.3 Tasks — create, edit, complete

| ID | Requirement |
|---|---|
| TASK-01 | **Add a task:** click "Add a task" row at top of list (or `Ctrl+N`). Inline input appears, focused. Type + `Enter` creates task and keeps focus in a *new* empty input (rapid entry). `Esc` or click-away closes empty input. Pasted multi-line text: each line becomes a separate task (confirm if >20 lines: "Create N tasks?"). Empty title is not created. Max title 255 chars; over-limit: truncate + toast. |
| TASK-02 | **Inline date/reminder on add:** in the Add row, icons for due date and reminder (calendar + bell). Clicking them while typing sets the date on the task being typed. Natural-language parsing (V1, English only): typing "Buy milk tomorrow" or "Call mum Friday noon" or "Pay rent every Monday" in the Add box shows a subtle inline hint under the input ("Due: Tomorrow · Reminder: — · Repeat: Weekly") — `Enter` applies it and strips the phrase from the title. If parsing is ambiguous, do nothing (no wrong date is better than a guessed one). |
| TASK-03 | **Complete / uncomplete:** click the circle. Animation per §7.2. Completing a task: strikethrough, fades, moves to Completed section (or disappears if "Hide completed" is on). Uncompleting restores it to its original position (store `completedAt` + `previousOrder`). `Ctrl+D` completes the selected task. |
| TASK-04 | **Important (star):** click star, or `Ctrl+T`? No — `Ctrl+T` is My Day (see §6). Star via click or detail pane. Starred tasks appear in Important. Unstar removes. No animation beyond a 150 ms star fill pop. |
| TASK-05 | **Rename task:** click title in detail pane (editable), or double-click row title, or `F2` / `Enter` on selected row? **Spec:** double-click row opens inline edit in the row; `Enter` saves, `Esc` cancels. Single click on row selects + opens detail pane (see §3.4). |
| TASK-06 | **Select task:** single click selects (highlight) + opens detail pane on desktop (≥1024 px). On mobile, single tap opens detail full-screen. `↑` / `↓` moves selection; `Space`/`Enter` opens detail. Selected row has `--surface-active` background + left accent border 2 px. |
| TASK-07 | **Multi-select:** `Ctrl+Click` / `Cmd+Click` toggles one; `Shift+Click` selects range; `Ctrl+A` selects all *visible* (not completed-hidden) tasks in the current list. A bulk bar appears at the bottom of the list: "N selected" + [Add to My Day] [Mark complete] [Mark important] [Move to ▸] [Delete] [Clear]. `Esc` clears selection. Dragging any selected task drags all of them. |
| TASK-08 | **Drag to reorder:** drag by grip or by row (desktop). Ghost row is semi-transparent (opacity .6); drop line 2 px accent. Dropping reorders `order` field (fractional indexing — see §8.4). Works in custom-sort mode only; in other sort modes dragging is disabled and the grip is hidden with tooltip "Change sort to Custom to reorder". |
| TASK-09 | **Move to another list:** drag task onto a list in the sidebar (highlight target list), or bulk bar → Move to ▸ submenu, or right-click → Move to ▸. Moving keeps due date, steps, notes, files, importance; clears My Day flag (My Day is per-day, not per-list — keep the flag only if the target is the same day's My Day? **Rule: clear it.** Document this). |
| TASK-10 | **Delete task:** right-click → Delete task, or detail pane → Delete (bottom), or `Ctrl+Backspace` / `Delete` key when selected (with confirm? **Rule:** no confirm for a single task — toast Undo 5 s. Confirm only for bulk delete >1, and for list delete). Deleting a task in a smart list deletes it from its home list too (it is the same task, not a copy). |
| TASK-11 | **Task row content:** [checkbox] [title (1 line, ellipsis)] [meta line if any: due date / "2 of 5" steps / 📎 file count / 📝 note] … [star]. Overdue date red + bold. Due today blue. Due tomorrow / later grey. Completed date shows "Completed" in meta? No — completed tasks show `Completed <date>` in detail pane only. |
| TASK-12 | **Hashtags:** `#word` in a title is rendered as a link (accent, underline on hover). Clicking it runs a search for that hashtag across all lists. V1: search only, no hashtag view. |

### 3.4 Task detail pane

Opens on the right (360 px) when a task is selected; closes with `X`, `Esc`, or clicking the same task again. Only one task open at a time.

| ID | Requirement |
|---|---|
| DET-01 | **Title:** editable text field at top, auto-resizes, `Enter` saves + moves focus to first step, `Esc` reverts. Checkbox + star at the top row, same behaviour as list row. Steps progress "1 of 3" under title when steps exist. |
| DET-02 | **Steps:** "Add step" input at top of steps list. `Enter` adds + focuses new empty step input. Each step: [checkbox] [text, editable inline] [× on hover]. Completing a step strikes it through (no move). Deleting a step: hover ×, no confirm, Undo toast. Reorder steps by drag (grip on hover). Steps have NO due date/reminder/sub-steps. Max 100 steps per task. Progress updates live in list row ("2 of 5") and in detail. |
| DET-03 | **Add to My Day:** button row "Add to My Day" (sun icon). When already in My Day: "Added to My Day ✓" + "Remove from My Day" on click. `Ctrl+T` toggles for the selected task. |
| DET-04 | **Remind me:** row with bell icon. Options: Later today (today 18:00 local), Tomorrow (tomorrow 09:00), Next week (next Monday 09:00), Pick a date & time (date picker + time picker, 15-min steps). Shows current reminder with × to clear. Only one reminder per task. Reminder fires a push + in-app toast at that time (see §8.7). **A due date has no time; a reminder is the only date with a time.** |
| DET-05 | **Add due date:** row with calendar icon. Options: Today, Tomorrow, Next week (next Monday), Pick a date (calendar picker, see §3.6). Shows current due date with × to clear. Due date only — no time, no range (the "Next week = date range" quirk in old To Do is NOT cloned). |
| DET-06 | **Repeat:** row with repeat icon. Options: Daily, Weekdays, Weekly, Monthly, Yearly, Custom… Custom opens a dialog: Repeat every [N] [Day(s)/Week(s)/Month(s)/Year(s)], on [weekdays] / on day [N] of month, ends [Never / On date / After N occurrences]. When a repeating task is completed, a new copy is created for the next occurrence (same title/steps unchecked/notes, new due date), and the completed one stays completed. See recurrence engine §8.5. |
| DET-07 | **Assign (shared lists only):** row "Assign to" with member picker (avatar + name). Assigned task appears in assignee's "Assigned to me". Unassign via ×. In non-shared lists this row is hidden. |
| DET-08 | **Add file:** row "Add file". File picker (max 25 MB per file, max 10 files per task — match To Do's 25 MB limit). Allowed: images, PDF, Office, text, zip. Blocked: executables (`.exe .bat .sh .msi .app`). Upload shows progress bar in the row; on success shows file chip [icon] [name] [size] [×] [download on click]. Images show a thumbnail. Files stored in Firebase Storage `users/{uid}/tasks/{taskId}/…`, metadata in Firestore subcollection. Deleting a file deletes Storage object. Offline: queue upload, show "Waiting for connection". |
| DET-09 | **Add note:** multi-line text area, placeholder "Add note". Auto-saves on blur / after 800 ms debounce while typing (show "Saving…" → "Saved"). Supports plain text only in V1 (no rich text, no markdown rendering — render line breaks). Links are auto-linked. Max 10,000 chars. |
| DET-10 | **Footer:** "Created on <date>" (e.g. "Created on 20 November 2026") left, Delete (trash icon + "Delete task") right. Delete follows TASK-10 (toast Undo). |
| DET-11 | **Detail pane on smart lists:** same pane, same task. Editing here edits the home-list task. "Move to" is available; deleting deletes everywhere. |

### 3.5 My Day

| ID | Requirement |
|---|---|
| MYDAY-01 | Header shows today's date, e.g. "Friday, November 20, 2026", and a lightbulb **Suggestions** button (top-right of header). |
| MYDAY-02 | **Suggestions panel:** slides in from right (same pane as detail, 360 px) listing: (a) unfinished tasks from yesterday's My Day, (b) tasks due today, (c) overdue tasks, (d) tasks due tomorrow — in that order, max 20, each with [+] "Add to My Day" button. Clicking [+] adds it (with the §7 add animation) and removes it from suggestions. "Add all" button at top. Close with X / Esc. |
| MYDAY-03 | **Reset:** at local midnight (user timezone, default America/Toronto — stored per user), My Day clears: `myDayDate` no longer equals today for every task. Unfinished tasks stay in their home lists and re-appear in tomorrow's suggestions. Completed My Day tasks stay completed. Implement as: store `myDayForDate: "2026-11-20"` on the task; a query filters `myDayForDate == today`. No nightly delete job needed — but a scheduled Function also clears stale flags older than 2 days for hygiene. |
| MYDAY-04 | **Auto-add due-today (setting):** Settings → "Show 'Due Today' tasks in My Day" toggle (default OFF, matching To Do default). When ON, tasks due today appear in My Day automatically (computed, not stored). |
| MYDAY-05 | Adding a task directly in My Day creates it in the default `Tasks` list with `myDayForDate = today`. |

### 3.6 Date pickers

- **Calendar picker:** month grid, Mon-first (locale-aware — default en-CA: Sunday-first? **Rule: follow the user's locale; default en-CA = Sunday first, week starts Sunday.** Document the choice). Today highlighted (accent outline), selected day accent fill, hover grey. Prev/next month chevrons, month/year dropdown. "Today" quick link at bottom. Keyboard: arrows move day, `Enter` selects, `Esc` closes.
- **Time picker (reminder only):** dropdown list in 15-min steps + free text `HH:MM` (24h) / `h:mm AM/PM`. Invalid time shows inline error, does not close.
- **Quick options** (due date): Today / Tomorrow / Next week. (Reminder): Later today / Tomorrow / Next week / Pick a date & time. Exact labels, exact times: Later today = today 18:00; Tomorrow = tomorrow 09:00; Next week = next Monday 09:00 (if today is Monday, next Monday = 7 days ahead, not today).

### 3.7 Sort, filter & search

| ID | Requirement |
|---|---|
| SORT-01 | **Sort menu** (in list header, "Sort" button with sort icon): Importance, Due date, My Day, Alphabetical, Creation date, Custom (manual order). Current sort is checked. Sort persists per list (`lists/{id}.sort`). Smart lists default: My Day = Custom; Important = Creation date; Planned = Due date (grouped); Assigned = Creation date; Tasks = Creation date. |
| SORT-02 | **Sort semantics:** Importance = important first, then creation date. Due date = no-date last, then date ascending, then creation. Alphabetical = A–Z, case-insensitive. Creation date = newest first? **Rule: oldest first for Creation date** (matches To Do). My Day sort = My Day tasks first? In My Day view it is Custom. Document each in code comments. |
| SORT-03 | **Hide completed:** toggle in Sort menu + list `…` menu. When on, completed section disappears entirely (not just collapsed). When off, completed section shows at the bottom: header "Completed (N)" with chevron to collapse/expand, tasks struck through, sorted by `completedAt` descending. Persist per list. |
| SORT-04 | **Planned grouping:** when sort = Due date in Planned, group headers: "Overdue" (red), "Earlier" (past, not overdue? — see note), "Today", "Tomorrow", "Later". **Exact rule:** Overdue = due < today and not completed; Today = due == today; Tomorrow = due == tomorrow; Later = due > tomorrow; Earlier = due < today but already completed? No — use: Planned groups are Overdue / Today / Tomorrow / Later only in V1; "Earlier" is omitted. Document the deviation. |
| SEARCH-01 | **Search:** top-bar input, `Ctrl+F` focuses it. Live results as you type (debounce 150 ms). Results grouped: Tasks (title match, then note/step match) → Lists (name match). Each result shows list name under the task. `↑`/`↓` to move, `Enter` to open (task → opens its list + detail pane), `Esc` clears + closes. Empty query shows recent searches (max 5, stored locally). No results: "No results for 'x'". Search is local (Firestore + in-memory index) in V1 — no Algolia. Search across all lists the user can see, including shared. |
| SEARCH-02 | Search matches are highlighted (accent background on the matched substring) in the dropdown. |

### 3.8 Settings

Settings dialog (gear in top bar, or avatar → Settings). Sections:

- **General:** Theme (Light/Dark/System), Confirm before deleting (toggle, default ON for lists, OFF for single tasks — see TASK-10), Show completed tasks by default (toggle).
- **Smart Lists:** toggles for Important / Planned / Assigned to me / Flagged email (see LIST-02). "Show 'Due Today' tasks in My Day" toggle (see MYDAY-04).
- **Notifications:** Enable reminders (toggle), Reminder sound (Default / Silent), Email me a daily summary (V2 — omit in V1).
- **Sync:** "Sync now" button + last synced time ("Last synced 09:12"). Storage used (from Storage metadata).
- **About:** version, "Built as a replacement for Microsoft To Do (retiring 30 Jun 2027)", links to Privacy / Terms (owner to supply), Export my data (JSON download of all lists/tasks — see §3.9).
- **Trash:** list of deleted items, Restore / Delete forever (see LIST-14).
- **Danger zone:** Delete my account (confirm with password re-entry, deletes Firestore + Storage + Auth; 30-day soft delete first).

### 3.9 Import / export

| ID | Requirement |
|---|---|
| IMP-01 | **Export:** Settings → Export my data → downloads `todo-export-YYYY-MM-DD.json` with `{version:1, exportedAt, lists[], tasks[], steps[], groups[]}`. Include everything except file binaries (files exported as metadata + Storage URLs, expiring — document that). |
| IMP-02 | **Import from Microsoft To Do (manual):** V1 ships an import screen: paste / upload the export JSON from IMP-01, or upload the Google Tasks manifest (`manifest.jsonl` — the owner's real file). Map: list → list, title → title, status open/done → completed, starred → important. Report: "Imported X lists, Y tasks, Z skipped (duplicates)". Duplicates are skipped by (list + title) exact match. This is how the owner's 455 tasks get in on day one. |
| IMP-03 | **Import from Google Tasks (V2):** OAuth import. Not in V1 — the JSONL path in IMP-02 covers the owner's data. |

### 3.10 Toasts, dialogs & empty states

- **Toast:** bottom-centre (desktop) / above bottom nav (mobile), dark background `#323130`, white text, 14 px, auto-dismiss 5 s, action button (Undo / View) in accent. One toast at a time; new toast replaces old. Slide-up 200 ms (see §7).
- **Confirm dialog:** centred modal, 400 px, title 20 px semibold, body 14 px, [Cancel] (secondary) [Delete / Confirm] (primary, danger for delete). `Esc` = Cancel, `Enter` = Confirm (when not in a text field). Backdrop click = Cancel. Focus trapped inside while open.
- **Empty states:** every list/smart list/search has one (see LIST-15, SEARCH-01). My Day empty: "Your day is clear — add tasks from Suggestions (💡) or type above." Planned empty: "No planned tasks." Important empty: "No important tasks — star a task to see it here."

---

## 4. Right-click (context) menus — exact specification

**Global rules (apply to every menu in this section):**

- Right-click **selects the item first, then opens the menu** at the cursor. If the item was part of a multi-selection, keep the selection and act on all of them.
- Menu: white/dark surface, 8 px radius, shadow `--shadow-menu`, min-width 220 px, max-width 280 px, item height 36 px, 14 px text, icon 16 px left, shortcut label right-aligned in `--text-3`.
- Hover: `--surface-hover`. Disabled item: `--text-3`, no hover, tooltip explains why.
- Menu closes on: click outside, `Esc`, selecting an item, scrolling the page, or opening another menu.
- **Context menus must be enabled in Settings?** In old To Do there was a setting to enable them on Windows. **In this clone: always enabled, no setting.** Document the deviation.
- **Touch / iOS:** long-press (500 ms, no movement >10 px) opens the same menu as a bottom sheet on phones, centred popover on iPad. Haptic (light) on open where supported.
- **Keyboard alternative:** every context-menu action must also exist in the `…` menu, the detail pane, or a shortcut — a keyboard-only user must never need right-click. The `Menu` key (or `Shift+F10`) opens the context menu for the focused item.

### 4.1 Right-click on a list (sidebar)

| Item | Icon | Shortcut | Behaviour / notes |
|---|---|---|---|
| Rename list | ✏️ | — | Inline edit in sidebar (see LIST-06) |
| Change theme | 🎨 | — | Opens theme picker popover |
| Duplicate list | 📋 | — | See LIST-08 |
| Share list | 👥 | — | See LIST-11. Hidden on smart lists. |
| Move to group ▸ | 📁 | — | Submenu: list of groups + "Ungroup" + "New group…" |
| Sort by ▸ | ↕️ | — | Submenu: Importance / Due date / My Day / Alphabetical / Creation date / Custom (checked = current) |
| Hide completed tasks / Show completed tasks | ✓ | — | Toggle, label flips |
| Delete list | 🗑️ | `Ctrl+Backspace` | Confirm dialog (LIST-07). **Danger, red text.** |
| — separator — | | | |
| *For smart lists only:* | | | Show only: Sort by ▸, Hide/Show completed. Rename/Duplicate/Share/Delete/Move are **absent**, not disabled. |

### 4.2 Right-click on a group (sidebar)

| Item | Behaviour |
|---|---|
| Rename group | Inline edit |
| Ungroup all lists | Moves all lists out, keeps group? **Rule:** removes the group, lists become ungrouped (same as delete group). Label it "Delete group" to match LIST-05 — do not have two labels for one action. |
| Delete group | Confirm: "Delete group 'X'? Lists inside will not be deleted." |

### 4.3 Right-click on a task (list row)

| Item | Icon | Shortcut | Behaviour |
|---|---|---|---|
| Add to My Day / Remove from My Day | ☀️ | `Ctrl+T` | Toggles; label flips |
| Mark as important / Remove importance | ⭐ | — | Toggles star |
| Mark as complete / Mark as not complete | ✓ | `Ctrl+D` | Toggles; label flips |
| Add due date ▸ | 📅 | — | Submenu: Today / Tomorrow / Next week / Pick a date… |
| Add reminder ▸ | 🔔 | — | Submenu: Later today / Tomorrow / Next week / Pick a date & time… |
| Repeat ▸ | 🔁 | — | Submenu: Daily / Weekdays / Weekly / Monthly / Yearly / Custom… |
| Move to ▸ | ➡️ | — | Submenu: all user lists (current list checked, disabled). Search box at top if >10 lists. |
| Duplicate task | 📋 | — | Creates copy below original: "<Title> (copy)", same due date/steps/notes, unchecked, not important, not in My Day |
| Delete task | 🗑️ | `Ctrl+Backspace` | Toast Undo (TASK-10). Danger red. |

**Multi-select right-click:** if >1 task selected, the menu shows only: Add to My Day, Mark as important, Mark as complete, Move to ▸, Delete tasks (N). Due date / reminder / repeat / duplicate are hidden (they are single-task actions).

### 4.4 Right-click on a step (detail pane)

| Item | Behaviour |
|---|---|
| Rename step | Inline edit |
| Delete step | No confirm, Undo toast |
| *No other items.* Steps have no dates or importance. | |

### 4.5 Right-click on empty space

- **In the task list (empty area below tasks):** menu with one item: "Add task" (focuses Add row). On mobile: no menu — tap the Add row.
- **In the sidebar (empty area):** "New list" + "New group".
- **On the list header:** same as the list `…` menu (§3.2 LIST-09).

### 4.6 Right-click in the detail pane

- On title/notes: **native browser text menu** (Cut/Copy/Paste/Select all) — do NOT override with a custom menu inside text fields. This is a deliberate exception.
- On a file chip: Download / Delete file.
- Everywhere else in the pane: no custom menu (native menu suppressed? **Rule: allow native menu** — do not suppress it where there is no custom action).

---

## 5. Mouse, touch & drag-and-drop

| ID | Requirement |
|---|---|
| PTR-01 | **Hover states:** every clickable row/button darkens to `--surface-hover` on hover (desktop, pointer:fine only). No hover styles on touch. |
| PTR-02 | **Drag task:** grip or row drag (desktop). Drag image = the row itself (opacity .6, shadow). Drop targets: between rows (2 px line), onto sidebar lists (highlight + "Move to X" tooltip), onto My Day / Important in sidebar (adds flag). `Esc` during drag cancels. |
| PTR-03 | **Drag list:** sidebar grip only. Drop line between lists/groups. Cannot drop a list into a smart list. |
| PTR-04 | **Drag step:** grip in detail pane, reorder within the same task only. |
| PTR-05 | **Touch:** swipe left on a task row (iOS/Android) reveals actions: [Complete] [Delete] — swipe 80 px, spring back on release if <50% threshold. Long-press 500 ms = context menu (see §4). Pull-to-refresh on the list triggers Sync now (with a spinner at top, 300 ms min display). |
| PTR-06 | **Scroll:** list pane scrolls independently; sidebar scrolls independently; detail pane scrolls independently. Scrollbars: thin, overlay, auto-hide on desktop; native on mobile. Scroll position per list is remembered when switching lists and restored on return (in-memory + `sessionStorage`). |

---

## 6. Keyboard — full specification

**Principles:** every action reachable by mouse is reachable by keyboard; focus is always visible (2 px accent outline, offset 2 px); `Tab` order is Top bar → Sidebar → List → Detail pane → Dialogs; `Esc` always means "close / cancel / go back one level"; never trap focus except inside a modal dialog.

### 6.1 Global shortcuts

| Shortcut (Windows / Web) | Mac | Action | Notes |
|---|---|---|---|
| `Ctrl+N` | `Cmd+N` | Add a new task | Focuses Add row in current list. **Must `preventDefault`** — browsers want a new window. |
| `Ctrl+L` | `Cmd+Shift+L` | Create a new list | Inline field in sidebar. On Windows desktop To Do it is `Ctrl+L`; on web it is `Ctrl+Shift+L` because `Ctrl+L` focuses the address bar — **use `Ctrl+Shift+L` on web, `Ctrl+L` in the installed PWA (no address bar)**. Detect PWA via `display-mode: standalone`. |
| `Ctrl+T` | `Cmd+T` | Add selected task to My Day | Toggle. **Must `preventDefault`** (new tab). |
| `Ctrl+D` | `Cmd+D` | Complete selected task | Toggle. `preventDefault` (bookmark). |
| `Ctrl+F` | `Cmd+F` | Search | Focuses top search. `preventDefault`. |
| `Ctrl+R` | `Cmd+R` | Sync now | Manual sync. `preventDefault`. |
| `Ctrl+1` | `Cmd+1` | Toggle sidebar (minified / full) | |
| `Ctrl+A` | `Cmd+A` | Select all tasks (in list) | Only when focus is in the task list; otherwise native select-all in text fields. |
| `Ctrl+Backspace` | `Cmd+Backspace` | Delete selected task / list | Task → toast Undo; list → confirm dialog. Only when focus is on a row, not in a text field (in a text field it is native delete-word). |
| `Ctrl+Z` | `Cmd+Z` | Undo (toast action only) | Triggers the visible toast's Undo if present; otherwise native in text fields. |
| `Esc` | `Esc` | Close detail pane / menu / dialog / clear selection | One level at a time: menu → selection → detail pane. |
| `Shift+F10` or `Menu` key | `Shift+F10` | Open context menu for focused item | See §4. |

### 6.2 Navigation (when focus is in the task list)

| Key | Action |
|---|---|
| `↑` / `↓` | Move selection to previous / next task (wraps? **No — stops at ends**). Skips hidden completed when hidden. |
| `Home` / `End` | First / last task. |
| `PageUp` / `PageDown` | Move by one viewport of tasks. |
| `Space` or `Enter` | Open detail pane for selected task. If already open, focus the title field. |
| `X` (when a task is focused, not typing) | Toggle complete. (V1: implement — it is a common To Do power-user key. Document it.) |
| `*` (asterisk) | Toggle important. |
| `Shift+↑` / `Shift+↓` | Extend multi-selection. |
| `Ctrl+↑` / `Ctrl+↓` | Move focus without changing selection (for multi-select building). |
| `Alt+↑` / `Alt+↓` | Move selected task up/down in Custom sort (reorders, same as drag). |
| `Tab` | Move focus into detail pane (if open) → then to Add row → then back to list. `Shift+Tab` reverses. |
| `1`–`9` with `Alt` | Jump to smart list / first lists? **V1: `Alt+1` = My Day, `Alt+2` = Important, `Alt+3` = Planned, `Alt+4` = Assigned, `Alt+5` = Tasks.** Document and show in a Shortcuts help dialog. |

### 6.3 Text-field keys

| Key | Action |
|---|---|
| `Enter` (Add task) | Create task, keep focus in new empty Add row. |
| `Enter` (Add step) | Create step, keep focus in new empty step row. |
| `Enter` (title edit) | Save, move focus to first step / Add step. |
| `Esc` (any text field) | Cancel edit, revert text, return focus to the row. |
| `Tab` (Add task, with text) | Create task, move focus to due-date icon (so a keyboard user can set a date without a mouse). |
| `Ctrl+Enter` (note field) | Save note + blur (notes auto-save anyway; this is an explicit save). |

### 6.4 Shortcuts help

- `?` (Shift+/) when not typing opens the Shortcuts dialog listing every shortcut in §6.1–6.3, grouped. Also linked from Settings → Keyboard shortcuts. This dialog is the acceptance test for this section — every row in it must work.

### 6.5 Focus management (implementation rule)

- Use **roving tabindex** in the task list (`tabindex=0` on the selected row, `-1` on the rest) — one Tab stop for the whole list.
- When the detail pane opens, focus moves to the title field; when it closes, focus returns to the task row that opened it.
- When a dialog opens, focus moves to its first button / field and is trapped; on close, focus returns to the opener.
- After deleting a task, focus moves to the next task (or previous if it was last).
- After completing a task that disappears (Hide completed), focus moves to the next task.

---

## 7. Animations & micro-interactions — exact specification

**Tokens:** `--dur-fast: 120ms; --dur-base: 200ms; --dur-slow: 300ms; --ease-out: cubic-bezier(0.1, 0.9, 0.2, 1); --ease-in-out: cubic-bezier(0.4, 0, 0.2, 1); --ease-spring: cubic-bezier(0.34, 1.56, 0.64, 1);` All animations use these tokens — no ad-hoc durations.

**Reduced motion:** `@media (prefers-reduced-motion: reduce)` — all durations become `0.01ms`, no slide/fade, state changes are instant. This is mandatory, not a nice-to-have.

### 7.1 Named animations

| # | Animation | Trigger | Duration / easing | Exact behaviour |
|---|---|---|---|---|
| A1 | Task complete | Click checkbox / `Ctrl+D` | 300 ms `--ease-in-out` | (1) Checkbox fills accent + white check draws (stroke-dashoffset, 150 ms). (2) Title gets strikethrough — animate a line growing left→right (200 ms, not an instant `line-through`). (3) Row opacity 1→0.55, then the row slides down into the Completed section (translateY + fade, 200 ms). If Hide-completed is on, the row fades + collapses (height → 0, 200 ms) instead of moving. |
| A2 | Task uncomplete | Click checked box | 200 ms `--ease-out` | Reverse of A1: row slides back to its original position, strikethrough line shrinks right→left, opacity → 1. |
| A3 | Task add | `Enter` in Add row | 200 ms `--ease-out` | New row fades in + slides down from the Add row (translateY(-8px) → 0, opacity 0 → 1). The Add row stays focused with a fresh empty input. |
| A4 | Task delete | Delete action | 200 ms `--ease-in-out` | Row fades + collapses (height → 0, opacity → 0). Toast slides up at the same time (A9). |
| A5 | Detail pane open | Select task | 250 ms `--ease-out` | Pane slides in from right (translateX(100%) → 0) + fades. List pane shrinks (flex) at the same time — no jump. |
| A6 | Detail pane close | `X` / `Esc` | 200 ms `--ease-in-out` | Reverse of A5. Focus returns per §6.5. |
| A7 | List switch | Click list in sidebar | 150 ms `--ease-out` | Old list content fades out (opacity → 0, 100 ms), new list fades in (opacity 0 → 1). Header title cross-fades. No slide — To Do does not slide lists. |
| A8 | Sidebar collapse | Hamburger / `Ctrl+1` | 200 ms `--ease-in-out` | Sidebar width 280 → 48 px, labels fade out first (100 ms), icons stay. Main pane expands to fill. |
| A9 | Toast | Any toast | 200 ms `--ease-out` in, 150 ms out | Slides up from bottom (translateY(16px) → 0) + fades in. Auto-dismiss after 5 s: fades + slides down. |
| A10 | Context menu | Right-click / long-press | 120 ms `--ease-out` | Scales from 0.96 → 1 + fades, transform-origin at the cursor point. |
| A11 | Dialog (modal) | Any confirm dialog | 200 ms `--ease-out` | Backdrop fades in (opacity 0 → .4, 150 ms); dialog scales 0.96 → 1 + fades. |
| A12 | Drag & drop | Drag start / over / drop | 120 ms `--ease-out` | Dragged row: opacity .6 + shadow + slight scale (1.02). Drop line: 2 px accent, fades in. On drop, rows animate to new positions (FLIP animation, 200 ms) — do not jump-cut. |
| A13 | Star toggle | Click star | 150 ms `--ease-spring` | Star scales 1 → 1.3 → 1 (pop). Fill fades in. |
| A14 | My Day add | Add to My Day | 200 ms `--ease-out` | Sun icon fills + row gets a brief accent background flash (background `--accent` at 8% opacity, fades out over 400 ms). In Suggestions, the row slides out (A4) and the My Day count badge increments with a 150 ms pop. |
| A15 | Suggestions panel | Lightbulb click | 250 ms `--ease-out` | Same as A5 (slides from right). |
| A16 | Checkbox hover | Hover checkbox | 120 ms `--ease-out` | Ring colour → accent, check icon fades in at 40% opacity (preview of the check). |
| A17 | Button press | Any button | 100 ms `--ease-out` | Scale 0.98. No other press effect. |
| A18 | Sync | Sync now / background sync | — | Sync icon rotates 360° over 600 ms (`linear`) while syncing; stops when done. A green dot appears on the sync icon for 2 s after a successful sync. Failed sync: icon turns red, toast "Couldn't sync — will retry". |
| A19 | Pull-to-refresh (mobile) | Pull down | — | Spinner at top, rotates; list translates down with the pull (resistance 0.5); release past 80 px triggers sync. |
| A20 | Invalid input shake | Empty list name / invalid time | 300 ms | TranslateX: 0 → -4 → 4 → -4 → 0 (keyframes `shake`). Field border turns `--danger`. |

### 7.2 Animation implementation rules

- Use CSS transitions/animations only — no JS-driven `setInterval` animation. Use `transform` + `opacity` only (GPU-composited); never animate `height` directly except for collapse (A1/A4) where `grid-template-rows` or FLIP is preferred — document the technique per animation in code.
- All list reordering uses FLIP (First-Last-Invert-Play) so rows glide, never jump.
- Do not animate on first paint. Do not animate when the list is first loaded from cache.
- Every animation must be interruptible: starting a second action mid-animation cancels the first cleanly (no stuck opacity/transform).


---

## 8. Firebase architecture & data model

### 8.1 Tech stack (recommended — an agent may substitute an equivalent only if it documents why)

| Layer | Choice | Why |
|---|---|---|
| Framework | **React 19 + TypeScript + Vite** (SPA, no SSR needed) | Fast, PWA-friendly, huge ecosystem. No Next.js — SSR adds nothing for this app and complicates the service worker. |
| Styling | **Tailwind CSS v4** + CSS custom properties for the tokens in §2.2 | Tokens stay in CSS, Tailwind for layout. |
| State | **Zustand** (UI state) + **Firestore real-time listeners** (data state) | No Redux boilerplate. Firestore is the source of truth; Zustand is a cache + UI state only. |
| Drag & drop | **@dnd-kit** (sortable + droppable) | Accessible, keyboard-draggable, touch support. |
| Dates | **date-fns** (+ `date-fns-tz` for America/Toronto handling) | Recurrence + My Day reset need correct tz math. |
| PWA | **vite-plugin-pwa** (Workbox) | Manifest + service worker generation, precaching. |
| Firebase | **Auth, Firestore, Storage, Cloud Functions (v2, Node 20), FCM, Hosting, App Check** | See below. |
| Testing | **Vitest + Testing Library** (unit), **Playwright** (E2E, incl. keyboard + PWA flows) | |

Folder structure (enforce it):

```
src/
  app/            # router, providers, PWA registration, error boundary
  features/
    auth/ lists/ tasks/ myday/ search/ settings/ sharing/ sync/
  components/     # TaskRow, DetailPane, Sidebar, ContextMenu, DatePicker, Toast, Dialog
  lib/
    firebase.ts   # init, emulators in dev
    dates.ts      # My Day reset, due-date labels, recurrence helpers
    order.ts      # fractional indexing
    sync.ts       # offline queue, conflict resolution
  styles/         # tokens.css, animations.css
  workers/        # service worker custom logic (push handling)
functions/        # Cloud Functions: recurrence, reminders, trash purge, My Day hygiene
firestore.rules
storage.rules
firebase.json
```

### 8.2 Firebase project setup (step-by-step for the agent)

1. Create Firebase project (Blaze plan — required for Cloud Functions + scheduled functions; note the cost: Functions + FCM + Hosting are within the free tier at this scale, but Blaze billing must be enabled).
2. Enable: Authentication (Google, Apple, Email/Password), Firestore (location `nam5` — closest to Toronto; **cannot be changed later**), Storage (same region), Cloud Messaging, Hosting, App Check (reCAPTCHA v3 for web — enforce in Functions + Firestore rules after launch).
3. `firebase init` — Hosting (SPA rewrite to `/index.html`), Firestore, Storage, Functions (TypeScript).
4. Add web app → copy config to `.env` (`VITE_FIREBASE_*`). Never commit real keys; use `.env.example` with placeholders. Add iOS PWA: no separate Firebase app needed — same web app.
5. Set up emulators for local dev: Auth, Firestore, Storage, Functions. `npm run dev:emulators` must work before any feature work.

### 8.3 Firestore data model

**IDs:** `crypto.randomUUID()` for every document. **Timestamps:** Firestore `Timestamp` (server) for `createdAt/updatedAt`; client `Date` only for display. **Soft delete:** `deletedAt: Timestamp | null` on lists/tasks — hard delete only via the trash purge Function.

```typescript
// users/{uid}
interface UserDoc {
  uid: string;
  email: string;
  displayName: string;
  photoURL?: string;
  timezone: string;               // e.g. "America/Toronto" — default from browser, editable in Settings
  createdAt: Timestamp;
  settings: {
    theme: 'light' | 'dark' | 'system';
    showSmartLists: { important: boolean; planned: boolean; assigned: boolean; flagged: boolean };
    showDueTodayInMyDay: boolean;
    confirmBeforeDelete: boolean;
    hideCompletedDefault: boolean;
    notificationsEnabled: boolean;
    listOrder: string[];          // ordered list IDs (ungrouped); groups store their own order
  };
  fcmTokens: string[];            // deduped, pruned on invalid-token errors
  lastSeenAt: Timestamp;
}

// groups/{groupId} — owner-scoped: groups/{groupId}.ownerId == uid
interface GroupDoc {
  id: string; ownerId: string;
  name: string;
  listIds: string[];              // ordered
  order: string;                  // fractional index for group order
  createdAt: Timestamp; updatedAt: Timestamp;
  deletedAt: Timestamp | null;
}

// lists/{listId}
interface ListDoc {
  id: string; ownerId: string;
  groupId: string | null;
  name: string;
  themeColor: string;             // hex, default #0078D4
  themeGradient: string | null;   // gradient id or null
  sort: 'importance' | 'dueDate' | 'myDay' | 'alphabetical' | 'creation' | 'custom';
  hideCompleted: boolean;
  order: string;                  // fractional index within its container (ungrouped list or group)
  isDefaultTasksList: boolean;    // exactly one per user
  createdAt: Timestamp; updatedAt: Timestamp;
  deletedAt: Timestamp | null;
  memberIds: string[];            // owner + members (for rules + queries)
}

// lists/{listId}/tasks/{taskId}  — SUBCOLLECTION (keeps list queries cheap; smart lists use a collection-group query)
interface TaskDoc {
  id: string; listId: string; ownerId: string;
  title: string;
  notes: string;                  // plain text, max 10000 chars
  isCompleted: boolean;
  completedAt: Timestamp | null;
  previousOrder: string | null;   // order before completion, for restore
  isImportant: boolean;
  myDayForDate: string | null;    // "YYYY-MM-DD" in user's tz, or null
  dueDate: string | null;         // "YYYY-MM-DD" — date only, no time
  reminderAt: Timestamp | null;   // exact date+time
  reminderSent: boolean;
  repeat: RepeatRule | null;      // see §8.5
  assignedTo: string | null;      // uid, shared lists only
  createdBy: string;
  order: string;                  // fractional index — see §8.4
  createdAt: Timestamp; updatedAt: Timestamp;
  deletedAt: Timestamp | null;
  // denormalised counters (updated by Function / transaction on step change):
  stepCount: number; completedStepCount: number;
  attachmentCount: number;
  // search: lowercase title+notes for prefix search in V1
  searchText: string;
}

interface RepeatRule {
  kind: 'daily' | 'weekdays' | 'weekly' | 'monthly' | 'yearly' | 'custom';
  interval: number;               // every N (default 1)
  unit?: 'day' | 'week' | 'month' | 'year'; // custom only
  weekdays?: number[];            // 0=Sun..6=Sat, weekly/custom
  dayOfMonth?: number;            // monthly
  end: { type: 'never' } | { type: 'onDate'; date: string } | { type: 'after'; count: number };
  occurrencesCreated: number;
}

// lists/{listId}/tasks/{taskId}/steps/{stepId}
interface StepDoc {
  id: string; taskId: string;
  title: string;
  isCompleted: boolean;
  order: string;
  createdAt: Timestamp; updatedAt: Timestamp;
}

// lists/{listId}/tasks/{taskId}/attachments/{attId}
interface AttachmentDoc {
  id: string; taskId: string;
  name: string; sizeBytes: number; contentType: string;
  storagePath: string;            // users/{uid}/tasks/{taskId}/{attId}-{name}
  uploadedBy: string; uploadedAt: Timestamp;
}

// shares/{shareId} — one per (list, member)
interface ShareDoc {
  id: string; listId: string; ownerId: string;
  memberEmail: string; memberId: string | null; // null until they accept / have an account
  role: 'member';                 // V1 only
  status: 'invited' | 'active' | 'declined';
  invitedAt: Timestamp; acceptedAt: Timestamp | null;
}

// trash/{uid}/items/{itemId} — soft-deleted lists/tasks, 30-day retention
interface TrashItem {
  id: string; kind: 'list' | 'task';
  originalPath: string;           // e.g. lists/{listId} — for restore
  snapshot: object;               // full document snapshot (JSON)
  deletedAt: Timestamp;
}
```

**Queries (must be covered by composite indexes — create them in `firestore.indexes.json`, do not rely on console clicks):**

- Tasks in a list, custom order: `lists/{id}/tasks where deletedAt==null orderBy order`
- Planned: collection-group `tasks where ownerId==uid && deletedAt==null && dueDate!=null orderBy dueDate` (+ in-memory merge with reminder-only tasks)
- Important: collection-group `where ownerId==uid && isImportant==true && isCompleted==false`
- My Day: collection-group `where ownerId==uid && myDayForDate==today`
- Assigned to me: collection-group `where assignedTo==uid && isCompleted==false`
- Search: client-side filter over cached tasks in V1 (all tasks are cached offline anyway — see §8.6). Do not run a Firestore query per keystroke.

**Firestore Security Rules (summary — write the full file, test with the emulator):**

- A user can read/write their own `users/{uid}` doc only.
- Lists: read if `request.auth.uid in resource.data.memberIds`; write if `ownerId == uid` (members can write *tasks* in the list, not the list doc — enforce via separate rules on the tasks subcollection: member can create/update/delete tasks/steps/attachments if their uid is in the parent list's `memberIds` — use a `get()` in the rule).
- No client can write `memberIds`, `ownerId`, or `isDefaultTasksList` directly — only via the share Function.
- Attachments: Storage rules mirror Firestore (path must match a task the user can access; size ≤ 25 MB; content-type not in the blocked list).
- Validate on write: title length ≤ 255, notes ≤ 10000, steps ≤ 100, attachments ≤ 10 — enforce in rules *and* in the client (rules are the backstop).

### 8.4 Ordering — fractional indexing

- `order` is a **string** (lexicographically sortable, e.g. `a0`, `a1`, …), generated by fractional indexing (implement `generateKeyBetween(a, b)` — base-62, same algorithm as Figma/Jira). Never renumber the whole list.
- New task at top (To Do adds new tasks at the *top* of the list): `order = keyBefore(firstOrder)`. New task at bottom (steps): `keyAfter(lastOrder)`.
- Drag reorder: `keyBetween(prev, next)`. If the keys run out of precision (extremely rare), run a one-off rebalance Function for that list.
- Completed tasks keep their `order` but are filtered into the Completed section; `previousOrder` is only needed if you move them to the bottom of the completed section — store it anyway.

### 8.5 Recurrence engine

- Runs in a Cloud Function (`onTaskCompleted` trigger + a scheduled `generateRecurrences` every hour).
- On completion of a task with `repeat != null`: compute `nextDue = nextOccurrence(dueDate || completedDate, repeat)`. If `end` is reached, do not create a copy. Else create a new task in the same list: same title/notes/repeat/assignedTo, steps copied unchecked, `isCompleted=false`, `dueDate=nextDue`, `reminderAt` shifted by the same delta as the due date (if set), `myDayForDate=null`, `isImportant` preserved.
- `nextOccurrence` must handle: daily (+interval days), weekdays (next Mon–Fri), weekly (same weekday, +interval weeks), monthly (same day-of-month; clamp to last day if the month is shorter — e.g. Jan 31 → Feb 28), yearly (same month/day; Feb 29 → Feb 28 on non-leap years).
- Unit-test every rule with fixed dates. This is the most bug-prone part of the app — do not hand-wave it.

### 8.6 Offline, sync & conflict resolution

- **Offline persistence:** `enableIndexedDbPersistence` (Firestore) + service-worker precache (app shell) + runtime cache for Firestore? No — Firestore's own IndexedDB cache is the offline store. The service worker caches only static assets + the app shell, never Firestore responses.
- **Offline queue:** Firestore handles queued writes natively. Additionally keep an explicit `pendingOps` log in IndexedDB (via a tiny wrapper) for: file uploads (Storage has no offline queue — queue them and retry on `online` event, showing "Waiting for connection" in the UI), FCM token registration, and share invites.
- **Optimistic updates:** write to Zustand immediately, then Firestore. If Firestore rejects (rules / offline > 7 days), roll back that field and toast "Couldn't save — try again".
- **Conflicts:** per-field last-write-wins using `updatedAt` (server timestamp). For `title`/`notes`, if two devices edit the same field concurrently, the later `updatedAt` wins and the loser sees a toast "This task was updated on another device". Never merge text.
- **Sync indicator:** top bar shows: `● Synced` (green dot + "Synced"), `↻ Syncing…` (spinner), `⚠ Offline — N changes pending` (amber). Clicking it forces a sync (`Ctrl+R`).
- **Initial load:** show cached data instantly (skeleton only if the cache is empty), then live-update from the server. First load after install must feel instant on a warm cache.

### 8.7 Reminders & notifications

- **Local scheduling (V1, primary):** when a task with `reminderAt` is loaded, schedule a `setTimeout` / service-worker `showNotification` via the Notification API at that time *if the app is open*. This covers the common case with no server cost.
- **Server backup (V1, required):** a scheduled Function runs every 5 minutes, queries `reminderAt <= now && !reminderSent && !isCompleted`, sends FCM to the user's tokens, sets `reminderSent=true`. This covers closed-app / iOS cases.
- **FCM on iOS PWA:** works only on iOS 16.4+ *and* only after the user adds the app to Home Screen *and* grants notification permission from within the installed PWA. Request permission from Settings → Notifications with an explanation screen first — never the native prompt on first launch. If permission is denied, show how to re-enable it (Settings → Notifications → [App]).
- **Notification content:** title = task title, body = list name + due info, tap → opens the app deep-linked to that task (`/?task={taskId}&list={listId}`). No notification content in the payload beyond the title (privacy — FCM payloads are not end-to-end encrypted).

### 8.8 Sharing implementation

- Invite flow (Function `inviteToList`, callable): owner enters email → Function looks up the user by email (via Auth `getUserByEmail`, server-side only) → creates `shares/{id}` with `status=invited` + sends an email (Firebase Extensions "Trigger Email" / SendGrid — owner to supply) → if the user exists, also creates an in-app invite (shows in their sidebar as "Invitations (1)" with Accept/Decline). Accept → `memberIds` += uid, `status=active`. Decline → `status=declined`.
- Real-time: shared-list members get live updates via the same Firestore listeners (their `memberIds` membership grants read). Presence ("Tanmoy is viewing this list") is V2.
- Removing a member: owner only, confirm dialog, member loses access immediately (listener stops returning data — verify this in a test).

---

## 9. PWA — web + iOS

### 9.1 Manifest (`public/manifest.webmanifest`)

```json
{
  "name": "MyDay — Tasks",
  "short_name": "MyDay",
  "description": "A fast, offline-first replacement for Microsoft To Do.",
  "start_url": "/?source=pwa",
  "scope": "/",
  "display": "standalone",
  "orientation": "portrait-primary",
  "background_color": "#ffffff",
  "theme_color": "#0078d4",
  "icons": [
    { "src": "/icons/icon-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "/icons/icon-512.png", "sizes": "512x512", "type": "image/png" },
    { "src": "/icons/maskable-512.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable" },
    { "src": "/icons/apple-touch-icon-180.png", "sizes": "180x180", "type": "image/png" }
  ]
}
```

- Icons: generate all sizes (192, 512, maskable 512 with safe padding, Apple 180). **Do not reuse Microsoft's checkmark logo.** Original icon: a rounded square, accent background, white check in a circle.
- `theme_color` must match the user's theme at runtime — update `<meta name="theme-color">` on theme change.

### 9.2 Service worker (Workbox via vite-plugin-pwa)

| Strategy | Resources |
|---|---|
| Precached (install) | App shell: `/`, `index.html`, JS/CSS bundles, icons, manifest |
| `StaleWhileRevalidate` | JS/CSS/fonts (hashed — safe) |
| `NetworkFirst` (timeout 3 s → cache) | Navigation requests (so an offline launch still opens the cached shell) |
| `NetworkOnly` | Firestore / Auth / Storage / Functions (never cache API responses in the SW) |
| Offline fallback | If navigation fails and no cache: a minimal offline page ("You're offline — your tasks are still available" + a button to reload). In practice the cached shell + Firestore cache means the app itself works offline. |

- **Update flow:** new SW → show a toast "A new version is available [Reload]" — never force-reload while the user is typing. `skipWaiting` only after user confirms.
- **iOS Safari quirks (must handle, not ignore):**
  - iOS clears *all* storage (including IndexedDB) if the PWA is unused for 7 days **and** Safari storage pressure occurs — mitigate with an "Export my data" nudge and by syncing aggressively; document this limit in Settings → About.
  - No install prompt on iOS — show a custom "Add to Home Screen" coachmark (Share → Add to Home Screen) the first time an iOS Safari user visits, dismissible, never shown again after install (detect `display-mode: standalone` / `navigator.standalone`).
  - `100vh` is wrong on iOS — use `100dvh` + `env(safe-area-inset-*)` for top/bottom padding.
  - No `beforeinstallprompt` on iOS; on Android/Chrome use it for a custom install button.
  - Push (FCM) on iOS: see §8.7 — 16.4+, installed PWA only, permission from within the PWA.

### 9.3 iOS layout & touch specifics

- Minimum tap target 44×44 px for every button/row action on touch. The 18 px checkbox gets a 44 px hit area (transparent padding).
- No hover styles; use `:active` scale 0.98 (§7 A17).
- Long-press (500 ms) = context menu (§4). Also provide a visible `…` button on each task row on touch (appears on row tap-and-hold *or* always visible on the selected row) so no feature is long-press-only.
- Keyboard on iOS: when the Add-task input focuses, the viewport must not jump — use `interactive-widget=resizes-content` in the viewport meta and test on a real device.
- Safe areas: `padding-bottom: env(safe-area-inset-bottom)` on the bottom bulk bar and the Add row; `padding-top: env(safe-area-inset-top)` on the top bar.

### 9.4 What the PWA does NOT do (so no agent tries)

- No background sync of Firestore while the app is closed on iOS (iOS does not allow it). Sync happens on launch / foreground. Document this in the UI ("Syncs when you open the app").
- No home-screen widgets in V1 (iOS widgets need a native app). Note as V2.
- No Share Sheet extension in V1 (needs native). Note as V2.

---

## 10. Visual QA — how to prove it looks like To Do

Before calling any phase done, do this side-by-side check (screenshots at 1440×900 and 390×844):

1. Open https://todo.microsoft.com/ and this app side by side. Same list open in both.
2. Compare: sidebar width/order, row height, checkbox, star position, meta line, detail pane width, font sizes, colours (use a colour picker — values must match §2.2 within 2 hex steps).
3. Run the interaction checklist in §13 on both apps. Any behaviour that differs and is not documented in this file as a deliberate deviation is a bug.
4. Test at 100% and 125% zoom, light and dark, with 0 tasks / 1 task / 500 tasks in a list.

---

## 11. V2 / explicitly out of scope for V1

- Outlook / flagged-email sync, Planner integration, Teams integration.
- Microsoft sign-in.
- Recurring *lists*, list templates (beyond Duplicate list).
- Tags / categories / hashtags view (hashtag *search* is V1, §3.3 TASK-12).
- File preview (beyond image thumbnails), file versioning.
- Subtasks with dates (steps stay date-less, per To Do).
- Collaboration: comments, presence, viewer role, activity log.
- Widgets (iOS/Android), Share Sheet, Siri/Google Assistant shortcuts.
- Email daily summary, weekly review.
- Multi-account switching, workspaces.
- Photo list backgrounds (solid colours + gradients only in V1).
- Print list.
- Import from Google Tasks via OAuth (JSONL import is V1, §3.9).

---

## 12. Build order — phases

| Phase | Goal | Deliverable / exit criteria |
|---|---|---|
| **0 — Scaffold** | Repo, Firebase project, emulators, CI, PWA shell, design tokens, routing | `npm run dev` + `npm run dev:emulators` work; empty app shell installs as PWA; tokens in §2.2 exist as CSS vars; **no feature code yet** |
| **1 — Auth + data** | Auth (Google/Apple/Email), Firestore model + rules + indexes, offline persistence | Sign in/out works; rules tests pass in emulator; a task created offline appears after reconnect |
| **2 — Lists & groups** | Sidebar, smart lists (computed), create/rename/delete/duplicate/reorder lists + groups, themes | All of §3.2 works; drag reorder with FLIP; Undo toast for deletes |
| **3 — Tasks core** | Add/complete/star/rename/delete, multi-select + bulk bar, drag reorder, move to list, sort/filter/hide-completed | All of §3.3 + §3.7 (except search) works; keyboard §6.2 works |
| **4 — Detail pane** | Steps, My Day toggle, due date, reminder, repeat, notes, files | All of §3.4 works; recurrence unit tests pass (§8.5); file upload ≤25 MB enforced |
| **5 — My Day + Planned** | My Day reset, Suggestions, Planned grouping, auto-add due-today setting | §3.5 + §3.7 SORT-04 work; reset verified by changing device date in a test |
| **6 — Search, menus, keyboard** | Search, all context menus (§4), full keyboard map (§6), Shortcuts dialog, toasts/dialogs | Every row in §4 and §6 works; Playwright keyboard-only test passes (complete a full workflow without a mouse) |
| **7 — Sharing + notifications** | Share flow, assigned-to-me, FCM reminders (Function + local), invite emails | §3.2 LIST-11 + §8.7 + §8.8 work end-to-end with two test accounts |
| **8 — PWA polish** | Manifest/icons, SW update flow, iOS coachmark, safe areas, offline page, install testing | Installs on iOS 16.4+ + Android + desktop; works offline (airplane-mode test); Lighthouse PWA score ≥ 90 |
| **9 — Import + settings + trash** | Export/import (§3.9), Settings (§3.8), Trash, account deletion | Owner's 455 tasks import cleanly (report matches §3.9 IMP-02); trash restore works |
| **10 — QA & launch** | E2E suite, visual QA (§10), performance, security review | §13 checklist 100% green; deploy to Firebase Hosting; custom domain + HTTPS; App Check enforced |

**Rules for every phase:** no phase starts until the previous phase's checklist is green; every PR includes a test; never break offline support to add a feature; update this file when a behaviour is clarified.

---

## 13. Acceptance checklist (for the building agent — all must pass)

### Functional
- [ ] All smart lists compute correctly from a seed of the owner's 12 lists / 455 tasks.
- [ ] Create/rename/delete/duplicate/reorder lists + groups; Undo restores a deleted list with its tasks.
- [ ] Add 20 tasks by rapid `Enter`; paste 5 lines → 5 tasks.
- [ ] Complete/uncomplete/star/My Day/due date/reminder/repeat/steps/notes/files all persist across reload and across a second device.
- [ ] Repeating task: complete it → next occurrence appears with the correct date (test daily, weekdays, weekly, monthly Jan 31 → Feb 28, yearly Feb 29).
- [ ] My Day resets at midnight in America/Toronto; yesterday's unfinished tasks appear in Suggestions.
- [ ] Planned groups: Overdue / Today / Tomorrow / Later are correct.
- [ ] Sort: all six modes produce the specified order (§3.7 SORT-02).
- [ ] Hide completed hides the section; show brings it back collapsed/expanded as last set.
- [ ] Move a task to another list (drag, menu, bulk bar) — it keeps everything except the My Day flag.
- [ ] Share a list with a second test account; member can edit tasks but cannot delete/rename/share the list; removing them revokes access immediately.
- [ ] Search finds tasks by title, note, and step text; hashtag click searches.

### Right-click & keyboard
- [ ] Every menu in §4 opens with the exact items, in order, with the stated enabled/disabled state.
- [ ] Every shortcut in §6.1 works on web (Chrome + Safari) and in the installed PWA (where the shortcut differs, e.g. `Ctrl+L` vs `Ctrl+Shift+L`, both work in their context).
- [ ] Full workflow keyboard-only: create list → add 3 tasks → star one → set due date → open detail → add 2 steps → complete one → delete one → undo. No mouse.
- [ ] `Shift+F10` opens the context menu; `Esc` closes one level at a time; focus returns correctly (§6.5).
- [ ] Shortcuts dialog (`?`) lists every shortcut and every listed shortcut works.

### Animation & design
- [ ] Every animation A1–A20 in §7 matches its duration/easing/behaviour; reduced-motion disables them.
- [ ] Colours/typography/layout match §2 at 1440×900 and 390×844, light + dark.
- [ ] No layout shift when the detail pane opens/closes; no jump on list switch.

### Firebase & PWA
- [ ] Works fully offline (airplane mode): create/edit/complete/delete tasks, then syncs on reconnect with no loss and no duplicates.
- [ ] Firestore rules tests pass; a member cannot write a list doc; an anonymous user cannot read anything.
- [ ] File >25 MB is rejected; `.exe` is rejected; 10 files per task enforced.
- [ ] Reminder fires (FCM) within 5 minutes of `reminderAt` with the app closed.
- [ ] Installs as PWA on iOS (Add to Home Screen), Android, and desktop Chrome; opens standalone; Lighthouse PWA ≥ 90; offline launch shows the app, not an error.
- [ ] Update toast appears on a new deploy; reload applies it without losing typed text.

### Data & safety
- [ ] Export JSON contains all lists/tasks/steps; import of that JSON (and of the owner's `manifest.jsonl`) reproduces the data with the report in §3.9 IMP-02.
- [ ] Trash: deleted list/task restorable within 30 days; purge Function deletes after 30 days.
- [ ] No Microsoft trademark, logo, or copied icon font in the app.

---

## 14. Seed data for testing (the owner's real lists)

Use these exact list names for the seed script (`scripts/seed.mjs` — read from `workspace/todo-to-google-tasks/manifest.jsonl` where possible):

```
Grocery, Travel Preparation Checklist, Countries to Travel, Costco,
Dollarama, Food basic, Murray wholesale, Shoppers, Walmart,
FKK, Cigarette jiang, Products at home
```

Seed rules: titles exactly as in the manifest; `status: open` → `isCompleted=false`, `done` → `isCompleted=true` (+ `completedAt` = import time); `starred_todo: true` → `isImportant=true`. Duplicate titles *within the same list* exist in the real data (e.g. "Ritter sport milk chocolate whole almonds" appears twice in FKK) — keep both, do not dedupe across different Google IDs. Notes from the Keep copy (6 notes appended with " — ") go into `notes` on import from Keep, not from the manifest.

---

## 15. Open questions for the owner (do not block building — defaults are in the text)

1. **App name + icon:** "MyDay" is a placeholder. Confirm the final name before Phase 8 (icons).
2. **Email provider for invites:** SendGrid / Firebase Trigger Email — owner to supply a sender address or accept the default Firebase one.
3. **Custom domain:** buy / point a domain, or use `*.web.app` for V1?
4. **Apple sign-in:** needs an Apple Developer account ($99/yr) for production — confirm before Phase 1, or ship Google + Email first and add Apple in Phase 7.

---

*End of plan. Version 1.1 — 2026-11-20. Built from live inspection of Microsoft To Do (web, v2.135.0) + Microsoft Support docs + the owner's migrated data. See Appendix A for the live-inspection corrections. Do not silently diverge from this file.*

---

## Appendix A — Live inspection corrections, v1.1 (2026-11-20, app 2.135.0)

**Method:** read-only inspection of the live web app, signed in as Nayeem Ahmed (`naiemahmed84@live.com`), dark mode on. Starting URL `https://todo.microsoft.com/` redirects to `https://to-do.office.com/tasks` and then to `https://to-do.live.com/tasks/`. Nothing was created, renamed, deleted, completed, starred, moved, or shared. The user signed in during a browser takeover, so the Microsoft sign-in screen itself was not observed. **Where this appendix conflicts with §2–§9, this appendix wins.**

### A.1 Entry, top bar, and navigation

- **Unauthenticated landing:** "Welcome to To Do" + "The world's most productive people use Microsoft To Do" + blue "Get started" button → loading screen ("Loading…" with spinner).
- **Top bar (dark, full width):** app launcher (9-dot grid, top left), "To Do" wordmark, centred search (magnifier, placeholder "Enter search"), Settings gear, Help & feedback "?", "What's new" megaphone, account avatar ("Account manager for Nayeem Ahmed"). Account panel: Microsoft logo, photo, "Nayeem Ahmed", `naiemahmed84@live.com`, "My Microsoft account", "My profile", "Add or change your picture", "Sign out of this account" / "Sign out".
- **App launcher panel:** search "Find Microsoft 365 apps"; Apps: Copilot, Outlook, OneDrive, Clipchamp, Designer, Word, Excel, PowerPoint, OneNote, Forms, Calendar, To Do, Teams, "More apps"; Create: Document, Workbook, Presentation, Survey, "Create more". **Clone note: do NOT clone the Microsoft 365 launcher or the bottom Mail/Calendar/People/Files/To Do nav — those belong to Microsoft 365, not to To Do. The clone's top bar is: hamburger, app name, search, sync, Settings, avatar only (§2.1).**
- **Sidebar bottom nav (observed, do not clone):** Mail, Calendar, People, Files, To Do (To Do active).

### A.2 Sidebar — corrected widths, smart lists, and real groups

- **Sidebar width is ~360 px, not 280 px** (§2.1 is corrected). Collapsible via "Toggle sidebar" hamburger, tooltip "Collapse/Expand menus". When collapsed, the list pane widens and only the toggle remains.
- **Smart lists actually shown (with incomplete-task counts on 2026-11-20):** My Day 0, Important 1, **All 40, Completed 0**, Flagged email 0 (shown as "Flaggedemail"), Tasks 0. **§1.1 / §3.2 are corrected: add `All` and `Completed` as smart lists.** Routes observed: My Day `/tasks/myday`, Important `/tasks/important`, Planned `/tasks/planned`, All `/tasks/all`, Completed `/tasks/completed`, Flagged email `/tasks/flagged`, Tasks `/tasks/inbox`.
- **Planned and "Assigned to me" do NOT appear in this sidebar** because Settings has "Auto-hide empty smart lists" On, so they auto-hide when empty. Planned opened directly is empty (no Sort/Group buttons, no illustration, just the "Add a task" row). `/tasks/assigned` and `/tasks/assignedtome` both return a "List not found" page with a skeleton "We are getting your tasks list ready...." — **no working Assigned-to-me route was found in this account. Clone note: implement Assigned to me as a working smart list anyway (§1.1) — this is a deliberate fix of a broken/empty state in the original, and must be listed as such in the app's About screen.**
- **List rows** show an emoji/icon, name, and a count only when >0. Emojis are part of list names (e.g. 🛒, 🎅, 🎓, 🌍) — there is no emoji/icon picker anywhere in the menus.
- **Real groups and lists in this account (2026-11-20, open-task counts):**
  - Household Chores: 🛒 Grocery 1, 🗓 Recursive Things To Do 0
  - Work: 🎅 Personal 0
  - Learn: 🎓 Computer Skills 0, 🎓 Business Skills 0
  - Travel: ⚽ General 0, 🚢 Travel Preparation Checklist 12, 🌍 Countries to Travel 13
  - Inventory for convenience: 🛒 Costco 2 Shared List, Dollarama 1, Food basic 0, Murray wholesale 4, Shoppers 0, Walmart 1, FKK 6, Cigarette jiang 0, Products at home 0 — **all shared, with a "Shared List" people icon**
  - This supersedes the flat 12-list seed in §14 for grouping: seed the same 12 lists, but under these groups, with Costco etc. marked shared. The counts above are open tasks; the migration manifest's 455 total (41 open / 414 completed) is consistent with large Completed sections (Costco alone has "Completed 132").
- **Sidebar bottom:** "New list" button + "List name" textbox ("Name this list, then select enter to create it."), "Create group" button.
- **Sidebar keyboard (verified):** arrow keys move focus between listbox options *without switching lists* (ArrowDown moved the focus ring from My Day to Important; selection stayed on My Day). Enter/click activates. This is the correct behaviour — §6.2 is corrected accordingly: `↑`/`↓` in the *sidebar* moves focus only; `Enter` switches lists.

### A.3 My Day — Suggestions auto-opens

- **Header:** sun icon + "My Day", date line "Friday, November 20" (today).
- **Suggestions panel auto-opens on the right on entry** (not only on lightbulb click — §3.5 MYDAY-02 is corrected): title "Suggestions", section "Recently added", rows with a complete-circle, task name, source list name, a star where important, and a "+ Add to My Day" button; "More" loads more (4 → 11 suggestions observed: Bread, Milk, Butter, Chocolate croissant, Travel Bag / Luggage, Passport, Water bottle, Powerbank, Shirts, Pants, Ritter sport milk chocolate). "Close suggestions" (X) hides it; the "Suggestions" button reopens it. My Day itself was empty (0 tasks).
- **My Day empty state:** no illustration, just "Add a task". Planned empty: same. Tasks (inbox) empty, sorted by due date ascending.

### A.4 List pane, Sort, Group, Grid view — corrected

- **List header:** list emoji/icon + title (h2, e.g. "🛒 Costco", blue in dark mode), "List options menu" (…) button, **Grid/List view tabs (List selected, underlined)**, "Sort" and "Group" buttons top-right.
- **"Add a task" row:** "+ Add a task" button, textbox (screen-reader hint: "List 🛒 Costco, Press shift+tab to access List options"), and below it icons for Add due date, Remind me, Repeat. **The "Add" button is disabled until text is entered.**
- **Task rows (treeitems, hint "Press the tab key for more options"):** empty circle "Mark as completed <name>", the task title as a button (opens detail pane), star checkbox "Mark task as important. <name>". A task with a note shows a small "Note" label under its title. Completed tasks are struck through with a filled blue checked circle. Bottom: "Completed" collapsible section ("Completed 132" in Costco; chevron expands/collapses — verified). In All, tasks are grouped by list with section headings (e.g. "Grocery", "Travel Preparation Checklist") and the same Completed section per list.
- **Sort — corrected menu (§3.7 SORT-01 is wrong on two items):** menu items are Importance, Due date, **Added to My Day (only in a real list, not in My Day)**, Alphabetically, Creation date. **There is NO "Custom" sort and NO "My Day" sort in the observed menu.** Due date and Alphabetically carry a right-arrow/direction indicator; hovering produced no submenu. A "Reverse sort order" button appears next to the active sort, and Important/Completed show a sort-state pill top-right (e.g. "Sorted by creation date" / "Sorted by completed" with "Reverse sort order" and "Remove sort order" buttons). Per-list sort state differs (Grocery: "Sorting turned off", Costco: sort on, All: "Sorted by position"). **Clone rule: keep the "Custom" (manual) order as the default unsorted state — To Do's "Sorted by position" is exactly that — but do not present "Custom" as a named menu item; the menu must match the observed five items. Drag-to-reorder is only meaningful in the "position" (unsorted) state.**
- **Hide completed (§3.7 SORT-03 is corrected): no hide-completed toggle was found.** Completed tasks are shown/hidden only by collapsing the "Completed" section. Clone rule: implement collapse/expand of the Completed section; do NOT add a hide-completed toggle in V1 (list it in §11 as a deliberate addition only if the owner asks).
- **Group — corrected (§3.7: only one option):** the only Group menu item everywhere is "Categories" (checked when active). No other grouping (due date, list, importance) was offered in the menu itself, although All/Completed/Important are inherently grouped by list in their layout. **Clone rule: Group menu = Categories only. Categories are the six colours in A.6.**
- **Grid view (new — was missing from §3):** tabs switch List ↔ Grid with a status message "Grid view opened" / "List view opened". Grid columns: Checkbox | Title | Due Date | Importance, with a "Completed 132" section below and the hint "Press Space or Enter to edit a cell, and escape to cancel." Grid view shows **no Add-a-task row**. Clone it in Phase 3 (same data, table layout, cell editing via Space/Enter, Esc cancels).
- **Completed smart list:** no Add-a-task row.

### A.5 Task detail pane — corrected

- **Size/position:** ~360 px right pane, **resizable by dragging its left edge** (per What's new). Opens on clicking a task title; URL becomes `/tasks/id/<id>/details`; closed by "Hide detail view" (X) at bottom or Escape. Slides in from the right (A5 confirmed).
- **Header:** "Mark as complete" circle, editable title textbox, star "Add to favorites" (filled star when important), "Complete task" button, "Add to My Day" (sun icon) and "Assign to". **Observed inconsistency: "Add to My Day" and "Assign to" were present in a shared-list task (Alani Nu, Costco) but NOT in the two tasks opened from All (Bread, Australia 🇦🇺). Clone rule: always show both in the detail pane (shared-list or not — "Assign to" opens the member picker only for shared lists, and shows "This list is not shared yet — share it to assign tasks" otherwise). Do not reproduce the inconsistency.**
- **Body (in order):** "Add step" row (+ Add step, textbox), then "Remind me", "Add due date", "Repeat", **"Pick a category"** rows, "Add file" (paperclip), note area ("Add note" / "Write a note. It will save automatically."), "Hide detail view" and "Delete task" (trash, bottom right), footer "Created Mon Nov 11 2019" (Australia; Bread: "Created Tue May 17 2022"; Travel Bag: "Created Mon June 6 2022"). A task with a note also shows "Updated Sun Sep 13 2020" (Australia: note text "Australia VFS Dhaka"). **Clone rule: footer shows "Created <date>" and, when a note exists, "Updated <date>".**
- **Steps:** no task in the account has steps, so populated step rows could not be observed; the empty "Add step" row is the only step UI seen. The spec in §3.4 DET-02 stands as written (it matches To Do's documented behaviour) but is marked **unverified against a populated example** — the building agent must test steps against the spec, not against a screenshot.
- **Right-click inside the detail pane produced no custom menu** — §4.6 is confirmed: native text menu in fields, no custom menu elsewhere in the pane.

### A.6 Pickers — exact labels and values

- **Remind me:** "Later today 11:00 AM" (**dynamic: it was 12:00 PM when opened again after 11 AM had passed** — the time is "next hour on the hour", not a fixed 18:00; §3.6 is corrected: Later today = next hour, on the hour), "Tomorrow Sat 9:00 AM", "Next week Mon 9:00 AM", "Pick a date & time". That opens a November 2026 calendar (Sun–Sat, past dates 1–19 disabled, today 20 selected/highlighted, Previous-month disabled, Next-month → December) plus a "Time Picker" (default 10:00 am) and a blue "Save" button. **Calendar week starts Sunday** (§3.6 default is confirmed: en-CA, Sunday first).
- **Due date:** "Today Fri", "Tomorrow Sat", "Next week Mon", "Pick a date"; same calendar (past dates disabled, today selected, Previous disabled, "Save" blue).
- **Repeat:** Daily, Weekdays, Weekly, Monthly, Yearly, Custom. Custom opens a dialog: "Repeat interval" spinbutton (default 1), "Recurrence type" combobox (weeks; days/weeks/months/years), weekday buttons Su Mo Tu We Th Fr Sa (none selected), **"Save" disabled until a day is chosen**. Implement exactly that validation.
- **Categories ("Pick a category" combobox): Blue, Green, Orange, Purple, Red, Yellow.** **New data-model field (add to §8.3 `TaskDoc`): `category: 'blue' | 'green' | 'orange' | 'purple' | 'red' | 'yellow' | null`.** Group-by-Categories groups tasks under these six colour headings. A task has at most one category.

### A.7 Right-click menus — exact observed items (replaces §4.1–§4.3)

**Global:** Settings has "Show right-click menus" On. Menus open on hover for submenus. All items below are in observed order.

- **Task:** Add to My Day; Mark as important; Mark as completed; **Due today; Due tomorrow; Create new list from this task;** Move task to… ▸ (submenu listing all lists: Tasks, Flagged Emails, Grocery, Recursive Things To Do, Personal, Computer Skills, Business Skills, General, Travel Preparation Checklist, Countries to Travel, Costco, Dollarama, Food basic, Murray wholesale, Shoppers, Walmart, FKK, Cigarette jiang, Products at home); **Copy task to… ▸ (same list);** Delete task (red). **Corrections to §4.3: there is NO "Add due date ▸ / Add reminder ▸ / Repeat ▸ / Duplicate task" in the observed task menu — instead there are "Due today", "Due tomorrow", "Create new list from this task", and "Copy task to…". Implement the observed menu. "Duplicate task" (§4.3) is replaced by "Copy task to…" (copy to the same list = duplicate). "Create new list from this task" creates a new list named after the task and moves the task into it.**
- **List — shared (Costco):** Sharing options; Move list to… ▸; Remove from group; **Move down;** Duplicate list; **Print list;** Delete list (red). **List — unshared (Grocery):** Share list (instead of Sharing options); Move list to… ▸; Remove from group; Move down; Duplicate list; Print list; Delete list. **Corrections to §4.1: there is NO "Rename list / Change theme / Sort by / Hide completed" in the right-click menu — those live in the … menu (A.8) or elsewhere. "Move up / Move down" are the reorder controls in the menu (in addition to drag). "Move list to…" submenu lists group names only: Work, Travel, Learn, Inventory for convenience.**
- **Group (Inventory for convenience):** Rename group; **Move up; Ungroup lists (red).** **Correction to §4.2: no separate "Delete group" item — "Ungroup lists" is the destructive group action (lists are kept, group is removed).**
- **Detail pane:** no custom right-click menu (confirmed).

### A.8 List options (…) menu — exact observed items

- **Smart list (My Day): only "Print list".**
- **Real list:** Rename list; **Change theme ▸ (5 colour circles — blue (selected, check), coral/red-orange, purple, green, light blue — no background images);** Move list to… ▸; Remove from group; Print list; Delete list (red). **Corrections to §3.2 LIST-09/10: the … menu lacks Share and Duplicate (those appear only in the right-click menu); the theme picker has exactly 5 colours, not 10 swatches + 6 gradients. Clone rule: 5 theme colours only in V1 (blue `#0078D4`, coral `#CA5010`-ish red-orange, purple `#8764B8`, green `#107C10`, light blue `#4CC2FF`-ish). No photo/gradient backgrounds in V1. Update LIST-10 accordingly.**
- **Print list (new — was omitted from §3):** implement as a print stylesheet (clean list print: list title, open tasks with checkboxes, completed struck through) in Phase 6. It is a menu item in both the … menu and the right-click menu, so it cannot be omitted.

### A.9 Share dialog — exact observed content

- **Share list dialog (Costco, already shared):** "Share list", "List members — Nayeem Ahmed (Owner), Tanmoy Nawaj Khan (Remove)", **"Invitation link" (read-only link), "Invite via email" textbox, "Copy link" button, and the note "Anyone with this link and a Microsoft account can join and edit this list.", plus "Manage access".** Clone rule (§3.2 LIST-11 / §8.8): invitation-link join IS in V1 (the draft said direct auto-join by link is V2 — corrected: link join works, anyone with the link can join and edit; the owner approves nothing). "Manage access" opens the member list with Remove. **Data-model note: add `inviteLinkToken` to `ListDoc` (unguessable token; regenerating it invalidates the old link).**

### A.10 Search — exact observed behaviour

- Clicking search opens a centred search box ("Search", "Exit search" X). Typing "Bread" navigates to `/tasks/search/Bread` and reports **"50 Tasks, 7 Notes, and 0 Steps found"** with results grouped under "Tasks" (1 shown: Bread, with its list "Grocery") and sections "Tasks", "Notes", "Lists", "Groups". **The 50/7 totals did not match the single listed result — noted as an observed quirk; the clone must show counts that match the results actually listed (do not reproduce the mismatch).** "Exit search" returns to the previous list. **Clone rule: search results page (not just a dropdown) with counts by type — Tasks / Notes / Steps / Lists / Groups — and each task result shows its list name. Keep the live dropdown in §3.7 SEARCH-01 as the quick path; the full page is the `/tasks/search/<query>` route.**

### A.11 Settings — exact observed toggles (replaces §3.8)

Settings pane sections: General / Smart lists / Connected apps / Notifications / About / Connect. Toggles (observed states in this account):

- General: **Confirm before deleting Off; Add new tasks on top Off; Move starred tasks to top On; Play completion sound On; Show right-click menus On; Turn on reminder notifications On; Turn on dark mode On.**
- Smart lists: Important On, Planned On, **All On, Completed On,** Assigned to me On, **Auto-hide empty smart lists On, Show 'Due Today' tasks in My Day On.**
- Connected apps: Planner On, Flagged email On.
- Notifications: Email On ("Get notified when a list is shared with you").
- About: Privacy and cookies, **Export your info,** Microsoft Services Agreement, Third Party Notices, **Version 2.135.0, Copy Session and User ID,** Copyright ©2026 Microsoft.
- Connect: Follow us on Twitter, Like us on Facebook, Spread the word.
- **No theme/background-image setting exists in Settings — only dark mode and the per-list 5-colour theme (§2.2 is corrected: remove the "6 preset gradients / photo backgrounds V2" theme language; themes are 5 colours only).**
- **New settings to implement (were missing from §3.8):** Add new tasks on top (Off = new tasks go to the bottom in the observed account; §8.4's "new task at top" is corrected: default is bottom unless this setting is On), Move starred tasks to top (On), Play completion sound (On — a short completion chime; implement with a tiny bundled sound file, respecting the toggle), Auto-hide empty smart lists (On), Export your info (in About — same as §3.9 IMP-01), Copy Session and User ID (diagnostics; implement as a button copying `{sessionId, userId}` to clipboard).
- **Help & feedback pane:** "Learn more", "Sync — Up to date", "What's new" cards: "Dark mode — You can now turn on dark mode from Settings. [Try it]" and "Resize the details pane — You can now resize the details pane by dragging the edge of the pane. [Got it]". Clone the Sync status line ("Sync — Up to date" / "Syncing…" / "Offline — N pending") in Help & feedback and in the top bar (§8.6).

### A.12 Keyboard — observed hints (corrects §6)

- Add-task textbox hint: "Press shift+tab to access List options". Task treeitem hint: "Press the tab key for more options." Calendar hint: "Use arrow keys to navigate the calendar." Grid hint: "Press Space or Enter to edit a cell, and escape to cancel." **Escape closes menus, pickers, dialogs, and the detail pane (verified repeatedly).**
- **Ctrl+K and "/" did nothing observable (no search opened).** The documented shortcuts in §6.1 (Ctrl+N/L/T/D/F/R, Ctrl+1) come from Microsoft Support docs, not from in-app hints — **no keyboard-shortcut help page or shortcut list was found in the UI.** Clone rule: implement the §6.1 shortcuts anyway (they are the documented contract), AND add the Shortcuts dialog (`?`, §6.4) that the original lacks — list this as a deliberate improvement in About. Do not implement Ctrl+K or "/" as search.
- **Enter in the Add-a-task box adds the task; the Add button is disabled while the box is empty.**

### A.13 Animations / empty states / quirks — observed

- View switch announces "List view opened" / "Grid view opened" (screen-reader status message — implement as an `aria-live` region). Lists load with a skeleton ("We are getting your tasks list ready...."). Task rows hover-highlight. Menus/submenus open on hover. Sort-state pill appears with Reverse/Remove controls. Detail pane slides in on the right and the URL changes to …/details.
- **No completion/creation animations or toasts were observed** because no task was completed or created (deliberately, to leave the account unchanged). §7's A1–A4 timings therefore remain **specified, not observed** — the building agent must implement them as written and verify them by hand; they are not copied from a recording.
- Empty states: My Day empty (blank pane, Add-a-task row only); Planned empty (same); Tasks (inbox) empty, sorted by due date ascending; Flagged email empty (envelope-with-blue-flag illustration + "Tasks from flagged email / Messages you flag will show up as tasks here."). "List not found" page for bad routes with a loading skeleton.
- **Untranslated strings appear in the UI** ("NOT TRANSLATED: screenreader_group_list_hint" and "NOTTRANSLATED:grouping_indicator_no_grouping" on the Group button). Do not reproduce these — every string in the clone must be translated/localised.
- Final state left clean: Costco list open, detail pane closed, Completed section collapsed, sidebar expanded, Work group re-expanded, all menus/dialogs closed. Nothing was created, changed, or deleted.

### A.14 Not verified — must be tested by the building agent, not assumed

The following were **deliberately not tested** (they would have changed the owner's data) and are **not verified** by this inspection: completing/uncompleting a task (animation, sound, strike-through transition), starring/unstarring, drag-to-reorder tasks or lists, multi-select and bulk actions (no visible multi-select affordance was found and Ctrl+click could not be tested), inline rename, duplicate/delete list confirmation dialogs, the Add-file picker, populated steps/subtasks (no task in the account has steps), creating a group/list, adding a task or a suggestion to My Day, and any toast after a create/complete/delete. **The building agent must verify each of these against §3–§7 with test data in a scratch account, and must not claim they match To Do until tested.** The Microsoft sign-in screen was not observed (user signed in during takeover).

### A.15 Corrections summary — checklist for the builder

- [ ] Sidebar 360 px, not 280 px (§2.1)
- [ ] Smart lists: add All + Completed; Planned/Assigned auto-hide when empty; Assigned route is broken in the original — implement it properly
- [ ] Groups/lists seeded as in A.2, with shared flags on the Inventory group
- [ ] Suggestions panel auto-opens on My Day entry
- [ ] Sort menu = Importance / Due date / Added to My Day / Alphabetically / Creation date (+ Reverse/Remove); no "Custom" item; no hide-completed toggle — Completed section collapses instead
- [ ] Group menu = Categories only; add `TaskDoc.category` (6 colours)
- [ ] Grid view (Checkbox | Title | Due Date | Importance) with cell editing
- [ ] Detail pane resizable; always show Add to My Day + Assign to; footer Created + Updated dates
- [ ] Remind-me "Later today" = next hour on the hour; calendar Sunday-first, past dates disabled, Time Picker default 10:00 am
- [ ] Repeat Custom dialog: Save disabled until a weekday is chosen
- [ ] Right-click menus exactly as in A.7 (task/list/group); … menu exactly as in A.8; theme = 5 colours only
- [ ] Share dialog with invitation link + "Anyone with this link … can join and edit this list."; add `ListDoc.inviteLinkToken`
- [ ] Search results page `/tasks/search/<query>` with matching counts by Tasks/Notes/Steps/Lists/Groups
- [ ] Settings exactly as in A.11, including Add new tasks on top (Off = new tasks at bottom), Move starred to top, Play completion sound, Auto-hide empty smart lists, Export your info, Copy Session and User ID
- [ ] Print list (print stylesheet) in Phase 6
- [ ] Do not clone the M365 launcher / bottom nav; do not reproduce the untranslated strings or the search-count mismatch
