// ============================================================================
// DOOM QUIZ 3D - Retro Raycasting First-Person Quiz Dungeon Crawler
// Pure Canvas 2D Fast Raycaster & Multiplayer Engine
// ============================================================================

const socket = io();

// Canvas & Viewport
const canvas = document.getElementById('doomCanvas');
const ctx = canvas.getContext('2d');

let viewWidth = 640;
let viewHeight = 400;

function resizeDoomCanvas() {
  const w = window.visualViewport ? window.visualViewport.width : window.innerWidth;
  const h = window.visualViewport ? window.visualViewport.height : window.innerHeight;
  canvas.width = w;
  canvas.height = h;
  viewWidth = w;
  viewHeight = h - 75; // Leave room for retro bottom HUD
}
window.addEventListener('resize', resizeDoomCanvas);
if (window.visualViewport) window.visualViewport.addEventListener('resize', resizeDoomCanvas);
resizeDoomCanvas();

// URL Query Params
const urlParams = new URLSearchParams(window.location.search);
const roomCode = urlParams.get('gc') || urlParams.get('code') || '311866';
const paramName = urlParams.get('name') || '';
const paramStudentNo = urlParams.get('sno') || urlParams.get('studentNo') || '';
const paramAvatar = urlParams.get('avatar') || '👿';

// Sound Engine using Web Audio API
class DoomSoundSynth {
  constructor() {
    this.ctx = null;
    this.bgmPlaying = false;
    this.bgmTimer = null;
  }

  init() {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) this.ctx = new AudioCtx();
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  playShotgun() {
    this.init();
    if (!this.ctx) return;
    const now = this.ctx.currentTime;

    // Noise burst for shotgun blast
    const bufferSize = this.ctx.sampleRate * 0.35;
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (this.ctx.sampleRate * 0.08));
    }
    const noise = this.ctx.createBufferSource();
    noise.buffer = buffer;

    // Filter
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(1400, now);
    filter.frequency.exponentialRampToValueAtTime(100, now + 0.35);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.9, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.35);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(this.ctx.destination);
    noise.start(now);

    // Deep sub bass thump
    const osc = this.ctx.createOscillator();
    const oscGain = this.ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(160, now);
    osc.frequency.exponentialRampToValueAtTime(30, now + 0.25);
    oscGain.gain.setValueAtTime(0.7, now);
    oscGain.gain.exponentialRampToValueAtTime(0.01, now + 0.25);
    osc.connect(oscGain);
    oscGain.connect(this.ctx.destination);
    osc.start(now);
    osc.stop(now + 0.25);
  }

  playPlasma() {
    this.init();
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(950, now);
    osc.frequency.exponentialRampToValueAtTime(180, now + 0.15);
    gain.gain.setValueAtTime(0.5, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.15);
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(now);
    osc.stop(now + 0.15);
  }

  playBFG() {
    this.init();
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(80, now);
    osc.frequency.linearRampToValueAtTime(220, now + 0.5);
    osc.frequency.exponentialRampToValueAtTime(35, now + 1.2);
    gain.gain.setValueAtTime(0.9, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 1.2);
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(now);
    osc.stop(now + 1.2);
  }

  playMonsterHurt() {
    this.init();
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(260, now);
    osc.frequency.linearRampToValueAtTime(90, now + 0.2);
    gain.gain.setValueAtTime(0.6, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.2);
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(now);
    osc.stop(now + 0.2);
  }

  playPlayerHurt() {
    this.init();
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(140, now);
    osc.frequency.linearRampToValueAtTime(60, now + 0.3);
    gain.gain.setValueAtTime(0.8, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.3);
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(now);
    osc.stop(now + 0.3);
  }

  playQuizCorrect() {
    this.init();
    if (!this.ctx) return;
    const notes = [523.25, 659.25, 783.99, 1046.50]; // C5, E5, G5, C6
    notes.forEach((freq, idx) => {
      const now = this.ctx.currentTime + idx * 0.08;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now);
      gain.gain.setValueAtTime(0.4, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(now);
      osc.stop(now + 0.25);
    });
  }

  playQuizWrong() {
    this.init();
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(180, now);
    osc.frequency.linearRampToValueAtTime(110, now + 0.35);
    gain.gain.setValueAtTime(0.5, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.35);
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(now);
    osc.stop(now + 0.35);
  }

  toggleBgm() {
    this.init();
    if (this.bgmPlaying) {
      if (this.bgmTimer) clearInterval(this.bgmTimer);
      this.bgmPlaying = false;
      return false;
    }
    this.bgmPlaying = true;
    let step = 0;
    const bassline = [65.41, 65.41, 77.78, 65.41, 87.31, 82.41, 65.41, 73.42]; // E1M1 inspired
    this.bgmTimer = setInterval(() => {
      if (!this.bgmPlaying || !this.ctx) return;
      const freq = bassline[step % bassline.length];
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(freq, now);
      gain.gain.setValueAtTime(0.18, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.16);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(now);
      osc.stop(now + 0.16);
      step++;
    }, 180);
    return true;
  }
}
const doomSound = new DoomSoundSynth();

