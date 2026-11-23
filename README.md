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

## Part 2: Set Up Firebase (Your Database, Login & Storage)

Firebase stores your tasks, handles Google Sign-In, and hosts your website for free.

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

### 2.5 Turn On Storage (Optional — for custom list background photos)
1. In the left sidebar, click **Build → Storage** → **Get started** → **Next** → **Done**.

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
Run these two commands in the main `ToDo` folder:
```bash
npm run build
firebase deploy --only hosting
```
*(Or `npx firebase-tools deploy --only hosting` if `firebase` is not recognized.)*
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
