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
const PVP_TIER = { label:'Ranked', entry:1, oppElo:1100, prize:3 };

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
    if (raw) return { ...DEFAULT_STATE, ...JSON.parse(raw) };
    // migrate v2
    const v2 = localStorage.getItem('rps-arena-state-v2');
    if (v2) {
      const old = JSON.parse(v2);
      const newBalance = Math.max(10, Math.floor((old.balance || 1000) / 100));
      return {
        ...DEFAULT_STATE,
        username: old.username || 'Player',
        avatar: old.avatar || '😀',
        ownedEmojis: (old.ownedEmojis || ['😀']).filter(e => e !== '🪨'),
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

/* DAILY FEATURED */
function todayKey() {
  const d = new Date();
  return d.getFullYear() + '-' + (d.getMonth()+1) + '-' + d.getDate();
}
function refreshFeatured() {
  const today = todayKey();
  const pool = getShopPool();
  // Verify cached featured: if any cached emoji is no longer in the allowed pool
  // (e.g. it became challenge-locked, or its category was removed), force a re-roll.
  if (state.featuredDate === today && state.featuredEmojis && state.featuredEmojis.length > 0) {
    const allowed = new Set(pool.map(e => e.e));
    const allValid = state.featuredEmojis.every(e => allowed.has(e));
    if (allValid) return;
  }
  const seed = today.split('-').reduce((a,b) => a + parseInt(b), 0);
  const picks = [];
  let s = seed;
  const seen = new Set();
  while (picks.length < 4 && seen.size < pool.length) {
    s = (s * 9301 + 49297) % 233280;
    const idx = Math.floor(s / 233280 * pool.length);
    if (!seen.has(idx)) { seen.add(idx); picks.push(pool[idx].e); }
  }
  state.featuredDate = today;
  state.featuredEmojis = picks;
  saveState();
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
  document.getElementById('pvp-entry-display').textContent = `Entry: ${t.entry} token${t.entry>1?'s':''}`;
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
    startGame('pvp', tier.entry, tier.prize, botName(), oppEmoji, 3, oppElo);
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
  runtime.gameState = { entry, prize, opp: oppN, oppAvatar, scoreYou: 0, scoreOpp: 0, round: 1, bo, done: false, oppElo };
  document.getElementById('opp-name').textContent = oppN;
  document.getElementById('opp-avatar').textContent = oppAvatar;
  document.getElementById('you-avatar').textContent = state.avatar;
  document.getElementById('you-name').textContent = state.username;
  document.getElementById('score-you').textContent = 0;
  document.getElementById('score-opp').textContent = 0;
  document.getElementById('stake-label').textContent = entry > 0
    ? entry + ' token entry'
    : (mode === 'streak' ? 'Streak Run' : 'Free play');
  document.getElementById('round-label').textContent = 'Best of ' + bo;
  document.getElementById('round-info').textContent = 'Round 1 of ' + bo + ' — make your pick';
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
  const youEl = document.getElementById('choice-you');
  const oppEl = document.getElementById('choice-opp');
  youEl.textContent = emojis[choice];
  youEl.classList.add('reveal');
  if (navigator.vibrate) navigator.vibrate(8);

  setTimeout(() => {
    oppEl.textContent = emojis[oppChoice];
    oppEl.classList.add('reveal');
    const rr = document.getElementById('round-result');
    if (choice === oppChoice) { rr.textContent = 'DRAW'; rr.className = 'choice-result draw'; }
    else if (beats(choice, oppChoice)) { g.scoreYou++; rr.textContent = 'WIN'; rr.className = 'choice-result win'; if(navigator.vibrate)navigator.vibrate([20,30,20]); }
    else { g.scoreOpp++; rr.textContent = 'LOSE'; rr.className = 'choice-result lose'; if(navigator.vibrate)navigator.vibrate(40); }
    document.getElementById('score-you').textContent = g.scoreYou;
    document.getElementById('score-opp').textContent = g.scoreOpp;
    const winThreshold = Math.ceil(g.bo / 2);
    const over = g.scoreYou >= winThreshold || g.scoreOpp >= winThreshold || g.round >= g.bo;
    if (over) {
      setTimeout(() => endGame(g), 700);
    } else {
      g.round++;
      document.getElementById('round-info').textContent = 'Round ' + g.round + ' of ' + g.bo + ' — make your pick';
      setTimeout(() => {
        youEl.textContent = '?'; youEl.classList.remove('reveal');
        oppEl.textContent = '?'; oppEl.classList.remove('reveal');
        rr.textContent = '';
        ['btn-rock','btn-paper','btn-scissors'].forEach(id => document.getElementById(id).disabled = false);
      }, 850);
    }
  }, 450);
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
      // Consecutive PvP win streak
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
  if (runtime.currentMode === 'tourney') showLobbyBracket(runtime.activeTourney);
  else if (runtime.currentMode === 'streak') endStreakRun();
  else showView('lobby');
}

/* ---- TOURNAMENTS ---- */
const TOURNEY_TEMPLATES = [
  { name: 'Mystery Emoji Cup', entry: 10, prize: 0, slots: 4, special: 'emoji' },
  { name: 'Beginner Bash',  entry: 1,  prize: 6,  slots: 7, special: false },
  { name: 'Weekend Brawl',  entry: 2,  prize: 12, slots: 5, special: false },
  { name: 'Coin Clashers',  entry: 3,  prize: 20, slots: 6, special: false },
  { name: 'Elite Cup',      entry: 5,  prize: 35, slots: 3, special: false },
];

function initTourneys() {
  if (!state.tournaments || !state.tournaments.length) {
    state.tournaments = TOURNEY_TEMPLATES.map((t, i) => ({
      ...t, id: i, joined: false, bracket: null, complete: false,
    }));
    saveState();
  } else {
    // Migrate: re-order existing tournaments to match TOURNEY_TEMPLATES.
    // Preserve per-tourney user state (joined, bracket, complete, slots) by name match;
    // any new templates not present get added; ids are reassigned to new positions.
    const byName = {};
    for (const t of state.tournaments) byName[t.name] = t;
    state.tournaments = TOURNEY_TEMPLATES.map((tpl, i) => {
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
    saveState();
  }
}

function renderTourneyList() {
  initTourneys();
  const el = document.getElementById('tourney-list');
  el.innerHTML = state.tournaments.map(t => {
    const status = t.complete ? '<span style="font-size:10px;background:rgba(136,136,136,.2);color:var(--muted);padding:2px 6px;border-radius:3px">DONE</span>'
      : t.joined ? '<span style="font-size:10px;background:rgba(201,168,76,.2);color:var(--gold);padding:2px 6px;border-radius:3px">JOINED</span>' : '';
    const specialBadge = t.special === 'emoji' ? '<span style="font-size:10px;background:rgba(169,107,255,.2);color:var(--epic);padding:2px 6px;border-radius:3px">SPECIAL</span>' : '';
    const prizeDisplay = t.special === 'emoji'
      ? `<div class="tourney-prize emoji-prize">🎁</div><div class="tourney-entry">Mystery Emoji</div>`
      : `<div class="tourney-prize">🏆 ${t.prize}</div><div class="tourney-entry">Prize Pool</div>`;
    const cardClass = 'tourney-card' + (t.joined ? ' active-tourney' : '') + (t.special ? ' special' : '');
    return `
      <div class="${cardClass}">
        <div class="tourney-info">
          <div class="tourney-name">${t.name} ${specialBadge} ${status}</div>
          <div class="tourney-meta">
            <span>▣ ${t.entry} entry</span>
            <span>👥 ${t.slots} spots</span>
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
  openModal('Join ' + t.name + '?',
    `Entry: <strong style="color:var(--gold)">${t.entry} token${t.entry>1?'s':''}</strong><br>${prizeText}<br>Format: 8-player single elimination, best of 3.`,
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
  const names = [...PVP_NAMES];
  for (let i = names.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [names[i], names[j]] = [names[j], names[i]];
  }
  const players = ['You', ...names.slice(0, 7)];
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
      const p1Display = m.p1 === 'You' ? state.username : (m.p1 || 'TBD');
      const p2Display = m.p2 === 'You' ? state.username : (m.p2 || 'TBD');
      div.innerHTML = `
        <div class="bracket-player ${p1class}">${p1Display}<span class="bracket-score">${m.s1 !== null ? m.s1 : ''}</span></div>
        <div class="bracket-player ${p2class}">${p2Display}<span class="bracket-score">${m.s2 !== null ? m.s2 : ''}</span></div>
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
  // Random emoji avatar for tournament opponents
  const oppEmoji = randomBotEmoji();
  startGame('tourney', 0, prizeForWinner, opp, oppEmoji, 3);
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
function saveName() {
  const v = document.getElementById('name-input').value.trim().slice(0, 16);
  if (!v) { toast('Name cannot be empty'); return; }
  state.username = v;
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
    const item = EMOJI_CATALOG.find(x => x.e === e);
    if (!item) return '';
    return shopItemHtml(item);
  }).join('');
}

/* ---- CHALLENGE DEFINITIONS ----
   Each challenge unlocks a specific emoji. Some emojis already exist in the
   catalog (and stay buyable normally) but completing the challenge grants them
   for free. */
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
  {
    id: 'win_100',
    emoji: '🗿',
    name: 'Stone Cold',
    desc: 'Win 100 matches.',
    progress: () => [{ current: Math.min(state.wins || 0, 100), goal: 100, label: 'matches won' }],
  },
  {
    id: 'win_50',
    emoji: '👽',
    name: 'Out of This World',
    desc: 'Win 50 matches.',
    progress: () => [{ current: Math.min(state.wins || 0, 50), goal: 50, label: 'matches won' }],
  },
  {
    id: 'draw_30',
    emoji: '🤓',
    name: 'Mind Reader',
    desc: 'Draw 30 matches.',
    progress: () => [{ current: Math.min(state.draws || 0, 30), goal: 30, label: 'matches drawn' }],
  },
  {
    id: 'lose_30',
    emoji: '🥀',
    name: 'Wilted',
    desc: 'Lose 30 matches.',
    progress: () => [{ current: Math.min(state.losses || 0, 30), goal: 30, label: 'matches lost' }],
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
    desc: 'Own 10 emojis.',
    progress: () => [{ current: Math.min(state.ownedEmojis.length, 10), goal: 10, label: 'emojis owned' }],
  },
  {
    id: 'top_tier',
    emoji: '🧠',
    name: 'Big Brain',
    desc: 'Reach the highest ELO tier (Grandmaster).',
    progress: () => {
      const top = ELO_TIERS[ELO_TIERS.length - 1].min; // 2100
      return [{ current: Math.min(state.bestElo || state.elo, top), goal: top, label: 'best ELO' }];
    },
  },
  {
    id: 'rock_bottom',
    emoji: '🪤',
    name: 'Mouse Trap',
    desc: 'Reach 0 ELO.',
    progress: () => {
      // Goal is "lowest ELO must equal 0". Show inverted bar: lower lowestElo = more progress.
      const start = 1000;
      const lowest = state.lowestElo === undefined ? state.elo : state.lowestElo;
      const dropped = Math.max(0, start - lowest);
      return [{ current: Math.min(dropped, start), goal: start, label: lowest <= 0 ? 'reached 0 ELO' : 'ELO at ' + lowest }];
    },
  },
];

function isChallengeComplete(c) {
  return c.progress().every(p => p.current >= p.goal);
}

function renderChallenges() {
  const list = document.getElementById('challenges-list');
  list.innerHTML = CHALLENGE_DEFS.map(c => {
    const owned = state.ownedEmojis.includes(c.emoji);
    const claimed = (state.claimedChallenges || []).includes(c.id);
    const complete = isChallengeComplete(c);
    const equipped = state.avatar === c.emoji;

    let action;
    if (equipped) {
      action = '<div class="shop-action equipped" style="margin-top:6px">EQUIPPED</div>';
    } else if (owned) {
      action = `<button onclick="equipEmoji('${c.emoji}')" style="margin-top:6px;background:var(--gold);color:#000;border:none;border-radius:6px;padding:6px 12px;cursor:pointer;font-size:11px;font-weight:700;letter-spacing:.05em">EQUIP</button>`;
    } else if (complete && !claimed) {
      action = `<button onclick="claimChallenge('${c.id}')" style="margin-top:6px;background:var(--success);color:#fff;border:none;border-radius:6px;padding:6px 12px;cursor:pointer;font-size:11px;font-weight:700;letter-spacing:.05em">CLAIM ${c.emoji}</button>`;
    } else {
      action = '<div class="shop-action locked" style="margin-top:6px">LOCKED</div>';
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
  state.avatar = e;
  saveState();
  updateHeader();
  renderShop();
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
  // Returns the set of emojis tied to a challenge. Includes Rock + all CHALLENGE_DEFS emojis.
  const set = new Set([ROCK_EMOJI]);
  if (typeof CHALLENGE_DEFS !== 'undefined') {
    for (const c of CHALLENGE_DEFS) set.add(c.emoji);
  }
  return set;
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
    // "Owned" virtual tab: every emoji the user owns, regardless of category. Includes
    // challenge-claimed emojis so users can find/equip them here too.
    filtered = EMOJI_CATALOG.filter(e => state.ownedEmojis.includes(e.e));
  } else if (runtime.shopCat === 'all') {
    filtered = pool;
  } else {
    filtered = pool.filter(e => e.cat === runtime.shopCat);
  }

  // DESCENDING rarity (best first)
  const rarityOrder = ['legendary', 'epic', 'rare', 'common'];
  const byRarity = {};
  for (const r of rarityOrder) byRarity[r] = [];
  for (const item of filtered) byRarity[item.rarity].push(item);

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
  const item = EMOJI_CATALOG.find(e => e.e === emoji);
  if (!item) return;
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

/* ---- FRIENDS LIST ---- */
function renderFriends() {
  const list = document.getElementById('friends-list');
  if (!state.friends || state.friends.length === 0) {
    list.innerHTML = '<div class="empty-state">No friends yet.<br>Add someone above, or tap a recent opponent in your match history.</div>';
    return;
  }
  list.innerHTML = state.friends.map((f, idx) => `
    <div class="friend-item">
      <div class="friend-avatar">${f.avatar || '🤖'}</div>
      <div class="friend-info">
        <div class="friend-name">${f.name}</div>
        <div class="friend-meta">Added ${f.addedAt || 'recently'}</div>
      </div>
      <button class="friend-remove" onclick="removeFriend(${idx})">Remove</button>
    </div>
  `).join('');
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

/* ---- PLAYER PROFILE VIEW (from history; mirrors the Profile tab) ----
   The opponent has no real persistent state, so all stats here are head-to-head
   computed against the player's own history. Layout deliberately mirrors the
   Profile tab so it feels like a real player profile, just adapted for context. */
let _playerViewContext = null; // { name, avatar }

function openPlayerProfile(historyIdx) {
  const h = state.history[historyIdx];
  if (!h) return;
  const oppName = h.opp;
  const oppAvatar = h.oppAvatar || '🤖';
  _playerViewContext = { name: oppName, avatar: oppAvatar };

  // All recorded matches between this player and the user (across modes)
  const matches = state.history.filter(x => x.opp === oppName);

  // From the opponent's perspective: their wins are when YOU lost, etc.
  const theirWins   = matches.filter(x => x.result === 'L').length;
  const yourWins    = matches.filter(x => x.result === 'W').length;
  const draws       = matches.filter(x => x.result === 'D').length;
  const total       = matches.length;
  const tourneyMet  = matches.filter(x => x.mode === 'Tourney').length;

  // Net ELO impact this player has had on you (positive = they cost you ELO overall)
  // h.eloDelta is YOUR delta after each match; flip sign for "their impact on you".
  const netEloImpact = matches.reduce((acc, m) => acc + (m.eloDelta ? -m.eloDelta : 0), 0);

  // Best run of consecutive wins THEY had against you (i.e. consecutive 'L' results in our history)
  let bestStreakVsYou = 0, run = 0;
  // Iterate in chronological order (history is reverse-chrono, so reverse it)
  for (const m of [...matches].reverse()) {
    if (m.result === 'L') { run++; if (run > bestStreakVsYou) bestStreakVsYou = run; }
    else run = 0;
  }

  // Use the most recent match's recorded ELO (or 1000 fallback for streak/tourney rows)
  const oppElo = h.oppElo || 1000;
  const oppTier = getTier(oppElo);

  document.getElementById('player-avatar').textContent = oppAvatar;
  document.getElementById('player-name').textContent = oppName;
  const tierEl = document.getElementById('player-tier');
  tierEl.textContent = `${oppTier.name} · ${oppElo} ELO`;
  tierEl.style.color = oppTier.color;

  document.getElementById('pp-wins').textContent = theirWins;
  document.getElementById('pp-winrate').textContent = total > 0 ? Math.round(theirWins / total * 100) + '%' : '—';
  const impactEl = document.getElementById('pp-elo-impact');
  impactEl.textContent = (netEloImpact > 0 ? '+' : '') + netEloImpact;
  impactEl.style.color = netEloImpact > 0 ? 'var(--danger)' : (netEloImpact < 0 ? 'var(--success)' : 'var(--gold)');
  document.getElementById('pp-streak').textContent = bestStreakVsYou;
  document.getElementById('pp-tourney-met').textContent = tourneyMet;
  document.getElementById('pp-games').textContent = total;

  // Render their match list (W/L/D from THEIR perspective so it reads like their history)
  const phist = document.getElementById('pp-history');
  if (matches.length === 0) {
    phist.innerHTML = '<div class="empty-state">No recorded matches.</div>';
  } else {
    phist.innerHTML = matches.map(m => {
      // Flip result perspective: your W is their L
      const flipped = m.result === 'W' ? 'L' : (m.result === 'L' ? 'W' : 'D');
      const eloFlip = m.eloDelta ? -m.eloDelta : 0;
      let eloDisplay;
      if (eloFlip !== 0) {
        const cls = eloFlip > 0 ? 'pos' : 'neg';
        const sign = eloFlip > 0 ? '+' : '';
        eloDisplay = `<span class="hist-elo ${cls}">${sign}${eloFlip}</span>`;
      } else {
        eloDisplay = `<span class="hist-elo zero">—</span>`;
      }
      return `
        <div class="history-item" style="cursor:default">
          <span class="hist-result ${flipped}">${flipped}</span>
          <div style="flex:1;min-width:0;font-size:12px">
            <div class="hist-opp-row"><span class="hist-opp-avatar">${state.avatar}</span> <span>vs ${state.username}</span></div>
            <div style="color:var(--muted);font-size:10px;font-weight:500">${m.mode} · ${m.time}</div>
          </div>
          <span style="color:var(--muted);font-size:11px">${m.score}</span>
          ${eloDisplay}
        </div>
      `;
    }).join('');
  }

  // Friend button state
  const friendBtn = document.getElementById('pp-friend-btn');
  const isFriend = (state.friends || []).some(f => f.name === oppName);
  if (isFriend) {
    friendBtn.disabled = true;
    friendBtn.style.opacity = '0.5';
    friendBtn.style.cursor = 'not-allowed';
    friendBtn.style.background = 'var(--surface2)';
    friendBtn.style.color = 'var(--muted)';
    friendBtn.textContent = 'Already Friends';
  } else {
    friendBtn.disabled = false;
    friendBtn.style.opacity = '1';
    friendBtn.style.cursor = 'pointer';
    friendBtn.style.background = 'var(--accent)';
    friendBtn.style.color = '#fff';
    friendBtn.textContent = 'Add Friend';
  }

  showView('player');
}

function addFriendFromPlayerView() {
  if (!_playerViewContext) return;
  if (!state.friends) state.friends = [];
  if (state.friends.some(f => f.name === _playerViewContext.name)) {
    toast('Already friends');
    return;
  }
  state.friends.unshift({
    name: _playerViewContext.name,
    avatar: _playerViewContext.avatar,
    addedAt: new Date().toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
  });
  saveState();
  updateHeader();
  toast('Added ' + _playerViewContext.name);
  // Refresh view to update button state
  const btn = document.getElementById('pp-friend-btn');
  if (btn) {
    btn.disabled = true;
    btn.style.opacity = '0.5';
    btn.style.background = 'var(--surface2)';
    btn.style.color = 'var(--muted)';
    btn.textContent = 'Already Friends';
  }
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
