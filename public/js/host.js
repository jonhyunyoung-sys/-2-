// Host Dashboard Script
const socket = io();

let currentRoomCode = null;
let currentConfig = {
  gameType: 'dont-look-down', // Default to Don't Look Down!
  mode: 'race',
  timeLimitSeconds: 600,
  targetBalance: 10000,
  quizSetId: 'joseon-early',
  dldSettings: {
    difficulty: 'normal',
    energyGain: 1000,
    jumpCost: 15,
    gemRate: 0.45,
    updraftRate: 0.10,
    startingEnergy: 1500
  }
};
let playersList = [];
let botCount = 0;

let serverInfo = {
  ip: 'localhost',
  port: 3000,
  localUrl: window.location.origin,
  networkUrl: window.location.origin
};
let currentUrlMode = 'network'; // 'network' (mobile Wi-Fi) or 'local' (localhost)

// Initialize on page load
window.addEventListener('DOMContentLoaded', async () => {
  // Fetch server info (LAN IP address)
  try {
    const res = await fetch('/api/server-info');
    if (res.ok) {
      serverInfo = await res.json();
    }
  } catch (err) {
    console.warn('Could not fetch server-info, using window.location.origin', err);
  }

  // Check if URL has a desired room code, e.g. ?code=311866
  const urlParams = new URLSearchParams(window.location.search);
  const requestedCode = urlParams.get('code') || '311866'; // Default to the code the user provided!

  // Check if query specified classic mode
  if (urlParams.get('type') === 'classic') {
    currentConfig.gameType = 'classic';
  }

  // Create room
  socket.emit('create-room', {
    customCode: requestedCode,
    config: currentConfig
  }, (res) => {
    if (res.success) {
      currentRoomCode = res.code;
      setupRoomUI(res.code);
    } else {
      // Fallback to random if custom code taken
      socket.emit('create-room', { config: currentConfig }, (fallbackRes) => {
        currentRoomCode = fallbackRes.code;
        setupRoomUI(fallbackRes.code);
      });
    }
  });

  // Attach event listeners for config
  const timeSelect = document.getElementById('timeLimitSelect');
  if (timeSelect) {
    timeSelect.addEventListener('change', (e) => {
      currentConfig.timeLimitSeconds = parseInt(e.target.value, 10);
      syncConfig();
    });
  }

  const raceSelect = document.getElementById('raceTargetSelect');
  if (raceSelect) {
    raceSelect.addEventListener('change', (e) => {
      currentConfig.targetBalance = parseInt(e.target.value, 10);
      syncConfig();
    });
  }

  const quizSelect = document.getElementById('quizSetSelect');
  if (quizSelect) {
    quizSelect.addEventListener('change', (e) => {
      currentConfig.quizSetId = e.target.value;
      syncConfig();
    });
  }

  // Populate any custom uploaded quiz sets
  if (typeof refreshQuizSetsDropdown === 'function') {
    refreshQuizSetsDropdown();
  }
});

function setGameType(type) {
  currentConfig.gameType = type;
  const dldBtn = document.getElementById('typeDldBtn');
  const classicBtn = document.getElementById('typeClassicBtn');
  const classicWrap = document.getElementById('classicOptionsWrap');

  if (type === 'dont-look-down') {
    if (dldBtn) {
      dldBtn.className = 'btn btn-primary';
      dldBtn.style.background = 'linear-gradient(135deg, #0284c7, #0369a1)';
      dldBtn.style.border = '2px solid #38bdf8';
    }
    if (classicBtn) {
      classicBtn.className = 'btn btn-outline';
      classicBtn.style.background = 'transparent';
      classicBtn.style.border = '1px solid var(--border)';
    }
    if (classicWrap) classicWrap.style.display = 'none';
    const dldWrap = document.getElementById('dldOptionsWrap');
    if (dldWrap) dldWrap.style.display = 'block';
  } else {
    if (classicBtn) {
      classicBtn.className = 'btn btn-primary';
      classicBtn.style.background = 'linear-gradient(135deg, #6366f1, #4f46e5)';
      classicBtn.style.border = '2px solid #a5b4fc';
    }
    if (dldBtn) {
      dldBtn.className = 'btn btn-outline';
      dldBtn.style.background = 'transparent';
      dldBtn.style.border = '1px solid var(--border)';
    }
    if (classicWrap) classicWrap.style.display = 'block';
    const dldWrap = document.getElementById('dldOptionsWrap');
    if (dldWrap) dldWrap.style.display = 'none';
  }
  syncConfig();
  updateJoinUrlAndQr();
}

