const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const fs = require('fs');
const os = require('os');
const QRCode = require('qrcode');

const app = express();
app.set('trust proxy', 1);
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*' }
});

const PORT = process.env.PORT || 3000;

// Helper: Get all local network IPv4 addresses
function getAllIpv4Addresses() {
  const interfaces = os.networkInterfaces();
  const results = [];
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        results.push({ name, address: iface.address });
      }
    }
  }
  return results;
}

// Helper: Get local network IPv4 address for phone connectivity (prioritize Wi-Fi en0)
function getLocalIpAddress() {
  const interfaces = os.networkInterfaces();
  if (interfaces['en0']) {
    const v4 = interfaces['en0'].find(i => i.family === 'IPv4' && !i.internal);
    if (v4) return v4.address;
  }
  const all = getAllIpv4Addresses();
  return all.length > 0 ? all[0].address : 'localhost';
}

// Load questions
let quizSets = {};
try {
  const data = fs.readFileSync(path.join(__dirname, 'questions.json'), 'utf8');
  quizSets = JSON.parse(data);
} catch (e) {
  console.error('Failed to load questions.json', e);
}

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

// Convenience route for Gimkit-style URL: /join?gc=311866
app.get('/join', (req, res) => {
  const code = req.query.gc || req.query.code;
  const mode = req.query.mode;

  if (mode === 'dld') {
    return res.sendFile(path.join(__dirname, 'public', 'dont-look-down.html'));
  }
  if (mode === 'doom') {
    return res.sendFile(path.join(__dirname, 'public', 'doom.html'));
  }
  if (mode === 'classic') {
    return res.sendFile(path.join(__dirname, 'public', 'play.html'));
  }

  // Auto-detect room's gameType if room exists
  if (code && rooms[code]) {
    if (rooms[code].config && rooms[code].config.gameType === 'classic') {
      return res.sendFile(path.join(__dirname, 'public', 'play.html'));
    } else if (rooms[code].config && rooms[code].config.gameType === 'doom') {
      return res.sendFile(path.join(__dirname, 'public', 'doom.html'));
    } else {
      return res.sendFile(path.join(__dirname, 'public', 'dont-look-down.html'));
    }
  }

  // Default to Don't Look Down
  res.sendFile(path.join(__dirname, 'public', 'dont-look-down.html'));
});

// Route for Don't Look Down
app.get('/dld', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'dont-look-down.html'));
});

// Route for Don't Look Down Host
app.get('/host-dld', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'host-dld.html'));
});

// Route for Doom 3D Quiz Fortress
app.get('/doom', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'doom.html'));
});

// Route for Doom 3D Host
app.get('/host-doom', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'host-doom.html'));
});

// Get local server info (IP, port, join links)
app.get('/api/server-info', (req, res) => {
  const ip = getLocalIpAddress();
  const hostHeader = req.headers.host || '';
  const isLocalHost = hostHeader.includes('localhost') || hostHeader.startsWith('127.0.0.1') || hostHeader.startsWith('192.168.');
  const externalUrl = process.env.RENDER_EXTERNAL_URL || (!isLocalHost && hostHeader ? `${req.protocol}://${hostHeader}` : null);
  res.json({
    ip,
    port: PORT,
    allIps: getAllIpv4Addresses(),
    localUrl: `http://localhost:${PORT}`,
    networkUrl: externalUrl || `http://${ip}:${PORT}`,
    isCloud: !!externalUrl
  });
});

