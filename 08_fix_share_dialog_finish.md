# 08 — Finish the Share dialog [P0]

> **Goal:** the Share dialog works end to end — invites send, members can be removed, access can be managed, and the dialog is centred.
> **Start only after:** files 01–03 (lists and groups exist to share).
> **Next file:** `09_fix_search_counts.md`.
> **Plan reference:** Plan `03` (§3.9), Plan `07` (§8.5), Plan `10` (A.8).

## Current (observed 10:47)

- **The Share dialog exists now** (Round 2's biggest win): title "Share list"; List members "Nayeem Ahmed (Owner)"; Invitation link https://todo-232b3.web.app/?share=4RjKEJf2sBs86lc8HG5m with a "Copy link" button; "Invite via email" textbox; note "Anyone with this link and an account can join and edit this list."
- **"Invite" button is disabled** — nobody can actually be invited by email.
- **No "Manage access" section.**
- **Dialog opens bottom-left, not centred** (regression (e)).
- Live To Do (10:45) Share dialog: title "Share list"; List members: Nayeem Ahmed — Owner; Tanmoy Nawaj Khan — with "Remove Tanmoy Nawaj Khan" button; Invitation link (readonly textbox) https://to-do.microsoft.com/tasks/sharing?InvitationToken=…; **"Invite via email" link**; "Copy link" button; note "Anyone with this link and a Microsoft account can join and edit this list."; **"Manage access" button**. Quirk: To Do's own header "Share" button appeared on the first Costco load but was absent after navigation and reload; the dialog stayed reachable via right-click. (So the built app's flaky Share button visibility mirrors To Do — keep Share reachable via right-click as the reliable path.)
- **This is the owner's reason for building this app:** the 9 shared store lists (Costco, Dollarama, Food basic, Murray wholesale, Shoppers, Walmart, FKK, Cigarette jiang, Products at home) are shared with Tanmoy Nawaj Khan and Ghazi Shahariar Fahim, and Google Tasks could not share them. Sharing must work.

## Exact spec

### 8.1 Enable the Invite button

- The "Invite via email" textbox + **"Invite" button must be enabled whenever the textbox contains a valid email address** (validate on input; invalid email → inline error "Enter a valid email address", button stays disabled; valid email → button enables).
- On send: the person is added as a **pending member** (shown in the dialog with "Pending" status); an invite email is sent with the join link.
- **Email provider (owner question, plan §15, still unresolved):** use **Firebase Auth email action links as the V1 transport** and note the decision as pending — do not block the dialog on it.
- Invite email subject: `"[App name] — Nayeem Ahmed invited you to the list 'Costco'"` (owner's name + the list's real name).
- Rate limit: max 10 invites per list per day.

### 8.2 Add "Manage access" + member removal

- **"Manage access" button** opens a section (or a second dialog) listing every member with their role and a **Remove** button per member (except the owner — the owner cannot be removed).
- Removing a member: confirm "Remove <name> from '<list>'? They will no longer see this list." → the member loses access immediately; their completed tasks stay in the list.
- A member can also **leave** via the dialog ("Leave list"); the list disappears from their sidebar.

### 8.3 Centre the dialog (regression (e))

- The dialog must open **centred on screen** (horizontally and vertically), with a dimmed backdrop, in both light and dark themes.
- Root cause first: a bottom-left position means the dialog is anchored to the Share button or rendered without a centring rule. Fix the positioning (modal container with `position: fixed; inset: 0; display: grid; place-items: center`), do not nudge it with margins.
- `Esc` closes the dialog; clicking the backdrop closes it (only if no invite is in flight).

### 8.4 Link-join + real-time collaboration (verify — built in Round 2, untested)

- `ListDoc.inviteLinkToken`: random 16-char token, generated once when the list is created (not on first share).
- Link-join is **V1** (required): opening `https://todo-232b3.web.app/join/<token>` while signed in adds the user as a member and opens the list; opening it signed out shows a sign-in screen first, then joins. (The current link format is `/?share=<token>` — keep that format if link-join already works with it; do not change the format just to match the plan's `/join/<token>`.)
- A shared list's tasks sync live for all members. **Presence:** member avatars in the list header; an "Editing" badge on a task row a member is editing.
- **Permissions:** members can add/edit/complete/delete tasks and steps in a shared list. **Only the owner can rename, change theme, share, or delete the list.** A member who tries to delete the list gets "Only the owner can delete this list."
- After copying a link inside the dialog, the button changes to "Copied ✓" for 2 seconds. The old copy-link toast must not appear.

## Steps

1. Enable Invite with email validation + pending members + V1 email transport (8.1).
2. Add Manage access + member removal + Leave list (8.2).
3. Centre the dialog (8.3).
4. Verify link-join, live sync, presence, and owner-only actions (8.4).

## Acceptance tests (all with scratch lists and a second test account — never the owner's live lists)

- [ ] Typing a valid email enables "Invite"; typing an invalid one shows the inline error and keeps it disabled.
- [ ] Inviting a test email adds a pending member and sends the invite; the second test account joins via the link and the list appears in its sidebar.
- [ ] "Manage access" lists members with Remove buttons; removing a member revokes access immediately; the member can also Leave via the dialog.
- [ ] The dialog opens centred on screen in light and dark themes; Esc and backdrop click close it.
- [ ] A member's task edit appears on the owner's screen without refresh; member avatars show in the header.
- [ ] A member cannot rename, change theme, or delete the list (correct error shown); the owner can.
- [ ] Copy link shows "Copied ✓" for 2 seconds; the old copy-link toast never appears.