function getActiveJoinUrl() {
  const host = window.location.hostname;
  const isPrivate = host === 'localhost' || host === '127.0.0.1' || host.startsWith('192.168.') || host.startsWith('10.') || host.startsWith('172.');
  const base = (!isPrivate) ? window.location.origin : ((currentUrlMode === 'network' && serverInfo.networkUrl) ? serverInfo.networkUrl : (serverInfo.localUrl || window.location.origin));
  if (currentConfig.gameType === 'dont-look-down') {
    return `${base}/dld?gc=${currentRoomCode}`;
  }
  return `${base}/join?gc=${currentRoomCode}`;
}

function setupRoomUI(code) {
  document.getElementById('roomCodeDisplay').innerText = code;
  const modalCode = document.getElementById('modalGameCode');
  if (modalCode) modalCode.innerText = code;
  updateJoinUrlAndQr();
}

async function updateJoinUrlAndQr() {
  const joinUrl = getActiveJoinUrl();
  document.getElementById('joinUrlDisplay').innerText = joinUrl;
  const modalUrl = document.getElementById('modalJoinUrl');
  if (modalUrl) modalUrl.innerText = joinUrl;

  try {
    const res = await fetch(`/api/qr?text=${encodeURIComponent(joinUrl)}`);
    if (res.ok) {
      const data = await res.json();
      if (data.dataUrl) {
        const qrEl = document.getElementById('qrCodeImg');
        const largeQrEl = document.getElementById('largeQrImg');
        if (qrEl) qrEl.src = data.dataUrl;
        if (largeQrEl) largeQrEl.src = data.dataUrl;
      }
    }
  } catch (err) {
    console.error('Failed to load QR Code:', err);
  }
}

function switchJoinUrlMode(mode) {
  currentUrlMode = mode;
  const netBtn = document.getElementById('btnUseNetworkIp');
  const locBtn = document.getElementById('btnUseLocalhost');

  if (mode === 'network') {
    if (netBtn) netBtn.className = 'btn btn-primary';
    if (locBtn) locBtn.className = 'btn btn-outline';
  } else {
    if (locBtn) locBtn.className = 'btn btn-primary';
    if (netBtn) netBtn.className = 'btn btn-outline';
  }
  updateJoinUrlAndQr();
}

function openLargeQrModal() {
  document.getElementById('largeQrModal').style.display = 'flex';
}

function closeLargeQrModal() {
  document.getElementById('largeQrModal').style.display = 'none';
}

function syncConfig() {
  socket.emit('update-room-config', {
    code: currentRoomCode,
    config: currentConfig
  });
}

function setMode(mode) {
  currentConfig.mode = mode;
  const timeBtn = document.getElementById('modeTimeBtn');
  const raceBtn = document.getElementById('modeRaceBtn');
  const timeBox = document.getElementById('timeOptionsBox');
  const raceBox = document.getElementById('raceOptionsBox');

  if (mode === 'time') {
    timeBtn.className = 'btn btn-primary';
    raceBtn.className = 'btn btn-outline';
    timeBox.style.display = 'block';
    raceBox.style.display = 'none';
  } else {
    raceBtn.className = 'btn btn-primary';
    timeBtn.className = 'btn btn-outline';
    timeBox.style.display = 'none';
    raceBox.style.display = 'block';
  }
  syncConfig();
}

function promptCustomIp() {
  const currentIp = serverInfo.ip || '192.168.10.107';
  const newIp = prompt('스마트폰이 접속할 PC의 IP 주소를 입력하세요:', currentIp);
  if (newIp && newIp.trim()) {
    serverInfo.ip = newIp.trim();
    serverInfo.networkUrl = `http://${newIp.trim()}:${serverInfo.port || 3000}`;
    currentUrlMode = 'network';
    updateJoinUrlAndQr();
  }
}

function copyJoinLink() {
  const joinUrl = getActiveJoinUrl();
  navigator.clipboard.writeText(joinUrl).then(() => {
    alert('참가 링크가 클립보드에 복사되었습니다!\n' + joinUrl);
  }).catch(() => {
    prompt('참가 링크:', joinUrl);
  });
}

function toggleSound() {
  const muted = window.soundEngine.toggleMute();
  const btn = document.getElementById('soundToggleBtn');
  btn.innerText = muted ? '🔇' : '🔊';
}

function addBot() {
  socket.emit('add-bot', { code: currentRoomCode }, (res) => {
    if (res.success) {
      window.soundEngine.playBuy();
    }
  });
}

function addMultipleBots(count) {
  let added = 0;
  const interval = setInterval(() => {
    if (added < count) {
      addBot();
      added++;
    } else {
      clearInterval(interval);
    }
  }, 120);
}

function startGame() {
  if (playersList.length === 0) {
    if (confirm('참가자가 없습니다. AI 봇 3명을 추가하여 바로 시작하시겠습니까?')) {
      addMultipleBots(3);
      setTimeout(() => {
        doStartGame();
      }, 500);
      return;
    }
    return;
  }
  doStartGame();
}

function doStartGame() {
  socket.emit('start-game', { code: currentRoomCode }, (res) => {
    if (!res.success) {
      alert(res.error);
    } else {
      window.soundEngine.playWin();
    }
  });
}

