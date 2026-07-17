/* RPS Arena — matchmaking + round relay server
   Deploy target: Render free tier (or any Node host)
   Protocol: JSON over WebSocket, one message per line

   Client -> Server
     {type:'queue', name, avatar, elo}
     {type:'cancel'}
     {type:'pick', choice}        choice: 'rock'|'paper'|'scissors'
     {type:'leave'}

   Server -> Client
     {type:'matched', opponent:{name,avatar,elo}}
     {type:'round_result', you, opp, outcome}   outcome: 'W'|'L'|'D' (from this client's POV)
     {type:'opponent_left'}
*/

const { WebSocketServer } = require('ws');
const http = require('http');

const PORT = process.env.PORT || 8080;

// Simple health-check HTTP server so Render's free tier can ping it awake.
const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('rps-arena relay ok');
});

const wss = new WebSocketServer({ server });

let queue = [];           // sockets waiting for a match
const rooms = new Map();  // ws -> shared match object { p1, p2, picks: Map<ws, choice> }

function beats(a, b) {
  return (a === 'rock' && b === 'scissors') ||
         (a === 'paper' && b === 'rock') ||
         (a === 'scissors' && b === 'paper');
}

function send(ws, obj) {
  if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(obj));
}

function removeFromQueue(ws) {
  queue = queue.filter(s => s !== ws);
}

function opponentOf(match, ws) {
  return match.p1 === ws ? match.p2 : match.p1;
}

function endRoom(ws, notifyLeft) {
  const match = rooms.get(ws);
  if (!match) return;
  const opp = opponentOf(match, ws);
  rooms.delete(ws);
  if (opp) {
    rooms.delete(opp);
    if (notifyLeft) send(opp, { type: 'opponent_left' });
  }
}

function tryMatch() {
  while (queue.length >= 2) {
    const a = queue.shift();
    const b = queue.shift();
    if (a.readyState !== a.OPEN) { queue.unshift(b); continue; }
    if (b.readyState !== b.OPEN) { queue.unshift(a); continue; }

    const match = { p1: a, p2: b, picks: new Map() };
    rooms.set(a, match);
    rooms.set(b, match);

    send(a, { type: 'matched', opponent: { name: b.playerName, avatar: b.playerAvatar, elo: b.playerElo } });
    send(b, { type: 'matched', opponent: { name: a.playerName, avatar: a.playerAvatar, elo: a.playerElo } });
  }
}

wss.on('connection', (ws) => {
  ws.isAlive = true;
  ws.on('pong', () => { ws.isAlive = true; });

  ws.on('message', (raw) => {
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }

    if (msg.type === 'queue') {
      ws.playerName = String(msg.name || 'Player').slice(0, 16);
      ws.playerAvatar = String(msg.avatar || '🤖').slice(0, 8);
      ws.playerElo = Number.isFinite(msg.elo) ? msg.elo : 1000;
      removeFromQueue(ws);
      queue.push(ws);
      tryMatch();
      return;
    }

    if (msg.type === 'cancel') {
      removeFromQueue(ws);
      return;
    }

    if (msg.type === 'pick') {
      const match = rooms.get(ws);
      if (!match) return;
      const choice = msg.choice;
      if (!['rock', 'paper', 'scissors'].includes(choice)) return;
      if (match.picks.has(ws)) return; // already picked this round

      match.picks.set(ws, choice);
      const opp = opponentOf(match, ws);
      if (!match.picks.has(opp)) return; // wait for opponent's pick

      const myChoice = match.picks.get(ws);
      const oppChoice = match.picks.get(opp);
      let outcomeForMe, outcomeForOpp;
      if (myChoice === oppChoice) { outcomeForMe = 'D'; outcomeForOpp = 'D'; }
      else if (beats(myChoice, oppChoice)) { outcomeForMe = 'W'; outcomeForOpp = 'L'; }
      else { outcomeForMe = 'L'; outcomeForOpp = 'W'; }

      send(ws, { type: 'round_result', you: myChoice, opp: oppChoice, outcome: outcomeForMe });
      send(opp, { type: 'round_result', you: oppChoice, opp: myChoice, outcome: outcomeForOpp });

      match.picks.clear();
      return;
    }

    if (msg.type === 'leave') {
      endRoom(ws, true);
      return;
    }
  });

  ws.on('close', () => {
    removeFromQueue(ws);
    endRoom(ws, true);
  });
});

// Drop dead connections (Render free tier idles aggressively otherwise).
const heartbeat = setInterval(() => {
  wss.clients.forEach((ws) => {
    if (ws.isAlive === false) return ws.terminate();
    ws.isAlive = false;
    ws.ping();
  });
}, 30000);

wss.on('close', () => clearInterval(heartbeat));

server.listen(PORT, () => console.log('rps-arena relay listening on ' + PORT));