// ============================================================================
// 3D DUNGEON MAP (24 x 24 Grid)
// 0: Empty Pathway
// 1: Metal Tech Wall (푸른빛 SF 메탈)
// 2: Dungeon Stone Wall (고대 돌벽)
// 3: Hellfire Rune Wall (붉은 지옥불 벽)
// 4: Quiz Locked Door (노란색 퀴즈 잠금 문)
// 5: Quiz Terminal Station (탄약/에너지 보급 단말기)
// 9: Boss Arena Arch
// ============================================================================
const MAP_W = 24;
const MAP_H = 24;
const DUNGEON_MAP = [
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

// Procedural 64x64 Textures Generated on Offscreen Canvases
const TEXTURE_SIZE = 64;
const textures = {};

function initTextures() {
  function makeCanvas() {
    const c = document.createElement('canvas');
    c.width = TEXTURE_SIZE;
    c.height = TEXTURE_SIZE;
    return c;
  }

  // 1: Blue Sci-Fi Tech Wall
  {
    const c = makeCanvas();
    const cx = c.getContext('2d');
    cx.fillStyle = '#1e293b';
    cx.fillRect(0, 0, 64, 64);
    cx.strokeStyle = '#334155';
    cx.lineWidth = 3;
    cx.strokeRect(2, 2, 60, 60);
    cx.strokeRect(10, 10, 44, 44);
    // Neon pipes
    cx.fillStyle = '#0284c7';
    cx.fillRect(4, 28, 56, 8);
    cx.fillStyle = '#38bdf8';
    cx.fillRect(6, 30, 52, 4);
    // Rivets
    cx.fillStyle = '#94a3b8';
    [[6,6], [58,6], [6,58], [58,58], [20,20], [44,20], [20,44], [44,44]].forEach(([rx, ry]) => {
      cx.beginPath();
      cx.arc(rx, ry, 2.5, 0, Math.PI * 2);
      cx.fill();
    });
    textures[1] = c;
  }

  // 2: Ancient Dungeon Stone Wall
  {
    const c = makeCanvas();
    const cx = c.getContext('2d');
    cx.fillStyle = '#334155';
    cx.fillRect(0, 0, 64, 64);
    cx.strokeStyle = '#0f172a';
    cx.lineWidth = 2;
    // Bricks
    for (let y = 0; y < 64; y += 16) {
      cx.beginPath();
      cx.moveTo(0, y);
      cx.lineTo(64, y);
      cx.stroke();
      const offset = (y % 32 === 0) ? 0 : 16;
      for (let x = offset; x < 64; x += 32) {
        cx.beginPath();
        cx.moveTo(x, y);
        cx.lineTo(x, y + 16);
        cx.stroke();
      }
    }
    // Moss stains
    cx.fillStyle = 'rgba(16, 185, 129, 0.25)';
    cx.fillRect(12, 18, 18, 12);
    cx.fillRect(36, 42, 20, 10);
    textures[2] = c;
  }

  // 3: Hellfire Rune Wall
  {
    const c = makeCanvas();
    const cx = c.getContext('2d');
    cx.fillStyle = '#450a0a';
    cx.fillRect(0, 0, 64, 64);
    cx.strokeStyle = '#7f1d1d';
    cx.lineWidth = 3;
    cx.strokeRect(3, 3, 58, 58);
    // Magma veins
    cx.strokeStyle = '#f97316';
    cx.lineWidth = 2;
    cx.beginPath();
    cx.moveTo(10, 0); cx.lineTo(24, 25); cx.lineTo(15, 45); cx.lineTo(30, 64);
    cx.moveTo(50, 0); cx.lineTo(40, 30); cx.lineTo(55, 64);
    cx.stroke();
    // Glowing Demonic Rune
    cx.fillStyle = '#ef4444';
    cx.font = 'bold 24px monospace';
    cx.textAlign = 'center';
    cx.textBaseline = 'middle';
    cx.fillText('⛧', 32, 32);
    textures[3] = c;
  }

  // 4: Quiz Locked Door (Yellow/Black Hazard)
  {
    const c = makeCanvas();
    const cx = c.getContext('2d');
    cx.fillStyle = '#0f172a';
    cx.fillRect(0, 0, 64, 64);
    // Hazard Stripes
    cx.fillStyle = '#eab308';
    for (let i = -64; i < 128; i += 16) {
      cx.beginPath();
      cx.moveTo(i, 0);
      cx.lineTo(i + 8, 0);
      cx.lineTo(i + 24, 64);
      cx.lineTo(i + 16, 64);
      cx.fill();
    }
    // Big Center Lock Badge
    cx.fillStyle = 'rgba(15, 23, 42, 0.9)';
    cx.fillRect(12, 16, 40, 32);
    cx.strokeStyle = '#eab308';
    cx.lineWidth = 2;
    cx.strokeRect(12, 16, 40, 32);
    cx.fillStyle = '#ffffff';
    cx.font = 'bold 16px sans-serif';
    cx.textAlign = 'center';
    cx.textBaseline = 'middle';
    cx.fillText('🔒', 32, 32);
    textures[4] = c;
  }

  // 5: Cyber Quiz Terminal Station
  {
    const c = makeCanvas();
    const cx = c.getContext('2d');
    cx.fillStyle = '#022c22';
    cx.fillRect(0, 0, 64, 64);
    cx.strokeStyle = '#10b981';
    cx.lineWidth = 3;
    cx.strokeRect(4, 4, 56, 56);
    // Green Terminal Screen
    cx.fillStyle = '#064e3b';
    cx.fillRect(10, 10, 44, 30);
    cx.fillStyle = '#34d399';
    cx.font = 'bold 11px monospace';
    cx.textAlign = 'center';
    cx.fillText('Q&A [E]', 32, 28);
    // Control panel buttons
    cx.fillStyle = '#10b981';
    cx.fillRect(14, 46, 8, 8);
    cx.fillStyle = '#f59e0b';
    cx.fillRect(28, 46, 8, 8);
    cx.fillStyle = '#ef4444';
    cx.fillRect(42, 46, 8, 8);
    textures[5] = c;
  }

  // 9: Boss Gate
  {
    const c = makeCanvas();
    const cx = c.getContext('2d');
    cx.fillStyle = '#581c87';
    cx.fillRect(0, 0, 64, 64);
    cx.strokeStyle = '#a855f7';
    cx.lineWidth = 4;
    cx.strokeRect(2, 2, 60, 60);
    cx.fillStyle = '#c084fc';
    cx.font = 'bold 26px sans-serif';
    cx.textAlign = 'center';
    cx.textBaseline = 'middle';
    cx.fillText('👑', 32, 32);
    textures[9] = c;
  }
}
initTextures();

// ============================================================================
// PLAYER STATE
// ============================================================================
const player = {
  x: 2.5,
  y: 2.5,
  dirX: 1,
  dirY: 0,
  planeX: 0,
  planeY: 0.66, // FOV ~66 degrees
  moveSpeed: 0.065,
  rotSpeed: 0.05,

  health: 100,
  armor: 100,
  ammo: 60,
  kills: 0,
  score: 0,
  streak: 0,

  weapon: 1, // 1: Shotgun, 2: Plasma, 3: BFG
  shootCooldown: 0,
  isShooting: false,
  kickY: 0,
  muzzleFlash: 0,

  name: '',
  nickname: '',
  studentNo: null,
  avatar: '🐱',

  bfgUnlocked: false,
  damageFlash: 0,
  invulnerableTimer: 300, // 5 seconds initial spawn invulnerability!
  iFrameTimer: 0, // Post-damage grace period
  faceState: 'normal', // 'normal', 'grin', 'hurt', 'dead'
  faceTimer: 0
};

// Input State
const keys = {
  forward: false,
  backward: false,
  strafeLeft: false,
  strafeRight: false,
  turnLeft: false,
  turnRight: false,
  shoot: false
};

// Monsters in the Dungeon (Placed safely away from initial spawn room)
let monsters = [];

function initMonsters() {
  monsters = [
    { id: 1, type: 'imp', x: 8.5, y: 3.5, hp: 35, maxHp: 35, emoji: '👹', name: '화염 임프', speed: 0.020, attackCooldown: 0, isDead: false },
    { id: 2, type: 'demon', x: 14.5, y: 7.5, hp: 50, maxHp: 50, emoji: '👿', name: '핑키 데몬', speed: 0.028, attackCooldown: 0, isDead: false },
    { id: 3, type: 'caco', x: 19.5, y: 3.5, hp: 70, maxHp: 70, emoji: '👁️', name: '카코데몬', speed: 0.016, attackCooldown: 0, isDead: false },
    { id: 4, type: 'imp', x: 7.5, y: 14.5, hp: 35, maxHp: 35, emoji: '👹', name: '화염 임프', speed: 0.020, attackCooldown: 0, isDead: false },
    { id: 5, type: 'demon', x: 16.5, y: 14.5, hp: 50, maxHp: 50, emoji: '👿', name: '핑키 데몬', speed: 0.028, attackCooldown: 0, isDead: false },
    { id: 6, type: 'imp', x: 10.5, y: 17.5, hp: 35, maxHp: 35, emoji: '👹', name: '화염 임프', speed: 0.020, attackCooldown: 0, isDead: false },
    { id: 7, type: 'caco', x: 3.5, y: 20.5, hp: 70, maxHp: 70, emoji: '👁️', name: '카코데몬', speed: 0.016, attackCooldown: 0, isDead: false },
    { id: 8, type: 'demon', x: 18.5, y: 20.5, hp: 50, maxHp: 50, emoji: '👿', name: '핑키 데몬', speed: 0.028, attackCooldown: 0, isDead: false },
    // Boss in the Boss Chamber
    { id: 99, type: 'boss', x: 12.5, y: 21.5, hp: 700, maxHp: 700, emoji: '💀', name: '사이버 데몬 보스', speed: 0.014, attackCooldown: 0, isDead: false }
  ];
}
initMonsters();

// Other Multiplayer Climbers / Doom Players
let otherPlayers = {}; // id -> player ghost
let zBuffer = []; // Distance array for sprite sorting

// Game Mode & Team State
let currentDoomSubMode = 'pve'; // 'pve', 'pvp', 'team'
let isTeamMode = false;
let myTeamId = null;
let myTeamInfo = null;
let doomTeams = {};

function updateDoomModeHUD() {
  const modeBadge = document.getElementById('hudModeBadge');
  const teamBadge = document.getElementById('hudTeamBadge');
  if (modeBadge) {
    if (currentDoomSubMode === 'pve') {
      modeBadge.innerHTML = '🎯 몬스터 사냥';
      modeBadge.style.color = '#10b981';
      modeBadge.style.borderColor = '#10b981';
    } else if (currentDoomSubMode === 'pvp') {
      modeBadge.innerHTML = '⚔️ 플레이어 대전';
      modeBadge.style.color = '#ef4444';
      modeBadge.style.borderColor = '#ef4444';
    } else if (currentDoomSubMode === 'team') {
      modeBadge.innerHTML = '👥 조별 대항전';
      modeBadge.style.color = '#38bdf8';
      modeBadge.style.borderColor = '#38bdf8';
    }
  }
  if (teamBadge) {
    if (currentDoomSubMode === 'team' && myTeamInfo) {
      teamBadge.style.display = 'block';
      teamBadge.innerHTML = `${myTeamInfo.emoji || '👥'} ${myTeamInfo.name}`;
      teamBadge.style.color = myTeamInfo.color || '#38bdf8';
      teamBadge.style.borderColor = myTeamInfo.color || '#38bdf8';
    } else {
      teamBadge.style.display = 'none';
    }
  }
}

// Current Quiz State
let myPlayerId = null;
let currentQuestion = null;
let isQuizModalOpen = false;
let syncInterval = null;

// ============================================================================
// CONTROLS & INPUT LISTENERS
// ============================================================================
function setupControls() {
  window.addEventListener('keydown', (e) => {
    if (isQuizModalOpen) {
      if (e.key >= '1' && e.key <= '4') {
        submitQuizAnswer(parseInt(e.key, 10) - 1);
      }
      return;
    }

    const k = e.key.toLowerCase();
    if (k === 'w' || e.key === 'ArrowUp') keys.forward = true;
    if (k === 's' || e.key === 'ArrowDown') keys.backward = true;
    if (k === 'a') keys.strafeLeft = true;
    if (k === 'd') keys.strafeRight = true;
    if (e.key === 'ArrowLeft') keys.turnLeft = true;
    if (e.key === 'ArrowRight') keys.turnRight = true;

    if (e.code === 'Space') {
      triggerShoot();
    }
    if (k === 'e' || k === 'enter') {
      checkInteraction();
    }
    if (e.key === '1') switchWeapon(1);
    if (e.key === '2') switchWeapon(2);
    if (e.key === '3') switchWeapon(3);
  });

  window.addEventListener('keyup', (e) => {
    const k = e.key.toLowerCase();
    if (k === 'w' || e.key === 'ArrowUp') keys.forward = false;
    if (k === 's' || e.key === 'ArrowDown') keys.backward = false;
    if (k === 'a') keys.strafeLeft = false;
    if (k === 'd') keys.strafeRight = false;
    if (e.key === 'ArrowLeft') keys.turnLeft = false;
    if (e.key === 'ArrowRight') keys.turnRight = false;
  });

  // Mouse click to shoot
  canvas.addEventListener('mousedown', (e) => {
    if (e.button === 0 && !isQuizModalOpen) {
      triggerShoot();
    }
  });

  // Touch Controls for Mobile
  setupTouchControls();
}

function switchWeapon(w) {
  if (w === 3 && !player.bfgUnlocked) {
    showNotification('🔒 BFG 9000은 퀴즈 3연속 정답 시 잠금 해제됩니다!');
    return;
  }
  player.weapon = w;
  const names = ['', '슈퍼 샷건', '플라즈마 라이플', 'BFG 9000'];
  showNotification(`무기 변경: ${names[w]}`);
}

function triggerShoot() {
  if (player.shootCooldown > 0 || player.health <= 0) return;
  if (player.ammo <= 0) {
    doomSound.playPlayerHurt();
    showNotification('⚠️ 탄약이 바닥났습니다! [E] 키로 퀴즈를 맞혀 탄약을 보급받으세요!');
    openQuizModal('⚠️ 탄약 고갈! 퀴즈를 맞춰 탄약 40발을 보급받으세요!');
    return;
  }

  player.ammo--;
  player.shootCooldown = (player.weapon === 2) ? 6 : (player.weapon === 3) ? 40 : 18;
  player.isShooting = true;
  player.kickY = (player.weapon === 3) ? 35 : 22;
  player.muzzleFlash = 4;
  player.faceState = 'grin';
  player.faceTimer = 25;

  if (player.weapon === 1) {
    doomSound.playShotgun();
    shootRaycastWeapon(45);
  } else if (player.weapon === 2) {
    doomSound.playPlasma();
    shootRaycastWeapon(30);
  } else if (player.weapon === 3) {
    doomSound.playBFG();
    shootBFGWeapon();
  }

  // Socket broadcast shot
  socket.emit('doom-player-shot', { code: roomCode, playerId: myPlayerId, weapon: player.weapon });
}

function shootRaycastWeapon(damage) {
  // Hitscan: Check if crosshair aligns with any monster or enemy player in front
  let hitMonster = null;
  let minDistance = 999;

  monsters.forEach(m => {
    if (m.isDead) return;
    const dx = m.x - player.x;
    const dy = m.y - player.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist > 14) return;

    // Angle to monster vs player view angle
    const angleToMonster = Math.atan2(dy, dx);
    let playerAngle = Math.atan2(player.dirY, player.dirX);
    let diff = Math.abs(angleToMonster - playerAngle);
    while (diff > Math.PI) diff -= Math.PI * 2;
    diff = Math.abs(diff);

    if (diff < 0.22 && dist < minDistance) {
      minDistance = dist;
      hitMonster = m;
    }
  });

  // Hitscan for other players in PVP or Team mode
  let hitPlayer = null;
  let minPlayerDist = 999;

  if (currentDoomSubMode === 'pvp' || currentDoomSubMode === 'team') {
    Object.values(otherPlayers).forEach(op => {
      // In team mode, skip teammates (no friendly fire)
      if (currentDoomSubMode === 'team' && myTeamId && op.teamId && myTeamId === op.teamId) {
        return;
      }

      const dx = op.x - player.x;
      const dy = op.y - player.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist > 14) return;

      const angleToPlayer = Math.atan2(dy, dx);
      let playerAngle = Math.atan2(player.dirY, player.dirX);
      let diff = Math.abs(angleToPlayer - playerAngle);
      while (diff > Math.PI) diff -= Math.PI * 2;
      diff = Math.abs(diff);

      if (diff < 0.22 && dist < minPlayerDist) {
        minPlayerDist = dist;
        hitPlayer = op;
      }
    });
  }

  // Determine closest target (player vs monster)
  if (hitPlayer && (!hitMonster || minPlayerDist < minDistance)) {
    spawnDamageText(`-${damage}`, hitPlayer.x, hitPlayer.y);
    doomSound.playMonsterHurt();
    showNotification(`🎯 ${hitPlayer.name}님에게 ${damage} 데미지!`);
    socket.emit('doom-player-hit', {
      code: roomCode,
      attackerId: myPlayerId,
      targetId: hitPlayer.id,
      damage: damage,
      weapon: player.weapon
    });
    return;
  }

  if (hitMonster) {
    hitMonster.hp -= damage;
    doomSound.playMonsterHurt();
    spawnDamageText(`-${damage}`, hitMonster.x, hitMonster.y);

    if (hitMonster.hp <= 0) {
      hitMonster.isDead = true;
      player.kills++;
      const scoreGain = (hitMonster.type === 'boss') ? 2000 : 150;
      player.score += scoreGain;
      showNotification(`💀 ${hitMonster.name} 처치 완료! (+${scoreGain}점)`);

      socket.emit('doom-monster-kill', {
        code: roomCode,
        playerId: myPlayerId,
        monsterType: hitMonster.type,
        scoreGained: scoreGain
      });

      if (hitMonster.type === 'boss') {
        socket.emit('doom-boss-hit', { code: roomCode, playerId: myPlayerId, damage: 9999 });
      }
    } else if (hitMonster.type === 'boss') {
      socket.emit('doom-boss-hit', { code: roomCode, playerId: myPlayerId, damage });
    }
  }
}

