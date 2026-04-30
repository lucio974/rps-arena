/* RPS Arena - PWA app logic v2 */

const BOT_NAMES = [
  'undefeated','ultimate champion','worthy opponent','+aura','cant guess me',
  'high cortisol player','easy clap','u bad','delete game','noob farmer','rock',
  'deus ex machina','Big stress','always draw','queue busy huh?','case closed',
  'not regular','most normal','wrong pick','peak your mind','get cooked','your done',
  'fast win','him','so see through','free elo','too woke','pay to win','no chance',
  'nightmareish ai','read you so ez','always rock','rock believer','rock enthusiast',
  'rock intent','seer','rock most likely','say less'
];

// PvP opponent names (for matchmaking)
const PVP_NAMES = ['Shadow_X','GrindKing','Nova_88','PixelWarrior','ThunderPaw','Ace_RPS','IronFist','Blaze_Pro','CryptoK','VoidWalker','RapidFire','CosmicG','NeonRune','SilverFox','MachoMan','BoltZero'];

// All emojis available in shop
const SHOP_EMOJIS = [
  // Faces - free / cheap
  { e:'🪨', name:'Rock', cat:'objects', price:0, rarity:'common' }, // default
  { e:'😀', name:'Smile', cat:'faces', price:0, rarity:'common' },
  { e:'😎', name:'Cool', cat:'faces', price:50, rarity:'common' },
  { e:'🥶', name:'Cold', cat:'faces', price:50, rarity:'common' },
  { e:'🤖', name:'Robot', cat:'faces', price:75, rarity:'common' },
  { e:'😈', name:'Devil', cat:'faces', price:100, rarity:'common' },
  { e:'🤠', name:'Cowboy', cat:'faces', price:100, rarity:'common' },
  { e:'🥷', name:'Ninja', cat:'faces', price:150, rarity:'rare' },
  { e:'🧙', name:'Wizard', cat:'faces', price:200, rarity:'rare' },
  { e:'🤡', name:'Clown', cat:'faces', price:75, rarity:'common' },
  { e:'👻', name:'Ghost', cat:'faces', price:120, rarity:'common' },
  { e:'💀', name:'Skull', cat:'faces', price:150, rarity:'rare' },
  { e:'👽', name:'Alien', cat:'faces', price:200, rarity:'rare' },
  { e:'🧛', name:'Vampire', cat:'faces', price:250, rarity:'rare' },
  { e:'🦸', name:'Hero', cat:'faces', price:400, rarity:'epic' },
  { e:'🦹', name:'Villain', cat:'faces', price:400, rarity:'epic' },

  // Animals
  { e:'🐶', name:'Dog', cat:'animals', price:50, rarity:'common' },
  { e:'🐱', name:'Cat', cat:'animals', price:50, rarity:'common' },
  { e:'🦊', name:'Fox', cat:'animals', price:100, rarity:'common' },
  { e:'🐻', name:'Bear', cat:'animals', price:120, rarity:'common' },
  { e:'🐼', name:'Panda', cat:'animals', price:150, rarity:'rare' },
  { e:'🦁', name:'Lion', cat:'animals', price:200, rarity:'rare' },
  { e:'🐯', name:'Tiger', cat:'animals', price:200, rarity:'rare' },
  { e:'🦅', name:'Eagle', cat:'animals', price:250, rarity:'rare' },
  { e:'🦉', name:'Owl', cat:'animals', price:200, rarity:'rare' },
  { e:'🐺', name:'Wolf', cat:'animals', price:300, rarity:'epic' },
  { e:'🦈', name:'Shark', cat:'animals', price:350, rarity:'epic' },
  { e:'🐉', name:'Dragon', cat:'animals', price:800, rarity:'epic' },
  { e:'🦄', name:'Unicorn', cat:'animals', price:600, rarity:'epic' },
  { e:'🐙', name:'Octopus', cat:'animals', price:200, rarity:'rare' },
  { e:'🦖', name:'T-Rex', cat:'animals', price:500, rarity:'epic' },

  // Objects
  { e:'⚔️', name:'Swords', cat:'objects', price:100, rarity:'common' },
  { e:'🛡️', name:'Shield', cat:'objects', price:100, rarity:'common' },
  { e:'🏆', name:'Trophy', cat:'objects', price:300, rarity:'rare' },
  { e:'💎', name:'Diamond', cat:'objects', price:400, rarity:'epic' },
  { e:'⚡', name:'Bolt', cat:'objects', price:200, rarity:'rare' },
  { e:'🔥', name:'Flame', cat:'objects', price:200, rarity:'rare' },
  { e:'❄️', name:'Snowflake', cat:'objects', price:200, rarity:'rare' },
  { e:'☄️', name:'Comet', cat:'objects', price:350, rarity:'epic' },
  { e:'🌟', name:'Star', cat:'objects', price:300, rarity:'rare' },
  { e:'💀', name:'Skull (alt)', cat:'objects', price:150, rarity:'rare' },
  { e:'👑', name:'Crown', cat:'objects', price:600, rarity:'epic' },
  { e:'🎯', name:'Target', cat:'objects', price:150, rarity:'common' },
  { e:'🃏', name:'Joker', cat:'objects', price:250, rarity:'rare' },

  // Legendary (high price)
  { e:'🌌', name:'Galaxy', cat:'legendary', price:1500, rarity:'legendary' },
  { e:'🔱', name:'Trident', cat:'legendary', price:1200, rarity:'legendary' },
  { e:'🗿', name:'Moai', cat:'legendary', price:1000, rarity:'legendary' },
  { e:'🪬', name:'Hamsa', cat:'legendary', price:1800, rarity:'legendary' },
  { e:'🏵️', name:'Rosette', cat:'legendary', price:1500, rarity:'legendary' },
  { e:'⚜️', name:'Fleur-de-lis', cat:'legendary', price:2000, rarity:'legendary' },
];

