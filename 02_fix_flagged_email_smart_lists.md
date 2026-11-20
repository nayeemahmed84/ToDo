# 02 — Fix Flagged email smart list + verify auto-hide [P2]

> **Goal:** Flagged email is a real smart list, and auto-hide is proven with data instead of assumed.
> **Start only after:** file 01.
> **Next file:** `03_fix_groups.md`.
> **Plan reference:** Plan `01` (§1.1), Plan `03` (§3.2), Plan `10` (A.2, A.11).

## Current (observed 09:57)

- "All" smart list added (count 3). Settings → Smart lists has toggles, all checked: Important, Planned, All, Completed, Assigned to me, plus "Auto-hide empty smart lists" (checked) and "Show 'Due Today' tasks in My Day".
- Sidebar shows only **My Day, All, Tasks** — Important/Planned/Completed/Assigned to me are auto-hidden because empty (0 starred, 0 due, 0 completed, 0 assigned). That is the **correct** behaviour for auto-hide On, but it has never been verified with data: no one has seen Important appear when a task is starred, or Planned appear when a due date is set.
- **"Flagged email" is only a toggle under Settings → Connected apps, not a smart list.** There is no Flagged email entry in the sidebar and no `/tasks/flagged` route.

## Exact spec

### 2.1 Add Flagged email as a smart list

- Sidebar order (after this fix): My Day, Important, Planned, All, Completed, Flagged email, Assigned to me, Tasks. Route: `/tasks/flagged`.
- Rule: tasks flagged from email. **V1: there is no Outlook sync, so the list is an empty state** — do not fake flagged emails. Empty state: envelope-with-blue-flag illustration + "Tasks from flagged email / Messages you flag will show up as tasks here."
- Settings: add a Smart Lists toggle for Flagged email (On by default), alongside the existing toggles. The existing Connected apps → Flagged email toggle stays as the connected-app switch; the Smart Lists toggle controls sidebar visibility. If Connected apps → Flagged email is Off, the smart list shows the empty state with a note "Turn on Flagged email in Connected apps to receive flagged messages." — do not hide the list for that reason alone.
- Auto-hide applies to Flagged email like any other smart list (hidden when empty and auto-hide is On).

### 2.2 Prove auto-hide with scratch data (do not skip this)

Using a **test account / scratch lists only** (never the owner's 3 live tasks):

1. Star a scratch task → **Important appears** in the sidebar with count 1. Unstar it → Important disappears again (auto-hide On).
2. Set a due date on a scratch task → **Planned appears** with count 1. Clear the due date → Planned disappears.
3. Complete a scratch task → **Completed appears** with count 1. Uncomplete it → Completed disappears.
4. Assign a scratch task to the second test account → **Assigned to me appears** for that account.
5. Turn **off** "Auto-hide empty smart lists" → all toggled-on smart lists stay visible even at 0, with no count badge.
6. Turn **off** the Important toggle in Settings → Important disappears even with a starred task; turn it back on → it reappears.
- Delete all scratch data afterwards and confirm the sidebar returns to My Day, All, Tasks.

### 2.3 Counts

- Every non-empty smart list shows its open-task count badge; empty ones show no badge (not "0"). Verify for each list in 2.2.

## Steps

1. Implement the Flagged email smart list + route + empty state + Smart Lists toggle.
2. Run the six auto-hide proofs in 2.2 with scratch data; fix any list that fails to appear/disappear.
3. Verify counts for every smart list.

## Acceptance tests

- [ ] Flagged email appears in the sidebar in the correct position, opens `/tasks/flagged`, and shows the exact empty-state text + illustration.
- [ ] All six auto-hide proofs in 2.2 pass.
- [ ] Smart-list toggles hide/show their lists immediately, with no confirm.
- [ ] My Day and Tasks can never be hidden, even with auto-hide On and 0 tasks.
- [ ] Counts are correct on every non-empty smart list; no "0" badges anywhere.
