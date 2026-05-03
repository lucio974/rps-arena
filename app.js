/* RPS Arena - PWA app logic v3 */

const BOT_NAMES = [
  'undefeated','ultimate champion','worthy opponent','+aura','cant guess me',
  'high cortisol player','easy clap','u bad','delete game','noob farmer','rock',
  'deus ex machina','Big stress','always draw','queue busy huh?','case closed',
  'not regular','most normal','wrong pick','peak your mind','get cooked','your done',
  'fast win','him','so see through','free elo','too woke','pay to win','no chance',
  'nightmareish ai','read you so ez','always rock','rock believer','rock enthusiast',
  'rock intent','seer','rock most likely','say less'
];
const PVP_NAMES = ['Shadow_X','GrindKing','Nova_88','PixelWarrior','ThunderPaw','Ace_RPS','IronFist','Blaze_Pro','CryptoK','VoidWalker','RapidFire','CosmicG','NeonRune','SilverFox','MachoMan','BoltZero'];

// Challenge-locked emoji (special, removed from regular shop browse)
const ROCK_EMOJI = '🪨';

// Single PvP tier - one match option
const PVP_TIER = { label:'Ranked', entry:1, oppElo:1100, prize:3, bo:5 };

const ELO_TIERS = [
  { name:'Bronze',      min:0,    max:1000, color:'#cd7f32' },
  { name:'Silver',      min:1000, max:1200, color:'#c0c0c0' },
  { name:'Gold',        min:1200, max:1400, color:'#c9a84c' },
  { name:'Platinum',    min:1400, max:1600, color:'#7fbab0' },
  { name:'Diamond',     min:1600, max:1850, color:'#9ddffa' },
  { name:'Master',      min:1850, max:2100, color:'#a96bff' },
  { name:'Grandmaster', min:2100, max:9999, color:'#e24b4a' },
];

const DEFAULT_STATE = {
  username: 'Player',
  avatar: '😀',
  ownedEmojis: ['😀'],
  balance: 10,    // tokens
  elo: 1000,
  bestElo: 1000,        // highest ELO ever reached
  lowestElo: 1000,      // lowest ELO ever reached
  wins: 0,
  draws: 0,
  losses: 0,
  games: 0,
  earned: 0,      // tokens earned net
  bestStreak: 0,        // now: longest consecutive PvP-win streak
  currentPvpStreak: 0,  // current consecutive PvP wins
  pickRock: 0,
  pickPaper: 0,
  pickScissors: 0,
  tourneysWon: 0,
  history: [],
  tournaments: null,
  hasReset: false,
  lastRewardedStreak: 0,
  claimedChallenges: [], // ids of completed challenge claims (challenge emojis)
  // Daily free tokens
  lastDailyClaim: null,
  // Daily featured
  featuredDate: null,
  featuredBucket: null,  // 6-hour rotation key
  featuredEmojis: [],
  // Friends list (cosmetic only)
  friends: [],
  // Streak run state (persistent for a current run)
  currentStreakBot: null,
};

let state = loadState();
let runtime = {
  searchTimer: null,
  gameState: null,
  currentMode: 'pvp',
  activeTourney: null,
  activeTourneyMatchIdx: null,
  modalCb: null,
  shopCat: 'all',
  streakState: null,
};

function loadState() {
  try {
    const raw = localStorage.getItem('rps-arena-state-v3');
    if (raw) {
      const merged = { ...DEFAULT_STATE, ...JSON.parse(raw) };
      // Defensive: dedupe ownedEmojis in case earlier code paths added duplicates
      if (Array.isArray(merged.ownedEmojis)) {
        merged.ownedEmojis = Array.from(new Set(merged.ownedEmojis));
      }
      return merged;
    }
    // migrate v2
    const v2 = localStorage.getItem('rps-arena-state-v2');
    if (v2) {
      const old = JSON.parse(v2);
      const newBalance = Math.max(10, Math.floor((old.balance || 1000) / 100));
      return {
        ...DEFAULT_STATE,
        username: old.username || 'Player',
        avatar: old.avatar || '😀',
        ownedEmojis: Array.from(new Set((old.ownedEmojis || ['😀']).filter(e => e !== '🪨'))),
        balance: newBalance,
        elo: old.elo || 1000,
        wins: old.wins || 0,
        games: old.games || 0,
        earned: 0,
        bestStreak: old.bestStreak || 0,
        tourneysWon: old.tourneysWon || 0,
        history: [],
      };
    }
  } catch(e) {}
  return { ...DEFAULT_STATE };
}
function saveState() {
  try { localStorage.setItem('rps-arena-state-v3', JSON.stringify(state)); } catch(e) {}
}

function rnd(arr){return arr[Math.floor(Math.random()*arr.length)]}
function rps(){return rnd(['rock','paper','scissors'])}
function beats(a,b){return(a==='rock'&&b==='scissors')||(a==='paper'&&b==='rock')||(a==='scissors'&&b==='paper')}
function botName(){return rnd(BOT_NAMES)}
function pvpName(){return rnd(PVP_NAMES)}

// Random bot avatar - excludes Rock (challenge-locked)
function randomBotEmoji() {
  const pool = EMOJI_CATALOG.filter(e => e.e !== ROCK_EMOJI);
  return pool[Math.floor(Math.random() * pool.length)].e;
}

// Random opponent ELO near the player's rating, for PvP display
function randomOppEloNear(playerElo) {
  // ±150 range, but never below 100
  const variance = Math.floor(Math.random() * 301) - 150; // -150 to +150
  return Math.max(100, playerElo + variance);
}

function getTier(elo) {
  for (const t of ELO_TIERS) {
    if (elo >= t.min && elo < t.max) return t;
  }
  return ELO_TIERS[ELO_TIERS.length - 1];
}

/* FEATURED ROTATION (now tap-to-cycle; initial seed only if empty) */
function todayKey() {
  // Used for daily-token-claim and friend online-status seeding (still day-grained).
  const d = new Date();
  return d.getFullYear() + '-' + (d.getMonth()+1) + '-' + d.getDate();
}
// Pick 4 unique emojis from a pool using a custom rng function (rng() -> [0,1)).
function _pickFeaturedFromPool(pool, rng) {
  const picks = [];
  const seen = new Set();
  let safety = 0;
  while (picks.length < 4 && seen.size < pool.length && safety < 500) {
    const idx = Math.floor(rng() * pool.length);
    if (!seen.has(idx)) { seen.add(idx); picks.push(pool[idx].e); }
    safety++;
  }
  return picks;
}
// Initial seed (and validity check). Only seeds if there's no current selection or any
// cached emoji is now invalid (e.g. became challenge-locked). After tap-to-cycle is used,
// the user's manual selection is preserved across renders/sessions.
function refreshFeatured() {
  const pool = getShopPool();
  if (state.featuredEmojis && state.featuredEmojis.length === 4) {
    const allowed = new Set(pool.map(e => e.e));
    if (state.featuredEmojis.every(e => allowed.has(e))) return;
  }
  // Seed once from a stable per-day key
  const seed = todayKey().split('-').reduce((a,b) => a + parseInt(b), 0);
  let s = seed;
  const rng = () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
  state.featuredEmojis = _pickFeaturedFromPool(pool, rng);
  saveState();
}
// Tap to cycle: replaces the current selection with 4 fresh random picks.
function cycleFeatured() {
  const pool = getShopPool();
  if (pool.length === 0) return;
  state.featuredEmojis = _pickFeaturedFromPool(pool, Math.random);
  saveState();
  renderFeatured();
  if (navigator.vibrate) navigator.vibrate(10);
}

/* CHALLENGES */
function checkRockUnlocked() {
  return state.tourneysWon >= 5 && state.bestStreak >= 10;
}

function showView(id) {
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
  const target = document.getElementById('view-' + id);
  if (target) target.classList.add('active');
  const idx = { lobby: 0, profile: 1, history: 2, shop: 3 }[id];
  if (idx !== undefined) document.querySelectorAll('.nav-btn')[idx].classList.add('active');
  document.querySelector('.view-wrap').scrollTop = 0;
  if (id === 'lobby') hideLobbySections();
  // Hide header + nav when in game view
  const app = document.getElementById('app');
  if (id === 'game') app.classList.add('in-game');
  else app.classList.remove('in-game');
  updateHeader();
}

function showLobbySection(name) {
  document.getElementById('lobby-pvp').style.display = name === 'pvp' ? 'flex' : 'none';
  document.getElementById('lobby-tourney').style.display = name === 'tourney' ? 'flex' : 'none';
  document.getElementById('lobby-bracket').style.display = 'none';
  document.getElementById('pvp-searching').style.display = 'none';
  if (name === 'pvp') renderPvpInfo();
  if (name === 'tourney') renderTourneyList();
  setTimeout(() => {
    const el = document.getElementById('lobby-' + name);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, 50);
}

function hideLobbySections() {
  document.getElementById('lobby-pvp').style.display = 'none';
  document.getElementById('lobby-tourney').style.display = 'none';
  document.getElementById('lobby-bracket').style.display = 'none';
  document.getElementById('pvp-searching').style.display = 'none';
}

function updateBalance() { document.getElementById('balance-display').textContent = state.balance; saveState(); }

function updateHeader() {
  document.getElementById('header-avatar').textContent = state.avatar;
  document.getElementById('header-name').textContent = state.username.toUpperCase();
  const bsm = document.getElementById('best-streak-mini');
  if (bsm) bsm.textContent = state.bestStreak;
  const fc = document.getElementById('friends-count-mini');
  if (fc) fc.textContent = (state.friends || []).length;
  const soc = document.getElementById('shop-owned-count');
  if (soc) soc.textContent = state.ownedEmojis.length;
  renderEloHero();
}

function renderEloHero() {
  const tier = getTier(state.elo);
  document.documentElement.style.setProperty('--rank-color', tier.color);
  const tn = document.getElementById('elo-tier-name');
  if (tn) {
    tn.textContent = tier.name;
    tn.style.color = tier.color;
  }
  const er = document.getElementById('elo-rating');
  if (er) er.textContent = state.elo;
  const range = tier.max - tier.min;
  const into = Math.max(0, Math.min(state.elo - tier.min, range));
  const pct = range > 0 ? (into / range * 100) : 100;
  const fill = document.getElementById('elo-progress-fill');
  if (fill) fill.style.width = pct + '%';
  const tmin = document.getElementById('elo-tier-min');
  if (tmin) tmin.textContent = tier.name;
  const nextIdx = ELO_TIERS.indexOf(tier) + 1;
  const tmax = document.getElementById('elo-tier-max');
  if (tmax) tmax.textContent = nextIdx < ELO_TIERS.length ? ELO_TIERS[nextIdx].name : 'MAX';
}

function toast(msg) {
  const t = document.getElementById('toast');
  t.innerHTML = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 2400);
}

/* PvP single match info card */
function renderPvpInfo() {
  const t = PVP_TIER;
  const eloUp = calculateEloChange(state.elo, t.oppElo, true, false);
  const eloDown = calculateEloChange(state.elo, t.oppElo, false, false);
  document.getElementById('pvp-prize-display').textContent = '▣ ' + t.prize;
  document.getElementById('pvp-entry-display').textContent = `Entry: ${t.entry} token${t.entry>1?'s':''} · First to ${Math.ceil(t.bo / 2)} wins`;
  document.getElementById('pvp-elo-up').textContent = '+' + eloUp;
  document.getElementById('pvp-elo-down').textContent = eloDown;
}

function startFindMatch() {
  const tier = PVP_TIER;
  const e = document.getElementById('pvp-error');
  if (state.balance < tier.entry) {
    e.textContent = `Not enough tokens! Need ${tier.entry}.`;
    e.style.display = 'block';
    return;
  }
  e.style.display = 'none';
  state.balance -= tier.entry; updateBalance();
  document.getElementById('lobby-pvp').style.display = 'none';
  document.getElementById('pvp-searching').style.display = 'block';
  document.getElementById('search-entry-display').textContent = tier.entry + (tier.entry>1?' tokens':' token');
  runtime.searchTimer = setTimeout(() => {
    // For PvP, randomize opponent ELO near the player's rating to feel like real matchmaking
    const oppElo = randomOppEloNear(state.elo);
    const oppEmoji = randomBotEmoji();
    startGame('pvp', tier.entry, tier.prize, botName(), oppEmoji, tier.bo, oppElo);
  }, Math.random() * 2000 + 1200);
}

function cancelSearch() {
  clearTimeout(runtime.searchTimer);
  state.balance += PVP_TIER.entry; updateBalance();
  document.getElementById('pvp-searching').style.display = 'none';
  document.getElementById('lobby-pvp').style.display = 'flex';
  toast('Entry refunded');
}