// Pool of emojis awarded as streak rewards (separate from shop, can include any unowned)
const STREAK_REWARD_POOL = SHOP_EMOJIS.filter(e => e.price > 0);

// ELO tiers
const ELO_TIERS = [
  { name:'Bronze',   min:0,    max:1000, color:'#cd7f32' },
  { name:'Silver',   min:1000, max:1200, color:'#c0c0c0' },
  { name:'Gold',     min:1200, max:1400, color:'#c9a84c' },
  { name:'Platinum', min:1400, max:1600, color:'#7fbab0' },
  { name:'Diamond',  min:1600, max:1850, color:'#9ddffa' },
  { name:'Master',   min:1850, max:2100, color:'#a96bff' },
  { name:'Grandmaster', min:2100, max:9999, color:'#e24b4a' },
];

const DEFAULT_STATE = {
  username: 'Player',
  avatar: '🪨',
  ownedEmojis: ['🪨','😀'],
  balance: 1000,
  elo: 1000,
  wins: 0,
  games: 0,
  earned: 0,
  bestStreak: 0,
  tourneysWon: 0,
  history: [],
  tournaments: null,
  hasNamed: false, // prompt to set custom name on first game
  lastRewardedStreak: 0, // last streak that was rewarded (so each new high triggers once)
};

let state = loadState();
let runtime = {
  searchTimer: null,
  currentEntry: 10,
  currentPrize: 18,
  currentMode: 'pvp', // 'pvp' | 'streak' | 'tourney'
  gameState: null,
  selectedEntryEl: null,
  activeTourney: null,
  activeTourneyMatchIdx: null,
  modalCb: null,
  shopCat: 'all',
  streakState: null, // {current, strikes, oppName, oppAvatar}
};

function loadState() {
  try {
    const raw = localStorage.getItem('rps-arena-state-v2');
    if (raw) return { ...DEFAULT_STATE, ...JSON.parse(raw) };
    // migrate v1
    const v1 = localStorage.getItem('rps-arena-state');
    if (v1) {
      const old = JSON.parse(v1);
      return { ...DEFAULT_STATE, balance: old.balance || 1000, wins: old.wins || 0, games: old.games || 0, earned: old.earned || 0, history: old.history || [] };
    }
  } catch(e) {}
  return { ...DEFAULT_STATE };
}
function saveState() {
  try { localStorage.setItem('rps-arena-state-v2', JSON.stringify(state)); } catch(e) {}
}

