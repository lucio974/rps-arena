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
  _queueWatchRef: null,
  _matchmakingPoll: null,
  _matchListener: null,
  _roundListener: null,
  _pendingReveal: null,   // {round, pick, nonce}
  _pendingInvite: null,
  _inviteRef: null,
  _pendingTrade: null,
  _tradeRef: null,
  _friendPresenceRefs: {},
  // Callbacks wired up by app.js
  onStatusChange: null,   // (status:'connecting'|'online'|'offline') => void
  onIncomingInvite: null, // (invite) => void
  onIncomingTrade: null,  // (trade) => void
  onFriendAdded: null,    // (fromUid, {name, avatar}) => void
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
    _watchTrades();
    _watchFriendAdds();
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
// Push the player's current public profile (name/avatar/elo/real stats) to presence,
// plus their public collection (used for real friend profiles and trade browsing).
// Call this whenever the local profile changes (name edit, avatar change, ELO change,
// match results, equip changes).
function mpPushProfile() {
  if (!mp.ready && !mp.uid) return;
  let eqFloat = null, eqRarity = null;
  try {
    const eq = typeof equippedInstance === 'function' ? equippedInstance() : null;
    if (eq) {
      eqFloat = eq.float;
      eqRarity = (typeof getEmojiInfo === 'function' && getEmojiInfo(eq.e)) ? getEmojiInfo(eq.e).rarity : null;
    }
  } catch (e) { /* app.js not fully ready yet — presence stats stay best-effort */ }
  firebase.database().ref('presence/' + mp.uid).update({
    username: state.username,
    avatar: state.avatar,
    elo: state.elo,
    wins: state.wins || 0,
    games: state.games || 0,
    bestStreak: state.bestStreak || 0,
    tourneysWon: state.tourneysWon || 0,
    eqFloat, eqRarity,
    online: true,
    status: 'idle',
    lastSeen: firebase.database.ServerValue.TIMESTAMP,
  });
  mpPushCollection();
  mpPushBoxes();
}
// Push a compact public copy of the player's owned-emoji instances. Read by real
// friend profiles and the Trade page (to browse what a friend has to offer).
function mpPushCollection() {
  if (!mp.ready || typeof state === 'undefined') return;
  const compact = {};
  (state.ownedEmojis || []).forEach((inst) => {
    compact[inst.id] = { e: inst.e, float: inst.float, source: inst.source };
  });
  firebase.database().ref('collections/' + mp.uid).set(compact);
}
// Push a compact public copy of the player's UNOPENED boxes — lets friends see (and
// trade for) boxes you haven't opened yet.
function mpPushBoxes() {
  if (!mp.ready || typeof state === 'undefined') return;
  const compact = {};
  (state.unopenedBoxes || []).forEach((b) => {
    compact[b.id] = { boxId: b.boxId, ts: b.ts };
  });
  firebase.database().ref('boxes/' + mp.uid).set(compact);
}
// Live-watch another player's public collection (one-shot with ongoing updates).
// Returns the ref so the caller can .off() it when done. cb receives a plain
// {instanceId: {e, float, source}} map (empty object if they own nothing / not found).
function mpWatchCollection(uid, cb) {
  if (!mp.ready) return null;
  const ref = firebase.database().ref('collections/' + uid);
  ref.on('value', (snap) => cb(snap.val() || {}));
  return ref;
}
// Live-watch another player's public unopened-box inventory.
function mpWatchBoxes(uid, cb) {
  if (!mp.ready) return null;
  const ref = firebase.database().ref('boxes/' + uid);
  ref.on('value', (snap) => cb(snap.val() || {}));
  return ref;
}
// Fetch the top N real players by ELO (for the real online leaderboard). Falls back
// to an empty list (caller should use the synthetic leaderboard) if offline.
function mpFetchTopPlayers(limit, cb) {
  if (!mp.ready) { cb && cb([]); return; }
  firebase.database().ref('presence').orderByChild('elo').limitToLast(limit || 20).once('value', (snap) => {
    const list = [];
    snap.forEach((child) => {
      const v = child.val();
      if (v && v.username) list.push(Object.assign({ uid: child.key }, v));
    });
    list.reverse(); // limitToLast returns ascending — flip to descending (highest ELO first)
    cb && cb(list);
  }, () => cb && cb([]));
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

/* ---- MUTUAL FRIENDING ----
   Adding someone by their Friend Code only updated YOUR list — they had no way of
   knowing you'd added them, so they couldn't message/challenge you back until they
   separately added your code too. This mirrors the add: when A adds B, a small
   notice is left at friendAdds/{B}/{A} so B's client auto-adds A back next time
   B is online (whether that's the same session or a later one). */
function mpNotifyFriendAdd(toUid) {
  if (!mp.ready) return;
  firebase.database().ref('friendAdds/' + toUid + '/' + mp.uid).set({
    name: state.username, avatar: state.avatar,
    ts: firebase.database.ServerValue.TIMESTAMP,
  });
}
function _watchFriendAdds() {
  const ref = firebase.database().ref('friendAdds/' + mp.uid);
  ref.on('child_added', (snap) => {
    const fromUid = snap.key;
    const data = snap.val();
    if (fromUid && data) mp.onFriendAdded && mp.onFriendAdded(fromUid, data);
    // Ack/clear so it doesn't re-fire (as a fresh child_added) on every future session.
    snap.ref.remove();
  });
  mp._friendAddsRef = ref;
}

/* ---- RANDOM MATCHMAKING ---- */
function mpFindMatch(onFound, onError) {
  if (!mp.ready) { onError && onError('offline'); return; }
  mpSetStatus('searching');
  console.log('[multiplayer] searching for a match…');
  _enqueueSelf(onFound);
  _tryGrabFromQueue(onFound, onError);
  // Belt-and-suspenders: also re-check the queue every 2.5s while waiting, independent
  // of the live listener below. If the realtime listener ever misses an event for any
  // reason, this guarantees we still find a waiting opponent within a few seconds.
  mp._matchmakingPoll = setInterval(() => _tryGrabFromQueue(onFound, onError), 2500);
}
// One-shot attempt: look for anyone else waiting, and if found, try to claim them via
// an atomic transaction on THEIR queue node. Firebase transactions on a single node are
// inherently safe against double-claims — if the transaction doesn't commit with us as
// the claimant, someone else got there first (or they left), and we just keep waiting.
function _tryGrabFromQueue(onFound, onError) {
  if (!mp._queueListener) return; // already matched or search was cancelled
  const db = firebase.database();
  db.ref('queue').orderByChild('waiting').equalTo(true).limitToFirst(8).once('value', (snap) => {
    if (!mp._queueListener) return; // resolved while this round-trip was in flight
    let opponent = null;
    snap.forEach((child) => {
      if (child.key !== mp.uid && !opponent) opponent = Object.assign({ uid: child.key }, child.val());
    });
    if (!opponent) return;
    console.log('[multiplayer] candidate opponent found, attempting claim:', opponent.uid);
    db.ref('queue/' + opponent.uid).transaction((cur) => {
      if (cur && cur.waiting) {
        cur.waiting = false;
        cur.matchedWith = mp.uid;
        return cur;
      }
      return; // abort — someone else grabbed them first, or they left
    }, (err, committed, snap2) => {
      if (err) { console.error('[multiplayer] claim transaction failed:', err); return; }
      if (!mp._queueListener) return; // resolved via the other path while this was in flight
      if (committed && snap2.val() && snap2.val().matchedWith === mp.uid) {
        console.log('[multiplayer] claim succeeded — creating match with', opponent.uid);
        _stopMatchmakingWatchers();
        if (mp._queueListener) {
          mp._queueListener.ref.off('value', mp._queueListener.listener);
          mp._queueListener.ref.remove();
          mp._queueListener = null;
        }
        _createMatch(opponent, onFound);
      }
      // else: lost the race for this candidate — the poll/listener will try again.
    });
  }, (err) => {
    // Most likely cause: Realtime Database security rules haven't been (re)published
    // in the Firebase Console yet — editing the local rules file alone doesn't affect
    // the live project. See FIREBASE_SETUP.md.
    console.error('[multiplayer] queue read failed — check that database.rules.json has been published in the Firebase Console:', err);
    onError && onError('permission');
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
      console.log('[multiplayer] got claimed by an opponent — joining match', v.matchId);
      myQ.off('value', listener);
      myQ.remove();
      _stopMatchmakingWatchers();
      mpJoinMatch(v.matchId, 'p2', onFound);
    }
  });
  mp._queueListener = { ref: myQ, listener };
  // Live listener for fast reaction — covers the race where two players tap "Find
  // Match" within the same instant and each one's initial one-shot query missed the
  // other (neither had enqueued yet when the other's query ran). The poll above is
  // the fallback in case this ever misses an event.
  const watchRef = db.ref('queue').orderByChild('waiting').equalTo(true);
  const watchListener = watchRef.on('child_added', (snap) => {
    if (snap.key === mp.uid) return;
    if (!mp._queueListener) return;
    _tryGrabFromQueue(onFound, () => {});
  });
  mp._queueWatchRef = { ref: watchRef, listener: watchListener };
}
function _stopMatchmakingWatchers() {
  if (mp._queueWatchRef) {
    mp._queueWatchRef.ref.off('child_added', mp._queueWatchRef.listener);
    mp._queueWatchRef = null;
  }
  if (mp._matchmakingPoll) {
    clearInterval(mp._matchmakingPoll);
    mp._matchmakingPoll = null;
  }
}
function mpCancelSearch() {
  if (!mp.ready) return;
  _stopMatchmakingWatchers();
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
  }).catch((err) => {
    console.error('[multiplayer] failed to create match:', err);
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

/* ---- TRADING ----
   One-item-for-one-item offers between two online-linked players. Both sides
   trust the trade record (same pattern as invites) — reasonable for a casual
   game, not tamper-proof against a determined cheater. */
function _watchTrades() {
  const ref = firebase.database().ref('trades/' + mp.uid);
  ref.on('child_added', (snap) => {
    const t = snap.val();
    if (t && t.status === 'pending') {
      mp.onIncomingTrade && mp.onIncomingTrade(Object.assign({ id: snap.key }, t));
    }
  });
  mp._tradeRef = ref;
}
// offerItem/requestItem: { id, e, float } — the exact instance being offered / asked for.
function mpSendTradeOffer(toUid, offerItem, requestItem, onResult) {
  if (!mp.ready) { onResult && onResult('offline'); return; }
  const db = firebase.database();
  const tRef = db.ref('trades/' + toUid).push();
  tRef.set({
    fromUid: mp.uid, fromName: state.username, fromAvatar: state.avatar,
    offer: offerItem, request: requestItem,
    status: 'pending',
    createdAt: firebase.database.ServerValue.TIMESTAMP,
  });
  tRef.onDisconnect().remove();
  const listener = tRef.on('value', (snap) => {
    const v = snap.val();
    if (!v) return;
    if (v.status === 'accepted') {
      tRef.off('value', listener);
      tRef.remove();
      mp._pendingTrade = null;
      onResult && onResult('accepted', v);
    } else if (v.status === 'declined') {
      tRef.off('value', listener);
      tRef.remove();
      mp._pendingTrade = null;
      onResult && onResult('declined');
    }
  });
  mp._pendingTrade = { ref: tRef, listener };
  setTimeout(() => {
    if (mp._pendingTrade && mp._pendingTrade.ref.key === tRef.key) {
      tRef.off('value', listener);
      tRef.remove();
      mp._pendingTrade = null;
      onResult && onResult('timeout');
    }
  }, 30000);
}
// offerItems/requestItems: arrays of {type:'emoji'|'box', id, ...}. Returns a handle
// object with .cancel() — callers must keep it if they want to cancel THIS specific
// offer later (supports multiple concurrent outgoing offers, unlike a single global slot).
function mpSendTradeOffer(toUid, offerItems, requestItems, onResult) {
  if (!mp.ready) { onResult && onResult('offline'); return null; }
  const db = firebase.database();
  const tRef = db.ref('trades/' + toUid).push();
  tRef.set({
    fromUid: mp.uid, fromName: state.username, fromAvatar: state.avatar,
    offer: offerItems, request: requestItems,
    status: 'pending',
    createdAt: firebase.database.ServerValue.TIMESTAMP,
  });
  tRef.onDisconnect().remove();
  let settled = false;
  const listener = tRef.on('value', (snap) => {
    const v = snap.val();
    if (!v || settled) return;
    if (v.status === 'accepted') {
      settled = true;
      tRef.off('value', listener);
      tRef.remove();
      onResult && onResult('accepted', v);
    } else if (v.status === 'declined') {
      settled = true;
      tRef.off('value', listener);
      tRef.remove();
      onResult && onResult('declined');
    }
  });
  const timeoutId = setTimeout(() => {
    if (settled) return;
    settled = true;
    tRef.off('value', listener);
    tRef.remove();
    onResult && onResult('timeout');
  }, 30000);
  return {
    cancel() {
      if (settled) return;
      settled = true;
      clearTimeout(timeoutId);
      tRef.off('value', listener);
      tRef.remove();
    },
  };
}
function mpCancelTradeOffer(handle) {
  if (handle && typeof handle.cancel === 'function') handle.cancel();
}
// Recipient accepts — just flips the status; both sides apply the local swap
// once they observe 'accepted' (offerer via the listener above, accepter directly).
function mpAcceptTrade(t, onDone) {
  firebase.database().ref('trades/' + mp.uid + '/' + t.id).update({ status: 'accepted' }).then(() => {
    onDone && onDone();
    firebase.database().ref('trades/' + mp.uid + '/' + t.id).remove();
  });
}
function mpDeclineTrade(t) {
  firebase.database().ref('trades/' + mp.uid + '/' + t.id).update({ status: 'declined' });
}
