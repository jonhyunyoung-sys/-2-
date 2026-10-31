// ============================================================================
// DOOM 3D Quiz Fortress - Host Screen Controller
// Top-View Radar Map & Real-time Live Monitor
// ============================================================================

const socket = io();

let currentRoomCode = null;
let currentConfig = {
  gameType: 'doom',
  mode: 'race',
  timeLimitSeconds: 600,
  targetBalance: 10000,
  quizSetId: 'joseon-early',
  isTeamMode: false,
  doomSettings: {
    difficulty: 'normal',
    targetKills: 25,
    bossHealth: 1000,
    currentBossHealth: 1000,
    ammoGain: 40,
    healthGain: 25
  }
};

let playersList = [];
let currentLeaderboard = [];
let lastFinalReport = null;
let currentBossHealth = 1000;
let maxBossHealth = 1000;

// 24x24 Radar Map Reference (Matches doom-engine.js)
const MAP_W = 24;
const MAP_H = 24;
const RADAR_MAP = [
  [1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1],
  [1,0,0,0,0,0,1,0,0,0,0,0,1,0,0,0,0,0,1,0,0,0,0,1],
  [1,0,5,0,0,0,4,0,0,2,0,0,4,0,0,3,0,0,4,0,5,0,0,1],
  [1,0,0,0,0,0,1,0,0,2,0,0,1,0,0,3,0,0,1,0,0,0,0,1],
  [1,1,1,4,1,1,1,0,0,2,2,0,1,1,4,1,1,1,1,1,4,1,1,1],
  [1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1],
  [1,0,2,2,0,0,2,2,2,0,0,3,3,3,0,0,2,2,2,0,0,2,0,1],
  [1,0,2,0,0,0,0,0,2,0,0,3,0,3,0,0,2,0,0,0,0,2,0,1],
  [1,0,2,0,5,0,0,0,2,0,0,3,5,3,0,0,2,0,0,5,0,2,0,1],
  [1,0,2,2,4,2,2,0,2,0,0,3,4,3,0,0,2,0,2,4,2,2,0,1],
  [1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1],
  [1,1,1,0,0,1,1,1,1,4,1,1,1,1,4,1,1,1,1,0,0,1,1,1],
  [1,0,0,0,0,0,0,0,1,0,0,0,0,1,0,0,0,0,0,0,0,0,0,1],
  [1,0,3,3,0,0,3,0,1,0,5,0,0,1,0,3,0,0,3,3,0,0,0,1],
  [1,0,3,0,0,0,3,0,4,0,0,0,0,4,0,3,0,0,0,3,0,0,0,1],
  [1,0,3,0,0,0,3,0,1,0,0,0,0,1,0,3,0,0,0,3,0,0,0,1],
  [1,0,3,3,4,3,3,0,1,1,1,4,1,1,0,3,3,4,3,3,0,0,0,1],
  [1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1],
  [1,1,1,1,0,0,1,1,1,1,1,9,1,1,1,1,1,0,0,1,1,1,1,1],
  [1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1],
  [1,0,3,0,0,0,3,0,0,0,0,0,0,0,0,0,0,3,0,0,0,3,0,1],
  [1,0,0,0,5,0,0,0,0,0,0,0,0,0,0,0,0,0,0,5,0,0,0,1],
  [1,0,3,0,0,0,3,0,0,0,0,0,0,0,0,0,0,3,0,0,0,3,0,1],
  [1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1]
];

// Live Climber/Doom Player Positions
const livePlayers = {}; // id -> { x, y, angle, name, avatar, kills, score }

// Initialize Host Room
window.addEventListener('DOMContentLoaded', () => {
  const customCode = '311866'; // Default accessible code
  socket.emit('create-room', {
    customCode,
    config: currentConfig
  }, (res) => {
    if (res.success) {
      currentRoomCode = res.code;
      document.getElementById('roomCodeDisplay').innerText = res.code;
    } else {
      socket.emit('create-room', { config: currentConfig }, (res2) => {
        currentRoomCode = res2.code;
        document.getElementById('roomCodeDisplay').innerText = res2.code;
      });
    }
  });

  // Setup Quiz Set Selector
  const qSelect = document.getElementById('quizSetSelect');
  if (qSelect) {
    qSelect.addEventListener('change', (e) => {
      currentConfig.quizSetId = e.target.value;
      socket.emit('update-room-config', { code: currentRoomCode, config: currentConfig });
    });
  }

  // Start Radar Loop
  requestAnimationFrame(radarLoop);
});

