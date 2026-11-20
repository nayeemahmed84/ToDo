# Shared To Do Replacement: Product and Engineering Roadmap

**Prepared:** 2026-11-19  
**Purpose:** A build-ready plan for a free-to-use, cross-platform shared checklist app backed by Google infrastructure. This folder was empty when the report was prepared, so the plan assumes a greenfield project.

## 1. Decision summary

Microsoft says the Microsoft To Do apps will retire on **June 30, 2027** for personal and work/school accounts. Existing tasks will not migrate to Planner; Microsoft says export instructions will be published separately. That gives this project roughly seven months to produce a usable replacement and import path. [Microsoft retirement and migration guidance](https://support.microsoft.com/en-us/planner/to-do-to-planner)

There is a no-build option to try first: a **Google Chat Space with Tasks**. Google documents group tasks in Spaces, completion/change notifications in the Space, and Chat access on iOS, Android, and the web. Chat Spaces are available to personal Google accounts. This is the closest Google-native alternative found, though its task list lives inside a chat product and notification delivery depends on each person's Chat and device settings. Pilot it with the actual accounts/devices before deciding whether the dedicated app is still needed. [Create and assign Chat tasks on iOS](https://support.google.com/chat/answer/9920628?co=GENIE.Platform%3DiOS&hl=en), [shared task notifications](https://support.google.com/tasks/answer/11549608?hl=en), [personal-account Spaces](https://support.google.com/chat/answer/7659784?hl=en), [Chat notification settings](https://support.google.com/chat/answer/7655718?co=GENIE.Platform%3DiOS&hl=en)

**Recommended build:** a PWA-first web app using React, TypeScript, Vite, Firebase Authentication, Cloud Firestore, Firebase Hosting, Firebase Cloud Messaging, and one small Cloud Function for trusted push delivery. It can provide one installable app for web, Android, and iOS, without app-store release work.

**Important cost decision:** Firebase's Spark plan can host the static app and provide free Firestore/Auth/FCM usage within published quotas. However, Cloud Functions deployment requires the Blaze billing plan. FCM itself is no-cost, and Functions has no-cost usage on Blaze, but attaching billing means usage above allowances or other billable resources can cost money. Therefore:
- For a strict, guaranteed $0 deployment, omit server-side push and accept only in-app/realtime updates while users have the app open, or use Google Chat as the notification layer.
- For push while the app is closed, use the small trusted function on Blaze, with tight quotas, monitoring, rate limits, and a spend cap where available. Do not describe this as guaranteed free. [Firebase plan comparison](https://firebase.google.com/docs/projects/billing/firebase-pricing-plans), [Cloud Functions deployment requirement and no-cost allowance](https://firebase.google.com/docs/functions/get-started), [Functions pricing FAQ](https://firebase.google.com/docs/functions/faq-and-troubleshooting), [FCM pricing](https://firebase.google.com/pricing)

## 2. User-facing requirements

### Must ship

1. Sign in with a Google account; same account works on web, Android, and iOS.
2. Create, rename, archive, and delete lists.
3. Add, edit, reorder, complete, and uncomplete items.
4. Share a list with another Google account using a revocable invite link.
5. Show list changes to all open collaborators in near real time.
6. Record who completed an item and when.
7. Notify other list members about completion when their device/app supports and permits push; never notify the actor about their own change.
8. Work well on phone and desktop; install as a PWA on Android and iOS.
9. Keep an offline-capable copy of lists already opened, queue ordinary edits offline, and reconcile when online.
10. Import/export data in an open format. Add an importer for Microsoft's official export once its format and availability are announced.

### Defer until the core works

Due dates/reminders, recurring tasks, subtasks, comments, file attachments, task assignment, labels, rich text, and integrations with Calendar/Docs. These create product surface and more permission/support work. Keep data fields extensible, but do not make these launch blockers.

### Product promise

The app is free to use within stated service quotas, with no mandatory subscription. A public deployment still has an owner who must monitor quotas and, if push functions are enabled, accept Blaze billing exposure. Publish the current quota status and a simple export/delete path.

## 3. First action: validate the no-build option

Run this short pilot with two people on the devices that matter:

1. Create a Google Chat Space named for a shared household/project.
2. Add a few representative tasks; assign one and leave one unassigned if the UI allows.
3. Mark a task complete on one person's device.
4. Confirm what appears for the other person in the Space and whether an OS notification arrives while Chat is backgrounded.
5. Repeat with iOS, Android, and web; check the Space notification setting and the phone's OS permission.
6. Decide whether a Chat-based list is acceptable for daily use.

Google's help describes task-change activity notifications and completion/incompletion events in Chat. Its help also says Chat notifications can appear on mobile devices when enabled. Test this directly because notification settings, focus modes, active browser tabs, and account type can change the observed behavior. If the pilot is good enough, use it as the immediate free replacement and do not build an app merely to reproduce those features. If the dedicated list-first experience matters, continue with the roadmap below.

Google Keep is another shared-note surface, but its sharing model is a shared note; do not assume it provides the same task completion activity notifications as Chat.

## 4. Architecture recommendation

### Client and delivery

- **React 19.3 + TypeScript 6.0 + Vite 8.3** as the version snapshot checked on this report date. Use the latest supported patch/minor at project bootstrap, commit the lockfile, and update on a regular cadence. React's release notes list 19.3 as stable; Vite's release page lists the current supported line; TypeScript 6.0 is the current release line. [React 19.3](https://react.dev/blog/2026/09/09/react-19-3), [Vite supported releases](https://vite.dev/releases), [TypeScript 6.0 notes](https://www.typescriptlang.org/docs/handbook/release-notes/typescript-6-0.html)
- **Firebase JavaScript SDK modular API** for Auth, Firestore, App Check, and Messaging. It is tree-shakeable and recommended for new integrations. [Firebase modular API](https://firebase.google.com/docs/web/learn-more)
- **Firebase Hosting** for the static single-page app, HTTPS, custom domain, and CDN. Its current Spark allowance is 10 GB stored and 360 MB/day transfer; over-quota Spark sites can be disabled until the next month. [Hosting quotas and pricing](https://firebase.google.com/docs/hosting/usage-quotas-pricing)
- **Vite PWA plugin/Workbox or a small custom service worker** for installability, shell caching, and push handling. Keep the service worker small and explicitly test updates; FCM needs a service worker at the site's root. [FCM web setup](https://firebase.google.com/docs/cloud-messaging/web/get-started)
- An accessible component system and CSS variables for design tokens. Favor keyboard navigation, large checkbox targets, clear pending/offline state, and reduced-motion support.

**Why a PWA first:** the app is primarily lists and forms, and the PWA route avoids duplicating product logic across three native apps. Apple supports web push for Home Screen web apps on iOS/iPadOS 16.4+, and Firebase documents FCM support for Safari web apps. On iOS, users must add the app to the Home Screen and grant notification permission from a direct user action; ordinary Safari tabs are not the push target. Apple says web push does not require Apple Developer Program membership. [Apple Web Push guide](https://developer.apple.com/documentation/usernotifications/sending-web-push-notifications-in-web-apps-and-browsers), [Firebase's iOS Safari FCM setup](https://firebase.blog/posts/2023/08/fcm-for-safari)

**When to consider a native wrapper:** only if PWA testing shows that the target users cannot or will not install the iOS Home Screen app, or push/background behavior is not adequate. Then evaluate Capacitor as a thin native shell around the same web product. Native iOS distribution adds App Store review and an Apple developer account; it is not the lowest-cost first release.

### Google backend

- **Firebase Authentication:** Google sign-in; do not request Google Drive or Docs scopes just to sign users in. Use redirect flow on mobile browsers, popup on desktop where it behaves well, and preserve a pending invite ID across the OAuth redirect. [Firebase Google sign-in](https://firebase.google.com/docs/auth/web/google-signin)
- **Cloud Firestore Standard edition:** canonical database for list/item state, membership, and activity. It provides live listeners and optional offline persistence. Web offline persistence is opt-in and caches documents between sessions; warn on shared/public devices and provide a clear local-data/sign-out flow. [Firestore offline persistence](https://firebase.google.com/docs/firestore/manage-data/enable-offline)
- **Firebase Cloud Messaging:** web push on supported browsers and installed iOS Home Screen PWAs. Permission must be requested only after the user taps an explicit “Enable notifications” control. FCM handles transport; it is not the trusted event processor that decides who should receive a message. [FCM web setup](https://firebase.google.com/docs/cloud-messaging/web/get-started), [FCM architecture](https://firebase.google.com/docs/cloud-messaging/fcm-architecture)
- **Cloud Functions for Firebase, 2nd gen:** one or a few Node.js functions for invite redemption and notification fanout. Deploying Functions requires Blaze. Use the current Firebase-supported Node runtime at bootstrap, not a runtime pinned by this report.
- **Firebase App Check plus Firestore Security Rules:** enable App Check in monitor mode first, then enforce after validating real clients. Rules remain the authorization boundary; App Check reduces abuse but does not replace rules. [Firestore rule document access](https://firebase.google.com/docs/firestore/security/rules-conditions), [App Check](https://firebase.google.com/docs/app-check)
- **Firebase Local Emulator Suite:** local Firestore/Auth/Functions/rules development and CI. Keep dev, staging, and production Firebase projects separate.

### Google Drive and Docs

Use Firestore, not a Google Doc, Sheet, or Drive file, as the live source of truth. A checklist requires small concurrent writes, membership authorization, queries, and realtime updates; Firestore already supplies those primitives and offline synchronization. Do not add Drive API consent screens and broad Drive scopes to MVP.

Start with user-triggered JSON/CSV download and upload. If people later ask for a Drive backup, add an explicit opt-in integration with the narrowest Drive scope, explain what it can read/write, and recheck the then-current Drive API quota and billing terms. Drive API limits and charging policy are changing in 2026. [Drive API usage limits](https://developers.google.com/drive/api/guides/limits), [Google Workspace API quota changes](https://developers.google.com/workspace/tools-safety)

## 5. Data and permission contract

Keep each list item in its own Firestore document; do not store the full task array in the list document. This keeps single-item writes small and lets collaborators subscribe only to the open list.

Suggested collections:

| Path | Core fields | Access |
|---|---|---|
| **users/{uid}** | display name, photo URL, createdAt | User reads/writes own profile fields only |
| **users/{uid}/listRefs/{listId}** | listId, role, lastOpenedAt | User-only index to populate their list home |
| **lists/{listId}** | title, ownerUid, createdAt, updatedAt, archivedAt | Members can read; owner/admin manages list settings |
| **lists/{listId}/members/{uid}** | role, joinedAt, invitedByUid | Members can read membership; only owner/admin or trusted function changes it |
| **lists/{listId}/items/{itemId}** | text, done, position, createdByUid, updatedByUid, completedByUid, completedAt, updatedAt | Active members can read/write allowed fields |
| **lists/{listId}/invites/{inviteId}** | tokenHash, role, optional email, expiresAt, createdByUid, redeemedAt | Invite creator/function only; redemption through trusted function |
| **lists/{listId}/activity/{eventId}** | actorUid, action, itemId, itemTextSnapshot, createdAt | Members read; function writes |
| **users/{uid}/devices/{deviceId}** | current FCM target identifier, platform, updatedAt | Only that user and trusted function |

Treat listRefs as a query index, not the authority. The membership document is the authority. When accepting an invite, a callable function validates expiry, optional email binding, and list state, then atomically creates membership and the user's listRef. Store a random invite token hash, expire invites after a short window, and allow the owner to revoke them. Do not expose a public, enumerable list ID as a substitute for membership.

Security rules must enforce at least:

- Signed-in user required for all list data.
- List read and item read require current membership.
- Members cannot add themselves to a list or promote their role.
- Only owner/admin can invite, remove members, archive, or delete a list.
- Item writes are limited to known fields and sensible maximum text sizes.
- On a false-to-true completion transition, rules require completedByUid to equal the signed-in UID and completedAt to equal request.time. Ordinary text/reorder edits must leave those values unchanged; unchecking clears the current completion fields while the activity record preserves history.
- A normal member can edit checklist items, but cannot change owner, member roles, invite state, or write activity records.
- Device tokens and user preferences are private to that user.
- Users can revoke their own device token/notification registration.

Test these rules in the Emulator Suite as part of the implementation ticket. Never rely on hiding UI controls as access control.

## 6. Notification and synchronization behavior

### Checklist completion flow

1. The client updates the item document with **done=true**, **completedByUid**, and a server timestamp. Firestore's local cache shows an immediate optimistic update; offline writes synchronize later.
2. A Firestore update trigger compares before/after values and continues only on a real **false -> true** completion transition. Editing text or list metadata must not notify.
3. The function confirms the list and membership state, reads active devices for members other than the actor, and sends a short notification such as “Sam checked off Buy milk in Home.”
4. The message includes a deep link to the list/item. Do not include sensitive task text in the lock-screen notification by default; offer a privacy preference.
5. Deduplicate trigger retries with the CloudEvent/event ID and an event ledger. Functions events are at-least-once and may be delivered more than once, so make the handler idempotent and tolerate rare duplicate transport delivery. [Firestore trigger delivery semantics](https://firebase.google.com/docs/functions/firestore-events)
6. Store in-app activity independently of push delivery. Push permission denied, stale token, device offline, iOS Home Screen requirement, or OS focus mode must not block collaboration.

Firestore's offline sync uses last-write-wins when two devices change the same document. Keep each checklist item in its own document so edits to different items do not collide; accept last-write-wins for the same item in MVP and make the latest updater/time visible. [Firestore offline persistence](https://firebase.google.com/docs/firestore/manage-data/enable-offline)

Do not let the web client send directly through FCM's server API. FCM requires a trusted sending environment; never put service account keys or server credentials in a browser bundle. [FCM architecture](https://firebase.google.com/docs/cloud-messaging/fcm-architecture), [FCM Admin SDK sending](https://firebase.google.com/docs/cloud-messaging/send/admin-sdk)

### Cost and quota controls

Current Firestore Standard free quota is 1 GiB stored, 50,000 document reads/day, 20,000 writes/day, 20,000 deletes/day, and 10 GiB outbound transfer/month, for one free database per project. Hosting Spark currently includes 10 GB storage and 360 MB/day transfer. FCM is no-cost. Treat these as current published quotas, not lifetime guarantees. Real-time listener updates count against Firestore read usage, so subscribe only to the signed-in user's listRefs and the currently open list/items, page history, and cap abusive loops. [Firestore quotas](https://firebase.google.com/docs/firestore/quotas), [Hosting quotas](https://firebase.google.com/docs/hosting/usage-quotas-pricing), [Firebase pricing](https://firebase.google.com/pricing)

Functions are unavailable on Spark. On Blaze, Firebase currently lists no-cost Function allowances including 2M invocations/month, but deployment/build storage and other Google Cloud resources may still create charges. Budget alerts alone do not stop charges. Set the smallest supported function instance/concurrency limits, app-level rate limits, per-user/list write limits, budget alerts, and a spend cap where available. Define graceful degradation: if push is paused by a limit, realtime updates and the in-app activity stream continue. [Firebase billing-plan details](https://firebase.google.com/docs/projects/billing/firebase-pricing-plans), [Functions quota/pricing FAQ](https://firebase.google.com/docs/functions/faq-and-troubleshooting)

## 7. PWA specifics and platform behavior

- Host on HTTPS and serve a web app manifest with **display: standalone**, app name, icons (including maskable icons), scope, and start URL.
- Cache the app shell and static assets. Let Firestore own application data caching/offline writes; do not cache authenticated Firestore responses in a generic service-worker cache.
- iOS onboarding: explain Safari Share → Add to Home Screen, then ask the user to enable notifications from a button in the installed app. Do not ask on first page load.
- Android onboarding: offer browser install prompt where supported and let users continue in the browser.
- Add a visible sync state: “Saved,” “Saving,” “Offline changes queued,” and actionable conflict/error messages.
- Avoid claiming push is guaranteed. Browser/OS permission, focus mode, connectivity, browser support, and service policy affect notification delivery. Keep the activity feed as the durable record.
- Provide an install help route with platform-specific instructions and a settings screen to disable push/clear this device's cached data.
- Validate iOS push on a real iPhone/iPad early, not only in desktop emulation. Apple requires Home Screen installation; the user must actively grant permission. [Apple web push](https://developer.apple.com/documentation/usernotifications/sending-web-push-notifications-in-web-apps-and-browsers), [Firebase Safari instructions](https://firebase.blog/posts/2023/08/fcm-for-safari)

## 8. Build sequence and agent-ready work packets

Each packet below can be assigned to an implementation agent. Keep the data and permission contract in Section 5 stable; coordinate edits to rules/schema through one owner.

| ID | Work packet | Depends on | Deliverable and acceptance |
|---|---|---|---|
| P0 | Product/cost proof | None | Try Google Chat tasks with two users and target devices. Separately prove PWA install + FCM push on Android and iOS Home Screen with a tiny demo. Record Spark vs Blaze choice before building push. |
| P1 | Repo and Firebase foundation | P0 decision | Create a TypeScript/Vite app, feature folders, Firebase configs, emulator scripts, lint/format/typecheck/CI, dev and staging config. No secrets in repo. Static app deploys to a preview URL. |
| P2 | Authentication and shell | P1 | Google sign-in/out, account state, responsive shell, protected routes, pending invite survives OAuth redirect, useful loading/error states. |
| P3 | Schema, rules, repositories | P1 | Firestore collections and typed repository functions, indexes, emulator-backed rule tests, offline persistence option and sign-out/cache handling. Unauthorized users cannot read/write shared data. |
| P4 | Personal lists and items | P2, P3 | Create/rename/archive/delete list; add/edit/reorder/check/uncheck item; live updates in two browser sessions; show actor/time and local save/sync state. |
| P5 | Share and membership | P2, P3 | Create, copy, redeem, expire, and revoke an invite; editor/member role baseline; acceptance rejects expired, revoked, wrong-email, and non-member requests. |
| P6 | PWA and offline | P4 | Manifest/icons/service worker, install onboarding, cached shell, offline open-list/read/write/sync, safe update prompt. Real Android and iOS installation flow documented in app. |
| P7 | Push notifications | P3, P5, P6 and Blaze decision | Explicit opt-in, per-device registration, private device-token storage, completion-only trigger, actor excluded, deep-link click, invalid-token cleanup, idempotent event ledger, per-user preference. If billing stays disabled, ship in-app activity only and mark background push unavailable. |
| P8 | Import/export | P4 | Versioned JSON export/import and human-readable CSV export/import. Preserve checked state, list grouping, stable ordering, and original completion metadata where present. Add a Microsoft-export adapter only after official format details exist. |
| P9 | Product QA and security review | P2-P8 | Accessibility and keyboard pass; browser/device matrix below; rules abuse cases; migration dry run; quota instrumentation; no secrets or broad Google scopes; resolve all P0/P1 defects. |
| P10 | Release and handover | P9 | Production Firebase project, rules/indexes/functions deployment runbook, data export/deletion docs, privacy notice, support/incident notes, rollback steps, and task list for post-MVP features. |

### Suggested calendar

- **Days 1-2:** P0. Try Chat Spaces and test PWA push paths. Decide whether background push and Blaze billing are acceptable.
- **Week 1:** P1 and initial UI shell.
- **Weeks 2-3:** P2-P4: Google sign-in, authorization, personal lists, and realtime checklist basics.
- **Week 4:** P5 sharing and invite redemption.
- **Week 5:** P6 offline/PWA polish; begin P7 only after iOS proof and billing decision.
- **Week 6:** P7 notifications and P8 import/export.
- **Week 7:** P9 cross-device QA and security review.
- **Week 8:** P10 controlled release and feedback. Keep the app usable in the strict-$0 mode even if push is deferred.

The calendar is an initial estimate for an experienced developer using the packets above; adjust after P0. Prioritize working shared lists before optional task features.

## 9. Acceptance checklist

### Core behavior
- Google account A creates a list; account B joins by invite; both see membership and item changes without manual refresh.
- Account B cannot open account A's unshared list by guessing its ID or changing a URL.
- Two users can add and check different items concurrently without overwriting one another.
- Completing an item records actor/time; editing its text does not send a completion push.
- The actor receives no push for their own completion. Other opted-in members receive a clear notification and can open the correct list/item.
- Removing a collaborator immediately revokes reads and writes and stops future notifications to that user.
- Export/import round trip preserves lists, items, completion state, and order.

### Platform and resilience
- Use current Chrome on Android; Safari Home Screen PWA on an iPhone; desktop Chrome, Safari, and Firefox.
- On iOS, test fresh install, permission granted/denied, notification tap/deep link, app foreground/background, token renewal, and reinstall.
- Offline: open a previously synced list, add/check an item, reconnect, verify synchronization and visible errors for rejected writes.
- Verify sign-in and invitation flow through mobile OAuth redirect and desktop sign-in.
- Test push not enabled, notification permission denied, expired invite, two devices on one account, stale device registration, and duplicate trigger invocation.
- Firestore rules deny unauthenticated access, non-member reads/writes, role escalation, spoofed actor/completion metadata, and client writes to activity/invite records.
- Dashboard alerts cover Firestore reads/writes/storage/egress and Hosting transfer. Push costs have an explicit owner and threshold.

### Migration
- Before June 30, 2027, provide a clear user flow to export Microsoft To Do data through Microsoft's official export mechanism when available, import to this app, and retain the original archive. Microsoft states export details are forthcoming; don't depend on undocumented APIs or assume automatic migration. [Microsoft migration page](https://support.microsoft.com/en-us/planner/to-do-to-planner)

## 10. Proposed project layout

- **src/app/** — routes, app shell, account guard
- **src/features/lists/** — list home, list settings, list repository
- **src/features/items/** — checklist UI, ordering, item repository
- **src/features/sharing/** — invite create/redeem/revoke UI
- **src/features/notifications/** — opt-in UX, preferences, in-app activity
- **src/features/import-export/** — versioned JSON/CSV, later Microsoft adapter
- **src/lib/firebase/** — client initialization and typed Firebase adapters
- **functions/src/** — invite and notification functions
- **public/manifest.webmanifest**, icons, root messaging service worker
- **firestore.rules**, **firestore.indexes.json**, **firebase.json**
- **docs/** — schema, privacy/security, release, quota, and incident runbooks

## 11. Risks and mitigations

| Risk | Mitigation |
|---|---|
| User expects a zero-cost app but wants push with the app closed | Make Spark-only behavior explicit; choose Blaze only after agreeing to billing exposure. Keep in-app activity functional without push. |
| iOS browser tab cannot subscribe to push | Make Home Screen installation a clear prerequisite; test the FCM path on physical devices in P0. |
| Users deny notifications | Treat push as optional; preserve realtime updates and activity feed; make permission value clear before prompting. |
| Invitation links are forwarded or leaked | High-entropy, short-lived, revocable invitations; optionally bind to an email; redeem only after Google sign-in. |
| Free quotas are exceeded | Scope listeners and queries, limit event retention, watch usage, rate-limit writes, export data, and document service-quota behavior. |
| Service or price terms change | Keep provider-specific code behind repository/notification interfaces; recheck Firebase/Drive pricing at release and every quarter. |
| Microsoft export arrives late or in a format that loses fields | Support versioned JSON/CSV now; add an official-export adapter when the format is published; preserve source archive and report unmapped fields. |
| Push duplicate or delayed delivery | Idempotent handler, event IDs, deterministic notification tags, durable in-app activity, and no claim of exactly-once/instant delivery. |

## 12. Research references

- Microsoft To Do retirement and migration: [support.microsoft.com](https://support.microsoft.com/en-us/planner/to-do-to-planner)
- Google Chat shared tasks, mobile/web, and notifications: [iOS task guide](https://support.google.com/chat/answer/9920628?co=GENIE.Platform%3DiOS&hl=en), [shared-task notification rules](https://support.google.com/tasks/answer/11549608?hl=en), [personal-account Spaces](https://support.google.com/chat/answer/7659784?hl=en), [Chat notification settings](https://support.google.com/chat/answer/7655718?co=GENIE.Platform%3DiOS&hl=en)
- Firebase free quotas and billing: [Firestore quotas](https://firebase.google.com/docs/firestore/quotas), [Hosting quotas](https://firebase.google.com/docs/hosting/usage-quotas-pricing), [pricing plans](https://firebase.google.com/docs/projects/billing/firebase-pricing-plans), [Functions FAQ](https://firebase.google.com/docs/functions/faq-and-troubleshooting), [FCM pricing](https://firebase.google.com/pricing)
- Firebase architecture and implementation: [Google sign-in](https://firebase.google.com/docs/auth/web/google-signin), [Firestore offline persistence](https://firebase.google.com/docs/firestore/manage-data/enable-offline), [Firestore rules](https://firebase.google.com/docs/firestore/security/rules-conditions), [App Check](https://firebase.google.com/docs/app-check), [FCM web](https://firebase.google.com/docs/cloud-messaging/web/get-started), [Firestore triggers](https://firebase.google.com/docs/functions/firestore-events)
- iOS PWA push: [Apple Web Push guide](https://developer.apple.com/documentation/usernotifications/sending-web-push-notifications-in-web-apps-and-browsers), [Firebase FCM Safari guide](https://firebase.blog/posts/2023/08/fcm-for-safari)
- Current frontend version references: [React 19.3](https://react.dev/blog/2026/09/09/react-19-3), [Vite releases](https://vite.dev/releases), [TypeScript 6.0](https://www.typescriptlang.org/docs/handbook/release-notes/typescript-6-0.html), [Firebase modular API](https://firebase.google.com/docs/web/learn-more)
- Drive API caveat for any later backup integration: [Drive API limits](https://developers.google.com/drive/api/guides/limits), [Workspace API quota changes](https://developers.google.com/workspace/tools-safety)