function endGameEarly() {
  if (confirm('게임을 조기 종료하시겠습니까?')) {
    socket.emit('force-end-game', { code: currentRoomCode });
  }
}

// Socket Listeners
socket.on('player-joined', (p) => {
  const existing = playersList.find(x => x.id === p.id);
  if (!existing) playersList.push(p);
  renderLobbyPlayers();
  window.soundEngine.playTick();
});

socket.on('player-left', ({ id }) => {
  playersList = playersList.filter(x => x.id !== id);
  renderLobbyPlayers();
});

socket.on('game-started', ({ config, remainingTime }) => {
  document.getElementById('lobbySection').style.display = 'none';
  document.getElementById('inGameSection').style.display = 'block';
  document.getElementById('gameStatusPill').style.display = 'flex';
  document.getElementById('btnEndGame').style.display = 'inline-flex';

  const isDld = (config.gameType === 'dont-look-down');
  const dldBox = document.getElementById('dldMountainBox');
  const lbTitle = document.getElementById('leaderboardTitle');

  if (isDld) {
    if (dldBox) dldBox.style.display = 'block';
    if (lbTitle) lbTitle.innerText = '🧗 실시간 고도 랭킹 (1,000m 정상 정복)';
    document.getElementById('gameTimerDisplay').innerText = '목표: 1,000m';
    document.getElementById('modeStatusTag').innerText = '🧗 Don\'t Look Down';
  } else {
    if (dldBox) dldBox.style.display = 'none';
    if (lbTitle) lbTitle.innerText = '🏆 실시간 머니 랭킹보드';
    if (config.mode === 'time') {
      updateTimerDisplay(remainingTime);
      document.getElementById('modeStatusTag').innerText = '⏱️ 시간 제한 모드';
    } else {
      document.getElementById('gameTimerDisplay').innerText = `목표: $${config.targetBalance.toLocaleString()}`;
      document.getElementById('modeStatusTag').innerText = `🏁 레이스: $${config.targetBalance.toLocaleString()}`;
    }
  }
});

socket.on('timer-tick', ({ remainingTime }) => {
  if (currentConfig.gameType === 'dont-look-down') return;
  updateTimerDisplay(remainingTime);
  if (remainingTime <= 10 && remainingTime > 0) {
    window.soundEngine.playTick();
  }
});

