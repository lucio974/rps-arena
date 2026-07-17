/* RPS Arena — Multiplayer (Firebase Realtime Database)
   -------------------------------------------------------------------------
   This module is entirely self-contained: app.js only ever calls the mp*
   functions below and reads the `mp` state object. If Firebase isn't
   configured (see firebase-config.js), mp.ready stays false and app.js
   falls back to the local bot-simulation for everything.

   ONLINE ROUND SYNC — how hidden picks work without a server:
   We use a commit-reveal scheme. Each player first writes a SHA-256 hash
   of "pick|nonce" (their commit). Once both commits exist, each player
   reveals their real pick+nonce. Only after BOTH reveals exist can either
   client compute the round result — so neither player can see the other's
   pick before locking in their own. This runs entirely client-side against
   Realtime Database; no backend function is required.
   ------------------------------------------------------------------------- */

const mp = {
  ready: false,           // true once signed in and DB reachable
  configured: false,      // true if firebase-config.js has real values
  uid: null,
  matchId: null,
  role: null,             // 'p1' or 'p2' within the current match
  friendPresence: {},     // uid -> presence snapshot, kept live for friends list
  _queueListener: null,
  _matchListener: null,
  _roundListener: null,
  _pendingReveal: null,   // {round, pick, nonce}
  _pendingInvite: null,
  _inviteRef: null,
  _friendPresenceRefs: {},
  // Callbacks wired up by app.js
  onStatusChange: null,   // (status:'connecting'|'online'|'offline') => void
  onIncomingInvite: null, // (invite) => void
  onOpponentForfeit: null,
};

function _isConfigured() {
  return typeof FIREBASE_CONFIG !== 'undefined' &&
    FIREBASE_CONFIG.apiKey && !/^YOUR_/.test(FIREBASE_CONFIG.apiKey);
}

function mpInit(cb) {
  mp.configured = _isConfigured();
  if (!mp.configured || typeof firebase === 'undefined') {
    mp.ready = false;
    mp.onStatusChange && mp.onStatusChange('offline');
    cb && cb(false);
    return;
  }
  mp.onStatusChange && mp.onStatusChange('connecting');
  try {
    firebase.initializeApp(FIREBASE_CONFIG);
  } catch (e) {
    // Already initialized (hot reload) — ignore
  }
  firebase.auth().signInAnonymously().then((cred) => {
    mp.uid = cred.user.uid;
    _setupPresence();
    _watchInvites();
    mp.ready = true;
    mp.onStatusChange && mp.onStatusChange('online');
    cb && cb(true);
  }).catch((err) => {
    console.error('[multiplayer] auth failed', err);
    mp.ready = false;
    mp.onStatusChange && mp.onStatusChange('offline');
    cb && cb(false);
  });
}

/* ---- PRESENCE ---- */
function _setupPresence() {
  const db = firebase.database();
  const myPresence = db.ref('presence/' + mp.uid);
  db.ref('.info/connected').on('value', (snap) => {
    if (snap.val() !== true) return;
    myPresence.onDisconnect().update({
      online: false,
      lastSeen: firebase.database.ServerValue.TIMESTAMP,
    });
    mpPushProfile();
  });
}
// Push the player's current public profile (name/avatar/elo) to presence.
// Call this whenever the local profile changes (name edit, avatar change, ELO change).
function mpPushProfile() {
  if (!mp.ready && !mp.uid) return;
  firebase.database().ref('presence/' + mp.uid).update({
    username: state.username,
    avatar: state.avatar,
    elo: state.elo,
    online: true,
    status: 'idle',
    lastSeen: firebase.database.ServerValue.TIMESTAMP,
  });
}
function mpSetStatus(status, extra) {
  if (!mp.ready) return;
  firebase.database().ref('presence/' + mp.uid).update(Object.assign({ status }, extra || {}));
}
function mpMyCode() {
  return mp.uid || '';
}

/* ---- FRIEND PRESENCE (live status for friends list) ---- */
function mpWatchFriendPresence(uids, onChange) {
  if (!mp.ready) return;
  const db = firebase.database();
  const wanted = new Set(uids.filter(Boolean));
  // Detach listeners for uids no longer needed
  Object.keys(mp._friendPresenceRefs).forEach((uid) => {
    if (!wanted.has(uid)) {
      mp._friendPresenceRefs[uid].ref.off('value', mp._friendPresenceRefs[uid].listener);
      delete mp._friendPresenceRefs[uid];
      delete mp.friendPresence[uid];
    }
  });
  // Attach listeners for new uids
  wanted.forEach((uid) => {
    if (mp._friendPresenceRefs[uid]) return;
    const ref = db.ref('presence/' + uid);
    const listener = ref.on('value', (snap) => {
      mp.friendPresence[uid] = snap.val();
      onChange && onChange();
    });
    mp._friendPresenceRefs[uid] = { ref, listener };
  });
}
function mpLookupPlayer(uid, cb) {
  if (!mp.ready) { cb && cb(null); return; }
  firebase.database().ref('presence/' + uid).once('value', (snap) => {
    cb && cb(snap.exists() ? Object.assign({ uid }, snap.val()) : null);
  });
}

