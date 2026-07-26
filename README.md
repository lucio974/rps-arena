# RPS Arena — Installable iPhone PWA

A Progressive Web App version of RPS Arena. Once hosted, you can install it on your iPhone home screen and play offline — or online against real players once Firebase is configured (see below).

## What's included

```
rps-arena/
├── index.html          Main app shell
├── app.js              Game logic + persistence + online integration
├── multiplayer.js       Online multiplayer module (Firebase Realtime Database)
├── firebase-config.js   Your Firebase project config (placeholder until you fill it in)
├── emoji-catalog.js    Emoji shop catalog
├── manifest.json       PWA manifest
├── sw.js               Service worker (offline support)
├── database.rules.json Realtime Database security rules
├── FIREBASE_SETUP.md   Step-by-step guide (French) to enable real online play
├── icon-192.png        Standard icon
├── icon-512.png        High-res icon
├── icon-512-maskable.png   Maskable variant for Android
└── icon-180.png        Apple touch icon
```

## Online multiplayer

RPS Arena supports **real online play** against other people, not just simulated bots:

- **Random matchmaking** — "Find Match" in the PvP lobby queues you against another real online player when available (falls back to a bot after ~10s if nobody's online, so the game is never blocked).
- **Friend challenges** — each player gets a shareable **Friend Code** (Friends tab). Add a friend by their code, see their real online status, and challenge them directly — they get a live invite popup to accept or decline. Friend matches stay free/social (no tokens, no ELO impact), same as local demo-friend matches always were.
- **Hidden picks, no server needed** — rock/paper/scissors choices are synced using a commit-reveal scheme (each side submits a cryptographic hash of their pick first, then reveals once both are locked in), so nobody can peek at the opponent's choice before making their own.

This requires a **free Firebase project** — see **`FIREBASE_SETUP.md`** for the full walkthrough (in French). Until it's configured, the app works exactly as before, playing against local bots.

**Still local/simulated:** tournaments, the leaderboard, and "historical opponent" profiles. Only ranked PvP matchmaking and friend challenges are real online play for now.

## How to install on your iPhone

Step 1: **Host the files on the web** (you can't install a PWA from a local file). Pick one — all are free:

### Option A: Netlify Drop (easiest, ~30 seconds)
1. Go to https://app.netlify.com/drop
2. Drag the entire `rps-arena` folder onto the page
3. Wait for it to upload — you'll get a URL like `https://random-name-12345.netlify.app`

### Option B: Vercel
1. Go to https://vercel.com, sign in
2. Click "Add New Project" → drag the folder

### Option C: GitHub Pages
1. Create a repo, push these files
2. Settings → Pages → enable, source = main branch

### Option D: Cloudflare Pages
1. Go to https://pages.cloudflare.com
2. "Direct Upload" → drag the folder

Step 2: **Install on your phone**
1. Open the URL in **Safari** on your iPhone (must be Safari, not Chrome)
2. Tap the **Share** button at the bottom (square with arrow)
3. Scroll down and tap **Add to Home Screen**
4. Tap **Add** in the top right
5. The app icon appears on your home screen — tap it and it opens fullscreen, no Safari UI

## Tech notes

- Pure HTML/CSS/JS, no build step (Firebase loaded via CDN script tags, compat SDK)
- Works fully offline after first visit (falls back to bot matches when no network)
- State stored in `localStorage` (cleared if you uninstall); online presence/matches live in Firebase
- Service worker caches all local assets — updates require bumping `CACHE` version in `sw.js`

## Updating the app

When you change `app.js`, `multiplayer.js`, or `index.html`:
1. Bump the version in `sw.js` (e.g. `rps-arena-v5` → `rps-arena-v6`)
2. Re-upload to your host
3. The service worker will pick up the new version on next open
