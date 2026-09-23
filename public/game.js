const socket = io();

const el = id => document.getElementById(id);
const screens = ['home', 'lobby', 'game', 'results'];
const state = {
  id: null,
  code: null,
  ready: false,
  players: [],
  ownerId: null,
  preset: 'full',
  mascot: 'blob',
  mode: null,
  seed: null,
  round: 0,
  cleanup: null
};

const modeInfo = {
  reaction: { title: 'REACTION', icon: '⚡', text: 'Five reaction attempts. Your average time decides the round.' },
  sequence: { title: 'SEQUENCE MEMORY', icon: '▦', text: 'Watch the tiles light up, then repeat the sequence. It grows every level.' },
  aim: { title: 'AIM TRAINER', icon: '⊕', text: 'Hit 30 targets as quickly as possible. Miss-clicks add a small penalty.' },
  number: { title: 'NUMBER MEMORY', icon: '123', text: 'Memorize the number before it disappears. Each successful level adds another digit.' },
  verbal: { title: 'VERBAL MEMORY', icon: 'Aa', text: 'Decide whether each word is NEW or SEEN. Three mistakes and your run ends.' },
  chimp: { title: 'CHIMP TEST', icon: '♟', text: 'Click numbered tiles in order. After your first click, the numbers disappear.' },
  visual: { title: 'VISUAL MEMORY', icon: '◫', text: 'Memorize the highlighted squares, then click them after they disappear.' },
  typing: { title: 'TYPING', icon: '⌨', text: 'Type the same passage as your rival. Speed counts, but errors reduce your score.' },
  tracking: { title: 'TRACKING', icon: '◎', text: 'Keep your cursor inside the moving target for 8 seconds. Highest tracking percentage wins.' },
  switch: { title: 'WASD REFLEX', icon: 'W', text: 'Press the displayed W, A, S or D key. Wrong keys add a penalty.' },
  burst: { title: 'CLICK BURST', icon: '↯', text: 'Click as fast as you can for 5 seconds. Highest clicks per second wins.' }
};

const presetNames = { full: 'ULTIMATE 11', human: 'HUMAN 8', gamer: 'GAMER 5' };
const mascots = {
  blob:    { name: 'BLOB', color: '#73a7ff' },
  bean:    { name: 'BEAN', color: '#ff786f' },
  boxy:    { name: 'BOXY', color: '#b7ef4a' },
  puff:    { name: 'PUFF', color: '#c997ff' },
  starlet: { name: 'STAR', color: '#ffd452' },
  bot:     { name: 'BOT', color: '#62d8cc' }
};

function show(id) {
  screens.forEach(s => el(s).classList.toggle('hidden', s !== id));
}

function name() {
  return (el('nameInput').value.trim() || 'Player').slice(0, 18);
}

function seeded(seed) {
  let s = seed >>> 0;
  return () => {
    s += 0x6D2B79F5;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function setStage(html) {
  if (state.cleanup) {
    state.cleanup();
    state.cleanup = null;
  }
  el('gameStage').innerHTML = html;
}

function formatMetric(mode, metric) {
  if (mode === 'tracking') return `${metric.toFixed(1)}%`;
  if (mode === 'burst') return `${metric.toFixed(2)} CPS`;
  if (mode === 'typing') return `${metric.toFixed(1)} WPM`;
  if (mode === 'sequence') return `LEVEL ${Math.floor(metric)}`;
  if (mode === 'number') return `${Math.floor(metric)} DIGITS`;
  if (mode === 'verbal') return `${Math.floor(metric)} PTS`;
  if (mode === 'chimp') return `LEVEL ${Math.floor(metric)}`;
  if (mode === 'visual') return `LEVEL ${Math.floor(metric)}`;
  return `${Math.round(metric)} ms`;
}

function escapeHtml(value) {
  return String(value).replace(/[&<>'"]/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', "'":'&#39;', '"':'&quot;' }[c]));
}

function mascotMarkup(type = 'blob') {
  const safe = mascots[type] ? type : 'blob';
  const color = mascots[safe].color;
  return `<div class="mascot ${safe}" style="--m:${color}">
    <div class="mascot-shadow"></div>
    <div class="mascot-arm left"></div><div class="mascot-arm right"></div>
    <div class="mascot-leg left"></div><div class="mascot-leg right"></div>
    <div class="mascot-body"></div>
    <div class="mascot-eye left"></div><div class="mascot-eye right"></div>
    <div class="mascot-mouth"></div>
  </div>`;
}

function buildMascotPicker() {
  el('mascotPicker').innerHTML = Object.entries(mascots).map(([id, m]) => `
    <button class="mascot-option ${id === state.mascot ? 'active' : ''}" data-mascot="${id}" aria-label="Choose ${m.name}">
      ${mascotMarkup(id)}<span class="pick-name">${m.name}</span>
    </button>`).join('');
  el('selectedMascotName').textContent = mascots[state.mascot].name;
  el('mascotPicker').querySelectorAll('.mascot-option').forEach(btn => btn.onclick = () => {
    state.mascot = btn.dataset.mascot;
    el('mascotPicker').querySelectorAll('.mascot-option').forEach(b => b.classList.toggle('active', b === btn));
    el('selectedMascotName').textContent = mascots[state.mascot].name;
  });
}

function toast(text) {
  const t = document.createElement('div');
  t.className = 'toast';
  t.textContent = text;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 1400);
}