// Socket Listeners
socket.on('player-joined', (p) => {
  if (!playersList.find(x => x.id === p.id)) {
    playersList.push(p);
  }
  renderLobby();
});

socket.on('player-left', ({ id }) => {
  playersList = playersList.filter(x => x.id !== id);
  delete livePlayers[id];
  renderLobby();
});

socket.on('leaderboard-updated', (data) => {
  const lb = Array.isArray(data) ? data : (data.leaderboard || []);
  currentLeaderboard = lb;
  playersList = lb;
  renderDoomLeaderboard();
});

socket.on('doom-player-sync', (p) => {
  livePlayers[p.id] = {
    ...p,
    lastSeen: Date.now()
  };
});

socket.on('doom-boss-update', ({ currentHealth, maxHealth }) => {
  currentBossHealth = currentHealth;
  maxBossHealth = maxHealth;
  updateBossHealthBar();
});

socket.on('game-ended', (report) => {
  lastFinalReport = report;
  if (report.leaderboard) currentLeaderboard = report.leaderboard;

  document.getElementById('inGameSection').style.display = 'none';
  document.getElementById('btnEndGame').style.display = 'none';
  document.getElementById('podiumSection').style.display = 'block';

  document.getElementById('endReasonText').innerText = report.reason;
  renderPodium(report.podium || report.leaderboard.slice(0, 3));

  if (typeof confetti === 'function') confetti({ particleCount: 150, spread: 80 });
});

// Lobby Functions
function renderLobby() {
  const grid = document.getElementById('lobbyPlayersGrid');
  const count = document.getElementById('playerCount');
  if (count) count.innerText = playersList.length;

  if (grid) {
    grid.innerHTML = playersList.map(p => `
      <div style="background: rgba(15, 23, 42, 0.85); border: 1px solid var(--border); border-radius: 12px; padding: 0.8rem; text-align: center; display: flex; flex-direction: column; align-items: center; position: relative;">
        ${p.isBot ? '<span style="position: absolute; top: 4px; right: 4px; font-size: 0.65rem; background: #312e81; color: #c7d2fe; padding: 0.1rem 0.3rem; border-radius: 4px;">BOT</span>' : ''}
        <div style="font-size: 2.2rem; margin-bottom: 0.3rem;">${p.avatar || '🧑‍🚀'}</div>
        <div style="font-weight: 800; font-size: 0.88rem; color: #fff; width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
          ${escapeHtml(p.name)}
        </div>
      </div>
    `).join('');
  }
}

function addBot() {
  socket.emit('add-bot', { code: currentRoomCode });
}

function removeBot() {
  const bot = playersList.find(p => p.isBot);
  if (bot) socket.emit('remove-bot', { code: currentRoomCode, botId: bot.id });
}

function setDoomDifficulty(diff) {
  ['easy', 'normal', 'hard', 'nightmare'].forEach(k => {
    const btn = document.getElementById(`diffBtn_${k}`);
    if (btn) btn.classList.toggle('active', k === diff);
  });
  const killTargets = { easy: 15, normal: 25, hard: 35, nightmare: 50 };
  currentConfig.doomSettings.difficulty = diff;
  currentConfig.doomSettings.targetKills = killTargets[diff] || 25;
  socket.emit('update-room-config', { code: currentRoomCode, config: currentConfig });
}

function startGame() {
  socket.emit('start-game', { code: currentRoomCode }, (res) => {
    if (res && res.success) {
      document.getElementById('lobbySection').style.display = 'none';
      document.getElementById('inGameSection').style.display = 'block';
      document.getElementById('btnEndGame').style.display = 'block';
    } else {
      alert(res ? res.error : '게임 시작 실패');
    }
  });
}

function endGameEarly() {
  if (confirm('게임을 지금 조기 종료하시겠습니까?')) {
    socket.emit('force-end-game', { code: currentRoomCode });
  }
}

function copyJoinLink() {
  const url = `${window.location.origin}/doom?gc=${currentRoomCode}`;
  navigator.clipboard.writeText(url).then(() => {
    alert('학생 참가 링크가 복사되었습니다:\n' + url);
  });
}

