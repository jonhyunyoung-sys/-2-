// Excel Quiz Manager - Template Download, Upload & Parsing
let parsedQuestionsBuffer = [];

// Download Excel Template
function downloadExcelTemplate() {
  window.location.href = '/api/template/quiz-excel';
}

// Trigger file input dialog
function triggerExcelUpload() {
  document.getElementById('excelFileInput').click();
}

// Handle file selection
function onExcelFileSelected(event) {
  const file = event.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = function(e) {
    try {
      const data = new Uint8Array(e.target.result);
      if (typeof XLSX === 'undefined') {
        alert('엑셀 파서 라이브러리를 불러오지 못했습니다.');
        return;
      }
      const workbook = XLSX.read(data, { type: 'array' });
      const firstSheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[firstSheetName];
      const jsonRows = XLSX.utils.sheet_to_json(worksheet, { defval: '' });

      if (!jsonRows || jsonRows.length === 0) {
        alert('엑셀 파일에 유효한 데이터가 없습니다.');
        return;
      }

      parseAndPreviewExcelRows(jsonRows, file.name);
    } catch (err) {
      console.error(err);
      alert('엑셀 파일을 읽는 중 오류가 발생했습니다: ' + err.message);
    } finally {
      event.target.value = ''; // Reset input
    }
  };
  reader.readAsArrayBuffer(file);
}

// Normalize & parse rows
function parseAndPreviewExcelRows(rows, fileName) {
  parsedQuestionsBuffer = [];

  rows.forEach((row, idx) => {
    let qText = '';
    let opt1 = '', opt2 = '', opt3 = '', opt4 = '';
    let ans = 1;

    // Flexible column key matching
    for (const [key, val] of Object.entries(row)) {
      const k = key.trim().toLowerCase();
      const v = String(val).trim();

      if (k.includes('문제') || k.includes('질문') || k.includes('question')) {
        qText = v;
      } else if (k.includes('보기1') || k.includes('선택지1') || k === '1' || k.includes('option1')) {
        opt1 = v;
      } else if (k.includes('보기2') || k.includes('선택지2') || k === '2' || k.includes('option2')) {
        opt2 = v;
      } else if (k.includes('보기3') || k.includes('선택지3') || k === '3' || k.includes('option3')) {
        opt3 = v;
      } else if (k.includes('보기4') || k.includes('선택지4') || k === '4' || k.includes('option4')) {
        opt4 = v;
      } else if (k.includes('정답') || k.includes('answer')) {
        const num = parseInt(v, 10);
        if (!isNaN(num) && num >= 1 && num <= 4) {
          ans = num;
        }
      }
    }

    // Fallback: if columns not named by header, check row object values array
    if (!qText && Object.values(row).length >= 5) {
      const vals = Object.values(row);
      qText = String(vals[0]).trim();
      opt1 = String(vals[1]).trim();
      opt2 = String(vals[2]).trim();
      opt3 = String(vals[3]).trim();
      opt4 = String(vals[4]).trim();
      ans = parseInt(vals[5], 10) || 1;
    }

    if (qText && opt1 && opt2) {
      parsedQuestionsBuffer.push({
        id: 'custom_' + Date.now() + '_' + idx,
        question: qText,
        options: [opt1, opt2, opt3 || '보기 없음', opt4 || '보기 없음'],
        answer: Math.max(0, Math.min(3, ans - 1)) // 0-indexed
      });
    }
  });

  if (parsedQuestionsBuffer.length === 0) {
    alert('유효한 문제를 찾지 못했습니다.\n양식을 확인해주세요:\n[문제, 보기1, 보기2, 보기3, 보기4, 정답번호(1~4)]');
    return;
  }

  // Open Preview Modal
  const defaultSetName = '📁 ' + fileName.replace(/\.[^/.]+$/, '');
  openExcelPreviewModal(defaultSetName);
}

// Show Preview Modal
function openExcelPreviewModal(defaultName) {
  let modal = document.getElementById('excelPreviewModal');
  if (!modal) {
    createExcelPreviewModalDOM();
    modal = document.getElementById('excelPreviewModal');
  }

  document.getElementById('uploadQuizSetName').value = defaultName;
  document.getElementById('uploadQuizSetCount').innerText = `${parsedQuestionsBuffer.length}개 문제 감지됨`;

  const listContainer = document.getElementById('uploadQuizPreviewList');
  listContainer.innerHTML = parsedQuestionsBuffer.map((q, idx) => `
    <div style="background: rgba(15, 23, 42, 0.75); border: 1px solid var(--border); border-radius: 12px; padding: 0.9rem; margin-bottom: 0.6rem;">
      <div style="font-weight: 800; font-size: 0.95rem; color: #ffffff; margin-bottom: 0.5rem;">
        <span style="color: #38bdf8;">Q${idx + 1}.</span> ${escapeHtml(q.question)}
      </div>
      <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 0.4rem; font-size: 0.85rem;">
        ${q.options.map((opt, oIdx) => `
          <div style="padding: 0.35rem 0.6rem; border-radius: 6px; ${oIdx === q.answer ? 'background: rgba(16, 185, 129, 0.25); border: 1px solid #10b981; color: #34d399; font-weight: 700;' : 'background: rgba(255, 255, 255, 0.05); color: #94a3b8;'}">
            ${oIdx + 1}. ${escapeHtml(opt)} ${oIdx === q.answer ? '✓ (정답)' : ''}
          </div>
        `).join('')}
      </div>
    </div>
  `).join('');

  modal.style.display = 'flex';
}

