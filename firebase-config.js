/* RPS Arena — Firebase config
   Fill this in with YOUR Firebase project's web app config.
   See FIREBASE_SETUP.md for step-by-step instructions (in French).
   Project Settings → General → "Your apps" → Web app → SDK setup and configuration.
   Leaving apiKey as "YOUR_API_KEY" keeps the app in offline/local-only mode —
   PvP will fall back to the old bot-simulation instead of real matchmaking. */
const FIREBASE_CONFIG = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_PROJECT_ID.firebaseapp.com",
  databaseURL: "https://YOUR_PROJECT_ID-default-rtdb.firebaseio.com",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_PROJECT_ID.appspot.com",
  messagingSenderId: "YOUR_SENDER_ID",
  appId: "YOUR_APP_ID"
};
