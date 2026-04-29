# RPS Arena — Installable iPhone PWA

A Progressive Web App version of RPS Arena. Once hosted, you can install it on your iPhone home screen and play offline.

## What's included

```
rps-arena/
├── index.html          Main app shell
├── app.js              Game logic + persistence
├── manifest.json       PWA manifest
├── sw.js               Service worker (offline support)
├── icon-192.png        Standard icon
├── icon-512.png        High-res icon
├── icon-512-maskable.png   Maskable variant for Android
└── icon-180.png        Apple touch icon
```

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

## Features

- **PvP matchmaking** with 4 entry tiers (10, 50, 100, 500 coins)
- **Tournaments** — 8-player single-elimination brackets
- **Practice mode** vs AI (free)
- **Buy coins** (demo only — see "Real money" below)
- **Match history** persists across sessions
- **Offline play** — once installed, works without internet
- **Haptic feedback** on supported devices

## About paid entries / real money

The app currently uses in-app virtual coins (no real money). To accept real payments, the cleanest path on a PWA is:

1. **Stripe Checkout** for the coin packs (simple — just an API call, ~50 lines)
2. **A small backend** (Cloudflare Workers, Vercel Functions, or Supabase) to verify purchases and update server-side balance
3. **Server-authoritative game state** — currently each phone tracks its own coins, so payouts can't be trusted between players

### Important legal note

A PWA bypasses Apple's gambling restrictions, but **does not bypass real-world gambling laws**. Paid-entry tournaments with cash prizes are regulated as either:
- **Skill-based contests** (legal in most US states for RPS, though chance-heavy games are gray area), OR
- **Gambling** (requires a license in nearly every jurisdiction)

For a real product, you'd want a lawyer to review your model. Common legal-safe approaches:
- Free-to-play with sweepstakes-style entries
- Skill-tournament structure with documented skill metrics
- Cosmetic/non-cash prizes only

## Tech notes

- Pure HTML/CSS/JS, no build step
- ~30KB total (very fast even on cellular)
- Works fully offline after first visit
- State stored in `localStorage` (cleared if you uninstall)
- Service worker caches all assets — updates require bumping `CACHE` version in `sw.js`

## Updating the app

When you change `app.js` or `index.html`:
1. Bump the version in `sw.js` (e.g. `rps-arena-v1` → `rps-arena-v2`)
2. Re-upload to your host
3. The service worker will pick up the new version on next open
