# ToDo PWA

A cross-platform Progressive Web App (PWA) task manager built with **React**, **TypeScript**, **Vite**, and **Firebase** (Authentication, Cloud Firestore with offline persistence, Storage, and Hosting).

**Live Deployment (Owner Reference):** https://todo-232b3.web.app/

## Features

- **Smart Lists:** My Day, Important, Planned, Assigned to Me, Tasks, All, Completed, and Trash.
- **Custom Lists & Groups:** Organize lists into collapsible groups, customize icons/emojis, colors, and backgrounds (built-in themes or custom uploaded images via Firebase Storage).
- **Rich Task Details:** Sub-steps, due dates, reminders, repeat rules, categories, notes, and file attachment metadata.
- **Shared Lists:** Share lists with other users via `memberUids` with Firestore security rules enforcing owner/member access.
- **Offline-First & Installable PWA:** Persistent multi-tab Firestore local cache and auto-updating service worker via `vite-plugin-pwa`.
- **Google Sign-In:** Authenticated per-user data and shared list collaboration via Firebase Auth.
- **Dark & Light Themes:** Configurable theme mode with instant pre-render theme initialization.

## Prerequisites

- [Node.js](https://nodejs.org/) (v18+ recommended) and `npm`
- A [Firebase](https://console.firebase.google.com/) project
- [Firebase CLI](https://firebase.google.com/docs/cli) (`npm install -g firebase-tools`) if deploying to Firebase Hosting or deploying Firestore rules/indexes

## Local Setup

1. **Clone the repository and install dependencies:**

   ```bash
   git clone <your-repo-url>
   cd ToDo
   npm install
   ```

2. **Create your environment file:**

   Copy `.env.example` to `.env.local` (note: `.env.local` is gitignored):

   ```bash
   cp .env.example .env.local
   ```

   Fill in `.env.local` with your Firebase Web App config values from **Firebase Console → Project Settings → Your apps**:

   ```env
   VITE_FIREBASE_API_KEY=...
   VITE_FIREBASE_AUTH_DOMAIN=...
   VITE_FIREBASE_PROJECT_ID=...
   VITE_FIREBASE_STORAGE_BUCKET=...
   VITE_FIREBASE_MESSAGING_SENDER_ID=...
   VITE_FIREBASE_APP_ID=...
   ```

3. **Start the development server:**

   ```bash
   npm run dev
   ```

   Open the local URL printed by Vite (typically `http://localhost:5173`).

## Firebase Configuration

If you are hosting your own instance, configure the following in your Firebase project:

1. **Authentication:**
   - Enable **Google** as a sign-in provider under **Authentication → Sign-in method**.
   - Add your local (`localhost`) and production hosting domains under **Authentication → Settings → Authorized domains**.

2. **Cloud Firestore:**
   - Create a Firestore database in your project.
   - Deploy the included security rules (`firestore.rules`) and composite/collection-group indexes (`firestore.indexes.json`):

     ```bash
     firebase deploy --only firestore
     ```

3. **Firebase Storage (Optional):**
   - Enable **Storage** if you want users to upload custom list background images (`VITE_FIREBASE_STORAGE_BUCKET` must be set).

## Hosting & Deployment

### Option 1: Firebase Hosting (Recommended)

This repository includes `firebase.json` configured to serve `dist/` with SPA rewrites to `/index.html`.

1. **Log in to Firebase CLI:**

   ```bash
   firebase login
   ```

2. **Point to your own Firebase project:**

   Update `.firebaserc` (or run `firebase use --add`) with your Firebase project ID instead of the default project (`todo-232b3`):

   ```bash
   firebase use --add
   ```

3. **Build and deploy:**

   ```bash
   npm run build
   firebase deploy
   ```

   To deploy only Hosting (without Firestore rules/indexes):

   ```bash
   firebase deploy --only hosting
   ```

### Option 2: Other Static Hosts (Vercel, Netlify, Cloudflare Pages)

Because this is a Vite SPA, you can deploy `dist/` to any static host:

- **Build command:** `npm run build`
- **Output directory:** `dist`
- **Environment variables:** Set all 6 `VITE_FIREBASE_*` variables from `.env.example` in your hosting provider's dashboard.
- **Routing:** Configure a fallback rewrite so all routes serve `/index.html`.

## Available Scripts

| Command | Description |
| --- | --- |
| `npm run dev` | Start the Vite development server |
| `npm run build` | Type-check (`tsc -b`) and build production bundle to `dist/` |
| `npm run preview` | Preview the production `dist/` build locally |

## Project Structure

```text
├── public/                 # Static assets (e.g., icon.svg)
├── src/
│   ├── components/         # UI components (Sidebar, TaskRow, TaskDetail, ShareDialog, etc.)
│   ├── lib/                # Firebase initialization, sound, context menu, emoji helpers
│   ├── types/              # TypeScript interfaces (TodoItem, TodoList, TodoGroup)
│   ├── App.tsx             # Main application state and layout
│   ├── index.css           # Global styles
│   ├── tokens.css          # Theme CSS variables
│   └── main.tsx            # Entry point
├── .env.example            # Template for Firebase environment variables
├── .firebaserc             # Default Firebase project alias
├── firebase.json           # Firebase Hosting & Firestore config
├── firestore.indexes.json  # Required Firestore indexes
├── firestore.rules         # Firestore security rules
├── package.json            # Dependencies and npm scripts
└── vite.config.ts          # Vite + PWA configuration
```
