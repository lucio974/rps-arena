/* ============================================================
   RPS ARENA — MULTIPLAYER MODULE (Phase 1: Auth + Profile Sync)
   ============================================================
   This file assumes app.js has already loaded (it uses app.js's globals:
   `state`, `DEFAULT_STATE`, `saveState`, `updateHeader`, `updateBalance`,
   `renderProfile`, `showView`, `toast`). Load order in index.html:
     firebase-config.js → app.js → multiplayer.js

   SCOPE OF THIS PHASE:
   - Email/password + Google sign-in
   - Username uniqueness + reservation
   - Firestore user profile create-on-signup / load-on-signin
   - Two-way sync: Firestore is authoritative when signed in; localStorage
     remains a local cache/offline fallback (via the existing saveState()).

   NOT YET IN THIS PHASE (coming next):
   - Real friends list with live presence (Phase 2)
   - Real ranked matchmaking + live match round sync (Phase 3)
   - Friend-match invites over the same live match engine (Phase 4)
   Until those ship, Lobby PvP / Friend matches still use the old
   bot-simulated flow from before — signing in does not yet change how
   matches are played, only how your profile/stats are stored.
   ============================================================ */

let mpUser = null;      // Firebase Auth user object, or null when signed out
let mpProfileLoaded = false;
let _profilePushTimer = null;

// Fields that sync to Firestore as "the profile". Deliberately excludes
// purely local/device state (theme color, daily-claim timestamps, featured
// rotation, tournaments array, local match history, friends array — those
// either stay local-only for now or get their own Firestore collections in
// later phases).
const MP_SYNCED_FIELDS = [
  'username', 'avatar', 'ownedEmojis', 'balance', 'elo', 'bestElo', 'lowestElo',
  'wins', 'draws', 'losses', 'games', 'earned', 'bestStreak', 'currentPvpStreak',
  'pickRock', 'pickPaper', 'pickScissors', 'tourneysWon', 'drawRounds',
  'claimedChallenges', 'brokenFeatureTriggered', 'oddsTriggered', 'lightyearsAchieved',
  'shopClicksUnlocked',
];

function mpExtractProfile(src) {
  const out = {};
  for (const k of MP_SYNCED_FIELDS) out[k] = src[k];
  return out;
}

/* ---- AUTH SCREEN UI STATE ---- */
let authMode = 'signin'; // 'signin' | 'signup'

function authSetMode(mode) {
  authMode = mode;
  document.getElementById('auth-tab-signin').classList.toggle('active', mode === 'signin');
  document.getElementById('auth-tab-signup').classList.toggle('active', mode === 'signup');
  document.getElementById('auth-username-row').style.display = mode === 'signup' ? 'block' : 'none';
  document.getElementById('auth-submit-btn').textContent = mode === 'signup' ? 'Create Account' : 'Sign In';
  authClearError();
}

function authClearError() {
  const el = document.getElementById('auth-error');
  el.style.display = 'none';
  el.textContent = '';
}

function authShowError(msg) {
  const el = document.getElementById('auth-error');
  el.textContent = msg;
  el.style.display = 'block';
}

function authSetLoading(loading) {
  document.getElementById('auth-submit-btn').disabled = loading;
  document.getElementById('auth-google-btn').disabled = loading;
  document.getElementById('auth-submit-btn').textContent = loading
    ? '…'
    : (authMode === 'signup' ? 'Create Account' : 'Sign In');
}

// Friendly text for the most common Firebase Auth error codes.
function authFriendlyError(err) {
  const code = err && err.code;
  const map = {
    'auth/email-already-in-use': 'That email already has an account — try Sign In instead.',
    'auth/invalid-email': 'That email address looks invalid.',
    'auth/weak-password': 'Password must be at least 6 characters.',
    'auth/user-not-found': 'No account found with that email.',
    'auth/wrong-password': 'Incorrect password.',
    'auth/invalid-credential': 'Incorrect email or password.',
    'auth/too-many-requests': 'Too many attempts — please wait a moment and try again.',
    'auth/network-request-failed': 'Network error — check your connection.',
    'auth/popup-closed-by-user': 'Google sign-in was closed before finishing.',
  };
  return map[code] || (err && err.message) || 'Something went wrong. Please try again.';
}

/* ---- USERNAME HANDLING ---- */
// Usernames are stored lowercase as document IDs in `usernames/{lowercase}`
// so uniqueness checks and reservation are a single doc read/write, not a
// query. The doc just stores { uid } pointing back to the owner.
function normalizeUsername(raw) {
  return (raw || '').trim().slice(0, 16);
}

async function isUsernameTaken(username) {
  const key = username.toLowerCase();
  const doc = await db.collection('usernames').doc(key).get();
  return doc.exists;
}

/* ---- SIGN UP ---- */
async function authSignUp(email, password, username) {
  const cleanUsername = normalizeUsername(username);
  if (!cleanUsername) throw { code: 'custom/no-username', message: 'Choose a username.' };
  if (cleanUsername.length < 3) throw { code: 'custom/short-username', message: 'Username must be at least 3 characters.' };
  if (!/^[a-zA-Z0-9_]+$/.test(cleanUsername)) throw { code: 'custom/bad-username', message: 'Username can only use letters, numbers, and underscores.' };

  const taken = await isUsernameTaken(cleanUsername);
  if (taken) throw { code: 'custom/username-taken', message: 'That username is already taken.' };

  const cred = await auth.createUserWithEmailAndPassword(email, password);
  await createUserProfile(cred.user, cleanUsername);
  return cred.user;
}

