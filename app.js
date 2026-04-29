/* RPS Arena - PWA app logic */
const NAMES = ['Shadow_X','GrindKing','Nova_88','PixelWarrior','ThunderPaw','Ace_RPS','IronFist','Blaze_Pro','CryptoK','VoidWalker','RapidFire','CosmicG','NeonRune','SilverFox','MachoMan','BoltZero'];

const DEFAULT_STATE = {
  balance: 1000,
  wins: 0,
  games: 0,
  earned: 0,
  history: [],
  tournaments: null,
};

let state = loadState();
let runtime = {
  searchTimer: null,
  currentEntry: 10,
  currentPrize: 18,
  currentMode: 'pvp',
  gameState: null,
  selectedEntryEl: null,
  activeTourney: null,
  activeTourneyMatchIdx: null,
  modalCb: null,
};

function loadState() {
  try {
    const raw = localStorage.getItem('rps-arena-state');
    if (raw) return { ...DEFAULT_STATE, ...JSON.parse(raw) };
  } catch(e) {}
  return { ...DEFAULT_STATE };
}
function saveState() {
  try { localStorage.setItem('rps-arena-state', JSON.stringify(state)); } catch(e) {}
}

function rnd(arr){return arr[Math.floor(Math.random()*arr.length)]}
function rps(){return rnd(['rock','paper','scissors'])}
function beats(a,b){return(a==='rock'&&b==='scissors')||(a==='paper'&&b==='rock')||(a==='scissors'&&b==='paper')}
function oppName(){return rnd(NAMES)}

function showView(id) {
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
  document.getElementById('view-' + id).classList.add('active');
  const idx = { lobby: 0, pvp: 1, tourney: 2, history: 3 }[id];
  if (idx !== undefined) document.querySelectorAll('.nav-btn')[idx].classList.add('active');
  document.querySelector('.view-wrap').scrollTop = 0;
  updateStats();
}

function updateBalance() { document.getElementById('balance-display').textContent = state.balance; saveState(); }
function updateStats() {
  document.getElementById('stat-wins').textContent = state.wins;
  document.getElementById('stat-games').textContent = state.games;
  document.getElementById('stat-earned').textContent = state.earned;
}

function toast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 2200);
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
    e.textContent = 'Not enough coins! Tap "+ Buy" to top up.';
    e.style.display = 'block';
    return;
  }
  e.style.display = 'none';
  state.balance -= runtime.currentEntry; updateBalance();
  document.getElementById('pvp-lobby').style.display = 'none';
  document.getElementById('pvp-searching').style.display = 'block';
  document.getElementById('search-entry-display').textContent = runtime.currentEntry;
  runtime.searchTimer = setTimeout(() => {
    startGame('pvp', runtime.currentEntry, runtime.currentPrize, oppName());
  }, Math.random() * 2000 + 1200);
}

function cancelSearch() {
  clearTimeout(runtime.searchTimer);
  state.balance += runtime.currentEntry; updateBalance();
  document.getElementById('pvp-searching').style.display = 'none';
  document.getElementById('pvp-lobby').style.display = 'block';
  toast('Entry refunded');
}

function startGame(mode, entry, prize, oppN, bo = 3) {
  runtime.currentMode = mode;
  runtime.gameState = { entry, prize, opp: oppN, scoreYou: 0, scoreOpp: 0, round: 1, bo, done: false };
  document.getElementById('opp-name').textContent = oppN;
  document.getElementById('score-you').textContent = 0;
  document.getElementById('score-opp').textContent = 0;
  document.getElementById('stake-label').textContent = entry > 0 ? entry + ' coin entry' : 'Free play';
  document.getElementById('round-label').textContent = 'Best of ' + bo;
  document.getElementById('round-info').textContent = 'Round 1 of ' + bo + ' — make your pick';
  document.getElementById('choice-you').textContent = '?';
  document.getElementById('choice-opp').textContent = '?';
  document.getElementById('choice-you').classList.remove('reveal');
  document.getElementById('choice-opp').classList.remove('reveal');
  document.getElementById('round-result').textContent = '';
  document.getElementById('round-result').className = 'choice-result';
  document.getElementById('result-banner').style.display = 'none';
  ['btn-rock','btn-paper','btn-scissors'].forEach(id => document.getElementById(id).disabled = false);
  if (mode === 'pvp') {
    document.getElementById('pvp-searching').style.display = 'none';
    document.getElementById('pvp-lobby').style.display = 'block';
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

  // haptic
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
    const need = Math.ceil(g.bo / 2) + (g.bo % 2 === 0 ? 0 : 0); // first to ceil(bo/2)... but for bo3 it's 2
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

function endGame(g) {
  g.done = true;
  const won = g.scoreYou > g.scoreOpp;
  const draw = g.scoreYou === g.scoreOpp;
  const banner = document.getElementById('result-banner');
  const title = document.getElementById('result-title');
  const detail = document.getElementById('result-detail');
  state.games++;
  let delta = 0;
  if (won) {
    state.wins++; delta = g.prize;
    state.balance += g.prize; state.earned += g.prize;
    banner.className = 'result-banner win'; title.textContent = 'YOU WIN!';
    detail.textContent = g.prize > 0 ? '+' + g.prize + ' coins added to wallet' : 'Practice match — no coins awarded';
    if (navigator.vibrate) navigator.vibrate([30, 50, 30, 50, 30]);
  } else if (draw) {
    delta = g.entry;
    state.balance += g.entry;
    banner.className = 'result-banner draw'; title.textContent = 'DRAW';
    detail.textContent = g.entry > 0 ? 'Entry refunded' : 'Even match';
  } else {
    banner.className = 'result-banner lose'; title.textContent = 'DEFEATED';
    detail.textContent = g.entry > 0 ? '-' + g.entry + ' coins lost' : 'Better luck next time';
    delta = -g.entry;
    if (navigator.vibrate) navigator.vibrate(80);
  }
  updateBalance(); updateStats();
  state.history.unshift({
    opp: g.opp,
    result: won ? 'W' : draw ? 'D' : 'L',
    score: g.scoreYou + '-' + g.scoreOpp,
    entry: g.entry, delta,
    mode: g.entry === 0 ? 'Practice' : runtime.currentMode === 'tourney' ? 'Tourney' : 'PvP',
    time: new Date().toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }),
  });
  if (state.history.length > 100) state.history = state.history.slice(0, 100);
  saveState();
  banner.style.display = 'block';
  if (runtime.currentMode === 'tourney' && runtime.activeTourney !== null) {
    setTimeout(() => onTourneyMatchEnd(won), 1300);
  }
}