function renderCoinStack(targetId, coins = 0) {
  const stack = el(targetId);
  if (!stack) return;
  const count = Math.min(10, Math.floor(coins / 50));
  stack.innerHTML = Array.from({ length: count }, (_, i) => `<span class="stack-coin" style="--b:${6 + i * 9}px;--r:${i % 2 ? 3 : -3}deg"></span>`).join('');
}

function updateBattleUI(players = state.players) {
  if (!players.length || !state.id) return;
  const me = players.find(p => p.id === state.id) || players[0];
  const other = players.find(p => p.id !== me.id);
  if (!me) return;

  el('sideNameP1').textContent = me.name || 'YOU';
  el('sideNameP2').textContent = other?.name || 'RIVAL';
  el('starsP1').textContent = me.wins || 0;
  el('starsP2').textContent = other?.wins || 0;
  el('coinsP1').textContent = me.coins || 0;
  el('coinsP2').textContent = other?.coins || 0;
  el('streakP1').textContent = (me.streak || 0) >= 2 ? `🔥 ${me.streak} WIN STREAK` : '';
  el('streakP2').textContent = (other?.streak || 0) >= 2 ? `🔥 ${other.streak} WIN STREAK` : '';

  const meType = me.mascot || 'blob';
  const otherType = other?.mascot || 'bean';
  if (el('mascotP1').dataset.type !== meType) {
    el('mascotP1').dataset.type = meType;
    el('mascotP1').innerHTML = mascotMarkup(meType);
  }
  if (el('mascotP2').dataset.type !== otherType) {
    el('mascotP2').dataset.type = otherType;
    el('mascotP2').innerHTML = mascotMarkup(otherType);
  }
  renderCoinStack('coinStackP1', me.coins || 0);
  renderCoinStack('coinStackP2', other?.coins || 0);
}

function updateScore(players = state.players) {
  state.players = players;
  if (!players.length) return;
  const me = players.find(p => p.id === state.id) || players[0];
  const other = players.find(p => p.id !== me.id);
  el('scoreP1').innerHTML = `${escapeHtml(me?.name || 'YOU')} <b>★ ${me?.wins || 0}</b>`;
  el('scoreP2').innerHTML = `${escapeHtml(other?.name || 'RIVAL')} <b>★ ${other?.wins || 0}</b>`;
  updateBattleUI(players);
}

function say(side, text, duration = 1450) {
  const bubble = el(side === 'me' ? 'bubbleP1' : 'bubbleP2');
  if (!bubble) return;
  bubble.textContent = text;
  bubble.classList.remove('hidden');
  clearTimeout(bubble._timer);
  bubble._timer = setTimeout(() => bubble.classList.add('hidden'), duration);
}

function reactMascot(side, mood, phrase = '') {
  const holder = el(side === 'me' ? 'mascotP1' : 'mascotP2');
  const mascot = holder?.querySelector('.mascot');
  if (!mascot) return;
  mascot.classList.remove('react-win', 'react-hype', 'react-lose', 'react-panic', 'react-wait');
  void mascot.offsetWidth;
  mascot.classList.add(`react-${mood}`);
  if (phrase) say(side, phrase);
  if (!['wait'].includes(mood)) setTimeout(() => mascot.classList.remove(`react-${mood}`), 1750);
}

function rewardBurst(side, amount, winner = false) {
  const holder = el(side === 'me' ? 'playerSide' : 'rivalSide');
  if (!holder) return;
  const pieces = winner ? 10 : 4;
  for (let i = 0; i < pieces; i++) {
    const c = document.createElement('span');
    c.className = 'coin-particle';
    c.style.left = `${35 + Math.random() * 45}%`;
    c.style.top = `${35 + Math.random() * 15}%`;
    c.style.setProperty('--sx', `${(Math.random() - .5) * 35}px`);
    c.style.setProperty('--sy', `${-30 - Math.random() * 80}px`);
    c.style.setProperty('--ex', `${(Math.random() - .5) * 70}px`);
    c.style.setProperty('--ey', `${120 + Math.random() * 150}px`);
    c.style.animationDelay = `${i * 35}ms`;
    holder.appendChild(c);
    setTimeout(() => c.remove(), 1200);
  }
  if (winner) confetti(holder);
  if (amount > 0) say(side, `+${amount} COINS!`, 1650);
}

function confetti(holder) {
  const colors = ['#ffd452', '#b7ef4a', '#73a7ff', '#ff786f', '#c997ff'];
  for (let i = 0; i < 18; i++) {
    const p = document.createElement('span');
    p.className = 'confetti';
    p.style.left = `${10 + Math.random() * 80}%`;
    p.style.top = '0';
    p.style.setProperty('--c', colors[i % colors.length]);
    p.style.setProperty('--x', `${(Math.random() - .5) * 15}px`);
    p.style.setProperty('--drift', `${(Math.random() - .5) * 90}px`);
    p.style.animationDelay = `${Math.random() * 150}ms`;
    holder.appendChild(p);
    setTimeout(() => p.remove(), 1400);
  }
}

function strongPerformance(mode, metric) {
  const tests = {
    reaction: metric < 205,
    aim: metric < 330,
    tracking: metric > 86,
    switch: metric < 360,
    burst: metric > 8.5,
    typing: metric > 75,
    sequence: metric >= 7,
    number: metric >= 8,
    verbal: metric >= 24,
    chimp: metric >= 8,
    visual: metric >= 8
  };
  return !!tests[mode];
}