function rnd(arr){return arr[Math.floor(Math.random()*arr.length)]}
function rps(){return rnd(['rock','paper','scissors'])}
function beats(a,b){return(a==='rock'&&b==='scissors')||(a==='paper'&&b==='rock')||(a==='scissors'&&b==='paper')}
function botName(){return rnd(BOT_NAMES)}
function pvpName(){return rnd(PVP_NAMES)}

function getTier(elo) {
  for (const t of ELO_TIERS) {
    if (elo >= t.min && elo < t.max) return t;
  }
  return ELO_TIERS[ELO_TIERS.length - 1];
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
  updateHeader();
}

function showLobbySection(name) {
  document.getElementById('lobby-pvp').style.display = name === 'pvp' ? 'flex' : 'none';
  document.getElementById('lobby-tourney').style.display = name === 'tourney' ? 'flex' : 'none';
  document.getElementById('lobby-bracket').style.display = 'none';
  document.getElementById('pvp-searching').style.display = 'none';
  if (name === 'tourney') renderTourneyList();
  // scroll to the section
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
  document.getElementById('best-streak-mini').textContent = state.bestStreak;
  document.getElementById('shop-owned-count').textContent = state.ownedEmojis.length;
  renderEloHero();
}

function renderEloHero() {
  const tier = getTier(state.elo);
  document.documentElement.style.setProperty('--rank-color', tier.color);
  document.getElementById('elo-tier-name').textContent = tier.name;
  document.getElementById('elo-tier-name').style.color = tier.color;
  document.getElementById('elo-rating').textContent = state.elo;
  // progress within current tier
  const range = tier.max - tier.min;
  const into = Math.max(0, Math.min(state.elo - tier.min, range));
  const pct = range > 0 ? (into / range * 100) : 100;
  document.getElementById('elo-progress-fill').style.width = pct + '%';
  document.getElementById('elo-tier-min').textContent = tier.name;
  // next tier
  const nextIdx = ELO_TIERS.indexOf(tier) + 1;
  document.getElementById('elo-tier-max').textContent = nextIdx < ELO_TIERS.length ? ELO_TIERS[nextIdx].name : 'MAX';
}

function toast(msg) {
  const t = document.getElementById('toast');
  t.innerHTML = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 2400);
}

function selectEntry(el) {
  if (runtime.selectedEntryEl) runtime.selectedEntryEl.classList.remove('selected');
  el.classList.add('selected');
  runtime.selectedEntryEl = el;
  runtime.currentEntry = +el.dataset.entry;
  runtime.currentPrize = +el.dataset.prize;
}

function startFindMatch() {
  const e = document.getElementById('pvp-error');
  if (state.balance < runtime.currentEntry) {
    e.textContent = 'Not enough coins! Tap "+" to top up.';
    e.style.display = 'block';
    return;
  }
  e.style.display = 'none';
  state.balance -= runtime.currentEntry; updateBalance();
  document.getElementById('lobby-pvp').style.display = 'none';
  document.getElementById('pvp-searching').style.display = 'block';
  document.getElementById('search-entry-display').textContent = runtime.currentEntry;
  runtime.searchTimer = setTimeout(() => {
    startGame('pvp', runtime.currentEntry, runtime.currentPrize, pvpName(), '🤖');
  }, Math.random() * 2000 + 1200);
}

function cancelSearch() {
  clearTimeout(runtime.searchTimer);
  state.balance += runtime.currentEntry; updateBalance();
  document.getElementById('pvp-searching').style.display = 'none';
  document.getElementById('lobby-pvp').style.display = 'flex';
  toast('Entry refunded');
}