function closeExcelPreviewModal() {
  const modal = document.getElementById('excelPreviewModal');
  if (modal) modal.style.display = 'none';
}

// Confirm & Save Quiz Set
async function confirmSaveQuizSet() {
  const name = document.getElementById('uploadQuizSetName').value.trim();
  if (!name) {
    alert('퀴즈 세트 이름을 입력해주세요.');
    return;
  }

  const id = 'custom_' + Date.now();
  const payload = {
    id,
    name,
    description: `엑셀 업로드 생성 (${parsedQuestionsBuffer.length}문항)`,
    questions: parsedQuestionsBuffer
  };

  try {
    const res = await fetch('/api/quiz-sets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const result = await res.json();

    if (result.success) {
      closeExcelPreviewModal();
      window.soundEngine.playBuy();

      // Refresh quiz sets dropdown on Host screen
      await refreshQuizSetsDropdown(id);

      alert(`🎉 퀴즈 세트 [${name}] 등록 완료!\n총 ${parsedQuestionsBuffer.length}문제가 바로 적용되었습니다.`);
    } else {
      alert('퀴즈 세트 등록 실패: ' + (result.error || '알 수 없는 오류'));
    }
  } catch (err) {
    console.error(err);
    alert('서버 저장 중 오류가 발생했습니다.');
  }
}

// Refresh quiz select options dynamically
async function refreshQuizSetsDropdown(selectIdToSet = null) {
  const select = document.getElementById('quizSetSelect');
  if (!select) return;

  try {
    const res = await fetch('/api/quiz-sets');
    const sets = await res.json();

    select.innerHTML = sets.map(s => `
      <option value="${s.id}">${s.name} (${s.count}문항)</option>
    `).join('');

    if (selectIdToSet) {
      select.value = selectIdToSet;
      if (typeof currentConfig !== 'undefined') {
        currentConfig.quizSetId = selectIdToSet;
        if (typeof syncConfig === 'function') syncConfig();
      }
    }
  } catch (e) {
    console.warn(e);
  }
}

// Create Preview Modal DOM
function createExcelPreviewModalDOM() {
  const div = document.createElement('div');
  div.id = 'excelPreviewModal';
  div.className = 'modal-backdrop';
  div.style.display = 'none';
  div.innerHTML = `
    <div class="modal-box" style="max-width: 640px; max-height: 85vh; display: flex; flex-direction: column;">
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem;">
        <div style="display: flex; align-items: center; gap: 0.5rem;">
          <span style="font-size: 1.6rem;">📊</span>
          <h2 style="font-size: 1.3rem; font-weight: 800;">엑셀 퀴즈 미리보기</h2>
        </div>
        <button class="btn btn-outline" style="padding: 0.2rem 0.5rem;" onclick="closeExcelPreviewModal()">✕</button>
      </div>

      <div style="margin-bottom: 1rem;">
        <label style="display: block; font-size: 0.85rem; font-weight: 700; color: var(--text-muted); margin-bottom: 0.3rem;">
          퀴즈 세트 제목
        </label>
        <div style="display: flex; gap: 0.5rem; align-items: center;">
          <input type="text" id="uploadQuizSetName" style="flex: 1; padding: 0.65rem 0.8rem; border-radius: 10px; background: #0f172a; border: 1px solid var(--border); color: #fff; font-weight: 700;" />
          <span id="uploadQuizSetCount" style="font-size: 0.8rem; background: #312e81; color: #a5b4fc; padding: 0.3rem 0.6rem; border-radius: 8px; white-space: nowrap;">0개</span>
        </div>
      </div>

      <div style="flex: 1; overflow-y: auto; max-height: 380px; padding-right: 4px; margin-bottom: 1rem;" id="uploadQuizPreviewList">
      </div>

      <div style="display: flex; gap: 0.6rem; justify-content: flex-end;">
        <button class="btn btn-outline" onclick="closeExcelPreviewModal()">취소</button>
        <button class="btn btn-success" style="font-weight: 900;" onclick="confirmSaveQuizSet()">
          ✅ 이 퀴즈 세트 등록 및 적용
        </button>
      </div>
    </div>
  `;
  document.body.appendChild(div);
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str).replace(/[&<>"']/g, (m) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[m]));
}