function reactionDetails(result) {
  const attempts = result?.details?.attempts;
  if (!Array.isArray(attempts)) return '';
  return `<div class="reaction-breakdown">${attempts.map(v => `<span>${Math.round(v)}ms</span>`).join('')}</div>`;
}

function renderLobby(room) {
  state.code = room.code;
  state.players = room.players;
  state.ownerId = room.ownerId;
  state.preset = room.preset;
  el('copyCode').textContent = room.code;
  el('players').innerHTML = room.players.map(p => `
    <div class="player">
      <div class="lobby-avatar">${mascotMarkup(p.mascot)}</div>
      <div>
        <div class="name">${escapeHtml(p.name)} ${p.id === state.id ? '<span class="you-tag">YOU</span>' : ''} ${p.id === room.ownerId ? '<span class="host-tag">HOST</span>' : ''}</div>
        <div class="status ${p.ready ? 'ready' : ''}">${p.ready ? 'READY TO THROW HANDS' : 'NOT READY'}</div>
      </div>
    </div>`).join('') + (room.players.length < 2 ? `
      <div class="player"><div class="lobby-avatar"></div><div><div class="name waiting-name">Waiting for rival…</div><div class="status">Share room code ${room.code}</div></div></div>` : '');

  const me = room.players.find(p => p.id === state.id);
  state.ready = !!me?.ready;
  el('readyBtn').textContent = state.ready ? 'I CHANGED MY MIND' : 'READY UP';
  el('presetLabel').textContent = `${presetNames[room.preset]} · ${room.totalRounds} ROUNDS`;

  const isHost = room.ownerId === state.id;
  document.querySelectorAll('.preset-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.preset === room.preset);
    btn.disabled = !isHost;
  });
  el('presetHint').textContent = isHost ? 'Choose the match format. Changing it unreadies both players.' : 'Only the room host can change the match format.';
  show('lobby');
}

buildMascotPicker();

el('createBtn').onclick = () => {
  el('homeError').textContent = '';
  socket.emit('createRoom', { name: name(), preset: 'full', mascot: state.mascot }, res => {
    if (!res.ok) return el('homeError').textContent = res.error || 'Could not create room.';
    state.id = res.id;
    state.code = res.code;
  });
};

el('joinBtn').onclick = () => {
  el('homeError').textContent = '';
  socket.emit('joinRoom', { code: el('codeInput').value, name: name(), mascot: state.mascot }, res => {
    if (!res.ok) return el('homeError').textContent = res.error || 'Could not join room.';
    state.id = res.id;
    state.code = res.code;
  });
};

el('codeInput').addEventListener('input', e => e.target.value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 5));
el('readyBtn').onclick = () => socket.emit('setReady', { ready: !state.ready });
el('leaveBtn').onclick = () => { socket.emit('leaveRoom'); location.reload(); };
el('copyCode').onclick = async () => {
  await navigator.clipboard?.writeText(state.code);
  toast('Room code copied');
};
el('rematchBtn').onclick = () => { show('lobby'); socket.emit('setReady', { ready: true }); };
document.querySelectorAll('.preset-btn').forEach(btn => btn.onclick = () => socket.emit('setPreset', { preset: btn.dataset.preset }));

socket.on('roomState', renderLobby);

socket.on('matchStart', data => {
  show('game');
  updateScore(state.players.map(p => ({ ...p, wins: 0, coins: 0, streak: 0 })));
  el('roundLabel').textContent = `ROUND 1/${data.totalRounds}`;
  reactMascot('me', 'hype', 'LET\'S GO!');
  reactMascot('rival', 'hype', 'BRING IT!');
});

socket.on('roundIntro', data => {
  state.mode = data.mode;
  state.seed = data.seed;
  state.round = data.round;
  el('roundLabel').textContent = `ROUND ${data.round}/${data.totalRounds}`;
  const m = modeInfo[data.mode];
  reactMascot('me', 'wait');
  reactMascot('rival', 'wait');
  setStage(`
    <div class="intro">
      <div class="mode-icon">${m.icon}</div>
      <p class="eyebrow">ROUND ${data.round}</p>
      <h3>${m.title}</h3>
      <p>${m.text}</p>
    </div>`);
});

socket.on('roundStart', data => {
  el('bubbleP1').classList.add('hidden');
  el('bubbleP2').classList.add('hidden');
  const players = {
    reaction: playReaction,
    sequence: playSequence,
    aim: playAim,
    number: playNumber,
    verbal: playVerbal,
    chimp: playChimp,
    visual: playVisual,
    typing: playTyping,
    tracking: playTracking,
    switch: playSwitch,
    burst: playBurst
  };
  players[data.mode]?.(data.seed);
});

socket.on('roundProgress', data => {
  if (data.finished === 1) {
    const waiting = el('gameStage').querySelector('.waiting-copy');
    if (waiting) waiting.textContent = 'Locked in. Your rival is sweating…';
  }
});

