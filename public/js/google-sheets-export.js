/**
 * Google Sheets Export Integration for Gimkit / Baumnalgae
 * Provides:
 *  1. One-click "Copy & Open sheets.new" (instant paste into Google Spreadsheet)
 *  2. UTF-8 with BOM CSV download for Google Sheets Import
 *  3. Direct Webhook sync to Google Apps Script
 */

let googleSheetsModalEl = null;

function ensureGoogleSheetsModal() {
  if (document.getElementById('googleSheetsModal')) {
    return document.getElementById('googleSheetsModal');
  }

  const modalHtml = `
  <div id="googleSheetsModal" class="modal-backdrop" style="display: none; z-index: 10001; position: fixed; inset: 0; background: rgba(0,0,0,0.75); backdrop-filter: blur(4px); align-items: center; justify-content: center;">
    <div class="modal-box" style="max-width: 720px; width: 95%; max-height: 90vh; overflow-y: auto; background: #0f172a; border: 1px solid rgba(16, 185, 129, 0.4); border-radius: 16px; padding: 1.8rem; text-align: left; box-shadow: 0 20px 50px rgba(0,0,0,0.8); color: #f8fafc;">
      
      <!-- Header -->
      <div style="display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 1px solid #1e293b; padding-bottom: 1rem; margin-bottom: 1.2rem;">
        <div>
          <div style="display: flex; align-items: center; gap: 0.6rem;">
            <div style="width: 36px; height: 36px; border-radius: 8px; background: #0f9d58; display: flex; align-items: center; justify-content: center; font-size: 1.3rem;">
              📗
            </div>
            <div>
              <h2 style="font-size: 1.35rem; font-weight: 900; margin: 0; color: #fff;">
                구글 시트(Google Sheets)로 성적 내보내기
              </h2>
              <p style="color: #94a3b8; font-size: 0.82rem; margin: 0.2rem 0 0 0;">
                학생별 퀴즈 성취도 및 문항별 정답률 분석을 구글 스프레드시트에 즉시 정리합니다.
              </p>
            </div>
          </div>
        </div>
        <button class="btn btn-outline" style="padding: 0.35rem 0.7rem; font-size: 0.9rem; border-color: #334155; color: #94a3b8;" onclick="closeGoogleSheetsModal()">
          ✕
        </button>
      </div>

      <!-- Notice Banner -->
      <div id="gsToastBanner" style="display: none; background: rgba(16, 185, 129, 0.15); border: 1px solid #10b981; border-radius: 10px; padding: 0.8rem 1rem; margin-bottom: 1.2rem; align-items: center; gap: 0.6rem; color: #34d399; font-size: 0.88rem; font-weight: 700;">
        <span style="font-size: 1.2rem;">✨</span>
        <span id="gsToastText">데이터가 클립보드에 복사되었습니다!</span>
      </div>

      <!-- Export Method 1: Instant Sheet (Recommended) -->
      <div style="background: rgba(30, 41, 59, 0.7); border: 1px solid rgba(16, 185, 129, 0.3); border-radius: 12px; padding: 1.2rem; margin-bottom: 1rem;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.6rem;">
          <div style="display: flex; align-items: center; gap: 0.5rem;">
            <span style="background: #0f9d58; color: #fff; font-size: 0.72rem; font-weight: 900; padding: 0.15rem 0.5rem; border-radius: 4px;">방식 1 (가장 추천)</span>
            <span style="font-weight: 900; font-size: 1.05rem; color: #fff;">새 구글 시트 열고 즉시 붙여넣기 (1초 완성)</span>
          </div>
        </div>
        <p style="font-size: 0.82rem; color: #cbd5e1; margin: 0 0 0.9rem 0; line-height: 1.45;">
          아래 버튼을 누르면 <strong>표 데이터가 자동으로 복사</strong>되고 <strong>새 구글 시트 탭</strong>이 열립니다.<br>
          열린 구글 시트의 <strong>A1 셀</strong>에서 <kbd style="background: #1e293b; padding: 0.15rem 0.4rem; border-radius: 4px; border: 1px solid #475569; font-weight: 800;">Ctrl + V</kbd> (Mac은 <kbd style="background: #1e293b; padding: 0.15rem 0.4rem; border-radius: 4px; border: 1px solid #475569; font-weight: 800;">Cmd + V</kbd>)만 누르면 모든 학생 성적표가 셀 단위로 완벽하게 입력됩니다!
        </p>
        <div style="display: flex; gap: 0.6rem; flex-wrap: wrap;">
          <button class="btn btn-primary" style="flex: 1; min-width: 200px; padding: 0.75rem 1rem; font-size: 0.95rem; font-weight: 900; background: linear-gradient(135deg, #059669, #10b981); display: flex; align-items: center; justify-content: center; gap: 0.5rem;" onclick="copyAndOpenGoogleSheets('number')">
            <span>📋</span> 출석번호순 복사 후 새 구글 시트 열기
          </button>
          <button class="btn btn-outline" style="padding: 0.75rem 1rem; font-size: 0.92rem; font-weight: 800; border-color: #38bdf8; color: #38bdf8;" onclick="copyAndOpenGoogleSheets('rank')">
            🏆 랭킹 순위순 복사 후 열기
          </button>
        </div>
      </div>

      <!-- Export Method 2: CSV File Download -->
      <div style="background: rgba(30, 41, 59, 0.45); border: 1px solid #334155; border-radius: 12px; padding: 1.1rem; margin-bottom: 1rem;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem;">
          <div style="display: flex; align-items: center; gap: 0.5rem;">
            <span style="background: #334155; color: #94a3b8; font-size: 0.72rem; font-weight: 800; padding: 0.15rem 0.5rem; border-radius: 4px;">방식 2</span>
            <span style="font-weight: 800; font-size: 0.98rem; color: #e2e8f0;">구글 시트용 CSV 파일 다운로드 (.csv)</span>
          </div>
        </div>
        <p style="font-size: 0.8rem; color: #94a3b8; margin: 0 0 0.8rem 0;">
          한글 깨짐이 방지된 UTF-8 BOM 인코딩 CSV 파일로 저장합니다. 구글 시트의 [파일] → [가져오기] → [업로드]에서 즉시 열 수 있습니다.
        </p>
        <button class="btn btn-outline" style="padding: 0.6rem 1.1rem; font-size: 0.88rem; font-weight: 800; border-color: #10b981; color: #10b981; display: inline-flex; align-items: center; gap: 0.4rem;" onclick="downloadGoogleSheetsCsv()">
          <span>📥</span> 구글 시트 호환 CSV 파일 다운로드
        </button>
      </div>

      <!-- Export Method 3: Google Apps Script Webhook -->
      <div style="background: rgba(30, 41, 59, 0.35); border: 1px solid #334155; border-radius: 12px; padding: 1.1rem;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem;">
          <div style="display: flex; align-items: center; gap: 0.5rem;">
            <span style="background: #1e293b; color: #a5b4fc; font-size: 0.72rem; font-weight: 800; padding: 0.15rem 0.5rem; border-radius: 4px;">방식 3</span>
            <span style="font-weight: 800; font-size: 0.98rem; color: #e2e8f0;">구글 시트 웹앱(Webhook) 자동 전송</span>
          </div>
          <button style="background: none; border: none; color: #38bdf8; font-size: 0.78rem; text-decoration: underline; cursor: pointer;" onclick="toggleGasGuide()">
            Apps Script 템플릿 코드 보기 ▼
          </button>
        </div>
        <p style="font-size: 0.8rem; color: #94a3b8; margin: 0 0 0.7rem 0;">
          선생님의 구글 시트에 배포된 Apps Script 웹앱 URL을 입력하시면, 버튼 클릭 시 시트에 행이 자동 삽입됩니다.
        </p>

        <!-- GAS Guide Box (Collapsible) -->
        <div id="gasGuideBox" style="display: none; background: #030712; border: 1px solid #1e293b; border-radius: 8px; padding: 0.8rem; margin-bottom: 0.8rem; font-size: 0.78rem;">
          <div style="color: #cbd5e1; margin-bottom: 0.4rem; font-weight: 700;">
            💡 구글 시트 메뉴 [확장 프로그램] → [Apps Script] 에 아래 코드를 붙여넣고 [웹 앱으로 배포]하세요:
          </div>
          <pre id="gasTemplateCode" style="background: #0f172a; padding: 0.6rem; border-radius: 6px; color: #38bdf8; overflow-x: auto; margin: 0; font-size: 0.72rem; line-height: 1.4;">function doPost(e) {
  var data = JSON.parse(e.postData.contents);
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getActiveSheet();
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(["일시", "출석번호", "이름", "소속조", "최종순위", "최종기록", "맞힌문제", "틀린문제", "정답률(%)", "최대연속정답"]);
  }
  var now = new Date();
  var list = data.sortedByNo || data.leaderboard || [];
  list.forEach(function(p, idx) {
    var rank = (data.leaderboard ? data.leaderboard.findIndex(function(x){return x.id === p.id;}) + 1 : idx + 1);
    var score = p.balance || p.score || p.altitude || 0;
    sheet.appendRow([now, p.studentNo || "", p.nickname || p.name, p.teamName || "-", rank, score, p.correctCount || 0, p.wrongCount || 0, p.accuracy || 0, p.maxStreak || p.streak || 0]);
  });
  return ContentService.createTextOutput(JSON.stringify({result:"success"})).setMimeType(ContentService.MimeType.JSON);
}</pre>
          <button class="btn btn-outline" style="margin-top: 0.4rem; padding: 0.25rem 0.6rem; font-size: 0.72rem;" onclick="copyGasTemplateCode()">
            📋 템플릿 코드 복사
          </button>
        </div>

        <div style="display: flex; gap: 0.5rem;">
          <input type="url" id="gasWebhookUrlInput" placeholder="https://script.google.com/macros/s/.../exec" style="flex: 1; padding: 0.55rem 0.8rem; background: #0f172a; border: 1px solid #334155; border-radius: 8px; color: #fff; font-size: 0.85rem;">
          <button class="btn btn-primary" style="padding: 0.55rem 1rem; font-size: 0.85rem; font-weight: 800; background: #2563eb;" onclick="sendToGoogleSheetsWebhook()">
            전송 🚀
          </button>
        </div>
      </div>

    </div>
  </div>
  `;

  const div = document.createElement('div');
  div.innerHTML = modalHtml;
  document.body.appendChild(div.firstElementChild);
  return document.getElementById('googleSheetsModal');
}

