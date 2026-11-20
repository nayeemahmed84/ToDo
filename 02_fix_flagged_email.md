# 02 — Fix Flagged email smart list [P1]

> **Goal:** Flagged email is a real smart list with its own route and empty state.
> **Start only after:** file 01.
> **Next file:** `03_fix_groups_creation.md`.
> **Plan reference:** Plan `01` (§1.1), Plan `03` (§3.2), Plan `10` (A.2).

## Current (observed 10:47)

- **No Flagged email smart list:** no sidebar entry, and `/tasks/flagged` **falls back to the My Day view** (no empty state, no error).
- The "Flagged email" toggle exists and is **ON** in Settings → Smart lists and in Settings → Connected apps.
- Auto-hide is consistent with its setting: Important, Planned, Completed and Flagged email are all toggled ON but hidden because all are empty (0 starred, 0 due, 0 completed, 0 flagged). Whether Important appears when a task is starred could not be observed without starring a task.
- Live To Do (10:45): Flagged email **is** shown in the sidebar with count 0, and Planned/Assigned to me are hidden (On in Settings, empty, auto-hide On). So Flagged email is visible even at 0 in To Do — it is **not** auto-hidden the same way.

## Exact spec

### 2.1 Add the smart list + route

- Sidebar order: My Day, Important, Planned, All, Completed, Flagged email, Assigned to me, Tasks. Route: `/tasks/flagged`.
- **`/tasks/flagged` must never fall back to My Day.** An unknown smart-list route may fall back; a known one must render its own view. If the route is hit with no flagged tasks, render the empty state (2.2).
- Rule: tasks flagged from email. **V1: there is no Outlook sync, so the list is an empty state** — do not fake flagged emails.
- Empty state: envelope-with-blue-flag illustration + "Tasks from flagged email / Messages you flag will show up as tasks here."
- Settings: the Smart Lists toggle for Flagged email already exists and is On — keep it. The Connected apps → Flagged email toggle stays as the connected-app switch. If Connected apps → Flagged email is Off, the smart list shows the empty state with a note "Turn on Flagged email in Connected apps to receive flagged messages." — do not hide the list for that reason alone.

### 2.2 Auto-hide — match live To Do

- Live To Do shows Flagged email in the sidebar **even at 0**, while Planned and Assigned to me are hidden when empty. Reproduce that: **Flagged email is exempt from auto-hide** (it is a connected-app list, not a computed list).
- Important, Planned, All, Completed, Assigned to me follow auto-hide (hidden when empty and auto-hide is On). Verify with scratch data (Round 2 file 02, §2.2 — the six proofs still apply, and were never actually run because starring would have changed data):
  1. Star a scratch task → Important appears with count 1; unstar → disappears.
  2. Set a due date → Planned appears; clear it → disappears.
  3. Complete a scratch task → Completed appears; uncomplete → disappears.
  4. Turn off "Auto-hide empty smart lists" → all toggled-on smart lists stay visible at 0, no count badge.
  5. Turn off the Important toggle → Important disappears even with a starred task; back on → reappears.
- Delete all scratch data afterwards; sidebar returns to My Day, All, Tasks + Flagged email.

### 2.3 Counts

- Every non-empty smart list shows its open-task count badge; empty ones show no badge (not "0"). Flagged email at 0 shows no badge but stays visible (2.2).

## Steps

1. Implement the Flagged email smart list + `/tasks/flagged` route + empty state (2.1).
2. Exempt Flagged email from auto-hide; run the five auto-hide proofs with scratch data (2.2).
3. Verify counts for every smart list (2.3).

## Acceptance tests

- [ ] Flagged email appears in the sidebar in the correct position, opens `/tasks/flagged`, and shows the exact empty-state text + illustration.
- [ ] `/tasks/flagged` never falls back to My Day.
- [ ] Flagged email stays visible at 0 tasks; Planned/Assigned to me hide when empty (auto-hide On) and show when they gain a task.
- [ ] All five auto-hide proofs in 2.2 pass.
- [ ] Counts are correct on every non-empty smart list; no "0" badges anywhere.