function startGame(mode, entry, prize, oppN, oppAvatar = '🤖', bo = 3) {
  runtime.currentMode = mode;
  runtime.gameState = { entry, prize, opp: oppN, oppAvatar, scoreYou: 0, scoreOpp: 0, round: 1, bo, done: false };
  document.getElementById('opp-name').textContent = oppN;
  document.getElementById('opp-avatar').textContent = oppAvatar;
  document.getElementById('you-avatar').textContent = state.avatar;
  document.getElementById('you-name').textContent = state.username;
  document.getElementById('score-you').textContent = 0;
  document.getElementById('score-opp').textContent = 0;
  document.getElementById('stake-label').textContent = entry > 0 ? entry + ' coin entry' : (mode === 'streak' ? 'Streak Run' : 'Free play');
  document.getElementById('round-label').textContent = 'Best of ' + bo;
  document.getElementById('round-info').textContent = 'Round 1 of ' + bo + ' — make your pick';
  document.getElementById('choice-you').textContent = '?';
  document.getElementById('choice-opp').textContent = '?';
  document.getElementById('choice-you').classList.remove('reveal');
  document.getElementById('choice-opp').classList.remove('reveal');
  document.getElementById('round-result').textContent = '';
  document.getElementById('round-result').className = 'choice-result';
  document.getElementById('result-banner').style.display = 'none';
  document.getElementById('reward-pop-area').innerHTML = '';
  document.getElementById('elo-change-display').textContent = '';
  ['btn-rock','btn-paper','btn-scissors'].forEach(id => document.getElementById(id).disabled = false);

  // streak HUD
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
  // Simple ELO with K=32. Opponent rating scaled by entry.
  const K = 32;
  const expected = 1 / (1 + Math.pow(10, (oppElo - playerElo) / 400));
  const actual = won ? 1 : draw ? 0.5 : 0;
  return Math.round(K * (actual - expected));
}

function endGame(g) {
  g.done = true;
  const won = g.scoreYou > g.scoreOpp;
  const draw = g.scoreYou === g.scoreOpp;
  const banner = document.getElementById('result-banner');
  const title = document.getElementById('result-title');
  const detail = document.getElementById('result-detail');
  const eloChangeEl = document.getElementById('elo-change-display');
  const rewardArea = document.getElementById('reward-pop-area');
  rewardArea.innerHTML = '';
  eloChangeEl.textContent = '';
  eloChangeEl.className = 'elo-change';

  state.games++;

  let delta = 0;
  let eloDelta = 0;

  if (runtime.currentMode === 'pvp') {
    // ELO change based on opponent rating tied to entry
    const oppElo = 950 + g.entry * 1.5; // higher entry = stronger opponent
    eloDelta = calculateEloChange(state.elo, oppElo, won, draw);
    state.elo = Math.max(0, state.elo + eloDelta);
    if (eloDelta !== 0) {
      eloChangeEl.textContent = (eloDelta > 0 ? '+' : '') + eloDelta + ' ELO';
      eloChangeEl.className = 'elo-change ' + (eloDelta > 0 ? 'up' : 'down');
    }

    if (won) {
      state.wins++; delta = g.prize;
      state.balance += g.prize; state.earned += g.prize;
      banner.className = 'result-banner win'; title.textContent = 'YOU WIN!';
      detail.textContent = '+' + g.prize + ' coins added to wallet';
      if (navigator.vibrate) navigator.vibrate([30, 50, 30, 50, 30]);
    } else if (draw) {
      delta = g.entry;
      state.balance += g.entry;
      banner.className = 'result-banner draw'; title.textContent = 'DRAW';
      detail.textContent = 'Entry refunded';
    } else {
      banner.className = 'result-banner lose'; title.textContent = 'DEFEATED';
      detail.textContent = '-' + g.entry + ' coins lost';
      delta = -g.entry;
      if (navigator.vibrate) navigator.vibrate(80);
    }
  } else if (runtime.currentMode === 'streak') {
    handleStreakEnd(won, draw, banner, title, detail, rewardArea);
  } else if (runtime.currentMode === 'tourney') {
    if (won) {
      state.wins++;
      banner.className = 'result-banner win'; title.textContent = 'ADVANCED!';
      detail.textContent = 'You move on in the bracket';
    } else if (draw) {
      banner.className = 'result-banner draw'; title.textContent = 'DRAW';
      detail.textContent = 'Replaying...';
    } else {
      banner.className = 'result-banner lose'; title.textContent = 'ELIMINATED';
      detail.textContent = 'Your tournament run ends here';
    }
  }

  updateBalance();
  // Skip history entry for streak (logged separately)
  if (runtime.currentMode !== 'streak') {
    state.history.unshift({
      opp: g.opp,
      result: won ? 'W' : draw ? 'D' : 'L',
      score: g.scoreYou + '-' + g.scoreOpp,
      entry: g.entry, delta,
      eloDelta: runtime.currentMode === 'pvp' ? eloDelta : null,
      mode: runtime.currentMode === 'tourney' ? 'Tourney' : 'PvP',
      time: new Date().toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }),
    });
  }
  if (state.history.length > 100) state.history = state.history.slice(0, 100);
  saveState();
  updateHeader();
  banner.style.display = 'block';

  if (runtime.currentMode === 'tourney' && runtime.activeTourney !== null) {
    setTimeout(() => onTourneyMatchEnd(won), 1300);
  }
}