/* ---- RANDOM MATCHMAKING ---- */
function mpFindMatch(onFound, onError) {
  if (!mp.ready) { onError && onError('offline'); return; }
  const db = firebase.database();
  mpSetStatus('searching');
  db.ref('queue').orderByChild('waiting').equalTo(true).limitToFirst(8).once('value', (snap) => {
    let opponent = null;
    snap.forEach((child) => {
      if (child.key !== mp.uid && !opponent) opponent = Object.assign({ uid: child.key }, child.val());
    });
    if (opponent) {
      db.ref('queue/' + opponent.uid).transaction((cur) => {
        if (cur && cur.waiting) {
          cur.waiting = false;
          cur.matchedWith = mp.uid;
          return cur;
        }
        return; // abort transaction — someone else grabbed them
      }, (err, committed, snap2) => {
        if (!err && committed && snap2.val() && snap2.val().matchedWith === mp.uid) {
          _createMatch(opponent, onFound);
        } else {
          _enqueueSelf(onFound);
        }
      });
    } else {
      _enqueueSelf(onFound);
    }
  });
}
function _enqueueSelf(onFound) {
  const db = firebase.database();
  const myQ = db.ref('queue/' + mp.uid);
  myQ.set({
    username: state.username, avatar: state.avatar, elo: state.elo,
    waiting: true, joinedAt: firebase.database.ServerValue.TIMESTAMP,
  });
  myQ.onDisconnect().remove();
  const listener = myQ.on('value', (snap) => {
    const v = snap.val();
    // Wait specifically for matchId — matchedWith (set first, by the transaction) is
    // the OPPONENT's uid, not the match path, and arrives slightly before matchId does.
    if (v && v.waiting === false && v.matchId) {
      myQ.off('value', listener);
      myQ.remove();
      mpJoinMatch(v.matchId, 'p2', onFound);
    }
  });
  mp._queueListener = { ref: myQ, listener };
}
function mpCancelSearch() {
  if (!mp.ready) return;
  if (mp._queueListener) {
    mp._queueListener.ref.off('value', mp._queueListener.listener);
    mp._queueListener = null;
  }
  firebase.database().ref('queue/' + mp.uid).remove();
  mpSetStatus('idle');
}
function _createMatch(opponent, onFound) {
  const db = firebase.database();
  const matchRef = db.ref('matches').push();
  const matchId = matchRef.key;
  matchRef.set({
    p1: { uid: mp.uid, username: state.username, avatar: state.avatar, elo: state.elo },
    p2: { uid: opponent.uid, username: opponent.username, avatar: opponent.avatar, elo: opponent.elo },
    bo: 5, status: 'active', scoreP1: 0, scoreP2: 0,
    createdAt: firebase.database.ServerValue.TIMESTAMP,
  }).then(() => {
    // Not strictly needed (the queue transaction already wrote matchedWith),
    // but stash the matchId on the opponent's queue node so they can pick it up
    // even if their listener fires slightly out of order.
    db.ref('queue/' + opponent.uid).update({ matchId });
    mpJoinMatch(matchId, 'p1', onFound);
  });
}

/* ---- MATCH LIFECYCLE ---- */
function mpJoinMatch(matchId, role, onFound) {
  mp.matchId = matchId;
  mp.role = role;
  mpSetStatus('in_match', { matchId });
  const ref = firebase.database().ref('matches/' + matchId);
  ref.once('value', (snap) => {
    const m = snap.val();
    if (!m) { onFound && onFound(null); return; }
    const opp = role === 'p1' ? m.p2 : m.p1;
    onFound && onFound({ matchId, role, opponent: opp, bo: m.bo });
  });
  const listener = ref.on('value', (snap) => {
    const m = snap.val();
    if (!m) return;
    if (m.status === 'forfeited' && m.forfeitedBy && m.forfeitedBy !== mp.uid) {
      mp.onOpponentForfeit && mp.onOpponentForfeit();
    }
  });
  mp._matchListener = { ref, listener };
}
function mpLeaveMatch(forfeit) {
  if (mp.matchId && forfeit) {
    firebase.database().ref('matches/' + mp.matchId).update({ status: 'forfeited', forfeitedBy: mp.uid });
  }
  if (mp._matchListener) {
    mp._matchListener.ref.off('value', mp._matchListener.listener);
    mp._matchListener = null;
  }
  if (mp._roundListener) {
    mp._roundListener.ref.off('value', mp._roundListener.listener);
    mp._roundListener = null;
  }
  mp.matchId = null;
  mp.role = null;
  mp._pendingReveal = null;
  mpSetStatus('idle');
}