function startGame(mode, entry, prize, oppN, oppAvatar='🤖', bo=3, oppElo=1000) {
  runtime.currentMode = mode;
  runtime.gameState = { entry, prize, opp: oppN, oppAvatar, scoreYou: 0, scoreOpp: 0, round: 1, bo, done: false, oppElo, youPicks: [], oppPicks: [], outcomes: [] };
  // Clear pick-history widget
  const ph = document.getElementById('pick-history');
  if (ph) ph.innerHTML = '';
  document.getElementById('opp-name').textContent = oppN;
  document.getElementById('opp-avatar').textContent = oppAvatar;
  document.getElementById('you-avatar').textContent = state.avatar;
  document.getElementById('you-name').textContent = state.username;
  document.getElementById('score-you').textContent = 0;
  document.getElementById('score-opp').textContent = 0;
  document.getElementById('stake-label').textContent = entry > 0
    ? entry + ' token entry'
    : (mode === 'streak' ? 'Streak Run' : 'Free play');
  const winThreshold = Math.ceil(bo / 2);
  document.getElementById('round-label').textContent = 'First to ' + winThreshold + ' wins';
  document.getElementById('round-info').textContent = 'Round 1 — first to ' + winThreshold + ' wins';
  document.getElementById('choice-you').textContent = '?';
  document.getElementById('choice-opp').textContent = '?';
  document.getElementById('choice-you').classList.remove('reveal');
  document.getElementById('choice-opp').classList.remove('reveal');
  document.getElementById('round-result').textContent = '';
  document.getElementById('round-result').className = 'choice-result';
  closeResultPopup();
  ['btn-rock','btn-paper','btn-scissors'].forEach(id => document.getElementById(id).disabled = false);

  // Show ELO during PvP matches only
  const youEloEl = document.getElementById('you-elo');
  const oppEloEl = document.getElementById('opp-elo');
  if (mode === 'pvp') {
    youEloEl.style.display = 'block';
    oppEloEl.style.display = 'block';
    youEloEl.querySelector('.num').textContent = state.elo;
    oppEloEl.querySelector('.num').textContent = oppElo;
  } else {
    youEloEl.style.display = 'none';
    oppEloEl.style.display = 'none';
  }

  const streakHud = document.getElementById('streak-hud');
  if (mode === 'streak') {
    streakHud.style.display = 'flex';
    document.getElementById('streak-current').textContent = runtime.streakState.current;
    document.getElementById('streak-best').textContent = state.bestStreak;
    document.querySelectorAll('#strike-dots .strike-dot').forEach((d, i) => {
      d.classList.toggle('filled', i < runtime.streakState.strikes);
    });
  } else {
    streakHud.style.display = 'none';
  }
  showView('game');
}

function play(choice) {
  const g = runtime.gameState; if (!g || g.done) return;
  ['btn-rock','btn-paper','btn-scissors'].forEach(id => document.getElementById(id).disabled = true);
  const emojis = { rock: '✊', paper: '🖐', scissors: '✌️' };
  const oppChoice = rps();

  // Track picks for this match (visual history) and globally (profile stats)
  if (!g.youPicks) g.youPicks = [];
  if (!g.oppPicks) g.oppPicks = [];
  g.youPicks.push(choice);
  g.oppPicks.push(oppChoice);
  if (choice === 'rock')     state.pickRock = (state.pickRock || 0) + 1;
  if (choice === 'paper')    state.pickPaper = (state.pickPaper || 0) + 1;
  if (choice === 'scissors') state.pickScissors = (state.pickScissors || 0) + 1;

  const youEl = document.getElementById('choice-you');
  const oppEl = document.getElementById('choice-opp');
  youEl.textContent = emojis[choice];
  youEl.classList.add('reveal');
  if (navigator.vibrate) navigator.vibrate(8);

  setTimeout(() => {
    oppEl.textContent = emojis[oppChoice];
    oppEl.classList.add('reveal');
    const rr = document.getElementById('round-result');
    let outcome; // 'W' | 'L' | 'D'
    if (choice === oppChoice) { rr.textContent = 'DRAW'; rr.className = 'choice-result draw'; outcome = 'D'; }
    else if (beats(choice, oppChoice)) { g.scoreYou++; rr.textContent = 'WIN'; rr.className = 'choice-result win'; outcome = 'W'; if(navigator.vibrate)navigator.vibrate([20,30,20]); }
    else { g.scoreOpp++; rr.textContent = 'LOSE'; rr.className = 'choice-result lose'; outcome = 'L'; if(navigator.vibrate)navigator.vibrate(40); }
    if (!g.outcomes) g.outcomes = [];
    g.outcomes.push(outcome);
    document.getElementById('score-you').textContent = g.scoreYou;
    document.getElementById('score-opp').textContent = g.scoreOpp;
    renderPickHistory(g);
    const winThreshold = Math.ceil(g.bo / 2);
    // Match ends ONLY when one side reaches the win threshold.
    // Draws extend the match past the original `bo` round cap if necessary.
    const over = g.scoreYou >= winThreshold || g.scoreOpp >= winThreshold;
    if (over) {
      setTimeout(() => endGame(g), 700);
    } else {
      g.round++;
      document.getElementById('round-info').textContent = 'Round ' + g.round + ' — first to ' + Math.ceil(g.bo / 2) + ' wins';
      setTimeout(() => {
        youEl.textContent = '?'; youEl.classList.remove('reveal');
        oppEl.textContent = '?'; oppEl.classList.remove('reveal');
        rr.textContent = '';
        ['btn-rock','btn-paper','btn-scissors'].forEach(id => document.getElementById(id).disabled = false);
      }, 850);
    }
  }, 450);
}

// Render a small row showing past picks for this match (per side, dimmed by outcome).
function renderPickHistory(g) {
  const wrap = document.getElementById('pick-history');
  if (!wrap) return;
  const emojis = { rock: '✊', paper: '🖐', scissors: '✌️' };
  const youPicks = g.youPicks || [];
  const oppPicks = g.oppPicks || [];
  const outcomes = g.outcomes || [];
  // outcomes[i] is YOUR result in round i (W/L/D). For your row, color by outcome;
  // for opponent row, flip (your W = their L).
  const you = youPicks.map((p, i) => {
    const o = outcomes[i] || '';
    const cls = o === 'W' ? 'win' : o === 'L' ? 'lose' : o === 'D' ? 'draw' : '';
    return `<span class="pick-cell ${cls}" title="Round ${i+1}">${emojis[p] || '?'}</span>`;
  }).join('');
  const opp = oppPicks.map((p, i) => {
    const o = outcomes[i] || '';
    const flipped = o === 'W' ? 'L' : o === 'L' ? 'W' : o;
    const cls = flipped === 'W' ? 'win' : flipped === 'L' ? 'lose' : flipped === 'D' ? 'draw' : '';
    return `<span class="pick-cell ${cls}" title="Round ${i+1}">${emojis[p] || '?'}</span>`;
  }).join('');
  wrap.innerHTML = `
    <div class="pick-row" aria-label="Your past picks"><span class="pick-row-label">You</span><div class="pick-row-cells">${you}</div></div>
    <div class="pick-row" aria-label="Opponent past picks"><span class="pick-row-label">${(g.opp || 'Opp').slice(0,10)}</span><div class="pick-row-cells">${opp}</div></div>
  `;
}

function calculateEloChange(playerElo, oppElo, won, draw) {
  const K = 32;
  const expected = 1 / (1 + Math.pow(10, (oppElo - playerElo) / 400));
  const actual = won ? 1 : draw ? 0.5 : 0;
  return Math.round(K * (actual - expected));
}

function showResultPopup(type, opts) {
  const overlay = document.getElementById('result-popup-overlay');
  const popup = document.getElementById('result-popup');
  popup.className = 'result-popup ' + type;
  document.getElementById('result-title').textContent = opts.title || '';
  document.getElementById('result-detail').innerHTML = opts.detail || '';
  const eloEl = document.getElementById('elo-change-display');
  if (opts.eloDelta !== undefined && opts.eloDelta !== null && opts.eloDelta !== 0) {
    eloEl.textContent = (opts.eloDelta > 0 ? '+' : '') + opts.eloDelta + ' ELO';
    eloEl.className = 'elo-change ' + (opts.eloDelta > 0 ? 'up' : 'down');
  } else {
    eloEl.textContent = '';
  }
  document.getElementById('reward-pop-area').innerHTML = opts.reward || '';
  document.getElementById('result-actions').innerHTML = opts.actions || '<button onclick="leaveGame()">Back to Lobby</button>';
  overlay.classList.add('open');
}
function closeResultPopup() {
  document.getElementById('result-popup-overlay').classList.remove('open');
}

function endGame(g) {
  g.done = true;
  const won = g.scoreYou > g.scoreOpp;
  const draw = g.scoreYou === g.scoreOpp;
  state.games++;
  let delta = 0;
  let eloDelta = 0;

  if (runtime.currentMode === 'pvp') {
    eloDelta = calculateEloChange(state.elo, g.oppElo, won, draw);
    state.elo = Math.max(0, state.elo + eloDelta);
    // Track ELO extremes
    if (state.elo > (state.bestElo || 0)) state.bestElo = state.elo;
    if (state.elo < (state.lowestElo === undefined ? state.elo : state.lowestElo)) state.lowestElo = state.elo;

    let title, detail, type;
    if (won) {
      state.wins++;
      // Consecutive PvP win streak (still tracked for stats and challenges, but no bonus)
      state.currentPvpStreak = (state.currentPvpStreak || 0) + 1;
      if (state.currentPvpStreak > (state.bestStreak || 0)) state.bestStreak = state.currentPvpStreak;
      delta = g.prize;
      state.balance += g.prize; state.earned += g.prize;
      type = 'win';
      title = 'YOU WIN!';
      detail = `+${g.prize} tokens added to wallet`;
      if (navigator.vibrate) navigator.vibrate([30, 50, 30, 50, 30]);
    } else if (draw) {
      state.draws = (state.draws || 0) + 1;
      // Draw doesn't break the win streak — only losses do
      delta = g.entry;
      state.balance += g.entry;
      type = 'draw';
      title = 'DRAW';
      detail = 'Entry refunded';
    } else {
      state.losses = (state.losses || 0) + 1;
      state.currentPvpStreak = 0;
      type = 'lose';
      title = 'DEFEATED';
      detail = `-${g.entry} token${g.entry>1?'s':''} lost`;
      delta = -g.entry;
      if (navigator.vibrate) navigator.vibrate(80);
    }

    state.history.unshift({
      opp: g.opp, oppAvatar: g.oppAvatar,
      result: won ? 'W' : draw ? 'D' : 'L',
      score: g.scoreYou + '-' + g.scoreOpp,
      eloDelta, mode: 'PvP',
      youElo: state.elo, oppElo: g.oppElo,
      time: new Date().toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }),
    });
    if (state.history.length > 100) state.history = state.history.slice(0, 100);

    updateBalance();
    saveState();
    updateHeader();
    // Big Brain (and other live-progress challenges) — refresh if shop is currently active.
    // In normal flow the shop isn't visible during a match (game view replaces it), but if
    // a result popup is dismissed back to shop, this keeps progress bars in sync.
    if (document.getElementById('view-shop').classList.contains('active')) {
      renderChallenges();
    }
    showResultPopup(type, { title, detail, eloDelta });
  } else if (runtime.currentMode === 'streak') {
    handleStreakEnd(won, draw);
  } else if (runtime.currentMode === 'tourney') {
    let type, title, detail, actions;
    if (won) {
      state.wins++;
      type = 'win'; title = 'ADVANCED!'; detail = 'You move on in the bracket';
      actions = '<button class="primary" onclick="closeResultPopup();onTourneyMatchContinue(true)">Continue</button>';
    } else if (draw) {
      // Tied at 1-1 in best-of-3 means we need a tiebreak rematch
      type = 'draw'; title = 'TIED'; detail = 'Replaying for the tiebreak…';
      actions = '<button class="primary" onclick="closeResultPopup();rematchTourneyDraw()">Rematch</button>';
    } else {
      type = 'lose'; title = 'ELIMINATED'; detail = 'Your tournament run ends here';
      actions = '<button class="primary" onclick="closeResultPopup();onTourneyMatchContinue(false)">Continue</button>';
    }
    // Only record history for decisive results (not for tiebreak draws — those replay)
    if (!draw) {
      state.history.unshift({
        opp: g.opp, oppAvatar: g.oppAvatar,
        result: won ? 'W' : 'L',
        score: g.scoreYou + '-' + g.scoreOpp,
        eloDelta: 0, mode: 'Tourney',
        time: new Date().toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }),
      });
      if (state.history.length > 100) state.history = state.history.slice(0, 100);
    }
    saveState();
    showResultPopup(type, { title, detail, actions });
  }
}

