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

// Single PvP match config
const PVP_MATCH = { label:'Ranked', entry:2, prize:4 };

// ELO tiers — scaled for ±75 to ±135 swings
const ELO_TIERS = [
  { name:'Bronze',      min:0,    max:1500,  color:'#cd7f32' },
  { name:'Silver',      min:1500, max:2300,  color:'#c0c0c0' },
  { name:'Gold',        min:2300, max:3100,  color:'#c9a84c' },
  { name:'Platinum',    min:3100, max:3900,  color:'#7fbab0' },
  { name:'Diamond',     min:3900, max:4700,  color:'#9ddffa' },
  { name:'Master',      min:4700, max:5500,  color:'#a96bff' },
  { name:'Grandmaster', min:5500, max:99999, color:'#e24b4a' },
];

// AI opponent emoji pool (used for streak bot + tourney + pvp opponents)
const AI_EMOJIS = ['🤖','😈','🥷','🧙','👽','💀','👻','🤡','🦊','🐺','🦁','🐉','🦈','⚡','🔥','💎','👑','🐲','🦅','🐯'];

const DEFAULT_STATE = {
  username: 'Player',
  avatar: '😀',
  ownedEmojis: ['😀'],
  balance: 10,    // tokens
  elo: 1000,
  wins: 0,
  games: 0,
  earned: 0,      // tokens earned net
  bestStreak: 0,
  tourneysWon: 0,
  history: [],
  tournaments: null,
  hasReset: false,
  lastRewardedStreak: 0,
  // Daily featured
  featuredDate: null,
  featuredEmojis: [],
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
      // convert coins to tokens roughly: balance / 50 (since old prices were 10-500, new is 1-5)
      const newBalance = Math.max(10, Math.floor((old.balance || 1000) / 100));
      return {
        ...DEFAULT_STATE,
        username: old.username || 'Player',
        avatar: old.avatar || '😀',
        ownedEmojis: (old.ownedEmojis || ['😀']).filter(e => e !== '🪨'), // strip rock if owned
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
function aiEmoji(){return rnd(AI_EMOJIS)}

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
  if (state.featuredDate === today && state.featuredEmojis && state.featuredEmojis.length > 0) return;
  // Pick 4 random emojis from the catalog (excluding rock)
  const pool = EMOJI_CATALOG.filter(e => e.e !== ROCK_EMOJI);
  const seed = today.split('-').reduce((a,b) => a + parseInt(b), 0);
  // deterministic selection per day
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
  document.body.classList.toggle('in-match', id === 'game');
  updateHeader();
}

function showLobbySection(name) {
  document.getElementById('lobby-pvp').style.display = name === 'pvp' ? 'flex' : 'none';
  document.getElementById('lobby-tourney').style.display = name === 'tourney' ? 'flex' : 'none';
  document.getElementById('lobby-bracket').style.display = 'none';
  document.getElementById('pvp-searching').style.display = 'none';
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

/* PvP — single match */
function eloRandom() {
  // returns int in [75, 135] inclusive
  return Math.floor(Math.random() * 61) + 75;
}

function startFindMatch() {
  const e = document.getElementById('pvp-error');
  if (state.balance < PVP_MATCH.entry) {
    e.textContent = `Not enough tokens! Need ${PVP_MATCH.entry}.`;
    e.style.display = 'block';
    return;
  }
  e.style.display = 'none';
  state.balance -= PVP_MATCH.entry; updateBalance();
  document.getElementById('lobby-pvp').style.display = 'none';
  document.getElementById('pvp-searching').style.display = 'block';
  document.getElementById('search-entry-display').textContent = PVP_MATCH.entry + (PVP_MATCH.entry > 1 ? ' tokens' : ' token');
  runtime.searchTimer = setTimeout(() => {
    // Opponent ELO drifts around player's ELO so the match feels matched
    const oppElo = Math.max(500, state.elo + Math.floor((Math.random() - 0.5) * 400));
    startGame('pvp', PVP_MATCH.entry, PVP_MATCH.prize, pvpName(), aiEmoji(), 3, oppElo);
  }, Math.random() * 2000 + 1200);
}

function cancelSearch() {
  clearTimeout(runtime.searchTimer);
  state.balance += PVP_MATCH.entry; updateBalance();
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
    : (mode === 'streak' ? 'Streak Run' : 'Tournament');
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

  // ELO display in match (PvP only)
  const youEloEl = document.getElementById('you-elo');
  const oppEloEl = document.getElementById('opp-elo');
  if (mode === 'pvp') {
    if (youEloEl) { youEloEl.style.display = 'block'; youEloEl.textContent = state.elo + ' ELO'; }
    if (oppEloEl) { oppEloEl.style.display = 'block'; oppEloEl.textContent = oppElo + ' ELO'; }
  } else {
    if (youEloEl) youEloEl.style.display = 'none';
    if (oppEloEl) oppEloEl.style.display = 'none';
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
  // No emoji shown — clear it
  const remoji = document.getElementById('result-emoji');
  if (remoji) remoji.style.display = 'none';
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
    // ELO: random ±75 to ±135 on win/loss, 0 on draw
    if (won) eloDelta = eloRandom();
    else if (draw) eloDelta = 0;
    else eloDelta = -eloRandom();
    state.elo = Math.max(0, state.elo + eloDelta);

    let title, detail, type;
    if (won) {
      state.wins++;
      delta = g.prize;
      state.balance += g.prize; state.earned += g.prize;
      type = 'win';
      title = 'YOU WIN';
      detail = `+${g.prize} tokens`;
      if (navigator.vibrate) navigator.vibrate([30, 50, 30, 50, 30]);
    } else if (draw) {
      delta = g.entry;
      state.balance += g.entry;
      type = 'draw';
      title = 'DRAW';
      detail = 'Entry refunded';
    } else {
      type = 'lose';
      title = 'DEFEATED';
      detail = `-${g.entry} token${g.entry>1?'s':''}`;
      delta = -g.entry;
      if (navigator.vibrate) navigator.vibrate(80);
    }

    state.history.unshift({
      opp: g.opp, oppAvatar: g.oppAvatar,
      result: won ? 'W' : draw ? 'D' : 'L',
      score: g.scoreYou + '-' + g.scoreOpp,
      eloDelta, mode: 'PvP',
      time: new Date().toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }),
    });

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
      type = 'win'; title = 'ADVANCED'; detail = 'You move on in the bracket';
      actions = '<button class="primary" onclick="closeResultPopup();onTourneyMatchContinue(true)">Continue</button>';
    } else if (draw) {
      type = 'draw'; title = 'DRAW'; detail = 'Replaying the match';
      actions = '<button class="primary" onclick="closeResultPopup();replayTourneyMatch()">Replay</button>';
    } else {
      type = 'lose'; title = 'ELIMINATED'; detail = 'Your tournament run ends here';
      actions = '<button class="primary" onclick="closeResultPopup();onTourneyMatchContinue(false)">Continue</button>';
    }
    // Don't record draws in history (since we're replaying), record win/loss
    if (!draw) {
      state.history.unshift({
        opp: g.opp, oppAvatar: g.oppAvatar,
        result: won ? 'W' : 'L',
        score: g.scoreYou + '-' + g.scoreOpp,
        eloDelta: 0, mode: 'Tourney',
        time: new Date().toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }),
      });
    }
    if (state.history.length > 100) state.history = state.history.slice(0, 100);
    saveState();
    showResultPopup(type, { title, detail, actions });
  }
}

