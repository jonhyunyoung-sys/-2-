// Gimkit Player Client Logic
const socket = io();

const AVATARS = ['🐱', '🐶', '🦊', '🐼', '🐨', '🦁', '🚀', '🤖', '👾', '👑', '⚡', '🔥'];
let selectedAvatar = '🐱';
let currentRoomCode = null;
let myPlayerId = null;
let currentQuestion = null;
let myPlayerState = {
  balance: 0,
  streak: 0,
  upgrades: { moneyPerQuestion: 1, streakBonus: 1, multiplier: 1, insurance: 1 },
  hasShield: false
};
let upgradesDef = {};
let powerupsDef = {};
let activeTab = 'questions';
let targetModalAction = null; // 'freeze' | 'gift'
let latestLeaderboard = [];
let freezeTimerInterval = null;
let isSubmitting = false;

// Initialize on page load
window.addEventListener('DOMContentLoaded', () => {
  setupAvatarPicker();

  const urlParams = new URLSearchParams(window.location.search);
  const codeParam = urlParams.get('gc') || urlParams.get('code') || '';
  const autoStart = urlParams.get('autoStart') === '1';

  if (codeParam) {
    document.getElementById('inputRoomCode').value = codeParam;
  }

  // Auto-generate cool default nickname
  const nickNames = ['골든러너', '퀴즈마스터', '질풍노도', '빛의속도', '럭키스타', '비트코인', '머니헌터'];
  const randomNick = nickNames[Math.floor(Math.random() * nickNames.length)];
  document.getElementById('inputNickname').value = randomNick;

  // If autoStart query is present (Solo quick play)
  if (autoStart && codeParam) {
    setTimeout(() => {
      joinGameRoom(codeParam, randomNick, selectedAvatar, () => {
        // Auto start game from solo host if host session exists
        socket.emit('start-game', { code: codeParam });
      });
    }, 300);
  }
});

function setupAvatarPicker() {
  const container = document.getElementById('avatarPickerGrid');
  container.innerHTML = AVATARS.map((av, idx) => `
    <button type="button" class="btn btn-outline" style="font-size: 1.6rem; padding: 0.4rem; border-radius: 10px; ${idx === 0 ? 'border-color: var(--primary); background: rgba(99,102,241,0.2);' : ''}" onclick="selectAvatar('${av}', this)">
      ${av}
    </button>
  `).join('');
}

function selectAvatar(av, btn) {
  selectedAvatar = av;
  const allBtns = document.getElementById('avatarPickerGrid').querySelectorAll('button');
  allBtns.forEach(b => {
    b.style.borderColor = 'var(--border)';
    b.style.background = 'transparent';
  });
  btn.style.borderColor = 'var(--primary)';
  btn.style.background = 'rgba(99,102,241,0.2)';
}

function handleJoinSubmit(e) {
  e.preventDefault();
  const code = document.getElementById('inputRoomCode').value.trim();
  const name = document.getElementById('inputNickname').value.trim();

  if (!code || !name) {
    alert('방 번호와 닉네임을 입력해주세요.');
    return;
  }

  joinGameRoom(code, name, selectedAvatar);
}

function joinGameRoom(code, name, avatar, onJoined) {
  const joinBtn = document.getElementById('btnJoinGame');
  if (joinBtn) {
    joinBtn.disabled = true;
    joinBtn.innerText = '접속 중...';
  }

  currentRoomCode = code;

  socket.emit('join-room', {
    code,
    name,
    avatar
  }, (res) => {
    if (!res.success) {
      alert(res.error || '게임 참가에 실패했습니다.');
      if (joinBtn) {
        joinBtn.disabled = false;
        joinBtn.innerText = '게임 참가하기 🚀';
      }
      return;
    }

    // Auto-redirect if room is Don't Look Down
    if (res.config && res.config.gameType === 'dont-look-down') {
      window.location.href = `/dld?gc=${encodeURIComponent(code)}&name=${encodeURIComponent(name)}&avatar=${encodeURIComponent(avatar)}`;
      return;
    }

    myPlayerId = res.playerId;
    myPlayerState = res.player;
    upgradesDef = res.upgradesDefinition;
    powerupsDef = res.powerupsDefinition;

    document.getElementById('joinView').style.display = 'none';

    if (res.roomStatus === 'playing') {
      enterGamePlay(res.currentQuestion);
    } else {
      // Waiting Lobby
      document.getElementById('waitingView').style.display = 'flex';
      document.getElementById('waitingAvatar').innerText = avatar;
      document.getElementById('waitingPlayerName').innerText = name;
    }

    if (onJoined) onJoined();
  });
}

