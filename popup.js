/**
 * popup.js - 얼마에요 4.0 ↔ Monday.com 연동 (v4)
 *
 * v4 변경:
 *   - 설정 탭 추가: Google Drive API Key를 chrome.storage.local에 안전하게 저장
 *   - 동기화 시 storage에서 Key를 읽어 background.js로 전달
 *   - Key가 코드에 하드코딩되지 않음 (보안 강화)
 */

// ─────────────────────────────────────────────
// 탭 전환
// ─────────────────────────────────────────────

document.getElementById("btn-sync").addEventListener("click", () => {
  document.getElementById("tab-sync").style.display     = "block";
  document.getElementById("tab-settings").style.display = "none";
  document.getElementById("btn-sync").classList.add("active");
  document.getElementById("btn-settings").classList.remove("active");
});

document.getElementById("btn-settings").addEventListener("click", () => {
  document.getElementById("tab-sync").style.display     = "none";
  document.getElementById("tab-settings").style.display = "block";
  document.getElementById("btn-settings").classList.add("active");
  document.getElementById("btn-sync").classList.remove("active");
});


// ─────────────────────────────────────────────
// 설정 탭: Key 표시/숨김 토글
// ─────────────────────────────────────────────

document.getElementById("toggle-drive-key").addEventListener("click", () => {
  const input = document.getElementById("input-drive-key");
  input.type  = input.type === "password" ? "text" : "password";
});

document.getElementById("toggle-monday-key").addEventListener("click", () => {
  const input = document.getElementById("input-monday-key");
  input.type  = input.type === "password" ? "text" : "password";
});


// ─────────────────────────────────────────────
// 설정 탭: 저장된 Key 불러와서 표시
// ─────────────────────────────────────────────

function updateIndicator(id, isSet, label) {
  const el = document.getElementById(id);
  if (isSet) {
    el.textContent = "✅ 설정됨";
    el.className   = "key-indicator set";
  } else {
    el.textContent = label;
    el.className   = "key-indicator unset";
  }
}

chrome.storage.local.get(["driveApiKey", "mondayApiKey"], (result) => {
  if (result.driveApiKey) {
    document.getElementById("input-drive-key").value = result.driveApiKey;
    updateIndicator("indicator-drive-key", true);
  } else {
    updateIndicator("indicator-drive-key", false, "⚠ 미설정");
  }

  if (result.mondayApiKey) {
    document.getElementById("input-monday-key").value = result.mondayApiKey;
    updateIndicator("indicator-monday-key", true);
  } else {
    updateIndicator("indicator-monday-key", false, "⚠ 미설정 (코드 기본값 사용 중)");
  }
});


// ─────────────────────────────────────────────
// 설정 탭: 저장 버튼
// ─────────────────────────────────────────────

document.getElementById("save-settings").addEventListener("click", () => {
  const driveKey  = document.getElementById("input-drive-key").value.trim();
  const mondayKey = document.getElementById("input-monday-key").value.trim();
  const statusEl  = document.getElementById("setting-status");

  if (!driveKey) {
    statusEl.textContent = "❌ Google Drive API Key를 입력해 주세요.";
    statusEl.className   = "setting-status err";
    return;
  }

  chrome.storage.local.set({ driveApiKey: driveKey, mondayApiKey: mondayKey || null }, () => {
    statusEl.textContent = "✅ 저장 완료! 동기화 탭에서 사용할 수 있습니다.";
    statusEl.className   = "setting-status ok";
    updateIndicator("indicator-drive-key", true);
    if (mondayKey) updateIndicator("indicator-monday-key", true);

    setTimeout(() => { statusEl.style.display = "none"; }, 3000);
  });
});


// ─────────────────────────────────────────────
// 동기화 탭
// ─────────────────────────────────────────────

const syncBtn   = document.getElementById("sync");
const statusEl  = document.getElementById("status");
const previewEl = document.getElementById("preview");

function setStatus(msg, type = "info") {
  statusEl.textContent = msg;
  statusEl.className   = `status ${type}`;
}

function showPreview(orderData, items, memo) {
  if (!previewEl) return;
  const driveRow = memo
    ? `<div class="preview-row"><span>발주번호(메모)</span><strong>${memo}</strong></div>
       <div class="preview-drive">🔍 Drive에서 "${memo}" 파일 검색 예정</div>`
    : `<div class="preview-drive preview-no-drive">⚠️ 메모란 비어있음 - Drive 검색 생략</div>`;

  previewEl.innerHTML = `
    <div class="preview-row"><span>주문번호</span><strong>${orderData.orderNumber}</strong></div>
    <div class="preview-row"><span>업체명</span><strong>${orderData.companyName}</strong></div>
    <div class="preview-row"><span>납기일</span><strong>${orderData.dueDate}</strong></div>
    ${driveRow}
    <div class="preview-row"><span>품목 수</span><strong>${items.length}개</strong></div>
    ${items.map(i => `<div class="preview-item">• ${i.name} (수량: ${i.quantity})</div>`).join("")}
  `;
  previewEl.style.display = "block";
}

syncBtn.addEventListener("click", () => {
  syncBtn.disabled = true;
  setStatus("주문서 데이터 수집 중...", "loading");
  if (previewEl) previewEl.style.display = "none";

  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (!tabs.length) {
        setStatus("활성 탭이 없습니다.", "error");
        syncBtn.disabled = false;
        return;
      }

      const tabId = tabs[0].id;

      chrome.tabs.sendMessage(tabId, { type: "get_order_data" }, (response) => {
        if (chrome.runtime.lastError || !response) {
          setStatus(
            "⚠️ 판매주문서조회 탭을 열고 주문서를 선택한 뒤 다시 시도하세요.\n(탭 전환 후 재발생 시 페이지 새로고침)",
            "error"
          );
          syncBtn.disabled = false;
          return;
        }

        if (response.status === "error") {
          setStatus(`오류: ${response.message}`, "error");
          syncBtn.disabled = false;
          return;
        }

        const { data: orderData, items = [], memo = null } = response;
        showPreview(orderData, items, memo);
        setStatus("Monday.com에 전송 중...", "loading");

        // background.js로 동기화 요청
        chrome.runtime.sendMessage(
          {
            type: "web_event",
            data: { ...orderData, items, memo },
          },
          (bgResponse) => {
            if (chrome.runtime.lastError) {
              setStatus("백그라운드 스크립트 오류: " + chrome.runtime.lastError.message, "error");
            } else if (bgResponse?.status === "success") {
              setStatus("✅ Monday.com 동기화 완료!", "success");
            } else {
              setStatus("❌ 동기화 실패: " + (bgResponse?.message || "알 수 없는 오류"), "error");
            }
            syncBtn.disabled = false;
          }
        );
      });
    });
  });