function openGoogleSheetsModal() {
  const modal = ensureGoogleSheetsModal();
  if (modal) {
    modal.style.display = 'flex';
  }
}

function closeGoogleSheetsModal() {
  const modal = document.getElementById('googleSheetsModal');
  if (modal) {
    modal.style.display = 'none';
  }
}

function showGsToast(msg) {
  const banner = document.getElementById('gsToastBanner');
  const textEl = document.getElementById('gsToastText');
  if (banner && textEl) {
    textEl.innerText = msg;
    banner.style.display = 'flex';
    setTimeout(() => {
      banner.style.display = 'none';
    }, 6000);
  }
}

function toggleGasGuide() {
  const box = document.getElementById('gasGuideBox');
  if (box) {
    box.style.display = (box.style.display === 'none') ? 'block' : 'none';
  }
}

function copyGasTemplateCode() {
  const code = document.getElementById('gasTemplateCode');
  if (code) {
    navigator.clipboard.writeText(code.innerText).then(() => {
      alert('Google Apps Script 템플릿 코드가 클립보드에 복사되었습니다!');
    });
  }
}

/**
 * Build TSV formatted string designed for pasting into Google Sheets
 */
function buildGoogleSheetsTSV(sortType = 'number') {
  const lb = (typeof lastFinalReport !== 'undefined' && lastFinalReport && lastFinalReport.leaderboard)
    ? lastFinalReport.leaderboard
    : (typeof currentLeaderboard !== 'undefined' ? currentLeaderboard : []);

  if (!lb || lb.length === 0) {
    return null;
  }

  let list = [...lb];
  if (sortType === 'number') {
    list.sort((a, b) => {
      const aNo = (a.studentNo != null && a.studentNo !== '') ? Number(a.studentNo) : 999999;
      const bNo = (b.studentNo != null && b.studentNo !== '') ? Number(b.studentNo) : 999999;
      if (aNo !== bNo) return aNo - bNo;
      return (a.nickname || a.name || '').localeCompare(b.nickname || b.name || '', 'ko');
    });
  } else {
    // Rank order is original order of leaderboard
  }

  const rows = [];

  // Title Banner
  const title = (sortType === 'number')
    ? '배움날개 퀴즈 성취도 분석 (출석번호순)'
    : '배움날개 퀴즈 최종 랭킹 순위';
  rows.push([title]);
  rows.push(['생성일시', new Date().toLocaleString('ko-KR')]);
  rows.push([]); // blank line

  // Table Header
  rows.push([
    '출석번호',
    '이름(별명)',
    '소속 조',
    '최종 순위',
    '최종 기록',
    '맞힌 문제 수',
    '틀린 문제 수',
    '총 문제 수',
    '정답률(%)',
    '최대 연속정답(Streak)',
    '학습 성취도 평가'
  ]);

  list.forEach((p, idx) => {
    const rank = lb.findIndex(item => item.id === p.id) + 1;
    const finalScore = (p.altitude !== undefined && p.altitude > 0)
      ? `${p.altitude}m`
      : (p.kills !== undefined && p.kills > 0)
      ? `${p.score || 0}P (${p.kills}킬)`
      : `$${p.balance || 0}`;

    const totalQ = p.totalQuestions || ((p.correctCount || 0) + (p.wrongCount || 0));
    const acc = p.accuracy != null ? p.accuracy : (totalQ > 0 ? Math.round(((p.correctCount || 0) / totalQ) * 100) : 0);
    const feedback = acc >= 90 ? '최우수' : acc >= 70 ? '우수' : acc >= 50 ? '보통' : '보충 필요';

    rows.push([
      p.studentNo != null && p.studentNo !== '' ? p.studentNo : '',
      p.nickname || p.name,
      p.teamName || '-',
      rank,
      finalScore,
      p.correctCount || 0,
      p.wrongCount || 0,
      totalQ,
      acc,
      p.maxStreak || p.streak || 0,
      feedback
    ]);
  });

  // Section 2: Question Stats (if available in final report)
  const qStats = (typeof lastFinalReport !== 'undefined' && lastFinalReport && lastFinalReport.questionStats)
    ? lastFinalReport.questionStats
    : [];

  if (qStats && qStats.length > 0) {
    rows.push([]);
    rows.push([]);
    rows.push(['[문항별 정답률 및 취약 문제 분석]']);
    rows.push(['문항 번호', '문제 내용', '정답', '정답 횟수', '오답 횟수', '총 시도', '정답률(%)', '난이도 분석']);
    qStats.forEach((qs, qIdx) => {
      const diff = qs.accuracy >= 80 ? '쉬움' : qs.accuracy >= 50 ? '보통' : '어려움(보충 필요)';
      rows.push([
        qIdx + 1,
        qs.question,
        qs.correctAnswer,
        qs.correctCount,
        qs.wrongCount,
        qs.totalAttempts,
        `${qs.accuracy}%`,
        diff
      ]);
    });
  }

  // Join by TAB (\t) for columns and NEWLINE (\n) for rows
  return rows.map(r => r.join('\t')).join('\n');
}