function enterGamePlay(question) {
  document.getElementById('waitingView').style.display = 'none';
  document.getElementById('gameView').style.display = 'flex';

  updateStatsBar();
  renderPassiveUpgrades();
  renderPowerups();

  if (question) {
    displayQuestion(question);
  }
}

function updateStatsBar() {
  document.getElementById('balanceDisplay').innerText = `$${Math.round(myPlayerState.balance).toLocaleString()}`;
  document.getElementById('streakDisplay').innerText = myPlayerState.streak;

  const multVal = upgradesDef.multiplier ? upgradesDef.multiplier[myPlayerState.upgrades.multiplier - 1].value : 1.0;
  document.getElementById('multiplierDisplay').innerText = `x${multVal}`;

  const shieldPill = document.getElementById('statShield');
  shieldPill.style.display = myPlayerState.hasShield ? 'flex' : 'none';

  // Update Rank
  if (latestLeaderboard.length > 0) {
    const idx = latestLeaderboard.findIndex(p => p.id === myPlayerId);
    if (idx !== -1) {
      document.getElementById('myRankDisplay').innerText = `#${idx + 1} / ${latestLeaderboard.length}`;
    }
  }
}

function displayQuestion(q) {
  currentQuestion = q;
  isSubmitting = false;

  document.getElementById('questionText').innerText = q.question;
  const grid = document.getElementById('answersGrid');
  const btns = grid.querySelectorAll('.answer-card');

  btns.forEach((btn, idx) => {
    btn.className = `answer-card ans-${idx}`;
    btn.disabled = false;
    const txtSpan = document.getElementById(`optText${idx}`);
    txtSpan.innerText = q.options[idx] || '';
  });
}

function submitAnswer(chosenIdx) {
  if (isSubmitting || !currentQuestion) return;
  isSubmitting = true;

  const grid = document.getElementById('answersGrid');
  const btns = grid.querySelectorAll('.answer-card');
  btns.forEach(b => b.disabled = true);

  socket.emit('submit-answer', {
    code: currentRoomCode,
    playerId: myPlayerId,
    answerIndex: chosenIdx
  }, (res) => {
    if (!res.success) {
      isSubmitting = false;
      btns.forEach(b => b.disabled = false);
      return;
    }

    // If currently frozen
    if (res.frozen) {
      triggerFreeze(res.remaining, '상대방');
      isSubmitting = false;
      return;
    }

    const clickedBtn = btns[chosenIdx];

    if (res.isCorrect) {
      clickedBtn.classList.add('correct-flash');
      window.soundEngine.playCorrect();
      showFloatingMoney(res.delta, true, clickedBtn);
    } else {
      clickedBtn.classList.add('wrong-flash');
      const correctBtn = btns[res.correctAnswerIndex];
      if (correctBtn) correctBtn.classList.add('correct-flash');
      window.soundEngine.playWrong();
      if (res.delta < 0) {
        showFloatingMoney(res.delta, false, clickedBtn);
      }
    }

    myPlayerState.balance = res.balance;
    myPlayerState.streak = res.streak;
    updateStatsBar();
    renderPassiveUpgrades();
    renderPowerups();

    // Smooth transition to next question
    setTimeout(() => {
      displayQuestion(res.nextQuestion);
    }, 600);
  });
}

function showFloatingMoney(amount, isPlus, element) {
  const rect = element.getBoundingClientRect();
  const el = document.createElement('div');
  el.className = `floating-money ${isPlus ? 'plus' : 'minus'}`;
  el.innerText = `${isPlus ? '+' : ''}$${Math.abs(amount).toLocaleString()}`;
  el.style.left = `${rect.left + rect.width / 2}px`;
  el.style.top = `${rect.top}px`;
  document.body.appendChild(el);

  setTimeout(() => {
    el.remove();
  }, 1200);
}

// TAB SWITCHING
function switchTab(tab) {
  activeTab = tab;
  document.getElementById('tabQuestions').className = `tab-btn ${tab === 'questions' ? 'active' : ''}`;
  document.getElementById('tabShop').className = `tab-btn ${tab === 'shop' ? 'active' : ''}`;
  document.getElementById('tabLeaderboard').className = `tab-btn ${tab === 'leaderboard' ? 'active' : ''}`;

  document.getElementById('tabViewQuestions').style.display = (tab === 'questions') ? 'flex' : 'none';
  document.getElementById('tabViewShop').style.display = (tab === 'shop') ? 'block' : 'none';
  document.getElementById('tabViewLeaderboard').style.display = (tab === 'leaderboard') ? 'block' : 'none';

  if (tab === 'shop') {
    renderPassiveUpgrades();
    renderPowerups();
  }
}