socket.on('roundEnd', data => {
  updateScore(data.players);
  const mine = data.results.find(r => r.id === state.id);
  const other = data.results.find(r => r.id !== state.id);
  const iWon = data.winnerId === state.id;
  const otherWon = !!data.winnerId && !iWon;
  const myReward = data.coinDelta?.[state.id] || 0;
  const otherReward = other ? (data.coinDelta?.[other.id] || 0) : 0;
  const title = data.tie ? 'DRAW!' : iWon ? 'ROUND WON!' : 'ROUND LOST';

  if (data.tie) {
    reactMascot('me', 'panic', 'SO CLOSE!');
    reactMascot('rival', 'panic', 'NO WAY!');
  } else if (iWon) {
    reactMascot('me', strongPerformance(data.mode, mine.metric) ? 'hype' : 'win', strongPerformance(data.mode, mine.metric) ? 'CLEAN!' : 'YES!');
    reactMascot('rival', 'lose', 'OOF...');
  } else {
    reactMascot('me', mine?.details?.falseStart || mine?.details?.falseStarts ? 'panic' : 'lose', 'NOOO!');
    reactMascot('rival', strongPerformance(data.mode, other.metric) ? 'hype' : 'win', strongPerformance(data.mode, other.metric) ? 'SHEESH!' : 'NICE!');
  }
  rewardBurst('me', myReward, iWon);
  rewardBurst('rival', otherReward, otherWon);

  setStage(`
    <div class="result-card">
      <p class="eyebrow">${modeInfo[data.mode].title}</p>
      <h3 class="${iWon ? 'won' : (!data.tie ? 'lost' : '')}">${title}</h3>
      <div class="reward-line"><span class="coin-icon"></span> ${myReward} COINS THIS ROUND</div>
      <div class="duel-results">
        <div class="duel-stat ${iWon ? 'win' : ''}"><div>YOU</div><div class="metric">${formatMetric(data.mode, mine.metric)}</div>${data.mode === 'reaction' ? reactionDetails(mine) : ''}</div>
        <div class="duel-stat ${otherWon ? 'win' : ''}"><div>RIVAL</div><div class="metric">${formatMetric(data.mode, other.metric)}</div>${data.mode === 'reaction' ? reactionDetails(other) : ''}</div>
      </div>
    </div>`);
});

socket.on('matchEnd', data => {
  state.players = data.players;
  show('results');
  const winner = data.players.find(p => p.id === data.winnerId);
  el('winnerText').textContent = data.winnerId ? (data.winnerId === state.id ? 'YOU WIN!' : `${winner.name} WINS!`) : 'DRAW!';
  el('finalMascots').innerHTML = data.players.map(p => `<div class="final-fighter ${p.id === data.winnerId ? 'winner' : ''}">${mascotMarkup(p.mascot)}<div class="final-name">${escapeHtml(p.name)}</div></div>`).join('');
  el('finalScore').innerHTML = data.players.map(p => `<div class="final-pill">${escapeHtml(p.name)}<strong>★ ${p.wins}</strong><small>${p.coins || 0} coins collected</small></div>`).join('');
});

socket.on('opponentLeft', () => {
  toast('Opponent left the room');
  show('lobby');
});

function submit(metric, details = {}) {
  socket.emit('roundResult', { mode: state.mode, seed: state.seed, metric, details });
  reactMascot('me', 'wait');
  setStage(`<div class="center-copy"><div><div class="big-number good metric-lock">${formatMetric(state.mode, metric)}</div><div class="small-copy waiting-copy">Score locked in…</div></div></div>`);
}

// -----------------------------
// Core benchmark tests
// -----------------------------

function playReaction(seed) {
  const rand = seeded(seed);
  const totalAttempts = 5;
  const delays = Array.from({ length: totalAttempts }, () => 1500 + Math.floor(rand() * 1600));
  const attempts = [];
  let index = 0;
  let timer = null;
  let nextTimer = null;
  let field = null;
  let greenAt = 0;
  let attemptDone = false;

  const chips = () => Array.from({ length: totalAttempts }, (_, i) => {
    if (i < attempts.length) {
      const falseStart = attempts[i] >= 999;
      return `<span class="reaction-chip done ${falseStart ? 'false' : ''}">${falseStart ? 'EARLY' : Math.round(attempts[i]) + 'ms'}</span>`;
    }
    return `<span class="reaction-chip">${i === index ? 'NOW' : '—'}</span>`;
  }).join('');

  const startAttempt = () => {
    greenAt = 0;
    attemptDone = false;
    setStage(`<div class="playfield reaction-field" id="reactionField">
      <div class="reaction-counter">ATTEMPT ${index + 1} / ${totalAttempts}</div>
      <div class="center-copy"><div><div class="big-number">WAIT</div><div class="small-copy">Click when it turns green.</div></div></div>
      <div class="reaction-attempts">${chips()}</div>
    </div>`);
    field = el('reactionField');

    const onClick = () => {
      if (attemptDone) return;
      attemptDone = true;
      clearTimeout(timer);
      field.removeEventListener('pointerdown', onClick);
      const falseStart = !greenAt;
      const value = falseStart ? 1000 : performance.now() - greenAt;
      attempts.push(value);
      field.classList.remove('go');
      const big = field.querySelector('.big-number');
      big.textContent = falseStart ? 'TOO SOON' : `${Math.round(value)} ms`;
      big.className = `big-number ${falseStart ? 'bad' : 'good'}`;
      field.querySelector('.small-copy').textContent = falseStart ? '+1000ms penalty for this attempt' : 'Nice. Get ready again…';
      field.querySelector('.reaction-attempts').innerHTML = chips();

      nextTimer = setTimeout(() => {
        if (index + 1 >= totalAttempts) {
          const average = attempts.reduce((a, b) => a + b, 0) / attempts.length;
          submit(average, { attempts, falseStarts: attempts.filter(v => v >= 999).length });
        } else {
          index++;
          startAttempt();
        }
      }, falseStart ? 900 : 650);
    };

    field.addEventListener('pointerdown', onClick);
    timer = setTimeout(() => {
      if (attemptDone) return;
      greenAt = performance.now();
      field.classList.add('go');
      const big = field.querySelector('.big-number');
      big.textContent = 'CLICK!';
      big.classList.add('good');
    }, delays[index]);

    state.cleanup = () => {
      clearTimeout(timer);
      clearTimeout(nextTimer);
      field?.removeEventListener('pointerdown', onClick);
    };
  };

  startAttempt();
}

