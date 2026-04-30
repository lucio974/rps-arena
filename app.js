/* RPS Arena v3 — full rebuild */

const BOT_NAMES = [
  'undefeated','ultimate champion','worthy opponent','+aura','cant guess me',
  'high cortisol player','easy clap','u bad','delete game','noob farmer','rock',
  'deus ex machina','Big stress','always draw','queue busy huh?','case closed',
  'not regular','most normal','wrong pick','peak your mind','get cooked','your done',
  'fast win','him','so see through','free elo','too woke','pay to win','no chance',
  'nightmareish ai','read you so ez','always rock','rock believer','rock enthusiast',
  'rock intent','seer','rock most likely','say less'
];

const PVP_NAMES = ['Shadow_X','GrindKing','Nova_88','PixelWarrior','ThunderPaw','Ace_RPS','IronFist','Blaze_Pro','CryptoK','VoidWalker','RapidFire','CosmicG','NeonRune','SilverFox','MachoMan','BoltZero','TempestZ','RiftRunner','OmegaOne','Vexx','ZenithKing','PhantomQ','GlitchMaster','HavokX','EchoStrike','MysticVoid','Drift_44'];

// Simple emoji pool for AI opponents (so it doesn't feel tied to shop catalog)
const AI_OPP_EMOJIS = ['🤖','😈','🥷','🧙','👽','💀','👻','🤡','🦊','🐺','🦁','🐉','🦈','⚡','🔥','💎','👑','🐲','🦅','🐯'];

// ELO tiers — scaled to support ±75 to ±135 swings
const ELO_TIERS = [
  { name:'Bronze',      min:0,    max:1500,  color:'#cd7f32' },
  { name:'Silver',      min:1500, max:2300,  color:'#c0c0c0' },
  { name:'Gold',        min:2300, max:3100,  color:'#c9a84c' },
  { name:'Platinum',    min:3100, max:3900,  color:'#7fbab0' },
  { name:'Diamond',     min:3900, max:4700,  color:'#9ddffa' },
  { name:'Master',      min:4700, max:5500,  color:'#a96bff' },
  { name:'Grandmaster', min:5500, max:99999, color:'#e24b4a' },
];

const DEFAULT_STATE = {
  username: 'Player',
  avatar: '🪨',                    // default avatar (rock unlocked from start as default)
  ownedEmojis: ['🪨'],              // start with just the rock
  balance: 1000,
  elo: 1000,
  wins: 0,
  games: 0,
  earned: 0,
  bestStreak: 0,
  tourneysWon: 0,
  history: [],
  tournaments: null,
  hasNamed: false,
  lastRewardedStreak: 0,
  freshStartUsed: false,             // tracks one-time reset
  rockUnlocked: true,                // rock is given by default; keep flag for legacy
};

let state = loadState();
let runtime = {
  searchTimer: null,
  currentMode: 'pvp',
  gameState: null,
  activeTourney: null,
  activeTourneyMatchIdx: null,
  modalCb: null,
  shopCat: 'all',
  streakState: null, // {current, strikes, oppName, oppAvatar}
};