/* ---- STREAK MODE ---- */
function startStreakRun() {
  // Start fresh
  runtime.streakState = { current: 0, strikes: 0 };
  startStreakMatch();
}

function startStreakMatch() {
  const oppN = botName();
  startGame('streak', 0, 0, oppN, '🤖', 3);
}

function handleStreakEnd(won, draw, banner, title, detail, rewardArea) {
  const ss = runtime.streakState;
  // record this match in history
  state.history.unshift({
    opp: runtime.gameState.opp,
    result: won ? 'W' : draw ? 'D' : 'L',
    score: runtime.gameState.scoreYou + '-' + runtime.gameState.scoreOpp,
    entry: 0, delta: 0, eloDelta: null,
    mode: 'Streak',
    time: new Date().toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }),
  });

  if (won) {
    ss.current++;
    state.wins++;
    // Update best streak immediately
    let newRecord = false;
    if (ss.current > state.bestStreak) {
      state.bestStreak = ss.current;
      newRecord = true;
    }

    // Check for emoji reward at 5+ on a NEW high score milestone
    let rewardEmoji = null;
    if (newRecord && ss.current >= 5 && ss.current > state.lastRewardedStreak) {
      // Award an unowned emoji
      const unowned = STREAK_REWARD_POOL.filter(em => !state.ownedEmojis.includes(em.e));
      if (unowned.length > 0) {
        // Higher streaks = chance of better rarity
        let pool = unowned;
        if (ss.current >= 15) {
          const legendary = unowned.filter(e => e.rarity === 'legendary');
          if (legendary.length && Math.random() < 0.4) pool = legendary;
        } else if (ss.current >= 10) {
          const epicOrBetter = unowned.filter(e => e.rarity === 'epic' || e.rarity === 'legendary');
          if (epicOrBetter.length && Math.random() < 0.5) pool = epicOrBetter;
        } else if (ss.current >= 7) {
          const rareOrBetter = unowned.filter(e => e.rarity !== 'common');
          if (rareOrBetter.length && Math.random() < 0.5) pool = rareOrBetter;
        }
        const reward = pool[Math.floor(Math.random() * pool.length)];
        state.ownedEmojis.push(reward.e);
        state.lastRewardedStreak = ss.current;
        rewardEmoji = reward;
      }
    }

    banner.className = 'result-banner win';
    title.textContent = 'STREAK ' + ss.current + '!';
    detail.textContent = newRecord
      ? '🔥 New personal best! Tap below to continue.'
      : (ss.strikes === 0 ? 'No strikes — keep the run going.' : '1 strike still on the clock — careful.');

    if (rewardEmoji) {
      rewardArea.innerHTML = `
        <div class="reward-pop">
          <span class="emoji-big">${rewardEmoji.e}</span>
          <strong>New emoji unlocked: ${rewardEmoji.name}</strong><br>
          <span style="font-size:11px;color:var(--muted)">Equip it from your shop</span>
        </div>`;
      if (navigator.vibrate) navigator.vibrate([40, 60, 40, 60, 80]);
    }

    document.getElementById('result-actions').innerHTML = `
      <button class="primary" onclick="continueStreak()">Next Match →</button>
      <button onclick="endStreakRun()">End Run</button>
    `;
  } else {
    // Loss or draw counts as a strike (loss is a strike, draw doesn't)
    if (!draw) ss.strikes++;
    if (ss.strikes >= 2) {
      // run is over
      banner.className = 'result-banner lose';
      title.textContent = 'RUN OVER';
      detail.textContent = `Final streak: ${ss.current}` + (state.bestStreak === ss.current && ss.current > 0 ? ' · New best!' : '');
      document.getElementById('result-actions').innerHTML = `
        <button class="primary" onclick="startStreakRun()">New Run</button>
        <button onclick="leaveGame()">Back to Lobby</button>
      `;
    } else {
      // 1 strike taken, continue
      banner.className = draw ? 'result-banner draw' : 'result-banner lose';
      title.textContent = draw ? 'DRAW' : 'STRIKE 1';
      detail.textContent = draw
        ? 'No strike. Streak protected.'
        : `Streak ${ss.current} held. One more loss and the run is over.`;
      document.getElementById('result-actions').innerHTML = `
        <button class="primary" onclick="continueStreak()">Next Match →</button>
        <button onclick="endStreakRun()">End Run</button>
      `;
    }
  }
}