function shootBFGWeapon() {
  // Screen green flash and wipe out monsters in FOV
  player.damageFlash = -15; // Green screen flash
  monsters.forEach(m => {
    if (m.isDead) return;
    const dx = m.x - player.x;
    const dy = m.y - player.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < 15) {
      m.hp -= 250;
      if (m.hp <= 0) {
        m.isDead = true;
        player.kills++;
        player.score += 200;
      }
    }
  });

  // Splash damage on enemies in PVP or Team mode
  if (currentDoomSubMode === 'pvp' || currentDoomSubMode === 'team') {
    Object.values(otherPlayers).forEach(op => {
      if (currentDoomSubMode === 'team' && myTeamId && op.teamId && myTeamId === op.teamId) return;
      const dx = op.x - player.x;
      const dy = op.y - player.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < 15) {
        socket.emit('doom-player-hit', {
          code: roomCode,
          attackerId: myPlayerId,
          targetId: op.id,
          damage: 75,
          weapon: 3
        });
      }
    });
  }

  showNotification('💥 BFG 9000 궤멸 펄스 발사! 주변 적 괴멸!');
}

function checkInteraction() {
  // Check if player is near a Quiz Gate (4) or Quiz Terminal (5)
  const frontX = Math.floor(player.x + player.dirX * 1.2);
  const frontY = Math.floor(player.y + player.dirY * 1.2);

  if (frontX >= 0 && frontX < MAP_W && frontY >= 0 && frontY < MAP_H) {
    const tile = DUNGEON_MAP[frontY][frontX];
    if (tile === 4) {
      openQuizModal('🔒 잠긴 퀴즈 게이트입니다! 문제를 맞춰 문을 개방하세요!');
      return;
    }
    if (tile === 5) {
      openQuizModal('🔋 퀴즈 단말기입니다! 문제를 맞춰 탄약(+40)과 체력(+25)을 충전하세요!');
      return;
    }
    if (tile === 9) {
      openQuizModal('👑 보스 룸 게이트입니다! 최종 보스 퀴즈를 해결하세요!');
      return;
    }
  }

  // Open general quiz if pressed E anywhere
  openQuizModal('📖 배움의 퀴즈 스테이션: 문제를 맞춰 무기를 충전하세요!');
}

