// Don't Look Down - 2D Platformer Engine & Multiplayer Client
const socket = io();

// Canvas & Context
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

function resizeCanvas() {
  const w = window.visualViewport ? window.visualViewport.width : window.innerWidth;
  const h = window.visualViewport ? window.visualViewport.height : window.innerHeight;
  canvas.width = w;
  canvas.height = h;
}
window.addEventListener('resize', resizeCanvas);
if (window.visualViewport) {
  window.visualViewport.addEventListener('resize', resizeCanvas);
}
window.addEventListener('orientationchange', () => {
  setTimeout(resizeCanvas, 150);
});
resizeCanvas();

// Game World Constants
const WORLD_WIDTH = 900;
const WORLD_HEIGHT = 10000; // 0m to 1000m (1m = 10px)
const GRAVITY = 0.30;
const FALL_GRAVITY = 0.22; // 하강 시 더욱 부드러운 중력
const MAX_FALL_SPEED = 4.8; // 천천히 떨어지는 글라이딩 최대 낙하 속도
const JUMP_FORCE = -8.8;
const DOUBLE_JUMP_FORCE = -8.2;
const BOUNCE_FORCE = -15.5;

// URL Params & Room Info
const urlParams = new URLSearchParams(window.location.search);
const roomCode = urlParams.get('gc') || urlParams.get('code') || '311866';
const requestedName = urlParams.get('name') || ('등반러_' + Math.floor(Math.random() * 900 + 100));
const requestedAvatar = urlParams.get('avatar') || '🐱';

// Player State with Dynamic Animation & Squashing
const player = {
  x: WORLD_WIDTH / 2 - 16,
  y: WORLD_HEIGHT - 60,
  vx: 0,
  vy: 0,
  width: 32,
  height: 36,
  avatar: requestedAvatar,
  name: requestedName,
  energy: 1500,
  altitude: 0,
  summit: 1,
  isGrounded: false,
  canDoubleJump: false,
  isIce: false,
  streak: 0,
  lastGroundedY: WORLD_HEIGHT - 60,
  isFallingFast: false,
  facingLeft: false,

  // Animation & Squash/Stretch State
  walkCycle: 0,
  tilt: 0,
  scaleX: 1.0,
  scaleY: 1.0,
  wasGrounded: false,
  stepTimer: 0,
  auraTimer: 0
};

let otherPlayers = {}; // id -> player ghost
let platforms = [];
let particles = [];
let stars = [];
let lasers = [];
let gems = []; // Floating collectible energy gems
let updrafts = []; // Wind gust elevators
let backgroundClouds = []; // Parallax fluffy clouds
let ambientParticles = []; // Weather particles (snow, embers, spores)
let shootingStars = []; // High altitude shooting stars
let jumpRings = []; // Shockwave rings
let currentCameraX = 0; // Dynamic horizontal screen-tracking camera
let currentCameraY = 0;

// Input Keys
const keys = {
  left: false,
  right: false,
  up: false
};

let isQuestionModalOpen = false;
let myPlayerId = null;
let currentQuestion = null;
let syncInterval = null;
let roomConfig = null;
let teams = {};
let isTeamMode = false;
let myTeamId = null;
let currentLeaderboard = [];
let currentTeamLeaderboard = [];

function applyRoomConfig() {
  if (!roomConfig || !roomConfig.dldSettings) return;
  const s = roomConfig.dldSettings;

  // Update HUD Difficulty Badge
  const badge = document.getElementById('hudDiffBadge');
  if (badge) {
    const diffNames = {
      easy: '🟢 쉬움 (+1,500⚡)',
      normal: '🟡 보통 (+1,000⚡)',
      hard: '🔴 어려움 (+600⚡)',
      extreme: '🔥 지옥 (+400⚡)',
      custom: `⚙️ 설정 (+${(s.energyGain || 1000).toLocaleString()}⚡ | 점프 ${s.jumpCost || 15})`
    };
    badge.innerText = diffNames[s.difficulty] || `⚡ +${(s.energyGain || 1000).toLocaleString()}`;
    badge.style.display = 'block';
  }

  // Regenerate platforms/items with updated spawn rates
  generatePlatforms();
}

// Initialize World & Game
window.addEventListener('DOMContentLoaded', () => {
  generateStars();
  generateParallaxClouds();
  generatePlatforms();
  initCamera();
  joinDldRoom();
  setupControls();

  // Backdrop click to close question modal
  const qModal = document.getElementById('dldQuestionModal');
  if (qModal) {
    qModal.addEventListener('click', (e) => {
      if (e.target === qModal) closeQuestionModal();
    });
  }

  requestAnimationFrame(gameLoop);
});

// Generate atmospheric stars for high altitudes
function generateStars() {
  stars = [];
  for (let i = 0; i < 240; i++) {
    stars.push({
      x: Math.random() * (WORLD_WIDTH + 600) - 300,
      y: Math.random() * 3200, // summits 5, 6
      size: Math.random() * 2.2 + 0.6,
      twinkle: Math.random() * Math.PI * 2,
      speed: Math.random() * 0.05 + 0.02
    });
  }
}

// Generate Parallax Floating Clouds for Mid-High Altitudes
function generateParallaxClouds() {
  backgroundClouds = [];
  for (let i = 0; i < 30; i++) {
    backgroundClouds.push({
      x: Math.random() * (WORLD_WIDTH + 400) - 200,
      y: 2000 + Math.random() * 4500, // summits 3, 4, 5
      width: 140 + Math.random() * 120,
      height: 45 + Math.random() * 35,
      speed: 0.15 + Math.random() * 0.25,
      opacity: 0.25 + Math.random() * 0.35
    });
  }
}

// Generate Everyday Life Object Platforms with Multiple Angles (-25deg to +25deg)
function generatePlatforms() {
  platforms = [];
  lasers = [];
  gems = [];
  updrafts = [];

  const gemRate = (roomConfig && roomConfig.dldSettings && roomConfig.dldSettings.gemRate !== undefined)
    ? roomConfig.dldSettings.gemRate
    : 0.45;
  const updraftRate = (roomConfig && roomConfig.dldSettings && roomConfig.dldSettings.updraftRate !== undefined)
    ? roomConfig.dldSettings.updraftRate
    : 0.10;

  // Ground base: Huge Solid Study Room Floor
  platforms.push({
    x: 0,
    y: WORLD_HEIGHT - 20,
    width: WORLD_WIDTH,
    height: 60,
    type: 'floor',
    angle: 0,
    summit: 1,
    bounceScaleY: 1.0
  });

  let curY = WORLD_HEIGHT - 95;
  let curX = WORLD_WIDTH / 2 - 80;

  // Everyday life object types distributed across the 1,000m climb
  // 1. desk (책상/공부 테이블)
  // 2. soccer (축구공/스포츠볼 - 슈퍼 바운스)
  // 3. phone (스마트폰/태블릿)
  // 4. pizza (피자 조각 - 경사 슬로프)
  // 5. skateboard (스케이트보드 - 스피드 롤링)
  // 6. sneaker (에어 스니커즈 운동화 - 쿠션 바운스)
  // 7. books (두꺼운 교과서 더미)
  // 8. coffee (커피 머그컵 & 도넛)
  // 9. gamepad (휴대용 게임기/조이콘)
  // 10. clock (빈티지 자명종 시계)

  const objectPalette = [
    'desk', 'soccer', 'phone', 'pizza', 'skateboard',
    'sneaker', 'books', 'coffee', 'gamepad', 'clock'
  ];

  while (curY > 100) {
    const altitude = Math.floor((WORLD_HEIGHT - curY) / 10);
    let summit = 1;
    if (altitude >= 850) summit = 6;
    else if (altitude >= 680) summit = 5;
    else if (altitude >= 500) summit = 4;
    else if (altitude >= 350) summit = 3;
    else if (altitude >= 200) summit = 2;

    // Pick everyday object type
    const pType = objectPalette[Math.floor(Math.random() * objectPalette.length)];

    let pWidth = 110;
    let pHeight = 22;
    let pAngle = 0; // In radians

    // Custom dimensions & angles by object type
    if (pType === 'desk') {
      pWidth = 130 + Math.random() * 40;
      pHeight = 24;
      pAngle = (Math.random() < 0.45) ? (Math.random() - 0.5) * 0.22 : 0; // subtle slope
    } else if (pType === 'soccer') {
      pWidth = 75 + Math.random() * 15;
      pHeight = 32;
      pAngle = (Math.random() - 0.5) * 0.25;
    } else if (pType === 'phone') {
      pWidth = 100 + Math.random() * 30;
      pHeight = 20;
      pAngle = (Math.random() - 0.5) * 0.35; // tilted gadget
    } else if (pType === 'pizza') {
      pWidth = 90 + Math.random() * 30;
      pHeight = 20;
      pAngle = (Math.random() < 0.5 ? 1 : -1) * (0.15 + Math.random() * 0.22); // steep tasty wedge
    } else if (pType === 'skateboard') {
      pWidth = 95 + Math.random() * 25;
      pHeight = 18;
      pAngle = (Math.random() - 0.5) * 0.38; // dynamic skate ramp
    } else if (pType === 'sneaker') {
      pWidth = 90 + Math.random() * 25;
      pHeight = 26;
      pAngle = (Math.random() - 0.5) * 0.26;
    } else if (pType === 'books') {
      pWidth = 105 + Math.random() * 35;
      pHeight = 24;
      pAngle = (Math.random() < 0.5) ? (Math.random() - 0.5) * 0.24 : 0;
    } else if (pType === 'coffee') {
      pWidth = 85 + Math.random() * 20;
      pHeight = 24;
      pAngle = (Math.random() - 0.5) * 0.18;
    } else if (pType === 'gamepad') {
      pWidth = 105 + Math.random() * 30;
      pHeight = 22;
      pAngle = (Math.random() - 0.5) * 0.28;
    } else if (pType === 'clock') {
      pWidth = 85 + Math.random() * 20;
      pHeight = 28;
      pAngle = (Math.random() - 0.5) * 0.22;
    }

    // Step spacing
    const yStep = 75 + Math.random() * 45;
    const xOffset = (Math.random() - 0.5) * 320;
    curX = Math.max(45, Math.min(WORLD_WIDTH - pWidth - 45, curX + xOffset));
    curY -= yStep;

    const isMoving = (Math.random() < 0.25 && (pType === 'skateboard' || pType === 'gamepad' || pType === 'phone'));

    const plat = {
      x: curX,
      y: curY,
      width: pWidth,
      height: pHeight,
      type: pType,
      angle: pAngle,
      summit: summit,
      vx: isMoving ? (Math.random() < 0.5 ? 2.0 : -2.0) : 0,
      origX: curX,
      bounceScaleY: 1.0,
      glowTimer: Math.random() * Math.PI * 2
    };
    platforms.push(plat);

    // Floating Collectible Energy Gem above platform
    if (Math.random() < gemRate && curY > 120) {
      const gemColors = {
        1: '#f97316', // Ruby
        2: '#06b6d4', // Cyan Pearl
        3: '#10b981', // Emerald
        4: '#ec4899', // Berry Crystal
        5: '#38bdf8', // Sapphire
        6: '#eab308'  // Cosmic Star
      };
      gems.push({
        x: curX + pWidth / 2 - 11,
        y: curY - (42 + Math.random() * 20),
        width: 22,
        height: 22,
        collected: false,
        bobPhase: Math.random() * Math.PI * 2,
        color: gemColors[summit] || '#f59e0b',
        summit: summit
      });
    }

    // Updraft fans periodically
    if (Math.random() < updraftRate && updrafts.length < 5) {
      updrafts.push({
        x: curX + pWidth / 2 - 30,
        y: curY - 150,
        width: 60,
        height: 150
      });
    }

    // Summit transition resting platform (Big Study Desk Lounge)
    if (altitude % 160 < 10) {
      platforms.push({
        x: (WORLD_WIDTH - 320) / 2,
        y: curY,
        width: 320,
        height: 28,
        type: 'summit-rest',
        angle: 0,
        summit: summit,
        bounceScaleY: 1.0,
        glowTimer: 0
      });
    }
  }

  // 1,000m Peak Golden Study Altar with Giant Trophy
  platforms.push({
    x: (WORLD_WIDTH - 440) / 2,
    y: 50,
    width: 440,
    height: 40,
    type: 'peak',
    angle: 0,
    summit: 6,
    bounceScaleY: 1.0,
    glowTimer: 0
  });
}

