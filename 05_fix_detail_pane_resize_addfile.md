# 05 — Fix detail pane: resize handle + Add file [P1]

> **Goal:** the resize handle actually resizes, and "Add file" opens the system file chooser.
> **Start only after:** file 04.
> **Next file:** `06_fix_myday_suggestions_more.md`.
> **Plan reference:** Plan `04` (§3.4 DET-07/08/10), Plan `07` (§8.7–§8.8), Plan `10` (A.5).

## Current (observed 10:47)

- Detail pane **~510px wide** (was ~463px). **Correction C1: ~510px is the correct default width** (live To Do default ~510px) — **do NOT shrink it to 360px**. Round 1/2's 360px target was wrong.
- **"Drag to resize" handle exists in the DOM but two drag attempts did not change the width.**
- **"Add file": clicking it produced no visible in-page change and no visible file picker** (inconclusive; Escape then closed the pane).
- "Assign to" button is present in the pane (also on the unshared list); assigning could not be tested — there is no shared list with members.
- Footer shows only "Created Fri, Nov 20, 2026, 09:40 a.m." — **correct per C7 (To Do has no Updated line)**.
- Live To Do (10:45): pane slides in from the right; default ~510px; **resizable by dragging its left edge (verified — widened to ~1015px; width persists after reload)**. Rows in order: checkbox + title + star; Add step; Add to My Day; Remind me; Add due date; Repeat; Assign to (on shared lists); Pick a category; **Add file ("No file chosen" — click targets the system file chooser, no in-page menu, nothing uploaded)**; Note. Footer: Hide detail view icon left; "Created by Nayeem Ahmed on Fri, April 17" (current year, no year shown) / "Created by Nayeem Ahmed on Fri, September 12, 2025" (year shown for older tasks); Delete task trash icon right. **No "Move to list" row** (C8 — the built app's Move to list is an enhancement, keep it).

## Exact spec

### 5.1 Resize handle — make the drag work

- The handle exists in the DOM but dragging does nothing. Likely causes: (1) the drag handler is bound to the wrong element; (2) the pane width is set by a CSS rule that the drag code does not update; (3) pointer events are captured by the pane content. Diagnose first, then fix — do not add a second handle.
- After the fix: dragging the left edge resizes smoothly between **320px and 800px** (To Do was dragged to ~1015px and persisted, so allow up to at least 800px; the exact max is not critical, but the drag must visibly change the width while dragging).
- The width **persists across reload** (store per user). Default on first open: **~510px**.
- Verify by dragging in both directions and reloading: the width after reload equals the width after the drag.

### 5.2 "Add file" — verify the system chooser (do not build a custom picker)

- In To Do, "Add file" targets the **system file chooser** — there is no in-page menu. The 10:47 "no visible change" may mean the chooser opened and the agent could not see it (system dialogs are not in the page), or it may mean nothing happened. **Determine which one it is:** instrument the click (log whether the hidden `<input type="file">` was triggered) and test in a real browser session where the chooser is visible.
- If the chooser opens: keep it. If it does not: fix the trigger (the `<input type="file">` must be clicked programmatically from the button's handler; a `display: none` input cannot be triggered in some browsers — use `opacity: 0` + `position: absolute` instead).
- After choosing a file: max **25 MB per file**, max **10 files per task**; blocked types `.exe .bat .sh .msi .app` ("This file type is not allowed"). Upload shows a progress bar; on success a file chip [icon] [name] [size] [×] [download on click]; images show a thumbnail.
- Storage: Firebase Storage `users/{uid}/tasks/{taskId}/…`, metadata in the task's `attachments` subcollection. Deleting a file deletes the Storage object. Offline: queue, show "Waiting for connection".
- Verify with scratch data: upload a small image + a PDF, download both, delete one, confirm the Storage object is gone. Try a >25 MB file and an `.exe` and confirm both are rejected with a message.

### 5.3 "Assign to" (depends on Share — file 08)

- The note "This list is not shared yet — share it to assign tasks." is correct **for unshared lists**. After file 08 lands: in a **shared** scratch list, "Assign to" must open a member picker (avatar + name; live To Do shows Nayeem Ahmed with "assign to me" under his own name, and Tanmoy Nawaj Khan). Assigning shows the assignee; the task appears in their "Assigned to me" smart list (file 02). Unassign via ×.
- In this file, implement the picker + assignment storage (`assignedTo` uid on the task). Test it by sharing a scratch list through whatever share path exists at the time, or by seeding a shared scratch list directly in Firestore (test project only).

### 5.4 Footer — Created only (CORRECTED, C7)

- **Remove the Updated requirement from Round 2.** To Do has no Updated line. Footer must show **"Created by <name> on <date>"**: current-year dates show no year ("Created by Nayeem Ahmed on Fri, Nov 20"); older dates show the year ("Created by Nayeem Ahmed on Fri, September 12, 2025").
- Store `createdAt` / `updatedAt` as Firestore `Timestamp` (server time) anyway — `updatedAt` is needed for sync, it is just not displayed.
- "Move to list" (built-app addition) stays — it is an enhancement (C8), keep it, with the current list checked/disabled in its submenu.

## Steps

1. Diagnose and fix the resize drag (5.1); verify persistence across reload.
2. Determine whether "Add file" opens the system chooser; fix the trigger if not; implement upload/progress/chips/limits (5.2).
3. Implement the Assign member picker + `assignedTo` (5.3).
4. Fix the footer to the Created-only format (5.4).

## Acceptance tests

- [ ] Dragging the pane's left edge resizes it smoothly (320–800px) and the width persists across reload; default is ~510px.
- [ ] Clicking "Add file" opens the system file chooser (verified in a real browser session, not just by DOM inspection); image + PDF upload, show progress then chips (thumbnail for the image); download works; delete removes the Storage object; >25 MB and `.exe` are rejected with a message.
- [ ] On a shared scratch list, "Assign to" opens the member picker; assigning shows the assignee and the task appears in their Assigned to me; unassign via × works. On an unshared list, the "not shared yet" note shows.
- [ ] Footer shows "Created by <name> on <date>" with the exact year rule (no year for current year, year for older); no Updated line.
- [ ] "Move to list" still works and shows the current list checked/disabled.
