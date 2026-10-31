// Host Dashboard Script for Don't Look Down
const socket = io();

let currentRoomCode = null;
let currentConfig = {
  gameType: 'dont-look-down',
  mode: 'race',
  timeLimitSeconds: 600,
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
let teams = {};
let isTeamMode = false;
let currentLeaderboard = [];
let currentTeamLeaderboard = [];
let currentLeaderboardView = 'individual'; // 'individual' or 'team'
let serverInfo = { localUrl: window.location.origin, networkUrl: window.location.origin };

window.addEventListener('DOMContentLoaded', async () => {
  try {
    const res = await fetch('/api/server-info');
    if (res.ok) serverInfo = await res.json();
  } catch (e) {
    console.warn(e);
  }

  const urlParams = new URLSearchParams(window.location.search);
  const requestedCode = urlParams.get('code') || '311866';

  socket.emit('create-room', {
    customCode: requestedCode,
    config: currentConfig
  }, (res) => {
    if (res.success) {
      currentRoomCode = res.code;
      if (res.teams) teams = res.teams;
      if (res.isTeamMode !== undefined) isTeamMode = res.isTeamMode;
      setupRoomUI(res.code);
      updateTeamModeUI();
    } else {
      socket.emit('create-room', { config: currentConfig }, (fallbackRes) => {
        currentRoomCode = fallbackRes.code;
        if (fallbackRes.teams) teams = fallbackRes.teams;
        if (fallbackRes.isTeamMode !== undefined) isTeamMode = fallbackRes.isTeamMode;
        setupRoomUI(fallbackRes.code);
        updateTeamModeUI();
      });
    }
  });

  const quizSelect = document.getElementById('quizSetSelect');
  if (quizSelect) {
    quizSelect.addEventListener('change', (e) => {
      currentConfig.quizSetId = e.target.value;
      socket.emit('update-room-config', { code: currentRoomCode, config: currentConfig });
    });
  }

  if (typeof refreshQuizSetsDropdown === 'function') {
    refreshQuizSetsDropdown();
  }
});

function getActiveJoinUrl() {
  // If accessing through a public domain, cloud host, or tunnel (not private LAN / localhost)
  const host = window.location.hostname;
  const isPrivate = host === 'localhost' || host === '127.0.0.1' || host.startsWith('192.168.') || host.startsWith('10.') || host.startsWith('172.');
  if (!isPrivate) {
    return `${window.location.origin}/dld?gc=${currentRoomCode}`;
  }
  const base = serverInfo.networkUrl || serverInfo.localUrl || window.location.origin;
  return `${base}/dld?gc=${currentRoomCode}`;
}

async function setupRoomUI(code) {
  document.getElementById('roomCodeDisplay').innerText = code;
  const joinUrl = getActiveJoinUrl();
  document.getElementById('joinUrlDisplay').innerText = joinUrl;

  try {
    const res = await fetch(`/api/qr?text=${encodeURIComponent(joinUrl)}`);
    if (res.ok) {
      const data = await res.json();
      if (data.dataUrl) document.getElementById('qrCodeImg').src = data.dataUrl;
    }
  } catch (e) {
    console.error(e);
  }
}

function promptCustomIp() {
  const currentIp = serverInfo.ip || '192.168.10.107';
  const newIp = prompt('스마트폰이 접속할 PC의 IP 주소를 입력하세요:', currentIp);
  if (newIp && newIp.trim()) {
    serverInfo.ip = newIp.trim();
    serverInfo.networkUrl = `http://${newIp.trim()}:${serverInfo.port || 3000}`;
    setupRoomUI(currentRoomCode);
  }
}

function copyJoinLink() {
  const joinUrl = getActiveJoinUrl();
  navigator.clipboard.writeText(joinUrl).then(() => {
    alert('참가 링크가 클립보드에 복사되었습니다!\n' + joinUrl);
  });
}

function toggleSound() {
  const muted = window.soundEngine.toggleMute();
  document.getElementById('soundToggleBtn').innerText = muted ? '🔇' : '🔊';
}

function addBot() {
  socket.emit('add-bot', { code: currentRoomCode }, (res) => {
    if (res.success) window.soundEngine.playBuy();
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
      setTimeout(() => doStart(), 500);
      return;
    }
    return;
  }
  doStart();
}

function doStart() {
  socket.emit('start-game', { code: currentRoomCode }, (res) => {
    if (res.success) window.soundEngine.playWin();
  });
}

function endGameEarly() {
  if (confirm('게임을 종료하시겠습니까?')) {
    socket.emit('force-end-game', { code: currentRoomCode });
  }
}

// Socket Listeners
socket.on('player-joined', (p) => {
  const existing = playersList.find(x => x.id === p.id);
  if (!existing) playersList.push(p);
  else Object.assign(existing, p);
  renderLobbyPlayers();
  window.soundEngine.playTick();
});

socket.on('player-left', ({ id }) => {
  playersList = playersList.filter(x => x.id !== id);
  renderLobbyPlayers();
});

socket.on('teams-updated', (data) => {
  if (data.isTeamMode !== undefined) isTeamMode = !!data.isTeamMode;
  if (data.teams) teams = data.teams;
  if (data.players) {
    data.players.forEach(p => {
      const pl = playersList.find(x => x.id === p.id);
      if (pl) pl.teamId = p.teamId;
      else playersList.push(p);
    });
  }
  updateTeamModeUI();
  renderLobbyPlayers();
});

socket.on('game-started', () => {
  document.getElementById('lobbySection').style.display = 'none';
  document.getElementById('inGameSection').style.display = 'block';
  document.getElementById('btnEndGame').style.display = 'inline-flex';
  const tabGroup = document.getElementById('lbTabGroup');
  if (tabGroup) tabGroup.style.display = isTeamMode ? 'flex' : 'none';
});

socket.on('leaderboard-updated', (data) => {
  const lb = Array.isArray(data) ? data : (data.leaderboard || []);
  const teamLb = data.teamLeaderboard || [];
  if (data.isTeamMode !== undefined) isTeamMode = !!data.isTeamMode;

  playersList = lb;
  currentLeaderboard = lb;
  currentTeamLeaderboard = teamLb;

  renderMountainPins(lb);
  renderDldLeaderboard();
});

socket.on('event-log', (log) => {
  const ticker = document.getElementById('tickerContent');
  if (ticker) {
    ticker.innerHTML = `<span>${log.icon}</span> <span>${log.text}</span>`;
  }
});

socket.on('game-ended', (report) => {
  document.getElementById('inGameSection').style.display = 'none';
  document.getElementById('btnEndGame').style.display = 'none';
  document.getElementById('podiumSection').style.display = 'block';

  document.getElementById('endReasonText').innerText = report.reason;
  if (report.isTeamMode && report.teamPodium && report.teamPodium.length > 0) {
    renderTeamPodium(report.teamPodium);
  } else {
    renderPodium(report.podium);
  }

  window.soundEngine.playWin();
  if (typeof confetti === 'function') confetti({ particleCount: 150, spread: 80 });
});

function toggleTeamMode(enabled) {
  isTeamMode = !!enabled;
  socket.emit('set-team-mode', { code: currentRoomCode, enabled: isTeamMode });
  updateTeamModeUI();
  renderLobbyPlayers();
}

function updateTeamModeUI() {
  const soloBtn = document.getElementById('matchModeSoloBtn');
  const teamBtn = document.getElementById('matchModeTeamBtn');
  const quickActions = document.getElementById('teamQuickActions');
  const teamsPanel = document.getElementById('teamsLobbyPanel');
  const soloGrid = document.getElementById('lobbyPlayersGrid');
  const lbTabs = document.getElementById('lbTabGroup');

  if (soloBtn) soloBtn.classList.toggle('active', !isTeamMode);
  if (teamBtn) teamBtn.classList.toggle('active', isTeamMode);

  if (quickActions) quickActions.style.display = isTeamMode ? 'flex' : 'none';
  if (teamsPanel) teamsPanel.style.display = isTeamMode ? 'block' : 'none';
  if (soloGrid) soloGrid.style.display = isTeamMode ? 'none' : 'grid';
  if (lbTabs) lbTabs.style.display = isTeamMode ? 'flex' : 'none';
}

function autoAssignTeams(teamCount) {
  if (!currentRoomCode) return;
  socket.emit('auto-assign-teams', { code: currentRoomCode, teamCount });
  window.soundEngine.playBuy();
}

function addNewTeamPrompt() {
  const teamIdx = Object.keys(teams).length + 1;
  const name = prompt(`새 조 이름을 입력하세요 (예: ${teamIdx}조)`, `${teamIdx}조`);
  if (!name) return;
  socket.emit('create-team', { code: currentRoomCode, name });
}

function removeTeam(teamId) {
  if (confirm('이 조를 삭제하시겠습니까? 소속된 학생들은 미배정 상태로 변경됩니다.')) {
    socket.emit('remove-team', { code: currentRoomCode, teamId });
  }
}

function assignPlayerTeam(playerId, teamId) {
  socket.emit('assign-player-team', { code: currentRoomCode, playerId, teamId });
}

function renderLobbyPlayers() {
  const countTag = document.getElementById('playerCount');
  const botTag = document.getElementById('botCountTag');

  if (countTag) countTag.innerText = playersList.length;
  const bots = playersList.filter(p => p.isBot);
  if (botTag) botTag.innerText = `${bots.length}명`;

  if (isTeamMode) {
    renderTeamsLobby();
  } else {
    renderSoloLobby();
  }
}

function renderSoloLobby() {
  const grid = document.getElementById('lobbyPlayersGrid');
  if (!grid) return;
  grid.innerHTML = playersList.map(p => `
    <div style="background: rgba(15, 23, 42, 0.85); border: 1px solid var(--border); border-radius: 12px; padding: 0.8rem; text-align: center; display: flex; flex-direction: column; align-items: center; position: relative;">
      ${p.isBot ? `<span style="position: absolute; top: 4px; right: 4px; font-size: 0.65rem; background: #0369a1; color: #bae6fd; padding: 0.1rem 0.3rem; border-radius: 4px;">BOT</span>` : ''}
      <div style="font-size: 2.2rem; margin-bottom: 0.3rem;">${p.avatar || '🐱'}</div>
      <div style="font-weight: 700; font-size: 0.9rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; width: 100%;">
        ${escapeHtml(p.name)}
      </div>
    </div>
  `).join('');
}

function renderTeamsLobby() {
  const cardGrid = document.getElementById('teamsCardGrid');
  const unassignedList = document.getElementById('unassignedList');
  const unassignedCount = document.getElementById('unassignedCount');
  if (!cardGrid || !unassignedList) return;

  const teamList = Object.values(teams);
  const unassigned = playersList.filter(p => !p.teamId || !teams[p.teamId]);
  if (unassignedCount) unassignedCount.innerText = unassigned.length;

  // Unassigned Tray
  unassignedList.innerHTML = unassigned.length === 0
    ? `<span style="font-size: 0.75rem; color: #64748b; font-style: italic;">모든 참가자가 조에 배정되었습니다. ✨</span>`
    : unassigned.map(p => `
      <div style="background: rgba(30, 41, 59, 0.9); border: 1px solid rgba(255,255,255,0.15); border-radius: 8px; padding: 0.25rem 0.5rem; display: flex; align-items: center; gap: 0.35rem; font-size: 0.78rem;">
        <span>${p.avatar || '🐱'}</span>
        <span style="font-weight: 700; color: #fff;">${escapeHtml(p.name)}</span>
        ${p.isBot ? `<span style="font-size: 0.6rem; color: #38bdf8;">[AI]</span>` : ''}
        <select style="background: #0f172a; color: #38bdf8; border: 1px solid rgba(56, 189, 248, 0.4); border-radius: 6px; padding: 0.1rem 0.3rem; font-size: 0.7rem; font-weight: 800; cursor: pointer;" onchange="assignPlayerTeam('${p.id}', this.value)">
          <option value="" selected>배정...</option>
          ${teamList.map(t => `<option value="${t.id}">${t.emoji} ${escapeHtml(t.name)}</option>`).join('')}
        </select>
      </div>
    `).join('');

  // Teams Cards
  cardGrid.innerHTML = teamList.map(t => {
    const members = playersList.filter(p => p.teamId === t.id);
    return `
      <div style="background: rgba(15, 23, 42, 0.9); border: 2px solid ${t.color || '#38bdf8'}; border-radius: 12px; padding: 0.75rem; display: flex; flex-direction: column;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem; border-bottom: 1px solid rgba(255,255,255,0.1); padding-bottom: 0.4rem;">
          <div style="display: flex; align-items: center; gap: 0.35rem;">
            <span style="font-size: 1.1rem;">${t.emoji || '🚩'}</span>
            <span style="font-weight: 900; color: ${t.color || '#fff'}; font-size: 0.92rem;">${escapeHtml(t.name)}</span>
            <span style="font-size: 0.72rem; color: #94a3b8; font-weight: 800;">(${members.length}명)</span>
          </div>
          <button type="button" class="btn btn-outline" style="padding: 0.15rem 0.4rem; font-size: 0.65rem; color: #ef4444; border-color: rgba(239,68,68,0.4);" onclick="removeTeam('${t.id}')">
            삭제
          </button>
        </div>

        <div style="display: flex; flex-direction: column; gap: 0.35rem; min-height: 80px; max-height: 160px; overflow-y: auto;">
          ${members.length === 0
            ? `<div style="font-size: 0.72rem; color: #64748b; text-align: center; padding: 1.2rem 0;">배정된 팀원이 없습니다.</div>`
            : members.map(m => `
              <div style="background: rgba(30, 41, 59, 0.7); border-radius: 6px; padding: 0.25rem 0.4rem; display: flex; justify-content: space-between; align-items: center; font-size: 0.76rem;">
                <div style="display: flex; align-items: center; gap: 0.3rem; overflow: hidden;">
                  <span>${m.avatar}</span>
                  <span style="font-weight: 700; color: #fff; text-overflow: ellipsis; white-space: nowrap; overflow: hidden;">${escapeHtml(m.name)}</span>
                  ${m.isBot ? `<span style="font-size: 0.6rem; color: #38bdf8;">[AI]</span>` : ''}
                </div>
                <select style="background: #0f172a; color: #cbd5e1; border: 1px solid rgba(255,255,255,0.2); border-radius: 4px; padding: 0.05rem 0.2rem; font-size: 0.65rem; cursor: pointer;" onchange="assignPlayerTeam('${m.id}', this.value)">
                  <option value="${t.id}" selected>이동...</option>
                  <option value="">(미배정)</option>
                  ${teamList.filter(ot => ot.id !== t.id).map(ot => `<option value="${ot.id}">${ot.emoji} ${escapeHtml(ot.name)}</option>`).join('')}
                </select>
              </div>
            `).join('')
          }
        </div>
      </div>
    `;
  }).join('');
}

function renderMountainPins(lb) {
  const container = document.getElementById('mountainPinsContainer');
  const totalH = 400;

  container.innerHTML = lb.map((p, idx) => {
    const alt = Math.max(0, Math.min(1000, p.altitude || 0));
    const topPos = totalH - (alt / 1000) * (totalH - 40) - 20;
    const xPos = 20 + (idx % 6) * 45;

    return `
      <div style="position: absolute; top: ${topPos}px; left: ${xPos}px; transition: top 0.4s ease; display: flex; align-items: center; gap: 4px; background: rgba(15, 23, 42, 0.75); border: 1px solid rgba(56, 189, 248, 0.4); border-radius: 8px; padding: 2px 6px; z-index: ${100 - idx};">
        <span style="font-size: 1.2rem;">${p.avatar}</span>
        <span style="font-size: 0.75rem; font-weight: 800; color: #fff;">${escapeHtml(p.name.slice(0, 5))} (${alt}m)</span>
      </div>
    `;
  }).join('');
}

function setLeaderboardView(view) {
  currentLeaderboardView = view;
  const btnInd = document.getElementById('lbTabIndividualBtn');
  const btnTeam = document.getElementById('lbTabTeamBtn');
  const listInd = document.getElementById('dldLeaderboardList');
  const listTeam = document.getElementById('dldTeamLeaderboardList');

  if (btnInd) btnInd.classList.toggle('active', view === 'individual');
  if (btnTeam) btnTeam.classList.toggle('active', view === 'team');

  if (listInd) listInd.style.display = (view === 'individual') ? 'block' : 'none';
  if (listTeam) listTeam.style.display = (view === 'team') ? 'block' : 'none';

  renderDldLeaderboard();
}

function renderDldLeaderboard() {
  renderDldIndividualLeaderboard();
  renderDldTeamLeaderboard();
}

function renderDldIndividualLeaderboard() {
  const container = document.getElementById('dldLeaderboardList');
  if (!container) return;
  const lb = currentLeaderboard || [];
  const summitNames = ['', 'Summit 1', 'Summit 2', 'Summit 3', 'Summit 4', 'Summit 5', 'Summit 6'];

  container.innerHTML = lb.map((p, idx) => {
    const rank = idx + 1;
    let rankBadge = rank;
    if (rank === 1) rankBadge = '🥇';
    else if (rank === 2) rankBadge = '🥈';
    else if (rank === 3) rankBadge = '🥉';

    const teamTag = (isTeamMode && p.teamName)
      ? `<span style="font-size: 0.65rem; padding: 0.1rem 0.35rem; border-radius: 4px; font-weight: 800; background: ${p.teamColor || '#38bdf8'}22; color: ${p.teamColor || '#38bdf8'}; border: 1px solid ${p.teamColor || '#38bdf8'}66;">${p.teamEmoji || '🚩'} ${escapeHtml(p.teamName)}</span>`
      : '';

    return `
      <div class="lb-row rank-${rank}">
        <div class="lb-left">
          <div class="lb-rank">${rankBadge}</div>
          <div class="lb-avatar">${p.avatar}</div>
          <div>
            <div class="lb-name" style="display: flex; align-items: center; gap: 0.35rem; flex-wrap: wrap;">
              <span>${escapeHtml(p.name)}</span>
              ${teamTag}
              ${p.isBot ? `<span style="font-size: 0.65rem; background: #0369a1; color: #bae6fd; padding: 0.15rem 0.4rem; border-radius: 4px;">AI</span>` : ''}
            </div>
            <div style="font-size: 0.75rem; color: #38bdf8; font-weight: 700;">
              ${summitNames[p.summit] || 'Peak'}
            </div>
          </div>
        </div>
        <div class="lb-right">
          <div style="font-size: 1.3rem; font-weight: 900; color: #38bdf8;">
            ${p.altitude || 0}m
          </div>
        </div>
      </div>
    `;
  }).join('');
}

function renderDldTeamLeaderboard() {
  const container = document.getElementById('dldTeamLeaderboardList');
  if (!container) return;
  const teamLb = currentTeamLeaderboard || [];

  if (teamLb.length === 0) {
    container.innerHTML = `<div style="text-align: center; color: #64748b; padding: 2rem 0; font-size: 0.85rem;">팀 기록이 없습니다.</div>`;
    return;
  }

  container.innerHTML = teamLb.map((t, idx) => {
    const rank = idx + 1;
    let rankBadge = rank;
    if (rank === 1) rankBadge = '🥇';
    else if (rank === 2) rankBadge = '🥈';
    else if (rank === 3) rankBadge = '🥉';

    return `
      <div class="lb-row rank-${rank}" style="border-left: 4px solid ${t.color || '#38bdf8'};">
        <div class="lb-left" style="flex: 1;">
          <div class="lb-rank">${rankBadge}</div>
          <div style="font-size: 1.8rem; margin-right: 0.4rem;">${t.emoji || '🚩'}</div>
          <div style="flex: 1; overflow: hidden;">
            <div style="font-weight: 900; font-size: 1.05rem; color: ${t.color || '#fff'}; display: flex; align-items: center; gap: 0.4rem;">
              <span>${escapeHtml(t.name)}</span>
              <span style="font-size: 0.7rem; color: #94a3b8; font-weight: 700;">(${t.memberCount}명)</span>
            </div>
            <div style="display: flex; gap: 0.25rem; margin-top: 0.25rem; flex-wrap: wrap;">
              ${(t.members || []).map(m => `
                <span style="font-size: 0.7rem; background: rgba(15,23,42,0.8); border: 1px solid rgba(255,255,255,0.1); border-radius: 4px; padding: 0.05rem 0.3rem; color: #e2e8f0;">
                  ${m.avatar} ${escapeHtml(m.name.slice(0, 4))} (${m.altitude}m)
                </span>
              `).join('')}
            </div>
          </div>
        </div>
        <div class="lb-right" style="text-align: right;">
          <div style="font-size: 1.25rem; font-weight: 900; color: #38bdf8;">
            ${(t.totalAltitude || 0).toLocaleString()}m
          </div>
          <div style="font-size: 0.7rem; color: #94a3b8; font-weight: 700;">
            평균 ${(t.avgAltitude || 0).toLocaleString()}m
          </div>
        </div>
      </div>
    `;
  }).join('');
}

function renderTeamPodium(teamPodium) {
  const container = document.getElementById('podiumContainer');
  if (!container) return;
  const ordered = [teamPodium[1] || null, teamPodium[0] || null, teamPodium[2] || null];

  container.innerHTML = ordered.map((t, index) => {
    if (!t) return '<div class="podium-step" style="opacity: 0;"></div>';
    const rank = (index === 0) ? 2 : (index === 1) ? 1 : 3;

    return `
      <div class="podium-step p-${rank}" style="border-top: 4px solid ${t.color || '#38bdf8'};">
        <div class="podium-avatar">${t.emoji || '🚩'}</div>
        <div class="podium-name" style="color: ${t.color || '#fff'}; font-weight: 900;">${escapeHtml(t.name)}</div>
        <div class="podium-money" style="color: #38bdf8;">총 ${t.totalAltitude}m (평균 ${t.avgAltitude}m)</div>
        <div class="podium-pillar">${rank}</div>
      </div>
    `;
  }).join('');
}

function renderPodium(podium) {
  const container = document.getElementById('podiumContainer');
  const ordered = [podium[1] || null, podium[0] || null, podium[2] || null];

  container.innerHTML = ordered.map((p, index) => {
    if (!p) return '<div class="podium-step" style="opacity: 0;"></div>';
    const rank = (index === 0) ? 2 : (index === 1) ? 1 : 3;

    return `
      <div class="podium-step p-${rank}">
        <div class="podium-avatar">${p.avatar}</div>
        <div class="podium-name">${escapeHtml(p.name)}</div>
        <div class="podium-money" style="color: #38bdf8;">${p.altitude || 1000}m 도달</div>
        <div class="podium-pillar">${rank}</div>
      </div>
    `;
  }).join('');
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

  syncConfigWithServer();
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

  syncConfigWithServer();
}

function syncConfigWithServer() {
  if (currentRoomCode) {
    socket.emit('update-room-config', { code: currentRoomCode, config: currentConfig });
  }
}
