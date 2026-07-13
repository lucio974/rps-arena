/* ============================================================
   FIREBASE CONFIGURATION — fill this in with YOUR project's keys
   ============================================================

   How to get these values:
   1. Go to https://console.firebase.google.com and open your project
      (or create one — see the setup checklist you were given).
   2. Click the gear icon (top left) → Project settings.
   3. Scroll to "Your apps" → click the Web icon (</>) → register an app
      (nickname can be anything, e.g. "RPS Arena Web").
   4. Firebase shows you a `firebaseConfig` object — copy every field
      from it into the object below, replacing the placeholders.
   5. For `databaseURL`: go to Build → Realtime Database in the left
      nav, create the database if you haven't yet, and copy the URL
      shown at the top of that page (looks like
      https://YOUR-PROJECT-default-rtdb.firebaseio.com).

   Note: Firebase web API keys are DESIGNED to be public — they identify
   your project, they don't grant access by themselves. Real security
   comes from the Firestore/Realtime Database rules files, not from
   hiding this key. You do not need to treat this file as a secret.
   ============================================================ */

const firebaseConfig = {
  apiKey: "AIzaSyBb_eSz4a0EkXd94Az5ggX9ymXUvH5hKjU",
  authDomain: "rps-arena-5bf33.firebaseapp.com",
  projectId: "rps-arena-5bf33",
  storageBucket: "rps-arena-5bf33.firebasestorage.app",
  messagingSenderId: "542366547222",
  appId: "1:542366547222:web:bcf51c205b02dd50a8a437",
  databaseURL: "https://rps-arena-5bf33-default-rtdb.europe-west1.firebasedatabase.app"
};

// Basic sanity check — makes the failure mode obvious instead of a cryptic
// Firebase SDK error if someone forgets to fill in the config above.
if (firebaseConfig.apiKey === "PASTE_YOUR_API_KEY_HERE") {
  console.error(
    '[RPS Arena] firebase-config.js still has placeholder values. ' +
    'Open firebase-config.js and paste in your real Firebase project config.'
  );
}

firebase.initializeApp(firebaseConfig);

const auth = firebase.auth();
const db = firebase.firestore();
const rtdb = firebase.database();
const googleProvider = new firebase.auth.GoogleAuthProvider();

// Persist auth across app restarts / PWA relaunches (default, but explicit
// here since PWAs on iOS sometimes clear session-only storage aggressively).
auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL).catch(() => {});