// Join Socket Game Room
let hasJoinedOnce = false;
function joinDldRoom() {
  socket.emit('join-room', {
    code: roomCode,
    name: player.name,
    avatar: player.avatar
  }, (res) => {
    if (!res.success) {
      alert(res.error || '게임 참가 실패');
      return;
    }
    myPlayerId = res.playerId;
    hasJoinedOnce = true;
    if (res.config) {
      roomConfig = res.config;
      applyRoomConfig();
    }
    if (res.teams) teams = res.teams;
    if (res.isTeamMode !== undefined) isTeamMode = res.isTeamMode;
    if (res.player) {
      player.energy = res.player.energy || 1500;
      if (res.player.teamId) myTeamId = res.player.teamId;
    }
    updateHUD();

    // Request first question
    if (res.currentQuestion) {
      currentQuestion = res.currentQuestion;
    }

    // Start sync broadcast loop (60ms)
    if (syncInterval) clearInterval(syncInterval);
    syncInterval = setInterval(broadcastMyPosition, 60);
  });

  // Re-join the room automatically after a network drop / mobile tab sleep,
  // otherwise this socket would miss the host's "start" broadcast.
  socket.on('connect', () => {
    if (!hasJoinedOnce || !myPlayerId) return;
    socket.emit('join-room', {
      code: roomCode,
      name: player.name,
      avatar: player.avatar,
      playerId: myPlayerId
    }, () => {});
  });

  // Listeners
  socket.on('dld-player-sync', (p) => {
    if (p.id === myPlayerId) return;
    otherPlayers[p.id] = {
      ...p,
      lastSeen: Date.now()
    };
    updateClimbersHUD();
  });

  socket.on('dld-player-fell', ({ name, fallMeters }) => {
    if (fallMeters >= 40) {
      window.soundEngine.playWrong();
    }
  });

  socket.on('new-question', (q) => {
    currentQuestion = q;
  });

  // Host updates difficulty or balance
  socket.on('room-config-updated', (cfg) => {
    roomConfig = cfg;
    applyRoomConfig();
  });

  // Host starts game: Reset all players to 0m start!
  socket.on('game-started', (data) => {
    if (data && data.config) {
      roomConfig = data.config;
      applyRoomConfig();
    }
    resetToStart();
  });

  // Team updates from host
  socket.on('teams-updated', (data) => {
    if (data.isTeamMode !== undefined) isTeamMode = !!data.isTeamMode;
    if (data.teams) teams = data.teams;
    if (data.players) {
      const me = data.players.find(p => p.id === myPlayerId || p.name === player.name);
      if (me) myTeamId = me.teamId;
      data.players.forEach(p => {
        if (otherPlayers[p.id]) otherPlayers[p.id].teamId = p.teamId;
      });
    }
    updateHUD();
  });

  socket.on('game-ended', (report) => {
    showResultModal(report);
  });

  socket.on('leaderboard-updated', (data) => {
    const lb = Array.isArray(data) ? data : (data.leaderboard || []);
    const teamLb = data.teamLeaderboard || [];
    if (data.isTeamMode !== undefined) isTeamMode = !!data.isTeamMode;
    currentLeaderboard = lb;
    currentTeamLeaderboard = teamLb;

    const me = lb.find(p => p.id === myPlayerId || p.name === player.name);
    if (me && me.teamId) myTeamId = me.teamId;

    updateClimbersFromLeaderboard(lb);
    updateHUD();
  });
}

// Reset everything to the 0m starting line when host clicks Start Game
function resetToStart() {
  // 0. A new round begins: hide the previous result screen and resume play
  gameEnded = false;
  const resultModal = document.getElementById('dldVictoryModal');
  if (resultModal) resultModal.style.display = 'none';
  if (!syncInterval && myPlayerId) syncInterval = setInterval(broadcastMyPosition, 60);

  // 1. Instantly teleport player back to the 0m start line
  player.x = WORLD_WIDTH / 2 - player.width / 2;
  player.y = WORLD_HEIGHT - 60;
  player.vx = 0;
  player.vy = 0;
  player.altitude = 0;
  player.summit = 1;
  player.energy = 1500;
  player.streak = 0;
  player.isGrounded = true;
  player.wasGrounded = true;
  player.lastGroundedY = WORLD_HEIGHT - 60;
  player.isFallingFast = false;
  player.canDoubleJump = false;
  player.scaleX = 1.0;
  player.scaleY = 1.0;
  player.tilt = 0;

  // 2. Release any held inputs & close the quiz modal
  keys.left = false;
  keys.right = false;
  keys.up = false;
  try { closeQuestionModal(); } catch (e) {}

  // 3. Snap camera instantly (no smooth sliding from the old height)
  initCamera();

  // 4. Reset world state: gems, moving platforms, effects, stale ghosts
  for (const g of gems) g.collected = false;
  for (const p of platforms) {
    if (p.origX !== undefined) p.x = p.origX;
    p.bounceScaleY = 1.0;
  }
  particles.length = 0;
  jumpRings.length = 0;
  otherPlayers = {};

  // 5. Tell the server/other clients our fresh position immediately
  try { broadcastMyPosition(); } catch (e) {}

  // 6. Feedback (never allowed to break the reset)
  try { updateHUD(); } catch (e) {}
  try { updateClimbersHUD(); } catch (e) {}
  try { showStartGameToast(); } catch (e) {}
  try { window.soundEngine.playWin(); } catch (e) {}
}

function showStartGameToast() {
  const alertEl = document.getElementById('fallAlert');
  if (!alertEl) return;
  alertEl.style.background = 'linear-gradient(135deg, #0284c7, #6366f1)';
  alertEl.style.boxShadow = '0 0 40px rgba(99, 102, 241, 0.9)';
  alertEl.innerText = '🚀 호스트가 게임을 시작했습니다! 0m부터 출발!';
  alertEl.style.display = 'block';
  setTimeout(() => {
    alertEl.style.display = 'none';
    alertEl.style.background = 'rgba(239, 68, 68, 0.92)';
    alertEl.style.boxShadow = '0 0 35px rgba(239, 68, 68, 0.8)';
  }, 2500);
}

function initCamera() {
  const pCenterX = player.x + player.width / 2;
  if (canvas.width < WORLD_WIDTH) {
    currentCameraX = Math.min(0, Math.max(canvas.width - WORLD_WIDTH, canvas.width / 2 - pCenterX));
  } else {
    currentCameraX = (canvas.width - WORLD_WIDTH) / 2;
  }
  currentCameraY = canvas.height * 0.65 - player.y;
}

function broadcastMyPosition() {
  if (!myPlayerId) return;
  socket.emit('dld-player-move', {
    code: roomCode,
    playerId: myPlayerId,
    x: Math.round(player.x),
    y: Math.round(player.y),
    vx: player.vx.toFixed(1),
    vy: player.vy.toFixed(1),
    altitude: player.altitude,
    energy: Math.round(player.energy),
    summit: player.summit,
    isGrounded: player.isGrounded
  });
}

// Keyboard & Touch Setup
function setupControls() {
  window.addEventListener('keydown', (e) => {
    if (isQuestionModalOpen) {
      if (e.key === 'Escape') closeQuestionModal();
      if (['1', '2', '3', '4'].includes(e.key)) {
        submitDldAnswer(parseInt(e.key) - 1);
      }
      return;
    }

    if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') {
      keys.left = true;
      player.facingLeft = true;
    }
    if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') {
      keys.right = true;
      player.facingLeft = false;
    }
    if (e.key === 'ArrowUp' || e.key === 'w' || e.key === 'W' || e.key === ' ') {
      e.preventDefault();
      tryJump();
    }
    if (e.key === 'q' || e.key === 'Q') {
      openQuestionModal();
    }
  });

  window.addEventListener('keyup', (e) => {
    if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') keys.left = false;
    if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') keys.right = false;
  });

  // Touch button listeners with touch & mouse hold support
  const btnL = document.getElementById('btnTouchLeft');
  const btnR = document.getElementById('btnTouchRight');
  const btnJ = document.getElementById('btnTouchJump');

  const bindHoldButton = (btn, onStart, onEnd) => {
    if (!btn) return;

    const start = (e) => {
      e.preventDefault();
      btn.classList.add('active');
      onStart();
    };

    const end = (e) => {
      e.preventDefault();
      btn.classList.remove('active');
      onEnd();
    };

    btn.addEventListener('touchstart', start, { passive: false });
    btn.addEventListener('touchend', end, { passive: false });
    btn.addEventListener('touchcancel', end, { passive: false });

    btn.addEventListener('mousedown', start);
    btn.addEventListener('mouseup', end);
    btn.addEventListener('mouseleave', end);
  };

  bindHoldButton(btnL, () => {
    keys.left = true;
    player.facingLeft = true;
  }, () => {
    keys.left = false;
  });

  bindHoldButton(btnR, () => {
    keys.right = true;
    player.facingLeft = false;
  }, () => {
    keys.right = false;
  });

  if (btnJ) {
    const tapJump = (e) => {
      e.preventDefault();
      btnJ.classList.add('active');
      tryJump();
      setTimeout(() => btnJ.classList.remove('active'), 120);
    };
    btnJ.addEventListener('touchstart', tapJump, { passive: false });
    btnJ.addEventListener('mousedown', tapJump);
  }
}