// Touch On-Screen Controls for Chromebook / Mobile
function setupTouchControls() {
  const joy = document.getElementById('touchJoyStick');
  const shootBtn = document.getElementById('touchShootBtn');
  const quizBtn = document.getElementById('touchQuizBtn');

  if (shootBtn) {
    shootBtn.addEventListener('touchstart', (e) => {
      e.preventDefault();
      triggerShoot();
    });
  }

  if (quizBtn) {
    quizBtn.addEventListener('touchstart', (e) => {
      e.preventDefault();
      checkInteraction();
    });
  }
}

// ============================================================================
// RAYCASTING 3D RENDER LOOP
// ============================================================================
function updatePlayerMovement() {
  if (player.shootCooldown > 0) player.shootCooldown--;
  if (player.kickY > 0) player.kickY *= 0.82;
  if (player.muzzleFlash > 0) player.muzzleFlash--;
  if (player.damageFlash > 0) player.damageFlash--;
  if (player.invulnerableTimer > 0) player.invulnerableTimer--;
  if (player.iFrameTimer > 0) player.iFrameTimer--;

  if (player.faceTimer > 0) {
    player.faceTimer--;
    if (player.faceTimer <= 0) player.faceState = 'normal';
  }

  // Complete pause & 100% invulnerability during quiz solving
  if (isQuizModalOpen) return;

  const mSpeed = player.moveSpeed;
  const rSpeed = player.rotSpeed;

  // Rotation
  if (keys.turnLeft) {
    rotatePlayer(-rSpeed);
  }
  if (keys.turnRight) {
    rotatePlayer(rSpeed);
  }

  // Forward / Backward
  if (keys.forward) {
    const newX = player.x + player.dirX * mSpeed;
    const newY = player.y + player.dirY * mSpeed;
    if (canMoveTo(newX, player.y)) player.x = newX;
    if (canMoveTo(player.x, newY)) player.y = newY;
  }
  if (keys.backward) {
    const newX = player.x - player.dirX * mSpeed;
    const newY = player.y - player.dirY * mSpeed;
    if (canMoveTo(newX, player.y)) player.x = newX;
    if (canMoveTo(player.x, newY)) player.y = newY;
  }

  // Strafe
  if (keys.strafeLeft) {
    const newX = player.x - player.planeX * mSpeed;
    const newY = player.y - player.planeY * mSpeed;
    if (canMoveTo(newX, player.y)) player.x = newX;
    if (canMoveTo(player.x, newY)) player.y = newY;
  }
  if (keys.strafeRight) {
    const newX = player.x + player.planeX * mSpeed;
    const newY = player.y + player.planeY * mSpeed;
    if (canMoveTo(newX, player.y)) player.x = newX;
    if (canMoveTo(player.x, newY)) player.y = newY;
  }

  // Update Monsters AI
  updateMonsters();
}

function rotatePlayer(angle) {
  const oldDirX = player.dirX;
  player.dirX = player.dirX * Math.cos(angle) - player.dirY * Math.sin(angle);
  player.dirY = oldDirX * Math.sin(angle) + player.dirY * Math.cos(angle);

  const oldPlaneX = player.planeX;
  player.planeX = player.planeX * Math.cos(angle) - player.planeY * Math.sin(angle);
  player.planeY = oldPlaneX * Math.sin(angle) + player.planeY * Math.cos(angle);
}

function canMoveTo(x, y) {
  const mx = Math.floor(x);
  const my = Math.floor(y);
  if (mx < 0 || mx >= MAP_W || my < 0 || my >= MAP_H) return false;
  const tile = DUNGEON_MAP[my][mx];
  // 0 is walkable, and opened door is 0
  return tile === 0;
}

function updateMonsters() {
  // If player is solving quiz, freeze monster movement & attacks completely
  if (isQuizModalOpen) return;

  monsters.forEach(m => {
    if (m.isDead) return;
    if (m.attackCooldown > 0) m.attackCooldown--;

    const dx = player.x - m.x;
    const dy = player.y - m.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    // Spawn Safe Zone Protection: Monsters cannot enter initial spawn area (x < 6 && y < 6)
    if (player.x < 5.8 && player.y < 5.8 && (m.x > 6 || m.y > 6)) {
      return; // Do not pursue player into safe spawn room
    }

    // If close enough, pursue player
    if (dist < 8.5 && dist > 1.05) {
      const stepX = (dx / dist) * m.speed;
      const stepY = (dy / dist) * m.speed;
      if (canMoveTo(m.x + stepX, m.y)) m.x += stepX;
      if (canMoveTo(m.x, m.y + stepY)) m.y += stepY;
    }

    // Monster melee attack if very close and cooldown ready
    if (dist <= 1.05 && m.attackCooldown <= 0) {
      // 100% Invulnerability check: Spawn grace period, i-frame, or quiz open
      if (player.invulnerableTimer > 0 || player.iFrameTimer > 0 || isQuizModalOpen) {
        return; // Complete invulnerability!
      }

      m.attackCooldown = 80; // ~1.3s attack cooldown
      player.iFrameTimer = 55; // ~0.9s post-hit invulnerability

      // Balanced damage: Armor absorbs 60% of damage
      const rawDmg = (m.type === 'boss') ? 20 : (m.type === 'caco') ? 12 : (m.type === 'demon') ? 10 : 6;
      const absorbed = Math.min(player.armor, Math.floor(rawDmg * 0.6));
      const hpDmg = rawDmg - absorbed;

      player.armor = Math.max(0, player.armor - absorbed);
      player.health = Math.max(0, player.health - hpDmg);
      player.damageFlash = 5;
      player.faceState = 'hurt';
      player.faceTimer = 22;
      doomSound.playPlayerHurt();
      showNotification(`😱 ${m.name}의 공격! (체력 -${hpDmg}, 쉴드 -${absorbed})`);

      if (player.health <= 0) {
        player.faceState = 'dead';
        showGameOverModal();
      }
    }
  });
}

