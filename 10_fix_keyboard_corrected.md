# 10 — Fix keyboard shortcuts (corrected) [P2]

> **Goal:** the shortcuts that actually work in To Do work perfectly in the clone; the ones that don't are documented, not faked.
> **Start only after:** files 01–09 (the UI the shortcuts drive must exist first).
> **Next file:** `11_fix_whats_new_freeze.md`.
> **Plan reference:** Plan `05` (§6.1–§6.4), Plan `10` (A.11).

## Current (observed 10:47)

- In the built app, **Ctrl+F, Ctrl+1, Ctrl+L, Ctrl+N, Ctrl+D and "?" each had no observable effect**. Help ("?" button, top right) contains only "Sync — Up to date" and "What's new" — no "Keyboard shortcuts" list.
- Live To Do (10:45) — **correction C5:** **Ctrl+F opens/focuses the app's search box** (not the browser's find). **Ctrl+1: no observable effect. Ctrl+L: no in-app effect (browser address-bar focus). Ctrl+N: no observable effect (no new window/tab). Ctrl+D: no observable effect (no bookmark dialog). "?": no help shortcut — it typed "?" into the focused Add-a-task box** (deleted immediately). Help menu: the top-bar "?" button opens a "Help" pane containing only a "Learn more" link and a "Sync" button showing "Up to date", plus Close pane.
- The Microsoft Support page lists Ctrl+N/L/T/D/F/R and Ctrl+1 as To Do shortcuts, but **they do not work in the live app (v2.135.0)**. Do not build the clone to a support page that the app itself does not follow.

## Exact spec (CORRECTED, C5)

### 10.1 Shortcuts that must work (observed in live To Do)

| Shortcut | Action |
|---|---|
| `Ctrl+F` | Focus the search box (top bar). Must call `event.preventDefault()` — it must NOT open the browser's Find bar. |
| `Esc` | Close menu / picker / dialog / detail pane (already works — keep it, and make it work from everywhere, including the Repeat menu — file 04, §4.3). |
| `Enter` | Add task (in Add input) / open focused item / save inline edit. |
| `Delete` | Delete the focused task (respect the "Confirm before deleting" setting). |
| `Space` | Toggle checkbox on the focused task (when a task row has focus). |
| `Shift+F10` / Menu key | Open the context menu for the focused item (file 07). |

### 10.2 Shortcuts that do NOT work in live To Do — do not fake them

| Shortcut | Live To Do behaviour | Clone decision |
|---|---|---|
| `Ctrl+1` (My Day) | No observable effect | **Do not implement as a fidelity feature.** If implemented, label it an enhancement in the shortcuts dialog and in the code comment — never claim To Do does it. |
| `Ctrl+L` (new list) | Browser address-bar focus (no in-app effect) | Same as Ctrl+1. |
| `Ctrl+N` / `Ctrl+T` (new task) | No observable effect | Same as Ctrl+1. |
| `Ctrl+D` (due date) | No observable effect | Same as Ctrl+1. |
| `?` (shortcuts dialog) | Types "?" into the focused Add box | **"?" must type "?"** when an input is focused (do not intercept it there). When no input is focused, "?" MAY open the shortcuts dialog as an enhancement — if you implement it, say so in the dialog ("Enhancement — not in Microsoft To Do"). |
| `Ctrl+R` | Browser reload | **Do not intercept.** The app must survive a reload with no data loss. |

**Decision for this file:** implement 10.1 perfectly. For 10.2, implement **none** of them as silent features — if the team wants them, they are a separate enhancement with the labelling above. The clone must not claim parity with shortcuts To Do does not have.

### 10.3 Help menu (match live To Do)

- The top-bar "?" button opens a "Help" pane containing **"Learn more"** (link) and a **"Sync" button showing "Up to date"**, plus Close pane. Implement exactly that.
- **Do not add a "Keyboard shortcuts" list to the Help menu** (Round 2 file 10 did — that was wrong; To Do has none). If a shortcuts dialog is built as an enhancement (10.2, "?"), it is reached only by pressing "?" with no input focused — never from the Help menu.

### 10.4 Rules

- Shortcuts are **disabled while typing in a text input, textarea, or contenteditable** — except `Esc` (closes the picker/dialog) and `Ctrl+F` (moves focus to search).
- Focus must be **visible** after every shortcut (focus ring on the target). After Ctrl+F, focus must be in the search box with the cursor ready to type.
- Add an `aria-live` announcement for navigation ("My Day opened") so screen-reader users hear the result.

## Steps

1. Implement a single keyboard-shortcut handler (one place, not per-component listeners) with the table in 10.1.
2. Verify Ctrl+F focuses the app search box and does **not** open the browser Find bar; verify "?" types "?" in the Add box.
3. Build the Help pane exactly as in 10.3 (Learn more + Sync Up to date + Close).
4. Test every shortcut in 10.1 twice: once from the list pane, once with a task row focused.

## Acceptance tests

- [ ] Ctrl+F focuses the app search box and does not open the browser Find bar.
- [ ] Esc closes menus, pickers, the dialog, and the detail pane — including the Repeat menu (file 04).
- [ ] Enter / Delete / Space / Shift+F10 work as in 10.1, from the list pane and from a focused task row.
- [ ] "?" types "?" when the Add box is focused; it does not open a dialog from inside an input.
- [ ] The Help pane contains exactly "Learn more" + "Sync — Up to date" + Close (no shortcuts list).
- [ ] Shortcuts do not fire while typing in a text input (except Esc and Ctrl+F).
- [ ] Focus is visible after every shortcut; a reload loses no data.