function tryJump() {
  if (isQuestionModalOpen) return;

  const jumpCost = (roomConfig && roomConfig.dldSettings && roomConfig.dldSettings.jumpCost) || 15;
  const doubleJumpCost = jumpCost * 2;

  // Single jump
  if (player.isGrounded) {
    if (player.energy >= jumpCost) {
      player.vy = JUMP_FORCE;
      player.isGrounded = false;
      player.canDoubleJump = true;
      player.energy -= jumpCost;

      // Stretch animation on jump
      player.scaleX = 0.72;
      player.scaleY = 1.36;

      window.soundEngine.playClick();
      createJumpDust(player.x + 16, player.y + player.height);
      createJumpRing(player.x + 16, player.y + player.height, '#38bdf8');
    } else {
      showEnergyDepleted();
    }
  } 
  // Double Jump (Gimkit's essential mechanic!)
  else if (player.canDoubleJump) {
    if (player.energy >= doubleJumpCost) {
      player.vy = DOUBLE_JUMP_FORCE;
      player.canDoubleJump = false;
      player.energy -= doubleJumpCost;

      // Extreme stretch on double jump
      player.scaleX = 0.66;
      player.scaleY = 1.45;

      window.soundEngine.playBuy();
      createDoubleJumpPuff(player.x + 16, player.y + player.height);
      createJumpRing(player.x + 16, player.y + player.height, '#f59e0b');
    } else {
      showEnergyDepleted();
    }
  }
}

function showEnergyDepleted() {
  window.soundEngine.playWrong();
  const hudTxt = document.getElementById('hudEnergyText');
  hudTxt.style.color = '#ef4444';
  hudTxt.innerText = '⚡ 에너지 고갈! [Q]를 눌러 충전!';
  setTimeout(() => {
    hudTxt.style.color = '#ffffff';
  }, 1500);
}

// Particle & Shockwave effects
function createJumpDust(x, y) {
  for (let i = 0; i < 7; i++) {
    particles.push({
      x, y,
      vx: (Math.random() - 0.5) * 4,
      vy: Math.random() * -2,
      radius: Math.random() * 3.5 + 2,
      color: 'rgba(255, 255, 255, 0.7)',
      life: 20
    });
  }
}

function createLandingDust(x, y) {
  for (let i = 0; i < 10; i++) {
    particles.push({
      x, y,
      vx: (Math.random() - 0.5) * 6,
      vy: -Math.random() * 2.5,
      radius: Math.random() * 4 + 2,
      color: 'rgba(226, 232, 240, 0.75)',
      life: 22
    });
  }
}

function createRunDust(x, y) {
  particles.push({
    x, y,
    vx: (player.facingLeft ? 1 : -1) * (Math.random() * 1.5 + 0.5),
    vy: -Math.random() * 1.2,
    radius: Math.random() * 2.5 + 1.5,
    color: 'rgba(255, 255, 255, 0.5)',
    life: 14
  });
}

function createJumpRing(x, y, color) {
  jumpRings.push({
    x, y,
    radius: 4,
    maxRadius: 28,
    color: color || '#38bdf8',
    opacity: 0.9,
    life: 16
  });
}

function createDoubleJumpPuff(x, y) {
  for (let i = 0; i < 14; i++) {
    particles.push({
      x, y,
      vx: (Math.random() - 0.5) * 5.5,
      vy: (Math.random() - 0.5) * 4.5,
      radius: Math.random() * 4.5 + 2,
      color: 'rgba(56, 189, 248, 0.85)',
      life: 26
    });
  }
}

function createGemSparkles(x, y, color) {
  for (let i = 0; i < 16; i++) {
    const angle = Math.random() * Math.PI * 2;
    const spd = Math.random() * 4.5 + 1.5;
    particles.push({
      x, y,
      vx: Math.cos(angle) * spd,
      vy: Math.sin(angle) * spd,
      radius: Math.random() * 3.5 + 2,
      color: color || '#fef08a',
      life: 28
    });
  }
}

// Physics Update with Squash/Stretch & Interactive Objects
function updatePhysics() {
  if (typeof gameEnded !== 'undefined' && gameEnded) {
    player.vx = 0;
    return;
  }

  // Self-heal modal flag if modal was closed
  const modalEl = document.getElementById('dldQuestionModal');
  if (modalEl && modalEl.style.display === 'none') {
    isQuestionModalOpen = false;
  }

  if (isQuestionModalOpen) {
    player.vx = 0;
    return;
  }

  // Horizontal acceleration (Enhanced air control when floating/falling)
  const maxSpeed = (player.energy > 0) ? 5.2 : 2.2;
  const accel = player.isGrounded ? 0.85 : 0.95;

  if (keys.left) player.vx -= accel;
  if (keys.right) player.vx += accel;

  // Friction
  const friction = player.isIce ? 0.97 : 0.82;
  player.vx *= friction;

  // Clamp horizontal speed
  player.vx = Math.max(-maxSpeed, Math.min(maxSpeed, player.vx));
  player.x += player.vx;

  // Running Animation & Dust
  if (Math.abs(player.vx) > 0.4 && player.isGrounded) {
    player.walkCycle += 0.28;
    player.tilt += ((player.vx * 0.042) - player.tilt) * 0.25;
    player.stepTimer++;
    if (player.stepTimer % 4 === 0) {
      createRunDust(player.x + 16, player.y + player.height);
    }
  } else {
    player.tilt += (0 - player.tilt) * 0.18;
  }

  // Smoothly restore squash & stretch scales back to 1.0 (Spring Damping)
  player.scaleX += (1.0 - player.scaleX) * 0.16;
  player.scaleY += (1.0 - player.scaleY) * 0.16;

  // Solid World Boundaries (Smooth & Guaranteed Free from Freeze/Stuck Bug)
  const worldMinX = 14;
  const worldMaxX = WORLD_WIDTH - player.width - 14;

  if (player.x < worldMinX) {
    player.x = worldMinX;
    player.vx = Math.max(0, player.vx);
  }
  if (player.x > worldMaxX) {
    player.x = worldMaxX;
    player.vx = Math.min(0, player.vx);
  }

  // Vertical physics with slow, gentle falling & max terminal velocity
  const currentGrav = (player.vy > 0) ? FALL_GRAVITY : GRAVITY;
  player.vy += currentGrav;

  // Cap maximum falling speed so player gently glides down
  if (player.vy > MAX_FALL_SPEED) {
    player.vy = MAX_FALL_SPEED;
  }
  player.y += player.vy;

  // Energy drain when running
  if (Math.abs(player.vx) > 0.5 && player.energy > 0) {
    player.energy = Math.max(0, player.energy - 0.05);
  }

  // Store previous ground state for landing detection
  player.wasGrounded = player.isGrounded;
  player.isGrounded = false;
  player.isIce = false;

  const pFootX = player.x + player.width / 2;
  const pBottomY = player.y + player.height;

  // Solid & 100% Reliable Platform Collision (Zero Penetration / Zero Freeze)
  for (const p of platforms) {
    // Update moving platform
    if (p.vx) {
      p.x += p.vx;
      if (p.x < p.origX - 90 || p.x > p.origX + 90) p.vx *= -1;
    }

    // Restore platform bounce deformation
    if (p.bounceScaleY < 1.0) {
      p.bounceScaleY += (1.0 - p.bounceScaleY) * 0.14;
    }

    // Robust One-Way Platform Landing from above
    if (
      player.vy >= 0 &&
      player.x + player.width > p.x &&
      player.x < p.x + p.width &&
      pBottomY >= p.y &&
      (pBottomY - player.vy) <= p.y + 14
    ) {
      player.y = p.y - player.height;
      player.vy = 0;
      player.isGrounded = true;
      player.canDoubleJump = false;

      // Landing Squash & Dust Event
      if (!player.wasGrounded) {
        player.scaleX = 1.34;
        player.scaleY = 0.66;
        createLandingDust(pFootX, p.y);
      }

      // Object-Specific Behaviors
      // 1. Soccer Ball (⚽ Super Bouncy Trampoline!)
      if (p.type === 'soccer') {
        player.vy = BOUNCE_FORCE;
        player.isGrounded = false;
        player.canDoubleJump = true;
        p.bounceScaleY = 0.35;
        player.scaleX = 0.68;
        player.scaleY = 1.48;
        window.soundEngine.playBuy();
        createDoubleJumpPuff(pFootX, p.y);
      }
      // 2. Sneaker (👟 Cushion Air-Sole Bounce)
      else if (p.type === 'sneaker') {
        player.vy = JUMP_FORCE * 1.18;
        player.isGrounded = false;
        player.canDoubleJump = true;
        p.bounceScaleY = 0.52;
        window.soundEngine.playClick();
        createDoubleJumpPuff(pFootX, p.y);
      }
      // 3. Skateboard (🛹 Dynamic Skate Boost)
      else if (p.type === 'skateboard') {
        const rollDir = player.facingLeft ? -1.2 : 1.2;
        player.vx = Math.max(-6.5, Math.min(6.5, player.vx + rollDir));
      }
      // 4. Pizza Slice (🍕 Cheese Soft Landing)
      else if (p.type === 'pizza') {
        p.bounceScaleY = 0.7;
      }

      // Carry player on moving platform
      if (p.vx) {
        player.x += p.vx;
      }

      // Check fall penalty
      const landedAlt = Math.floor((WORLD_HEIGHT - player.y) / 10);
      const droppedMeters = Math.floor((WORLD_HEIGHT - player.lastGroundedY) / 10) - landedAlt;

      if (droppedMeters >= 35) {
        socket.emit('dld-fall-event', {
          code: roomCode,
          playerId: myPlayerId,
          fallMeters: droppedMeters,
          fromAlt: Math.floor((WORLD_HEIGHT - player.lastGroundedY) / 10),
          toAlt: landedAlt
        });
        showFallToast(droppedMeters);
      }

      player.lastGroundedY = player.y;
    }
  }

  // Floating Gem Collection
  const pCenterX = player.x + player.width / 2;
  const pCenterY = player.y + player.height / 2;
  for (const g of gems) {
    if (!g.collected) {
      g.bobPhase += 0.05;
      const gY = g.y + Math.sin(g.bobPhase) * 5;
      const dist = Math.hypot(pCenterX - (g.x + 11), pCenterY - (gY + 11));
      if (dist < 28) {
        g.collected = true;
        player.energy = Math.min(3000, player.energy + 50);
        createGemSparkles(g.x + 11, gY + 11, g.color);
        window.soundEngine.playBuy();
        updateHUD();
      }
    }
  }

  // Updraft Wind Gust Check
  for (const u of updrafts) {
    if (
      player.x + player.width > u.x &&
      player.x < u.x + u.width &&
      player.y + player.height > u.y &&
      player.y < u.y + u.height
    ) {
      player.vy = Math.min(player.vy, -7.8);
      player.isGrounded = false;
      player.canDoubleJump = true;
      if (Math.random() < 0.35) {
        particles.push({
          x: u.x + Math.random() * u.width,
          y: u.y + u.height,
          vx: (Math.random() - 0.5) * 1.5,
          vy: -Math.random() * 6 - 4,
          radius: Math.random() * 3 + 1.5,
          color: 'rgba(56, 189, 248, 0.7)',
          life: 18
        });
      }
    }
  }

  // Fall Fast Detection
  if (player.vy >= 4.0 && (WORLD_HEIGHT - player.y) / 10 < (WORLD_HEIGHT - player.lastGroundedY) / 10 - 20) {
    player.isFallingFast = true;
  } else {
    player.isFallingFast = false;
  }

  // Altitude update
  player.altitude = Math.max(0, Math.min(1000, Math.floor((WORLD_HEIGHT - player.y) / 10)));

  // Summit Determination
  let newSummit = 1;
  if (player.altitude >= 850) newSummit = 6;
  else if (player.altitude >= 680) newSummit = 5;
  else if (player.altitude >= 500) newSummit = 4;
  else if (player.altitude >= 350) newSummit = 3;
  else if (player.altitude >= 200) newSummit = 2;

  if (newSummit !== player.summit) {
    player.summit = newSummit;
    socket.emit('dld-reach-summit', { code: roomCode, playerId: myPlayerId, summit: newSummit });
    window.soundEngine.playBuy();
  }

  // Reach Peak Check (1,000m)
  if (player.altitude >= 995 && player.y <= 100) {
    socket.emit('dld-reach-peak', { code: roomCode, playerId: myPlayerId });
  }

  updateHUD();
}