/* ---- STREAK MODE ---- */
function startStreakRun() {
  // Pick a single bot (name + emoji) for the entire run
  state.currentStreakBot = botName();
  state.currentStreakBotAvatar = aiEmoji();
  saveState();
  runtime.streakState = { current: 0, strikes: 0, gamesInRun: 0 };
  startStreakMatch();
}

function startStreakMatch() {
  startGame('streak', 0, 0, state.currentStreakBot || botName(), state.currentStreakBotAvatar || aiEmoji(), 3);
}

function handleStreakEnd(won, draw) {
  const ss = runtime.streakState;
  ss.gamesInRun = (ss.gamesInRun || 0);

  // Counts as ONE game in stats only at end of run, not per match
  // So decrement the games counter that was incremented in endGame
  state.games--;

  let type, title, detail, actions;
  if (won) {
    ss.current++;
    let newRecord = false;
    if (ss.current > state.bestStreak) {
      state.bestStreak = ss.current;
      newRecord = true;
    }

    // Reward at 5+ on new high score
    let rewardEmoji = null;
    if (newRecord && ss.current >= 5 && ss.current > state.lastRewardedStreak) {
      const unowned = EMOJI_CATALOG.filter(em => !state.ownedEmojis.includes(em.e) && em.e !== ROCK_EMOJI);
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
      // Run over - count one game in stats
      state.games++;
      saveState();
      // Add ONE history entry summarizing the run
      state.history.unshift({
        opp: state.currentStreakBot,
        oppAvatar: state.currentStreakBotAvatar || '🤖',
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
  state.currentStreakBotAvatar = null;
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
  { name: 'Mystery Cup', entry: 10, prize: 0, slots: 4, special: true, prizeLabel: '🎁 Random Emoji' },
  { name: 'Beginner Bash', entry: 1, prize: 6, slots: 7 },
  { name: 'Weekend Brawl', entry: 2, prize: 12, slots: 5 },
  { name: 'Coin Clashers', entry: 3, prize: 20, slots: 6 },
  { name: 'Elite Cup', entry: 5, prize: 35, slots: 3 },
];

function initTourneys() {
  // refresh if mystery cup is missing (migrating from older saves)
  if (!state.tournaments || !state.tournaments.length || !state.tournaments.find(t => t.name === 'Mystery Cup')) {
    state.tournaments = TOURNEY_TEMPLATES.map((t, i) => ({
      ...t, id: i, joined: false, bracket: null, complete: false,
    }));
    saveState();
  }
}

function renderTourneyList() {
  initTourneys();
  const el = document.getElementById('tourney-list');
  el.innerHTML = state.tournaments.map(t => {
    const status = t.complete ? '<span style="font-size:10px;background:rgba(136,136,136,.2);color:var(--muted);padding:2px 6px;border-radius:3px">DONE</span>'
      : t.joined ? '<span style="font-size:10px;background:rgba(201,168,76,.2);color:var(--gold);padding:2px 6px;border-radius:3px">JOINED</span>' : '';
    const prizeBlock = t.special
      ? `<div class="tourney-prize special">${t.prizeLabel}</div><div class="tourney-entry">Win = unlock</div>`
      : `<div class="tourney-prize">🏆 ${t.prize}</div><div class="tourney-entry">Prize Pool</div>`;
    const playerCount = t.special ? 4 : 8;
    return `
      <div class="tourney-card ${t.joined ? 'active-tourney' : ''} ${t.special ? 'special' : ''}">
        <div class="tourney-info">
          <div class="tourney-name">${t.name} ${status}</div>
          <div class="tourney-meta">
            <span>▣ ${t.entry} entry</span>
            <span>👥 ${t.slots} spots</span>
            <span>${playerCount}-player</span>
          </div>
        </div>
        <div>
          ${prizeBlock}
          ${t.joined
            ? `<button class="join-btn ${t.special ? 'special' : ''}" onclick="showLobbyBracket(${t.id})">${t.complete ? 'View' : 'Play'}</button>`
            : `<button class="join-btn ${t.special ? 'special' : ''}" onclick="promptJoinTourney(${t.id})">Join</button>`}
        </div>
      </div>
    `;
  }).join('');
}

function promptJoinTourney(id) {
  const t = state.tournaments[id];
  const prizeText = t.special
    ? `Prize: <strong style="color:var(--epic)">Random emoji</strong> you don't already own`
    : `Prize pool: <strong style="color:var(--gold)">${t.prize} tokens</strong>`;
  const playerCount = t.special ? 4 : 8;
  openModal('Join ' + t.name + '?',
    `Entry: <strong style="color:var(--gold)">${t.entry} token${t.entry>1?'s':''}</strong><br>${prizeText}<br>Format: ${playerCount}-player single elimination, best of 3.`,
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
  const playerCount = t.special ? 4 : 8;
  const players = ['You', ...names.slice(0, playerCount - 1)];
  const playerAvatars = [state.avatar].concat(Array.from({length: playerCount - 1}, () => aiEmoji()));

  if (playerCount === 4) {
    // 4-player: 2 SF + 1 final
    const sf = [
      { p1: players[0], p2: players[1], p1Avatar: playerAvatars[0], p2Avatar: playerAvatars[1], s1: null, s2: null, done: false },
      { p1: players[2], p2: players[3], p1Avatar: playerAvatars[2], p2Avatar: playerAvatars[3], s1: null, s2: null, done: false },
    ];
    const fin = [{ p1: null, p2: null, p1Avatar: null, p2Avatar: null, s1: null, s2: null, done: false }];
    // Simulate the SF you're not in
    const idxYou = sf.findIndex(m => m.p1 === 'You' || m.p2 === 'You');
    const otherIdx = 1 - idxYou;
    const otherM = sf[otherIdx];
    const w = Math.random() < 0.5 ? otherM.p1 : otherM.p2;
    otherM.s1 = otherM.p1 === w ? 2 : 1;
    otherM.s2 = otherM.p2 === w ? 2 : 1;
    otherM.done = true; otherM.winner = w;
    const wAv = otherM.p1 === w ? otherM.p1Avatar : otherM.p2Avatar;
    if (idxYou === 0) { fin[0].p2 = w; fin[0].p2Avatar = wAv; }
    else { fin[0].p1 = w; fin[0].p1Avatar = wAv; }
    return { rounds: [sf, fin] };
  }

  // 8-player
  const r1 = [
    { p1: players[0], p2: players[1], p1Avatar: playerAvatars[0], p2Avatar: playerAvatars[1], s1: null, s2: null, done: false },
    { p1: players[2], p2: players[3], p1Avatar: playerAvatars[2], p2Avatar: playerAvatars[3], s1: null, s2: null, done: false },
    { p1: players[4], p2: players[5], p1Avatar: playerAvatars[4], p2Avatar: playerAvatars[5], s1: null, s2: null, done: false },
    { p1: players[6], p2: players[7], p1Avatar: playerAvatars[6], p2Avatar: playerAvatars[7], s1: null, s2: null, done: false },
  ];
  const r2 = [
    { p1: null, p2: null, p1Avatar: null, p2Avatar: null, s1: null, s2: null, done: false },
    { p1: null, p2: null, p1Avatar: null, p2Avatar: null, s1: null, s2: null, done: false },
  ];
  const final = [{ p1: null, p2: null, p1Avatar: null, p2Avatar: null, s1: null, s2: null, done: false }];

  for (let i = 0; i < 4; i++) {
    const m = r1[i];
    if (m.p1 === 'You' || m.p2 === 'You') continue;
    const w = Math.random() < 0.5 ? m.p1 : m.p2;
    m.s1 = m.p1 === w ? 2 : 1;
    m.s2 = m.p2 === w ? 2 : 1;
    m.done = true; m.winner = w;
    const wAv = m.p1 === w ? m.p1Avatar : m.p2Avatar;
    const ri = Math.floor(i / 2);
    if (i % 2 === 0) { r2[ri].p1 = w; r2[ri].p1Avatar = wAv; }
    else { r2[ri].p2 = w; r2[ri].p2Avatar = wAv; }
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
  document.getElementById('bracket-prize').textContent = t.special ? '🎁' : '🏆 ' + t.prize;
  renderBracket(t);
  showView('lobby');
  document.getElementById('lobby-bracket').style.display = 'flex';
  setTimeout(() => document.getElementById('lobby-bracket').scrollIntoView({ behavior: 'smooth' }), 50);
}

function renderBracket(t) {
  const b = t.bracket;
  const roundNames = b.rounds.length === 2 ? ['Semi', 'Final'] : ['Quarter', 'Semi', 'Final'];
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
      statusText = ri === b.rounds.length - 1 ? 'FINAL — tap to play!' :
        ri === b.rounds.length - 2 ? 'Semifinal ready — tap to play!' :
        'Your match is ready — tap to play!';
      break;
    }
  }
  if (!statusText) {
    const fin = b.rounds[b.rounds.length - 1][0];
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
  const oppAvatar = m.p1 === 'You' ? m.p2Avatar : m.p1Avatar;
  const lastRound = roundIdx === t.bracket.rounds.length - 1;
  const prizeForWinner = lastRound ? t.prize : 0;
  startGame('tourney', 0, prizeForWinner, opp, oppAvatar || aiEmoji(), 3);
}

function replayTourneyMatch() {
  // Re-run the same bracket match (after a draw)
  const t = state.tournaments[runtime.activeTourney];
  const { roundIdx, matchIdx } = runtime.activeTourneyMatchIdx;
  const m = t.bracket.rounds[roundIdx][matchIdx];
  const opp = m.p1 === 'You' ? m.p2 : m.p1;
  const oppAvatar = m.p1 === 'You' ? m.p2Avatar : m.p1Avatar;
  startGame('tourney', 0, 0, opp, oppAvatar || aiEmoji(), 3);
}

function onTourneyMatchContinue(won) {
  // Called when user taps continue on result popup for a tourney match
  const t = state.tournaments[runtime.activeTourney];
  const { roundIdx, matchIdx } = runtime.activeTourneyMatchIdx;
  const m = t.bracket.rounds[roundIdx][matchIdx];
  const g = runtime.gameState;
  m.s1 = m.p1 === 'You' ? g.scoreYou : g.scoreOpp;
  m.s2 = m.p2 === 'You' ? g.scoreYou : g.scoreOpp;
  m.done = true;
  m.winner = won ? 'You' : (m.p1 === 'You' ? m.p2 : m.p1);
  const totalRounds = t.bracket.rounds.length;
  const nextRound = roundIdx + 1;

  // Advance the player into next round (works for both 2-round and 3-round brackets)
  if (won && nextRound < totalRounds) {
    const nextMatchIdx = Math.floor(matchIdx / 2);
    const nm = t.bracket.rounds[nextRound][nextMatchIdx];
    if (matchIdx % 2 === 0) { nm.p1 = 'You'; nm.p1Avatar = state.avatar; }
    else { nm.p2 = 'You'; nm.p2Avatar = state.avatar; }
  } else if (!won) {
    // Eliminated → simulate the rest of the bracket so it completes
    for (let ri = roundIdx; ri < totalRounds; ri++) {
      for (let mi = 0; mi < t.bracket.rounds[ri].length; mi++) {
        const mm = t.bracket.rounds[ri][mi];
        if (mm.done) continue;
        if (mm.p1 && mm.p2) {
          const w = Math.random() < 0.5 ? mm.p1 : mm.p2;
          mm.s1 = mm.p1 === w ? 2 : 1;
          mm.s2 = mm.p2 === w ? 2 : 1;
          mm.done = true; mm.winner = w;
          const wAv = mm.p1 === w ? mm.p1Avatar : mm.p2Avatar;
          if (ri + 1 < totalRounds) {
            const nmi = Math.floor(mi / 2);
            const nm = t.bracket.rounds[ri + 1][nmi];
            if (mi % 2 === 0) { nm.p1 = w; nm.p1Avatar = wAv; }
            else { nm.p2 = w; nm.p2Avatar = wAv; }
          }
        }
      }
    }
    t.complete = true;
  }

  const fin = t.bracket.rounds[totalRounds - 1][0];
  if (fin.done && fin.winner === 'You') {
    state.tourneysWon = (state.tourneysWon || 0) + 1;
    if (t.special) {
      // Mystery Cup → award random unowned emoji
      const unowned = EMOJI_CATALOG.filter(em => !state.ownedEmojis.includes(em.e) && em.e !== ROCK_EMOJI);
      if (unowned.length > 0) {
        const reward = unowned[Math.floor(Math.random() * unowned.length)];
        state.ownedEmojis.push(reward.e);
        toast(`🏆 Champion! Won ${reward.e} ${reward.name}`);
      } else {
        // No unowned emojis left → fallback to tokens
        state.balance += 50;
        toast('🏆 Champion! All emojis owned — +50 tokens');
      }
    } else {
      state.balance += t.prize; state.earned += t.prize;
      toast('🏆 Champion! +' + t.prize + ' tokens');
    }
    t.complete = true;
  }
  saveState();
  updateBalance();
  updateHeader();
  showLobbyBracket(runtime.activeTourney);
}

/* ---- HISTORY ---- */
function renderHistory() {
  const el = document.getElementById('history-list');
  if (!state.history.length) {
    el.innerHTML = '<div class="empty-state">No matches yet.<br>Start playing!</div>';
    return;
  }
  el.innerHTML = state.history.map(h => {
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
      <div class="history-item">
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
  // Reset button state
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

function confirmReset() {
  if (state.hasReset) { toast('Reset already used'); return; }
  document.getElementById('confirm-input').value = '';
  document.getElementById('reset-confirm-btn').disabled = true;
  document.getElementById('reset-modal').classList.add('open');
  setTimeout(() => document.getElementById('confirm-input').focus(), 100);
}

function updateResetBtn() {
  const v = document.getElementById('confirm-input').value.trim().toLowerCase();
  document.getElementById('reset-confirm-btn').disabled = v !== 'confirm';
}

function doReset() {
  // Preserve owned emojis, equipped avatar, username, and balance
  const keep = {
    ownedEmojis: state.ownedEmojis,
    avatar: state.avatar,
    balance: state.balance,
    username: state.username,
  };
  state = { ...DEFAULT_STATE, ...keep, hasReset: true };
  saveState();
  document.getElementById('reset-modal').classList.remove('open');
  document.getElementById('confirm-input').value = '';
  initTourneys();
  refreshFeatured();
  updateBalance();
  updateHeader();
  renderProfile();
  renderHistory();
  toast('Progress reset');
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

function renderChallenges() {
  const list = document.getElementById('challenges-list');
  // Rock challenge
  const rockUnlocked = checkRockUnlocked();
  const rockOwned = state.ownedEmojis.includes(ROCK_EMOJI);
  const tProg = Math.min(state.tourneysWon || 0, 5);
  const sProg = Math.min(state.bestStreak, 10);
  let rockAction;
  if (rockOwned && state.avatar === ROCK_EMOJI) rockAction = '<div class="shop-action equipped" style="margin-top:6px">EQUIPPED</div>';
  else if (rockOwned) rockAction = `<button onclick="equipEmoji('${ROCK_EMOJI}')" style="margin-top:6px;background:var(--gold);color:#000;border:none;border-radius:6px;padding:6px 12px;cursor:pointer;font-size:11px;font-weight:700;letter-spacing:.05em">EQUIP</button>`;
  else if (rockUnlocked) rockAction = `<button onclick="claimRock()" style="margin-top:6px;background:var(--success);color:#fff;border:none;border-radius:6px;padding:6px 12px;cursor:pointer;font-size:11px;font-weight:700;letter-spacing:.05em">CLAIM 🪨</button>`;
  else rockAction = '<div class="shop-action locked" style="margin-top:6px">LOCKED</div>';

  const tDone = (state.tourneysWon || 0) >= 5;
  const sDone = state.bestStreak >= 10;
  const allDone = tDone && sDone;

  list.innerHTML = `
    <div class="challenge-card ${allDone ? 'complete' : ''}">
      <div class="challenge-emoji">${ROCK_EMOJI}</div>
      <div class="challenge-info">
        <div class="challenge-name">Rock Reborn</div>
        <div class="challenge-desc">Unlock the legendary Rock emoji.</div>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          <div style="flex:1;min-width:120px">
            <div class="challenge-progress"><div class="challenge-progress-fill ${tDone?'done':''}" style="width:${tProg/5*100}%"></div></div>
            <div class="challenge-progress-text ${tDone?'done':''}">${tProg}/5 tournaments won</div>
          </div>
          <div style="flex:1;min-width:120px">
            <div class="challenge-progress"><div class="challenge-progress-fill ${sDone?'done':''}" style="width:${sProg/10*100}%"></div></div>
            <div class="challenge-progress-text ${sDone?'done':''}">${sProg}/10 streak record</div>
          </div>
        </div>
        ${rockAction}
      </div>
    </div>
  `;
}

function claimRock() {
  if (!checkRockUnlocked()) { toast('Challenge not complete'); return; }
  if (state.ownedEmojis.includes(ROCK_EMOJI)) { toast('Already claimed'); return; }
  state.ownedEmojis.push(ROCK_EMOJI);
  state.avatar = ROCK_EMOJI;
  saveState();
  updateHeader();
  renderShop();
  toast('🪨 ROCK unlocked & equipped!');
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
  else if (owned) action = '<div class="shop-action owned">EQUIP</div>';
  else action = `<div class="shop-action buy">▣ ${item.price}</div>`;
  return `
    <div class="shop-item ${equipped ? 'equipped' : ''}" onclick="shopAction('${item.e}')">
      <div class="shop-emoji">${item.e}</div>
      <div class="shop-name">${item.name}</div>
      ${action}
    </div>
  `;
}

function renderShopBrowse() {
  const container = document.getElementById('shop-content');
  // Filter by category, exclude rock from regular browse
  const filtered = (runtime.shopCat === 'all'
    ? EMOJI_CATALOG
    : EMOJI_CATALOG.filter(e => e.cat === runtime.shopCat)
  ).filter(e => e.e !== ROCK_EMOJI);

  // Owned first
  const owned = filtered.filter(e => state.ownedEmojis.includes(e.e));
  const unowned = filtered.filter(e => !state.ownedEmojis.includes(e.e));

  // Ascending rarity for unowned (common → rare → epic → legendary)
  const rarityOrderAsc = ['common', 'rare', 'epic', 'legendary'];
  const byRarity = {};
  for (const r of rarityOrderAsc) byRarity[r] = [];
  for (const item of unowned) byRarity[item.rarity].push(item);

  let html = '';
  if (owned.length > 0) {
    html += `
      <div class="shop-rarity-section">
        <div class="shop-rarity-header" style="color:var(--success)">OWNED <span class="count">· ${owned.length}</span></div>
        <div class="shop-grid">
          ${owned.map(shopItemHtml).join('')}
        </div>
      </div>
    `;
  }
  for (const r of rarityOrderAsc) {
    if (byRarity[r].length === 0) continue;
    html += `
      <div class="shop-rarity-section">
        <div class="shop-rarity-header ${r}">${r.toUpperCase()} <span class="count">· ${byRarity[r].length}</span></div>
        <div class="shop-grid">
          ${byRarity[r].map(shopItemHtml).join('')}
        </div>
      </div>
    `;
  }
  container.innerHTML = html || '<div class="empty-state">No emojis in this category.</div>';
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

function openBuy() { document.getElementById('buy-modal').classList.add('open'); }
function buyTokens(amt, price) {
  state.balance += amt; state.earned += amt; updateBalance();
  document.getElementById('buy-modal').classList.remove('open');
  toast('+' + amt + ' tokens added (demo)');
}

/* ---- INSTALL HINT ---- */
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