// Generate QR Code Data URL (PNG)
app.get('/api/qr', async (req, res) => {
  try {
    const text = req.query.text || '';
    if (!text) return res.status(400).json({ error: 'text 파라미터가 필요합니다.' });
    const dataUrl = await QRCode.toDataURL(text, {
      width: 400,
      margin: 2,
      color: {
        dark: '#0f172a',
        light: '#ffffff'
      }
    });
    res.json({ dataUrl });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get available quiz sets
app.get('/api/quiz-sets', (req, res) => {
  const summary = Object.keys(quizSets).map(key => ({
    id: key,
    name: quizSets[key].name,
    description: quizSets[key].description,
    count: quizSets[key].questions.length
  }));
  res.json(summary);
});

// Add custom quiz set
app.post('/api/quiz-sets', (req, res) => {
  const { id, name, description, questions } = req.body;
  if (!id || !name || !Array.isArray(questions) || questions.length === 0) {
    return res.status(400).json({ error: '잘못된 퀴즈 데이터입니다.' });
  }
  quizSets[id] = { name, description: description || '', questions };
  try {
    fs.writeFileSync(path.join(__dirname, 'questions.json'), JSON.stringify(quizSets, null, 2), 'utf8');
  } catch (err) {
    console.error('Failed to save questions.json', err);
  }
  res.json({ success: true, id, name, count: questions.length });
});

// Download sample Excel template for quiz authoring
app.get('/api/template/quiz-excel', (req, res) => {
  try {
    const XLSX = require('xlsx');
    const sampleData = [
      {
        "문제 (질문)": "대한민국의 수도는 어디일까요?",
        "보기1": "서울",
        "보기2": "부산",
        "보기3": "대구",
        "보기4": "인천",
        "정답번호 (1~4)": 1
      },
      {
        "문제 (질문)": "빛의 속도는 1초에 대략 몇 km를 이동할까요?",
        "보기1": "약 3만 km",
        "보기2": "약 30만 km",
        "보기3": "약 300만 km",
        "보기4": "약 3,000만 km",
        "정답번호 (1~4)": 2
      },
      {
        "문제 (질문)": "태양계에서 가장 큰 행성은 무엇일까요?",
        "보기1": "화성",
        "보기2": "토성",
        "보기3": "목성",
        "보기4": "지구",
        "정답번호 (1~4)": 3
      },
      {
        "문제 (질문)": "자바스크립트에서 상수를 선언할 때 사용하는 키워드는?",
        "보기1": "var",
        "보기2": "let",
        "보기3": "function",
        "보기4": "const",
        "정답번호 (1~4)": 4
      },
      {
        "문제 (질문)": "세계에서 가장 큰 바다는 어디일까요?",
        "보기1": "태평양",
        "보기2": "대서양",
        "보기3": "인도양",
        "보기4": "북극해",
        "정답번호 (1~4)": 1
      }
    ];

    const ws = XLSX.utils.json_to_sheet(sampleData);
    // Set column widths
    ws['!cols'] = [
      { wch: 45 }, // 문제
      { wch: 20 }, // 보기1
      { wch: 20 }, // 보기2
      { wch: 20 }, // 보기3
      { wch: 20 }, // 보기4
      { wch: 15 }  // 정답
    ];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "퀴즈템플릿");

    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    res.setHeader('Content-Disposition', 'attachment; filename="Gimkit_Quiz_Template.xlsx"');
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.send(buf);
  } catch (err) {
    res.status(500).json({ error: '엑셀 템플릿 생성 실패: ' + err.message });
  }
});

// Upgrade tier definitions
const UPGRADES = {
  moneyPerQuestion: [
    { level: 1, value: 1, cost: 0 },
    { level: 2, value: 5, cost: 15 },
    { level: 3, value: 20, cost: 100 },
    { level: 4, value: 100, cost: 800 },
    { level: 5, value: 500, cost: 6000 },
    { level: 6, value: 2500, cost: 40000 },
    { level: 7, value: 10000, cost: 250000 }
  ],
  streakBonus: [
    { level: 1, value: 1, cost: 0 },
    { level: 2, value: 5, cost: 20 },
    { level: 3, value: 25, cost: 150 },
    { level: 4, value: 150, cost: 1200 },
    { level: 5, value: 800, cost: 10000 },
    { level: 6, value: 4000, cost: 70000 }
  ],
  multiplier: [
    { level: 1, value: 1.0, cost: 0 },
    { level: 2, value: 1.5, cost: 50 },
    { level: 3, value: 2.0, cost: 350 },
    { level: 4, value: 3.0, cost: 2500 },
    { level: 5, value: 5.0, cost: 20000 },
    { level: 6, value: 10.0, cost: 150000 }
  ],
  insurance: [
    { level: 1, value: 0.0, label: '0%', cost: 0 },
    { level: 2, value: 0.5, label: '50% 감면', cost: 30 },
    { level: 3, value: 0.8, label: '80% 감면', cost: 250 },
    { level: 4, value: 1.0, label: '100% 면책', cost: 2000 }
  ]
};

const POWERUPS = {
  freeze: { id: 'freeze', name: '🧊 얼리기 (Freeze)', cost: 150, desc: '지정한 상대 1명을 12초간 얼려 문제를 풀지 못하게 합니다.' },
  shield: { id: 'shield', name: '🛡️ 방어막 (Shield)', cost: 200, desc: '상대방의 다음 1회 공격(얼리기 등)을 완벽히 차단합니다.' },
  lottery: { id: 'lottery', name: '🎰 메가 복권 (Lottery)', cost: 500, desc: '50% 확률로 현재 머니 2배 대박! 실패 시 20% 차감.' },
  emp: { id: 'emp', name: '⚡ EMP 전파방해', cost: 350, desc: '모든 경쟁자들의 화면을 6초간 노이즈로 마비시킵니다.' },
  gift: { id: 'gift', name: '🎁 머니 선물 ($100)', cost: 100, desc: '선택한 플레이어에게 $100을 즉시 선물합니다.' }
};

// Rooms state
// roomCode -> Room Object
const rooms = {};

// Helper: Generate 6-digit code
function generateRoomCode() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

// Bot Names & Avatars
const BOT_NAMES = ['스마트봇 🤖', '알파고 🧠', '번개토끼 ⚡', '열공냥이 🐱', '퀴즈마스터 👑', '럭키스타 🌟', '치타 🐆'];
const AVATARS = ['🐱', '🐶', '🦊', '🐼', '🐨', '🦁', '🚀', '🤖', '👾', '👑', '⚡', '🔥'];

// Default Team Presets
const DEFAULT_TEAMS = [
  { id: 'team_1', name: '1조 (레드)', color: '#ef4444', emoji: '🔴' },
  { id: 'team_2', name: '2조 (블루)', color: '#3b82f6', emoji: '🔵' },
  { id: 'team_3', name: '3조 (그린)', color: '#10b981', emoji: '🟢' },
  { id: 'team_4', name: '4조 (옐로)', color: '#f59e0b', emoji: '🟡' },
  { id: 'team_5', name: '5조 (퍼플)', color: '#8b5cf6', emoji: '🟣' },
  { id: 'team_6', name: '6조 (오렌지)', color: '#f97316', emoji: '🟠' }
];

class GameRoom {
  constructor(code, hostSocketId) {
    this.code = code;
    this.hostSocketId = hostSocketId;
    this.status = 'lobby'; // 'lobby' | 'playing' | 'ended'
    this.config = {
      gameType: 'dont-look-down', // 'dont-look-down' (default) | 'classic' | 'doom'
      mode: 'race', // 'race' or 'time'
      timeLimitSeconds: 600, // 10 min default
      targetBalance: 10000, // for classic race mode
      quizSetId: 'joseon-early',
      isTeamMode: false,
      dldSettings: {
        difficulty: 'normal',
        energyGain: 1000,
        jumpCost: 15,
        gemRate: 0.45,
        updraftRate: 0.10,
        startingEnergy: 1500
      },
      doomSettings: {
        difficulty: 'normal',
        targetKills: 25,
        bossHealth: 1000,
        currentBossHealth: 1000,
        ammoGain: 40,
        healthGain: 25
      }
    };
    this.remainingTime = 300;
    this.timerInterval = null;
    this.players = {}; // playerId -> player
    this.eventLogs = [];
    this.botIntervals = [];

    // Teams state
    this.teams = {
      'team_1': { ...DEFAULT_TEAMS[0] },
      'team_2': { ...DEFAULT_TEAMS[1] }
    };
  }

  addPlayer(id, name, avatar, socketId = null, isBot = false, studentNo = null, nickname = null) {
    const sNo = studentNo ? parseInt(studentNo, 10) : null;
    const nick = (nickname && nickname.trim()) || name || '참가자';
    const formattedName = sNo ? `${sNo}번 ${nick}` : nick;
    const player = {
      id,
      name: formattedName,
      nickname: nick,
      studentNo: sNo,
      avatar: avatar || '🐱',
      socketId,
      isBot,
      teamId: null,
      balance: 0,
      streak: 0,
      altitude: 0,
      energy: 1500,
      summit: 1,
      falls: 0,
      health: 100,
      armor: 50,
      ammo: 50,
      kills: 0,
      score: 0,
      doomX: 2.5,
      doomY: 2.5,
      doomAngle: 0,
      stats: {
        correct: 0,
        wrong: 0,
        maxStreak: 0,
        upgradesBought: 0,
        powerupsUsed: 0
      },
      upgrades: {
        moneyPerQuestion: 1,
        streakBonus: 1,
        multiplier: 1,
        insurance: 1
      },
      status: {
        isFrozen: false,
        frozenUntil: 0,
        hasShield: false,
        isEmped: false,
        empUntil: 0
      },
      currentQuestion: null,
      questionStartTime: Date.now()
    };
    this.players[id] = player;
    return player;
  }

  removePlayer(id) {
    delete this.players[id];
    this.broadcastTeams();
  }

  // Team Management Methods
  setTeamMode(enabled) {
    this.config.isTeamMode = !!enabled;
    if (this.config.isTeamMode && Object.keys(this.teams).length === 0) {
      this.teams['team_1'] = { ...DEFAULT_TEAMS[0] };
      this.teams['team_2'] = { ...DEFAULT_TEAMS[1] };
    }
    this.broadcastTeams();
    this.broadcastLeaderboard();
  }

  createTeam(name, color, emoji) {
    const nextIdx = Object.keys(this.teams).length + 1;
    const defaultT = DEFAULT_TEAMS[(nextIdx - 1) % DEFAULT_TEAMS.length];
    const teamId = 'team_' + Date.now() + '_' + Math.random().toString(36).substring(2, 5);
    const newTeam = {
      id: teamId,
      name: name || `${nextIdx}조`,
      color: color || defaultT.color,
      emoji: emoji || defaultT.emoji
    };
    this.teams[teamId] = newTeam;
    this.broadcastTeams();
    this.broadcastLeaderboard();
    return newTeam;
  }

  removeTeam(teamId) {
    delete this.teams[teamId];
    for (const p of Object.values(this.players)) {
      if (p.teamId === teamId) p.teamId = null;
    }
    this.broadcastTeams();
    this.broadcastLeaderboard();
  }

  updateTeam(teamId, { name, color, emoji }) {
    if (this.teams[teamId]) {
      if (name) this.teams[teamId].name = name;
      if (color) this.teams[teamId].color = color;
      if (emoji) this.teams[teamId].emoji = emoji;
      this.broadcastTeams();
      this.broadcastLeaderboard();
    }
  }

  assignPlayerToTeam(playerId, teamId) {
    const player = this.players[playerId];
    if (player) {
      player.teamId = (teamId && this.teams[teamId]) ? teamId : null;
      this.broadcastTeams();
      this.broadcastLeaderboard();
    }
  }

  autoAssignTeams(teamCount = 2) {
    const count = Math.max(2, Math.min(6, parseInt(teamCount, 10) || 2));
    this.config.isTeamMode = true;
    this.teams = {};
    for (let i = 0; i < count; i++) {
      const dt = DEFAULT_TEAMS[i % DEFAULT_TEAMS.length];
      this.teams[dt.id] = { ...dt };
    }

    const teamIds = Object.keys(this.teams);
    const pList = Object.values(this.players);
    for (let i = pList.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [pList[i], pList[j]] = [pList[j], pList[i]];
    }

    pList.forEach((p, idx) => {
      p.teamId = teamIds[idx % teamIds.length];
    });

    this.broadcastTeams();
    this.broadcastLeaderboard();
  }

  broadcastTeams() {
    io.to(this.code).emit('teams-updated', {
      isTeamMode: !!this.config.isTeamMode,
      teams: this.teams,
      players: Object.values(this.players).map(p => ({
        id: p.id,
        name: p.name,
        avatar: p.avatar,
        teamId: p.teamId,
        isBot: p.isBot
      }))
    });
  }

  getTeamLeaderboard() {
    const teamStats = {};
    for (const [tId, t] of Object.entries(this.teams)) {
      teamStats[tId] = {
        id: t.id,
        name: t.name,
        color: t.color,
        emoji: t.emoji,
        members: [],
        totalAltitude: 0,
        avgAltitude: 0,
        maxAltitude: 0,
        totalBalance: 0,
        avgBalance: 0,
        correctCount: 0
      };
    }

    for (const p of Object.values(this.players)) {
      if (p.teamId && teamStats[p.teamId]) {
        const ts = teamStats[p.teamId];
        const alt = p.altitude || 0;
        ts.members.push({
          id: p.id,
          name: p.name,
          avatar: p.avatar,
          altitude: alt,
          balance: p.balance || 0,
          isBot: p.isBot
        });
        ts.totalAltitude += alt;
        if (alt > ts.maxAltitude) ts.maxAltitude = alt;
        ts.totalBalance += (p.balance || 0);
        ts.totalKills = (ts.totalKills || 0) + (p.kills || 0);
        ts.totalScore = (ts.totalScore || 0) + (p.score || 0);
        ts.correctCount += (p.stats.correct || 0);
      }
    }

    const results = Object.values(teamStats).map(t => {
      const count = t.members.length;
      t.memberCount = count;
      t.avgAltitude = count > 0 ? Math.round(t.totalAltitude / count) : 0;
      t.avgBalance = count > 0 ? Math.round(t.totalBalance / count) : 0;
      t.avgKills = count > 0 ? Math.round((t.totalKills || 0) / count) : 0;
      return t;
    });

    results.sort((a, b) => {
      if (this.config.gameType === 'dont-look-down') {
        if (b.totalAltitude !== a.totalAltitude) return b.totalAltitude - a.totalAltitude;
        return b.avgAltitude - a.avgAltitude;
      }
      if (this.config.gameType === 'doom') {
        if ((b.totalKills || 0) !== (a.totalKills || 0)) return (b.totalKills || 0) - (a.totalKills || 0);
        return (b.totalScore || 0) - (a.totalScore || 0);
      }
      return b.totalBalance - a.totalBalance;
    });

    return results;
  }

  getLeaderboard() {
    return Object.values(this.players)
      .map(p => {
        const team = p.teamId && this.teams[p.teamId] ? this.teams[p.teamId] : null;
        const totalQ = (p.stats.correct || 0) + (p.stats.wrong || 0);
        const accuracy = totalQ > 0 ? Math.round(((p.stats.correct || 0) / totalQ) * 100) : 0;
        return {
          id: p.id,
          name: p.name,
          nickname: p.nickname || p.name,
          studentNo: p.studentNo != null ? p.studentNo : null,
          avatar: p.avatar,
          teamId: p.teamId || null,
          teamName: team ? team.name : '',
          teamColor: team ? team.color : '',
          teamEmoji: team ? team.emoji : '',
          balance: Math.round(p.balance),
          streak: p.streak,
          maxStreak: p.stats.maxStreak || p.streak || 0,
          altitude: Math.round(p.altitude || 0),
          summit: p.summit || 1,
          energy: Math.round(p.energy || 0),
          falls: p.falls || 0,
          health: p.health !== undefined ? p.health : 100,
          armor: p.armor !== undefined ? p.armor : 50,
          ammo: p.ammo !== undefined ? p.ammo : 50,
          kills: p.kills || 0,
          score: p.score || 0,
          isFrozen: p.status.isFrozen && Date.now() < p.status.frozenUntil,
          hasShield: p.status.hasShield,
          multiplier: UPGRADES.multiplier[p.upgrades.multiplier - 1].value,
          correctCount: p.stats.correct || 0,
          wrongCount: p.stats.wrong || 0,
          totalQuestions: totalQ,
          accuracy,
          isBot: p.isBot
        };
      })
      .sort((a, b) => {
        if (this.config.gameType === 'dont-look-down') {
          return b.altitude - a.altitude;
        }
        if (this.config.gameType === 'doom') {
          if ((b.kills || 0) !== (a.kills || 0)) return (b.kills || 0) - (a.kills || 0);
          return (b.score || 0) - (a.score || 0);
        }
        return b.balance - a.balance;
      });
  }

  addEventLog(text, icon = '📢') {
    const log = { id: Date.now() + Math.random(), text, icon, timestamp: Date.now() };
    this.eventLogs.unshift(log);
    if (this.eventLogs.length > 20) this.eventLogs.pop();
    io.to(this.code).emit('event-log', log);
  }

  getRandomQuestion() {
    const qset = quizSets[this.config.quizSetId] || quizSets['general'];
    if (!qset || !qset.questions || qset.questions.length === 0) {
      return {
        id: 'fallback',
        question: '대한민국의 수도는 어디일까요?',
        options: ['서울', '부산', '대구', '인천'],
        answer: 0
      };
    }
    const idx = Math.floor(Math.random() * qset.questions.length);
    return qset.questions[idx];
  }

  startGame() {
    this.status = 'playing';
    this.remainingTime = this.config.timeLimitSeconds;
    this.eventLogs = [];

    // Assign initial questions and reset state for all players
    for (const p of Object.values(this.players)) {
      p.balance = 0;
      p.streak = 0;
      p.altitude = 0;
      p.summit = 1;
      p.energy = (this.config.dldSettings && this.config.dldSettings.startingEnergy) || 1500;
      p.upgrades = { moneyPerQuestion: 1, streakBonus: 1, multiplier: 1, insurance: 1 };
      p.status = { isFrozen: false, frozenUntil: 0, hasShield: false, isEmped: false, empUntil: 0 };
      p.stats = { correct: 0, wrong: 0, upgradesBought: 0, powerupsUsed: 0 };
      p.currentQuestion = this.getRandomQuestion();
      p.questionStartTime = Date.now();
    }

    // Start timer if time mode
    if (this.timerInterval) clearInterval(this.timerInterval);
    this.timerInterval = setInterval(() => {
      if (this.status !== 'playing') return;

      // Update freeze/emp expiration
      const now = Date.now();
      for (const p of Object.values(this.players)) {
        if (p.status.isFrozen && now >= p.status.frozenUntil) {
          p.status.isFrozen = false;
          if (p.socketId) io.to(p.socketId).emit('freeze-expired');
        }
        if (p.status.isEmped && now >= p.status.empUntil) {
          p.status.isEmped = false;
          if (p.socketId) io.to(p.socketId).emit('emp-expired');
        }
      }

      if (this.config.mode === 'time') {
        this.remainingTime--;
        io.to(this.code).emit('timer-tick', { remainingTime: this.remainingTime });
        if (this.remainingTime <= 0) {
          this.endGame('시간 종료!');
        }
      }
    }, 1000);

    // Start Bots
    if (this.config.gameType === 'dont-look-down') {
      this.startDldBots();
    } else if (this.config.gameType === 'doom') {
      this.startDoomBots();
    } else {
      this.startBots();
    }

    const startMsg = (this.config.gameType === 'dont-look-down') 
      ? '🧗 Don\'t Look Down! 1,000m 정상을 향해 등반을 시작합니다! 아래를 보지 마세요!' 
      : (this.config.gameType === 'doom')
      ? '🔥 DOOM 3D: 배움의 던전 개방! 몬스터를 처치하고 퀴즈를 풀어 던전을 정복하세요!'
      : '🚀 게임이 시작되었습니다! 부자가 되어보세요!';
    this.addEventLog(startMsg, '🎉');
  }

  startDoomBots() {
    this.clearBots();
    const bots = Object.values(this.players).filter(p => p.isBot);
    for (const bot of bots) {
      bot.kills = 0;
      bot.score = 0;
      bot.health = 100;
      bot.ammo = 50;
      bot.doomX = 3 + Math.random() * 8;
      bot.doomY = 3 + Math.random() * 8;
      bot.doomAngle = Math.random() * Math.PI * 2;

      const runDoomBotLoop = () => {
        if (this.status !== 'playing') return;

        const intervalMs = 2000 + Math.random() * 2000;
        const timer = setTimeout(() => {
          if (this.status !== 'playing') return;

          // 80% chance bot defeats a monster
          if (Math.random() < 0.8) {
            bot.kills = (bot.kills || 0) + 1;
            bot.score = (bot.score || 0) + 150;
            bot.ammo = Math.max(10, (bot.ammo || 50) - 2);
            bot.stats.correct++;

            // Random movement
            bot.doomX += (Math.random() - 0.5) * 1.5;
            bot.doomY += (Math.random() - 0.5) * 1.5;
            bot.doomAngle += (Math.random() - 0.5) * 1.0;

            const targetKills = (this.config.doomSettings && this.config.doomSettings.targetKills) || 25;
            if (bot.kills >= targetKills) {
              this.endGame(`🏆 ${bot.name}님이 몬스터 ${targetKills}마리를 최초로 소탕하여 최종 우승했습니다! 🎉`);
              return;
            }
          }

          io.to(this.code).emit('doom-player-sync', {
            id: bot.id,
            name: bot.name,
            nickname: bot.nickname,
            studentNo: bot.studentNo,
            avatar: bot.avatar,
            kills: bot.kills,
            score: bot.score,
            health: bot.health,
            ammo: bot.ammo,
            x: bot.doomX,
            y: bot.doomY,
            angle: bot.doomAngle,
            isBot: true
          });

          this.broadcastLeaderboard();
          runDoomBotLoop();
        }, intervalMs);

        this.botIntervals.push(timer);
      };

      runDoomBotLoop();
    }
  }

  startDldBots() {
    this.clearBots();
    const bots = Object.values(this.players).filter(p => p.isBot);
    for (const bot of bots) {
      bot.altitude = 0;
      bot.summit = 1;
      bot.energy = 2500;

      const runDldBotLoop = () => {
        if (this.status !== 'playing') return;

        const intervalMs = 1200 + Math.random() * 1600;
        const timer = setTimeout(() => {
          if (this.status !== 'playing') return;

          // 85% chance bot climbs up 5~15m
          if (Math.random() < 0.85) {
            const gain = Math.floor(Math.random() * 10 + 5);
            bot.altitude = Math.min(1000, (bot.altitude || 0) + gain);
            bot.energy = Math.max(0, (bot.energy || 2500) - 20);

            // Summit thresholds: 1: 0-200, 2: 201-350, 3: 351-500, 4: 501-680, 5: 681-850, 6: 851-999
            if (bot.altitude >= 850) bot.summit = 6;
            else if (bot.altitude >= 680) bot.summit = 5;
            else if (bot.altitude >= 500) bot.summit = 4;
            else if (bot.altitude >= 350) bot.summit = 3;
            else if (bot.altitude >= 200) bot.summit = 2;
            else bot.summit = 1;

            if (bot.altitude >= 1000) {
              this.endGame(`🏆 ${bot.name}님이 1,000m 정상(Peak)을 최초로 정복했습니다! 🎉`);
              return;
            }
          } else {
            // 15% chance bot misses jump and falls 15~45m!
            if (bot.altitude > 25) {
              const fallAmount = Math.floor(Math.random() * 30 + 15);
              bot.altitude = Math.max(0, bot.altitude - fallAmount);
              this.addEventLog(`😱 ${bot.name}님이 발을 헛디뎌 -${fallAmount}m 추락했습니다!`, '📉');
            }
          }

          // Refill bot energy if low
          if (bot.energy < 400) {
            bot.energy += 2000;
            bot.stats.correct++;
          }

          io.to(this.code).emit('dld-player-sync', {
            id: bot.id,
            name: bot.name,
            avatar: bot.avatar,
            altitude: bot.altitude,
            summit: bot.summit,
            energy: bot.energy,
            isBot: true
          });

          this.broadcastLeaderboard();
          runDldBotLoop();
        }, intervalMs);

        this.botIntervals.push(timer);
      };
      runDldBotLoop();
    }
  }

  startBots() {
    this.clearBots();
    const bots = Object.values(this.players).filter(p => p.isBot);
    for (const bot of bots) {
      const runBotLoop = () => {
        if (this.status !== 'playing') return;
        
        // If frozen, wait
        if (bot.status.isFrozen && Date.now() < bot.status.frozenUntil) {
          setTimeout(runBotLoop, 2000);
          return;
        }

        // Delay between 3.5s to 6.5s to simulate thinking
        const thinkDelay = 3500 + Math.random() * 3000;
        const timer = setTimeout(() => {
          if (this.status !== 'playing') return;

          // Answer question with ~85% accuracy
          const isCorrect = Math.random() < 0.85;
          const q = bot.currentQuestion || this.getRandomQuestion();
          const chosenAnswer = isCorrect ? q.answer : (q.answer + 1) % 4;

          this.processAnswer(bot.id, chosenAnswer);

          // Bot Shopping Logic: check if can afford upgrades
          this.botShopDecision(bot);

          runBotLoop();
        }, thinkDelay);

        this.botIntervals.push(timer);
      };
      runBotLoop();
    }
  }

  botShopDecision(bot) {
    // Priority 1: Multiplier if can afford
    const nextMult = UPGRADES.multiplier[bot.upgrades.multiplier];
    if (nextMult && bot.balance >= nextMult.cost) {
      this.processUpgrade(bot.id, 'multiplier');
      return;
    }
    // Priority 2: Money per question
    const nextMPQ = UPGRADES.moneyPerQuestion[bot.upgrades.moneyPerQuestion];
    if (nextMPQ && bot.balance >= nextMPQ.cost) {
      this.processUpgrade(bot.id, 'moneyPerQuestion');
      return;
    }
    // Priority 3: Streak bonus
    const nextStreak = UPGRADES.streakBonus[bot.upgrades.streakBonus];
    if (nextStreak && bot.balance >= nextStreak.cost) {
      this.processUpgrade(bot.id, 'streakBonus');
      return;
    }
    // Priority 4: Shield if doesn't have shield
    if (!bot.status.hasShield && bot.balance >= POWERUPS.shield.cost && Math.random() < 0.3) {
      this.processPowerup(bot.id, 'shield');
      return;
    }
    // Priority 5: Freeze top player occasionally
    if (bot.balance >= POWERUPS.freeze.cost && Math.random() < 0.25) {
      const leaderboard = this.getLeaderboard();
      const topOpponent = leaderboard.find(p => p.id !== bot.id && !p.isFrozen);
      if (topOpponent) {
        this.processPowerup(bot.id, 'freeze', topOpponent.id);
      }
    }
  }

  clearBots() {
    for (const timer of this.botIntervals) clearTimeout(timer);
    this.botIntervals = [];
  }

  processAnswer(playerId, answerIndex) {
    const player = this.players[playerId];
    if (!player || this.status !== 'playing') return null;

    // Check freeze
    if (player.status.isFrozen && Date.now() < player.status.frozenUntil) {
      return { frozen: true, remaining: Math.ceil((player.status.frozenUntil - Date.now()) / 1000) };
    }

    const q = player.currentQuestion;
    if (!q) return null;

    const isCorrect = (answerIndex === q.answer);
    let delta = 0;

    const mpq = UPGRADES.moneyPerQuestion[player.upgrades.moneyPerQuestion - 1].value;
    const streakBonus = UPGRADES.streakBonus[player.upgrades.streakBonus - 1].value;
    const mult = UPGRADES.multiplier[player.upgrades.multiplier - 1].value;
    const insurance = UPGRADES.insurance[player.upgrades.insurance - 1].value;

    if (isCorrect) {
      player.streak++;
      player.stats.correct++;
      player.stats.maxStreak = Math.max(player.stats.maxStreak || 0, player.streak);
      const baseMoney = mpq;
      const streakMoney = (player.streak > 1) ? streakBonus * Math.min(player.streak - 1, 5) : 0;
      delta = (baseMoney + streakMoney) * mult;
      player.balance += delta;

      if (player.streak === 5 || player.streak === 10 || player.streak === 20) {
        this.addEventLog(`🔥 ${player.name}님이 ${player.streak}연속 정답 폭풍 질주 중!`, '🔥');
      }
    } else {
      player.streak = 0;
      player.stats.wrong++;
      const rawPenalty = mpq * mult * 0.5;
      const penalty = rawPenalty * (1 - insurance);
      delta = -penalty;
      player.balance = Math.max(0, player.balance - penalty);
    }

    // Set new question
    player.currentQuestion = this.getRandomQuestion();
    player.questionStartTime = Date.now();

    // Check race mode target
    if (this.config.mode === 'race' && player.balance >= this.config.targetBalance) {
      this.endGame(`🏆 ${player.name}님이 목표 금액($${this.config.targetBalance.toLocaleString()})을 달성하여 우승했습니다!`);
    }

    // Broadcast leaderboard update
    this.broadcastLeaderboard();

    return {
      isCorrect,
      delta: Math.round(delta),
      balance: Math.round(player.balance),
      streak: player.streak,
      correctAnswerIndex: q.answer,
      nextQuestion: {
        id: player.currentQuestion.id,
        question: player.currentQuestion.question,
        options: player.currentQuestion.options
      }
    };
  }

  processUpgrade(playerId, upgradeType) {
    const player = this.players[playerId];
    if (!player || this.status !== 'playing') return { success: false, reason: '게임 중이 아닙니다.' };

    const tiers = UPGRADES[upgradeType];
    if (!tiers) return { success: false, reason: '존재하지 않는 업그레이드입니다.' };

    const currentLevel = player.upgrades[upgradeType];
    if (currentLevel >= tiers.length) {
      return { success: false, reason: '이미 최고 레벨입니다.' };
    }

    const nextTier = tiers[currentLevel];
    if (player.balance < nextTier.cost) {
      return { success: false, reason: '머니가 부족합니다.' };
    }

    player.balance -= nextTier.cost;
    player.upgrades[upgradeType] = nextTier.level;
    player.stats.upgradesBought++;

    if (upgradeType === 'multiplier' && nextTier.value >= 3.0) {
      this.addEventLog(`💰 ${player.name}님이 [배율 x${nextTier.value}] 업그레이드를 장착했습니다!`, '⚡');
    }

    this.broadcastLeaderboard();

    return {
      success: true,
      upgradeType,
      newLevel: nextTier.level,
      balance: Math.round(player.balance),
      upgrades: player.upgrades
    };
  }

  processPowerup(playerId, powerupId, targetPlayerId = null) {
    const player = this.players[playerId];
    if (!player || this.status !== 'playing') return { success: false, reason: '게임 중이 아닙니다.' };

    const item = POWERUPS[powerupId];
    if (!item) return { success: false, reason: '존재하지 않는 아이템입니다.' };

    if (player.balance < item.cost) {
      return { success: false, reason: '머니가 부족합니다.' };
    }

    let detail = '';

    if (powerupId === 'freeze') {
      const target = this.players[targetPlayerId];
      if (!target) return { success: false, reason: '대상을 선택해주세요.' };
      if (target.id === player.id) return { success: false, reason: '자신은 얼릴 수 없습니다.' };

      player.balance -= item.cost;
      player.stats.powerupsUsed++;

      if (target.status.hasShield) {
        target.status.hasShield = false;
        this.addEventLog(`🛡️ ${target.name}님이 방어막으로 ${player.name}님의 얼리기 공격을 막아냈습니다!`, '🛡️');
        if (target.socketId) io.to(target.socketId).emit('shield-blocked', { from: player.name });
      } else {
        target.status.isFrozen = true;
        target.status.frozenUntil = Date.now() + 12000;
        this.addEventLog(`🧊 ${player.name}님이 ${target.name}님을 12초간 얼렸습니다!`, '🧊');
        if (target.socketId) io.to(target.socketId).emit('player-frozen', { duration: 12, from: player.name });
      }
      detail = `${target.name}에게 얼리기 사용!`;
    } 
    else if (powerupId === 'shield') {
      player.balance -= item.cost;
      player.stats.powerupsUsed++;
      player.status.hasShield = true;
      detail = '방어막이 활성화되었습니다.';
      if (player.socketId) io.to(player.socketId).emit('shield-activated');
    } 
    else if (powerupId === 'lottery') {
      player.balance -= item.cost;
      player.stats.powerupsUsed++;
      const won = Math.random() < 0.5;
      if (won) {
        const gain = Math.round(player.balance * 1.0);
        player.balance += gain;
        this.addEventLog(`🎰 ${player.name}님이 복권 대박으로 +$${gain.toLocaleString()} 획득!`, '💎');
        detail = `대박 당첨! +$${gain.toLocaleString()}`;
      } else {
        const loss = Math.round(player.balance * 0.25);
        player.balance = Math.max(0, player.balance - loss);
        this.addEventLog(`💸 ${player.name}님이 복권 꽝으로 -$${loss.toLocaleString()} 손실...`, '📉');
        detail = `꽝! -$${loss.toLocaleString()}`;
      }
    } 
    else if (powerupId === 'emp') {
      player.balance -= item.cost;
      player.stats.powerupsUsed++;
      const now = Date.now();
      for (const p of Object.values(this.players)) {
        if (p.id !== player.id) {
          if (p.status.hasShield) {
            p.status.hasShield = false;
            if (p.socketId) io.to(p.socketId).emit('shield-blocked', { from: player.name });
          } else {
            p.status.isEmped = true;
            p.status.empUntil = now + 6000;
            if (p.socketId) io.to(p.socketId).emit('player-emped', { duration: 6, from: player.name });
          }
        }
      }
      this.addEventLog(`⚡ ${player.name}님이 전체 EMP 전파방해를 터뜨렸습니다!`, '⚡');
      detail = '전체 플레이어 화면 방해 발동!';
    }
    else if (powerupId === 'gift') {
      const target = this.players[targetPlayerId];
      if (!target || target.id === player.id) return { success: false, reason: '선물할 대상을 선택하세요.' };
      player.balance -= 100;
      target.balance += 100;
      player.stats.powerupsUsed++;
      this.addEventLog(`🎁 ${player.name}님이 ${target.name}님에게 $100을 선물했습니다!`, '🎁');
      if (target.socketId) io.to(target.socketId).emit('received-gift', { from: player.name, amount: 100 });
      detail = `${target.name}님에게 $100 선물 완료!`;
    }

    this.broadcastLeaderboard();

    return {
      success: true,
      powerupId,
      balance: Math.round(player.balance),
      detail,
      hasShield: player.status.hasShield
    };
  }

  broadcastLeaderboard() {
    const lb = this.getLeaderboard();
    const teamLb = this.config.isTeamMode ? this.getTeamLeaderboard() : [];
    io.to(this.code).emit('leaderboard-updated', {
      leaderboard: lb,
      teamLeaderboard: teamLb,
      isTeamMode: !!this.config.isTeamMode
    });
  }

  endGame(reason = '게임이 종료되었습니다.') {
    if (this.status === 'ended') return;
    this.status = 'ended';

    if (this.timerInterval) {
      clearInterval(this.timerInterval);
      this.timerInterval = null;
    }
    this.clearBots();

    const leaderboard = this.getLeaderboard();
    const teamLeaderboard = this.config.isTeamMode ? this.getTeamLeaderboard() : [];
    const finalReport = {
      reason,
      leaderboard,
      teamLeaderboard,
      isTeamMode: !!this.config.isTeamMode,
      podium: leaderboard.slice(0, 3),
      teamPodium: teamLeaderboard.slice(0, 3),
      totalPlayers: leaderboard.length
    };

    io.to(this.code).emit('game-ended', finalReport);
    this.addEventLog(`🏁 ${reason}`, '🏁');
  }

  destroy() {
    if (this.timerInterval) clearInterval(this.timerInterval);
    this.clearBots();
    delete rooms[this.code];
  }
}

// Socket IO Handlers
io.on('connection', (socket) => {
  let currentRoomCode = null;
  let currentPlayerId = null;

  // Host: Create Room
  socket.on('create-room', ({ customCode, config }, callback) => {
    let code = customCode ? customCode.trim() : generateRoomCode();
    if (rooms[code]) {
      if (rooms[code].status !== 'ended') {
        // Code already in use, generate new random code if not custom
        if (!customCode) code = generateRoomCode();
        else {
          return callback({ success: false, error: '이미 사용 중인 방 번호입니다.' });
        }
      } else {
        rooms[code].destroy();
      }
    }

    const room = new GameRoom(code, socket.id);
    if (config) {
      room.config = { ...room.config, ...config };
      room.remainingTime = room.config.timeLimitSeconds;
    }
    rooms[code] = room;
    currentRoomCode = code;
    socket.join(code);

    callback({
      success: true,
      code,
      config: room.config,
      isTeamMode: !!room.config.isTeamMode,
      teams: room.teams,
      quizSets: Object.keys(quizSets).map(k => ({ id: k, name: quizSets[k].name }))
    });
  });

  // Host: Update Config
  socket.on('update-room-config', ({ code, config }) => {
    const room = rooms[code];
    if (room && room.hostSocketId === socket.id && room.status === 'lobby') {
      room.config = { ...room.config, ...config };
      room.remainingTime = room.config.timeLimitSeconds;
      io.to(code).emit('room-config-updated', room.config);
    }
  });

  // Host: Team Management Events
  socket.on('set-team-mode', ({ code, enabled }) => {
    const room = rooms[code];
    if (room && room.status === 'lobby') {
      room.setTeamMode(enabled);
    }
  });

  socket.on('create-team', ({ code, name, color, emoji }, callback) => {
    const room = rooms[code];
    if (room && room.status === 'lobby') {
      const team = room.createTeam(name, color, emoji);
      if (callback) callback({ success: true, team });
    }
  });

  socket.on('remove-team', ({ code, teamId }) => {
    const room = rooms[code];
    if (room && room.status === 'lobby') {
      room.removeTeam(teamId);
    }
  });

  socket.on('update-team', ({ code, teamId, data }) => {
    const room = rooms[code];
    if (room && room.status === 'lobby') {
      room.updateTeam(teamId, data);
    }
  });

  socket.on('assign-player-team', ({ code, playerId, teamId }) => {
    const room = rooms[code];
    if (room && room.status === 'lobby') {
      room.assignPlayerToTeam(playerId, teamId);
    }
  });

  socket.on('auto-assign-teams', ({ code, teamCount }) => {
    const room = rooms[code];
    if (room && room.status === 'lobby') {
      room.autoAssignTeams(teamCount);
    }
  });

  // Host: Add AI Bot
  socket.on('add-bot', ({ code }, callback) => {
    const room = rooms[code];
    if (!room || room.status !== 'lobby') {
      return callback && callback({ success: false, error: '로비 상태에서만 봇을 추가할 수 있습니다.' });
    }
    const botCount = Object.values(room.players).filter(p => p.isBot).length;
    const name = BOT_NAMES[botCount % BOT_NAMES.length];
    const avatar = AVATARS[Math.floor(Math.random() * AVATARS.length)];
    const botId = 'bot_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6);

    const bot = room.addPlayer(botId, name, avatar, null, true);
    io.to(code).emit('player-joined', {
      id: bot.id,
      name: bot.name,
      avatar: bot.avatar,
      isBot: true,
      totalPlayers: Object.keys(room.players).length
    });
    io.to(code).emit('leaderboard-updated', room.getLeaderboard());
    if (callback) callback({ success: true, bot });
  });

  // Host: Remove AI Bot
  socket.on('remove-bot', ({ code, botId }) => {
    const room = rooms[code];
    if (room && room.players[botId] && room.players[botId].isBot) {
      room.removePlayer(botId);
      io.to(code).emit('player-left', { id: botId, totalPlayers: Object.keys(room.players).length });
      io.to(code).emit('leaderboard-updated', room.getLeaderboard());
    }
  });

  // Host: Start Game
  socket.on('start-game', ({ code }, callback) => {
    const room = rooms[code];
    if (!room) return callback({ success: false, error: '방을 찾을 수 없습니다.' });
    if (Object.keys(room.players).length === 0) {
      return callback({ success: false, error: '최소 1명 이상의 플레이어(또는 봇)가 있어야 시작할 수 있습니다.' });
    }
    room.startGame();
    io.to(code).emit('game-started', {
      config: room.config,
      remainingTime: room.remainingTime
    });

    // Send first question to each connected player
    for (const p of Object.values(room.players)) {
      if (p.socketId && p.currentQuestion) {
        io.to(p.socketId).emit('new-question', {
          id: p.currentQuestion.id,
          question: p.currentQuestion.question,
          options: p.currentQuestion.options
        });
      }
    }

    callback({ success: true });
  });

  // Host: Force End Game
  socket.on('force-end-game', ({ code }) => {
    const room = rooms[code];
    // Allow the original host socket, or a reconnected host page (never a player socket)
    if (room && (room.hostSocketId === socket.id || !currentPlayerId)) {
      room.hostSocketId = socket.id;
      room.endGame('호스트가 게임을 종료했습니다.');
    }
  });

  // Player: Join Room
  socket.on('join-room', ({ code, name, avatar, playerId, studentNo, nickname }, callback) => {
    const room = rooms[code];
    if (!room) {
      return callback({ success: false, error: '해당 게임 코드를 가진 방이 없습니다.' });
    }
    if (room.status === 'ended') {
      return callback({ success: false, error: '이미 종료된 게임입니다.' });
    }

    const pId = playerId || ('p_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6));
    currentRoomCode = code;
    currentPlayerId = pId;
    socket.join(code);

    let player = room.players[pId];
    if (player) {
      // Reconnection
      player.socketId = socket.id;
      if (studentNo != null && studentNo !== '') player.studentNo = parseInt(studentNo, 10);
      if (nickname) player.nickname = nickname;
      player.name = name || (player.studentNo ? `${player.studentNo}번 ${player.nickname}` : (player.nickname || player.name));
      player.avatar = avatar || player.avatar;
    } else {
      player = room.addPlayer(pId, name, avatar || '🐱', socket.id, false, studentNo, nickname);
      io.to(code).emit('player-joined', {
        id: player.id,
        name: player.name,
        nickname: player.nickname,
        studentNo: player.studentNo,
        avatar: player.avatar,
        isBot: false,
        totalPlayers: Object.keys(room.players).length
      });
    }

    // Send game info to player
    const response = {
      success: true,
      playerId: pId,
      roomStatus: room.status,
      config: room.config,
      isTeamMode: !!room.config.isTeamMode,
      teams: room.teams,
      player: {
        id: player.id,
        name: player.name,
        nickname: player.nickname,
        studentNo: player.studentNo,
        avatar: player.avatar,
        teamId: player.teamId,
        altitude: player.altitude || 0,
        energy: player.energy || 1500,
        summit: player.summit || 1,
        balance: player.balance,
        streak: player.streak,
        upgrades: player.upgrades,
        hasShield: player.status.hasShield,
        isFrozen: player.status.isFrozen && Date.now() < player.status.frozenUntil
      },
      upgradesDefinition: UPGRADES,
      powerupsDefinition: POWERUPS
    };

    if (room.status === 'playing') {
      if (!player.currentQuestion) player.currentQuestion = room.getRandomQuestion();
      response.currentQuestion = {
        id: player.currentQuestion.id,
        question: player.currentQuestion.question,
        options: player.currentQuestion.options
      };
      response.remainingTime = room.remainingTime;
    }

    callback(response);
    io.to(code).emit('leaderboard-updated', room.getLeaderboard());
  });

  // Player: Submit Answer
  socket.on('submit-answer', ({ code, playerId, answerIndex }, callback) => {
    const room = rooms[code];
    if (!room) return callback({ success: false, error: '방을 찾을 수 없습니다.' });
    const result = room.processAnswer(playerId, answerIndex);
    if (!result) return callback({ success: false, error: '답변을 처리할 수 없습니다.' });
    callback({ success: true, ...result });
  });

  // Player: Buy Upgrade
  socket.on('buy-upgrade', ({ code, playerId, upgradeType }, callback) => {
    const room = rooms[code];
    if (!room) return callback({ success: false, error: '방을 찾을 수 없습니다.' });
    const result = room.processUpgrade(playerId, upgradeType);
    callback(result);
  });

  // Player: Use Power-Up
  socket.on('use-powerup', ({ code, playerId, powerupId, targetPlayerId }, callback) => {
    const room = rooms[code];
    if (!room) return callback({ success: false, error: '방을 찾을 수 없습니다.' });
    const result = room.processPowerup(playerId, powerupId, targetPlayerId);
    callback(result);
  });

  // --- Don't Look Down Mode Handlers ---
  socket.on('dld-player-move', ({ code, playerId, x, y, vx, vy, altitude, energy, summit, isGrounded }) => {
    const room = rooms[code];
    if (!room) return;
    const player = room.players[playerId];
    if (player) {
      player.altitude = altitude;
      player.energy = energy;
      player.summit = summit;
    }
    socket.to(code).emit('dld-player-sync', {
      id: playerId,
      name: player ? player.name : '',
      avatar: player ? player.avatar : '🐱',
      x, y, vx, vy,
      altitude,
      energy,
      summit,
      isGrounded
    });
  });

  socket.on('dld-fall-event', ({ code, playerId, fallMeters, fromAlt, toAlt }) => {
    const room = rooms[code];
    if (!room) return;
    const player = room.players[playerId];
    if (player) {
      player.falls = (player.falls || 0) + 1;
      room.addEventLog(`😱 ${player.name}님이 -${Math.round(fallMeters)}m 추락! ("Don't Look Down!")`, '📉');
      io.to(code).emit('dld-player-fell', {
        id: playerId,
        name: player.name,
        fallMeters: Math.round(fallMeters),
        fromAlt,
        toAlt
      });
      room.broadcastLeaderboard();
    }
  });

  socket.on('dld-reach-summit', ({ code, playerId, summit }) => {
    const room = rooms[code];
    if (!room) return;
    const player = room.players[playerId];
    if (player) {
      player.summit = summit;
      const summitNames = [
        '',
        '🌋 Summit 1 (Emberwall Ascent)',
        '🪸 Summit 2 (Coral Climb)',
        '🕵️ Summit 3 (Agent Adventure)',
        '🍄 Summit 4 (Growing Up)',
        '❄️ Summit 5 (Frosty Peaks)',
        '🚀 Summit 6 (One Way Up)'
      ];
      room.addEventLog(`🚩 ${player.name}님이 ${summitNames[summit] || ('Summit ' + summit)}에 도착했습니다!`, '🚩');
      room.broadcastLeaderboard();
    }
  });

  socket.on('dld-reach-peak', ({ code, playerId }) => {
    const room = rooms[code];
    if (!room || room.status !== 'playing') return;
    const player = room.players[playerId];
    if (player && (player.altitude >= 990 || player.altitude >= 1000)) {
      player.altitude = 1000;
      room.endGame(`🏆 ${player.name}님이 1,000m 정상을 최초로 정복하여 최종 우승했습니다! 🎉`);
    }
  });

  socket.on('dld-answer-question', ({ code, playerId, answerIndex }, callback) => {
    const room = rooms[code];
    if (!room) return callback({ success: false, error: '방을 찾을 수 없습니다.' });
    const player = room.players[playerId];
    if (!player) return callback({ success: false, error: '플레이어를 찾을 수 없습니다.' });

    if (!player.currentQuestion) {
      player.currentQuestion = room.getRandomQuestion();
    }
    const q = player.currentQuestion;
    if (!q) return callback({ success: false, error: '문제가 없습니다.' });

    const isCorrect = (answerIndex === q.answer);
    let energyGain = 0;

    if (isCorrect) {
      player.streak++;
      player.stats.correct++;
      player.stats.maxStreak = Math.max(player.stats.maxStreak || 0, player.streak);
      const baseGain = (room.config && room.config.dldSettings && room.config.dldSettings.energyGain) || 1000;
      const streakBonus = (player.streak > 1) ? Math.min(player.streak - 1, 5) * 200 : 0;
      energyGain = baseGain + streakBonus;
      player.energy = (player.energy || 0) + energyGain;
      if (player.streak === 5 || player.streak === 10) {
        room.addEventLog(`⚡ ${player.name}님이 ${player.streak}연속 정답으로 에너지 폭풍 충전 중!`, '⚡');
      }
    } else {
      player.streak = 0;
      player.stats.wrong++;
    }

    player.currentQuestion = room.getRandomQuestion();
    room.broadcastLeaderboard();

    callback({
      success: true,
      isCorrect,
      energyGain,
      totalEnergy: player.energy,
      streak: player.streak,
      correctAnswerIndex: q.answer,
      nextQuestion: {
        id: player.currentQuestion.id,
        question: player.currentQuestion.question,
        options: player.currentQuestion.options
      }
    });
  });

  // --- DOOM 3D Quiz Fortress Socket Handlers ---
  socket.on('doom-player-sync', ({ code, playerId, x, y, angle, health, armor, ammo, kills, score }) => {
    const room = rooms[code];
    if (!room || room.status !== 'playing') return;
    const player = room.players[playerId];
    if (player) {
      player.doomX = x;
      player.doomY = y;
      player.doomAngle = angle;
      if (health !== undefined) player.health = health;
      if (armor !== undefined) player.armor = armor;
      if (ammo !== undefined) player.ammo = ammo;
      if (kills !== undefined) player.kills = kills;
      if (score !== undefined) player.score = score;

      socket.to(code).emit('doom-player-sync', {
        id: player.id,
        name: player.name,
        nickname: player.nickname,
        studentNo: player.studentNo,
        avatar: player.avatar,
        kills: player.kills,
        score: player.score,
        health: player.health,
        armor: player.armor,
        ammo: player.ammo,
        x: player.doomX,
        y: player.doomY,
        angle: player.doomAngle,
        isBot: false
      });
    }
  });

  socket.on('doom-player-shot', ({ code, playerId, weapon }) => {
    socket.to(code).emit('doom-player-shot', { playerId, weapon });
  });

  socket.on('doom-monster-kill', ({ code, playerId, monsterType, scoreGained }) => {
    const room = rooms[code];
    if (!room || room.status !== 'playing') return;
    const player = room.players[playerId];
    if (player) {
      player.kills = (player.kills || 0) + 1;
      player.score = (player.score || 0) + (scoreGained || 100);

      const targetKills = (room.config.doomSettings && room.config.doomSettings.targetKills) || 25;
      if (player.kills >= targetKills) {
        room.endGame(`🏆 ${player.name}님이 몬스터 ${targetKills}마리를 소탕하고 던전을 정복하여 우승했습니다! 🎉`);
      } else {
        room.broadcastLeaderboard();
      }
    }
  });

  socket.on('doom-boss-hit', ({ code, playerId, damage }) => {
    const room = rooms[code];
    if (!room || room.status !== 'playing') return;
    const player = room.players[playerId];
    if (!room.config.doomSettings) room.config.doomSettings = { currentBossHealth: 1000, bossHealth: 1000 };
    
    room.config.doomSettings.currentBossHealth = Math.max(0, room.config.doomSettings.currentBossHealth - (damage || 50));
    io.to(code).emit('doom-boss-update', {
      currentHealth: room.config.doomSettings.currentBossHealth,
      maxHealth: room.config.doomSettings.bossHealth || 1000,
      attackerName: player ? player.name : '플레이어'
    });

    if (room.config.doomSettings.currentBossHealth <= 0) {
      room.endGame(`🏆 ${player ? player.name : '영웅'}님이 둠 사이버 보스를 격파하여 최종 우승했습니다! 🎉`);
    }
  });

  socket.on('doom-answer-quiz', ({ code, playerId, answerIndex }, callback) => {
    const room = rooms[code];
    if (!room) return callback({ success: false, error: '방을 찾을 수 없습니다.' });
    const player = room.players[playerId];
    if (!player) return callback({ success: false, error: '플레이어를 찾을 수 없습니다.' });

    if (!player.currentQuestion) {
      player.currentQuestion = room.getRandomQuestion();
    }
    const q = player.currentQuestion;
    if (!q) return callback({ success: false, error: '문제가 없습니다.' });

    const isCorrect = (answerIndex === q.answer);
    let ammoGain = 0;
    let healthGain = 0;
    let bfgUnlocked = false;

    if (isCorrect) {
      player.streak++;
      player.stats.correct++;
      player.stats.maxStreak = Math.max(player.stats.maxStreak || 0, player.streak);
      ammoGain = (room.config.doomSettings && room.config.doomSettings.ammoGain) || 40;
      healthGain = (room.config.doomSettings && room.config.doomSettings.healthGain) || 25;
      
      player.ammo = Math.min(200, (player.ammo || 50) + ammoGain);
      player.health = Math.min(100, (player.health || 100) + healthGain);
      player.score = (player.score || 0) + 250;

      if (player.streak >= 3) {
        bfgUnlocked = true;
        room.addEventLog(`💥 ${player.name}님이 ${player.streak}연속 정답으로 BFG 9000 슈퍼무기를 충전했습니다!`, '💥');
      } else {
        room.addEventLog(`🔋 ${player.name}님이 퀴즈 정답으로 탄약(+${ammoGain})과 체력(+${healthGain})을 보급받았습니다!`, '🔋');
      }
    } else {
      player.streak = 0;
      player.stats.wrong++;
      player.health = Math.max(10, (player.health || 100) - 15);
      room.addEventLog(`⚠️ ${player.name}님이 퀴즈 오답으로 데미지를 입었습니다! (-15 HP)`, '⚠️');
    }

    player.currentQuestion = room.getRandomQuestion();
    room.broadcastLeaderboard();

    callback({
      success: true,
      isCorrect,
      ammoGain,
      healthGain,
      bfgUnlocked,
      totalAmmo: player.ammo,
      totalHealth: player.health,
      streak: player.streak,
      correctAnswerIndex: q.answer,
      nextQuestion: {
        id: player.currentQuestion.id,
        question: player.currentQuestion.question,
        options: player.currentQuestion.options
      }
    });
  });

  // Disconnect handler
  socket.on('disconnect', () => {
    if (currentRoomCode && rooms[currentRoomCode]) {
      const room = rooms[currentRoomCode];
      if (room.hostSocketId === socket.id) {
        // If host disconnects during lobby, notify players
        if (room.status === 'lobby') {
          io.to(currentRoomCode).emit('host-disconnected');
        }
      }
    }
  });
});

server.listen(PORT, '0.0.0.0', () => {
  const ip = getLocalIpAddress();
  console.log(`🎮 Gimkit Clone Game Server is running!`);
  console.log(`🏠 Local:   http://localhost:${PORT}`);
  console.log(`📡 Network: http://${ip}:${PORT}`);
  console.log(`📱 QR Join: http://${ip}:${PORT}/join?gc=311866`);
  console.log(`👑 Host:    http://localhost:${PORT}/host.html`);
});