// ----------------------------------------------------------------------------
// RAYCASTING ENGINE DRAW
// ----------------------------------------------------------------------------
function renderDoom3D() {
  const w = viewWidth;
  const h = viewHeight;

  // 1. Draw Ceiling & Floor Gradients
  const ceilGrad = ctx.createLinearGradient(0, 0, 0, h / 2);
  ceilGrad.addColorStop(0, '#0a0a0f');
  ceilGrad.addColorStop(1, '#2d0a0a'); // Dark ominous blood sky
  ctx.fillStyle = ceilGrad;
  ctx.fillRect(0, 0, w, h / 2);

  const floorGrad = ctx.createLinearGradient(0, h / 2, 0, h);
  floorGrad.addColorStop(0, '#111827');
  floorGrad.addColorStop(1, '#030712');
  ctx.fillStyle = floorGrad;
  ctx.fillRect(0, h / 2, w, h / 2);

  // 2. Cast Rays for Each Screen Column (DDA Algorithm)
  zBuffer = new Array(w);
  const stripeWidth = Math.max(1, Math.floor(w / 320)); // Resolution scaling

  for (let x = 0; x < w; x += stripeWidth) {
    const cameraX = (2 * x) / w - 1;
    const rayDirX = player.dirX + player.planeX * cameraX;
    const rayDirY = player.dirY + player.planeY * cameraX;

    let mapX = Math.floor(player.x);
    let mapY = Math.floor(player.y);

    let sideDistX;
    let sideDistY;

    const deltaDistX = Math.abs(1 / rayDirX);
    const deltaDistY = Math.abs(1 / rayDirY);
    let perpWallDist;

    let stepX;
    let stepY;

    let hit = 0;
    let side; // 0: X-wall, 1: Y-wall

    if (rayDirX < 0) {
      stepX = -1;
      sideDistX = (player.x - mapX) * deltaDistX;
    } else {
      stepX = 1;
      sideDistX = (mapX + 1.0 - player.x) * deltaDistX;
    }

    if (rayDirY < 0) {
      stepY = -1;
      sideDistY = (player.y - mapY) * deltaDistY;
    } else {
      stepY = 1;
      sideDistY = (mapY + 1.0 - player.y) * deltaDistY;
    }

    // Perform DDA
    while (hit === 0) {
      if (sideDistX < sideDistY) {
        sideDistX += deltaDistX;
        mapX += stepX;
        side = 0;
      } else {
        sideDistY += deltaDistY;
        mapY += stepY;
        side = 1;
      }

      if (mapX >= 0 && mapX < MAP_W && mapY >= 0 && mapY < MAP_H) {
        if (DUNGEON_MAP[mapY][mapX] > 0) hit = 1;
      } else {
        hit = 1;
      }
    }

    if (side === 0) {
      perpWallDist = (mapX - player.x + (1 - stepX) / 2) / rayDirX;
    } else {
      perpWallDist = (mapY - player.y + (1 - stepY) / 2) / rayDirY;
    }

    for (let s = 0; s < stripeWidth; s++) {
      if (x + s < w) zBuffer[x + s] = perpWallDist;
    }

    // Calculate height of line to draw on screen
    const lineHeight = Math.floor(h / perpWallDist);
    const drawStart = Math.max(0, -lineHeight / 2 + h / 2);
    const drawEnd = Math.min(h - 1, lineHeight / 2 + h / 2);

    // Wall Texture mapping
    const wallType = (mapX >= 0 && mapX < MAP_W && mapY >= 0 && mapY < MAP_H) ? DUNGEON_MAP[mapY][mapX] : 1;
    const tex = textures[wallType] || textures[1];

    let wallX;
    if (side === 0) wallX = player.y + perpWallDist * rayDirY;
    else wallX = player.x + perpWallDist * rayDirX;
    wallX -= Math.floor(wallX);

    let texX = Math.floor(wallX * TEXTURE_SIZE);
    if (side === 0 && rayDirX > 0) texX = TEXTURE_SIZE - texX - 1;
    if (side === 1 && rayDirY < 0) texX = TEXTURE_SIZE - texX - 1;

    // Draw Texture Slice
    ctx.drawImage(
      tex,
      texX, 0, 1, TEXTURE_SIZE,
      x, drawStart, stripeWidth, drawEnd - drawStart
    );

    // Dark shading on Y-walls & Distance fog
    const shadowAlpha = (side === 1 ? 0.3 : 0.0) + Math.min(0.85, perpWallDist / 14);
    if (shadowAlpha > 0) {
      ctx.fillStyle = `rgba(0, 0, 0, ${shadowAlpha})`;
      ctx.fillRect(x, drawStart, stripeWidth, drawEnd - drawStart);
    }
  }

  // 3. Render Sprites (Monsters & Other Players)
  renderSprites(w, h);

  // 4. Render 1st-Person Weapon & Animations
  renderFirstPersonWeapon(w, h);

  // 5. Render Damage Flash / BFG Pulse
  if (player.damageFlash > 0) {
    ctx.fillStyle = `rgba(239, 68, 68, ${Math.min(0.45, player.damageFlash * 0.06)})`;
    ctx.fillRect(0, 0, w, h);
  } else if (player.damageFlash < 0) {
    ctx.fillStyle = 'rgba(16, 185, 129, 0.35)'; // BFG green flash
    ctx.fillRect(0, 0, w, h);
    player.damageFlash++;
  }

  // 5-1. Render Invulnerability Shield Overlay & Banner
  if (player.invulnerableTimer > 0) {
    const pulse = 0.2 + 0.15 * Math.sin(Date.now() * 0.008);
    ctx.strokeStyle = `rgba(56, 189, 248, ${pulse + 0.3})`;
    ctx.lineWidth = 10;
    ctx.strokeRect(4, 4, w - 8, h - 8);

    // Shield status badge
    ctx.fillStyle = 'rgba(15, 23, 42, 0.88)';
    ctx.fillRect(w / 2 - 120, 20, 240, 30);
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 2;
    ctx.strokeRect(w / 2 - 120, 20, 240, 30);

    ctx.fillStyle = '#38bdf8';
    ctx.font = 'bold 13px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(`🛡️ 스폰 무적 보호 중 (${(player.invulnerableTimer / 60).toFixed(1)}초)`, w / 2, 40);
  } else if (isQuizModalOpen) {
    // 100% Quiz Invulnerability Banner
    ctx.fillStyle = 'rgba(15, 23, 42, 0.88)';
    ctx.fillRect(w / 2 - 130, 20, 260, 30);
    ctx.strokeStyle = '#10b981';
    ctx.lineWidth = 2;
    ctx.strokeRect(w / 2 - 130, 20, 260, 30);

    ctx.fillStyle = '#10b981';
    ctx.font = 'bold 13px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('🛡️ 퀴즈 푸는 중: 완전 무적 보호 작동 중', w / 2, 40);
  }

  // 6. Draw Crosshair
  ctx.strokeStyle = '#38bdf8';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(w / 2 - 8, h / 2); ctx.lineTo(w / 2 + 8, h / 2);
  ctx.moveTo(w / 2, h / 2 - 8); ctx.lineTo(w / 2, h / 2 + 8);
  ctx.stroke();

  // 7. Render Retro Bottom DOOM HUD
  renderRetroHUD();
}