/* Tourney draw rematch — restart the same match keeping opponent identity */
function rematchTourneyDraw() {
  const g = runtime.gameState;
  if (!g) return;
  // Don't double-count the draw as a played game
  state.games = Math.max(0, state.games - 1);
  saveState();
  startGame('tourney', g.entry, g.prize, g.opp, g.oppAvatar, g.bo, g.oppElo);
}

/* ---- STREAK MODE ---- */
function startStreakRun() {
  state.currentStreakBot = botName();
  saveState();
  // Pick a random emoji for this run's bot
  runtime.streakState = { current: 0, strikes: 0, gamesInRun: 0, botEmoji: randomBotEmoji() };
  startStreakMatch();
}

function startStreakMatch() {
  const oppEmoji = (runtime.streakState && runtime.streakState.botEmoji) || randomBotEmoji();
  startGame('streak', 0, 0, state.currentStreakBot || botName(), oppEmoji, 3);
}

function handleStreakEnd(won, draw) {
  const ss = runtime.streakState;
  ss.gamesInRun = (ss.gamesInRun || 0);

  state.games--;

  let type, title, detail, actions;
  if (won) {
    ss.current++;
    let newRecord = false;
    if (ss.current > state.bestStreak) {
      state.bestStreak = ss.current;
      newRecord = true;
    }

    let rewardEmoji = null;
    if (newRecord && ss.current >= 5 && ss.current > state.lastRewardedStreak) {
      const unowned = getShopPool().filter(em => !state.ownedEmojis.includes(em.e));
      if (unowned.length > 0) {
        let pool = unowned;
        if (ss.current >= 15) {
          const legendary = unowned.filter(e => e.rarity === 'legendary');
          if (legendary.length && Math.random() < 0.5) pool = legendary;
        } else if (ss.current >= 10) {
          const epicOrBetter = unowned.filter(e => e.rarity === 'epic' || e.rarity === 'legendary');
          if (epicOrBetter.length && Math.random() < 0.6) pool = epicOrBetter;
        } else if (ss.current >= 7) {
          const rareOrBetter = unowned.filter(e => e.rarity !== 'common');
          if (rareOrBetter.length && Math.random() < 0.6) pool = rareOrBetter;
        }
        const reward = pool[Math.floor(Math.random() * pool.length)];
        state.ownedEmojis.push(reward.e);
        state.lastRewardedStreak = ss.current;
        rewardEmoji = reward;
      }
    }

    type = 'win';
    title = 'STREAK ' + ss.current + '!';
    detail = newRecord ? '🔥 New personal best!' : (ss.strikes === 0 ? 'Clean run.' : '1 strike still on the clock.');
    actions = `
      <button class="primary" onclick="closeResultPopup();continueStreak()">Next Match →</button>
      <button onclick="closeResultPopup();endStreakRun()">End Run</button>
    `;
    const reward = rewardEmoji ? `
      <div class="reward-pop">
        <span class="emoji-big">${rewardEmoji.e}</span>
        <strong>New emoji unlocked: ${rewardEmoji.name}</strong><br>
        <span style="font-size:11px;color:var(--muted)">Equip from your shop</span>
      </div>` : '';
    if (rewardEmoji && navigator.vibrate) navigator.vibrate([40, 60, 40, 60, 80]);
    showResultPopup(type, { title, detail, reward, actions });
  } else {
    if (!draw) ss.strikes++;
    if (ss.strikes >= 2) {
      state.games++;
      saveState();
      state.history.unshift({
        opp: state.currentStreakBot,
        oppAvatar: ss.botEmoji || '🤖',
        result: ss.current > 0 ? 'W' : 'L',
        score: 'Streak: ' + ss.current,
        eloDelta: 0, mode: 'Streak',
        time: new Date().toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }),
      });
      if (state.history.length > 100) state.history = state.history.slice(0, 100);
      type = 'lose';
      title = 'RUN OVER';
      detail = `Final streak: <strong>${ss.current}</strong>` + (state.bestStreak === ss.current && ss.current > 0 ? '<br>🔥 New personal best!' : '');
      actions = `
        <button class="primary" onclick="closeResultPopup();startStreakRun()">New Run</button>
        <button onclick="closeResultPopup();endStreakRun()">Back to Lobby</button>
      `;
      saveState();
      showResultPopup(type, { title, detail, actions });
    } else {
      type = draw ? 'draw' : 'lose';
      title = draw ? 'DRAW' : 'STRIKE 1';
      detail = draw ? 'No strike. Streak protected.' : `Streak ${ss.current} held. One more loss ends the run.`;
      actions = `
        <button class="primary" onclick="closeResultPopup();continueStreak()">Next Match →</button>
        <button onclick="closeResultPopup();endStreakRun()">End Run</button>
      `;
      saveState();
      showResultPopup(type, { title, detail, actions });
    }
  }
  saveState();
  updateHeader();
}

function continueStreak() { startStreakMatch(); }
function endStreakRun() {
  runtime.streakState = null;
  state.currentStreakBot = null;
  saveState();
  showView('lobby');
}

function leaveGame() {
  closeResultPopup();
  const g = runtime.gameState;
  const isForfeit = g && !g.done;

  if (isForfeit && runtime.currentMode === 'pvp') {
    // Forfeit a PvP match: count it as a full loss. No token refund (entry already deducted).
    // Apply ELO loss as if you lost the match.
    g.done = true;
    state.games++;
    state.losses = (state.losses || 0) + 1;
    state.currentPvpStreak = 0;
    const eloDelta = calculateEloChange(state.elo, g.oppElo, false, false);
    state.elo = Math.max(0, state.elo + eloDelta);
    if (state.elo < (state.lowestElo === undefined ? state.elo : state.lowestElo)) state.lowestElo = state.elo;

    state.history.unshift({
      opp: g.opp, oppAvatar: g.oppAvatar,
      result: 'L',
      score: 'Forfeit',
      eloDelta, mode: 'PvP',
      youElo: state.elo, oppElo: g.oppElo,
      time: new Date().toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }),
    });
    if (state.history.length > 100) state.history = state.history.slice(0, 100);

    saveState();
    updateBalance();
    updateHeader();
    toast('Forfeited — no refund · ' + eloDelta + ' ELO');
    showView('lobby');
    return;
  }

  if (isForfeit && runtime.currentMode === 'tourney') {
    // Forfeit a tournament match: register as elimination via the existing flow.
    g.done = true;
    onTourneyMatchContinue(false);
    return;
  }

  // Normal cleanup paths (game already ended)
  if (runtime.currentMode === 'tourney') showLobbyBracket(runtime.activeTourney);
  else if (runtime.currentMode === 'streak') endStreakRun();
  else showView('lobby');
}

/* ---- TOURNAMENTS ---- */
const TOURNEY_TEMPLATES = [
  { name: 'Mystery Emoji Cup', entry: 10, prize: 0, slots: 4, special: 'emoji', bo: 3 },
  { name: 'Beginner Bash',  entry: 1,  prize: 6,  slots: 7, special: false, bo: 3 },
  { name: 'Weekend Brawl',  entry: 2,  prize: 12, slots: 5, special: false, bo: 3 },
  { name: 'Coin Clashers',  entry: 3,  prize: 20, slots: 6, special: false, bo: 3 },
  { name: 'Elite Cup',      entry: 5,  prize: 35, slots: 3, special: false, bo: 3 },
];

function initTourneys() {
  if (!state.tournaments || !state.tournaments.length) {
    state.tournaments = TOURNEY_TEMPLATES.map((t, i) => ({
      ...t, id: i, joined: false, bracket: null, complete: false,
    }));
    saveState();
  } else {
    // Migrate: re-order template tournaments to match TOURNEY_TEMPLATES while preserving
    // user state by name. Hosted (user-created) tournaments are kept as-is and appended.
    const byName = {};
    const hosted = [];
    for (const t of state.tournaments) {
      if (t.hosted) hosted.push(t);
      else byName[t.name] = t;
    }
    const migrated = TOURNEY_TEMPLATES.map((tpl, i) => {
      const existing = byName[tpl.name];
      if (existing) {
        return {
          ...tpl,                         // refresh template fields (entry/prize/special)
          id: i,                          // new id position
          joined: !!existing.joined,
          bracket: existing.bracket || null,
          complete: !!existing.complete,
          slots: existing.slots !== undefined ? existing.slots : tpl.slots,
        };
      }
      return { ...tpl, id: i, joined: false, bracket: null, complete: false };
    });
    // Append hosted; ids match array index for compatibility with state.tournaments[id] lookups
    state.tournaments = migrated.concat(hosted);
    state.tournaments.forEach((t, i) => { t.id = i; });
    saveState();
  }
}

/* ---- HOST TOURNAMENT (user-created bracket) ---- */
// Round options. Entry = round count tokens; prize = entry * 8 (full pool refund-style economy).
const HOST_BO_OPTIONS = [
  { bo: 3, label: 'Best of 3' },
  { bo: 5, label: 'Best of 5' },
  { bo: 7, label: 'Best of 7' },
];
let _hostBoSelected = 3; // remembered between modal opens
let _hostInvitesSelected = []; // array of friend indices into state.friends
const HOST_INVITE_MAX = 7; // 7 NPC slots besides you

function openHostTourneyModal() {
  _hostBoSelected = 3;
  _hostInvitesSelected = [];
  renderHostBoGrid();
  renderHostInvites();
  document.getElementById('host-tourney-modal').classList.add('open');
}
function closeHostTourneyModal() {
  document.getElementById('host-tourney-modal').classList.remove('open');
}
function renderHostBoGrid() {
  const grid = document.getElementById('host-bo-grid');
  grid.innerHTML = HOST_BO_OPTIONS.map(opt => {
    const entry = opt.bo;
    const prize = opt.bo * 8;
    const sel = opt.bo === _hostBoSelected ? 'selected' : '';
    return `
      <div class="host-bo-opt ${sel}" onclick="selectHostBo(${opt.bo})">
        <div class="host-bo-opt-bo">First to ${Math.ceil(opt.bo / 2)}</div>
        <div class="host-bo-opt-prize">▣ ${prize}</div>
        <div class="host-bo-opt-entry">Entry: ${entry}</div>
      </div>
    `;
  }).join('');
  const sel = HOST_BO_OPTIONS.find(o => o.bo === _hostBoSelected);
  document.getElementById('host-tourney-confirm').textContent = `Host (▣ ${sel.bo})`;
}
function selectHostBo(bo) {
  _hostBoSelected = bo;
  renderHostBoGrid();
}
function renderHostInvites() {
  const list = document.getElementById('host-invites');
  const hint = document.getElementById('host-invites-hint');
  const friends = state.friends || [];
  const selectedCount = _hostInvitesSelected.length;
  hint.textContent = `(${selectedCount}/${HOST_INVITE_MAX} selected)`;
  if (friends.length === 0) {
    list.innerHTML = '<div class="host-invites-empty">No friends yet — add some from the Friends tab to invite them.</div>';
    return;
  }
  const atCap = selectedCount >= HOST_INVITE_MAX;
  list.innerHTML = friends.map((f, idx) => {
    const isSelected = _hostInvitesSelected.includes(idx);
    const cls = 'host-invite-item' +
      (isSelected ? ' selected' : '') +
      (!isSelected && atCap ? ' disabled' : '');
    return `
      <div class="${cls}" onclick="toggleHostInvite(${idx})">
        <div class="host-invite-avatar">${f.avatar || '🤖'}</div>
        <div class="host-invite-name">${f.name}</div>
        <div class="host-invite-check">${isSelected ? '✓' : ''}</div>
      </div>
    `;
  }).join('');
}
function toggleHostInvite(idx) {
  const at = _hostInvitesSelected.indexOf(idx);
  if (at >= 0) {
    _hostInvitesSelected.splice(at, 1);
  } else {
    if (_hostInvitesSelected.length >= HOST_INVITE_MAX) {
      toast('Max ' + HOST_INVITE_MAX + ' friends — uncheck one first');
      return;
    }
    _hostInvitesSelected.push(idx);
  }
  renderHostInvites();
}
function hostTournamentConfirm() {
  const opt = HOST_BO_OPTIONS.find(o => o.bo === _hostBoSelected);
  if (!opt) return;
  const entry = opt.bo;
  const prize = opt.bo * 8;
  if (state.balance < entry) {
    toast('Not enough tokens! Need ' + entry + '.');
    return;
  }
  state.balance -= entry;
  // Resolve invited friends to {name, avatar} pairs from current friend list
  const invitedFriends = _hostInvitesSelected
    .map(i => state.friends && state.friends[i])
    .filter(Boolean)
    .slice(0, HOST_INVITE_MAX)
    .map(f => ({ name: f.name, avatar: f.avatar || '🤖' }));
  // Find a unique name for the new tournament
  initTourneys();
  const existingHosted = (state.tournaments || []).filter(t => t.hosted).length;
  const t = {
    name: 'Your Tournament #' + (existingHosted + 1),
    entry, prize,
    slots: 0,                        // private; you and 7 AI/friends
    special: false,
    hosted: true,
    bo: opt.bo,
    joined: true,
    complete: false,
    invitedFriends, // persisted so bracket avatars resolve correctly later
  };
  // Build bracket (uses invitedFriends names) and assign id
  t.bracket = buildBracket(t);
  state.tournaments.push(t);
  state.tournaments.forEach((tt, i) => { tt.id = i; });
  saveState();
  updateBalance();
  closeHostTourneyModal();
  const inviteMsg = invitedFriends.length > 0
    ? ` (${invitedFriends.length} friend${invitedFriends.length > 1 ? 's' : ''} invited)`
    : '';
  toast('Tournament hosted!' + inviteMsg);
  // Jump straight to the bracket
  renderTourneyList();
  setTimeout(() => showLobbyBracket(t.id), 150);
}