// Boss Health Bar
function updateBossHealthBar() {
  const bar = document.getElementById('bossHpBar');
  const text = document.getElementById('bossHpText');
  const pct = Math.max(0, Math.min(100, (currentBossHealth / maxBossHealth) * 100));
  if (bar) bar.style.width = `${pct}%`;
  if (text) text.innerText = `${currentBossHealth.toLocaleString()} / ${maxBossHealth.toLocaleString()} HP`;
}

// Leaderboard Table
function renderDoomLeaderboard() {
  const tbody = document.getElementById('doomLeaderboardList');
  if (!tbody) return;

  tbody.innerHTML = currentLeaderboard.map((p, idx) => {
    const rankBadge = idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : `${idx + 1}위`;
    return `
      <div class="leaderboard-row ${idx < 3 ? 'rank-' + (idx + 1) : ''}" style="display: grid; grid-template-columns: 45px 1fr 70px 70px; padding: 0.6rem 0.8rem; align-items: center; border-bottom: 1px solid rgba(255,255,255,0.06);">
        <span style="font-weight: 900; font-size: 1.1rem; text-align: center;">${rankBadge}</span>
        <span style="font-weight: 800; display: flex; align-items: center; gap: 0.4rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
          <span>${p.avatar || '🧑‍🚀'}</span>
          <span>${escapeHtml(p.name)}</span>
        </span>
        <span style="font-weight: 900; color: #ef4444; text-align: center;">💀 ${p.kills || 0}</span>
        <span style="font-weight: 800; color: #f59e0b; text-align: right;">${(p.score || 0).toLocaleString()}P</span>
      </div>
    `;
  }).join('');
}

// ----------------------------------------------------------------------------
// RADAR 2D TOP-VIEW MAP CANVAS
// ----------------------------------------------------------------------------
function radarLoop() {
  const canvas = document.getElementById('hostRadarCanvas');
  if (canvas && canvas.getContext) {
    const ctx = canvas.getContext('2d');
    const w = canvas.width;
    const h = canvas.height;
    const cellSize = w / MAP_W;

    ctx.fillStyle = '#030712';
    ctx.fillRect(0, 0, w, h);

    // 1. Draw Map Tiles
    for (let y = 0; y < MAP_H; y++) {
      for (let x = 0; x < MAP_W; x++) {
        const tile = RADAR_MAP[y][x];
        const rx = x * cellSize;
        const ry = y * cellSize;

        if (tile === 1) {
          ctx.fillStyle = '#1e293b'; // Tech wall
          ctx.fillRect(rx, ry, cellSize, cellSize);
        } else if (tile === 2) {
          ctx.fillStyle = '#334155'; // Stone
          ctx.fillRect(rx, ry, cellSize, cellSize);
        } else if (tile === 3) {
          ctx.fillStyle = '#450a0a'; // Hellfire
          ctx.fillRect(rx, ry, cellSize, cellSize);
        } else if (tile === 4) {
          ctx.fillStyle = '#eab308'; // Quiz Gate
          ctx.fillRect(rx, ry, cellSize, cellSize);
        } else if (tile === 5) {
          ctx.fillStyle = '#10b981'; // Quiz Station
          ctx.fillRect(rx, ry, cellSize, cellSize);
        } else if (tile === 9) {
          ctx.fillStyle = '#7e22ce'; // Boss Gate
          ctx.fillRect(rx, ry, cellSize, cellSize);
        } else {
          ctx.strokeStyle = 'rgba(255, 255, 255, 0.04)';
          ctx.strokeRect(rx, ry, cellSize, cellSize);
        }
      }
    }

    // 2. Draw Live Players (Dot + Direction Needle + Name Tag)
    Object.values(livePlayers).forEach(p => {
      const px = p.x * cellSize;
      const py = p.y * cellSize;

      ctx.save();
      ctx.translate(px, py);

      // Direction needle
      ctx.strokeStyle = '#38bdf8';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(Math.cos(p.angle || 0) * 12, Math.sin(p.angle || 0) * 12);
      ctx.stroke();

      // Player Dot
      ctx.fillStyle = '#0284c7';
      ctx.beginPath();
      ctx.arc(0, 0, 5, 0, Math.PI * 2);
      ctx.fill();

      // Name Label
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 9px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(p.name ? p.name.slice(0, 6) : '학생', 0, -8);

      ctx.restore();
    });
  }

  requestAnimationFrame(radarLoop);
}