/* ---- SIGN IN ---- */
async function authSignIn(email, password) {
  const cred = await auth.signInWithEmailAndPassword(email, password);
  return cred.user;
}

/* ---- GOOGLE SIGN-IN (handles both new + returning users) ---- */
async function authSignInGoogle() {
  const cred = await auth.signInWithPopup(googleProvider);
  const existing = await db.collection('users').doc(cred.user.uid).get();
  if (!existing.exists) {
    // First time this Google account has signed in — mint a default
    // username from their Google display name, falling back to a random
    // suffix if that's already taken.
    let base = normalizeUsername((cred.user.displayName || 'Player').replace(/[^a-zA-Z0-9_]/g, ''));
    if (base.length < 3) base = 'Player';
    let candidate = base;
    let attempts = 0;
    while (await isUsernameTaken(candidate) && attempts < 20) {
      candidate = base + Math.floor(1000 + Math.random() * 9000);
      attempts++;
    }
    await createUserProfile(cred.user, candidate);
  }
  return cred.user;
}

/* ---- PROFILE CREATION (first sign-up only) ---- */
async function createUserProfile(user, username) {
  const usernameKey = username.toLowerCase();
  const profile = mpExtractProfile({ ...DEFAULT_STATE, username });
  profile.createdAt = firebase.firestore.FieldValue.serverTimestamp();

  // Reserve the username + create the profile doc together. Firestore
  // client SDK doesn't have multi-collection atomic transactions across
  // arbitrary doc creation in the compat SDK's simple form here, but a
  // batch write is atomic across both documents, which is what we need.
  const batch = db.batch();
  batch.set(db.collection('usernames').doc(usernameKey), { uid: user.uid });
  batch.set(db.collection('users').doc(user.uid), profile);
  await batch.commit();
}

/* ---- PROFILE LOAD (every sign-in, including page reloads) ---- */
async function loadUserProfile(uid) {
  const doc = await db.collection('users').doc(uid).get();
  if (!doc.exists) {
    // Shouldn't normally happen (profile is created at signup), but handle
    // gracefully in case a doc was deleted out-of-band.
    console.warn('[RPS Arena] No profile doc for uid', uid);
    return null;
  }
  return doc.data();
}

/* ---- PUSH LOCAL STATE → FIRESTORE (debounced) ----
   Called from the patched saveState() below. Debounced to 1.5s so rapid
   local writes (e.g. multiple stat updates in the same game-end handler)
   collapse into a single Firestore write instead of one per field change. */
function schedulePushProfile() {
  if (!mpUser || !mpProfileLoaded) return;
  clearTimeout(_profilePushTimer);
  _profilePushTimer = setTimeout(() => {
    const profile = mpExtractProfile(state);
    db.collection('users').doc(mpUser.uid).set(profile, { merge: true }).catch(err => {
      console.error('[RPS Arena] Profile sync failed:', err);
    });
  }, 1500);
}

/* ---- PATCH saveState() to also push to Firestore when signed in ----
   app.js's saveState() only knows about localStorage. We wrap it here
   rather than editing app.js directly, so this file is the single place
   multiplayer persistence logic lives. */
const _originalSaveState = saveState;
saveState = function() {
  _originalSaveState();
  schedulePushProfile();
};

/* ---- AUTH GATE: show/hide the auth screen vs the main app ---- */
function showAuthScreen() {
  document.getElementById('auth-screen').style.display = 'flex';
  document.getElementById('app').style.display = 'none';
}
function hideAuthScreen() {
  document.getElementById('auth-screen').style.display = 'none';
  document.getElementById('app').style.display = '';
}

async function handleSignedIn(user) {
  mpUser = user;
  mpProfileLoaded = false;
  const profile = await loadUserProfile(user.uid);
  if (profile) {
    // Firestore is authoritative for synced fields; merge onto local state
    // (which still carries device-local fields like themeColor untouched).
    Object.assign(state, profile);
    mpProfileLoaded = true;
    _originalSaveState(); // cache merged profile locally; skip re-triggering a push
  }
  hideAuthScreen();
  applyTheme();
  updateBalance();
  updateHeader();
  if (document.getElementById('view-profile').classList.contains('active')) renderProfile();
  toast('Welcome back, ' + state.username + '!');
}

function handleSignedOut() {
  mpUser = null;
  mpProfileLoaded = false;
  showAuthScreen();
}

/* ---- WIRE UP FORM SUBMIT ---- */
async function authSubmit() {
  authClearError();
  const email = document.getElementById('auth-email').value.trim();
  const password = document.getElementById('auth-password').value;
  const username = document.getElementById('auth-username').value;

  if (!email || !password) { authShowError('Enter your email and password.'); return; }

  authSetLoading(true);
  try {
    if (authMode === 'signup') {
      await authSignUp(email, password, username);
    } else {
      await authSignIn(email, password);
    }
    // onAuthStateChanged fires automatically and completes the flow.
  } catch (err) {
    authShowError(authFriendlyError(err));
  } finally {
    authSetLoading(false);
  }
}

async function authSubmitGoogle() {
  authClearError();
  authSetLoading(true);
  try {
    await authSignInGoogle();
  } catch (err) {
    authShowError(authFriendlyError(err));
  } finally {
    authSetLoading(false);
  }
}

function signOutUser() {
  auth.signOut();
}

/* ---- BOOT ---- */
auth.onAuthStateChanged(user => {
  if (user) handleSignedIn(user);
  else handleSignedOut();
});
