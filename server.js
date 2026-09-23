const path = require('path');
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { pingTimeout: 20000, pingInterval: 10000 });

const PORT = process.env.PORT || 3000;

const PRESETS = {
  full: ['reaction', 'sequence', 'aim', 'number', 'verbal', 'chimp', 'visual', 'typing', 'tracking', 'burst'],
  human: ['reaction', 'sequence', 'aim', 'number', 'verbal', 'chimp', 'visual', 'typing'],
  gamer: ['reaction', 'aim', 'tracking', 'burst']
};

const LOWER_WINS = new Set(['reaction', 'aim']);
const MASCOTS = new Set(['blob', 'bean', 'boxy', 'puff', 'starlet', 'bot']);
const METRIC_BOUNDS = {
  reaction: [70, 1500],
  aim: [70, 4000],
  tracking: [0, 100],
  burst: [0, 40],
  sequence: [0, 30],
  number: [0, 30],
  verbal: [0, 60],
  chimp: [0, 30],
  visual: [0, 30],
  typing: [0, 300]
};

const ROUND_TIMEOUT_MS = {
  reaction: 42000,
  aim: 45000,
  tracking: 14000,
  burst: 11000,
  sequence: 100000,
  number: 105000,
  verbal: 75000,
  chimp: 90000,
  visual: 105000,
  typing: 42000
};

const rooms = new Map();
app.get('/health', (_req, res) => res.status(200).send('ok'));
app.use(express.static(path.join(__dirname, 'public')));

function roomCode() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  do {
    code = Array.from({ length: 5 }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join('');
  } while (rooms.has(code));
  return code;
}

function publicState(room) {
  return {
    code: room.code,
    ownerId: room.ownerId,
    preset: room.preset,
    totalRounds: PRESETS[room.preset].length,
    players: [...room.players.values()].map(p => ({
      id: p.id,
      name: p.name,
      ready: p.ready,
      wins: p.wins,
      coins: p.coins || 0,
      streak: p.streak || 0,
      mascot: p.mascot || 'blob'
    })),
    round: room.round,
    inMatch: room.inMatch
  };
}