function renderTourneyList() {
  initTourneys();
  const el = document.getElementById('tourney-list');
  el.innerHTML = state.tournaments.map(t => {
    const status = t.complete ? '<span style="font-size:10px;background:rgba(136,136,136,.2);color:var(--muted);padding:2px 6px;border-radius:3px">DONE</span>'
      : t.joined ? '<span style="font-size:10px;background:rgba(201,168,76,.2);color:var(--gold);padding:2px 6px;border-radius:3px">JOINED</span>' : '';
    const specialBadge = t.special === 'emoji' ? '<span style="font-size:10px;background:rgba(169,107,255,.2);color:var(--epic);padding:2px 6px;border-radius:3px">SPECIAL</span>' : '';
    const hostedBadge = t.hosted ? '<span style="font-size:10px;background:rgba(79,142,247,.2);color:var(--accent);padding:2px 6px;border-radius:3px">HOSTED</span>' : '';
    const prizeDisplay = t.special === 'emoji'
      ? `<div class="tourney-prize emoji-prize">🎁</div><div class="tourney-entry">Mystery Emoji</div>`
      : `<div class="tourney-prize">🏆 ${t.prize}</div><div class="tourney-entry">Prize Pool</div>`;
    const cardClass = 'tourney-card' + (t.joined ? ' active-tourney' : '') + (t.special ? ' special' : '') + (t.hosted ? ' hosted' : '');
    const boLabel = t.bo ? 'First to ' + Math.ceil(t.bo / 2) + ' wins' : '';
    return `
      <div class="${cardClass}">
        <div class="tourney-info">
          <div class="tourney-name">${t.name} ${hostedBadge} ${specialBadge} ${status}</div>
          <div class="tourney-meta">
            <span>▣ ${t.entry} entry</span>
            <span>👥 ${t.slots} spots</span>${boLabel ? `<span>${boLabel}</span>` : ''}
            <span>8-player</span>
          </div>
        </div>
        <div>
          ${prizeDisplay}
          ${t.joined
            ? `<button class="join-btn" onclick="showLobbyBracket(${t.id})">${t.complete ? 'View' : 'Play'}</button>`
            : `<button class="join-btn" onclick="promptJoinTourney(${t.id})">Join</button>`}
        </div>
      </div>
    `;
  }).join('');
}

function promptJoinTourney(id) {
  const t = state.tournaments[id];
  const prizeText = t.special === 'emoji'
    ? `Prize: <strong style="color:var(--epic)">A random emoji you don't yet own (any rarity)</strong>`
    : `Prize pool: <strong style="color:var(--gold)">${t.prize} tokens</strong>`;
  const fmt = `Format: 8-player single elimination, first to ${Math.ceil((t.bo || 3) / 2)} wins.`;
  openModal('Join ' + t.name + '?',
    `Entry: <strong style="color:var(--gold)">${t.entry} token${t.entry>1?'s':''}</strong><br>${prizeText}<br>${fmt}`,
    () => joinTourney(id)
  );
}

function joinTourney(id) {
  const t = state.tournaments[id];
  if (state.balance < t.entry) { toast('Not enough tokens!'); return; }
  state.balance -= t.entry; updateBalance();
  t.joined = true; t.slots = Math.max(0, t.slots - 1);
  t.bracket = buildBracket(t);
  saveState();
  renderTourneyList();
  setTimeout(() => showLobbyBracket(id), 200);
}

function buildBracket(t) {
  // Tournament can carry a list of invited-friend objects {name, avatar}.
  // They fill bracket seats first; remaining seats are random PVP_NAMES filler.
  const invited = (t.invitedFriends || []).slice(0, 7);
  const invitedNames = invited.map(f => f.name);
  const filler = PVP_NAMES.filter(n => !invitedNames.includes(n));
  // Shuffle filler
  for (let i = filler.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [filler[i], filler[j]] = [filler[j], filler[i]];
  }
  // 7 AI/friend opponents, friends first
  const opponents = [...invitedNames, ...filler.slice(0, 7 - invitedNames.length)];
  // Shuffle the combined opponent list so invited friends aren't always in seats 1-N
  for (let i = opponents.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [opponents[i], opponents[j]] = [opponents[j], opponents[i]];
  }
  const players = ['You', ...opponents];
  const r1 = [
    { p1: players[0], p2: players[1], s1: null, s2: null, done: false },
    { p1: players[2], p2: players[3], s1: null, s2: null, done: false },
    { p1: players[4], p2: players[5], s1: null, s2: null, done: false },
    { p1: players[6], p2: players[7], s1: null, s2: null, done: false },
  ];
  const r2 = [
    { p1: null, p2: null, s1: null, s2: null, done: false },
    { p1: null, p2: null, s1: null, s2: null, done: false },
  ];
  const final = [{ p1: null, p2: null, s1: null, s2: null, done: false }];
  for (let i = 0; i < 4; i++) {
    const m = r1[i];
    if (m.p1 === 'You' || m.p2 === 'You') continue;
    const w = Math.random() < 0.5 ? m.p1 : m.p2;
    // AI matches: never a tie (someone reaches 2 wins)
    m.s1 = m.p1 === w ? 2 : Math.floor(Math.random() * 2);
    m.s2 = m.p2 === w ? 2 : Math.floor(Math.random() * 2);
    m.done = true; m.winner = w;
    const ri = Math.floor(i / 2);
    if (i % 2 === 0) r2[ri].p1 = w; else r2[ri].p2 = w;
  }
  return { rounds: [r1, r2, final] };
}

function showLobbyBracket(id) {
  runtime.activeTourney = id;
  const t = state.tournaments[id];
  document.getElementById('lobby-pvp').style.display = 'none';
  document.getElementById('lobby-tourney').style.display = 'none';
  document.getElementById('lobby-bracket').style.display = 'flex';
  document.getElementById('bracket-tourney-name').textContent = t.name;
  document.getElementById('bracket-prize').textContent = t.special === 'emoji' ? '🎁 Mystery Emoji' : ('🏆 ' + t.prize);
  renderBracket(t);
  showView('lobby');
  document.getElementById('lobby-bracket').style.display = 'flex';
  setTimeout(() => document.getElementById('lobby-bracket').scrollIntoView({ behavior: 'smooth' }), 50);
}