// ----------------------------------------------------------------------------
// PODIUM & EXCEL ACHIEVEMENT LOGIC
// ----------------------------------------------------------------------------
function renderPodium(podium) {
  const container = document.getElementById('podiumContainer');
  if (!container || !podium || podium.length === 0) return;

  const p1 = podium[0];
  const p2 = podium[1];
  const p3 = podium[2];

  container.innerHTML = `
    ${p2 ? `
      <div class="podium-step podium-2" style="background: linear-gradient(to top, rgba(148, 163, 184, 0.3), rgba(148, 163, 184, 0.1)); border: 2px solid #94a3b8; height: 160px;">
        <div style="font-size: 2.4rem;">${p2.avatar || '🥈'}</div>
        <div style="font-weight: 900; font-size: 1.1rem; color: #fff;">${escapeHtml(p2.name)}</div>
        <div style="font-weight: 800; color: #94a3b8;">💀 ${p2.kills || 0}킬</div>
        <div class="podium-rank">2위</div>
      </div>
    ` : ''}

    ${p1 ? `
      <div class="podium-step podium-1" style="background: linear-gradient(to top, rgba(239, 68, 68, 0.35), rgba(245, 158, 11, 0.15)); border: 2px solid #ef4444; height: 210px;">
        <div style="font-size: 3rem;">${p1.avatar || '🥇'}</div>
        <div style="font-weight: 900; font-size: 1.3rem; color: #fff;">${escapeHtml(p1.name)}</div>
        <div style="font-weight: 900; color: #ef4444; font-size: 1.1rem;">💀 ${p1.kills || 0}킬 (${(p1.score || 0).toLocaleString()}P)</div>
        <div class="podium-rank">1위 (대악마 학살자)</div>
      </div>
    ` : ''}

    ${p3 ? `
      <div class="podium-step podium-3" style="background: linear-gradient(to top, rgba(217, 119, 6, 0.3), rgba(217, 119, 6, 0.1)); border: 2px solid #d97706; height: 130px;">
        <div style="font-size: 2.2rem;">${p3.avatar || '🥉'}</div>
        <div style="font-weight: 900; font-size: 1rem; color: #fff;">${escapeHtml(p3.name)}</div>
        <div style="font-weight: 800; color: #d97706;">💀 ${p3.kills || 0}킬</div>
        <div class="podium-rank">3위</div>
      </div>
    ` : ''}
  `;
}

// Achievement Modal
let currentAchievementSort = 'number';

function openAchievementModal() {
  const modal = document.getElementById('achievementModal');
  if (modal) modal.style.display = 'flex';
  renderAchievementTable();
}

function closeAchievementModal() {
  const modal = document.getElementById('achievementModal');
  if (modal) modal.style.display = 'none';
}

function setAchievementSort(sortType) {
  currentAchievementSort = sortType;
  ['number', 'rank', 'accuracy'].forEach(k => {
    const btn = document.getElementById(`achSortBy${k.charAt(0).toUpperCase() + k.slice(1)}Btn`);
    if (btn) btn.classList.toggle('active', k === sortType);
  });
  renderAchievementTable();
}