// SHOP RENDERING
function renderPassiveUpgrades() {
  const container = document.getElementById('passiveUpgradesGrid');
  if (!container || !upgradesDef.moneyPerQuestion) return;

  const categories = [
    { key: 'moneyPerQuestion', title: '문제당 머니 ($)', icon: '💵', desc: '정답 시 받는 기본 상금을 영구적으로 인상합니다.' },
    { key: 'streakBonus', title: '연속 정답 보너스 (Streak)', icon: '🔥', desc: '연속 정답 시 추가 보너스를 배로 적립합니다.' },
    { key: 'multiplier', title: '수익 배율 (Multiplier)', icon: '⚡', desc: '모든 정답 수익에 곱해지는 영구 배율입니다.' },
    { key: 'insurance', title: '오답 손실 보험 (Insurance)', icon: '🛡️', desc: '오답 시 머니 차감 손실액을 줄여줍니다.' }
  ];

  container.innerHTML = categories.map(cat => {
    const currentLvl = myPlayerState.upgrades[cat.key];
    const tiers = upgradesDef[cat.key];
    const nextTier = tiers[currentLvl];
    const isMax = currentLvl >= tiers.length;
    const canAfford = nextTier && myPlayerState.balance >= nextTier.cost;

    let benefitText = '';
    if (cat.key === 'moneyPerQuestion') benefitText = `현재: $${tiers[currentLvl - 1].value} → 다음: $${nextTier ? nextTier.value : 'MAX'}`;
    else if (cat.key === 'streakBonus') benefitText = `현재: +$${tiers[currentLvl - 1].value} → 다음: +${nextTier ? nextTier.value : 'MAX'}`;
    else if (cat.key === 'multiplier') benefitText = `현재: x${tiers[currentLvl - 1].value}배 → 다음: x${nextTier ? nextTier.value : 'MAX'}배`;
    else if (cat.key === 'insurance') benefitText = `현재: ${tiers[currentLvl - 1].label} → 다음: ${nextTier ? nextTier.label : 'MAX'}`;

    return `
      <div class="shop-card">
        <div class="shop-card-header">
          <div class="shop-card-icon">${cat.icon}</div>
          <div>
            <div class="shop-card-title">${cat.title}</div>
            <div class="shop-card-level">Level ${currentLvl} ${isMax ? '(최고 레벨)' : ''}</div>
          </div>
        </div>

        <div class="shop-card-desc">
          ${cat.desc}<br>
          <strong style="color: #cbd5e1; display: inline-block; margin-top: 4px;">${benefitText}</strong>
        </div>

        <div class="level-dots">
          ${tiers.map((_, i) => `<div class="level-dot ${i < currentLvl ? 'active' : ''}"></div>`).join('')}
        </div>

        <div class="shop-card-footer">
          <div class="cost-tag ${!canAfford || isMax ? 'disabled' : ''}">
            ${isMax ? 'MAX' : `$${nextTier.cost.toLocaleString()}`}
          </div>
          <button class="btn ${canAfford && !isMax ? 'btn-primary' : 'btn-outline'}" 
            ${!canAfford || isMax ? 'disabled style="opacity: 0.5; cursor: not-allowed;"' : ''} 
            onclick="buyUpgrade('${cat.key}')">
            ${isMax ? '완료' : '업그레이드'}
          </button>
        </div>
      </div>
    `;
  }).join('');
}

function renderPowerups() {
  const container = document.getElementById('powerupsGrid');
  if (!container || !powerupsDef.freeze) return;

  const items = Object.values(powerupsDef);

  container.innerHTML = items.map(item => {
    const canAfford = myPlayerState.balance >= item.cost;
    const isShieldActive = (item.id === 'shield' && myPlayerState.hasShield);

    return `
      <div class="shop-card">
        <div class="shop-card-header">
          <div class="shop-card-icon">${item.name.slice(0, 2)}</div>
          <div>
            <div class="shop-card-title">${item.name}</div>
            <div class="shop-card-level" style="color: #38bdf8;">1회성 아이템</div>
          </div>
        </div>

        <div class="shop-card-desc">
          ${item.desc}
        </div>

        <div class="shop-card-footer">
          <div class="cost-tag ${!canAfford || isShieldActive ? 'disabled' : ''}">
            $${item.cost.toLocaleString()}
          </div>
          <button class="btn ${canAfford && !isShieldActive ? 'btn-success' : 'btn-outline'}"
            ${!canAfford || isShieldActive ? 'disabled style="opacity: 0.5; cursor: not-allowed;"' : ''}
            onclick="usePowerup('${item.id}')">
            ${isShieldActive ? '보호 중' : '사용하기'}
          </button>
        </div>
      </div>
    `;
  }).join('');
}