function renderSprites(w, h) {
  // Combine monsters & other players into sortable sprites
  const spriteList = [];

  monsters.forEach(m => {
    if (m.isDead) return;
    const dx = m.x - player.x;
    const dy = m.y - player.y;
    spriteList.push({
      x: m.x,
      y: m.y,
      dist: dx * dx + dy * dy,
      type: 'monster',
      data: m
    });
  });

  Object.values(otherPlayers).forEach(op => {
    const dx = op.x - player.x;
    const dy = op.y - player.y;
    spriteList.push({
      x: op.x,
      y: op.y,
      dist: dx * dx + dy * dy,
      type: 'player',
      data: op
    });
  });

  // Sort from farthest to nearest (Painter's algorithm)
  spriteList.sort((a, b) => b.dist - a.dist);

  spriteList.forEach(sp => {
    const spriteX = sp.x - player.x;
    const spriteY = sp.y - player.y;

    const invDet = 1.0 / (player.planeX * player.dirY - player.dirX * player.planeY);
    const transformX = invDet * (player.dirY * spriteX - player.dirX * spriteY);
    const transformY = invDet * (-player.planeY * spriteX + player.planeX * spriteY);

    if (transformY <= 0.15) return; // Behind camera

    const spriteScreenX = Math.floor((w / 2) * (1 + transformX / transformY));
    const spriteHeight = Math.abs(Math.floor(h / transformY));
    const drawStartY = Math.max(0, -spriteHeight / 2 + h / 2);
    const drawEndY = Math.min(h - 1, spriteHeight / 2 + h / 2);

    const spriteWidth = Math.abs(Math.floor(h / transformY));
    const drawStartX = Math.max(0, -spriteWidth / 2 + spriteScreenX);
    const drawEndX = Math.min(w - 1, spriteWidth / 2 + spriteScreenX);

    // Check Z-buffer at center
    if (spriteScreenX >= 0 && spriteScreenX < w && transformY < zBuffer[spriteScreenX]) {
      const size = Math.min(spriteHeight, 180);

      if (sp.type === 'monster') {
        const m = sp.data;
        ctx.font = `${Math.floor(size * 0.9)}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(m.emoji, spriteScreenX, h / 2);

        // Monster Health Bar
        const barW = Math.max(40, size * 0.8);
        const barH = 6;
        const barX = spriteScreenX - barW / 2;
        const barY = drawStartY - 10;
        ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
        ctx.fillRect(barX, barY, barW, barH);
        ctx.fillStyle = (m.type === 'boss') ? '#a855f7' : '#ef4444';
        ctx.fillRect(barX, barY, (m.hp / m.maxHp) * barW, barH);
      } else {
        // Other Player
        const p = sp.data;
        ctx.font = `${Math.floor(size * 0.8)}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(p.avatar || '🧑‍🚀', spriteScreenX, h / 2);

        // Team Badge Tag (if in Team Mode)
        if (isTeamMode && (p.teamName || (p.teamId && doomTeams[p.teamId]))) {
          const tName = p.teamName || (doomTeams[p.teamId] && doomTeams[p.teamId].name) || '';
          const tColor = p.teamColor || (doomTeams[p.teamId] && doomTeams[p.teamId].color) || '#38bdf8';
          const tEmoji = p.teamEmoji || (doomTeams[p.teamId] && doomTeams[p.teamId].emoji) || '👥';
          ctx.font = 'bold 11px sans-serif';
          ctx.fillStyle = tColor;
          ctx.strokeStyle = '#000000';
          ctx.lineWidth = 3;
          ctx.strokeText(`${tEmoji} ${tName}`, spriteScreenX, drawStartY - 24);
          ctx.fillText(`${tEmoji} ${tName}`, spriteScreenX, drawStartY - 24);
        }

        // Name Tag
        ctx.font = 'bold 12px sans-serif';
        ctx.fillStyle = (isTeamMode && p.teamColor) ? p.teamColor : '#ffffff';
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = 3;
        ctx.strokeText(p.name, spriteScreenX, drawStartY - 8);
        ctx.fillText(p.name, spriteScreenX, drawStartY - 8);
      }
    }
  });
}