function loadState() {
  try {
    const raw = localStorage.getItem('rps-arena-state-v3');
    if (raw) return { ...DEFAULT_STATE, ...JSON.parse(raw) };
    // migrate from v2
    const v2 = localStorage.getItem('rps-arena-state-v2');
    if (v2) {
      const old = JSON.parse(v2);
      const migrated = { ...DEFAULT_STATE, ...old, balance: old.balance || 1000 };
      // scale old elo (1000 base) to new tier range — keep value, larger tiers absorb it
      return migrated;
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
function aiOppEmoji(){return rnd(AI_OPP_EMOJIS)}

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
  const idx = { lobby: 0, profile: 1, shop: 2, leaderboard: 3 }[id];
  if (idx !== undefined) document.querySelectorAll('.nav-btn')[idx].classList.add('active');
  document.querySelector('.view-wrap').scrollTop = 0;
  if (id === 'lobby') hideLobbySections();
  // toggle in-match class
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
  const range = tier.max - tier.min;
  const into = Math.max(0, Math.min(state.elo - tier.min, range));
  const pct = range > 0 ? (into / range * 100) : 100;
  document.getElementById('elo-progress-fill').style.width = pct + '%';
  document.getElementById('elo-tier-min').textContent = tier.name;
  const nextIdx = ELO_TIERS.indexOf(tier) + 1;
  document.getElementById('elo-tier-max').textContent = nextIdx < ELO_TIERS.length ? ELO_TIERS[nextIdx].name : 'MAX';
}

function toast(msg) {
  const t = document.getElementById('toast');
  t.innerHTML = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 2400);
}

/* ---- PvP ---- */
const PVP_ENTRY = 50;
const PVP_PRIZE = 90;

function startFindMatch() {
  const e = document.getElementById('pvp-error');
  if (state.balance < PVP_ENTRY) {
    e.textContent = 'Not enough tokens! Tap "+" to top up.';
    e.style.display = 'block';
    return;
  }
  e.style.display = 'none';
  state.balance -= PVP_ENTRY; updateBalance();
  document.getElementById('lobby-pvp').style.display = 'none';
  document.getElementById('pvp-searching').style.display = 'block';
  runtime.searchTimer = setTimeout(() => {
    const oppElo = Math.max(500, state.elo + Math.floor((Math.random() - 0.5) * 400));
    startGame('pvp', PVP_ENTRY, PVP_PRIZE, pvpName(), aiOppEmoji(), 3, oppElo);
  }, Math.random() * 2000 + 1200);
}

function cancelSearch() {
  clearTimeout(runtime.searchTimer);
  state.balance += PVP_ENTRY; updateBalance();
  document.getElementById('pvp-searching').style.display = 'none';
  document.getElementById('lobby-pvp').style.display = 'flex';
  toast('Entry refunded');
}

/* ---- GAME ---- */
function startGame(mode, entry, prize, oppN, oppAvatar = '🤖', bo = 3, oppElo = null) {
  runtime.currentMode = mode;
  runtime.gameState = { entry, prize, opp: oppN, oppAvatar, oppElo, scoreYou: 0, scoreOpp: 0, round: 1, bo, done: false };
  document.getElementById('opp-name').textContent = oppN.toUpperCase();
  document.getElementById('opp-avatar').textContent = oppAvatar;
  document.getElementById('you-avatar').textContent = state.avatar;
  document.getElementById('you-name').textContent = state.username.toUpperCase();
  document.getElementById('score-you').textContent = 0;
  document.getElementById('score-opp').textContent = 0;
  document.getElementById('stake-label').textContent = entry > 0 ? entry + ' token entry' : (mode === 'streak' ? 'Streak Run' : 'Tournament');
  document.getElementById('round-label').textContent = 'Best of ' + bo;
  document.getElementById('round-info').textContent = 'Round 1 of ' + bo + ' — make your pick';
  document.getElementById('choice-you').textContent = '?';
  document.getElementById('choice-opp').textContent = '?';
  document.getElementById('choice-you').classList.remove('reveal');
  document.getElementById('choice-opp').classList.remove('reveal');
  document.getElementById('round-result').textContent = '';
  document.getElementById('round-result').className = 'choice-result';
  ['btn-rock','btn-paper','btn-scissors'].forEach(id => document.getElementById(id).disabled = false);

  // ELO display only for PvP
  const youEloEl = document.getElementById('you-elo');
  const oppEloEl = document.getElementById('opp-elo');
  if (mode === 'pvp' && oppElo != null) {
    youEloEl.style.display = 'block';
    oppEloEl.style.display = 'block';
    youEloEl.textContent = state.elo + ' ELO';
    oppEloEl.textContent = oppElo + ' ELO';
  } else {
    youEloEl.style.display = 'none';
    oppEloEl.style.display = 'none';
  }

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

function eloRandom() {
  // returns int in [75, 135] inclusive
  return Math.floor(Math.random() * 61) + 75;
}

function endGame(g) {
  g.done = true;
  const won = g.scoreYou > g.scoreOpp;
  const draw = g.scoreYou === g.scoreOpp;
  const overlay = document.getElementById('result-overlay');
  const modal = document.getElementById('result-modal');
  const title = document.getElementById('result-title');
  const detail = document.getElementById('result-detail');
  const eloChangeEl = document.getElementById('elo-change-display');
  const actions = document.getElementById('result-actions');
  modal.className = 'result-modal';
  title.className = '';
  eloChangeEl.textContent = '';
  eloChangeEl.className = 'elo-change';

  let delta = 0;
  let eloDelta = 0;

  if (runtime.currentMode === 'pvp') {
    state.games++;
    if (won) {
      eloDelta = eloRandom();
      state.elo += eloDelta;
      state.wins++; delta = g.prize;
      state.balance += g.prize; state.earned += g.prize;
      modal.classList.add('win'); title.textContent = 'YOU WIN'; title.classList.add('win');
      detail.innerHTML = `+${g.prize} tokens earned`;
      eloChangeEl.textContent = `+${eloDelta} ELO`;
      eloChangeEl.classList.add('up');
      if (navigator.vibrate) navigator.vibrate([30, 50, 30, 50, 30]);
    } else if (draw) {
      delta = g.entry;
      state.balance += g.entry;
      modal.classList.add('draw'); title.textContent = 'DRAW'; title.classList.add('draw');
      detail.textContent = 'Entry refunded';
    } else {
      eloDelta = -eloRandom();
      state.elo = Math.max(0, state.elo + eloDelta);
      modal.classList.add('lose'); title.textContent = 'DEFEATED'; title.classList.add('lose');
      detail.innerHTML = `-${g.entry} tokens`;
      eloChangeEl.textContent = `${eloDelta} ELO`;
      eloChangeEl.classList.add('down');
      delta = -g.entry;
      if (navigator.vibrate) navigator.vibrate(80);
    }
    actions.innerHTML = `<button class="primary" onclick="closeResult();showView('lobby')">Back to Lobby</button>`;
    state.history.unshift({
      opp: g.opp, oppAvatar: g.oppAvatar,
      result: won ? 'W' : draw ? 'D' : 'L',
      score: g.scoreYou + '-' + g.scoreOpp,
      eloDelta: eloDelta,
      mode: 'PvP',
      time: new Date().toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }),
    });
  } else if (runtime.currentMode === 'streak') {
    handleStreakEnd(won, draw, modal, title, detail, eloChangeEl, actions);
  } else if (runtime.currentMode === 'tourney') {
    if (won) {
      state.wins++;
      modal.classList.add('win'); title.textContent = 'ADVANCED'; title.classList.add('win');
      detail.textContent = 'You move on in the bracket';
      actions.innerHTML = `<button class="primary" onclick="afterTourneyMatch(true)">Continue</button>`;
    } else if (draw) {
      modal.classList.add('draw'); title.textContent = 'DRAW'; title.classList.add('draw');
      detail.textContent = 'Replaying the match';
      actions.innerHTML = `<button class="primary" onclick="closeResult();replayTourneyMatch()">Replay</button>`;
    } else {
      modal.classList.add('lose'); title.textContent = 'ELIMINATED'; title.classList.add('lose');
      detail.textContent = 'Your run ends here';
      actions.innerHTML = `<button class="primary" onclick="afterTourneyMatch(false)">Continue</button>`;
    }
    if (!draw) state.games++;
  }

  if (state.history.length > 100) state.history = state.history.slice(0, 100);
  saveState();
  updateBalance();
  updateHeader();
  // show popup
  overlay.classList.add('open');
}

