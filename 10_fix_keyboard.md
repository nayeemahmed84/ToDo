# 10 — Fix keyboard shortcuts [P2 — still missing in both rounds]

> **Goal:** every shortcut from the plan works, and "?" opens a shortcuts dialog.
> **Start only after:** files 01–09 (the UI the shortcuts drive must exist first).
> **Next file:** `11_fix_animations_sort_install.md`.
> **Plan reference:** Plan `05` (§6.1–§6.4), Plan `10` (A.11).

## Current (observed 09:57 — unchanged since 09:30)

- **Only Esc works** (closes menus/detail pane).
- **Ctrl+F did not focus search** (typing "x" afterwards went nowhere, search stayed empty).
- **Ctrl+1 stayed on All** (did not go to My Day).
- **Ctrl+L had no app effect.**
- **"?" did nothing.**
- The Help (?) menu contains only "Sync — Up to date" and "What's new" — **no keyboard-shortcuts list**.

## Exact spec

### 10.1 Shortcuts (Microsoft To Do, documented — plan §6.1)

| Shortcut | Action |
|---|---|
| `Ctrl+N` | New task (focuses the Add-a-task input in the current list) |
| `Ctrl+L` | New list (focuses the "+ New list" input) |
| `Ctrl+T` | New task (same as Ctrl+N — To Do documents both) |
| `Ctrl+D` | Add due date to the focused task (opens the date picker) |
| `Ctrl+F` | Focus the search box (top bar) |
| `Ctrl+R` | Refresh (browser default — **do not intercept**; the app must survive a reload with no data loss) |
| `Ctrl+1` | Go to My Day |
| `Ctrl+2` | Go to Important |
| `Ctrl+3` | Go to Planned |
| `Ctrl+4` | Go to All |
| `Ctrl+5` | Go to Tasks |
| `Esc` | Close menu / picker / dialog / detail pane (already works — keep it) |
| `?` | Open the Keyboard shortcuts dialog (10.2) |
| `Enter` | Add task (in Add input) / open focused item / save inline edit |
| `Delete` | Delete the focused task (respect the "Confirm before deleting" setting) |
| `Space` | Toggle checkbox on the focused task (when a task row has focus) |
| `Shift+F10` / Menu key | Open the context menu for the focused item (file 07) |

### 10.2 "?" dialog — Keyboard shortcuts

- Add **"Keyboard shortcuts"** to the Help (?) menu, above "What's new".
- The dialog lists every shortcut in 10.1 in a two-column table (shortcut on the left, action on the right), grouped: **Tasks / Lists / Navigation / General**.
- The dialog opens with `?` from anywhere except while typing in a text input (in a text input, `?` types a question mark — do not intercept it there).
- `Esc` closes the dialog.

### 10.3 Rules

- **All shortcuts must call `event.preventDefault()`** where they conflict with a browser default (Ctrl+F, Ctrl+L, Ctrl+N, Ctrl+T, Ctrl+D) — the 09:57 finding is that Ctrl+F did nothing, which means it was neither intercepted nor forwarded; the browser's own Find bar may have opened instead. Verify: pressing Ctrl+F must focus the app's search box and must NOT open the browser's Find bar.
- Shortcuts are **disabled while typing in a text input, textarea, or contenteditable** — except `Esc` (closes the picker/dialog) and `Ctrl+F` (moves focus to search).
- Focus must be **visible** after every shortcut (focus ring on the target). After Ctrl+1, focus must be on the My Day list pane heading (or the first task), not lost.
- Add a `aria-live` announcement for navigation shortcuts ("My Day opened") so screen-reader users hear the result.

## Steps

1. Implement a single keyboard-shortcut handler (one place, not per-component listeners) with the table in 10.1.
2. Add the "Keyboard shortcuts" item to the Help menu and build the dialog (10.2).
3. Test every shortcut in 10.1 at least twice: once from the list pane, once with a task row focused.
4. Verify Ctrl+F does not open the browser Find bar, and that shortcuts do not fire while typing.

## Acceptance tests

- [ ] Every shortcut in 10.1 works, from the list pane and from a focused task row.
- [ ] Ctrl+F focuses the app search box and does not open the browser Find bar.
- [ ] Ctrl+1/2/3/4/5 navigate to My Day / Important / Planned / All / Tasks (and announce it).
- [ ] "?" opens the shortcuts dialog (grouped table, all shortcuts listed); "?" while typing in an input types "?" instead.
- [ ] Shortcuts do not fire while typing in a text input (except Esc and Ctrl+F).
- [ ] Focus is visible after every shortcut; `Esc` closes menus, pickers, the dialog, and the detail pane.
