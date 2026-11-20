# 08 — Fix Share: real Share dialog [P0 — untouched in both rounds]

> **Goal:** sharing a list opens a real dialog with members, email invites, and an invitation link — not a copy-link toast.
> **Start only after:** files 01–03 (lists and groups exist to share).
> **Next file:** `09_fix_search.md`.
> **Plan reference:** Plan `03` (§3.9), Plan `07` (§8.5), Plan `10` (A.8).

## Current (observed 09:57 — unchanged since 09:30)

- **Share still just copies a link and shows the toast "Share link copied to clipboard!"** — no members, no invite-via-email, no access note.
- The Share **button** exists in the header (though it was not visibly rendered in the 09:57 screenshots — see file 01, regression (b)); the right-click menu has "Share list" / "Sharing options" (file 07).
- **This is the owner's reason for building this app:** the 9 shared store lists (Costco, Dollarama, Food basic, Murray wholesale, Shoppers, Walmart, FKK, Cigarette jiang, Products at home) are shared with Tanmoy Nawaj Khan and Ghazi Shahariar Fahim, and Google Tasks could not share them. Sharing must work.

## Exact spec

### 8.1 Share dialog (the target — Microsoft To Do v2.135.0, observed)

- Title: **"Share list"**.
- **Members section:** avatar + name + role, e.g. "Nayeem Ahmed (Owner)", "Tanmoy Nawaj Khan — Remove".
- **Invitation link:** read-only link field + **"Copy link"** button (this is the only place copying a link happens).
- **"Invite via email"** field: email input + **"Invite"** button. On send: the person is added as a pending member; an invite email is sent with the join link.
- Note under the dialog: **"Anyone with this link and a Microsoft account can join and edit this list."** (In the clone: "…and an account on this app can join and edit this list.")
- **"Manage access"** section.
- The dialog must be reachable from three places: the header Share button, right-click → Share list / Sharing options, and the "…" menu (Round 1 file 06 said Share/Duplicate are right-click-only — **this overrides that**: after Round 2, Share is available from the header button AND the right-click menu; the "…" menu does not need it).

### 8.2 Data model

- `ListDoc.inviteLinkToken`: random 16-char token, generated once when the list is created (not on first share — regenerating it invalidates old links).
- `ListDoc.members`: `{ uid, role: "owner" | "member", joinedAt }`. The owner is always a member and cannot be removed.
- `ListDoc.pendingInvites`: `{ email, invitedAt, invitedBy }`.
- Link-join is **V1** (required): opening `https://todo-232b3.web.app/join/<token>` while signed in adds the user as a member and opens the list; opening it signed out shows a sign-in screen first, then joins.

### 8.3 Real-time collaboration (the point of sharing)

- A shared list's tasks sync live for all members (Firestore listener — already in the plan, §8.2). A member's edit appears on the owner's screen without refresh.
- **Presence:** show member avatars in the list header; an "Editing" badge on a task row a member is editing; "Viewing" tooltip for a member with the detail pane open.
- **Permissions:** members can add/edit/complete/delete tasks and steps in a shared list. **Only the owner can rename, change theme, share, or delete the list.** A member who tries to delete the list gets "Only the owner can delete this list."
- **Leaving:** a member can leave via the Share dialog ("Leave list"); the list disappears from their sidebar; their completed tasks stay in the list.

### 8.4 Email invites

- **Owner question (unresolved, plan §15):** which email provider sends the invite emails (Firebase Auth email, SendGrid, or another). If the owner has not decided, use **Firebase Auth email action links as the V1 transport** and note the decision as pending — do not block the dialog on it.
- Invite email subject: `"[App name] — Nayeem Ahmed invited you to the list 'Costco'"` (use the owner's name and the list's real name).
- Rate limit: max 10 invites per list per day. Invalid email → inline error, no toast.

### 8.5 What not to do

- **Do not keep the copy-link toast as the Share behaviour.** The toast "Share link copied to clipboard!" must disappear entirely — the only feedback after copying a link inside the dialog is the button changing to "Copied ✓" for 2 seconds.
- Do not show a "Share" button that does nothing when the list is not shared yet; the button opens the dialog in both states (members section is empty apart from the owner when unshared).

## Steps

1. Implement `inviteLinkToken` + `members` + `pendingInvites` in the list model.
2. Build the Share dialog (8.1) with Copy link, Invite via email, members + Remove, Manage access, and the access note.
3. Implement link-join (`/join/<token>`, signed-in and signed-out flows).
4. Implement real-time sync + presence + owner-only list actions (8.3).
5. Wire the email invite (8.4) with the V1 transport; record the provider decision as pending if undecided.

## Acceptance tests (all with scratch lists and a second test account — never the owner's live lists)

- [ ] Share opens the dialog (not a toast) from the header button and from right-click.
- [ ] The dialog shows the owner, the invitation link + Copy link (button changes to "Copied ✓"), Invite via email, Manage access, and the exact access note.
- [ ] Inviting a test email adds a pending member and sends the invite; the second test account joins via the link and the list appears in its sidebar.
- [ ] A member's task edit appears on the owner's screen without refresh; member avatars show in the header.
- [ ] A member cannot rename, change theme, or delete the list (correct error shown); the owner can.
- [ ] The member leaves via the dialog; the list disappears from their sidebar; the owner's list keeps its tasks.
- [ ] The old "Share link copied to clipboard!" toast no longer appears anywhere.