function closeResult() {
  document.getElementById('result-overlay').classList.remove('open');
}

/* ---- TOURNEY result handlers ---- */
function replayTourneyMatch() {
  const t = state.tournaments[runtime.activeTourney];
  const { roundIdx, matchIdx } = runtime.activeTourneyMatchIdx;
  const m = t.bracket.rounds[roundIdx][matchIdx];
  const opp = m.p1 === 'You' ? m.p2 : m.p1;
  const oppA = m.p1 === 'You' ? m.p2Avatar : m.p1Avatar;
  startGame('tourney', 0, 0, opp, oppA || aiOppEmoji(), 3);
}

function afterTourneyMatch(won) {
  closeResult();
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
    if (matchIdx % 2 === 0) { nm.p1 = 'You'; nm.p1Avatar = state.avatar; }
    else { nm.p2 = 'You'; nm.p2Avatar = state.avatar; }
    if (nextRound === 1) {
      const otherSF = t.bracket.rounds[1][1 - nextMatchIdx];
      if (otherSF.p1 && otherSF.p2 && !otherSF.done) {
        const w = Math.random() < 0.5 ? otherSF.p1 : otherSF.p2;
        otherSF.s1 = otherSF.p1 === w ? 2 : 1;
        otherSF.s2 = otherSF.p2 === w ? 2 : 1;
        otherSF.done = true; otherSF.winner = w;
        const fin = t.bracket.rounds[2][0];
        if (nextMatchIdx === 0) { fin.p2 = w; fin.p2Avatar = otherSF.p1 === w ? otherSF.p1Avatar : otherSF.p2Avatar; }
        else { fin.p1 = w; fin.p1Avatar = otherSF.p1 === w ? otherSF.p1Avatar : otherSF.p2Avatar; }
      }
    }
  } else if (!won) {
    // simulate rest
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
            const wAv = mm.p1 === w ? mm.p1Avatar : mm.p2Avatar;
            if (t.bracket.rounds[ri].indexOf(mm) % 2 === 0) { nm.p1 = w; nm.p1Avatar = wAv; }
            else { nm.p2 = w; nm.p2Avatar = wAv; }
          }
        }
      }
    }
    t.complete = true;
  }
  const fin = t.bracket.rounds[2][0];
  if (fin.done && fin.winner === 'You') {
    state.tourneysWon = (state.tourneysWon || 0) + 1;
    if (t.special) {
      // Reward random emoji not yet owned
      const unowned = SHOP_EMOJIS.filter(em => !state.ownedEmojis.includes(em.e));
      if (unowned.length > 0) {
        const reward = unowned[Math.floor(Math.random() * unowned.length)];
        state.ownedEmojis.push(reward.e);
        toast(`🏆 Champion! Won emoji: ${reward.e}`);
      } else {
        // No unowned left → grant tokens instead
        state.balance += 500;
        toast('🏆 Champion! All emojis owned — +500 tokens');
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

/* ---- STREAK MODE ---- */
function startStreakRun() {
  // One persistent bot per run
  runtime.streakState = {
    current: 0,
    strikes: 0,
    oppName: botName(),
    oppAvatar: aiOppEmoji(),
    countedAsGame: false, // counts as a single game in stats
  };
  startStreakMatch();
}

function startStreakMatch() {
  const ss = runtime.streakState;
  startGame('streak', 0, 0, ss.oppName, ss.oppAvatar, 3);
}

function handleStreakEnd(won, draw, modal, title, detail, eloChangeEl, actions) {
  const ss = runtime.streakState;

  if (won) {
    ss.current++;
    let newRecord = false;
    if (ss.current > state.bestStreak) {
      state.bestStreak = ss.current;
      newRecord = true;
    }
    // Reward an unowned emoji at NEW best, streak >= 5
    let rewardEmoji = null;
    if (newRecord && ss.current >= 5 && ss.current > state.lastRewardedStreak) {
      const unowned = SHOP_EMOJIS.filter(em => !state.ownedEmojis.includes(em.e));
      if (unowned.length > 0) {
        let pool = unowned;
        if (ss.current >= 15) {
          const lg = unowned.filter(e => e.rarity === 'legendary');
          if (lg.length && Math.random() < 0.5) pool = lg;
        } else if (ss.current >= 10) {
          const ep = unowned.filter(e => e.rarity === 'epic' || e.rarity === 'legendary');
          if (ep.length && Math.random() < 0.5) pool = ep;
        } else if (ss.current >= 7) {
          const r = unowned.filter(e => e.rarity !== 'common');
          if (r.length && Math.random() < 0.5) pool = r;
        }
        const reward = pool[Math.floor(Math.random() * pool.length)];
        state.ownedEmojis.push(reward.e);
        state.lastRewardedStreak = ss.current;
        rewardEmoji = reward;
      }
    }
    modal.classList.add('win'); title.textContent = `STREAK ${ss.current}`; title.classList.add('win');
    detail.innerHTML = newRecord
      ? `<strong style="color:var(--gold)">New best!</strong> Tap below to continue.`
      : (ss.strikes === 0 ? 'No strikes — keep going.' : '1 strike still on clock.');
    if (rewardEmoji) {
      detail.innerHTML += `<br><span class="muted" style="font-size:11px">Unlocked ${rewardEmoji.e}</span>`;
    }
    actions.innerHTML = `
      <button class="primary" onclick="closeResult();continueStreak()">Next →</button>
      <button onclick="closeResult();endStreakRun()">End</button>
    `;
  } else {
    if (!draw) ss.strikes++;
    if (ss.strikes >= 2) {
      modal.classList.add('lose'); title.textContent = 'RUN OVER'; title.classList.add('lose');
      detail.innerHTML = `Final streak: <strong style="color:var(--gold)">${ss.current}</strong>` + (state.bestStreak === ss.current && ss.current > 0 ? ' · New best!' : '');
      // Count as one game for stats
      if (!ss.countedAsGame) {
        state.games++;
        ss.countedAsGame = true;
      }
      // record one streak entry in history
      state.history.unshift({
        opp: ss.oppName, oppAvatar: ss.oppAvatar,
        result: ss.current >= 5 ? 'W' : 'L',
        score: ss.current + ' wins',
        eloDelta: 0,
        mode: 'Streak',
        time: new Date().toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }),
      });
      actions.innerHTML = `
        <button class="primary" onclick="closeResult();startStreakRun()">New Run</button>
        <button onclick="closeResult();showView('lobby')">Lobby</button>
      `;
    } else {
      modal.classList.add(draw ? 'draw' : 'lose');
      title.textContent = draw ? 'DRAW' : 'STRIKE 1';
      title.classList.add(draw ? 'draw' : 'lose');
      detail.textContent = draw ? 'No strike. Streak protected.' : `Streak ${ss.current} held. One more loss ends it.`;
      actions.innerHTML = `
        <button class="primary" onclick="closeResult();continueStreak()">Next →</button>
        <button onclick="closeResult();endStreakRun()">End</button>
      `;
    }
  }
}

function continueStreak() { startStreakMatch(); }
function endStreakRun() {
  // Only count as a game if not already counted
  const ss = runtime.streakState;
  if (ss && !ss.countedAsGame) {
    state.games++;
    state.history.unshift({
      opp: ss.oppName, oppAvatar: ss.oppAvatar,
      result: ss.current >= 5 ? 'W' : (ss.current > 0 ? 'D' : 'L'),
      score: ss.current + ' wins',
      eloDelta: 0,
      mode: 'Streak',
      time: new Date().toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }),
    });
    ss.countedAsGame = true;
    saveState();
  }
  runtime.streakState = null;
  showView('lobby');
}