function renderAchievementTable() {
  const tbody = document.getElementById('achievementTableBody');
  if (!tbody) return;

  const lb = [...(lastFinalReport ? lastFinalReport.leaderboard : currentLeaderboard)];
  if (lb.length === 0) {
    tbody.innerHTML = `<tr><td colspan="10" style="padding: 2rem; color: #94a3b8;">참가한 학생 데이터가 없습니다.</td></tr>`;
    return;
  }

  // Pre-calculate rank map
  const rankMap = new Map();
  lb.forEach((p, idx) => rankMap.set(p.id, idx + 1));

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
    lb.sort((a, b) => (rankMap.get(a.id) || 999) - (rankMap.get(b.id) || 999));
  }

  tbody.innerHTML = lb.map(p => {
    const rank = rankMap.get(p.id) || '-';
    const sNoText = (p.studentNo != null && p.studentNo !== '') ? `${p.studentNo}번` : '-';
    const rankBadge = rank === 1 ? '🥇 1위' : rank === 2 ? '🥈 2위' : rank === 3 ? '🥉 3위' : `${rank}위`;
    return `
      <tr style="border-bottom: 1px solid rgba(255,255,255,0.06);">
        <td style="padding: 0.65rem 0.5rem; font-weight: 900; color: #38bdf8;">${sNoText}</td>
        <td style="padding: 0.65rem 0.5rem; text-align: left; font-weight: 800; color: #fff;">
          <span style="font-size: 1.15rem; margin-right: 0.25rem;">${p.avatar || '🧑‍🚀'}</span>
          ${escapeHtml(p.nickname || p.name)}
        </td>
        <td style="padding: 0.65rem 0.5rem; color: #94a3b8;">${p.teamName || '-'}</td>
        <td style="padding: 0.65rem 0.5rem; font-weight: 900; color: #ef4444;">${p.kills || 0}마리</td>
        <td style="padding: 0.65rem 0.5rem; font-weight: 900; color: #f59e0b;">${(p.score || 0).toLocaleString()}P</td>
        <td style="padding: 0.65rem 0.5rem; color: #10b981; font-weight: 800;">${p.correctCount || 0}</td>
        <td style="padding: 0.65rem 0.5rem; color: #ef4444; font-weight: 700;">${p.wrongCount || 0}</td>
        <td style="padding: 0.65rem 0.5rem; font-weight: 900; color: #38bdf8;">${p.accuracy || 0}%</td>
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

  const lb = lastFinalReport ? lastFinalReport.leaderboard : currentLeaderboard;
  if (lb.length === 0) {
    alert('내보낼 학생 성취도 데이터가 없습니다.');
    return;
  }

  const wb = XLSX.utils.book_new();

  // 1. Sheet 1: 출석번호순 정렬 (나이스 최적화)
  const sortedByNo = [...lb].sort((a, b) => {
    const aNo = (a.studentNo != null && a.studentNo !== '') ? Number(a.studentNo) : 999999;
    const bNo = (b.studentNo != null && b.studentNo !== '') ? Number(b.studentNo) : 999999;
    if (aNo !== bNo) return aNo - bNo;
    return (a.nickname || a.name || '').localeCompare(b.nickname || b.name || '', 'ko');
  });

  const sheet1Data = [
    ['출석번호', '이름(별명)', '소속 조', '최종 순위', '몬스터 처치 수', '최종 점수(P)', '맞힌 문제 수', '틀린 문제 수', '총 문제 수', '정답률(%)', '최대 연속정답(Streak)']
  ];

  sortedByNo.forEach(p => {
    const rank = lb.findIndex(item => item.id === p.id) + 1;
    const totalQ = p.totalQuestions || ((p.correctCount || 0) + (p.wrongCount || 0));
    sheet1Data.push([
      p.studentNo != null && p.studentNo !== '' ? p.studentNo : '',
      p.nickname || p.name,
      p.teamName || '-',
      rank,
      p.kills || 0,
      p.score || 0,
      p.correctCount || 0,
      p.wrongCount || 0,
      totalQ,
      p.accuracy != null ? p.accuracy : 0,
      p.maxStreak || p.streak || 0
    ]);
  });
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(sheet1Data), '학생별 성취도(출석번호순)');

  // 2. Sheet 2: 최종 랭킹 순위
  const sheet2Data = [
    ['순위', '출석번호', '이름(별명)', '소속 조', '몬스터 처치 수', '최종 점수(P)', '맞힌 문제 수', '틀린 문제 수', '정답률(%)', '최대 연속정답']
  ];
  lb.forEach((p, idx) => {
    sheet2Data.push([
      idx + 1,
      p.studentNo != null && p.studentNo !== '' ? p.studentNo : '',
      p.nickname || p.name,
      p.teamName || '-',
      p.kills || 0,
      p.score || 0,
      p.correctCount || 0,
      p.wrongCount || 0,
      p.accuracy != null ? p.accuracy : 0,
      p.maxStreak || p.streak || 0
    ]);
  });
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(sheet2Data), '최종 랭킹 순위');

  const now = new Date();
  const dateStr = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}_${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}`;
  const fileName = `배움날개_둠3D_성취도_${currentRoomCode}_${dateStr}.xlsx`;
  XLSX.writeFile(wb, fileName);
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str).replace(/[&<>"']/g, s => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[s]);
}