function playSequence(seed) {
  const rand = seeded(seed);
  const sequence = [];
  let level = 1;
  let inputIndex = 0;
  let accepting = false;
  let done = false;
  const maxLevel = 12;
  const timers = new Set();

  setStage(`<div class="memory-wrap"><div class="hud memory-hud"><span id="seqLevel">LEVEL 1</span><span>WATCH, THEN REPEAT</span></div><div class="sequence-grid" id="sequenceGrid">${Array.from({length: 9}, (_, i) => `<button class="sequence-tile" data-i="${i}" aria-label="tile ${i + 1}"></button>`).join('')}</div></div>`);
  const grid = el('sequenceGrid');
  const tiles = [...grid.querySelectorAll('.sequence-tile')];

  const later = (fn, ms) => {
    const t = setTimeout(() => { timers.delete(t); fn(); }, ms);
    timers.add(t);
  };

  const flash = index => {
    tiles[index].classList.add('lit');
    later(() => tiles[index].classList.remove('lit'), 260);
  };

  const startLevel = () => {
    if (done) return;
    el('seqLevel').textContent = `LEVEL ${level}`;
    if (sequence.length < level) sequence.push(Math.floor(rand() * 9));
    accepting = false;
    inputIndex = 0;
    tiles.forEach(t => t.classList.remove('wrong', 'correct'));
    sequence.forEach((tileIndex, i) => later(() => flash(tileIndex), 500 + i * 430));
    later(() => { accepting = true; }, 500 + sequence.length * 430);
  };

  const click = e => {
    const btn = e.target.closest('.sequence-tile');
    if (!btn || !accepting || done) return;
    const index = Number(btn.dataset.i);
    btn.classList.add('pressed');
    later(() => btn.classList.remove('pressed'), 110);
    if (index !== sequence[inputIndex]) {
      accepting = false;
      done = true;
      btn.classList.add('wrong');
      later(() => submit(level - 1, { failedAt: level }), 350);
      return;
    }
    inputIndex++;
    if (inputIndex === sequence.length) {
      accepting = false;
      tiles.forEach(t => t.classList.add('correct'));
      if (level >= maxLevel) {
        done = true;
        later(() => submit(level, { perfect: true }), 350);
      } else {
        level++;
        later(startLevel, 650);
      }
    }
  };

  grid.addEventListener('pointerdown', click);
  later(startLevel, 300);
  state.cleanup = () => { timers.forEach(clearTimeout); grid.removeEventListener('pointerdown', click); };
}

function playAim(seed) {
  const rand = seeded(seed);
  const targetCount = 30;
  const points = Array.from({ length: targetCount }, () => ({ x: 7 + rand() * 86, y: 13 + rand() * 78 }));
  let i = 0, misses = 0, last = performance.now(), total = 0, done = false;
  setStage(`<div class="playfield" id="aimField"><div class="hud"><span id="aimProgress">TARGET 1/${targetCount}</span><span id="aimMiss">MISSES 0</span></div><button class="target" id="aimTarget" aria-label="target"></button></div>`);
  const field = el('aimField');
  const target = el('aimTarget');
  const place = () => {
    target.style.left = `${points[i].x}%`;
    target.style.top = `${points[i].y}%`;
    el('aimProgress').textContent = `TARGET ${i + 1}/${targetCount}`;
  };
  place();

  const miss = e => { if (!done && e.target !== target) { misses++; el('aimMiss').textContent = `MISSES ${misses}`; } };
  const hit = e => {
    e.stopPropagation();
    if (done) return;
    const now = performance.now();
    total += now - last;
    last = now;
    i++;
    if (i >= points.length) {
      done = true;
      const rawAverage = total / points.length;
      submit(rawAverage + misses * 60, { misses, rawAverage });
    } else place();
  };
  field.addEventListener('pointerdown', miss);
  target.addEventListener('pointerdown', hit);
  state.cleanup = () => { field.removeEventListener('pointerdown', miss); target.removeEventListener('pointerdown', hit); };
}