/* ---- TOURNAMENTS ---- */
const TOURNEY_TEMPLATES = [
  { name: 'Mystery Cup', entry: 10, prize: 0, slots: 4, special: true, prizeLabel: '🎁 Random Emoji' },
  { name: 'Beginner Bash', entry: 25, prize: 175, slots: 7, special: false },
  { name: 'Weekend Brawl', entry: 50, prize: 350, slots: 5, special: false },
  { name: 'Coin Clashers', entry: 100, prize: 750, slots: 6, special: false },
  { name: 'Elite Cup', entry: 500, prize: 3500, slots: 3, special: false },
];

function initTourneys() {
  // If older state with different templates, refresh
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
      : `<div class="tourney-prize">🎟️ ${t.prize}</div><div class="tourney-entry">Prize Pool</div>`;
    return `
      <div class="tourney-card ${t.joined ? 'active-tourney' : ''} ${t.special ? 'special' : ''}">
        <div class="tourney-info">
          <div class="tourney-name">${t.name} ${status}</div>
          <div class="tourney-meta">
            <span>🎟️ ${t.entry} entry</span>
            <span>👥 ${t.slots} spots</span>
            <span>${t.special ? '4-player' : '8-player'}</span>
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
    ? `Prize: <strong style="color:var(--epic)">Random emoji of any rarity</strong> you don't already own`
    : `Prize: <strong style="color:var(--gold)">${t.prize} tokens</strong>`;
  openModal('Join ' + t.name + '?',
    `Entry: <strong style="color:var(--gold)">${t.entry} tokens</strong><br>${prizeText}<br>Format: ${t.special ? '4' : '8'}-player single elimination, best of 3.`,
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
  const playerAvatars = ['You'].concat(Array.from({length: playerCount - 1}, () => aiOppEmoji()));

  if (playerCount === 4) {
    // 4-player: 2 SF + 1 final
    const sf = [
      { p1: players[0], p2: players[1], p1Avatar: state.avatar, p2Avatar: playerAvatars[1], s1: null, s2: null, done: false },
      { p1: players[2], p2: players[3], p1Avatar: playerAvatars[2], p2Avatar: playerAvatars[3], s1: null, s2: null, done: false },
    ];
    const fin = [{ p1: null, p2: null, p1Avatar: null, p2Avatar: null, s1: null, s2: null, done: false }];
    // simulate other SF
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
    { p1: players[0], p2: players[1], p1Avatar: state.avatar, p2Avatar: playerAvatars[1], s1: null, s2: null, done: false },
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
      const p1Display = m.p1 === 'You' ? state.username.toUpperCase() : (m.p1 ? m.p1.toUpperCase() : 'TBD');
      const p2Display = m.p2 === 'You' ? state.username.toUpperCase() : (m.p2 ? m.p2.toUpperCase() : 'TBD');
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
  startGame('tourney', 0, 0, opp, oppAvatar || aiOppEmoji(), 3);
}

/* ---- HISTORY ---- */
function renderHistory() {
  const el = document.getElementById('history-list');
  if (!state.history.length) {
    el.innerHTML = '<div class="empty-state">No matches yet.</div>';
    return;
  }
  el.innerHTML = state.history.map(h => {
    const eloDisp = h.eloDelta != null && h.eloDelta !== 0
      ? `<span class="hist-elo ${h.eloDelta > 0 ? 'pos' : 'neg'}">${h.eloDelta > 0 ? '+' : ''}${h.eloDelta} ELO</span>`
      : `<span class="hist-elo zero">—</span>`;
    const av = h.oppAvatar || '🤖';
    const oppName = (h.opp || 'Bot').toUpperCase();
    return `
      <div class="history-item">
        <span class="hist-result ${h.result}">${h.result}</span>
        <div class="hist-opp-row">
          <div class="hist-opp"><span class="av">${av}</span> ${oppName}</div>
          <div style="color:var(--muted);font-size:10px">${h.mode} · ${h.score} · ${h.time}</div>
        </div>
        ${eloDisp}
      </div>
    `;
  }).join('');
}

/* ---- PROFILE ---- */
function renderProfile() {
  document.getElementById('profile-avatar').textContent = state.avatar;
  document.getElementById('profile-name').textContent = state.username.toUpperCase();
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
  // reset button
  if (state.freshStartUsed) {
    document.getElementById('reset-btn').style.display = 'none';
    document.getElementById('reset-used-note').style.display = 'block';
  } else {
    document.getElementById('reset-btn').style.display = 'block';
    document.getElementById('reset-used-note').style.display = 'none';
  }
}

function toggleAccordion(id) {
  document.getElementById(id).classList.toggle('open');
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

/* ---- FRESH START ---- */
function confirmReset() {
  if (state.freshStartUsed) { toast('Fresh start already used'); return; }
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
  // Preserve owned emojis and balance
  const keep = {
    ownedEmojis: state.ownedEmojis,
    avatar: state.avatar,
    balance: state.balance,
    username: state.username,
    hasNamed: state.hasNamed,
  };
  state = { ...DEFAULT_STATE, ...keep, freshStartUsed: true };
  saveState();
  document.getElementById('reset-modal').classList.remove('open');
  document.getElementById('confirm-input').value = '';
  initTourneys();
  updateBalance();
  updateHeader();
  renderProfile();
  toast('Fresh start complete');
  showView('lobby');
}

/* ---- SHOP ---- */
function setShopTab(el, cat) {
  document.querySelectorAll('.shop-tab').forEach(t => t.classList.remove('active'));
  el.classList.add('active');
  runtime.shopCat = cat;
  renderShop();
}

const RARITY_ORDER = ['legendary', 'epic', 'rare', 'common'];
const RARITY_LABEL = { legendary: 'Legendary', epic: 'Epic', rare: 'Rare', common: 'Common' };

function renderShop() {
  const el = document.getElementById('shop-content');
  let pool = SHOP_EMOJIS;
  if (runtime.shopCat !== 'all') {
    pool = pool.filter(e => e.cat === runtime.shopCat);
  }
  let html = '';

  // Owned section first
  const owned = pool.filter(e => state.ownedEmojis.includes(e.e));
  if (owned.length) {
    html += `<div class="shop-section-title owned">Owned (${owned.length})</div>`;
    html += `<div class="shop-grid">` + owned.map(itemHtml).join('') + `</div>`;
  }

  // Featured section (only for 'all' tab)
  if (runtime.shopCat === 'all') {
    const featured = SHOP_EMOJIS.filter(e => e.featured && !state.ownedEmojis.includes(e.e));
    if (featured.length) {
      html += `<div class="shop-section-title featured">⭐ Featured</div>`;
      html += `<div class="shop-grid">` + featured.map(itemHtml).join('') + `</div>`;
    }
  }

  // Rarity sections, descending
  const unowned = pool.filter(e => !state.ownedEmojis.includes(e.e));
  for (const r of RARITY_ORDER) {
    const subset = unowned.filter(e => e.rarity === r);
    if (!subset.length) continue;
    // skip showing featured items twice in 'all' tab
    const list = runtime.shopCat === 'all' ? subset.filter(e => !e.featured) : subset;
    if (!list.length) continue;
    // Sort by price desc within rarity
    list.sort((a,b) => b.price - a.price);
    html += `<div class="shop-section-title ${r}">${RARITY_LABEL[r]} (${list.length})</div>`;
    html += `<div class="shop-grid">` + list.map(itemHtml).join('') + `</div>`;
  }

  el.innerHTML = html || '<div class="empty-state">No emojis in this category.</div>';
}

function itemHtml(em) {
  const owned = state.ownedEmojis.includes(em.e);
  const equipped = state.avatar === em.e;
  let action;
  if (equipped) action = '<div class="shop-action equipped">EQUIPPED</div>';
  else if (owned) action = '<div class="shop-action owned">EQUIP</div>';
  else action = `<div class="shop-action buy">🎟️ ${em.price}</div>`;
  return `
    <div class="shop-item ${equipped ? 'equipped' : ''}" onclick="shopAction('${em.e}')">
      <div class="rarity-tag ${em.rarity}"></div>
      <div class="shop-emoji">${em.e}</div>
      ${action}
    </div>
  `;
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
    toast('Equipped ' + emoji);
    return;
  }
  if (state.balance < item.price) { toast('Not enough tokens'); return; }
  openModal('Buy this emoji?',
    `<div style="font-size:32px;text-align:center;margin:8px 0">${item.e}</div>Price: <strong style="color:var(--gold)">${item.price} tokens</strong><br>You'll have ${state.balance - item.price} after.`,
    () => {
      state.balance -= item.price;
      state.ownedEmojis.push(emoji);
      state.avatar = emoji;
      saveState();
      updateBalance();
      updateHeader();
      renderShop();
      toast('Unlocked ' + emoji);
    }
  );
}

/* ---- LEADERBOARD ---- */
function generateLeaderboard() {
  // Synthetic leaderboard with 14 AI players + the user, sorted by ELO
  // Use a deterministic-ish set per session so it doesn't flip wildly
  const seed = state.elo;
  const players = PVP_NAMES.slice(0, 14).map((n, i) => {
    // Distribute around ELO range
    const rand = ((seed * 9301 + i * 49297) % 233280) / 233280;
    const baseElo = Math.floor(rand * 5500) + 800;
    return { name: n, avatar: AI_OPP_EMOJIS[i % AI_OPP_EMOJIS.length], elo: baseElo, you: false };
  });
  players.push({ name: state.username, avatar: state.avatar, elo: state.elo, you: true });
  players.sort((a, b) => b.elo - a.elo);
  return players;
}

function renderLeaderboard() {
  const players = generateLeaderboard();
  const el = document.getElementById('lb-list');
  el.innerHTML = players.map((p, i) => {
    const tier = getTier(p.elo);
    const rankClass = i < 3 ? 'top' : '';
    return `
      <div class="lb-row ${p.you ? 'you' : ''}">
        <div class="lb-rank ${rankClass}">${i + 1}</div>
        <div class="lb-avatar">${p.avatar}</div>
        <div>
          <div class="lb-name">${p.name.toUpperCase()}${p.you ? ' (YOU)' : ''}</div>
          <div class="lb-tier" style="color:${tier.color}">${tier.name}</div>
        </div>
        <div style="margin-left:auto" class="lb-elo">${p.elo}</div>
      </div>
    `;
  }).join('');
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