function continueStreak() {
  startStreakMatch();
}

function endStreakRun() {
  runtime.streakState = null;
  showView('lobby');
}

function leaveGame() {
  if (runtime.currentMode === 'tourney') showLobbyBracket(runtime.activeTourney);
  else if (runtime.currentMode === 'streak') endStreakRun();
  else showView('lobby');
}

/* ---- TOURNAMENTS ---- */
const TOURNEY_TEMPLATES = [
  { name: 'Weekend Brawl', entry: 50, prize: 350, slots: 5 },
  { name: 'Coin Clashers', entry: 100, prize: 750, slots: 6 },
  { name: 'Elite Cup', entry: 500, prize: 3500, slots: 3 },
  { name: 'Beginner Bash', entry: 25, prize: 175, slots: 7 },
];

function initTourneys() {
  if (!state.tournaments || !state.tournaments.length) {
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
    return `
      <div class="tourney-card ${t.joined ? 'active-tourney' : ''}">
        <div class="tourney-info">
          <div class="tourney-name">${t.name} ${status}</div>
          <div class="tourney-meta">
            <span>🪙 ${t.entry} entry</span>
            <span>👥 ${t.slots} spots</span>
            <span>8-player</span>
          </div>
        </div>
        <div>
          <div class="tourney-prize">🏆 ${t.prize}</div>
          <div class="tourney-entry">Prize Pool</div>
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
  openModal('Join ' + t.name + '?',
    `Entry: <strong style="color:var(--gold)">${t.entry} coins</strong><br>Prize pool: <strong style="color:var(--gold)">${t.prize} coins</strong><br>Format: 8-player single elimination, best of 3.`,
    () => joinTourney(id)
  );
}

function joinTourney(id) {
  const t = state.tournaments[id];
  if (state.balance < t.entry) { toast('Not enough coins!'); return; }
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
    const winnerScore = 2;
    const loserScore = Math.floor(Math.random() * 2);
    m.s1 = m.p1 === w ? winnerScore : loserScore;
    m.s2 = m.p2 === w ? winnerScore : loserScore;
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
  document.getElementById('bracket-prize').textContent = '🏆 ' + t.prize;
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
  startGame('tourney', 0, prizeForWinner, opp, '🤖', 3);
}

function onTourneyMatchEnd(won) {
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
    state.balance += t.prize; state.earned += t.prize;
    state.tourneysWon = (state.tourneysWon || 0) + 1;
    updateBalance();
    toast('🏆 Champion! +' + t.prize + ' coins');
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
  el.innerHTML = state.history.map(h => {
    const eloPart = (h.eloDelta != null && h.eloDelta !== 0)
      ? `<div style="font-size:10px;color:${h.eloDelta > 0 ? 'var(--success)' : 'var(--danger)'};margin-top:1px">${h.eloDelta > 0 ? '+' : ''}${h.eloDelta} ELO</div>`
      : '';
    const earn = h.delta !== 0
      ? `<span class="hist-earn ${h.delta > 0 ? 'pos' : 'neg'}">${h.delta > 0 ? '+' : ''}${h.delta} 🪙</span>`
      : '<span style="color:var(--muted);font-size:11px">—</span>';
    return `
      <div class="history-item">
        <span class="hist-result ${h.result}">${h.result}</span>
        <div style="flex:1;min-width:0;font-size:12px">
          <div style="font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${h.opp}</div>
          <div style="color:var(--muted);font-size:10px">${h.mode} · ${h.time}</div>
          ${eloPart}
        </div>
        <span style="color:var(--muted);font-size:12px">${h.score}</span>
        ${earn}
      </div>
    `;
  }).join('');
}

/* ---- PROFILE ---- */
function renderProfile() {
  document.getElementById('profile-avatar').textContent = state.avatar;
  document.getElementById('profile-name').textContent = state.username;
  const tier = getTier(state.elo);
  document.getElementById('profile-tier').textContent = `${tier.name} · ${state.elo} ELO`;
  document.getElementById('profile-tier').style.color = tier.color;
  document.getElementById('ps-wins').textContent = state.wins;
  const wr = state.games > 0 ? Math.round(state.wins / state.games * 100) + '%' : '—';
  document.getElementById('ps-winrate').textContent = wr;
  document.getElementById('ps-earned').textContent = state.earned;
  document.getElementById('ps-streak').textContent = state.bestStreak;
  document.getElementById('ps-trophies').textContent = state.tourneysWon || 0;
  document.getElementById('ps-games').textContent = state.games;
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
  state.hasNamed = true;
  saveState();
  document.getElementById('name-modal').classList.remove('open');
  updateHeader();
  renderProfile();
  toast('Name saved');
}

function confirmReset() {
  openModal('Reset all progress?',
    'This will erase your stats, ELO, coins, owned emojis, history, and tournaments. Cannot be undone.',
    () => {
      localStorage.removeItem('rps-arena-state-v2');
      localStorage.removeItem('rps-arena-state');
      state = { ...DEFAULT_STATE };
      saveState();
      updateBalance();
      updateHeader();
      renderProfile();
      renderHistory();
      initTourneys();
      toast('Progress reset');
      showView('lobby');
    }
  );
}

/* ---- SHOP ---- */
function setShopTab(el, cat) {
  document.querySelectorAll('.shop-tab').forEach(t => t.classList.remove('active'));
  el.classList.add('active');
  runtime.shopCat = cat;
  renderShop();
}

function renderShop() {
  const grid = document.getElementById('shop-grid');
  const filtered = runtime.shopCat === 'all'
    ? SHOP_EMOJIS
    : runtime.shopCat === 'legendary'
      ? SHOP_EMOJIS.filter(e => e.rarity === 'legendary')
      : SHOP_EMOJIS.filter(e => e.cat === runtime.shopCat);
  grid.innerHTML = filtered.map(em => {
    const owned = state.ownedEmojis.includes(em.e);
    const equipped = state.avatar === em.e;
    let action;
    if (equipped) action = '<div class="shop-action equipped">EQUIPPED</div>';
    else if (owned) action = '<div class="shop-action owned">TAP TO EQUIP</div>';
    else if (em.price === 0) action = '<div class="shop-action free">FREE</div>';
    else action = `<div class="shop-action buy">🪙 ${em.price}</div>`;
    return `
      <div class="shop-item ${equipped ? 'equipped' : ''}" onclick="shopAction('${em.e}')">
        ${em.rarity !== 'common' ? `<div class="rarity-tag ${em.rarity}">${em.rarity}</div>` : ''}
        <div class="shop-emoji">${em.e}</div>
        <div class="shop-name">${em.name}</div>
        ${action}
      </div>
    `;
  }).join('');
}

function shopAction(emoji) {
  const item = SHOP_EMOJIS.find(e => e.e === emoji);
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
  // Buy flow
  if (item.price === 0) {
    state.ownedEmojis.push(emoji);
    state.avatar = emoji;
    saveState();
    updateHeader();
    renderShop();
    toast('Unlocked ' + item.name);
    return;
  }
  if (state.balance < item.price) { toast('Not enough coins'); return; }
  openModal('Buy ' + item.name + '?',
    `${item.e} <strong>${item.name}</strong><br>Price: <strong style="color:var(--gold)">${item.price} coins</strong><br>You'll have ${state.balance - item.price} coins after.`,
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
function buyCoin(amt, price) {
  state.balance += amt; updateBalance();
  document.getElementById('buy-modal').classList.remove('open');
  toast('+' + amt + ' coins added (demo)');
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
runtime.selectedEntryEl = document.querySelector('.match-opt.selected');
updateBalance();
updateHeader();
initTourneys();

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
