/**
 * popup.js - 얼마에요 4.0 ↔ Monday.com 연동 (v3)
 *
 * v3 변경:
 *   - memo(발주번호) 수신 및 background로 전달
 *   - 미리보기에 발주번호 + Drive 검색 여부 표시
 */

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

      // 미리보기 표시 (발주번호 포함)
      showPreview(orderData, items, memo);
      setStatus("Monday.com에 전송 중...", "loading");

      // background.js로 동기화 요청 (items + memo 포함)
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
