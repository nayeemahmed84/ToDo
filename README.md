# ToDo PWA — Easy Setup & Hosting Guide

A free, personal **To-Do app** (similar to Microsoft To Do) that works on **Windows, Mac, iPhone, and Android**, syncs in real time, works offline, and sends push reminders.

You do **not** need to be a programmer to set this up for yourself. Just follow the steps below in order — it takes about **10–15 minutes** and uses free accounts on **Firebase** (Google) and **Cloudflare**.

---

## What You Need Before Starting (Free Accounts)

1. **A Google account** (for [Firebase](https://console.firebase.google.com/))
2. **A Cloudflare account** (sign up free at [dash.cloudflare.com](https://dash.cloudflare.com/) — only needed if you want background push reminders)
3. **Node.js** installed on your computer:
   - Download the **LTS** version from [nodejs.org](https://nodejs.org/) and run the installer (keep clicking **Next**).
4. **Git** (optional, or you can just click **Code → Download ZIP** on GitHub and unzip the folder).

---

## How to Open a Terminal (Command Prompt)

Throughout this guide, you will paste a few short commands into a terminal:
- **Windows:** Open the downloaded `ToDo` folder, click the address bar at the top of File Explorer, type `cmd`, and press **Enter**.
- **Mac:** Open the **Terminal** app, type `cd ` (with a space), drag the `ToDo` folder into the Terminal window, and press **Enter**.

---

## Part 1: Download & Prepare the App

1. Download or clone this project, then open your terminal inside the `ToDo` folder.
2. Install the app's required packages by running:
   ```bash
   npm install
   ```
3. Make a copy of the example settings file and name it `.env.local`:
   - **Windows (Command Prompt):**
     ```cmd
     copy .env.example .env.local
     ```
   - **Mac / Linux:**
     ```bash
     cp .env.example .env.local
     ```
   *(Don't worry: `.env.local` is hidden from GitHub automatically so your private keys stay safe.)*

---

## Part 2: Set Up Firebase (Free Spark Tier — Database & Login)

Firebase stores your tasks, handles Google Sign-In, and hosts your website on the **free Spark tier** (no Blaze/billing upgrade required).

### 2.1 Create a Firebase Project
1. Go to [console.firebase.google.com](https://console.firebase.google.com/) and sign in with Google.
2. Click **Create a project** (or **Add project**), give it a name (for example `my-todo-app`), and click **Continue** until it finishes creating.

### 2.2 Get Your App Keys
1. On your new project's home page, click the **Web icon `</>`** (under *"Get started by adding Firebase to your app"*).
2. Type a nickname (e.g. `ToDo Web`), leave **"Also set up Firebase Hosting"** unchecked for now, and click **Register app**.
3. You will see a block of code with `firebaseConfig = { ... }`.
4. Open `.env.local` in Notepad / TextEdit and paste those 6 values in place of the placeholders:
   ```env
   VITE_FIREBASE_API_KEY=your_apiKey_here
   VITE_FIREBASE_AUTH_DOMAIN=your_authDomain_here
   VITE_FIREBASE_PROJECT_ID=your_projectId_here
   VITE_FIREBASE_STORAGE_BUCKET=your_storageBucket_here
   VITE_FIREBASE_MESSAGING_SENDER_ID=your_messagingSenderId_here
   VITE_FIREBASE_APP_ID=your_appId_here
   ```
5. Click **Continue to console**.

### 2.3 Turn On Google Sign-In
1. In the left sidebar of Firebase Console, click **Build → Authentication**, then click **Get started**.
2. Click **Google**, flip the **Enable** switch **ON**, choose your email as the support email, and click **Save**.

### 2.4 Turn On the Database (Firestore)
1. In the left sidebar, click **Build → Firestore Database**, then click **Create database**.
2. Choose **Start in production mode** → **Next** → pick a location close to you → **Enable**.

### 2.5 Enable Google Drive & Photos Picker APIs (Optional — Free Cloud Attachments, Backups & Backgrounds)
Want task attachments and full `.zip` backups stored privately in your own free 15 GB Google Drive (without upgrading Firebase to a paid plan), or want to pick list background wallpapers directly from **Google Photos**?
1. Open [Google Cloud Console](https://console.cloud.google.com/) and select your Firebase project from the top project picker.
2. Go to **APIs & Services → Library**, search for **Google Drive API**, and click **Enable**.
3. *(Optional, for Google Photos backgrounds)* In the same Library, search for **Google Photos Picker API** and click **Enable**.
4. In the ToDo app, open **Settings → Google Drive** (or click **Connect Drive** in any task's attachment section) to authorize access to the app's own `ToDo PWA/` folder (`drive.file` scope only).

### 2.6 Turn On Push Notification Key (Optional — for reminders)
1. Click the **Gear icon ⚙** next to *Project Overview* (top left) → **Project settings**.
2. Click the **Cloud Messaging** tab at the top.
3. Scroll down to **Web configuration → Web Push certificates** and click **Generate key pair**.
4. Copy the long **Key pair** string and paste it into `.env.local`:
   ```env
   VITE_FIREBASE_VAPID_KEY=paste_your_key_pair_here
   ```

### 2.7 Connect Your Computer to Firebase & Upload Security Rules
Run these 3 commands in your terminal inside the `ToDo` folder:

1. Install Firebase tools (one-time setup):
   ```bash
   npm install -g firebase-tools
   ```
2. Log in to your Google account (a browser window will open):
   ```bash
   firebase login
   ```
3. Select your Firebase project (use arrow keys to pick your project, press **Enter**, and type `default` when asked for an alias):
   ```bash
   firebase use --add
   ```
4. Upload the database security rules and indexes:
   ```bash
   firebase deploy --only firestore
   ```

   > **Tip:** If your computer says `firebase: command not found` or gives a permission/execution policy error, you don't need the global install — just put `npx firebase-tools` in place of `firebase` for every command:
   > ```bash
   > npx firebase-tools login
   > npx firebase-tools use --add
   > npx firebase-tools deploy --only firestore
   > ```

---

## Part 3: Set Up Cloudflare Worker (Optional — Background Reminders)

If you skip Part 3, the app still works completely — you just won't get background push reminders when the tab is closed.

### 3.1 Download Your Private Firebase Key
1. In Firebase Console, click the **Gear icon ⚙ → Project settings → Service accounts**.
2. Click **Generate new private key** → **Generate key**.
3. A `.json` file will download to your computer. **Keep this file private and never upload it to GitHub.**
4. Open that `.json` file in Notepad / TextEdit so you can copy 3 values from it in a moment:
   - `"project_id"`
   - `"client_email"`
   - `"private_key"` (starts with `-----BEGIN PRIVATE KEY-----` and ends with `-----END PRIVATE KEY-----\n`)

### 3.2 Deploy the Reminder Worker to Cloudflare
In your terminal, move into the worker folder:
```bash
cd workers/reminder-cron
```

1. Log in to Cloudflare (opens your browser):
   ```bash
   npx wrangler login
   ```
2. Save your 3 private values into Cloudflare (each command will ask you to paste the value and press **Enter**):
   ```bash
   npx wrangler secret put FIREBASE_PROJECT_ID
   npx wrangler secret put FIREBASE_CLIENT_EMAIL
   npx wrangler secret put FIREBASE_PRIVATE_KEY
   ```
   > **Tip for `FIREBASE_PRIVATE_KEY`:** Copy everything between the quotes `"..."` (including `-----BEGIN PRIVATE KEY-----` and `-----END PRIVATE KEY-----\n`).
   >
   > **Optional manual trigger secret:** Scheduled reminders run automatically via Cloudflare Cron. If you also want to manually trigger `POST /run` as an operator, set a random secret with `npx wrangler secret put REMINDER_RUN_SECRET` and pass it in the `Authorization: Bearer <secret>` header (never in URLs or client code). Without `REMINDER_RUN_SECRET`, `/run` rejects all requests.

3. Deploy the Worker:
   ```bash
   npx wrangler deploy
   ```
4. Wrangler will print a web address like:
   `https://todo-reminder-cron.your-name.workers.dev`
5. Paste that address into `.env.local` (in the main `ToDo` folder):
   ```env
   VITE_NOTIFY_WORKER_URL=https://todo-reminder-cron.your-name.workers.dev
   ```
6. Go back to the main `ToDo` folder in your terminal:
   ```bash
   cd ../..
   ```

---

## Part 4: Test It on Your Computer

Run:
```bash
npm run dev
```
Hold `Ctrl` (or `Cmd` on Mac) and click the link shown in the terminal (usually `http://localhost:5173`). Sign in with Google and your ToDo app is live locally!

---

## Part 5: Put Your App Online (Deploy)

Choose **either** Firebase Hosting (easiest) or Cloudflare Pages:

### Option A: Deploy to Firebase Hosting (Recommended & Easiest)
Run this single command in the main `ToDo` folder:
```bash
npm run deploy
```
*(Or `npx firebase-tools deploy` — `firebase.json` automatically runs `scripts/enable-apis.mjs` to activate required free-tier Firebase & Google Cloud APIs via `gcloud` if installed, builds the production bundle, and deploys Firestore rules + Hosting.)*
When it finishes, it will print your live website URL (like `https://your-project-id.web.app`). Open it on your phone or computer, sign in, and even install it as an app (**Add to Home Screen** on mobile, or the **Install** icon in Chrome/Edge address bar)!

### Option B: Deploy to Cloudflare Pages
1. Upload your code to a GitHub repository (your `.env.local` and `.json` key files are automatically ignored by `.gitignore`).
2. Go to [dash.cloudflare.com](https://dash.cloudflare.com/) → **Workers & Pages → Create → Pages → Connect to Git**.
3. Pick your repository and enter:
   - **Build command:** `npm run build`
   - **Build output directory:** `dist`
4. Under **Environment variables**, add every `VITE_...` line from your `.env.local` file.
5. Click **Save and Deploy**.
6. **Important final step for Cloudflare Pages:** Copy your new `*.pages.dev` website link, go to **Firebase Console → Authentication → Settings → Authorized domains → Add domain**, and paste it there so Google Sign-In works on your live site.

---

## Troubleshooting

- **"firebase is not recognized" / PowerShell script error** → Use `npx firebase-tools` instead of `firebase` (for example, `npx firebase-tools login` and `npx firebase-tools deploy --only hosting`).
- **"Add your Firebase keys in `.env.local`"** → Make sure your file is named `.env.local` (not `.env.local.txt`) and is in the main `ToDo` folder, then restart `npm run dev`.
- **Google Sign-In popup closes or says unauthorized domain** → Go to **Firebase Console → Authentication → Settings → Authorized domains** and make sure your website domain (or `localhost`) is listed.
- **Permission denied in database** → Make sure you ran `firebase deploy --only firestore`.
- **Keeping secrets safe on GitHub** → `.gitignore` automatically blocks `.env`, `.env.local`, `.dev.vars`, `.firebase/`, `.wrangler/`, and `*firebase-adminsdk*.json` / `service-account*.json`. Never remove those lines from `.gitignore`.
- **Push notifications not arriving / `AbortError: Registration failed - push service error`**:
  - Make sure `VITE_FIREBASE_VAPID_KEY` is set in `.env.local` and in your production hosting environment variables.
  - **Brave Browser (Desktop)**:
    1. Open `brave://settings/privacy` and enable **"Use Google services for push messaging"**, then restart/reload Brave.
    2. Click the tune/lock icon in the address bar → **Site settings** → set **Notifications** to **Allow**.
  - **Brave Browser (Mobile / Android)**:
    1. Open Brave **Settings → Brave Shields & privacy** (or **Privacy and security**) and enable **"Use Google services for push messaging"** if available.
    2. In Android **Settings → Apps → Brave → Notifications**, make sure notifications are **Allowed** (and site notifications are allowed in Brave's Site settings).
    3. If Brave Android still fails to register FCM push (`AbortError`), install the PWA from **Chrome** or **Samsung Internet** on Android, which support Web Push/FCM out of the box.
  - Disable any VPN or ad-blocker that blocks `fcm.googleapis.com` / `firebaseinstallations.googleapis.com`, and test in a normal (non-Incognito) window.
  - Confirm **Reminder notifications** is **ON** in app **Settings** and `Notification.permission` is **Allowed**.

---

## Productivity Suite & Power Features

- **Command Palette (`Ctrl+K` / `Cmd+K`)**: Jump to any list, smart view, or task, quick-add tasks, switch themes, open Insights or Templates, and export `.ics`.
- **Natural-Language Quick Add**: Type inline metadata right in the task input — dates (`tomorrow`, `next friday`), tags (`#work`), priorities (`!p1`–`!p4`), and effort estimates (`~30m`, `~1.5h`) — or use **Voice Capture** dictation.
- **Views (List, Grid, Board, & Planned Calendar)**: Switch between List, Grid, and **Kanban Board** (grouped by Priority, Due Date, or Status with drag-and-drop), plus a week/month **Planned Calendar** view with drag-and-drop rescheduling.
- **Saved Smart Filters**: Create custom filtered views in the sidebar combining `#tags`, `P1`–`P4` priorities, effort caps (`≤15m`, `≤30m`), due windows, blocked tasks, and keywords — synced across devices.
- **Focus / Pomodoro Timer & Daily Insights**: Launch a customizable Focus timer per task with session tracking, and review streaks, 7-day completion charts, and My Day rollover in **Daily Review & Insights**.
- **WYSIWYG Rich Notes, Dependencies & Collaboration**: Format task notes with bold, italic, code, checklists, and links (Markdown-compatible), set "Waiting On" task blockers, add comments/activity logs, and attach files cached in IndexedDB and optionally synced to your own **Google Drive** (`ToDo PWA/Attachments/`, 100% free tier).
- **Live Calendar Subscription (`webcal`) & `.ics` Export**: Download one-time `.ics` snapshots or generate a private token-authenticated live calendar feed URL from **Settings → Calendar Export & Live Feed** (powered by the Cloudflare Worker).
- **Cross-Device Sync & Google Drive Backups**: Settings, list templates, and saved smart filters sync automatically in Firestore (`users/{uid}/private/settings`), and full ZIP backups can be downloaded locally or saved/restored directly from **Google Drive** (`ToDo PWA/Backups/`).

---

## Mobile Features & Gestures

- **Predictive Back Gesture & Step-by-Step Back**: Swipe right from the left edge (or use the system Back button / top-left back arrow) to step back one level at a time (calendar picker → context menu → selection → task details → list → home).
- **Pull to Refresh**: Swipe down from the top of a list to reload while staying on your current screen.
- **Swipe Left to Delete**: Swipe left on any task row to reveal the delete action and release to remove it.
- **Long-Press Multi-Select & Context Menu**: Long-press a task to enter selection mode, tap additional tasks to select them, and long-press again to open the context menu (**Cut**, **Copy**, **Move**, **Due date / Remove due date**, **Delete**).
- **List & Group Context Menus**: Long-press any list or group in the sidebar to rename, move, share, or delete it.

---

## Testing & Verification

Run the automated test suite and type checks locally (no Firebase production credentials required):

```bash
# Lint TypeScript, React, worker, and tests
npm run lint

# Unit tests (recurrence, natural-language parsing, search, backup/restore, filters, reminder worker & iCal feed)
npm test

# Type-check the Cloudflare reminder worker
npm run typecheck:worker

# Production type-check and build
npm run build

# Playwright E2E smoke tests (requires Chromium: npx playwright install chromium)
npm run test:e2e

# Firestore security rules tests (requires Java 21+ for Firebase Emulator)
npm run test:rules
```
