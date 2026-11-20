# 05 — Fix detail pane: Add file picker, Assign to, Updated date, resize [P1]

> **Goal:** "Add file" opens a real picker, "Assign to" works on shared lists, the footer shows Updated, and the pane is 360px and resizable.
> **Start only after:** file 04.
> **Next file:** `06_fix_myday_suggestions.md`.
> **Plan reference:** Plan `04` (§3.4 DET-07/08/10), Plan `07` (§8.7–§8.8), Plan `10` (A.5).

## Current (observed 09:57)

- Detail pane ~463px (was ~470), "Drag to resize" handle (not drag-tested), header "Complete task" button, "Remind me" (Later today 10:00, Tomorrow 9:00 AM, Pick a date & time — Later today 10:00 is correct at 09:52, it is the next hour on the hour), "Assign to", "Add file", "Move to list" (new). Custom date calendar (Nov 2026, days 1–19 disabled, Previous disabled, Cancel/Save). Repeat Never/Daily/Weekly/Monthly/Weekdays/Yearly/Custom… with Custom dialog (interval, recurrence combobox, Su–Sa buttons, Cancel/Save). Categories correct.
- **"Add file" click produced no visible picker/dialog.**
- **"Assign to" only shows the note "This list is not shared yet — share it to assign tasks."**
- **Footer is still only "Created Fri, Nov 20, 2026, 09:45 a.m."** — no Updated date. Delete task moved to bottom right (correct).

## Exact spec

### 5.1 "Add file" — make the picker appear (regression (d))

- Clicking "Add file" (paperclip) **must open a file picker dialog**. If the click currently does nothing visible, find the cause first: is the `<input type="file">` missing, hidden with `display: none` and never triggered, or is the click handler unbound? Fix the cause — do not add a second Add-file button.
- Picker: max **25 MB per file**, max **10 files per task**. Allowed: images, PDF, Office, text, zip. Blocked: executables (`.exe .bat .sh .msi .app`) — show "This file type is not allowed" and do not upload.
- Upload shows a progress bar in the row; on success a file chip [icon] [name] [size] [×] [download on click]. Images show a thumbnail.
- Storage: Firebase Storage `users/{uid}/tasks/{taskId}/…`, metadata in the task's `attachments` subcollection. Deleting a file deletes the Storage object. Offline: queue the upload, show "Waiting for connection".
- Right-click on a file chip: Download / Delete file.
- Verify with scratch data: upload a small image + a PDF, download both, delete one, confirm the Storage object is gone. Try a >25 MB file and an `.exe` and confirm both are rejected with a message.

### 5.2 "Assign to" — wire it to real sharing

- The note "This list is not shared yet — share it to assign tasks." is correct **for unshared lists**. The bug is that there is no way to reach a shared list, because Share itself is still a copy-link toast (file 08).
- After file 08 lands: in a **shared** scratch list, "Assign to" must open a member picker (avatar + name; observed members in To Do's Costco: Nayeem Ahmed with "assign to me" under his own name, and Tanmoy Nawaj Khan). Assigning shows the assignee; the task appears in their "Assigned to me" smart list (file 02). Unassign via ×.
- In this file, implement the picker + assignment storage (`assignedTo` uid on the task). Do not block this file on file 08 — test it by sharing a scratch list through whatever share path exists at the time, or by seeding a shared scratch list directly in Firestore (test project only) and verifying the picker lists its members.

### 5.3 Footer: Created + Updated

- Footer must show **"Created <date + time>"** and, when a note exists (or whenever `updatedAt` is meaningfully later than `createdAt`), **"Updated <date + time>"**. Format: locale format with time, e.g. "Created Fri, Nov 20, 2026, 09:45 a.m." (the current Created format is fine — keep it, and use the same format for Updated).
- Store `createdAt` / `updatedAt` as Firestore `Timestamp` (server time). `updatedAt` advances on any edit (title, note, steps, dates, category, files).
- Regression test: create a scratch task, note its Created time; edit its note, assert Updated appears and advances; reload, assert both persist.

### 5.4 Pane size + resize handle (verify, don't assume)

- Width **360px** (currently ~463px — fix the width). The "Drag to resize" handle exists but was **not drag-tested**: drag it and confirm the pane resizes smoothly between 320px and 560px and the width persists across reload (store per user).
- Opens on clicking a task title; URL becomes `/tasks/id/<id>/details`; closes with "Hide detail view" (X) at the bottom or `Esc`. Slides in from the right (file 11 animations).
- "Add to My Day" and "Assign to" must always be present (shared or not). "Move to list" (new in this round) stays — it is a useful addition; keep it, with the current list checked/disabled in its submenu.

## Steps

1. Fix "Add file" so the picker opens; implement upload/progress/chips/limits/offline queue (5.1).
2. Implement the Assign member picker + `assignedTo` (5.2); test on a shared scratch list.
3. Add Updated to the footer with server timestamps (5.3).
4. Set the pane to 360px; drag-test the resize handle; persist the width (5.4).

## Acceptance tests

- [ ] Clicking "Add file" opens a picker; image + PDF upload, show progress then chips (thumbnail for the image); download works; delete removes the Storage object; >25 MB and `.exe` are rejected with a message.
- [ ] On a shared scratch list, "Assign to" opens the member picker; assigning shows the assignee and the task appears in their Assigned to me; unassign via × works. On an unshared list, the "not shared yet" note shows.
- [ ] Footer shows Created + Updated (same format), and Updated advances on edit and persists across reload.
- [ ] Pane is 360px; dragging the resize handle resizes 320–560px smoothly and the width persists across reload.
- [ ] "Move to list" works and shows the current list checked/disabled.