function showFallToast(meters) {
  const alertEl = document.getElementById('fallAlert');
  alertEl.innerText = `😱 NOOO! -${meters}m 추락했습니다!`;
  alertEl.style.display = 'block';
  setTimeout(() => {
    alertEl.style.display = 'none';
  }, 2200);
}

// Update HUD & Altitude Minimap
function updateHUD() {
  document.getElementById('hudAltitude').innerText = player.altitude;
  const summitNames = [
    '',
    '🌋 Summit 1 (Emberwall)',
    '🪸 Summit 2 (Coral Climb)',
    '🕵️ Summit 3 (Agent Adventure)',
    '🍄 Summit 4 (Growing Up)',
    '❄️ Summit 5 (Frosty Peaks)',
    '🚀 Summit 6 (One Way Up)'
  ];
  document.getElementById('hudSummit').innerText = summitNames[player.summit] || '정상 (Peak)';

  document.getElementById('hudEnergyText').innerText = Math.round(player.energy).toLocaleString();
  const pct = Math.min(100, Math.max(0, (player.energy / 3000) * 100));
  document.getElementById('hudEnergyBar').style.width = `${pct}%`;

  // Minimap Pin Position (0m to 1000m)
  const pin = document.getElementById('myMinimapPin');
  const trackHeight = 350;
  const pinTop = trackHeight - (player.altitude / 1000) * trackHeight;
  pin.style.top = `${pinTop}px`;

  // Team HUD Badge
  const teamBadge = document.getElementById('hudTeamBadge');
  if (teamBadge) {
    if (isTeamMode && myTeamId && teams[myTeamId]) {
      const t = teams[myTeamId];
      teamBadge.innerText = `${t.emoji || '🚩'} ${t.name}`;
      teamBadge.style.borderColor = t.color || '#38bdf8';
      teamBadge.style.color = t.color || '#fff';
      teamBadge.style.display = 'block';
    } else {
      teamBadge.style.display = 'none';
    }
  }
}

function updateClimbersHUD() {
  const list = Object.values(otherPlayers).concat([player]).sort((a, b) => b.altitude - a.altitude);
  const container = document.getElementById('dldClimbersList');
  if (!container) return;

  container.innerHTML = list.slice(0, 5).map((p, idx) => {
    const isMe = (p.id === myPlayerId || p.name === player.name);
    return `
      <div style="display: flex; justify-content: space-between; align-items: center; color: ${isMe ? '#34d399' : '#cbd5e1'};">
        <span>${idx + 1}. ${p.avatar} ${p.name.slice(0, 6)}</span>
        <span style="font-weight: 800; color: #38bdf8;">${p.altitude}m</span>
      </div>
    `;
  }).join('');
}

function updateClimbersFromLeaderboard(lb) {
  const container = document.getElementById('dldClimbersList');
  if (!container) return;

  container.innerHTML = lb.slice(0, 5).map((p, idx) => {
    const isMe = (p.id === myPlayerId);
    return `
      <div style="display: flex; justify-content: space-between; align-items: center; color: ${isMe ? '#34d399' : '#cbd5e1'};">
        <span>${idx + 1}. ${p.avatar} ${p.name.slice(0, 6)}</span>
        <span style="font-weight: 800; color: #38bdf8;">${p.altitude}m</span>
      </div>
    `;
  }).join('');
}

// Dynamic Horizontal Camera Tracking & Screen Clamping
function computeCamera() {
  const pCenterX = player.x + player.width / 2;
  let targetCamX = 0;

  if (canvas.width < WORLD_WIDTH) {
    // Mobile / Narrow Screen: Keep player centered and clamp within world limits
    targetCamX = canvas.width / 2 - pCenterX;
    targetCamX = Math.min(0, Math.max(canvas.width - WORLD_WIDTH, targetCamX));
  } else {
    // Desktop / Wide Screen: Center the world
    targetCamX = (canvas.width - WORLD_WIDTH) / 2;
  }

  const targetCamY = canvas.height * 0.65 - player.y;

  // Smooth camera interpolation
  currentCameraX += (targetCamX - currentCameraX) * 0.20;
  currentCameraY = targetCamY;

  return { cameraX: currentCameraX, cameraY: currentCameraY };
}

// Main 60 FPS Rendering Loop
function render() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Compute smooth horizontal & vertical tracking camera
  const { cameraX, cameraY } = computeCamera();

  ctx.save();
  ctx.translate(cameraX, cameraY);

  // 1. Dynamic Parallax Sky & Summit Evolution
  renderSummitBackground(cameraY);

  // 2. High Altitude Twinkling Stars & Shooting Stars
  renderStars();
  renderShootingStars();

  // 3. Updraft Wind Streams
  renderUpdrafts();

  // 4. Everyday Life Object Platforms with Angles
  renderPlatforms();

  // 5. Collectible Floating Gems
  renderGems();

  // 6. Hazard Lasers
  renderLasers();

  // 7. Expanding Shockwave Jump Rings
  renderJumpRings();

  // 8. Ghost Climbers (Multiplayer)
  renderOtherPlayers();

  // 9. Local Player with Squash/Stretch, Tilt & Dynamic Emotion
  renderPlayer();

  // 10. Ambient Weather & Effect Particles
  renderAmbientWeather();
  renderParticles();

  ctx.restore();
}

// 1. Altitude-Evolving Atmospheric Background & Parallax Silhouettes
function renderSummitBackground(cameraY) {
  // Cinematic Summit Gradients based on current altitude
  const grad = ctx.createLinearGradient(0, 0, 0, WORLD_HEIGHT);
  grad.addColorStop(0.00, '#02040a'); // 1,000m: Deep Void Cosmos
  grad.addColorStop(0.12, '#0f0c29'); // 880m: Nebula Violet
  grad.addColorStop(0.20, '#0c1b33'); // 800m: Sub-orbital Midnight
  grad.addColorStop(0.32, '#032030'); // 680m: Frosty Arctic Navy
  grad.addColorStop(0.48, '#0f3a40'); // 520m: Sky Blue & Golden Sunset
  grad.addColorStop(0.65, '#064e3b'); // 350m: Agent Forest Pine
  grad.addColorStop(0.80, '#134e4a'); // 200m: Bioluminescent Coral Lagoon
  grad.addColorStop(0.95, '#451a03'); // 50m: Volcanic Magma Ridge
  grad.addColorStop(1.00, '#1c0702'); // 0m: Emberwall Ground

  ctx.fillStyle = grad;
  ctx.fillRect(-600, -1200, WORLD_WIDTH + 1200, WORLD_HEIGHT + 2400);

  // Far Mountains (Parallax 0.08x)
  renderParallaxMountainRidge(-150, 0.08, 'rgba(8, 14, 28, 0.55)', 180);

  // Mid-range Mountains (Parallax 0.18x)
  renderParallaxMountainRidge(-80, 0.18, 'rgba(15, 23, 42, 0.75)', 120);

  // Summit 4 (Growing Up): Floating Fluffy Parallax Clouds
  if (player.altitude >= 420 && player.altitude <= 750) {
    renderParallaxClouds();
  }

  // Summit 5 (Frosty Peaks): Dynamic Aurora Borealis Wave
  if (player.altitude >= 640 && player.altitude <= 880) {
    renderAuroraBorealis();
  }

  // Cliff Rock Boundaries (Left & Right)
  renderCliffSideWalls();
}

function renderParallaxMountainRidge(offsetY, factor, color, peakDist) {
  const currentViewY = player.y * factor;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(-400, player.y + 700);

  for (let x = -400; x <= WORLD_WIDTH + 400; x += peakDist) {
    const wave = Math.sin((x + currentViewY) * 0.005) * 60 + Math.cos(x * 0.01) * 35;
    ctx.lineTo(x, player.y + 220 + offsetY + wave);
  }
  ctx.lineTo(WORLD_WIDTH + 400, player.y + 700);
  ctx.closePath();
  ctx.fill();
}