function updateTimerDisplay(seconds) {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  document.getElementById('gameTimerDisplay').innerText = 
    `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

let lastFinalReport = null;
let currentLeaderboard = [];
let currentTeamLeaderboard = [];

socket.on('leaderboard-updated', (data) => {
  const lb = Array.isArray(data) ? data : (data.leaderboard || []);
  const teamLb = data.teamLeaderboard || [];
  playersList = lb;
  currentLeaderboard = lb;
  currentTeamLeaderboard = teamLb;
  renderLeaderboard(lb);
});

socket.on('event-log', (log) => {
  const ticker = document.getElementById('tickerContent');
  if (ticker) {
    ticker.innerHTML = `<span>${log.icon}</span> <span>${log.text}</span>`;
  }
});

socket.on('game-ended', (report) => {
  lastFinalReport = report;
  if (report.leaderboard) currentLeaderboard = report.leaderboard;
  if (report.teamLeaderboard) currentTeamLeaderboard = report.teamLeaderboard;

  document.getElementById('inGameSection').style.display = 'none';
  document.getElementById('gameStatusPill').style.display = 'none';
  document.getElementById('btnEndGame').style.display = 'none';
  document.getElementById('podiumSection').style.display = 'block';

  document.getElementById('endReasonText').innerText = report.reason;

  renderPodium(report.podium);
  renderFinalRankings(report.leaderboard);

  // Victory Sound & Confetti
  window.soundEngine.playWin();
  triggerConfetti();
});

function renderLobbyPlayers() {
  const grid = document.getElementById('lobbyPlayersGrid');
  const countTag = document.getElementById('playerCount');
  const botTag = document.getElementById('botCountTag');

  countTag.innerText = playersList.length;
  const bots = playersList.filter(p => p.isBot);
  botTag.innerText = `${bots.length}명`;

  grid.innerHTML = playersList.map(p => `
    <div style="background: rgba(15, 23, 42, 0.85); border: 1px solid var(--border); border-radius: 12px; padding: 0.8rem; text-align: center; display: flex; flex-direction: column; align-items: center; position: relative;">
      ${p.isBot ? `<span style="position: absolute; top: 4px; right: 4px; font-size: 0.65rem; background: #312e81; color: #c7d2fe; padding: 0.1rem 0.3rem; border-radius: 4px;">BOT</span>` : ''}
      <div style="font-size: 2.2rem; margin-bottom: 0.3rem;">${p.avatar || '🐱'}</div>
      <div style="font-weight: 700; font-size: 0.9rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; width: 100%;">
        ${escapeHtml(p.name)}
      </div>
    </div>
  `).join('');
}

function renderLeaderboard(leaderboard) {
  const isDld = (currentConfig.gameType === 'dont-look-down');
  if (isDld) {
    renderMountainPins(leaderboard);
  }

  const container = document.getElementById('leaderboardList');
  if (!container) return;

  const summitNames = ['', 'Summit 1 (Emberwall)', 'Summit 2 (Coral)', 'Summit 3 (Agent)', 'Summit 4 (Growing)', 'Summit 5 (Frosty)', 'Summit 6 (One Way)'];

  container.innerHTML = leaderboard.map((p, idx) => {
    const rank = idx + 1;
    let rankBadge = rank;
    if (rank === 1) rankBadge = '🥇';
    else if (rank === 2) rankBadge = '🥈';
    else if (rank === 3) rankBadge = '🥉';

    if (isDld) {
      return `
        <div class="lb-row rank-${rank}">
          <div class="lb-left">
            <div class="lb-rank">${rankBadge}</div>
            <div class="lb-avatar">${p.avatar}</div>
            <div>
              <div class="lb-name">
                ${escapeHtml(p.name)}
                ${p.isBot ? `<span style="font-size: 0.65rem; background: #0369a1; color: #bae6fd; padding: 0.15rem 0.4rem; border-radius: 4px;">AI</span>` : ''}
              </div>
              <div style="font-size: 0.75rem; color: #38bdf8; font-weight: 700;">
                ${summitNames[p.summit] || 'Peak'}
              </div>
            </div>
          </div>
          <div class="lb-right">
            <div style="font-size: 1.4rem; font-weight: 900; color: #38bdf8;">
              ${p.altitude || 0}m
            </div>
          </div>
        </div>
      `;
    }

    return `
      <div class="lb-row rank-${rank}">
        <div class="lb-left">
          <div class="lb-rank">${rankBadge}</div>
          <div class="lb-avatar">${p.avatar}</div>
          <div>
            <div class="lb-name">
              ${escapeHtml(p.name)}
              ${p.isBot ? `<span style="font-size: 0.65rem; background: #312e81; color: #a5b4fc; padding: 0.15rem 0.4rem; border-radius: 4px;">AI</span>` : ''}
            </div>
            <div style="display: flex; gap: 0.4rem; margin-top: 0.2rem;">
              <span style="font-size: 0.75rem; color: #a78bfa; font-weight: 700;">x${p.multiplier}배</span>
              <span style="font-size: 0.75rem; color: var(--text-muted);">정답 ${p.correctCount}개</span>
            </div>
          </div>
        </div>

        <div class="lb-right">
          ${p.isFrozen ? `<span class="lb-badge frozen">🧊 얼어붙음</span>` : ''}
          ${p.hasShield ? `<span class="lb-badge shield">🛡️ 방어막</span>` : ''}
          <div class="lb-money">$${p.balance.toLocaleString()}</div>
        </div>
      </div>
    `;
  }).join('');
}

function renderMountainPins(lb) {
  const container = document.getElementById('mountainPinsContainer');
  if (!container) return;
  const totalH = 340;

  container.innerHTML = lb.map((p, idx) => {
    const alt = Math.max(0, Math.min(1000, p.altitude || 0));
    const topPos = totalH - (alt / 1000) * (totalH - 30) - 20;
    const xPos = 20 + (idx % 6) * 45;

    return `
      <div style="position: absolute; top: ${topPos}px; left: ${xPos}px; transition: top 0.4s ease; display: flex; align-items: center; gap: 4px; background: rgba(15, 23, 42, 0.85); border: 1px solid rgba(56, 189, 248, 0.4); border-radius: 8px; padding: 2px 6px; z-index: ${100 - idx};">
        <span style="font-size: 1.2rem;">${p.avatar}</span>
        <span style="font-size: 0.75rem; font-weight: 800; color: #fff;">${escapeHtml(p.name.slice(0, 5))} (${alt}m)</span>
      </div>
    `;
  }).join('');
}

function renderPodium(podium) {
  const container = document.getElementById('podiumContainer');
  const isDld = (currentConfig.gameType === 'dont-look-down');
  // Order: 2nd, 1st, 3rd
  const ordered = [
    podium[1] || null,
    podium[0] || null,
    podium[2] || null
  ];

  container.innerHTML = ordered.map((p, index) => {
    if (!p) return '<div class="podium-step" style="opacity: 0;"></div>';
    const rank = (index === 0) ? 2 : (index === 1) ? 1 : 3;
    const scoreText = isDld ? `${p.altitude || 1000}m 도달` : `$${p.balance.toLocaleString()}`;

    return `
      <div class="podium-step p-${rank}">
        <div class="podium-avatar">${p.avatar}</div>
        <div class="podium-name">${escapeHtml(p.name)}</div>
        <div class="podium-money" style="${isDld ? 'color: #38bdf8;' : ''}">${scoreText}</div>
        <div class="podium-pillar">
          ${rank}
        </div>
      </div>
    `;
  }).join('');
}

function renderFinalRankings(leaderboard) {
  const container = document.getElementById('finalRankingsList');
  container.innerHTML = leaderboard.map((p, idx) => `
    <div class="lb-row">
      <div class="lb-left">
        <div class="lb-rank">${idx + 1}</div>
        <div class="lb-avatar">${p.avatar}</div>
        <div class="lb-name">${escapeHtml(p.name)}</div>
      </div>
      <div class="lb-right">
        <div class="lb-money">$${p.balance.toLocaleString()}</div>
      </div>
    </div>
  `).join('');
}

function triggerConfetti() {
  if (typeof confetti === 'function') {
    confetti({
      particleCount: 120,
      spread: 70,
      origin: { y: 0.6 }
    });
    setTimeout(() => {
      confetti({
        particleCount: 80,
        angle: 60,
        spread: 55,
        origin: { x: 0 }
      });
      confetti({
        particleCount: 80,
        angle: 120,
        spread: 55,
        origin: { x: 1 }
      });
    }, 400);
  }
}

function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/[&<>"']/g, (m) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[m]));
}

// ----------------------------------------------------
// Difficulty & Balance Customization Handlers
// ----------------------------------------------------
const DIFFICULTY_PRESETS = {
  easy: {
    label: '🟢 쉬움',
    badgeColor: '#10b981',
    energyGain: 1500,
    jumpCost: 10,
    gemRate: 0.70,
    updraftRate: 0.25,
    startingEnergy: 2000
  },
  normal: {
    label: '🟡 보통',
    badgeColor: '#0284c7',
    energyGain: 1000,
    jumpCost: 15,
    gemRate: 0.45,
    updraftRate: 0.10,
    startingEnergy: 1500
  },
  hard: {
    label: '🔴 어려움',
    badgeColor: '#ef4444',
    energyGain: 600,
    jumpCost: 25,
    gemRate: 0.20,
    updraftRate: 0.00,
    startingEnergy: 1000
  },
  extreme: {
    label: '🔥 지옥',
    badgeColor: '#7c3aed',
    energyGain: 400,
    jumpCost: 35,
    gemRate: 0.10,
    updraftRate: 0.00,
    startingEnergy: 600
  }
};

function setDifficultyPreset(key) {
  const p = DIFFICULTY_PRESETS[key];
  if (!p) return;

  ['easy', 'normal', 'hard', 'extreme'].forEach(k => {
    const btn = document.getElementById(`presetBtn_${k}`);
    if (btn) btn.classList.toggle('active', k === key);
  });

  const badge = document.getElementById('difficultyBadge');
  if (badge) {
    badge.innerText = p.label;
    badge.style.background = p.badgeColor;
  }

  const eGainInput = document.getElementById('energyGainRange');
  if (eGainInput) eGainInput.value = p.energyGain;
  const eGainLabel = document.getElementById('energyGainLabel');
  if (eGainLabel) eGainLabel.innerText = `+${p.energyGain.toLocaleString()}`;

  const jCostInput = document.getElementById('jumpCostRange');
  if (jCostInput) jCostInput.value = p.jumpCost;
  const jCostLabel = document.getElementById('jumpCostLabel');
  if (jCostLabel) jCostLabel.innerText = `${p.jumpCost} (더블 ${p.jumpCost * 2})`;

  const gemSelect = document.getElementById('gemRateSelect');
  if (gemSelect) gemSelect.value = p.gemRate.toFixed(2);
  const gemLabelMap = { '0.20': '희귀함 (20%)', '0.45': '보통 (45%)', '0.70': '많음 (70%)', '1.00': '넘쳐남 (100%)' };
  const gemLabel = document.getElementById('gemRateLabel');
  if (gemLabel) gemLabel.innerText = gemLabelMap[p.gemRate.toFixed(2)] || `${Math.round(p.gemRate * 100)}%`;

  const updraftSelect = document.getElementById('updraftRateSelect');
  if (updraftSelect) updraftSelect.value = p.updraftRate.toFixed(2);
  const updraftLabelMap = { '0.00': '없음 (0%)', '0.10': '보통 (10%)', '0.25': '많음 (25%)', '0.40': '슈퍼 상승 (40%)' };
  const updraftLabel = document.getElementById('updraftRateLabel');
  if (updraftLabel) updraftLabel.innerText = updraftLabelMap[p.updraftRate.toFixed(2)] || `${Math.round(p.updraftRate * 100)}%`;

  currentConfig.dldSettings = {
    difficulty: key,
    energyGain: p.energyGain,
    jumpCost: p.jumpCost,
    gemRate: p.gemRate,
    updraftRate: p.updraftRate,
    startingEnergy: p.startingEnergy
  };

  syncConfig();
}

function onCustomSettingChange() {
  const energyGain = parseInt(document.getElementById('energyGainRange').value, 10);
  const jumpCost = parseInt(document.getElementById('jumpCostRange').value, 10);
  const gemRate = parseFloat(document.getElementById('gemRateSelect').value);
  const updraftRate = parseFloat(document.getElementById('updraftRateSelect').value);

  const eGainLabel = document.getElementById('energyGainLabel');
  if (eGainLabel) eGainLabel.innerText = `+${energyGain.toLocaleString()}`;

  const jCostLabel = document.getElementById('jumpCostLabel');
  if (jCostLabel) jCostLabel.innerText = `${jumpCost} (더블 ${jumpCost * 2})`;

  const gemLabelMap = { '0.20': '희귀함 (20%)', '0.45': '보통 (45%)', '0.70': '많음 (70%)', '1.00': '넘쳐남 (100%)' };
  const gemLabel = document.getElementById('gemRateLabel');
  if (gemLabel) gemLabel.innerText = gemLabelMap[gemRate.toFixed(2)] || `${Math.round(gemRate * 100)}%`;

  const updraftLabelMap = { '0.00': '없음 (0%)', '0.10': '보통 (10%)', '0.25': '많음 (25%)', '0.40': '슈퍼 상승 (40%)' };
  const updraftLabel = document.getElementById('updraftRateLabel');
  if (updraftLabel) updraftLabel.innerText = updraftLabelMap[updraftRate.toFixed(2)] || `${Math.round(updraftRate * 100)}%`;

  ['easy', 'normal', 'hard', 'extreme'].forEach(k => {
    const btn = document.getElementById(`presetBtn_${k}`);
    if (btn) btn.classList.remove('active');
  });

  const badge = document.getElementById('difficultyBadge');
  if (badge) {
    badge.innerText = '⚙️ 사용자 정의';
    badge.style.background = '#6366f1';
  }

  currentConfig.dldSettings = {
    difficulty: 'custom',
    energyGain,
    jumpCost,
    gemRate,
    updraftRate,
    startingEnergy: Math.max(500, Math.min(3000, energyGain * 1.5))
  };

  syncConfig();
}

// --- Student Achievement & Excel Export Logic (Classic Quiz Mode) ---
let currentAchievementSort = 'number';

function getActiveLeaderboard() {
  if (lastFinalReport && lastFinalReport.leaderboard && lastFinalReport.leaderboard.length > 0) {
    return lastFinalReport.leaderboard;
  }
  return currentLeaderboard || [];
}

function openAchievementModal() {
  const modal = document.getElementById('achievementModal');
  if (!modal) return;
  modal.style.display = 'flex';
  renderAchievementSummary();
  renderAchievementTable();
}

function closeAchievementModal() {
  const modal = document.getElementById('achievementModal');
  if (modal) modal.style.display = 'none';
}

function setAchievementSort(sortType) {
  currentAchievementSort = sortType;
  const noBtn = document.getElementById('achSortByNoBtn');
  const rankBtn = document.getElementById('achSortByRankBtn');
  const accBtn = document.getElementById('achSortByAccBtn');

  if (noBtn) noBtn.classList.toggle('active', sortType === 'number');
  if (rankBtn) rankBtn.classList.toggle('active', sortType === 'rank');
  if (accBtn) accBtn.classList.toggle('active', sortType === 'accuracy');

  renderAchievementTable();
}

function renderAchievementSummary() {
  const lb = getActiveLeaderboard();
  const totalPlayers = lb.length;
  let totalAcc = 0;
  let maxBal = 0;
  let totalQ = 0;

  lb.forEach(p => {
    totalAcc += (p.accuracy || 0);
    if ((p.balance || 0) > maxBal) maxBal = p.balance || 0;
    totalQ += (p.totalQuestions || ((p.correctCount || 0) + (p.wrongCount || 0)));
  });

  const avgAcc = totalPlayers > 0 ? Math.round(totalAcc / totalPlayers) : 0;

  const elTotal = document.getElementById('achStatTotalPlayers');
  const elAvgAcc = document.getElementById('achStatAvgAccuracy');
  const elMaxBal = document.getElementById('achStatMaxBalance');
  const elTotalQ = document.getElementById('achStatTotalQuestions');

  if (elTotal) elTotal.innerText = `${totalPlayers}명`;
  if (elAvgAcc) elAvgAcc.innerText = `${avgAcc}%`;
  if (elMaxBal) elMaxBal.innerText = `$${maxBal.toLocaleString()}`;
  if (elTotalQ) elTotalQ.innerText = `${totalQ}개`;
}

function renderAchievementTable() {
  const tbody = document.getElementById('achievementTableBody');
  if (!tbody) return;

  const lb = [...getActiveLeaderboard()];
  if (lb.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="9" style="padding: 2.5rem; color: #94a3b8; font-weight: 700;">
          아직 참여한 학생 데이터가 없습니다. 게임을 시작하거나 학생이 참가하면 자동으로 반영됩니다.
        </td>
      </tr>
    `;
    return;
  }

  // Pre-calculate rank in leaderboard
  const rankMap = new Map();
  lb.forEach((p, idx) => {
    rankMap.set(p.id, idx + 1);
  });

  // Sort according to currentAchievementSort
  if (currentAchievementSort === 'number') {
    lb.sort((a, b) => {
      const aNo = (a.studentNo != null && a.studentNo !== '') ? Number(a.studentNo) : 999999;
      const bNo = (b.studentNo != null && b.studentNo !== '') ? Number(b.studentNo) : 999999;
      if (aNo !== bNo) return aNo - bNo;
      return (a.nickname || a.name || '').localeCompare(b.nickname || b.name || '', 'ko');
    });
  } else if (currentAchievementSort === 'accuracy') {
    lb.sort((a, b) => (b.accuracy || 0) - (a.accuracy || 0));
  } else {
    // rank (by balance / rankMap)
    lb.sort((a, b) => (rankMap.get(a.id) || 999) - (rankMap.get(b.id) || 999));
  }

  tbody.innerHTML = lb.map(p => {
    const rank = rankMap.get(p.id) || '-';
    const sNoText = (p.studentNo != null && p.studentNo !== '') ? `${p.studentNo}번` : '-';
    const teamBadge = p.teamName ? `
      <span style="display: inline-block; padding: 0.15rem 0.5rem; border-radius: 999px; font-size: 0.75rem; font-weight: 800; background: ${p.teamColor || '#6366f1'}33; color: ${p.teamColor || '#a5b4fc'}; border: 1px solid ${p.teamColor || '#6366f1'}66;">
        ${p.teamEmoji || '🚩'} ${escapeHtml(p.teamName)}
      </span>
    ` : '<span style="color: #64748b;">-</span>';

    const rankBadge = rank === 1 ? '🥇 1위' : rank === 2 ? '🥈 2위' : rank === 3 ? '🥉 3위' : `${rank}위`;
    const acc = p.accuracy != null ? p.accuracy : 0;
    const accColor = acc >= 80 ? '#10b981' : acc >= 50 ? '#38bdf8' : '#f59e0b';

    return `
      <tr style="border-bottom: 1px solid rgba(255,255,255,0.06); transition: background 0.15s ease;" onmouseover="this.style.background='rgba(56, 189, 248, 0.08)'" onmouseout="this.style.background='transparent'">
        <td style="padding: 0.65rem 0.5rem; font-weight: 900; color: #38bdf8;">${sNoText}</td>
        <td style="padding: 0.65rem 0.5rem; text-align: left; font-weight: 800; color: #fff;">
          <span style="font-size: 1.15rem; margin-right: 0.25rem;">${p.avatar || '⚡'}</span>
          ${escapeHtml(p.nickname || p.name)}
          ${p.isBot ? '<span style="font-size: 0.65rem; background: #475569; padding: 0.1rem 0.35rem; border-radius: 4px; margin-left: 0.25rem;">AI</span>' : ''}
        </td>
        <td style="padding: 0.65rem 0.5rem;">${teamBadge}</td>
        <td style="padding: 0.65rem 0.5rem; font-weight: 900; color: #10b981;">$${(p.balance || 0).toLocaleString()}</td>
        <td style="padding: 0.65rem 0.5rem; color: #10b981; font-weight: 800;">${p.correctCount || 0}</td>
        <td style="padding: 0.65rem 0.5rem; color: #ef4444; font-weight: 700;">${p.wrongCount || 0}</td>
        <td style="padding: 0.65rem 0.5rem; font-weight: 900; color: ${accColor};">${acc}%</td>
        <td style="padding: 0.65rem 0.5rem; color: #f97316; font-weight: 800;">🔥 ${p.maxStreak || p.streak || 0}</td>
        <td style="padding: 0.65rem 0.5rem; font-weight: 900; color: #a5b4fc;">${rankBadge}</td>
      </tr>
    `;
  }).join('');
}