function renderFirstPersonWeapon(w, h) {
  const centerX = w / 2;
  const centerY = h - 20 + player.kickY;

  // 1. Muzzle Flash
  if (player.muzzleFlash > 0) {
    ctx.save();
    ctx.beginPath();
    const flashGrad = ctx.createRadialGradient(centerX, centerY - 60, 5, centerX, centerY - 60, 70);
    if (player.weapon === 2) {
      flashGrad.addColorStop(0, '#ffffff');
      flashGrad.addColorStop(0.4, '#38bdf8');
      flashGrad.addColorStop(1, 'transparent');
    } else {
      flashGrad.addColorStop(0, '#ffffff');
      flashGrad.addColorStop(0.3, '#f59e0b');
      flashGrad.addColorStop(1, 'transparent');
    }
    ctx.fillStyle = flashGrad;
    ctx.arc(centerX, centerY - 60, 70, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // 2. Draw Weapon Sprite (Canvas Procedural Doom Shotgun / Plasma Gun)
  ctx.save();
  if (player.weapon === 1) {
    // Super Shotgun (Double Barrel)
    ctx.fillStyle = '#1e293b';
    ctx.fillRect(centerX - 35, centerY - 50, 70, 90);
    // Double Barrels
    ctx.fillStyle = '#334155';
    ctx.beginPath();
    ctx.arc(centerX - 16, centerY - 45, 15, 0, Math.PI * 2);
    ctx.arc(centerX + 16, centerY - 45, 15, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#0f172a';
    ctx.beginPath();
    ctx.arc(centerX - 16, centerY - 45, 10, 0, Math.PI * 2);
    ctx.arc(centerX + 16, centerY - 45, 10, 0, Math.PI * 2);
    ctx.fill();
    // Wood stock & Grip
    ctx.fillStyle = '#78350f';
    ctx.fillRect(centerX - 24, centerY + 15, 48, 50);
  } else if (player.weapon === 2) {
    // Plasma Gun
    ctx.fillStyle = '#0369a1';
    ctx.fillRect(centerX - 30, centerY - 60, 60, 100);
    // Glowing Plasma Coils
    ctx.fillStyle = '#38bdf8';
    for (let cy = centerY - 50; cy < centerY + 20; cy += 12) {
      ctx.fillRect(centerX - 24, cy, 48, 6);
    }
  } else if (player.weapon === 3) {
    // BFG 9000
    ctx.fillStyle = '#14532d';
    ctx.fillRect(centerX - 50, centerY - 70, 100, 110);
    // Glowing Green Core
    ctx.fillStyle = '#22c55e';
    ctx.beginPath();
    ctx.arc(centerX, centerY - 40, 24, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(centerX, centerY - 40, 10, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

// ----------------------------------------------------------------------------
// RETRO DOOM BOTTOM HUD
// ----------------------------------------------------------------------------
function renderRetroHUD() {
  const w = canvas.width;
  const h = canvas.height;
  const hudY = viewHeight;
  const hudH = 75;

  // Background Bar
  ctx.fillStyle = '#0f172a';
  ctx.fillRect(0, hudY, w, hudH);
  ctx.strokeStyle = '#334155';
  ctx.lineWidth = 3;
  ctx.strokeRect(0, hudY, w, hudH);

  // Layout slots
  const slotW = w / 5;

  // 1. AMMO
  ctx.fillStyle = '#eab308';
  ctx.font = 'bold 22px monospace';
  ctx.textAlign = 'center';
  ctx.fillText(`${player.ammo}`, slotW * 0.5, hudY + 45);
  ctx.fillStyle = '#94a3b8';
  ctx.font = 'bold 11px sans-serif';
  ctx.fillText('AMMO', slotW * 0.5, hudY + 63);

  // 2. HEALTH
  const hpColor = player.health >= 70 ? '#10b981' : player.health >= 35 ? '#f59e0b' : '#ef4444';
  ctx.fillStyle = hpColor;
  ctx.font = 'bold 22px monospace';
  ctx.fillText(`${player.health}%`, slotW * 1.5, hudY + 45);
  ctx.fillStyle = '#94a3b8';
  ctx.font = 'bold 11px sans-serif';
  ctx.fillText('HEALTH', slotW * 1.5, hudY + 63);

  // 3. DOOMGUY FACE (CENTER)
  renderDoomFace(slotW * 2.5, hudY + 38);

  // 4. ARMOR
  ctx.fillStyle = '#38bdf8';
  ctx.font = 'bold 22px monospace';
  ctx.fillText(`${player.armor}%`, slotW * 3.5, hudY + 45);
  ctx.fillStyle = '#94a3b8';
  ctx.font = 'bold 11px sans-serif';
  ctx.fillText('ARMOR', slotW * 3.5, hudY + 63);

  // 5. KILLS & QUIZ SCORE
  ctx.fillStyle = '#c084fc';
  ctx.font = 'bold 20px monospace';
  ctx.fillText(`K:${player.kills} | ${player.score}P`, slotW * 4.5, hudY + 45);
  ctx.fillStyle = '#94a3b8';
  ctx.font = 'bold 11px sans-serif';
  ctx.fillText('KILLS / SCORE', slotW * 4.5, hudY + 63);
}

function renderDoomFace(x, y) {
  // Classic Doomguy Face Avatar
  ctx.save();
  ctx.fillStyle = '#334155';
  ctx.fillRect(x - 22, y - 26, 44, 52);
  ctx.strokeStyle = '#64748b';
  ctx.lineWidth = 2;
  ctx.strokeRect(x - 22, y - 26, 44, 52);

  // Face Skin
  ctx.fillStyle = (player.faceState === 'dead') ? '#64748b' : '#fdba74';
  ctx.fillRect(x - 16, y - 20, 32, 40);

  // Eyes & Expression
  if (player.faceState === 'dead') {
    ctx.fillStyle = '#0f172a';
    ctx.font = 'bold 16px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('☠️', x, y + 2);
  } else if (player.faceState === 'grin') {
    // Maniac grin
    ctx.fillStyle = '#000000';
    ctx.fillRect(x - 10, y - 10, 6, 4);
    ctx.fillRect(x + 4, y - 10, 6, 4);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(x - 10, y + 4, 20, 6);
  } else if (player.faceState === 'hurt') {
    // Bleeding hurt face
    ctx.fillStyle = '#ef4444';
    ctx.fillRect(x - 14, y - 18, 28, 4);
    ctx.fillStyle = '#000000';
    ctx.fillRect(x - 10, y - 8, 6, 2);
    ctx.fillRect(x + 4, y - 8, 6, 2);
    ctx.fillRect(x - 8, y + 4, 16, 4);
  } else {
    // Normal confident eyes
    ctx.fillStyle = '#000000';
    ctx.fillRect(x - 10, y - 8, 6, 4);
    ctx.fillRect(x + 4, y - 8, 6, 4);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(x - 8, y - 7, 3, 3);
    ctx.fillRect(x + 6, y - 7, 3, 3);
    ctx.fillStyle = '#000000';
    ctx.fillRect(x - 6, y + 6, 12, 2);
  }
  ctx.restore();
}

// ----------------------------------------------------------------------------
// NOTIFICATIONS & POPUPS
// ----------------------------------------------------------------------------
function showNotification(msg) {
  const el = document.getElementById('doomNotification');
  if (el) {
    el.innerText = msg;
    el.style.opacity = '1';
    clearTimeout(el.hideTimer);
    el.hideTimer = setTimeout(() => {
      el.style.opacity = '0';
    }, 2800);
  }
}

function spawnDamageText(text, x, y) {
  // Visual hit text popup
  showNotification(text);
}

// ============================================================================
// QUIZ MODAL & INTEGRATION
// ============================================================================
function openQuizModal(titleText) {
  if (isQuizModalOpen) return;
  isQuizModalOpen = true;

  const modal = document.getElementById('doomQuizModal');
  const title = document.getElementById('doomQuizTitle');
  if (modal) modal.style.display = 'flex';
  if (title && titleText) title.innerText = titleText;

  renderCurrentQuestion();
}

function closeQuizModal() {
  isQuizModalOpen = false;
  const modal = document.getElementById('doomQuizModal');
  if (modal) modal.style.display = 'none';
}

function renderCurrentQuestion() {
  const qBox = document.getElementById('doomQuestionText');
  const optBox = document.getElementById('doomOptionsContainer');
  if (!qBox || !optBox) return;

  if (!currentQuestion) {
    qBox.innerText = '문제를 불러오는 중입니다...';
    optBox.innerHTML = '';
    return;
  }

  qBox.innerText = currentQuestion.question;
  optBox.innerHTML = currentQuestion.options.map((opt, idx) => `
    <button type="button" class="btn btn-outline" style="padding: 0.85rem; font-size: 1.05rem; font-weight: 800; text-align: left; border-color: rgba(56, 189, 248, 0.4); background: rgba(15, 23, 42, 0.8); color: #fff;" onclick="submitQuizAnswer(${idx})">
      <span style="display: inline-block; width: 26px; height: 26px; border-radius: 6px; background: #0284c7; color: #fff; text-align: center; line-height: 26px; margin-right: 0.6rem; font-weight: 900;">${idx + 1}</span>
      ${opt}
    </button>
  `).join('');
}

function submitQuizAnswer(answerIndex) {
  socket.emit('doom-answer-quiz', {
    code: roomCode,
    playerId: myPlayerId,
    answerIndex
  }, (res) => {
    if (!res || !res.success) return;

    if (res.isCorrect) {
      doomSound.playQuizCorrect();
      player.ammo = res.totalAmmo;
      player.health = res.totalHealth;
      player.streak = res.streak;
      player.score += 250;
      if (res.bfgUnlocked) player.bfgUnlocked = true;
      player.invulnerableTimer = 120; // 2 seconds bonus invulnerability after correct answer!

      // Unlock nearby Quiz Door (tile 4 -> 0)
      unlockNearbyDoor();

      showNotification(`🎉 정답! 탄약(+${res.ammoGain}) & 체력(+${res.healthGain}) 충전 및 쉴드 활성화!`);
      closeQuizModal();
    } else {
      doomSound.playQuizWrong();
      player.streak = 0;
      player.health = Math.max(10, player.health - 15);
      player.damageFlash = 6;
      player.faceState = 'hurt';
      player.faceTimer = 20;
      showNotification('❌ 오답! 몬스터의 반격으로 체력이 감소했습니다! (-15 HP)');
    }

    if (res.nextQuestion) {
      currentQuestion = res.nextQuestion;
    }
  });
}

function unlockNearbyDoor() {
  const px = Math.floor(player.x);
  const py = Math.floor(player.y);
  for (let dy = -2; dy <= 2; dy++) {
    for (let dx = -2; dx <= 2; dx++) {
      const tx = px + dx;
      const ty = py + dy;
      if (tx >= 0 && tx < MAP_W && ty >= 0 && ty < MAP_H) {
        if (DUNGEON_MAP[ty][tx] === 4) {
          DUNGEON_MAP[ty][tx] = 0; // Door opened!
          showNotification('🔓 퀴즈 게이트가 열렸습니다! 전진하세요!');
        }
      }
    }
  }
}

function showGameOverModal() {
  const modal = document.getElementById('doomGameOverModal');
  if (modal) modal.style.display = 'flex';
}

function respawnPlayer() {
  player.health = 100;
  player.armor = 100;
  player.ammo = 60;
  player.x = 2.5;
  player.y = 2.5;
  player.dirX = 1;
  player.dirY = 0;
  player.planeX = 0;
  player.planeY = 0.66;
  player.invulnerableTimer = 300; // 5초간 무적 보호!
  player.iFrameTimer = 60;
  player.faceState = 'normal';

  // Push away any monsters near safe spawn room
  monsters.forEach(m => {
    if (!m.isDead && Math.hypot(m.x - 2.5, m.y - 2.5) < 7) {
      m.x = 10.5;
      m.y = 14.5;
      m.attackCooldown = 120;
    }
  });

  const modal = document.getElementById('doomGameOverModal');
  if (modal) modal.style.display = 'none';
  showNotification('🛡️ 리스폰 완료! 5초간 무적 쉴드가 활성화되었습니다!');
}

// ============================================================================
// JOIN MODAL & AVATARS
// ============================================================================
const DOOM_AVATARS = ['👹', '👿', '💀', '🤖', '🐱', '🦊', '🦁', '🧑‍🚀', '⚡', '🔥'];
let selectedDoomAvatar = '🧑‍🚀';

function setupDoomJoinUI() {
  const modal = document.getElementById('doomJoinModal');
  if (!modal) return;

  const sNoInput = document.getElementById('inputStudentNo');
  const nickInput = document.getElementById('inputNickname');
  const picker = document.getElementById('doomAvatarPicker');

  const savedNo = localStorage.getItem('bmn_studentNo');
  const savedNick = localStorage.getItem('bmn_nickname');
  const savedAvatar = localStorage.getItem('bmn_doom_avatar') || '🧑‍🚀';

  if (savedNo && sNoInput) sNoInput.value = savedNo;
  if (savedNick && nickInput) nickInput.value = savedNick;
  selectedDoomAvatar = savedAvatar;

  function renderPicker() {
    if (!picker) return;
    picker.innerHTML = DOOM_AVATARS.map(av => {
      const isSel = (av === selectedDoomAvatar);
      return `
        <button type="button" onclick="selectDoomAvatar('${av}')" style="font-size: 1.55rem; padding: 0.45rem 0.2rem; border-radius: 10px; border: 2px solid ${isSel ? '#ef4444' : 'rgba(255,255,255,0.1)'}; background: ${isSel ? 'rgba(239, 68, 68, 0.25)' : 'rgba(15, 23, 42, 0.6)'}; cursor: pointer; transition: all 0.15s ease; outline: none; transform: ${isSel ? 'scale(1.12)' : 'scale(1.0)'};">
          ${av}
        </button>
      `;
    }).join('');
  }

  window.selectDoomAvatar = function(av) {
    selectedDoomAvatar = av;
    renderPicker();
  };

  renderPicker();

  // If already specified in URL query
  if (paramName) {
    player.name = paramName;
    player.nickname = paramName;
    player.studentNo = paramStudentNo ? parseInt(paramStudentNo, 10) : null;
    player.avatar = paramAvatar || '🧑‍🚀';
    player.invulnerableTimer = 300; // 5초간 스폰 무적!
    modal.style.display = 'none';
    joinDoomRoom();
  } else {
    modal.style.display = 'flex';
  }
}

window.submitDoomJoin = function(e) {
  if (e) e.preventDefault();
  const sNoInput = document.getElementById('inputStudentNo');
  const nickInput = document.getElementById('inputNickname');
  const modal = document.getElementById('doomJoinModal');

  const sNoVal = sNoInput ? sNoInput.value.trim() : '';
  const nickVal = nickInput ? nickInput.value.trim() : '';

  if (!nickVal) {
    alert('별명 또는 이름을 입력해주세요!');
    if (nickInput) nickInput.focus();
    return;
  }

  const sNo = sNoVal ? parseInt(sNoVal, 10) : null;
  player.studentNo = sNo;
  player.nickname = nickVal;
  player.name = sNo ? `${sNo}번 ${nickVal}` : nickVal;
  player.avatar = selectedDoomAvatar || '🧑‍🚀';
  player.invulnerableTimer = 300; // 입장 후 5초간 스폰 무적 보호!

  if (sNo) localStorage.setItem('bmn_studentNo', String(sNo));
  else localStorage.removeItem('bmn_studentNo');
  localStorage.setItem('bmn_nickname', player.nickname);
  localStorage.setItem('bmn_doom_avatar', player.avatar);

  if (modal) modal.style.display = 'none';
  joinDoomRoom();
};

// ============================================================================
// SOCKET INTEGRATION
// ============================================================================
function joinDoomRoom() {
  socket.emit('join-room', {
    code: roomCode,
    name: player.name,
    nickname: player.nickname,
    studentNo: player.studentNo,
    avatar: player.avatar
  }, (res) => {
    if (!res.success) {
      alert(res.error || '게임 참가 실패');
      return;
    }
    myPlayerId = res.playerId;
    if (res.currentQuestion) currentQuestion = res.currentQuestion;

    if (res.config && res.config.doomSettings) {
      currentDoomSubMode = res.config.doomSettings.subMode || 'pve';
    }
    isTeamMode = !!res.isTeamMode;
    if (res.teams) doomTeams = res.teams;
    if (res.player && res.player.teamId) {
      myTeamId = res.player.teamId;
      myTeamInfo = doomTeams[myTeamId] || null;
    }
    updateDoomModeHUD();

    // Start sync broadcast loop (100ms)
    if (syncInterval) clearInterval(syncInterval);
    syncInterval = setInterval(() => {
      socket.emit('doom-player-sync', {
        code: roomCode,
        playerId: myPlayerId,
        x: player.x,
        y: player.y,
        angle: Math.atan2(player.dirY, player.dirX),
        health: player.health,
        armor: player.armor,
        ammo: player.ammo,
        kills: player.kills,
        score: player.score,
        teamId: myTeamId,
        teamName: myTeamInfo ? myTeamInfo.name : '',
        teamColor: myTeamInfo ? myTeamInfo.color : '',
        teamEmoji: myTeamInfo ? myTeamInfo.emoji : ''
      });
    }, 100);
  });

  socket.on('doom-player-sync', (p) => {
    if (p.id === myPlayerId) return;
    otherPlayers[p.id] = {
      ...p,
      lastSeen: Date.now()
    };
  });

  socket.on('doom-player-shot', ({ playerId, weapon }) => {
    if (playerId !== myPlayerId) {
      doomSound.playShotgun();
    }
  });

  socket.on('doom-config-updated', (config) => {
    if (config && config.doomSettings) {
      currentDoomSubMode = config.doomSettings.subMode || 'pve';
    }
    isTeamMode = (currentDoomSubMode === 'team');
    updateDoomModeHUD();
    const modeName = currentDoomSubMode === 'pve' ? '🎯 몬스터 사냥' : currentDoomSubMode === 'pvp' ? '⚔️ 플레이어 대전' : '👥 조별 대항전';
    showNotification(`🎮 호스트가 게임 모드를 [${modeName}]으로 변경했습니다.`);
  });

  socket.on('teams-updated', (data) => {
    doomTeams = data.teams || {};
    isTeamMode = !!data.isTeamMode;
    if (data.players) {
      const me = data.players.find(x => x.id === myPlayerId);
      if (me) {
        myTeamId = me.teamId;
        myTeamInfo = doomTeams[myTeamId] || null;
      }
      data.players.forEach(p => {
        if (otherPlayers[p.id]) {
          otherPlayers[p.id].teamId = p.teamId;
          if (doomTeams[p.teamId]) {
            otherPlayers[p.id].teamName = doomTeams[p.teamId].name;
            otherPlayers[p.id].teamColor = doomTeams[p.teamId].color;
            otherPlayers[p.id].teamEmoji = doomTeams[p.teamId].emoji;
          }
        }
      });
    }
    updateDoomModeHUD();
  });

  socket.on('doom-you-were-hit', ({ attackerId, attackerName, damage, weapon }) => {
    // Complete Invulnerability check
    if (player.invulnerableTimer > 0 || isQuizModalOpen) {
      showNotification(`🛡️ 무적 쉴드로 ${attackerName}님의 사격을 무효화했습니다!`);
      return;
    }

    player.iFrameTimer = 40;
    player.damageFlash = 15;
    doomSound.playOof();
    player.faceState = 'pain';
    player.faceTimer = 25;

    // Armor absorbs 60% of damage
    const absorbed = Math.min(player.armor, Math.floor(damage * 0.6));
    const hpLoss = damage - absorbed;
    player.armor -= absorbed;
    player.health = Math.max(0, player.health - hpLoss);

    showNotification(`⚠️ ${attackerName}님에게 피격당했습니다! (-${hpLoss} HP)`);

    if (player.health <= 0) {
      player.faceState = 'dead';
      doomSound.playOof();
      showNotification(`💀 ${attackerName}님에게 전사했습니다! (부활 중...)`);
      socket.emit('doom-player-killed', {
        code: roomCode,
        killerId: attackerId,
        victimId: myPlayerId
      });
      respawnPlayer();
    }
  });

  socket.on('doom-boss-update', ({ currentHealth, maxHealth, attackerName }) => {
    showNotification(`⚔️ ${attackerName}님이 보스를 공격했습니다! (보스 HP: ${currentHealth}/${maxHealth})`);
  });

  socket.on('new-question', (q) => {
    currentQuestion = q;
  });

  socket.on('game-ended', (report) => {
    const endModal = document.getElementById('doomGameEndModal');
    const reasonText = document.getElementById('doomEndReason');
    if (reasonText) reasonText.innerText = report.reason;
    if (endModal) endModal.style.display = 'flex';
  });
}

// ============================================================================
// MAIN GAME LOOP
// ============================================================================
function gameLoop() {
  updatePlayerMovement();
  renderDoom3D();
  requestAnimationFrame(gameLoop);
}

window.addEventListener('DOMContentLoaded', () => {
  setupDoomJoinUI();
  setupControls();
  requestAnimationFrame(gameLoop);
});
