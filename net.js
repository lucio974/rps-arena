/* RPS Arena — real-time PvP client
   Talks to the relay server (see server.js). Only used by ranked PvP;
   bot/streak/tourney/friend modes stay local/simulated. */

// TODO: set this to your deployed relay's wss:// URL before shipping.
const RPS_WS_URL = 'wss://YOUR-RELAY.onrender.com';

const NetClient = (() => {
  let ws = null;
  let onMatchedCb = null;
  let onRoundResultCb = null;
  let onOpponentLeftCb = null;
  let onErrorCb = null;

  function ensureConnected() {
    return new Promise((resolve, reject) => {
      if (ws && ws.readyState === WebSocket.OPEN) return resolve();
      ws = new WebSocket(RPS_WS_URL);

      ws.onopen = () => resolve();
      ws.onerror = () => { if (onErrorCb) onErrorCb(); reject(new Error('ws error')); };
      ws.onclose = () => { ws = null; };

      ws.onmessage = (evt) => {
        let msg;
        try { msg = JSON.parse(evt.data); } catch { return; }
        if (msg.type === 'matched' && onMatchedCb) onMatchedCb(msg.opponent);
        else if (msg.type === 'round_result' && onRoundResultCb) onRoundResultCb(msg);
        else if (msg.type === 'opponent_left' && onOpponentLeftCb) onOpponentLeftCb();
      };
    });
  }

  return {
    // Queue for a real match. `onMatched({name,avatar,elo})` fires once paired.
    async findMatch(playerInfo, onMatched) {
      onMatchedCb = onMatched;
      try {
        await ensureConnected();
        ws.send(JSON.stringify({ type: 'queue', ...playerInfo }));
      } catch (e) {
        if (onErrorCb) onErrorCb();
      }
    },

    cancelFind() {
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'cancel' }));
      }
    },

    sendPick(choice) {
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'pick', choice }));
      }
    },

    leaveMatch() {
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'leave' }));
      }
    },

    onRoundResult(cb) { onRoundResultCb = cb; },
    onOpponentLeft(cb) { onOpponentLeftCb = cb; },
    onError(cb) { onErrorCb = cb; },
  };
})();