function leaveGame() {
  if (runtime.currentMode === 'tourney') showTourneyBracket(runtime.activeTourney);
  else showView('lobby');
}

function quickFree() { startGame('free', 0, 0, 'Bot_AI'); }

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
            ? `<button class="join-btn" onclick="showTourneyBracket(${t.id})">${t.complete ? 'View' : 'Play'}</button>`
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
  setTimeout(() => showTourneyBracket(id), 200);
}

function buildBracket(t) {
  const names = [...NAMES];
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

function showTourneyList() {
  document.getElementById('tourney-list-wrap').style.display = 'block';
  document.getElementById('tourney-bracket-wrap').style.display = 'none';
  renderTourneyList();
}

function showTourneyBracket(id) {
  runtime.activeTourney = id;
  const t = state.tournaments[id];
  document.getElementById('tourney-list-wrap').style.display = 'none';
  document.getElementById('tourney-bracket-wrap').style.display = 'block';
  document.getElementById('bracket-tourney-name').textContent = t.name;
  document.getElementById('bracket-prize').textContent = '🏆 ' + t.prize;
  renderBracket(t);
  showView('tourney');
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
      div.innerHTML = `
        <div class="bracket-player ${p1class}">${m.p1 || 'TBD'}<span class="bracket-score">${m.s1 !== null ? m.s1 : ''}</span></div>
        <div class="bracket-player ${p2class}">${m.p2 || 'TBD'}<span class="bracket-score">${m.s2 !== null ? m.s2 : ''}</span></div>
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
      // check if player eliminated
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
  const prizeForWinner = roundIdx === 2 ? t.prize : roundIdx === 1 ? Math.floor(t.prize * 0.4) : Math.floor(t.prize * 0.15);
  startGame('tourney', 0, prizeForWinner, opp, 3);
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
    // simulate rest of the tournament
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
  // Check if final won
  const fin = t.bracket.rounds[2][0];
  if (fin.done && fin.winner === 'You') {
    state.balance += t.prize; state.earned += t.prize;
    updateBalance(); updateStats();
    toast('🏆 Champion! +' + t.prize + ' coins');
    t.complete = true;
  } else if (won && roundIdx === 1) {
    // semifinal win bonus
    const semibonus = Math.floor(t.prize * 0.15);
    state.balance += semibonus; state.earned += semibonus;
    updateBalance();
    toast('Made it to final! +' + semibonus + ' coins');
  }
  saveState();
  showTourneyBracket(runtime.activeTourney);
}

/* ---- HISTORY ---- */
function renderHistory() {
  const el = document.getElementById('history-list');
  if (!state.history.length) {
    el.innerHTML = '<div class="empty-state">No matches yet.<br>Start playing!</div>';
    return;
  }
  el.innerHTML = state.history.map(h => `
    <div class="history-item">
      <span class="hist-result ${h.result}">${h.result}</span>
      <div style="flex:1;min-width:0;font-size:12px">
        <div style="font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${h.opp}</div>
        <div style="color:var(--muted);font-size:10px">${h.mode} · ${h.time}</div>
      </div>
      <span style="color:var(--muted);font-size:12px">${h.score}</span>
      <span class="hist-earn ${h.delta > 0 ? 'pos' : h.delta < 0 ? 'neg' : ''}">${h.delta > 0 ? '+' : ''}${h.delta} 🪙</span>
    </div>
  `).join('');
}

/* ---- MODAL ---- */
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
updateStats();
initTourneys();
renderTourneyList();

if (isIOS() && !isStandalone()) {
  try {
    if (!localStorage.getItem('rps-install-dismissed')) {
      document.getElementById('install-hint').classList.add('show');
    }
  } catch(e) {}
}

// Prevent iOS bounce on overscroll
document.addEventListener('touchmove', (e) => {
  if (e.target.closest('.view-wrap, .bracket-wrap')) return;
  if (e.touches.length > 1) e.preventDefault();
}, { passive: false });

// Prevent double-tap zoom
let lastTouch = 0;
document.addEventListener('touchend', (e) => {
  const now = Date.now();
  if (now - lastTouch <= 300) e.preventDefault();
  lastTouch = now;
}, { passive: false });