function renderParallaxClouds() {
  ctx.save();
  for (const c of backgroundClouds) {
    c.x += c.speed;
    if (c.x > WORLD_WIDTH + 250) c.x = -250;

    ctx.fillStyle = `rgba(255, 255, 255, ${c.opacity})`;
    ctx.beginPath();
    ctx.arc(c.x, c.y, c.height * 0.7, 0, Math.PI * 2);
    ctx.arc(c.x + c.width * 0.35, c.y - c.height * 0.3, c.height * 0.85, 0, Math.PI * 2);
    ctx.arc(c.x + c.width * 0.7, c.y, c.height * 0.75, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

// Northern Lights Aurora Wave (Summit 5)
function renderAuroraBorealis() {
  const t = Date.now() * 0.0012;
  const auroraY = 2200; // ~780m
  ctx.save();
  for (let layer = 0; layer < 2; layer++) {
    const grad = ctx.createLinearGradient(0, auroraY - 180, 0, auroraY + 80);
    if (layer === 0) {
      grad.addColorStop(0, 'rgba(52, 211, 153, 0)');
      grad.addColorStop(0.5, 'rgba(52, 211, 153, 0.18)');
      grad.addColorStop(1, 'rgba(56, 189, 248, 0)');
    } else {
      grad.addColorStop(0, 'rgba(192, 132, 252, 0)');
      grad.addColorStop(0.5, 'rgba(168, 85, 247, 0.15)');
      grad.addColorStop(1, 'rgba(52, 211, 153, 0)');
    }

    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.moveTo(-200, auroraY + 120);
    for (let x = -200; x <= WORLD_WIDTH + 200; x += 30) {
      const yOffset = Math.sin(x * 0.008 + t + layer) * 55 + Math.cos(x * 0.015 - t) * 35;
      ctx.lineTo(x, auroraY - 60 + yOffset);
    }
    ctx.lineTo(WORLD_WIDTH + 200, auroraY + 120);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}

function renderCliffSideWalls() {
  // Dark Cliff walls flanking the playfield
  ctx.fillStyle = 'rgba(11, 17, 32, 0.95)';
  ctx.fillRect(-450, -500, 460, WORLD_HEIGHT + 1000);
  ctx.fillRect(WORLD_WIDTH - 10, -500, 450, WORLD_HEIGHT + 1000);

  // Neon boundary indicator strip
  ctx.fillStyle = 'rgba(56, 189, 248, 0.35)';
  ctx.fillRect(8, -500, 2, WORLD_HEIGHT + 1000);
  ctx.fillRect(WORLD_WIDTH - 10, -500, 2, WORLD_HEIGHT + 1000);
}

// 2. Stars & Shooting Stars
function renderStars() {
  const t = Date.now() * 0.002;
  for (const s of stars) {
    const alpha = 0.4 + Math.sin(t + s.twinkle) * 0.45;
    ctx.fillStyle = `rgba(255, 255, 255, ${Math.max(0.1, alpha)})`;
    ctx.beginPath();
    ctx.arc(s.x, s.y, s.size, 0, Math.PI * 2);
    ctx.fill();
  }
}

function renderShootingStars() {
  if (player.altitude >= 750 && Math.random() < 0.025 && shootingStars.length < 2) {
    shootingStars.push({
      x: Math.random() * WORLD_WIDTH,
      y: player.y - 250 - Math.random() * 200,
      vx: 9 + Math.random() * 4,
      vy: 4 + Math.random() * 3,
      length: 60 + Math.random() * 40,
      life: 30
    });
  }

  for (let i = shootingStars.length - 1; i >= 0; i--) {
    const ss = shootingStars[i];
    ss.x += ss.vx;
    ss.y += ss.vy;
    ss.life--;

    const grad = ctx.createLinearGradient(ss.x, ss.y, ss.x - ss.length, ss.y - (ss.length * 0.4));
    grad.addColorStop(0, 'rgba(255, 255, 255, 0.9)');
    grad.addColorStop(1, 'rgba(245, 158, 11, 0)');

    ctx.strokeStyle = grad;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(ss.x, ss.y);
    ctx.lineTo(ss.x - ss.length, ss.y - (ss.length * 0.4));
    ctx.stroke();

    if (ss.life <= 0) shootingStars.splice(i, 1);
  }
}

// 3. Updraft Wind Gusts
function renderUpdrafts() {
  for (const u of updrafts) {
    const grad = ctx.createLinearGradient(u.x, u.y + u.height, u.x, u.y);
    grad.addColorStop(0, 'rgba(56, 189, 248, 0.02)');
    grad.addColorStop(0.5, 'rgba(56, 189, 248, 0.18)');
    grad.addColorStop(1, 'rgba(56, 189, 248, 0.02)');

    ctx.fillStyle = grad;
    ctx.fillRect(u.x, u.y, u.width, u.height);

    // Wind Fan Base
    ctx.fillStyle = '#1e293b';
    ctx.fillRect(u.x, u.y + u.height - 8, u.width, 8);
    ctx.fillStyle = '#38bdf8';
    ctx.fillRect(u.x + 6, u.y + u.height - 4, u.width - 12, 3);
  }
}

// 4. Everyday Life Object Platforms with Dynamic Angles
function renderPlatforms() {
  const now = Date.now();
  for (const p of platforms) {
    const cx = p.x + p.width / 2;
    const cy = p.y + p.height / 2;
    const angle = p.angle || 0;
    const bounceScaleY = p.bounceScaleY || 1.0;

    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(angle);
    ctx.scale(1.0, bounceScaleY);

    const halfW = p.width / 2;
    const halfH = p.height / 2;

    // 1. Desk (Study Table with Pencil & Mug) 🪑
    if (p.type === 'desk') {
      // Wooden desk top
      ctx.fillStyle = '#854d0e';
      ctx.beginPath();
      ctx.roundRect(-halfW, -halfH, p.width, p.height, 4);
      ctx.fill();

      // Top glossy wood polish trim
      ctx.fillStyle = '#a16207';
      ctx.fillRect(-halfW + 2, -halfH, p.width - 4, 3.5);

      // Desk drawer line
      ctx.strokeStyle = '#451a03';
      ctx.lineWidth = 1.2;
      ctx.strokeRect(-halfW + 6, -halfH + 6, p.width - 12, p.height - 10);

      // Drawer brass handles
      ctx.fillStyle = '#fef08a';
      ctx.beginPath();
      ctx.arc(0, 0, 2.5, 0, Math.PI * 2);
      ctx.fill();

      // Desk accessories: Coffee mug & pencil holder
      ctx.font = '14px sans-serif';
      ctx.fillText('☕', -halfW + 12, -halfH - 2);
      ctx.fillText('✏️', halfW - 20, -halfH - 2);
    }
    // 2. Soccer Ball (Super Bouncy Sports Ball) ⚽
    else if (p.type === 'soccer') {
      const radius = Math.min(halfW, halfH * 1.5);

      // Ball white base
      ctx.fillStyle = '#f8fafc';
      ctx.beginPath();
      ctx.ellipse(0, 0, halfW, halfH, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#334155';
      ctx.lineWidth = 2;
      ctx.stroke();

      // Center Black Pentagon
      ctx.fillStyle = '#0f172a';
      ctx.beginPath();
      for (let i = 0; i < 5; i++) {
        const a = (i * 2 * Math.PI) / 5 - Math.PI / 2;
        const px = Math.cos(a) * (radius * 0.45);
        const py = Math.sin(a) * (radius * 0.45);
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.fill();

      // Outer seam patches
      ctx.strokeStyle = '#334155';
      ctx.lineWidth = 1.5;
      for (let i = 0; i < 5; i++) {
        const a = (i * 2 * Math.PI) / 5 - Math.PI / 2;
        ctx.beginPath();
        ctx.moveTo(Math.cos(a) * (radius * 0.45), Math.sin(a) * (radius * 0.45));
        ctx.lineTo(Math.cos(a) * (radius * 0.95), Math.sin(a) * (radius * 0.95));
        ctx.stroke();
      }

      // Ball Bounce Emoji tag
      ctx.font = '11px sans-serif';
      ctx.fillText('⚽', -halfW + 6, -halfH - 2);
    }
    // 3. Smartphone / Tablet (📱 Glowing Screen & Apps)
    else if (p.type === 'phone') {
      // Phone Body
      ctx.fillStyle = '#0f172a';
      ctx.beginPath();
      ctx.roundRect(-halfW, -halfH, p.width, p.height, 8);
      ctx.fill();

      // Metallic frame
      ctx.strokeStyle = '#64748b';
      ctx.lineWidth = 1.5;
      ctx.stroke();

      // Screen Glass
      ctx.fillStyle = '#1e293b';
      ctx.beginPath();
      ctx.roundRect(-halfW + 4, -halfH + 2, p.width - 8, p.height - 4, 5);
      ctx.fill();

      // Mini App Icons
      const appColors = ['#ef4444', '#3b82f6', '#10b981', '#f59e0b', '#8b5cf6'];
      for (let i = 0; i < 5; i++) {
        const iconX = -halfW + 10 + i * (p.width - 20) / 4;
        ctx.fillStyle = appColors[i % appColors.length];
        ctx.beginPath();
        ctx.roundRect(iconX - 4, -3, 8, 8, 2);
        ctx.fill();
      }

      // Notch / Dynamic Island
      ctx.fillStyle = '#000000';
      ctx.beginPath();
      ctx.roundRect(-10, -halfH + 1, 20, 3, 2);
      ctx.fill();

      // Battery level indicator
      ctx.fillStyle = '#22c55e';
      ctx.fillRect(halfW - 14, -halfH + 3, 6, 2.5);
    }
    // 4. Pizza Slice (🍕 Sloped Cheese & Pepperoni)
    else if (p.type === 'pizza') {
      // Golden Crust Back
      ctx.fillStyle = '#b45309';
      ctx.beginPath();
      ctx.roundRect(-halfW, -halfH, p.width, 5, 3);
      ctx.fill();

      // Cheese Triangular Wedge
      ctx.fillStyle = '#fef08a';
      ctx.beginPath();
      ctx.moveTo(-halfW, -halfH + 3);
      ctx.lineTo(halfW, -halfH + 3);
      ctx.lineTo(0, halfH + 4);
      ctx.closePath();
      ctx.fill();

      // Pepperoni Slices
      ctx.fillStyle = '#ef4444';
      ctx.beginPath();
      ctx.arc(-halfW * 0.45, -halfH + 9, 4, 0, Math.PI * 2);
      ctx.arc(halfW * 0.35, -halfH + 9, 3.5, 0, Math.PI * 2);
      ctx.arc(0, halfH - 2, 3, 0, Math.PI * 2);
      ctx.fill();

      // Oregano green specks
      ctx.fillStyle = '#15803d';
      ctx.fillRect(-halfW * 0.15, -halfH + 8, 2, 2);
      ctx.fillRect(halfW * 0.15, -halfH + 12, 2, 2);
    }
    // 5. Skateboard (🛹 Rolling Ramp Platform)
    else if (p.type === 'skateboard') {
      // Curved Wooden Deck
      ctx.fillStyle = '#1e293b';
      ctx.beginPath();
      ctx.roundRect(-halfW, -halfH, p.width, 6, 3);
      ctx.fill();

      // Grip tape stripe
      ctx.fillStyle = '#f43f5e';
      ctx.fillRect(-halfW + 12, -halfH + 1, p.width - 24, 2);

      // Upturned Kicktails (Left & Right)
      ctx.fillStyle = '#0f172a';
      ctx.beginPath();
      ctx.ellipse(-halfW + 4, -halfH + 1, 6, 4, -0.2, 0, Math.PI * 2);
      ctx.ellipse(halfW - 4, -halfH + 1, 6, 4, 0.2, 0, Math.PI * 2);
      ctx.fill();

      // Skateboard Wheels (Yellow Urethane 휠)
      ctx.fillStyle = '#facc15';
      ctx.beginPath();
      ctx.arc(-halfW + 14, halfH - 2, 4.5, 0, Math.PI * 2);
      ctx.arc(halfW - 14, halfH - 2, 4.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#0f172a';
      ctx.beginPath();
      ctx.arc(-halfW + 14, halfH - 2, 1.8, 0, Math.PI * 2);
      ctx.arc(halfW - 14, halfH - 2, 1.8, 0, Math.PI * 2);
      ctx.fill();
    }
    // 6. Air Sneaker Shoe (👟 Soft Cushion Sole)
    else if (p.type === 'sneaker') {
      // Shoe Upper Body
      ctx.fillStyle = '#2563eb';
      ctx.beginPath();
      ctx.roundRect(-halfW, -halfH, p.width, p.height - 8, 6);
      ctx.fill();

      // White Nike/Sporty Swoosh Stripe
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(-halfW + 10, 0);
      ctx.quadraticCurveTo(0, halfH - 6, halfW - 12, -halfH + 4);
      ctx.stroke();

      // Thick Air Sole Cushion (Bottom)
      ctx.fillStyle = '#f1f5f9';
      ctx.beginPath();
      ctx.roundRect(-halfW - 2, halfH - 9, p.width + 4, 9, 4);
      ctx.fill();

      // Visible Air Bubble Pocket
      ctx.fillStyle = '#38bdf8';
      ctx.fillRect(-halfW + 12, halfH - 7, 18, 5);

      // Shoelace Eyelets
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, -halfH + 2, 3, 3);
      ctx.fillRect(6, -halfH + 4, 3, 3);
    }
    // 7. Stack of Books (📚 Hardcover Textbooks)
    else if (p.type === 'books') {
      // Bottom Book (Deep Blue)
      ctx.fillStyle = '#1d4ed8';
      ctx.beginPath();
      ctx.roundRect(-halfW, halfH - 10, p.width, 10, 3);
      ctx.fill();
      ctx.fillStyle = '#fef08a';
      ctx.fillRect(-halfW, halfH - 8, 4, 6); // Gold spine

      // Middle Book (Emerald Green)
      ctx.fillStyle = '#059669';
      ctx.beginPath();
      ctx.roundRect(-halfW + 4, -2, p.width - 8, 9, 3);
      ctx.fill();

      // Top Book (Crimson Red)
      ctx.fillStyle = '#dc2626';
      ctx.beginPath();
      ctx.roundRect(-halfW + 8, -halfH, p.width - 16, 9, 3);
      ctx.fill();
      ctx.fillStyle = '#fef08a';
      ctx.fillRect(-halfW + 8, -halfH + 2, 3, 5);

      // Paper Pages Edge
      ctx.fillStyle = '#f8fafc';
      ctx.fillRect(halfW - 14, -halfH + 1, 4, p.height - 3);
    }
    // 8. Coffee Mug & Donut (☕ Sweet Rest)
    else if (p.type === 'coffee') {
      // Ceramic Coaster Base
      ctx.fillStyle = '#334155';
      ctx.beginPath();
      ctx.roundRect(-halfW, halfH - 6, p.width, 6, 3);
      ctx.fill();

      // White Coffee Mug
      ctx.fillStyle = '#f8fafc';
      ctx.beginPath();
      ctx.roundRect(-halfW + 6, -halfH, 30, p.height - 6, 4);
      ctx.fill();

      // Mug Handle
      ctx.strokeStyle = '#f8fafc';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(-halfW + 4, -halfH + 8, 5, Math.PI * 0.5, Math.PI * 1.5);
      ctx.stroke();

      // Hot Coffee Liquid
      ctx.fillStyle = '#78350f';
      ctx.fillRect(-halfW + 9, -halfH + 2, 24, 4);

      // Steam curls (Animated)
      const steamY = Math.sin(now * 0.005) * 3;
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.45)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(-halfW + 18, -halfH - 2);
      ctx.quadraticCurveTo(-halfW + 24, -halfH - 7 + steamY, -halfW + 18, -halfH - 12);
      ctx.stroke();

      // Strawberry Frosted Donut
      ctx.fillStyle = '#d97706';
      ctx.beginPath();
      ctx.arc(halfW - 20, 0, 11, 0, Math.PI * 2);
      ctx.fill();
      // Pink Frosting & Hole
      ctx.fillStyle = '#f43f5e';
      ctx.beginPath();
      ctx.arc(halfW - 20, 0, 9, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#334155';
      ctx.beginPath();
      ctx.arc(halfW - 20, 0, 3.5, 0, Math.PI * 2);
      ctx.fill();
    }
    // 9. Handheld Game Console (🎮 Joypad Buttons & Screen)
    else if (p.type === 'gamepad') {
      // Center Tablet Body
      ctx.fillStyle = '#0f172a';
      ctx.beginPath();
      ctx.roundRect(-halfW + 14, -halfH, p.width - 28, p.height, 4);
      ctx.fill();

      // Glowing Game Screen
      ctx.fillStyle = '#0284c7';
      ctx.fillRect(-halfW + 18, -halfH + 3, p.width - 36, p.height - 6);

      // Left Neon Blue Joy-Con
      ctx.fillStyle = '#06b6d4';
      ctx.beginPath();
      ctx.roundRect(-halfW, -halfH, 16, p.height, [8, 0, 0, 8]);
      ctx.fill();
      // D-pad Directional Cross
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(-halfW + 4, -halfH + 5, 8, 3);
      ctx.fillRect(-halfW + 6.5, -halfH + 2.5, 3, 8);

      // Right Neon Red Joy-Con
      ctx.fillStyle = '#f43f5e';
      ctx.beginPath();
      ctx.roundRect(halfW - 16, -halfH, 16, p.height, [0, 8, 8, 0]);
      ctx.fill();
      // ABXY Action Buttons
      ctx.fillStyle = '#0f172a';
      ctx.beginPath();
      ctx.arc(halfW - 8, -halfH + 5, 2, 0, Math.PI * 2);
      ctx.arc(halfW - 8, halfH - 5, 2, 0, Math.PI * 2);
      ctx.arc(halfW - 12, 0, 2, 0, Math.PI * 2);
      ctx.arc(halfW - 4, 0, 2, 0, Math.PI * 2);
      ctx.fill();
    }
    // 10. Classic Vintage Alarm Clock (⏰ Twin Bell Clock)
    else if (p.type === 'clock') {
      const radius = Math.min(halfW * 0.75, halfH);

      // Left & Right Twin Brass Bells
      ctx.fillStyle = '#f59e0b';
      ctx.beginPath();
      ctx.arc(-radius * 0.7, -halfH - 2, 6, 0, Math.PI * 2);
      ctx.arc(radius * 0.7, -halfH - 2, 6, 0, Math.PI * 2);
      ctx.fill();

      // Hammer in between
      ctx.fillStyle = '#94a3b8';
      ctx.fillRect(-2, -halfH - 5, 4, 4);

      // Red Clock Body
      ctx.fillStyle = '#dc2626';
      ctx.beginPath();
      ctx.ellipse(0, 0, halfW, halfH, 0, 0, Math.PI * 2);
      ctx.fill();

      // White Clock Face Dial
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.ellipse(0, 0, halfW - 6, halfH - 4, 0, 0, Math.PI * 2);
      ctx.fill();

      // Clock Ticking Hands
      const handAngle = now * 0.003;
      ctx.strokeStyle = '#0f172a';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(Math.cos(handAngle) * 7, Math.sin(handAngle) * 7);
      ctx.moveTo(0, 0);
      ctx.lineTo(0, -6);
      ctx.stroke();

      // Center Pin
      ctx.fillStyle = '#dc2626';
      ctx.beginPath();
      ctx.arc(0, 0, 1.8, 0, Math.PI * 2);
      ctx.fill();
    }
    // Ground Base: Study Room Solid Floor
    else if (p.type === 'floor') {
      ctx.fillStyle = '#451a03';
      ctx.fillRect(-halfW, -halfH, p.width, p.height);

      // Herringbone wooden floorboards
      ctx.strokeStyle = '#78350f';
      ctx.lineWidth = 2;
      for (let x = -halfW; x < halfW; x += 40) {
        ctx.beginPath();
        ctx.moveTo(x, -halfH);
        ctx.lineTo(x + 20, halfH);
        ctx.stroke();
      }
      ctx.fillStyle = '#f59e0b';
      ctx.fillRect(-halfW, -halfH, p.width, 4);
    }
    // Summit Resting Lounge Desk
    else if (p.type === 'summit-rest') {
      ctx.fillStyle = '#1e293b';
      ctx.fillRect(-halfW, -halfH, p.width, p.height);

      // Warm Mahogany Desk Top
      ctx.fillStyle = '#b45309';
      ctx.fillRect(-halfW, -halfH, p.width, 5);

      // Desk Lamp & Checkpoint Flag
      ctx.font = '16px sans-serif';
      ctx.fillText('💡', -halfW + 16, -halfH - 2);
      ctx.fillText('🚩', halfW - 28, -halfH - 2);

      // Summit Label Banner
      ctx.font = 'bold 11px sans-serif';
      ctx.fillStyle = '#fef08a';
      ctx.textAlign = 'center';
      ctx.fillText(`— SUMMIT ${p.summit} STUDY LOUNGE —`, 0, 4);
    }
    // 1,000m Peak Golden Study Altar with Giant Trophy 🏆
    else if (p.type === 'peak') {
      // Rotating Golden Radiance
      const rot = now * 0.001;
      ctx.save();
      for (let a = 0; a < 8; a++) {
        ctx.rotate(Math.PI / 4);
        ctx.fillStyle = 'rgba(251, 191, 36, 0.08)';
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(-20, -180);
        ctx.lineTo(20, -180);
        ctx.closePath();
        ctx.fill();
      }
      ctx.restore();

      // Golden Altar Desk
      const g = ctx.createLinearGradient(-halfW, 0, halfW, 0);
      g.addColorStop(0, '#f59e0b');
      g.addColorStop(0.5, '#fef08a');
      g.addColorStop(1, '#f59e0b');
      ctx.fillStyle = g;
      ctx.fillRect(-halfW, -halfH, p.width, p.height);

      // Giant Golden Trophy & Graduation Cap
      ctx.font = '46px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('🏆', 0, -halfH - 14);

      ctx.font = 'bold 13px sans-serif';
      ctx.fillStyle = '#78350f';
      ctx.fillText('★ 1,000m 최고봉 정복 완료! 학사모 수여식 🎓 ★', 0, 6);
    } else {
      ctx.fillStyle = '#475569';
      ctx.fillRect(-halfW, -halfH, p.width, p.height);
    }

    ctx.restore();
  }
}

// 5. Floating Collectible Energy Gems
function renderGems() {
  for (const g of gems) {
    if (g.collected) continue;

    const bobY = g.y + Math.sin(g.bobPhase) * 5;
    ctx.save();
    ctx.translate(g.x + 11, bobY + 11);

    // Glowing gem aura
    ctx.shadowColor = g.color;
    ctx.shadowBlur = 12;

    // Diamond Gem shape
    ctx.fillStyle = g.color;
    ctx.beginPath();
    ctx.moveTo(0, -10);
    ctx.lineTo(9, -2);
    ctx.lineTo(0, 10);
    ctx.lineTo(-9, -2);
    ctx.closePath();
    ctx.fill();

    // Gem inner facet shine
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(0, -8);
    ctx.lineTo(4, -2);
    ctx.lineTo(0, 3);
    ctx.lineTo(-4, -2);
    ctx.closePath();
    ctx.fill();

    ctx.restore();
  }
}

// 6. Hazard Lasers
function renderLasers() {
  const now = Date.now();
  for (const l of lasers) {
    const cycle = (now % 3000) < 1800; // 1.8s active, 1.2s warning
    if (cycle) {
      ctx.fillStyle = 'rgba(239, 68, 68, 0.9)';
      ctx.shadowColor = '#ef4444';
      ctx.shadowBlur = 16;
      ctx.fillRect(l.x, l.y, l.width, 6);
      ctx.shadowBlur = 0;

      // Hazard warning posts on sides
      ctx.fillStyle = '#ef4444';
      ctx.fillRect(l.x - 6, l.y - 4, 6, 14);
      ctx.fillRect(l.x + l.width, l.y - 4, 6, 14);

      // Collision Check
      if (
        player.x + player.width > l.x &&
        player.x < l.x + l.width &&
        player.y + player.height > l.y &&
        player.y < l.y + 6
      ) {
        player.y += 180; // Penalty drop
        window.soundEngine.playWrong();
      }
    } else {
      // Laser charging warning
      ctx.fillStyle = 'rgba(239, 68, 68, 0.25)';
      ctx.fillRect(l.x, l.y + 2, l.width, 2);
    }
  }
}

// 7. Shockwave Jump Rings
function renderJumpRings() {
  for (let i = jumpRings.length - 1; i >= 0; i--) {
    const r = jumpRings[i];
    r.radius += 1.6;
    r.opacity -= 0.055;
    r.life--;

    ctx.strokeStyle = r.color;
    ctx.lineWidth = 2.5;
    ctx.globalAlpha = Math.max(0, r.opacity);
    ctx.beginPath();
    ctx.ellipse(r.x, r.y, r.radius, r.radius * 0.4, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = 1.0;

    if (r.life <= 0 || r.opacity <= 0) {
      jumpRings.splice(i, 1);
    }
  }
}

// 8. Ghost Climbers (Multiplayer)
function renderOtherPlayers() {
  const now = Date.now();
  for (const [id, op] of Object.entries(otherPlayers)) {
    if (now - op.lastSeen > 10000) continue;

    ctx.save();
    ctx.font = '26px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(op.avatar || '🤖', op.x + 16, op.y + 18);

    const opTeam = (isTeamMode && op.teamId && teams[op.teamId]) ? teams[op.teamId] : null;
    const opTag = opTeam ? `[${opTeam.emoji || '🚩'}${opTeam.name}] ` : '';
    ctx.font = 'bold 10px sans-serif';
    ctx.fillStyle = opTeam ? (opTeam.color || '#cbd5e1') : '#cbd5e1';
    ctx.fillText(`${opTag}${op.name || '경쟁자'} [${op.altitude || 0}m]`, op.x + 16, op.y - 10);
    ctx.restore();
  }
}

// 9. Local Player with Squash & Stretch, Dynamic Tilting & Living Emoji Emotions
function renderPlayer() {
  const pCenterX = player.x + player.width / 2;
  const pCenterY = player.y + player.height / 2;

  // A. Drop Shadow on closest platform below
  renderPlayerShadow(pCenterX);

  // B. Speed Trail when falling fast
  if (player.isFallingFast) {
    ctx.fillStyle = 'rgba(239, 68, 68, 0.4)';
    ctx.fillRect(player.x, player.y - 35, player.width, 35);
  }

  // C. Golden Aura Pulse when High Energy (Charged state)
  if (player.energy >= 2000) {
    const pulseR = 24 + Math.sin(Date.now() * 0.008) * 4;
    ctx.strokeStyle = 'rgba(245, 158, 11, 0.4)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(pCenterX, pCenterY, pulseR, 0, Math.PI * 2);
    ctx.stroke();
  }

  // D. Dynamic Transform: Tilt & Squash/Stretch
  ctx.save();
  ctx.translate(pCenterX, pCenterY);

  // Tilt with velocity
  ctx.rotate(player.tilt);

  // Flip horizontally if facing left
  const flipX = player.facingLeft ? -1 : 1;
  ctx.scale(flipX * player.scaleX, player.scaleY);

  // Bobbing offset when walking
  const walkBob = (player.isGrounded && Math.abs(player.vx) > 0.4) 
    ? Math.abs(Math.sin(player.walkCycle)) * 3.5 
    : 0;

  // Determine Dynamic Living Emotion Emoji
  let currentFace = player.avatar;
  if (player.isFallingFast) {
    currentFace = '😱'; // Panicking screaming face when dropping!
  } else if (player.altitude >= 995) {
    currentFace = '👑'; // Crown Champion at 1,000m Peak!
  } else if (!player.isGrounded && player.vy < -4) {
    currentFace = '🚀'; // Rocketing upwards!
  }

  // Draw Avatar Emoji
  ctx.font = '30px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(currentFace, 0, -walkBob);

  ctx.restore();

  // E. Name Tag & Altitude HUD above head
  ctx.font = 'bold 11px sans-serif';
  const myTeam = (isTeamMode && myTeamId && teams[myTeamId]) ? teams[myTeamId] : null;
  const myTag = myTeam ? `[${myTeam.emoji || '🚩'}${myTeam.name}] ` : '';
  ctx.fillStyle = myTeam ? (myTeam.color || '#38bdf8') : '#38bdf8';
  ctx.textAlign = 'center';
  ctx.shadowColor = 'rgba(0, 0, 0, 0.8)';
  ctx.shadowBlur = 4;
  ctx.fillText(`${myTag}${player.name} [${player.altitude}m]`, pCenterX, player.y - 12);
  ctx.shadowBlur = 0;
}

// Projected Drop Shadow onto nearest platform
function renderPlayerShadow(pCenterX) {
  let closestPlatY = null;
  const pBottomY = player.y + player.height;

  for (const p of platforms) {
    if (player.x + player.width > p.x && player.x < p.x + p.width) {
      const pY = p.y + (pCenterX - (p.x + p.width / 2)) * Math.sin(p.angle || 0);
      if (pY >= pBottomY - 4 && (closestPlatY === null || pY < closestPlatY)) {
        closestPlatY = pY;
      }
    }
  }

  if (closestPlatY !== null && closestPlatY - pBottomY < 180) {
    const dist = Math.max(0, closestPlatY - pBottomY);
    const shadowScale = Math.max(0.3, 1 - (dist / 180));
    const shadowAlpha = Math.max(0.1, 0.45 * (1 - dist / 180));

    ctx.fillStyle = `rgba(0, 0, 0, ${shadowAlpha})`;
    ctx.beginPath();
    ctx.ellipse(pCenterX, closestPlatY + 2, 16 * shadowScale, 5 * shadowScale, 0, 0, Math.PI * 2);
    ctx.fill();
  }
}

// 10. Ambient Weather Particles (Summit-Specific)
function renderAmbientWeather() {
  // Spawn summit ambient weather
  if (ambientParticles.length < 50 && Math.random() < 0.3) {
    // Summit 1: Floating Volcanic Embers (Upwards)
    if (player.summit === 1) {
      ambientParticles.push({
        x: Math.random() * WORLD_WIDTH,
        y: player.y + 350 + Math.random() * 150,
        vx: (Math.random() - 0.5) * 1.5,
        vy: -Math.random() * 2 - 1,
        radius: Math.random() * 2.5 + 1,
        color: 'rgba(249, 115, 22, 0.85)',
        life: 140
      });
    }
    // Summit 2: Bioluminescent Spores (Floating drift)
    else if (player.summit === 2) {
      ambientParticles.push({
        x: Math.random() * WORLD_WIDTH,
        y: player.y - 200 + Math.random() * 500,
        vx: Math.sin(Date.now() * 0.002) * 1.2,
        vy: (Math.random() - 0.5) * 0.8,
        radius: Math.random() * 2.2 + 1,
        color: (Math.random() < 0.5) ? 'rgba(6, 182, 212, 0.75)' : 'rgba(236, 72, 153, 0.75)',
        life: 120
      });
    }
    // Summit 5: Gently Falling Snowflakes
    else if (player.summit === 5) {
      ambientParticles.push({
        x: Math.random() * WORLD_WIDTH,
        y: player.y - 350 - Math.random() * 100,
        vx: (Math.random() - 0.5) * 1.2,
        vy: Math.random() * 1.8 + 1.2,
        radius: Math.random() * 2.5 + 1.2,
        color: 'rgba(255, 255, 255, 0.85)',
        life: 160
      });
    }
  }

  // Update and draw ambient particles
  for (let i = ambientParticles.length - 1; i >= 0; i--) {
    const ap = ambientParticles[i];
    ap.x += ap.vx;
    ap.y += ap.vy;
    ap.life--;

    ctx.fillStyle = ap.color;
    ctx.beginPath();
    ctx.arc(ap.x, ap.y, ap.radius, 0, Math.PI * 2);
    ctx.fill();

    if (ap.life <= 0) ambientParticles.splice(i, 1);
  }
}

// Particle Engine
function renderParticles() {
  for (let i = particles.length - 1; i >= 0; i--) {
    const pt = particles[i];
    pt.x += pt.vx;
    pt.y += pt.vy;
    pt.life--;

    ctx.fillStyle = pt.color;
    ctx.beginPath();
    ctx.arc(pt.x, pt.y, pt.radius, 0, Math.PI * 2);
    ctx.fill();

    if (pt.life <= 0) particles.splice(i, 1);
  }
}

// Question Modal Functions
function openQuestionModal() {
  if (gameEnded) return;
  isQuestionModalOpen = true;
  document.getElementById('dldQuestionModal').style.display = 'flex';
  if (!currentQuestion) {
    loadNewQuestion();
  } else {
    displayDldQuestion(currentQuestion);
  }
}

function closeQuestionModal() {
  isQuestionModalOpen = false;
  document.getElementById('dldQuestionModal').style.display = 'none';
}

function loadNewQuestion() {
  fetch('/api/quiz-sets')
    .then(r => r.json())
    .then(() => {
      // Questions loaded from server
    });
}

function displayDldQuestion(q) {
  currentQuestion = q;
  document.getElementById('dldQText').innerText = q.question;
  document.getElementById('dldQStreak').innerText = `🔥 연속 정답: ${player.streak}회 (정답 시 +1,000~2,000 에너지)`;

  for (let i = 0; i < 4; i++) {
    const btn = document.getElementById(`dldOpt${i}`);
    if (btn) btn.innerText = q.options[i] || '';
  }
}

function submitDldAnswer(chosenIdx) {
  if (!currentQuestion) return;

  socket.emit('dld-answer-question', {
    code: roomCode,
    playerId: myPlayerId,
    answerIndex: chosenIdx
  }, (res) => {
    if (!res.success) return;

    if (res.isCorrect) {
      window.soundEngine.playCorrect();
      player.energy = res.totalEnergy;
      player.streak = res.streak;
      document.getElementById('dldQStreak').innerText = `✨ 정답! +${res.energyGain.toLocaleString()} 에너지 충전 완료!`;
    } else {
      window.soundEngine.playWrong();
      player.streak = 0;
      document.getElementById('dldQStreak').innerText = `❌ 오답입니다!`;
    }

    updateHUD();

    // Auto next question
    setTimeout(() => {
      if (res.nextQuestion) {
        displayDldQuestion(res.nextQuestion);
      }
    }, 450);
  });
}

// Main 60 FPS Game Loop
// ===== Result screen shown to every player when the game ends =====
let gameEnded = false;

function escapeHtml(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

function showResultModal(report) {
  gameEnded = true;

  // Stop all input and close the quiz modal
  keys.left = keys.right = keys.up = false;
  player.vx = 0;
  try { closeQuestionModal(); } catch (e) {}
  if (syncInterval) { clearInterval(syncInterval); syncInterval = null; }

  const board = (report && report.leaderboard) ? report.leaderboard : [];
  let myIdx = board.findIndex(p => p.id === myPlayerId);
  if (myIdx < 0) myIdx = board.findIndex(p => p.name === player.name);
  const me = myIdx >= 0 ? board[myIdx] : null;
  const total = board.length;

  const isTeam = !!(report && report.isTeamMode && report.teamLeaderboard && report.teamLeaderboard.length > 0);
  const teamBoard = isTeam ? report.teamLeaderboard : [];
  let myTeamIdx = isTeam ? teamBoard.findIndex(t => t.id === myTeamId || (t.members && t.members.some(m => m.id === myPlayerId || m.name === player.name))) : -1;
  const myTeam = myTeamIdx >= 0 ? teamBoard[myTeamIdx] : null;

  // Title / emoji by rank
  const medals = ['🥇', '🥈', '🥉'];
  const emojiEl = document.getElementById('resultEmoji');
  const titleEl = document.getElementById('resultTitle');

  if (isTeam && myTeam) {
    if (myTeamIdx === 0) {
      emojiEl.innerText = '🏆';
      titleEl.innerText = `우리 팀 우승! 🎉 ${myTeam.emoji || '🚩'} ${myTeam.name} 1위!`;
    } else {
      emojiEl.innerText = medals[myTeamIdx] || '🏁';
      titleEl.innerText = `${myTeam.emoji || '🚩'} ${myTeam.name} (${myTeamIdx + 1}위 / ${teamBoard.length}개 조)`;
    }
  } else if (me && myIdx === 0) {
    emojiEl.innerText = '🏆';
    titleEl.innerText = '우승! 정상에 가장 가까웠어요!';
  } else if (me && myIdx < 3) {
    emojiEl.innerText = medals[myIdx];
    titleEl.innerText = `${myIdx + 1}위! 멋진 등반이었어요!`;
  } else {
    emojiEl.innerText = '🏁';
    titleEl.innerText = '게임 종료!';
  }
  document.getElementById('dldVictoryText').innerText = (report && report.reason) || '';

  // My result card
  const myAlt = me ? me.altitude : player.altitude;
  const rankLabel = isTeam && myTeam
    ? `우리 팀 ${myTeamIdx + 1}위 (총 ${myTeam.totalAltitude}m) · 개인 ${myAlt.toLocaleString()}m`
    : (me ? `${myIdx + 1}위 / ${total}명 · ${myAlt.toLocaleString()}m` : `${myAlt.toLocaleString()}m`);
  document.getElementById('resultMyRank').innerText = rankLabel;

  const stat = (label, value) => `
    <div style="background: rgba(15,23,42,0.7); border-radius: 10px; padding: 0.35rem 0.2rem;">
      <div style="font-size: 0.65rem; color: #94a3b8; font-weight: 700;">${label}</div>
      <div style="font-size: 1rem; font-weight: 900; color: #fff;">${value}</div>
    </div>`;
  document.getElementById('resultMyStats').innerHTML = [
    stat('⛰️ 내 고도', `${myAlt}m`),
    stat('✅ 정답', me ? me.correctCount : 0),
    stat('❌ 오답', me ? me.wrongCount : 0),
    stat('😱 추락', me ? me.falls : 0)
  ].join('');

  // Podium (1st in the middle)
  const order = [1, 0, 2]; // 2nd, 1st, 3rd
  const heights = { 0: 92, 1: 72, 2: 56 };
  const colors = { 0: '#f59e0b', 1: '#94a3b8', 2: '#b45309' };

  if (isTeam) {
    const topTeams = teamBoard.slice(0, 3);
    document.getElementById('resultPodium').innerHTML = order
      .filter(i => topTeams[i])
      .map(i => {
        const t = topTeams[i];
        return `
          <div style="flex: 1; max-width: 120px; text-align: center;">
            <div style="font-size: 1.7rem;">${t.emoji || '🚩'}</div>
            <div style="font-size: 0.75rem; font-weight: 800; color: ${t.color || '#fff'}; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${escapeHtml(t.name)}</div>
            <div style="font-size: 0.7rem; color: #38bdf8; font-weight: 800;">총 ${t.totalAltitude}m</div>
            <div style="height: ${heights[i]}px; background: linear-gradient(180deg, ${colors[i]}, rgba(15,23,42,0.6)); border-radius: 10px 10px 0 0; display: flex; align-items: flex-start; justify-content: center; padding-top: 4px; font-size: 1.4rem;">${medals[i]}</div>
          </div>`;
      }).join('');

    // Team Ranking List
    document.getElementById('resultRankList').innerHTML = teamBoard.map((t, idx) => {
      const isMyTeam = (t.id === myTeamId) || (myTeam && t.id === myTeam.id);
      return `
        <div style="display: flex; justify-content: space-between; align-items: center; gap: 0.5rem; padding: 0.4rem 0.6rem; border-radius: 10px; background: ${isMyTeam ? 'rgba(52,211,153,0.18)' : 'rgba(15,23,42,0.6)'}; border: 1px solid ${isMyTeam ? '#34d399' : 'transparent'};">
          <div style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
            <span style="font-weight: 900; color: ${t.color || '#e2e8f0'};">
              ${idx + 1}. ${t.emoji || '🚩'} ${escapeHtml(t.name)}${isMyTeam ? ' (우리 팀)' : ''}
            </span>
            <span style="font-size: 0.72rem; color: #94a3b8; margin-left: 0.4rem;">(${t.memberCount}명)</span>
          </div>
          <span style="font-weight: 900; color: #38bdf8; white-space: nowrap;">총 ${t.totalAltitude}m (평균 ${t.avgAltitude}m)</span>
        </div>`;
    }).join('');
  } else {
    const top = board.slice(0, 3);
    document.getElementById('resultPodium').innerHTML = order
      .filter(i => top[i])
      .map(i => {
        const p = top[i];
        return `
          <div style="flex: 1; max-width: 120px; text-align: center;">
            <div style="font-size: 1.7rem;">${escapeHtml(p.avatar)}</div>
            <div style="font-size: 0.75rem; font-weight: 800; color: #fff; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${escapeHtml(p.name)}</div>
            <div style="font-size: 0.7rem; color: #38bdf8; font-weight: 800;">${p.altitude}m</div>
            <div style="height: ${heights[i]}px; background: linear-gradient(180deg, ${colors[i]}, rgba(15,23,42,0.6)); border-radius: 10px 10px 0 0; display: flex; align-items: flex-start; justify-content: center; padding-top: 4px; font-size: 1.4rem;">${medals[i]}</div>
          </div>`;
      }).join('');

    // Full ranking
    document.getElementById('resultRankList').innerHTML = board.map((p, idx) => {
      const isMe = idx === myIdx;
      return `
        <div style="display: flex; justify-content: space-between; align-items: center; gap: 0.5rem; padding: 0.35rem 0.6rem; border-radius: 10px; background: ${isMe ? 'rgba(52,211,153,0.18)' : 'rgba(15,23,42,0.6)'}; border: 1px solid ${isMe ? '#34d399' : 'transparent'};">
          <span style="font-weight: 800; color: ${isMe ? '#34d399' : '#e2e8f0'}; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
            ${idx + 1}. ${escapeHtml(p.avatar)} ${escapeHtml(p.name)}${isMe ? ' (나)' : ''}
          </span>
          <span style="font-weight: 900; color: #38bdf8; white-space: nowrap;">${p.altitude}m</span>
        </div>`;
    }).join('');
  }

  document.getElementById('dldVictoryModal').style.display = 'flex';
  try { window.soundEngine.playWin(); } catch (e) {}
  if (typeof confetti === 'function' && ((isTeam && myTeamIdx === 0) || (!isTeam && me && myIdx < 3))) {
    confetti({ particleCount: 150, spread: 80 });
  }
}

function gameLoop() {
  // Always schedule the next frame FIRST so a runtime error can never freeze the game
  requestAnimationFrame(gameLoop);

  try {
    updatePhysics();
  } catch (err) {
    console.error('[physics error]', err);
    sanitizePlayerState();
  }

  try {
    render();
  } catch (err) {
    console.error('[render error]', err);
    try { ctx.restore(); } catch (e) {}
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }
}

// Recover from NaN / invalid state so the character can never get stuck
function sanitizePlayerState() {
  if (!Number.isFinite(player.x)) player.x = WORLD_WIDTH / 2;
  if (!Number.isFinite(player.y)) player.y = WORLD_HEIGHT - 60;
  if (!Number.isFinite(player.vx)) player.vx = 0;
  if (!Number.isFinite(player.vy)) player.vy = 0;
  if (!Number.isFinite(player.energy)) player.energy = 0;
}

// Safety: release stuck inputs when the window/tab loses focus or touch is interrupted
function releaseAllKeys() {
  keys.left = false;
  keys.right = false;
  keys.up = false;
  document.querySelectorAll('.touch-btn.active').forEach(b => b.classList.remove('active'));
}
window.addEventListener('blur', releaseAllKeys);
document.addEventListener('visibilitychange', () => { if (document.hidden) releaseAllKeys(); });
window.addEventListener('touchend', (e) => { if (e.touches.length === 0) releaseAllKeys(); }, { passive: true });
window.addEventListener('touchcancel', releaseAllKeys, { passive: true });

// Fallback for browsers without CanvasRenderingContext2D.roundRect (older iOS Safari)
if (typeof CanvasRenderingContext2D !== 'undefined' && !CanvasRenderingContext2D.prototype.roundRect) {
  CanvasRenderingContext2D.prototype.roundRect = function (x, y, w, h, r) {
    let rad = Array.isArray(r) ? r[0] : (r || 0);
    rad = Math.min(rad, Math.abs(w) / 2, Math.abs(h) / 2);
    this.moveTo(x + rad, y);
    this.arcTo(x + w, y, x + w, y + h, rad);
    this.arcTo(x + w, y + h, x, y + h, rad);
    this.arcTo(x, y + h, x, y, rad);
    this.arcTo(x, y, x + w, y, rad);
    this.closePath();
  };
}