function playNumber(seed) {
  const rand = seeded(seed);
  const minDigits = 3;
  const maxDigits = 14;
  let digits = minDigits;
  let number = '';
  let done = false;
  let timer;

  const makeNumber = length => {
    let s = String(1 + Math.floor(rand() * 9));
    while (s.length < length) s += Math.floor(rand() * 10);
    return s;
  };

  const showNumber = () => {
    if (done) return;
    number = makeNumber(digits);
    setStage(`<div class="number-test"><div class="hud"><span>LEVEL ${digits}</span><span>${digits} DIGITS</span></div><div class="number-display">${number}</div><div class="small-copy">Memorize it…</div></div>`);
    const displayMs = Math.min(3200, 900 + digits * 120);
    timer = setTimeout(ask, displayMs);
    state.cleanup = () => clearTimeout(timer);
  };

  const ask = () => {
    setStage(`<div class="number-test"><div class="number-question">What was the number?</div><form id="numberForm" class="number-form"><input id="numberInput" inputmode="numeric" autocomplete="off" maxlength="30" placeholder="Type it here" /><button class="primary" type="submit">SUBMIT</button></form><div class="small-copy">${digits} digits</div></div>`);
    const input = el('numberInput');
    input.focus();
    input.oninput = () => input.value = input.value.replace(/\D/g, '');
    el('numberForm').onsubmit = e => {
      e.preventDefault();
      if (done) return;
      if (input.value === number) {
        if (digits >= maxDigits) {
          done = true;
          submit(digits, { perfect: true });
        } else {
          digits++;
          showNumber();
        }
      } else {
        done = true;
        submit(digits - 1, { failedAt: digits });
      }
    };
    state.cleanup = () => {};
  };

  showNumber();
}

function playVerbal(seed) {
  const rand = seeded(seed);
  const words = [
    'anchor','planet','velvet','signal','copper','rocket','forest','window','magnet','pixel','shadow','river','comet','puzzle','marble','canyon','button','helmet','thunder','paper','socket','dragon','winter','laser','coffee','mirror','orange','engine','castle','silver','tunnel','camera','beacon','island','piano','crystal','circle','garden','falcon','pocket','ladder','meteor','bottle','bridge','screen','purple','candle','vector','rabbit','jungle','cloud','hammer','ocean','memory','garage','banana','compass','flame','station','diamond','carpet','switch','temple','guitar','feather','matrix','basket','signal','sprinter','orbit','voyage','glacier','lantern','kernel','summit','radar','arcade','fabric','quartz','meadow'
  ];
  const shown = [];
  const seenSet = new Set();
  let score = 0;
  let lives = 3;
  let trial = 0;
  const maxTrials = 40;
  let current = '';
  let currentIsSeen = false;
  let done = false;

  const nextWord = () => {
    if (done) return;
    if (lives <= 0 || trial >= maxTrials) {
      done = true;
      submit(score, { lives, trials: trial });
      return;
    }

    currentIsSeen = shown.length >= 4 && rand() < 0.45;
    if (currentIsSeen) {
      current = shown[Math.floor(rand() * shown.length)];
    } else {
      const available = words.filter(w => !seenSet.has(w));
      current = available[Math.floor(rand() * available.length)] || words[Math.floor(rand() * words.length)];
    }

    setStage(`<div class="verbal-test"><div class="hud"><span>SCORE ${score}</span><span id="verbalLives">LIVES ${'●'.repeat(lives)}${'○'.repeat(3-lives)}</span></div><div class="verbal-word">${escapeHtml(current)}</div><div class="verbal-actions"><button id="seenBtn" class="memory-action">SEEN</button><button id="newBtn" class="memory-action primary">NEW</button></div><div class="small-copy">Have you seen this word during this round?</div></div>`);

    const answer = saysSeen => {
      if (done) return;
      const correct = saysSeen === currentIsSeen;
      if (correct) score++;
      else lives--;
      if (!seenSet.has(current)) {
        shown.push(current);
        seenSet.add(current);
      }
      trial++;
      nextWord();
    };
    el('seenBtn').onclick = () => answer(true);
    el('newBtn').onclick = () => answer(false);
    state.cleanup = () => {};
  };

  nextWord();
}

function playChimp(seed) {
  const rand = seeded(seed);
  let count = 4;
  let lives = 3;
  let best = 0;
  let expected = 1;
  let hidden = false;
  let done = false;
  let transitionTimer;
  const maxCount = 12;

  const startAttempt = () => {
    if (done) return;
    if (lives <= 0) {
      done = true;
      submit(best, { lives: 0, failedAt: count });
      return;
    }

    expected = 1;
    hidden = false;
    const cells = Array.from({ length: 36 }, (_, i) => i);
    for (let i = cells.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [cells[i], cells[j]] = [cells[j], cells[i]];
    }
    const chosen = cells.slice(0, count);
    const valueByCell = new Map(chosen.map((cell, i) => [cell, i + 1]));

    setStage(`<div class="chimp-wrap"><div class="hud"><span>LEVEL ${count}</span><span>LIVES ${'●'.repeat(lives)}${'○'.repeat(3-lives)}</span></div><div class="chimp-grid" id="chimpGrid">${Array.from({length:36}, (_, cell) => {
      const v = valueByCell.get(cell);
      return v ? `<button class="chimp-tile" data-value="${v}">${v}</button>` : '<div class="chimp-empty"></div>';
    }).join('')}</div><div class="small-copy">Click 1 → ${count} in order.</div></div>`);

    const grid = el('chimpGrid');
    let locked = false;
    const onClick = e => {
      const btn = e.target.closest('.chimp-tile');
      if (!btn || done || locked) return;
      const value = Number(btn.dataset.value);
      if (!hidden && value === 1) {
        hidden = true;
        grid.querySelectorAll('.chimp-tile').forEach(t => { if (Number(t.dataset.value) !== 1) t.textContent = ''; });
      }
      if (value !== expected) {
        locked = true;
        lives--;
        grid.classList.add('shake');
        transitionTimer = setTimeout(startAttempt, 450);
        return;
      }
      btn.classList.add('cleared');
      btn.disabled = true;
      expected++;
      if (expected > count) {
        locked = true;
        best = count;
        if (count >= maxCount) {
          done = true;
          transitionTimer = setTimeout(() => submit(best, { perfect: true, lives }), 350);
        } else {
          count++;
          transitionTimer = setTimeout(startAttempt, 450);
        }
      }
    };
    grid.addEventListener('pointerdown', onClick);
    state.cleanup = () => { clearTimeout(transitionTimer); grid.removeEventListener('pointerdown', onClick); };
  };

  startAttempt();
}