function shuffled(items) {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function metricFor(mode, payload) {
  const n = Number(payload?.metric);
  if (!Number.isFinite(n)) return null;
  const [min, max] = METRIC_BOUNDS[mode] || [-Infinity, Infinity];
  return Math.max(min, Math.min(max, n));
}

function worstMetric(mode) {
  const [min, max] = METRIC_BOUNDS[mode];
  return LOWER_WINS.has(mode) ? max : min;
}

function roundWinner(mode, results) {
  const entries = [...results.entries()];
  if (entries.length < 2) return null;
  const [[idA, a], [idB, b]] = entries;
  const diff = Math.abs(a.metric - b.metric);
  const tieThreshold = {
    reaction: 1,
    aim: 1,
    tracking: 0.25,
    burst: 0.05,
    typing: 0.1
  }[mode] ?? 0;

  if (diff <= tieThreshold) return { winnerId: null, tie: true };
  return {
    winnerId: LOWER_WINS.has(mode)
      ? (a.metric < b.metric ? idA : idB)
      : (a.metric > b.metric ? idA : idB),
    tie: false
  };
}

function clearRoundTimer(room) {
  if (room.roundTimer) clearTimeout(room.roundTimer);
  room.roundTimer = null;
}

function finishRoundIfReady(room) {
  if (!room.inMatch || room.results.size !== 2) return;
  clearRoundTimer(room);

  const outcome = roundWinner(room.currentMode, room.results);
  const coinDelta = {};
  for (const player of room.players.values()) coinDelta[player.id] = 0;

  if (outcome?.winnerId && room.players.has(outcome.winnerId)) {
    const winner = room.players.get(outcome.winnerId);
    const loser = [...room.players.values()].find(p => p.id !== outcome.winnerId);
    winner.wins += 1;
    winner.streak = (winner.streak || 0) + 1;
    if (loser) loser.streak = 0;

    const streakBonus = Math.min(75, Math.max(0, winner.streak - 1) * 25);
    const winnerReward = 100 + streakBonus;
    winner.coins = (winner.coins || 0) + winnerReward;
    coinDelta[winner.id] = winnerReward;
    if (loser) coinDelta[loser.id] = 0;
  } else {
    for (const player of room.players.values()) {
      player.streak = 0;
      player.coins = (player.coins || 0) + 50;
      coinDelta[player.id] = 50;
    }
  }

  const results = [...room.results.entries()].map(([id, value]) => ({ id, ...value }));
  io.to(room.code).emit('roundEnd', {
    round: room.round + 1,
    mode: room.currentMode,
    winnerId: outcome?.winnerId || null,
    tie: !!outcome?.tie,
    coinDelta,
    results,
    players: [...room.players.values()].map(p => ({ id: p.id, name: p.name, wins: p.wins, coins: p.coins || 0, streak: p.streak || 0, mascot: p.mascot || 'blob' }))
  });

  room.round += 1;
  setTimeout(() => startRound(room), 3500);
}

function startRound(room) {
  if (!room.inMatch || room.players.size !== 2) return;

  if (room.round >= room.modes.length) {
    finishMatch(room);
    return;
  }

  room.results.clear();
  room.currentMode = room.modes[room.round];
  room.currentSeed = Math.floor(Math.random() * 2_000_000_000);

  io.to(room.code).emit('roundIntro', {
    round: room.round + 1,
    totalRounds: room.modes.length,
    mode: room.currentMode,
    seed: room.currentSeed
  });

  setTimeout(() => {
    if (!room.inMatch) return;
    io.to(room.code).emit('roundStart', {
      round: room.round + 1,
      mode: room.currentMode,
      seed: room.currentSeed,
      serverTime: Date.now()
    });

    clearRoundTimer(room);
    room.roundTimer = setTimeout(() => {
      if (!room.inMatch || room.results.size === 2) return;
      for (const player of room.players.values()) {
        if (!room.results.has(player.id)) {
          room.results.set(player.id, { metric: worstMetric(room.currentMode), details: { timeout: true } });
        }
      }
      io.to(room.code).emit('roundProgress', { finished: room.results.size, total: 2 });
      finishRoundIfReady(room);
    }, ROUND_TIMEOUT_MS[room.currentMode] || 60000);
  }, 2200);
}

function finishMatch(room) {
  clearRoundTimer(room);
  room.inMatch = false;
  const players = [...room.players.values()];
  const maxWins = Math.max(...players.map(p => p.wins));
  const leaders = players.filter(p => p.wins === maxWins);
  const winner = leaders.length === 1 ? leaders[0] : null;

  io.to(room.code).emit('matchEnd', {
    winnerId: winner?.id || null,
    players: players.map(p => ({ id: p.id, name: p.name, wins: p.wins, coins: p.coins || 0, streak: p.streak || 0, mascot: p.mascot || 'blob' }))
  });

  for (const p of room.players.values()) p.ready = false;
}


function maybeStart(room) {
  const players = [...room.players.values()];
  if (players.length !== 2 || room.inMatch || !players.every(p => p.ready)) return;

  room.inMatch = true;
  room.round = 0;
  room.modes = shuffled(PRESETS[room.preset]);
  room.results = new Map();
  room.currentMode = null;
  for (const p of players) { p.wins = 0; p.coins = 0; p.streak = 0; }

  io.to(room.code).emit('matchStart', { modes: room.modes, totalRounds: room.modes.length, preset: room.preset });
  setTimeout(() => startRound(room), 1000);
}

function leaveRoom(socket) {
  const code = socket.data.roomCode;
  if (!code) return;
  const room = rooms.get(code);
  socket.leave(code);
  socket.data.roomCode = null;
  if (!room) return;

  room.players.delete(socket.id);
  if (room.players.size === 0) {
    clearRoundTimer(room);
    rooms.delete(code);
    return;
  }

  clearRoundTimer(room);
  room.inMatch = false;
  if (room.ownerId === socket.id) room.ownerId = [...room.players.keys()][0];
  for (const p of room.players.values()) p.ready = false;
  io.to(code).emit('opponentLeft');
  io.to(code).emit('roomState', publicState(room));
}

io.on('connection', socket => {
  socket.on('createRoom', ({ name, preset, mascot } = {}, ack = () => {}) => {
    leaveRoom(socket);
    const code = roomCode();
    const chosenPreset = PRESETS[preset] ? preset : 'full';
    const room = {
      code,
      ownerId: socket.id,
      preset: chosenPreset,
      players: new Map(),
      inMatch: false,
      round: 0,
      modes: [],
      results: new Map(),
      currentMode: null,
      currentSeed: null,
      roundTimer: null
    };
    room.players.set(socket.id, { id: socket.id, name: String(name || 'Player 1').slice(0, 18), mascot: MASCOTS.has(mascot) ? mascot : 'blob', ready: false, wins: 0, coins: 0, streak: 0 });
    rooms.set(code, room);
    socket.join(code);
    socket.data.roomCode = code;
    ack({ ok: true, code, id: socket.id });
    io.to(code).emit('roomState', publicState(room));
  });

  socket.on('joinRoom', ({ code, name, mascot } = {}, ack = () => {}) => {
    leaveRoom(socket);
    const normalized = String(code || '').trim().toUpperCase();
    const room = rooms.get(normalized);
    if (!room) return ack({ ok: false, error: 'Room not found.' });
    if (room.players.size >= 2) return ack({ ok: false, error: 'Room is full.' });
    if (room.inMatch) return ack({ ok: false, error: 'Match already started.' });

    room.players.set(socket.id, { id: socket.id, name: String(name || 'Player 2').slice(0, 18), mascot: MASCOTS.has(mascot) ? mascot : 'blob', ready: false, wins: 0, coins: 0, streak: 0 });
    socket.join(normalized);
    socket.data.roomCode = normalized;
    ack({ ok: true, code: normalized, id: socket.id });
    io.to(normalized).emit('roomState', publicState(room));
  });

  socket.on('setPreset', ({ preset } = {}) => {
    const room = rooms.get(socket.data.roomCode);
    if (!room || room.inMatch || room.ownerId !== socket.id || !PRESETS[preset]) return;
    room.preset = preset;
    for (const p of room.players.values()) p.ready = false;
    io.to(room.code).emit('roomState', publicState(room));
  });

  socket.on('setReady', ({ ready } = {}) => {
    const room = rooms.get(socket.data.roomCode);
    const player = room?.players.get(socket.id);
    if (!room || !player || room.inMatch) return;
    player.ready = !!ready;
    io.to(room.code).emit('roomState', publicState(room));
    maybeStart(room);
  });

  socket.on('roundResult', payload => {
    const room = rooms.get(socket.data.roomCode);
    if (!room || !room.inMatch || room.results.has(socket.id)) return;
    if (payload?.mode !== room.currentMode || payload?.seed !== room.currentSeed) return;

    const metric = metricFor(room.currentMode, payload);
    if (metric === null) return;

    room.results.set(socket.id, { metric, details: payload.details || {} });
    io.to(room.code).emit('roundProgress', { finished: room.results.size, total: 2 });
    finishRoundIfReady(room);
  });

  socket.on('leaveRoom', () => leaveRoom(socket));
  socket.on('disconnect', () => leaveRoom(socket));
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Duel Bench running on http://localhost:${PORT}`);
});