function downloadAchievementExcel() {
  if (!window.XLSX) {
    alert('엑셀 라이브러리(xlsx.full.min.js)가 로드되지 않았습니다.');
    return;
  }

  const lb = getActiveLeaderboard();
  if (lb.length === 0) {
    alert('내보낼 학생 성취도 데이터가 없습니다.');
    return;
  }

  const teamLb = (lastFinalReport && lastFinalReport.teamLeaderboard)
    ? lastFinalReport.teamLeaderboard
    : (currentTeamLeaderboard || []);

  const wb = XLSX.utils.book_new();

  // 1. 학생별 성취도 (출석번호 순 정렬)
  const sortedByNo = [...lb].sort((a, b) => {
    const aNo = (a.studentNo != null && a.studentNo !== '') ? Number(a.studentNo) : 999999;
    const bNo = (b.studentNo != null && b.studentNo !== '') ? Number(b.studentNo) : 999999;
    if (aNo !== bNo) return aNo - bNo;
    return (a.nickname || a.name || '').localeCompare(b.nickname || b.name || '', 'ko');
  });

  const sheet1Data = [
    [
      '출석번호',
      '이름(별명)',
      '소속 조',
      '최종 순위',
      '최종 머니($)',
      '맞힌 문제 수',
      '틀린 문제 수',
      '총 문제 수',
      '정답률(%)',
      '최대 연속 정답(Streak)'
    ]
  ];

  sortedByNo.forEach(p => {
    const rank = lb.findIndex(item => item.id === p.id) + 1;
    const totalQ = p.totalQuestions || ((p.correctCount || 0) + (p.wrongCount || 0));
    sheet1Data.push([
      p.studentNo != null && p.studentNo !== '' ? p.studentNo : '',
      p.nickname || p.name,
      p.teamName || '-',
      rank,
      p.balance || 0,
      p.correctCount || 0,
      p.wrongCount || 0,
      totalQ,
      p.accuracy != null ? p.accuracy : 0,
      p.maxStreak || p.streak || 0
    ]);
  });

  const ws1 = XLSX.utils.aoa_to_sheet(sheet1Data);
  XLSX.utils.book_append_sheet(wb, ws1, '학생별 성취도(출석번호순)');

  // 2. 랭킹 순 시트
  const sheet2Data = [
    [
      '순위',
      '출석번호',
      '이름(별명)',
      '소속 조',
      '최종 머니($)',
      '맞힌 문제 수',
      '틀린 문제 수',
      '총 문제 수',
      '정답률(%)',
      '최대 연속 정답'
    ]
  ];

  lb.forEach((p, idx) => {
    const totalQ = p.totalQuestions || ((p.correctCount || 0) + (p.wrongCount || 0));
    sheet2Data.push([
      idx + 1,
      p.studentNo != null && p.studentNo !== '' ? p.studentNo : '',
      p.nickname || p.name,
      p.teamName || '-',
      p.balance || 0,
      p.correctCount || 0,
      p.wrongCount || 0,
      totalQ,
      p.accuracy != null ? p.accuracy : 0,
      p.maxStreak || p.streak || 0
    ]);
  });

  const ws2 = XLSX.utils.aoa_to_sheet(sheet2Data);
  XLSX.utils.book_append_sheet(wb, ws2, '최종 랭킹 순위');

  // 3. 조별 대항전 성적 시트 (팀전인 경우)
  if (isTeamMode && teamLb && teamLb.length > 0) {
    const sheet3Data = [
      ['팀 순위', '팀명', '팀원 수', '총 머니 합계($)', '팀 평균 머니($)', '팀 총 정답수', '팀원 명단']
    ];
    teamLb.forEach((t, idx) => {
      const memberNames = (t.members || []).map(m => m.name || m.nickname).join(', ');
      sheet3Data.push([
        idx + 1,
        t.name,
        t.memberCount || (t.members ? t.members.length : 0),
        t.totalBalance || 0,
        t.avgBalance || 0,
        t.correctCount || 0,
        memberNames
      ]);
    });
    const ws3 = XLSX.utils.aoa_to_sheet(sheet3Data);
    XLSX.utils.book_append_sheet(wb, ws3, '조별 대항전 성적');
  }

  // 4. 문항별 정답률 및 취약 문제 분석 시트
  const qStats = (lastFinalReport && lastFinalReport.questionStats) ? lastFinalReport.questionStats : [];
  if (qStats && qStats.length > 0) {
    const sheet4Data = [
      ['문항 번호', '문제 내용', '정답', '정답 횟수', '오답 횟수', '총 시도', '정답률(%)', '난이도 분석']
    ];
    qStats.forEach((qs, idx) => {
      const diff = qs.accuracy >= 80 ? '쉬움' : qs.accuracy >= 50 ? '보통' : '어려움(보충 필요)';
      sheet4Data.push([
        idx + 1,
        qs.question,
        qs.correctAnswer,
        qs.correctCount,
        qs.wrongCount,
        qs.totalAttempts,
        `${qs.accuracy}%`,
        diff
      ]);
    });
    const ws4 = XLSX.utils.aoa_to_sheet(sheet4Data);
    XLSX.utils.book_append_sheet(wb, ws4, '문항별 정답률 및 취약분석');
  }

  const now = new Date();
  const dateStr = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}_${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}`;
  const fileName = `배움날개_퀴즈성취도_${currentRoomCode}_${dateStr}.xlsx`;

  XLSX.writeFile(wb, fileName);
}