/**
 * Action 1: Copy to Clipboard and Open sheets.new
 */
function copyAndOpenGoogleSheets(sortType = 'number') {
  const tsv = buildGoogleSheetsTSV(sortType);
  if (!tsv) {
    alert('내보낼 학생 성취도 데이터가 없습니다. 게임이 진행된 후 이용해주세요.');
    return;
  }

  navigator.clipboard.writeText(tsv).then(() => {
    // Open Google Sheets in new tab
    window.open('https://sheets.new', '_blank');
    showGsToast('✨ 성적 데이터가 복사되었습니다! 열린 구글 시트의 A1 셀에서 Ctrl+V (또는 Cmd+V)를 누르세요.');
  }).catch(err => {
    // Fallback if clipboard API fails
    const textarea = document.createElement('textarea');
    textarea.value = tsv;
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand('copy');
    document.body.removeChild(textarea);

    window.open('https://sheets.new', '_blank');
    showGsToast('✨ 성적 데이터가 복사되었습니다! 열린 구글 시트의 A1 셀에서 Ctrl+V (또는 Cmd+V)를 누르세요.');
  });
}

/**
 * Action 2: Download UTF-8 BOM CSV File for Google Sheets
 */
function downloadGoogleSheetsCsv() {
  const roomCode = (typeof currentRoomCode !== 'undefined' && currentRoomCode)
    ? currentRoomCode
    : (typeof lastFinalReport !== 'undefined' && lastFinalReport ? lastFinalReport.roomCode : null);

  if (!roomCode) {
    // Generate CSV on client if roomCode not found
    const tsv = buildGoogleSheetsTSV('number');
    if (!tsv) {
      alert('내보낼 학생 성취도 데이터가 없습니다.');
      return;
    }
    const csvContent = '\uFEFF' + tsv.replace(/\t/g, ',');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `배움날개_구글시트성취도_${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    return;
  }

  window.location.href = `/api/room/${roomCode}/export/csv`;
}

/**
 * Action 3: Send to Google Apps Script Webhook
 */
function sendToGoogleSheetsWebhook() {
  const input = document.getElementById('gasWebhookUrlInput');
  const webhookUrl = input ? input.value.trim() : '';

  if (!webhookUrl || !webhookUrl.startsWith('https://script.google.com/')) {
    alert('올바른 Google Apps Script 웹앱 URL (https://script.google.com/macros/s/.../exec)을 입력해주세요.');
    return;
  }

  // Save webhook URL in localStorage for convenience
  try {
    localStorage.setItem('saved_gas_webhook_url', webhookUrl);
  } catch (e) {}

  const lb = (typeof lastFinalReport !== 'undefined' && lastFinalReport && lastFinalReport.leaderboard)
    ? lastFinalReport.leaderboard
    : (typeof currentLeaderboard !== 'undefined' ? currentLeaderboard : []);

  const sortedByNo = [...lb].sort((a, b) => {
    const aNo = (a.studentNo != null && a.studentNo !== '') ? Number(a.studentNo) : 999999;
    const bNo = (b.studentNo != null && b.studentNo !== '') ? Number(b.studentNo) : 999999;
    if (aNo !== bNo) return aNo - bNo;
    return (a.nickname || a.name || '').localeCompare(b.nickname || b.name || '', 'ko');
  });

  const payload = {
    webhookUrl,
    reportData: {
      roomCode: typeof currentRoomCode !== 'undefined' ? currentRoomCode : 'ROOM',
      timestamp: new Date().toISOString(),
      leaderboard: lb,
      sortedByNo: sortedByNo,
      questionStats: (typeof lastFinalReport !== 'undefined' && lastFinalReport) ? lastFinalReport.questionStats : []
    }
  };

  fetch('/api/export/google-sheets', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  })
    .then(res => res.json())
    .then(data => {
      if (data.success) {
        alert('🎉 구글 스프레드시트로 성적이 성공적으로 전송되었습니다!');
      } else {
        alert('구글 시트 전송 실패: ' + (data.error || '알 수 없는 오류'));
      }
    })
    .catch(err => {
      alert('서버 통신 실패: ' + err.message);
    });
}

// Restore saved webhook URL on load
window.addEventListener('DOMContentLoaded', () => {
  try {
    const saved = localStorage.getItem('saved_gas_webhook_url');
    if (saved) {
      setTimeout(() => {
        const input = document.getElementById('gasWebhookUrlInput');
        if (input) input.value = saved;
      }, 500);
    }
  } catch (e) {}
});