function renderBracket(t) {
  const b = t.bracket;
  const roundNames = ['Quarter', 'Semi', 'Final'];
  const bracketEl = document.getElementById('bracket-view');
  bracketEl.innerHTML = '';
  // Helper: produce the inner HTML for one player slot. Tappable when it's a real
  // opponent name (not 'You' / null / 'TBD'). When the surrounding match div is
  // active (player's turn), we stopPropagation so tapping the opponent name shows
  // their profile WITHOUT also starting the match.
  function playerHtml(p, sideClass, score, matchIsActive) {
    const isReal = p && p !== 'You' && p !== 'TBD';
    const display = p === 'You' ? state.username : (p || 'TBD');
    if (!isReal) {
      return `<div class="bracket-player ${sideClass}">${display}<span class="bracket-score">${score !== null ? score : ''}</span></div>`;
    }
    // Escape the name for the inline JS string. Names come from PVP_NAMES (alnum+_).
    const safe = String(p).replace(/'/g, "\\'");
    const stop = matchIsActive ? 'event.stopPropagation();' : '';
    return `<div class="bracket-player bracket-player-clickable ${sideClass}" onclick="${stop}openTourneyPlayerProfile('${safe}')">${display}<span class="bracket-score">${score !== null ? score : ''}</span></div>`;
  }

  b.rounds.forEach((round, ri) => {
    const col = document.createElement('div');
    col.className = 'bracket-round';
    col.innerHTML = '<div class="bracket-round-title">' + roundNames[ri] + '</div>';
    round.forEach((m, mi) => {
      const isPlayerMatch = !m.done && (m.p1 === 'You' || m.p2 === 'You');
      const div = document.createElement('div');
      div.className = 'bracket-match' + (isPlayerMatch ? ' active-match' : m.done ? ' completed' : '');
      if (isPlayerMatch) div.onclick = () => startTourneyMatch(t.id, ri, mi);
      const p1class = m.done ? (m.winner === m.p1 ? 'winner' : 'loser') : (m.p1 ? '' : 'tbd');
      const p2class = m.done ? (m.winner === m.p2 ? 'winner' : 'loser') : (m.p2 ? '' : 'tbd');
      div.innerHTML = `
        ${playerHtml(m.p1, p1class, m.s1, isPlayerMatch)}
        ${playerHtml(m.p2, p2class, m.s2, isPlayerMatch)}
      `;
      col.appendChild(div);
    });
    bracketEl.appendChild(col);
  });

  let statusText = '';
  for (let ri = 0; ri < b.rounds.length; ri++) {
    const playerMatch = b.rounds[ri].find(m => (m.p1 === 'You' || m.p2 === 'You') && !m.done);
    if (playerMatch) {
      statusText = ri === 0 ? 'Your match is ready — tap to play!' :
        ri === 1 ? 'Semifinal ready — tap to play!' :
        'FINAL — tap to play for the championship!';
      break;
    }
  }
  if (!statusText) {
    const fin = b.rounds[2][0];
    if (fin.done && fin.winner === 'You') statusText = '🏆 TOURNAMENT CHAMPION!';
    else if (fin.done) statusText = 'Tournament complete';
    else {
      let eliminated = false;
      for (const round of b.rounds) {
        for (const m of round) {
          if (m.done && (m.p1 === 'You' || m.p2 === 'You') && m.winner !== 'You') eliminated = true;
        }
      }
      statusText = eliminated ? 'Eliminated' : 'Waiting for next round…';
    }
  }
  document.getElementById('bracket-tourney-status').textContent = statusText;
}

function startTourneyMatch(tourneyId, roundIdx, matchIdx) {
  const t = state.tournaments[tourneyId];
  const m = t.bracket.rounds[roundIdx][matchIdx];
  runtime.activeTourneyMatchIdx = { roundIdx, matchIdx };
  const opp = m.p1 === 'You' ? m.p2 : m.p1;
  const prizeForWinner = roundIdx === 2 ? t.prize : 0;
  // If opp is an invited friend, use their real friend avatar; else random bot emoji.
  let oppEmoji;
  const inv = (t.invitedFriends || []).find(f => f.name === opp);
  if (inv) {
    oppEmoji = inv.avatar || '🤖';
  } else {
    oppEmoji = randomBotEmoji();
  }
  startGame('tourney', 0, prizeForWinner, opp, oppEmoji, t.bo || 3);
}

function onTourneyMatchContinue(won) {
  const t = state.tournaments[runtime.activeTourney];
  const { roundIdx, matchIdx } = runtime.activeTourneyMatchIdx;
  const m = t.bracket.rounds[roundIdx][matchIdx];
  const g = runtime.gameState;
  m.s1 = m.p1 === 'You' ? g.scoreYou : g.scoreOpp;
  m.s2 = m.p2 === 'You' ? g.scoreYou : g.scoreOpp;
  m.done = true;
  m.winner = won ? 'You' : (m.p1 === 'You' ? m.p2 : m.p1);
  const nextRound = roundIdx + 1;
  if (won && nextRound < t.bracket.rounds.length) {
    const nextMatchIdx = Math.floor(matchIdx / 2);
    const nm = t.bracket.rounds[nextRound][nextMatchIdx];
    if (matchIdx % 2 === 0) nm.p1 = 'You'; else nm.p2 = 'You';
    if (nextRound === 1) {
      const otherSF = t.bracket.rounds[1][1 - nextMatchIdx];
      if (otherSF.p1 && otherSF.p2 && !otherSF.done) {
        const w = Math.random() < 0.5 ? otherSF.p1 : otherSF.p2;
        otherSF.s1 = otherSF.p1 === w ? 2 : 1;
        otherSF.s2 = otherSF.p2 === w ? 2 : 1;
        otherSF.done = true; otherSF.winner = w;
        const fin = t.bracket.rounds[2][0];
        if (nextMatchIdx === 0) fin.p2 = w; else fin.p1 = w;
      }
    }
  } else if (!won) {
    for (let ri = roundIdx; ri < t.bracket.rounds.length; ri++) {
      for (const mm of t.bracket.rounds[ri]) {
        if (mm.done) continue;
        if (mm.p1 && mm.p2) {
          const w = Math.random() < 0.5 ? mm.p1 : mm.p2;
          mm.s1 = mm.p1 === w ? 2 : 1; mm.s2 = mm.p2 === w ? 2 : 1;
          mm.done = true; mm.winner = w;
          if (ri + 1 < t.bracket.rounds.length) {
            const nmi = Math.floor(t.bracket.rounds[ri].indexOf(mm) / 2);
            const nm = t.bracket.rounds[ri + 1][nmi];
            if (t.bracket.rounds[ri].indexOf(mm) % 2 === 0) nm.p1 = w; else nm.p2 = w;
          }
        }
      }
    }
    t.complete = true;
  }
  const fin = t.bracket.rounds[2][0];
  if (fin.done && fin.winner === 'You') {
    if (t.special === 'emoji') {
      // Award a random emoji the player doesn't already own
      const unowned = getShopPool().filter(em => !state.ownedEmojis.includes(em.e));
      if (unowned.length > 0) {
        const reward = unowned[Math.floor(Math.random() * unowned.length)];
        state.ownedEmojis.push(reward.e);
        toast('🏆 Champion! Unlocked ' + reward.name + ' ' + reward.e);
      } else {
        // Edge case: player owns everything → give 25 tokens instead
        state.balance += 25; state.earned += 25;
        toast('🏆 Champion! All emojis owned — +25 tokens instead');
      }
    } else {
      state.balance += t.prize; state.earned += t.prize;
      toast('🏆 Champion! +' + t.prize + ' tokens');
    }
    state.tourneysWon = (state.tourneysWon || 0) + 1;
    updateBalance();
    t.complete = true;
  }
  saveState();
  showLobbyBracket(runtime.activeTourney);
}

/* ---- HISTORY ---- */
function renderHistory() {
  const el = document.getElementById('history-list');
  if (!state.history.length) {
    el.innerHTML = '<div class="empty-state">No matches yet.<br>Start playing!</div>';
    return;
  }
  el.innerHTML = state.history.map((h, idx) => {
    let eloDisplay;
    if (h.eloDelta !== null && h.eloDelta !== 0) {
      const cls = h.eloDelta > 0 ? 'pos' : 'neg';
      const sign = h.eloDelta > 0 ? '+' : '';
      eloDisplay = `<span class="hist-elo ${cls}">${sign}${h.eloDelta}</span>`;
    } else {
      eloDisplay = `<span class="hist-elo zero">—</span>`;
    }
    const av = h.oppAvatar || '🤖';
    return `
      <div class="history-item" onclick="openPlayerProfile(${idx})">
        <span class="hist-result ${h.result}">${h.result}</span>
        <div style="flex:1;min-width:0;font-size:12px">
          <div class="hist-opp-row"><span class="hist-opp-avatar">${av}</span> <span>${h.opp}</span></div>
          <div style="color:var(--muted);font-size:10px;font-weight:500">${h.mode} · ${h.time}</div>
        </div>
        <span style="color:var(--muted);font-size:11px">${h.score}</span>
        ${eloDisplay}
      </div>
    `;
  }).join('');
}

/* ---- PROFILE ---- */
function renderProfile() {
  document.getElementById('profile-avatar').textContent = state.avatar;
  document.getElementById('profile-name').textContent = state.username;
  const tier = getTier(state.elo);
  const tn = document.getElementById('profile-tier');
  tn.textContent = `${tier.name} · ${state.elo} ELO`;
  tn.style.color = tier.color;
  document.getElementById('ps-wins').textContent = state.wins;
  const wr = state.games > 0 ? Math.round(state.wins / state.games * 100) + '%' : '—';
  document.getElementById('ps-winrate').textContent = wr;
  document.getElementById('ps-earned').textContent = state.earned;
  document.getElementById('ps-streak').textContent = state.bestStreak;
  document.getElementById('ps-trophies').textContent = state.tourneysWon || 0;
  document.getElementById('ps-games').textContent = state.games;

  // Owned emojis collection — resolve each owned emoji string to a display record
  // (challenge emojis become legendary via getEmojiInfo). Group by rarity desc.
  const ownedItems = state.ownedEmojis.map(e => getEmojiInfo(e));
  document.getElementById('ps-collection-count').textContent = ownedItems.length;
  document.getElementById('ps-collection').innerHTML = renderOwnedCollectionHtml(ownedItems, { interactive: true });

  // Pick distribution — total picks across all matches, percent of each.
  const pr = state.pickRock || 0;
  const pp = state.pickPaper || 0;
  const ps = state.pickScissors || 0;
  const totalPicks = pr + pp + ps;
  const pct = (n) => totalPicks > 0 ? Math.round(n / totalPicks * 100) : 0;
  // Bar widths normalized to the most-picked sign so the leader bar fills 100%.
  const maxPick = Math.max(pr, pp, ps, 1);
  const barWidth = (n) => Math.round(n / maxPick * 100);
  document.getElementById('pd-num-rock').textContent = pr;
  document.getElementById('pd-num-paper').textContent = pp;
  document.getElementById('pd-num-scissors').textContent = ps;
  document.getElementById('pd-pct-rock').textContent = pct(pr) + '%';
  document.getElementById('pd-pct-paper').textContent = pct(pp) + '%';
  document.getElementById('pd-pct-scissors').textContent = pct(ps) + '%';
  document.getElementById('pd-fill-rock').style.width = barWidth(pr) + '%';
  document.getElementById('pd-fill-paper').style.width = barWidth(pp) + '%';
  document.getElementById('pd-fill-scissors').style.width = barWidth(ps) + '%';

  const resetBtn = document.getElementById('reset-btn');
  if (state.hasReset) {
    resetBtn.disabled = true;
    resetBtn.style.opacity = '0.5';
    resetBtn.style.cursor = 'not-allowed';
    resetBtn.textContent = 'Reset already used';
  } else {
    resetBtn.disabled = false;
    resetBtn.style.opacity = '1';
    resetBtn.style.cursor = 'pointer';
    resetBtn.textContent = 'Reset all progress (one-time)';
  }
}

function editName() {
  document.getElementById('name-input').value = state.username;
  document.getElementById('name-modal').classList.add('open');
  setTimeout(() => document.getElementById('name-input').focus(), 100);
}
// Strip emoji characters from a string. Catches Extended_Pictographic codepoints
// (covers nearly all emoji), variation selectors (U+FE0E/FE0F), zero-width joiners,
// and emoji modifiers (skin tones).
function stripEmojis(s) {
  if (!s) return s;
  let out = s;
  try {
    out = out.replace(/\p{Extended_Pictographic}/gu, '');
  } catch (e) {
    // Older browsers without Unicode property escape support: fall through.
  }
  // Strip combining marks commonly used with emoji: VS-15/16, ZWJ, skin tone modifiers,
  // regional indicator symbols (flags), and keycap combining enclosure.
  out = out.replace(/[\uFE0E\uFE0F\u200D\u20E3]/g, '');
  out = out.replace(/[\u{1F1E6}-\u{1F1FF}]/gu, '');     // regional indicators (flags)
  out = out.replace(/[\u{1F3FB}-\u{1F3FF}]/gu, '');     // skin tone modifiers
  return out;
}

function saveName() {
  const raw = document.getElementById('name-input').value;
  const cleaned = stripEmojis(raw).trim().slice(0, 16);
  if (!cleaned) {
    toast(raw && raw.trim() ? 'No emojis allowed in name' : 'Name cannot be empty');
    return;
  }
  if (cleaned !== raw.trim().slice(0, 16)) {
    toast('Emojis removed from name');
  }
  state.username = cleaned;
  saveState();
  document.getElementById('name-modal').classList.remove('open');
  updateHeader();
  renderProfile();
  toast('Name saved');
}

/* RESET — now requires typing 'confirm', and preserves owned emojis + avatar */
function confirmReset() {
  if (state.hasReset) { toast('Reset already used'); return; }
  const input = document.getElementById('reset-confirm-input');
  const btn = document.getElementById('reset-confirm-btn');
  input.value = '';
  btn.disabled = true;
  document.getElementById('reset-modal').classList.add('open');
  setTimeout(() => input.focus(), 100);
}
function closeResetModal() {
  document.getElementById('reset-modal').classList.remove('open');
}
function executeReset() {
  const input = document.getElementById('reset-confirm-input');
  if (input.value.trim().toLowerCase() !== 'confirm') {
    toast('Type "confirm" exactly to proceed');
    return;
  }
  // Preserve owned emojis and current avatar across reset
  const keptEmojis = [...state.ownedEmojis];
  const keptAvatar = state.avatar;
  const fresh = { ...DEFAULT_STATE };
  fresh.hasReset = true;
  fresh.ownedEmojis = keptEmojis;
  fresh.avatar = keptAvatar;
  state = fresh;
  saveState();
  closeResetModal();
  updateBalance();
  updateHeader();
  renderProfile();
  renderHistory();
  initTourneys();
  refreshFeatured();
  toast('Progress reset (emojis kept)');
  showView('lobby');
}

/* ---- SHOP ---- */
function setShopTab(el, cat) {
  document.querySelectorAll('.shop-tab').forEach(t => t.classList.remove('active'));
  el.classList.add('active');
  runtime.shopCat = cat;
  renderShopBrowse();
}

function renderShop() {
  refreshFeatured();
  renderDailyClaim();
  renderFeatured();
  renderChallenges();
  renderShopBrowse();
}

function renderFeatured() {
  const el = document.getElementById('shop-featured-grid');
  el.innerHTML = state.featuredEmojis.map(e => {
    const item = getEmojiInfo(e);
    if (!item) return '';
    return shopItemHtml(item);
  }).join('');
}

/* ---- CHALLENGE DEFINITIONS ----
   Each challenge has either an emoji reward (default) or a token reward (rewardType:'tokens').
   Emoji challenges grant the emoji once claimed; token challenges credit tokens to balance. */
const CHALLENGE_DEFS = [
  // Rock Reborn — original challenge, dual-progress
  {
    id: 'rock_reborn',
    emoji: ROCK_EMOJI,
    name: 'Rock Reborn',
    desc: 'Unlock the legendary Rock emoji.',
    progress: () => [
      { current: Math.min(state.tourneysWon || 0, 5), goal: 5, label: 'tournaments won' },
      { current: Math.min(state.bestStreak || 0, 10), goal: 10, label: 'PvP win streak' },
    ],
  },
  // Token reward challenge — 5 PvP wins in a row → 100 tokens
  {
    id: 'streak_5_tokens',
    emoji: '🎟️',
    name: 'Hot Hand',
    desc: 'Win 5 PvP matches in a row.',
    rewardType: 'tokens',
    rewardAmount: 100,
    progress: () => [{ current: Math.min(state.bestStreak || 0, 5), goal: 5, label: 'PvP wins in a row' }],
  },
  {
    id: 'win_100',
    emoji: '🗿',
    name: 'Stone Cold',
    desc: 'Win 1000 matches.',
    progress: () => [{ current: Math.min(state.wins || 0, 1000), goal: 1000, label: 'matches won' }],
  },
  {
    id: 'win_50',
    emoji: '👽',
    name: 'Out of This World',
    desc: 'Win 500 matches.',
    progress: () => [{ current: Math.min(state.wins || 0, 500), goal: 500, label: 'matches won' }],
  },
  {
    id: 'draw_30',
    emoji: '🤓',
    name: 'What a Read!',
    desc: 'Draw 100 matches.',
    progress: () => [{ current: Math.min(state.draws || 0, 100), goal: 100, label: 'matches drawn' }],
  },
  {
    id: 'lose_30',
    emoji: '🥀',
    name: 'Wilted',
    desc: 'Lose 100 matches.',
    progress: () => [{ current: Math.min(state.losses || 0, 100), goal: 100, label: 'matches lost' }],
  },
  {
    id: 'tourney_25',
    emoji: '🩻',
    name: 'See Through',
    desc: 'Win 25 tournaments.',
    progress: () => [{ current: Math.min(state.tourneysWon || 0, 25), goal: 25, label: 'tournaments won' }],
  },
  {
    id: 'collector_10',
    emoji: '🪕',
    name: 'Collector',
    desc: 'Collect 10 emojis (not counting the starter).',
    progress: () => {
      // Count owned emojis excluding the starter 😀. So a fresh user with just the starter
      // is at 0/10; collecting 10 more (any source: shop, challenge, reward) completes it.
      const collected = state.ownedEmojis.filter(e => e !== '😀').length;
      return [{ current: Math.min(collected, 10), goal: 10, label: 'emojis collected' }];
    },
  },
  {
    id: 'top_tier',
    emoji: '🧠',
    name: 'Head Games',
    desc: 'Reach the highest ELO tier (Grandmaster).',
    progress: () => {
      const top = ELO_TIERS[ELO_TIERS.length - 1].min; // 2100
      // Live: track CURRENT ELO until challenge is complete. Once claimed (or once
      // bestElo has crossed the threshold), the bar locks at full so it doesn't drop.
      const claimed = (state.claimedChallenges || []).includes('top_tier');
      const everReached = (state.bestElo || state.elo) >= top;
      const current = (claimed || everReached) ? top : (state.elo || 0);
      return [{ current: Math.min(current, top), goal: top, label: claimed || everReached ? 'reached Grandmaster' : 'current ELO ' + (state.elo || 0) }];
    },
  },
  {
    id: 'rock_bottom',
    emoji: '🪤',
    name: 'Mouse Trap',
    desc: 'Reach 0 ELO.',
    progress: () => {
      // Binary: complete the moment current ELO hits 0, OR if it ever did
      // (lowestElo === 0). Bar fills proportionally as ELO drops from 1000 to 0.
      const start = 1000;
      const lowest = state.lowestElo === undefined ? state.elo : state.lowestElo;
      const reachedZero = state.elo === 0 || lowest === 0;
      // current = start when reachedZero (full bar), else proportional drop from start
      const current = reachedZero ? start : Math.max(0, start - lowest);
      return [{
        current: Math.min(current, start),
        goal: start,
        label: reachedZero ? 'reached 0 ELO' : 'ELO at ' + lowest,
      }];
    },
  },
];

function isChallengeComplete(c) {
  return c.progress().every(p => p.current >= p.goal);
}

function renderChallenges() {
  const list = document.getElementById('challenges-list');
  list.innerHTML = CHALLENGE_DEFS.map(c => {
    const isTokenReward = c.rewardType === 'tokens';
    const claimed = (state.claimedChallenges || []).includes(c.id);
    const complete = isChallengeComplete(c);

    // For emoji rewards, owned/equipped state drives the action. For token rewards,
    // the only states are: locked (incomplete), claim available, or claimed.
    let action;
    if (isTokenReward) {
      if (claimed) {
        action = `<div class="shop-action equipped" style="margin-top:6px">CLAIMED · +${c.rewardAmount} ▣</div>`;
      } else if (complete) {
        action = `<button onclick="claimChallenge('${c.id}')" style="margin-top:6px;background:var(--success);color:#fff;border:none;border-radius:6px;padding:6px 12px;cursor:pointer;font-size:11px;font-weight:700;letter-spacing:.05em">CLAIM ▣ ${c.rewardAmount}</button>`;
      } else {
        action = '<div class="shop-action locked" style="margin-top:6px">LOCKED</div>';
      }
    } else {
      const owned = state.ownedEmojis.includes(c.emoji);
      const equipped = state.avatar === c.emoji;
      if (equipped) {
        action = '<div class="shop-action equipped" style="margin-top:6px">EQUIPPED</div>';
      } else if (owned) {
        action = `<button onclick="equipEmoji('${c.emoji}')" style="margin-top:6px;background:var(--gold);color:#000;border:none;border-radius:6px;padding:6px 12px;cursor:pointer;font-size:11px;font-weight:700;letter-spacing:.05em">EQUIP</button>`;
      } else if (complete && !claimed) {
        action = `<button onclick="claimChallenge('${c.id}')" style="margin-top:6px;background:var(--success);color:#fff;border:none;border-radius:6px;padding:6px 12px;cursor:pointer;font-size:11px;font-weight:700;letter-spacing:.05em">CLAIM ${c.emoji}</button>`;
      } else {
        action = '<div class="shop-action locked" style="margin-top:6px">LOCKED</div>';
      }
    }

    const progressBars = c.progress().map(p => {
      const done = p.current >= p.goal;
      const pct = p.goal > 0 ? Math.min(100, p.current / p.goal * 100) : 0;
      const labelText = p.goal === p.current && p.label.startsWith('reached')
        ? p.label
        : `${p.current}/${p.goal} ${p.label}`;
      return `
        <div style="flex:1;min-width:120px">
          <div class="challenge-progress"><div class="challenge-progress-fill ${done?'done':''}" style="width:${pct}%"></div></div>
          <div class="challenge-progress-text ${done?'done':''}">${labelText}</div>
        </div>
      `;
    }).join('');

    return `
      <div class="challenge-card ${complete ? 'complete' : ''}">
        <div class="challenge-emoji">${c.emoji}</div>
        <div class="challenge-info">
          <div class="challenge-name">${c.name}</div>
          <div class="challenge-desc">${c.desc}</div>
          <div style="display:flex;gap:8px;flex-wrap:wrap">${progressBars}</div>
          ${action}
        </div>
      </div>
    `;
  }).join('');
}

function claimChallenge(id) {
  const c = CHALLENGE_DEFS.find(x => x.id === id);
  if (!c) return;
  if (!isChallengeComplete(c)) { toast('Challenge not complete'); return; }
  const claimed = (state.claimedChallenges || []).includes(id);
  if (claimed) { toast('Already claimed'); return; }

  if (c.rewardType === 'tokens') {
    state.balance += c.rewardAmount;
    state.earned += c.rewardAmount;
    if (!state.claimedChallenges) state.claimedChallenges = [];
    state.claimedChallenges.push(id);
    saveState();
    updateBalance();
    updateHeader();
    renderShop();
    toast('+' + c.rewardAmount + ' tokens — ' + c.name + ' claimed!');
    if (navigator.vibrate) navigator.vibrate([30, 50, 30, 50, 60]);
    return;
  }

  // Emoji reward (default)
  if (state.ownedEmojis.includes(c.emoji)) { toast('Already owned'); return; }
  state.ownedEmojis.push(c.emoji);
  state.avatar = c.emoji;
  if (!state.claimedChallenges) state.claimedChallenges = [];
  if (!state.claimedChallenges.includes(id)) state.claimedChallenges.push(id);
  saveState();
  updateHeader();
  renderShop();
  toast(c.emoji + ' ' + c.name + ' unlocked & equipped!');
  if (navigator.vibrate) navigator.vibrate([30, 50, 30, 50, 60]);
}

function equipEmoji(e) {
  if (!state.ownedEmojis.includes(e)) return;
  if (state.avatar === e) return; // already equipped — silent
  state.avatar = e;
  saveState();
  updateHeader();
  // Refresh whichever owned-emoji view is currently visible
  const shopActive = document.getElementById('view-shop').classList.contains('active');
  const profileActive = document.getElementById('view-profile').classList.contains('active');
  if (shopActive) renderShop();
  if (profileActive) renderProfile();
  toast('Equipped');
}

function shopItemHtml(item) {
  const owned = state.ownedEmojis.includes(item.e);
  const equipped = state.avatar === item.e;
  let action;
  if (equipped) action = '<div class="shop-action equipped">EQUIPPED</div>';
  else if (owned) action = '<div class="shop-action owned">OWNED</div>';
  else action = `<div class="shop-action buy">▣ ${item.price}</div>`;
  return `
    <div class="shop-item ${equipped ? 'equipped' : ''}" onclick="shopAction('${item.e}')">
      <div class="shop-emoji">${item.e}</div>
      <div class="shop-name">${item.name}</div>
      ${action}
    </div>
  `;
}

// Emojis that can ONLY be unlocked through challenges (never browsable, never featured, never random rewards)
function getChallengeLockedEmojis() {
  // Returns the set of emojis tied to an EMOJI-reward challenge — these are
  // claim-only (never browsable, never featured). Token-reward challenges use
  // an emoji as a tile icon but the emoji isn't actually granted, so we don't
  // lock it from the shop.
  const set = new Set([ROCK_EMOJI]);
  if (typeof CHALLENGE_DEFS !== 'undefined') {
    for (const c of CHALLENGE_DEFS) {
      if (c.rewardType === 'tokens') continue;
      set.add(c.emoji);
    }
  }
  return set;
}

// Lookup table of challenge emojis -> their challenge def (for name + forced rarity).
// Only emoji-reward challenges produce overrides; token-reward icons stay catalog-resolved.
function getChallengeEmojiOverrides() {
  const map = {};
  for (const c of CHALLENGE_DEFS) {
    if (c.rewardType === 'tokens') continue;
    map[c.emoji] = { e: c.emoji, name: c.name, cat: 'challenge', price: 0, rarity: 'legendary' };
  }
  // Rock has its own challenge; ensure it's in the map even if absent from CHALLENGE_DEFS
  if (!map[ROCK_EMOJI]) {
    map[ROCK_EMOJI] = { e: ROCK_EMOJI, name: 'Rock', cat: 'challenge', price: 0, rarity: 'legendary' };
  }
  return map;
}

// Resolve an emoji string to a display record, with challenge emojis forced to legendary.
// Always returns a valid record (synthetic if the catalog has nothing).
function getEmojiInfo(e) {
  const overrides = getChallengeEmojiOverrides();
  if (overrides[e]) return overrides[e];
  const found = EMOJI_CATALOG.find(x => x.e === e);
  if (found) return found;
  return { e, name: e, cat: 'unknown', price: 0, rarity: 'common' };
}

// Returns emojis the regular shop is allowed to surface (browse, featured, random rewards).
// Excludes 'symbols' category and all challenge-locked emojis.
function getShopPool() {
  const locked = getChallengeLockedEmojis();
  return EMOJI_CATALOG.filter(e => e.cat !== 'symbols' && !locked.has(e.e));
}

function renderShopBrowse() {
  const container = document.getElementById('shop-content');
  const pool = getShopPool();
  let filtered;
  if (runtime.shopCat === 'owned') {
    // "Owned" virtual tab: every emoji the user owns, including challenge-claimed
    // ones (which aren't in the regular catalog). getEmojiInfo() forces challenge
    // emojis to a synthetic legendary record so they render correctly here.
    filtered = state.ownedEmojis.map(e => getEmojiInfo(e));
  } else if (runtime.shopCat === 'all') {
    filtered = pool;
  } else {
    filtered = pool.filter(e => e.cat === runtime.shopCat);
  }

  // DEDUPE by emoji-key (the catalog has duplicates like 🙈/🙉/🙊 in both faces & animals,
  // 🦂 listed twice, etc.). Keep first occurrence.
  {
    const seenE = new Set();
    filtered = filtered.filter(item => {
      if (seenE.has(item.e)) return false;
      seenE.add(item.e);
      return true;
    });
  }

  // DESCENDING rarity (best first)
  const rarityOrder = ['legendary', 'epic', 'rare', 'common'];
  const byRarity = {};
  for (const r of rarityOrder) byRarity[r] = [];
  for (const item of filtered) {
    const bucket = byRarity[item.rarity] ? item.rarity : 'common';
    byRarity[bucket].push(item);
  }

  // Within each rarity bucket, sort owned emojis first
  for (const r of rarityOrder) {
    byRarity[r].sort((a, b) => {
      const aOwned = state.ownedEmojis.includes(a.e);
      const bOwned = state.ownedEmojis.includes(b.e);
      if (aOwned && !bOwned) return -1;
      if (!aOwned && bOwned) return 1;
      return 0;
    });
  }

  const sections = rarityOrder
    .filter(r => byRarity[r].length > 0)
    .map(r => `
      <div class="shop-rarity-section">
        <div class="shop-rarity-header ${r}">${r.toUpperCase()} <span class="count">· ${byRarity[r].length}</span></div>
        <div class="shop-grid">
          ${byRarity[r].map(shopItemHtml).join('')}
        </div>
      </div>
    `).join('');

  const emptyMsg = runtime.shopCat === 'owned'
    ? '<div class="empty-state">No emojis owned yet.<br>Buy some, or earn them through challenges.</div>'
    : '<div class="empty-state">No emojis in this category.</div>';

  container.innerHTML = sections || emptyMsg;
}

function shopAction(emoji) {
  const item = getEmojiInfo(emoji);
  if (!item) return;
  // Challenge-locked emojis can't be purchased — they're claim-only via the challenges section.
  // If a user taps a challenge-locked emoji they don't own (which shouldn't normally happen since
  // they're hidden from browse), redirect them to claim it via challenges.
  const locked = getChallengeLockedEmojis();
  if (locked.has(emoji) && !state.ownedEmojis.includes(emoji)) {
    toast('Earn this through a challenge');
    return;
  }
  if (state.avatar === emoji) { toast('Already equipped'); return; }
  if (state.ownedEmojis.includes(emoji)) {
    state.avatar = emoji;
    saveState();
    updateHeader();
    renderShop();
    toast('Equipped ' + item.name);
    return;
  }
  if (state.balance < item.price) { toast('Not enough tokens'); return; }
  openModal('Buy ' + item.name + '?',
    `<div style="font-size:48px;text-align:center;margin:8px 0">${item.e}</div><strong>${item.name}</strong><br>Price: <strong style="color:var(--gold)">${item.price} token${item.price>1?'s':''}</strong><br>Rarity: <strong>${item.rarity}</strong><br>You'll have ${state.balance - item.price} tokens after.`,
    () => {
      state.balance -= item.price;
      state.ownedEmojis.push(emoji);
      state.avatar = emoji;
      saveState();
      updateBalance();
      updateHeader();
      renderShop();
      toast('Unlocked & equipped ' + item.name);
    }
  );
}

/* ---- MODAL & BUY ---- */
function openModal(title, body, cb) {
  document.getElementById('modal-title').textContent = title;
  document.getElementById('modal-body').innerHTML = body;
  runtime.modalCb = cb;
  document.getElementById('modal-overlay').classList.add('open');
}
function closeModal() { document.getElementById('modal-overlay').classList.remove('open'); }
document.getElementById('modal-confirm-btn').onclick = () => { closeModal(); runtime.modalCb && runtime.modalCb(); };

// Wire up reset confirmation input — enable button only when text matches
document.getElementById('reset-confirm-input').addEventListener('input', (e) => {
  const btn = document.getElementById('reset-confirm-btn');
  btn.disabled = e.target.value.trim().toLowerCase() !== 'confirm';
});

function openBuy() { document.getElementById('buy-modal').classList.add('open'); }
function buyTokens(amt, price) {
  state.balance += amt; state.earned += amt; updateBalance();
  document.getElementById('buy-modal').classList.remove('open');
  toast('+' + amt + ' tokens added (demo)');
}

/* ---- DAILY FREE TOKENS ---- */
const DAILY_TOKEN_AMOUNT = 3;
function claimDailyTokens() {
  const today = todayKey();
  if (state.lastDailyClaim === today) {
    toast('Already claimed today — come back tomorrow!');
    return;
  }
  state.balance += DAILY_TOKEN_AMOUNT;
  state.earned += DAILY_TOKEN_AMOUNT;
  state.lastDailyClaim = today;
  saveState();
  updateBalance();
  renderDailyClaim();
  toast('+' + DAILY_TOKEN_AMOUNT + ' free tokens claimed!');
  if (navigator.vibrate) navigator.vibrate([20, 30, 40]);
}
function renderDailyClaim() {
  const wrap = document.getElementById('daily-claim');
  const btn = document.getElementById('daily-claim-btn');
  const sub = document.getElementById('daily-claim-sub');
  if (!wrap) return;
  const claimed = state.lastDailyClaim === todayKey();
  if (claimed) {
    wrap.classList.add('claimed');
    btn.disabled = true;
    btn.textContent = 'CLAIMED';
    sub.textContent = 'Come back tomorrow for ' + DAILY_TOKEN_AMOUNT + ' more';
  } else {
    wrap.classList.remove('claimed');
    btn.disabled = false;
    btn.textContent = 'CLAIM ▣ ' + DAILY_TOKEN_AMOUNT;
    sub.textContent = 'Free ' + DAILY_TOKEN_AMOUNT + ' tokens, every day';
  }
}

/* ---- TIER LIST VIEW ---- */
function renderTiers() {
  const summary = document.getElementById('tiers-summary');
  const best = state.bestElo || state.elo;
  summary.innerHTML = `
    <div class="tiers-summary-item">
      <div class="label">Current</div>
      <div class="val" style="color:${getTier(state.elo).color}">${state.elo}</div>
    </div>
    <div class="tiers-summary-item">
      <div class="label">Peak</div>
      <div class="val" style="color:${getTier(best).color}">${best}</div>
    </div>
    <div class="tiers-summary-item">
      <div class="label">Tier</div>
      <div class="val" style="color:${getTier(state.elo).color}">${getTier(state.elo).name}</div>
    </div>
  `;
  const list = document.getElementById('tiers-list');
  const currentTier = getTier(state.elo);
  const bestTier = getTier(best);
  list.innerHTML = ELO_TIERS.slice().reverse().map(tier => {
    const isCurrent = tier.name === currentTier.name;
    const isPeak = tier.name === bestTier.name && bestTier.name !== currentTier.name;
    const everReached = best >= tier.min;
    const range = tier.max < 9999 ? `${tier.min}–${tier.max - 1} ELO` : `${tier.min}+ ELO`;

    let badges = '';
    if (isCurrent) badges += '<span class="tier-badge you">YOU</span>';
    if (isPeak) badges += '<span class="tier-badge peak">PEAK</span>';

    let progress = '';
    if (isCurrent && tier.max < 9999) {
      const into = state.elo - tier.min;
      const span = tier.max - tier.min;
      const pct = Math.max(0, Math.min(100, into / span * 100));
      progress = `
        <div style="margin-top:8px">
          <div class="elo-progress" style="height:5px"><div class="elo-progress-fill" style="width:${pct}%;background:${tier.color}"></div></div>
          <div style="font-size:10px;color:var(--muted);margin-top:3px;font-weight:600">${into} / ${span} into ${tier.name}</div>
        </div>
      `;
    }

    return `
      <div class="tier-row ${isCurrent ? 'current' : ''} ${everReached ? 'unlocked' : 'locked'}" style="--tier-c:${tier.color}">
        <div class="tier-dot"></div>
        <div class="tier-info">
          <div class="tier-name">${tier.name}</div>
          <div class="tier-range">${range}</div>
          ${progress}
        </div>
        ${badges}
      </div>
    `;
  }).join('');
}

/* ---- LEADERBOARD (synthetic, local) ----
   Builds a stable per-day leaderboard from PVP_NAMES + BOT_NAMES with synthetic
   ELOs, then inserts the user. Order changes once a day; tapping a row opens
   the same player profile window used elsewhere. */
function renderLeaderboard() {
  // Pool of 14 NPCs, deterministically picked + ranked per day.
  const pool = [...PVP_NAMES, ...BOT_NAMES];
  const seedBase = _hashStr('lb|' + todayKey());
  const r = _seededRand(seedBase);

  // Pick 14 unique names
  const seen = new Set();
  const picked = [];
  let safety = 0;
  while (picked.length < 14 && seen.size < pool.length && safety < 500) {
    const idx = Math.floor(r() * pool.length);
    if (!seen.has(idx)) {
      seen.add(idx);
      picked.push(pool[idx]);
    }
    safety++;
  }

  // Each NPC gets synthetic stats; we use their ELO from the synthetic profile.
  const npcs = picked.map(name => {
    // Pick a stable per-day avatar
    const sp = getPlayerSyntheticProfile(name, '');
    // Override avatar with a deterministic emoji pulled from the shop pool
    const ePool = getShopPool();
    const ai = _hashStr(name + '|av') % Math.max(1, ePool.length);
    const avatar = ePool.length > 0 ? ePool[ai].e : '🤖';
    return { name, avatar, elo: sp.elo };
  });

  // Insert the user
  const me = { name: state.username, avatar: state.avatar, elo: state.elo, isYou: true };
  const all = npcs.concat([me]);
  // Sort by ELO descending
  all.sort((a, b) => b.elo - a.elo);

  // Find user's rank
  const myRank = all.findIndex(x => x.isYou) + 1;
  const total = all.length;

  // Header card
  const tier = getTier(state.elo);
  document.getElementById('lb-header').innerHTML = `
    <div class="lb-header-rank" style="color:${tier.color}">#${myRank} <span style="color:var(--muted);font-size:18px">/ ${total}</span></div>
    <div class="lb-header-label">Your Rank · ${state.elo} ELO</div>
  `;

  // Rows
  document.getElementById('lb-list').innerHTML = all.map((p, i) => {
    const rank = i + 1;
    const tier = getTier(p.elo);
    const rankCls = rank === 1 ? 'r1' : rank === 2 ? 'r2' : rank === 3 ? 'r3' : '';
    const youCls = p.isYou ? ' you' : '';
    // For NPCs the row opens the player profile window; for "you" it opens your own profile.
    const onclick = p.isYou
      ? `showView('profile');renderProfile()`
      : `openTourneyPlayerProfile('${String(p.name).replace(/'/g, "\\'")}')`;
    return `
      <div class="lb-row${youCls}" onclick="${onclick}">
        <div class="lb-rank ${rankCls}">${rank}</div>
        <div class="lb-avatar">${p.avatar}</div>
        <div class="lb-info">
          <div class="lb-name">${p.name}${p.isYou ? ' (you)' : ''}</div>
          <div class="lb-tier" style="color:${tier.color}">${tier.name}</div>
        </div>
        <div class="lb-elo">${p.elo}</div>
      </div>
    `;
  }).join('');
}

/* ---- FRIENDS LIST ---- */
// Deterministic online status per friend per day (so it doesn't flicker mid-session
// but does rotate). Seeded by name+avatar+date.
function isFriendOnline(f) {
  const seed = _hashStr((f.name || '') + '|' + (f.avatar || '') + '|' + todayKey());
  // ~50% online
  return (seed % 2) === 0;
}

function renderFriends() {
  const list = document.getElementById('friends-list');
  if (!state.friends || state.friends.length === 0) {
    list.innerHTML = '<div class="empty-state">No friends yet.<br>Add someone above, or tap a recent opponent in your match history.</div>';
    return;
  }
  list.innerHTML = state.friends.map((f, idx) => {
    const online = isFriendOnline(f);
    const statusClass = online ? 'online' : 'offline';
    const statusText = online ? 'Online' : 'Offline';
    return `
      <div class="friend-item friend-item-clickable" onclick="openFriendProfile(${idx})">
        <div class="friend-avatar">${f.avatar || '🤖'}</div>
        <div class="friend-info">
          <div class="friend-name">${f.name}</div>
          <div class="friend-meta">Added ${f.addedAt || 'recently'}</div>
        </div>
        <div class="friend-actions">
          <button class="friend-vs-btn" title="Request match" onclick="event.stopPropagation();requestFriendMatch(${idx})">⚔ vs</button>
          <div class="friend-status ${statusClass}">
            <span class="friend-status-dot"></span>
            <span class="friend-status-label">${statusText}</span>
          </div>
        </div>
      </div>
    `;
  }).join('');
}
function addFriend() {
  const input = document.getElementById('friend-input');
  const name = (input.value || '').trim().slice(0, 16);
  if (!name) { toast('Enter a name'); return; }
  if (!state.friends) state.friends = [];
  if (state.friends.some(f => f.name.toLowerCase() === name.toLowerCase())) {
    toast(name + ' is already in your friends list');
    return;
  }
  state.friends.unshift({
    name,
    avatar: randomBotEmoji(),
    addedAt: new Date().toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
  });
  input.value = '';
  saveState();
  renderFriends();
  updateHeader();
  toast('Added ' + name);
}
function removeFriend(idx) {
  if (!state.friends || !state.friends[idx]) return;
  const name = state.friends[idx].name;
  state.friends.splice(idx, 1);
  saveState();
  renderFriends();
  updateHeader();
  toast('Removed ' + name);
}

/* ---- HISTORY PLAYER PROFILE (MODAL/WINDOW) ----
   Tapping a row in match history pops up a window with that opponent's
   PERSONAL stats (synthetic, derived from name+avatar), not head-to-head. */
let _historyPlayerCtx = null; // { name, avatar }

// Underlying renderer used by both history-row taps and tournament-name taps.
function showHistoryPlayerModal(name, avatar) {
  _historyPlayerCtx = { name, avatar };
  const synth = getPlayerSyntheticProfile(name, avatar);
  const tier = getTier(synth.elo);

  document.getElementById('hpm-avatar').textContent = avatar || '🤖';
  document.getElementById('hpm-name').textContent = name;
  const tierEl = document.getElementById('hpm-tier');
  tierEl.textContent = `${tier.name} · ${synth.elo} ELO`;
  tierEl.style.color = tier.color;

  // PERSONAL stats — same six labels as the Profile tab so layout mirrors.
  document.getElementById('hpm-stats').innerHTML = `
    <div class="pstat"><div class="pstat-label">Total Wins</div><div class="pstat-val">${synth.wins}</div></div>
    <div class="pstat"><div class="pstat-label">Win Rate</div><div class="pstat-val">${synth.winRatePct}%</div></div>
    <div class="pstat"><div class="pstat-label">Tokens Earned</div><div class="pstat-val">${synth.earned}</div></div>
    <div class="pstat"><div class="pstat-label">Best PvP Streak</div><div class="pstat-val">${synth.streak}</div></div>
    <div class="pstat"><div class="pstat-label">Tourneys Won</div><div class="pstat-val">${synth.trophies}</div></div>
    <div class="pstat"><div class="pstat-label">Total Games</div><div class="pstat-val">${synth.games}</div></div>
  `;
  document.getElementById('hpm-last').innerHTML = '';

  const addBtn = document.getElementById('hpm-add-btn');
  const isFriend = (state.friends || []).some(f => f.name === name);
  if (isFriend) {
    addBtn.disabled = true;
    addBtn.textContent = 'Already Friends';
  } else {
    addBtn.disabled = false;
    addBtn.textContent = 'Add Friend';
  }

  document.getElementById('history-player-modal').classList.add('open');
}

function openPlayerProfile(historyIdx) {
  const h = state.history[historyIdx];
  if (!h) return;
  showHistoryPlayerModal(h.opp, h.oppAvatar || '🤖');
  // Append last-match line (history-specific context)
  document.getElementById('hpm-last').innerHTML =
    `<strong style="color:var(--text)">Last:</strong> ${h.mode} · ${h.score} · ${h.time}`;
}

// Open the same window for a tournament opponent (by name only — generate avatar deterministically).
function openTourneyPlayerProfile(name) {
  if (!name || name === 'You' || name === 'TBD') return;
  let avatar = null;

  // 1) If they're an invited friend in the active hosted tournament, use that avatar.
  const activeT = state.tournaments && state.tournaments[runtime.activeTourney];
  if (activeT && activeT.invitedFriends) {
    const inv = activeT.invitedFriends.find(f => f.name === name);
    if (inv) avatar = inv.avatar || null;
  }
  // 2) Else if they're in the user's friend list, use that avatar.
  if (!avatar && state.friends) {
    const f = state.friends.find(x => x.name === name);
    if (f) avatar = f.avatar || null;
  }
  // 3) Else deterministic emoji from the shop pool seeded by name.
  if (!avatar) {
    const pool = getShopPool();
    const seed = _hashStr(name);
    const idx = pool.length > 0 ? (seed % pool.length) : 0;
    avatar = pool.length > 0 ? pool[idx].e : '🤖';
  }
  showHistoryPlayerModal(name, avatar);
}

function closeHistoryPlayerModal() {
  document.getElementById('history-player-modal').classList.remove('open');
  _historyPlayerCtx = null;
}

function addFriendFromHistoryModal() {
  if (!_historyPlayerCtx) return;
  if (!state.friends) state.friends = [];
  if (state.friends.some(f => f.name === _historyPlayerCtx.name)) {
    toast('Already friends');
    return;
  }
  state.friends.unshift({
    name: _historyPlayerCtx.name,
    avatar: _historyPlayerCtx.avatar,
    addedAt: new Date().toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
  });
  saveState();
  updateHeader();
  closeHistoryPlayerModal();
  toast('Added ' + _historyPlayerCtx.name);
}

/* ---- FRIEND PROFILE (FULL PAGE) ----
   Tapping a friend opens a dedicated view with synthetic stats derived
   deterministically from the friend's name (so the numbers feel stable across
   visits) plus an "owned emojis" collection. NPCs have no real persistence so
   we generate plausible numbers seeded by their name. */

// Tiny deterministic hash for seeding synthetic stats (so the same friend always
// shows the same stats across sessions).
function _hashStr(s) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}
// Seeded RNG (mulberry32-ish) returning [0,1)
function _seededRand(seed) {
  return function() {
    seed = (seed + 0x6D2B79F5) >>> 0;
    let t = seed;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Generate a stable synthetic profile object for a friend by name+avatar.
// Generate stable synthetic stats for any opponent (friend, history opp, tournament opp).
// Seeded by name+avatar so the same player always shows the same numbers across visits.
function getPlayerSyntheticProfile(name, avatar) {
  const seed = _hashStr((name || '') + '|' + (avatar || ''));
  const r = _seededRand(seed);
  const games = 20 + Math.floor(r() * 480);            // 20–500 games
  const winRatePct = 30 + Math.floor(r() * 50);        // 30–79% win rate
  const wins = Math.round(games * winRatePct / 100);
  const earned = Math.floor(r() * 1000);
  const streak = 1 + Math.floor(r() * 15);
  const trophies = Math.floor(r() * 12);
  const elo = 600 + Math.floor(r() * 1700);            // 600–2299

  // Synthetic emoji collection: 4–12 distinct items pulled from the visible shop pool.
  const pool = getShopPool();
  const collectionSize = 4 + Math.floor(r() * 9);
  const collection = [];
  const seenIdx = new Set();
  let safety = 0;
  while (collection.length < collectionSize && seenIdx.size < pool.length && safety < 200) {
    const idx = Math.floor(r() * pool.length);
    if (!seenIdx.has(idx)) {
      seenIdx.add(idx);
      collection.push(pool[idx]);
    }
    safety++;
  }
  return { games, wins, winRatePct, earned, streak, trophies, elo, collection };
}
// Backward-compat shim used in friend profile
function getFriendSyntheticProfile(friend) {
  return getPlayerSyntheticProfile(friend.name, friend.avatar);
}

// Shared renderer for an "owned emojis" collection grid: groups by rarity descending,
// dedupes by emoji key, and uses the read-only shop-item visual.
function renderOwnedCollectionHtml(items, opts) {
  opts = opts || {};
  const interactive = !!opts.interactive;
  if (!items || items.length === 0) {
    return '<div class="empty-state">No emojis owned yet.</div>';
  }
  // Dedupe by emoji-key
  const seenE = new Set();
  const unique = items.filter(item => {
    if (seenE.has(item.e)) return false;
    seenE.add(item.e);
    return true;
  });
  // Bucket by rarity
  const order = ['legendary', 'epic', 'rare', 'common'];
  const byRarity = { legendary: [], epic: [], rare: [], common: [] };
  for (const item of unique) {
    const bucket = byRarity[item.rarity] ? item.rarity : 'common';
    byRarity[bucket].push(item);
  }
  // Render section headers + grids per rarity
  return order.filter(r => byRarity[r].length > 0).map(r => `
    <div class="shop-rarity-section">
      <div class="shop-rarity-header ${r}">${r.toUpperCase()} <span class="count">· ${byRarity[r].length}</span></div>
      <div class="shop-grid">
        ${byRarity[r].map(item => {
          if (interactive) {
            const equipped = state.avatar === item.e;
            const safe = String(item.e).replace(/'/g, "\\'");
            const actionLabel = equipped ? 'EQUIPPED' : 'EQUIP';
            const actionCls = equipped ? 'equipped' : 'owned';
            const itemCls = 'shop-item' + (equipped ? ' equipped' : '');
            return `
              <div class="${itemCls}" onclick="equipEmoji('${safe}')">
                <div class="shop-emoji">${item.e}</div>
                <div class="shop-name">${item.name}</div>
                <div class="shop-action ${actionCls}">${actionLabel}</div>
              </div>
            `;
          }
          return `
            <div class="shop-item" style="cursor:default">
              <div class="shop-emoji">${item.e}</div>
              <div class="shop-name">${item.name}</div>
              <div class="shop-action ${item.rarity}">${item.rarity.toUpperCase()}</div>
            </div>
          `;
        }).join('')}
      </div>
    </div>
  `).join('');
}

let _friendProfileIdx = null;
function openFriendProfile(idx) {
  const f = state.friends && state.friends[idx];
  if (!f) return;
  _friendProfileIdx = idx;
  const synth = getFriendSyntheticProfile(f);
  const tier = getTier(synth.elo);

  document.getElementById('fp-avatar').textContent = f.avatar || '🤖';
  document.getElementById('fp-name').textContent = f.name;
  const tierEl = document.getElementById('fp-tier');
  tierEl.textContent = `${tier.name} · ${synth.elo} ELO`;
  tierEl.style.color = tier.color;

  // Online/offline status — same source of truth as the friends list
  const online = isFriendOnline(f);
  const statusEl = document.getElementById('fp-status');
  statusEl.classList.remove('online', 'offline');
  statusEl.classList.add(online ? 'online' : 'offline');
  document.getElementById('fp-status-label').textContent = online ? 'Online' : 'Offline';

  document.getElementById('fp-wins').textContent = synth.wins;
  document.getElementById('fp-winrate').textContent = synth.winRatePct + '%';
  document.getElementById('fp-earned').textContent = synth.earned;
  document.getElementById('fp-streak').textContent = synth.streak;
  document.getElementById('fp-trophies').textContent = synth.trophies;
  document.getElementById('fp-games').textContent = synth.games;

  document.getElementById('fp-collection-count').textContent = synth.collection.length;
  const collEl = document.getElementById('fp-collection');
  collEl.innerHTML = renderOwnedCollectionHtml(synth.collection);

  // Wire the remove button (closure over current idx) — uses the generic confirm modal.
  const rmBtn = document.getElementById('fp-remove-btn');
  rmBtn.onclick = () => {
    if (!state.friends || !state.friends[_friendProfileIdx]) return;
    const friendName = state.friends[_friendProfileIdx].name;
    openModal('Remove ' + friendName + '?',
      `Are you sure you want to remove <strong style="color:var(--text)">${friendName}</strong> from your friends list?`,
      () => {
        if (!state.friends || !state.friends[_friendProfileIdx]) return;
        const stillThereName = state.friends[_friendProfileIdx].name;
        // Verify the friend at this idx is the same one (defensive — list could change)
        if (stillThereName !== friendName) return;
        state.friends.splice(_friendProfileIdx, 1);
        saveState();
        updateHeader();
        toast('Removed ' + friendName);
        showView('friends');
        renderFriends();
      }
    );
  };

  // Wire Request Match button — same economics as regular PvP (1 token, ranked).
  const vsBtn = document.getElementById('fp-vs-btn');
  vsBtn.onclick = () => {
    requestFriendMatch(_friendProfileIdx);
  };

  showView('friend-profile');
}

/* Friend match request — costs PVP_TIER.entry, plays at PVP_TIER prize, but the
   opponent identity is locked to the chosen friend (name, avatar, ELO from synth profile). */
function requestFriendMatch(idx) {
  const f = state.friends && state.friends[idx];
  if (!f) return;
  const tier = PVP_TIER;
  if (state.balance < tier.entry) {
    toast('Not enough tokens! Need ' + tier.entry + '.');
    return;
  }
  const synth = getPlayerSyntheticProfile(f.name, f.avatar);
  state.balance -= tier.entry;
  updateBalance();
  toast('Match request sent — ' + f.name + ' accepted!');
  if (navigator.vibrate) navigator.vibrate(15);
  // Brief delay to feel like a real "request → accepted" handshake
  setTimeout(() => {
    startGame('pvp', tier.entry, tier.prize, f.name, f.avatar || '🤖', tier.bo, synth.elo);
  }, 600);
}

function isStandalone() {
  return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
}
function isIOS() {
  return /iphone|ipad|ipod/i.test(navigator.userAgent) && !window.MSStream;
}
function dismissInstall() {
  document.getElementById('install-hint').classList.remove('show');
  try { localStorage.setItem('rps-install-dismissed', '1'); } catch(e) {}
}

/* ---- INIT ---- */
updateBalance();
updateHeader();
initTourneys();
refreshFeatured();

if (isIOS() && !isStandalone()) {
  try {
    if (!localStorage.getItem('rps-install-dismissed')) {
      document.getElementById('install-hint').classList.add('show');
    }
  } catch(e) {}
}

document.addEventListener('touchmove', (e) => {
  if (e.target.closest('.view-wrap, .bracket-wrap, .shop-tabs')) return;
  if (e.touches.length > 1) e.preventDefault();
}, { passive: false });

let lastTouch = 0;
document.addEventListener('touchend', (e) => {
  const now = Date.now();
  if (now - lastTouch <= 300) e.preventDefault();
  lastTouch = now;
}, { passive: false });