function playVisual(seed) {
  const rand = seeded(seed);
  let level = 3;
  let lives = 3;
  let best = 0;
  let selected = new Set();
  let accepting = false;
  let done = false;
  let revealTimer;
  let transitionTimer;
  const maxLevel = 13;

  const startAttempt = () => {
    if (done) return;
    if (lives <= 0) {
      done = true;
      submit(best, { lives: 0, failedAt: level });
      return;
    }
    const size = Math.min(7, 3 + Math.floor((level - 3) / 2));
    const total = size * size;
    const litCount = Math.min(level, total - 1);
    const cells = Array.from({ length: total }, (_, i) => i);
    for (let i = cells.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [cells[i], cells[j]] = [cells[j], cells[i]];
    }
    selected = new Set(cells.slice(0, litCount));
    accepting = false;

    setStage(`<div class="visual-wrap"><div class="hud"><span>LEVEL ${level}</span><span>LIVES ${'●'.repeat(lives)}${'○'.repeat(3-lives)}</span></div><div class="visual-grid" id="visualGrid" style="--grid-size:${size}">${Array.from({length:total}, (_, i) => `<button class="visual-tile ${selected.has(i) ? 'lit' : ''}" data-i="${i}"></button>`).join('')}</div><div class="small-copy">Memorize the bright squares.</div></div>`);

    const grid = el('visualGrid');
    revealTimer = setTimeout(() => {
      grid.querySelectorAll('.visual-tile').forEach(t => t.classList.remove('lit'));
      accepting = true;
    }, 1150);

    const clicked = new Set();
    const onClick = e => {
      const btn = e.target.closest('.visual-tile');
      if (!btn || !accepting || done) return;
      const i = Number(btn.dataset.i);
      if (clicked.has(i)) return;
      clicked.add(i);
      if (!selected.has(i)) {
        accepting = false;
        lives--;
        btn.classList.add('wrong');
        selected.forEach(idx => grid.querySelector(`[data-i="${idx}"]`)?.classList.add('missed'));
        transitionTimer = setTimeout(startAttempt, 600);
        return;
      }
      btn.classList.add('correct');
      if ([...clicked].filter(idx => selected.has(idx)).length === selected.size) {
        accepting = false;
        best = level;
        if (level >= maxLevel) {
          done = true;
          transitionTimer = setTimeout(() => submit(best, { perfect: true, lives }), 350);
        } else {
          level++;
          transitionTimer = setTimeout(startAttempt, 500);
        }
      }
    };
    grid.addEventListener('pointerdown', onClick);
    state.cleanup = () => { clearTimeout(revealTimer); clearTimeout(transitionTimer); grid.removeEventListener('pointerdown', onClick); };
  };

  startAttempt();
}

function playTyping(seed) {
  const rand = seeded(seed);
  const passages = [
    'Fast decisions become useful only when they stay accurate under pressure. Good players keep their hands relaxed, read the next problem early, and commit without wasting motion.',
    'A clean mechanical play often looks simple from the outside. The difficult part is noticing the right cue, choosing the right response, and executing it before the moment disappears.',
    'Games reward more than raw speed. Positioning, timing, memory, attention, and control all matter when two equally determined players are trying to gain the smallest possible advantage.',
    'The best practice feels focused rather than frantic. Repeat the important movement, remove unnecessary effort, notice each mistake, and make the next attempt slightly more precise.'
  ];
  const text = passages[Math.floor(rand() * passages.length)];
  const duration = 25000;
  let started = false;
  let finished = false;
  let start = 0;
  let raf;

  setStage(`<div class="typing-test"><div class="hud"><span id="typingStats">0.0 WPM · 100% ACC</span><span id="typingTime">25.0s</span></div><div class="typing-passage" id="typingPassage">${escapeHtml(text)}</div><textarea id="typingInput" class="typing-input" rows="5" spellcheck="false" autocomplete="off" autocapitalize="off" placeholder="Start typing here…"></textarea></div>`);
  const input = el('typingInput');
  input.focus();

  const stats = () => {
    const typed = input.value;
    let correct = 0;
    for (let i = 0; i < typed.length && i < text.length; i++) if (typed[i] === text[i]) correct++;
    const elapsedMs = started ? Math.max(1, performance.now() - start) : 1;
    const minutes = elapsedMs / 60000;
    const wpm = (correct / 5) / minutes;
    const accuracy = typed.length ? correct / typed.length * 100 : 100;
    el('typingStats').textContent = `${Math.max(0, wpm).toFixed(1)} WPM · ${accuracy.toFixed(0)}% ACC`;
    return { correct, accuracy, wpm };
  };

  const finish = () => {
    if (finished) return;
    finished = true;
    cancelAnimationFrame(raf);
    const { correct, accuracy } = stats();
    const elapsed = Math.min(duration, Math.max(1000, performance.now() - start));
    const minutes = elapsed / 60000;
    const grossCorrectWpm = (correct / 5) / minutes;
    const netWpm = grossCorrectWpm * (accuracy / 100);
    submit(Math.max(0, netWpm), { accuracy, correctChars: correct, elapsed });
  };

  const tick = now => {
    if (!started || finished) return;
    const elapsed = now - start;
    el('typingTime').textContent = `${Math.max(0, (duration - elapsed) / 1000).toFixed(1)}s`;
    stats();
    if (elapsed >= duration) return finish();
    raf = requestAnimationFrame(tick);
  };

  input.addEventListener('paste', e => e.preventDefault());
  input.addEventListener('input', () => {
    if (!started) {
      started = true;
      start = performance.now();
      raf = requestAnimationFrame(tick);
    }
    if (input.value.length >= text.length) finish();
    else stats();
  });
  state.cleanup = () => cancelAnimationFrame(raf);
}