function buyUpgrade(upgradeType) {
  socket.emit('buy-upgrade', {
    code: currentRoomCode,
    playerId: myPlayerId,
    upgradeType
  }, (res) => {
    if (res.success) {
      window.soundEngine.playBuy();
      myPlayerState.balance = res.balance;
      myPlayerState.upgrades = res.upgrades;
      updateStatsBar();
      renderPassiveUpgrades();
      renderPowerups();
    } else {
      alert(res.reason || '구매에 실패했습니다.');
    }
  });
}

function usePowerup(powerupId) {
  // If requires targeting (Freeze, Gift)
  if (powerupId === 'freeze' || powerupId === 'gift') {
    openTargetModal(powerupId);
    return;
  }

  executePowerup(powerupId, null);
}

function openTargetModal(powerupId) {
  targetModalAction = powerupId;
  const modal = document.getElementById('targetModal');
  const title = document.getElementById('targetModalTitle');
  const desc = document.getElementById('targetModalDesc');
  const grid = document.getElementById('targetModalGrid');

  if (powerupId === 'freeze') {
    title.innerText = '🧊 얼리기 대상 선택';
    desc.innerText = '12초간 문제 풀기를 마비시킬 경쟁자를 선택하세요!';
  } else {
    title.innerText = '🎁 $100 머니 선물';
    desc.innerText = '머니를 선물할 플레이어를 선택하세요.';
  }

  const opponents = latestLeaderboard.filter(p => p.id !== myPlayerId);
  if (opponents.length === 0) {
    grid.innerHTML = '<div style="color: var(--text-muted); grid-column: 1/-1; text-align: center; padding: 1rem;">현재 다른 플레이어가 없습니다.</div>';
  } else {
    grid.innerHTML = opponents.map(p => `
      <button class="target-btn" onclick="selectTargetAndExecute('${p.id}')">
        <span style="font-size: 2rem;">${p.avatar}</span>
        <span style="font-weight: 700; font-size: 0.9rem;">${escapeHtml(p.name)}</span>
        <span style="font-size: 0.8rem; color: #34d399;">$${p.balance.toLocaleString()}</span>
      </button>
    `).join('');
  }

  modal.style.display = 'flex';
}

function closeTargetModal() {
  document.getElementById('targetModal').style.display = 'none';
  targetModalAction = null;
}

function selectTargetAndExecute(targetId) {
  const action = targetModalAction;
  closeTargetModal();
  executePowerup(action, targetId);
}

function executePowerup(powerupId, targetPlayerId) {
  socket.emit('use-powerup', {
    code: currentRoomCode,
    playerId: myPlayerId,
    powerupId,
    targetPlayerId
  }, (res) => {
    if (res.success) {
      window.soundEngine.playBuy();
      myPlayerState.balance = res.balance;
      if (res.hasShield !== undefined) myPlayerState.hasShield = res.hasShield;
      updateStatsBar();
      renderPassiveUpgrades();
      renderPowerups();
    } else {
      alert(res.reason || '아이템 사용 실패');
    }
  });
}

function triggerFreeze(durationSec, fromPlayerName) {
  window.soundEngine.playFreeze();
  const overlay = document.getElementById('freezeOverlay');
  const countdown = document.getElementById('freezeCountdown');
  const fromText = document.getElementById('frozenFromText');

  fromText.innerText = `${fromPlayerName}님의 공격으로 얼어붙었습니다!`;
  overlay.style.display = 'flex';

  let remaining = durationSec;
  countdown.innerText = remaining;

  if (freezeTimerInterval) clearInterval(freezeTimerInterval);
  freezeTimerInterval = setInterval(() => {
    remaining--;
    countdown.innerText = remaining;
    if (remaining <= 0) {
      clearInterval(freezeTimerInterval);
      freezeTimerInterval = null;
      overlay.style.display = 'none';
    }
  }, 1000);
}

// SOCKET LISTENERS
socket.on('game-started', ({ config }) => {
  if (config && config.gameType === 'dont-look-down') {
    window.location.href = `/dld?gc=${encodeURIComponent(currentRoomCode)}&name=${encodeURIComponent(myPlayerState.name)}&avatar=${encodeURIComponent(myPlayerState.avatar)}`;
    return;
  }
  document.getElementById('waitingView').style.display = 'none';
  document.getElementById('gameView').style.display = 'flex';
  window.soundEngine.playWin();
});