/* ---- COMMIT-REVEAL ROUND SYNC ---- */
async function _sha256Hex(str) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
}
// Submit this player's pick for `round` and start watching for the reveal/resolve sequence.
// onResolved(round, myPick, oppPick) fires once for both players once both reveals land.
async function mpSubmitPick(round, pick, onResolved) {
  if (!mp.ready || !mp.matchId) return;
  const nonce = Math.random().toString(36).slice(2) + Date.now().toString(36);
  const hash = await _sha256Hex(pick + '|' + nonce);
  mp._pendingReveal = { round, pick, nonce };
  const myKey = mp.role;
  const roundRef = firebase.database().ref(`matches/${mp.matchId}/rounds/${round}`);
  await roundRef.child('commits/' + myKey).set(hash);

  if (mp._roundListener) {
    mp._roundListener.ref.off('value', mp._roundListener.listener);
  }
  const listener = roundRef.on('value', async (snap) => {
    const r = snap.val() || {};
    const commits = r.commits || {};
    const reveals = r.reveals || {};
    if (commits.p1 && commits.p2 && mp._pendingReveal && mp._pendingReveal.round === round && !reveals[myKey]) {
      await roundRef.child('reveals/' + myKey).set({ pick: mp._pendingReveal.pick, nonce: mp._pendingReveal.nonce });
    }
    if (reveals.p1 && reveals.p2) {
      roundRef.off('value', listener);
      mp._roundListener = null;
      const myPick = reveals[myKey].pick;
      const oppKey = myKey === 'p1' ? 'p2' : 'p1';
      const oppPick = reveals[oppKey].pick;
      onResolved && onResolved(round, myPick, oppPick);
    }
  });
  mp._roundListener = { ref: roundRef, listener };
}

/* ---- FRIEND INVITES (real-time challenge) ---- */
function _watchInvites() {
  const ref = firebase.database().ref('invites/' + mp.uid);
  ref.on('child_added', (snap) => {
    const inv = snap.val();
    if (inv && inv.status === 'pending') {
      mp.onIncomingInvite && mp.onIncomingInvite(Object.assign({ id: snap.key }, inv));
    }
  });
  mp._inviteRef = ref;
}
function mpSendInvite(toUid, onResult) {
  if (!mp.ready) { onResult && onResult('offline'); return; }
  const db = firebase.database();
  const invRef = db.ref('invites/' + toUid).push();
  invRef.set({
    fromUid: mp.uid, fromName: state.username, fromAvatar: state.avatar, fromElo: state.elo,
    status: 'pending', createdAt: firebase.database.ServerValue.TIMESTAMP,
  });
  invRef.onDisconnect().remove();
  const listener = invRef.on('value', (snap) => {
    const v = snap.val();
    if (!v) return;
    if (v.status === 'accepted' && v.matchId) {
      invRef.off('value', listener);
      invRef.remove();
      mp._pendingInvite = null;
      mpJoinMatch(v.matchId, 'p1', (info) => onResult('accepted', info));
    } else if (v.status === 'declined') {
      invRef.off('value', listener);
      invRef.remove();
      mp._pendingInvite = null;
      onResult('declined');
    }
  });
  mp._pendingInvite = { ref: invRef, listener };
  setTimeout(() => {
    if (mp._pendingInvite && mp._pendingInvite.ref.key === invRef.key) {
      invRef.off('value', listener);
      invRef.remove();
      mp._pendingInvite = null;
      onResult('timeout');
    }
  }, 30000);
}
function mpCancelInvite() {
  if (mp._pendingInvite) {
    mp._pendingInvite.ref.off('value', mp._pendingInvite.listener);
    mp._pendingInvite.ref.remove();
    mp._pendingInvite = null;
  }
}
function mpAcceptInvite(inv, onFound) {
  const db = firebase.database();
  const matchRef = db.ref('matches').push();
  const matchId = matchRef.key;
  matchRef.set({
    p1: { uid: inv.fromUid, username: inv.fromName, avatar: inv.fromAvatar, elo: inv.fromElo },
    p2: { uid: mp.uid, username: state.username, avatar: state.avatar, elo: state.elo },
    bo: 5, status: 'active', scoreP1: 0, scoreP2: 0,
    createdAt: firebase.database.ServerValue.TIMESTAMP,
  }).then(() => {
    db.ref('invites/' + mp.uid + '/' + inv.id).update({ status: 'accepted', matchId });
    mpJoinMatch(matchId, 'p2', onFound);
  });
}
function mpDeclineInvite(inv) {
  firebase.database().ref('invites/' + mp.uid + '/' + inv.id).update({ status: 'declined' });
}
