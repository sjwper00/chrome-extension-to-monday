/**
 * popup.js - 얼마에요 4.0 ↔ Monday.com 연동 (개선판)
 *
 * 개선 사항:
 * 1. 동기화 전 추출 데이터 미리보기 표시
 * 2. 품목 리스트(items)도 함께 전송
 * 3. 상태 피드백 UI (로딩 / 성공 / 오류)
 * 4. [개선 1] content script 미응답 시 재주입 안내
 */

const syncBtn  = document.getElementById("sync");
const statusEl = document.getElementById("status");
const previewEl = document.getElementById("preview");

function setStatus(msg, type = "info") {
  statusEl.textContent = msg;
  statusEl.className = `status ${type}`;
}

function showPreview(orderData, items) {
  if (!previewEl) return;
  previewEl.innerHTML = `
    <div class="preview-row"><span>주문번호</span><strong>${orderData.orderNumber}</strong></div>
    <div class="preview-row"><span>업체명</span><strong>${orderData.companyName}</strong></div>
    <div class="preview-row"><span>납기일</span><strong>${orderData.dueDate}</strong></div>
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

    // [개선 1] content script에 데이터 요청
    chrome.tabs.sendMessage(tabId, { type: "get_order_data" }, (response) => {
      // content script 응답 없음 → 재주입 안내
      if (chrome.runtime.lastError || !response) {
        setStatus(
          "⚠️ 판매주문서조회 탭을 열고 주문서를 선택한 뒤 다시 시도하세요.\n(페이지 새로고침 없이 탭 전환 시 발생)",
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

      const { data: orderData, items = [] } = response;

      // 미리보기 표시
      showPreview(orderData, items);
      setStatus("Monday.com에 전송 중...", "loading");

      // background.js로 동기화 요청 (items 포함)
      chrome.runtime.sendMessage(
        {
          type: "web_event",
          data: { ...orderData, items },
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