socket.on('new-question', (question) => {
  displayQuestion(question);
});

socket.on('player-frozen', ({ duration, from }) => {
  triggerFreeze(duration, from);
});

socket.on('freeze-expired', () => {
  if (freezeTimerInterval) clearInterval(freezeTimerInterval);
  document.getElementById('freezeOverlay').style.display = 'none';
});

socket.on('shield-activated', () => {
  window.soundEngine.playShield();
  myPlayerState.hasShield = true;
  updateStatsBar();
  renderPowerups();
});

socket.on('shield-blocked', ({ from }) => {
  window.soundEngine.playShield();
  myPlayerState.hasShield = false;
  updateStatsBar();
  renderPowerups();
  alert(`🛡️ 방어막이 ${from}님의 공격을 성공적으로 차단했습니다!`);
});

socket.on('player-emped', ({ duration }) => {
  const overlay = document.getElementById('empOverlay');
  overlay.style.display = 'block';
  setTimeout(() => {
    overlay.style.display = 'none';
  }, duration * 1000);
});

socket.on('emp-expired', () => {
  document.getElementById('empOverlay').style.display = 'none';
});

socket.on('received-gift', ({ from, amount }) => {
  window.soundEngine.playBuy();
  myPlayerState.balance += amount;
  updateStatsBar();
  alert(`🎁 ${from}님으로부터 $${amount} 머니 선물이 도착했습니다!`);
});

socket.on('leaderboard-updated', (lb) => {
  latestLeaderboard = lb;
  updateStatsBar();
  renderPlayerLeaderboardTab(lb);
});

function renderPlayerLeaderboardTab(lb) {
  const table = document.getElementById('playerLbTable');
  if (!table) return;

  table.innerHTML = lb.map((p, idx) => {
    const isMe = (p.id === myPlayerId);
    return `
      <div class="lb-row ${isMe ? 'rank-1' : ''}" style="${isMe ? 'border-color: var(--primary);' : ''}">
        <div class="lb-left">
          <div class="lb-rank">${idx + 1}</div>
          <div class="lb-avatar">${p.avatar}</div>
          <div class="lb-name">
            ${escapeHtml(p.name)} ${isMe ? '<span style="font-size: 0.75rem; background: var(--primary); color: #fff; padding: 0.1rem 0.4rem; border-radius: 6px;">나</span>' : ''}
          </div>
        </div>
        <div class="lb-right">
          ${p.isFrozen ? '<span class="lb-badge frozen">🧊</span>' : ''}
          ${p.hasShield ? '<span class="lb-badge shield">🛡️</span>' : ''}
          <div class="lb-money">$${p.balance.toLocaleString()}</div>
        </div>
      </div>
    `;
  }).join('');
}

socket.on('game-ended', (report) => {
  if (freezeTimerInterval) clearInterval(freezeTimerInterval);
  document.getElementById('freezeOverlay').style.display = 'none';
  document.getElementById('empOverlay').style.display = 'none';
  document.getElementById('gameView').style.display = 'none';
  document.getElementById('gameOverView').style.display = 'flex';

  document.getElementById('resultReason').innerText = report.reason;

  const myResult = report.leaderboard.find(p => p.id === myPlayerId);
  const myRank = report.leaderboard.findIndex(p => p.id === myPlayerId) + 1;

  if (myRank === 1) {
    document.getElementById('resultTrophy').innerText = '🥇';
    window.soundEngine.playWin();
    triggerPlayerConfetti();
  } else if (myRank === 2) {
    document.getElementById('resultTrophy').innerText = '🥈';
  } else if (myRank === 3) {
    document.getElementById('resultTrophy').innerText = '🥉';
  } else {
    document.getElementById('resultTrophy').innerText = '🎮';
  }

  const correct = myResult ? (myResult.correctCount || 0) : 0;
  const wrong = myResult ? (myResult.wrongCount || 0) : 0;
  const total = correct + wrong;
  const accuracy = total > 0 ? Math.round((correct / total) * 100) : 0;

  document.getElementById('finalRankText').innerText = `#${myRank}`;
  document.getElementById('finalMoneyText').innerText = `$${myResult ? myResult.balance.toLocaleString() : '0'}`;
  document.getElementById('finalCorrectText').innerText = `${correct}개`;
  document.getElementById('finalAccuracyText').innerText = `${accuracy}%`;
});

function triggerPlayerConfetti() {
  if (typeof confetti === 'function') {
    confetti({ particleCount: 100, spread: 70, origin: { y: 0.6 } });
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
