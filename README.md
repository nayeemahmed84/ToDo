# ToDo PWA

A cross-platform Progressive Web App (PWA) task manager inspired by Microsoft To Do, built with **React**, **TypeScript**, **Vite**, **Firebase** (Auth, Firestore with offline persistence, Storage, Cloud Messaging, Hosting), and **Cloudflare Workers** (cron-based push reminders & collaborator notifications).

---

## Features

- **Smart Lists:** My Day, Important, Planned, Assigned to me, Tasks, All, Completed, and Trash.
- **Custom Lists & Groups:** Organize lists into collapsible groups, customize icons/emojis, colors, and backgrounds (built-in themes or custom uploaded images via Firebase Storage).
- **Rich Task Details:** Sub-steps, due dates, reminders, repeat rules, categories, notes, and file attachments.
- **Shared Lists & Real-Time Sync:** Share lists with collaborators with Firestore security rules enforcing owner/member access.
- **Full Keyboard Productivity:** Multi-select (`Ctrl+Click` / `Shift+Click` / `Shift+↑↓`), `Ctrl+C`/`Ctrl+X`/`Ctrl+V` copy/cut/paste between lists, multi-step `Ctrl+Z` undo, `Delete`, `Ctrl+M`/`Ctrl+U`, `M`/`C` list pickers, and `?` shortcuts cheat sheet.
- **Silent Duplicate Detection:** Warns while typing if a matching active or completed item already exists in the list, letting you unmark or open it instead of duplicating.
- **Paper-First Print Mode:** Clean black-and-white print sheet with pen-friendly checkboxes, subtasks, notes, and optional handwritten note lines (`Print` button or `Ctrl+P`).
- **Offline-First PWA & Push Reminders:** Persistent multi-tab Firestore cache, auto-updating service worker (`vite-plugin-pwa`), and background push notifications via Cloudflare Workers.

---

## Prerequisites

- [Node.js](https://nodejs.org/) (v18+ recommended) and `npm`
- A [Firebase](https://console.firebase.google.com/) account & project
- [Firebase CLI](https://firebase.google.com/docs/cli): `npm install -g firebase-tools`
- A [Cloudflare](https://dash.cloudflare.com/) account (free tier works) for the reminder/notification Worker (and optionally Cloudflare Pages)

---

## Step 1: Clone & Install

```bash
git clone <your-repo-url>
cd ToDo
npm install
cp .env.example .env.local
```

> **Note:** `.env.local` is listed in `.gitignore` so your keys will **never** be committed to GitHub.

---

## Step 2: Firebase Setup

1. **Create a Firebase Project & Web App**
   - Go to [Firebase Console](https://console.firebase.google.com/) → **Add project**.
   - In **Project Settings → Your apps**, click **Add app → Web (`</>`)**.
   - Copy the config values into `.env.local`:
     ```env
     VITE_FIREBASE_API_KEY=...
     VITE_FIREBASE_AUTH_DOMAIN=your-project-id.firebaseapp.com
     VITE_FIREBASE_PROJECT_ID=your-project-id
     VITE_FIREBASE_STORAGE_BUCKET=your-project-id.firebasestorage.app
     VITE_FIREBASE_MESSAGING_SENDER_ID=...
     VITE_FIREBASE_APP_ID=...
     ```

2. **Enable Authentication (Google Sign-In)**
   - Go to **Authentication → Sign-in method** and enable **Google**.
   - Under **Authentication → Settings → Authorized domains**, ensure `localhost` (for local dev) and your production domain(s) (e.g., `your-project.web.app` or `your-app.pages.dev`) are listed.

3. **Create Firestore Database & Deploy Rules/Indexes**
   - Go to **Firestore Database → Create database** (start in production mode).
   - Log in with Firebase CLI and link your project:
     ```bash
     firebase login
     firebase use --add
     ```
   - Deploy the included security rules (`firestore.rules`) and indexes (`firestore.indexes.json`):
     ```bash
     firebase deploy --only firestore
     ```

4. **Enable Firebase Storage (for custom list backgrounds & attachments)**
   - Go to **Storage → Get started** in the Firebase Console.

5. **Enable Web Push Notifications (VAPID Key)**
   - Go to **Project Settings → Cloud Messaging → Web configuration → Web Push certificates**.
   - Click **Generate key pair** and paste the public key into `.env.local`:
     ```env
     VITE_FIREBASE_VAPID_KEY=your_public_vapid_key
     ```

---

## Step 3: Cloudflare Worker Setup (Push Reminders & Notifications)

The `workers/reminder-cron` Worker runs on a 1-minute cron (`* * * * *`) to send scheduled task reminders and collaborator notifications via Firebase Cloud Messaging.

1. **Generate a Firebase Service Account Key**
   - In Firebase Console → **Project Settings → Service accounts** → **Generate new private key**.
   - Download the JSON file. **Never commit this file to GitHub** (`.gitignore` already ignores `*firebase-adminsdk*.json` and `service-account*.json`).

2. **Authenticate with Cloudflare Wrangler**
   ```bash
   cd workers/reminder-cron
   npx wrangler login
   ```

3. **Upload Secrets to Cloudflare**
   Set the three secrets using values from your downloaded service account JSON (`project_id`, `client_email`, and `private_key`):
   ```bash
   npx wrangler secret put FIREBASE_PROJECT_ID
   npx wrangler secret put FIREBASE_CLIENT_EMAIL
   npx wrangler secret put FIREBASE_PRIVATE_KEY
   ```

4. **Deploy the Worker**
   ```bash
   npx wrangler deploy
   ```
   Wrangler will print your Worker URL (e.g. `https://todo-reminder-cron.<your-subdomain>.workers.dev`).

5. **Connect the Worker URL to the Frontend**
   Paste that URL into `.env.local` in the project root:
   ```env
   VITE_NOTIFY_WORKER_URL=https://todo-reminder-cron.<your-subdomain>.workers.dev
   ```

---

## Step 4: Run Locally

From the project root:

```bash
npm run dev
```

Open the local URL shown in your terminal (usually `http://localhost:5173`).

---

## Step 5: Deploy the Frontend

### Option A: Firebase Hosting

```bash
npm run build
firebase deploy --only hosting
```

### Option B: Cloudflare Pages

1. Push your repository to GitHub.
2. In the [Cloudflare Dashboard](https://dash.cloudflare.com/) → **Workers & Pages → Create → Pages → Connect to Git**.
3. Configure the build:
   - **Build command:** `npm run build`
   - **Build output directory:** `dist`
4. Add all `VITE_FIREBASE_*` and `VITE_NOTIFY_WORKER_URL` variables from `.env.example` under **Settings → Environment variables**.
5. Deploy, and add your `*.pages.dev` domain to **Firebase Console → Authentication → Settings → Authorized domains**.

---

## Security Checklist Before Pushing to GitHub

- `.gitignore` excludes `.env`, `.env.local`, `.env.*` (except `.env.example`), `.dev.vars`, `.firebase/`, `.wrangler/`, and `*firebase-adminsdk*.json` / `service-account*.json`.
- Run `git status` before committing to confirm no `.env.local` or service account JSON files are staged.
- Never paste `FIREBASE_PRIVATE_KEY` into frontend code or `.env.local` — keep it strictly in Cloudflare Worker secrets (`npx wrangler secret put`).