// -----------------------------
// Gamer-specific tests
// -----------------------------

function playTracking(seed) {
  const rand = seeded(seed);
  const phase = rand() * Math.PI * 2;
  const duration = 8000;
  let pointer = { x: -9999, y: -9999 };
  let tracked = 0;
  let last = performance.now();
  const start = last;
  let raf;

  setStage(`<div class="playfield" id="trackField"><div class="hud"><span>KEEP CURSOR ON TARGET</span><span id="trackPct">0.0%</span></div><div class="track-target" id="trackTarget"></div></div>`);
  const field = el('trackField');
  const target = el('trackTarget');
  const move = e => { pointer = { x: e.clientX, y: e.clientY }; };
  field.addEventListener('pointermove', move);

  const tick = now => {
    const t = now - start;
    const rect = field.getBoundingClientRect();
    const px = 50 + 34 * Math.sin(t / 690 + phase) * Math.cos(t / 2100 + phase * .4);
    const py = 50 + 31 * Math.sin(t / 940 + phase * 1.7);
    const x = rect.left + rect.width * px / 100;
    const y = rect.top + rect.height * py / 100;
    target.style.left = `${px}%`;
    target.style.top = `${py}%`;

    const inside = Math.hypot(pointer.x - x, pointer.y - y) <= 35;
    target.classList.toggle('hot', inside);
    if (inside) tracked += Math.max(0, now - last);
    last = now;
    el('trackPct').textContent = `${Math.min(100, tracked / Math.max(1, t) * 100).toFixed(1)}%`;

    if (t >= duration) return submit(Math.min(100, tracked / duration * 100));
    raf = requestAnimationFrame(tick);
  };
  raf = requestAnimationFrame(tick);
  state.cleanup = () => { cancelAnimationFrame(raf); field.removeEventListener('pointermove', move); };
}

function playSwitch(seed) {
  const rand = seeded(seed);
  const keys = ['W', 'A', 'S', 'D'];
  const sequence = Array.from({ length: 16 }, () => keys[Math.floor(rand() * keys.length)]);
  let i = 0, errors = 0, total = 0, shownAt = performance.now(), done = false;
  setStage(`<div class="playfield"><div class="hud"><span id="keyProgress">KEY 1/16</span><span id="keyErrors">ERRORS 0</span></div><div class="center-copy"><div><div class="key-prompt" id="keyPrompt">${sequence[0]}</div><div class="small-copy">Use your keyboard</div></div></div></div>`);
  const handler = e => {
    if (done || e.repeat) return;
    const k = e.key.toUpperCase();
    if (!keys.includes(k)) return;
    e.preventDefault();
    if (k !== sequence[i]) {
      errors++;
      el('keyErrors').textContent = `ERRORS ${errors}`;
      return;
    }
    const now = performance.now();
    total += now - shownAt;
    i++;
    if (i >= sequence.length) {
      done = true;
      window.removeEventListener('keydown', handler);
      submit(total / sequence.length + errors * 100, { errors, rawAverage: total / sequence.length });
      return;
    }
    el('keyProgress').textContent = `KEY ${i + 1}/16`;
    el('keyPrompt').textContent = sequence[i];
    shownAt = performance.now();
  };
  window.addEventListener('keydown', handler);
  state.cleanup = () => window.removeEventListener('keydown', handler);
}

function playBurst() {
  const duration = 5000;
  let clicks = 0, started = false, start = 0, timer;
  setStage(`<div class="playfield"><div class="hud"><span>5 SECOND BURST</span><span id="burstTime">5.00s</span></div><div class="center-copy"><div class="click-zone" id="clickZone"><div><div class="click-count" id="clickCount">0</div><div class="small-copy">CLICK TO START</div></div></div></div></div>`);
  const zone = el('clickZone');
  const count = el('clickCount');
  const click = () => {
    if (!started) {
      started = true;
      start = performance.now();
      timer = requestAnimationFrame(tick);
    }
    clicks++;
    count.textContent = clicks;
  };
  const tick = now => {
    const elapsed = now - start;
    el('burstTime').textContent = `${Math.max(0, (duration - elapsed) / 1000).toFixed(2)}s`;
    if (elapsed >= duration) return submit(clicks / (duration / 1000), { clicks });
    timer = requestAnimationFrame(tick);
  };
  zone.addEventListener('pointerdown', click);
  state.cleanup = () => { cancelAnimationFrame(timer); zone.removeEventListener('pointerdown', click); };
}
