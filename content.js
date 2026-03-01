/**
 * content.js - 얼마에요 4.0 ↔ Monday.com 연동 (v3)
 *
 * v3 추가 기능:
 *   - 주문서 '메모'란에서 발주번호 추출
 *   - Google Drive API로 발주번호 포함 파일 검색 (유사도 기반)
 *     파일명 패턴: "업체명_발주번호.pdf" 등 → 발주번호로 검색
 *   - 가장 유사한 파일의 webViewLink → Monday.com Link 컬럼에 저장
 *     (Drive 파일 업데이트 시에도 항상 최신 버전 열람 가능)
 *
 * [Subitem 보드 컬럼 ID - "Subitems of Weekly Team Tasks"]
 *   name      → Name (품목명, item_name 자동 처리)
 *   numbers   → 수량
 *   text0     → Maker
 *   text8     → S/N
 *   text      → T/N (or C/N)
 *   text3     → VT번호
 *   long_text → 비고
 *   checkbox  → 확인
 *   person    → Owner
 *   files1    → Files
 *
 * ─────────────────────────────────────────────────────
 * ⚠️ 아래 설정값을 반드시 채워주세요
 * ─────────────────────────────────────────────────────
 */

const API_URL  = "https://api.monday.com/v2";
const API_KEY  = "eyJhbGciOiJIUzI1NiJ9.eyJ0aWQiOjQ1MjQ4MjQzNiwiYWFpIjoxMSwidWlkIjoxNzM0NjE3NiwiaWFkIjoiMjAyNC0xMi0zMVQxMzoxNzozMy4wMDBaIiwicGVyIjoibWU6d3JpdGUiLCJhY3RpZCI6NzYyMDg5OCwicmduIjoidXNlMSJ9.ErHY3OjBbsfl6RZQXxe5j02lVnwInaXUMIoOECH1RQw";
const BOARD_ID = "876363281";
const GROUP_ID = "new_group85406";

// ⚠️ 1. Google Cloud Console > API & Services > Credentials에서 발급
//       Drive API 활성화 필요
//       API Key 도메인 제한 권장: ebook.iquest.co.kr
const GOOGLE_DRIVE_API_KEY = "여기에_Google_Drive_API_Key_입력";

// ⚠️ 2. Monday.com 보드에 "Link" 타입 컬럼 추가 후 ID 입력
//       확인 방법: API Playground →
//       { boards(ids: 876363281) { columns { id title type } } }
const MONDAY_LINK_COLUMN_ID = "link_mm119pnk"; // title: "Link", type: "link" ✅


// ─────────────────────────────────────────────
// [개선 1] SPA 페이지 전환 감지
// ─────────────────────────────────────────────

let isOrderViewActive = false;

function checkOrderViewActive() {
  return document.querySelectorAll(".x-window.x-window-default").length > 0;
}

const pageObserver = new MutationObserver(() => {
  const nowActive = checkOrderViewActive();
  if (!isOrderViewActive && nowActive) {
    console.log("[얼마↔Monday] 판매주문서 뷰 감지");
    isOrderViewActive = true;
  } else if (isOrderViewActive && !nowActive) {
    console.log("[얼마↔Monday] 판매주문서 뷰 이탈");
    isOrderViewActive = false;
  }
});
pageObserver.observe(document.body, { childList: true, subtree: true });


// ─────────────────────────────────────────────
// 활성 주문서 컨테이너 가져오기
// ─────────────────────────────────────────────

function getActiveOrderContainer() {
  const containers = document.querySelectorAll(".x-window.x-window-default");
  if (!containers.length) return null;

  let maxZIndex = -1;
  let active = null;
  for (const c of containers) {
    const z = parseInt(c.style.zIndex || "0", 10);
    if (z > maxZIndex && c.style.display !== "none") {
      maxZIndex = z;
      active = c;
    }
  }
  return active || containers[0];
}


// ─────────────────────────────────────────────
// 주문서 기본 데이터 추출
// ─────────────────────────────────────────────

function extractOrderData(container) {
  const textfieldEls   = container.querySelectorAll("[id^='textfield-'][id$='-inputEl']");
  const companyNameEls = container.querySelectorAll("[id^='common_Popup_TextField-'][id$='-inputEl']");
  const dueDateEls     = container.querySelectorAll("[id^='datefield-'][id$='-inputEl']");

  const orderNumber = textfieldEls[0]?.value?.trim()   || "알 수 없음";
  const companyName = companyNameEls[1]?.value?.trim() || "알 수 없음";
  let dueDate       = dueDateEls[1]?.value?.trim()     || "알 수 없음";

  if (dueDate !== "알 수 없음") {
    const parsed = new Date(dueDate);
    dueDate = isNaN(parsed) ? "알 수 없음" : parsed.toISOString().split("T")[0];
  }

  return { orderNumber, companyName, dueDate };
}


// ─────────────────────────────────────────────
// [v3 신규] 메모란 발주번호 추출
// 주문서 우측 하단 '메모' 필드
// ─────────────────────────────────────────────

function extractMemo(container) {
  // 방법 1: 라벨 텍스트 '메모' 기준으로 인접 input/textarea 탐색
  const labels = container.querySelectorAll(".x-form-item-label-text");
  for (const label of labels) {
    if (label.textContent.trim() === "메모") {
      const formItem = label.closest(".x-form-item");
      if (formItem) {
        const input = formItem.querySelector("input, textarea");
        if (input?.value?.trim()) {
          const val = input.value.trim();
          console.log("[얼마↔Monday] 메모 추출 성공:", val);
          return val;
        }
      }
    }
  }

  // 방법 2 (폴백): textareafield 첫 번째 항목
  const textareas = container.querySelectorAll("[id^='textareafield-'][id$='-inputEl']");
  if (textareas.length > 0 && textareas[0]?.value?.trim()) {
    const val = textareas[0].value.trim();
    console.log("[얼마↔Monday] 메모 폴백 추출:", val);
    return val;
  }

  console.warn("[얼마↔Monday] 메모란을 찾지 못했습니다.");
  return null;
}


// ─────────────────────────────────────────────
// [v3 신규] Google Drive 유사 파일 검색
//
// 전략:
//   1. 발주번호 키워드로 Drive name contains 검색
//      → "업체명_발주번호.pdf" 패턴 파일 탐색
//   2. 결과 파일들을 유사도 점수로 정렬
//      - 발주번호 포함          +100점 (필수)
//      - 발주번호가 파일명 끝   +30점  (업체명_발주번호 패턴)
//      - 업체명 포함            +20점  (보너스)
//      - 파일명 짧을수록        +최대10점 (정확한 매칭일수록 짧음)
//   3. 최고 점수 파일의 webViewLink 반환
// ─────────────────────────────────────────────

async function findDriveFileByPONumber(poNumber, companyName) {
  if (!poNumber) {
    console.warn("[Drive] 발주번호 없음 - 검색 생략");
    return null;
  }
  if (GOOGLE_DRIVE_API_KEY === "AIzaSyAOwptybR4j9CPeXRaIt5D8cMtMLwO6vc8") {
    console.warn("[Drive] API Key 미설정 - 검색 생략");
    return null;
  }

  try {
    // Drive API v3: 파일명에 발주번호가 포함된 파일 검색
    const q      = encodeURIComponent(`name contains '${poNumber}' and trashed = false`);
    const fields = encodeURIComponent("files(id,name,webViewLink,modifiedTime)");
    const url    = `https://www.googleapis.com/drive/v3/files?q=${q}&fields=${fields}&key=${GOOGLE_DRIVE_API_KEY}`;

    const response = await fetch(url);
    if (!response.ok) throw new Error(`Drive API HTTP ${response.status}`);

    const data  = await response.json();
    const files = data.files || [];

    console.log(`[Drive] 검색 결과 ${files.length}개:`, files.map(f => f.name));
    if (!files.length) return null;

    // 유사도 점수 계산
    const scored = files.map(file => {
      const fname = file.name.toLowerCase();
      const po    = poNumber.toLowerCase();
      const co    = (companyName || "").toLowerCase();
      let score   = 0;

      if (fname.includes(po)) score += 100; // 발주번호 포함 (필수)

      // 발주번호가 파일명 끝부분 → 업체명_발주번호 패턴
      const exts = ["", ".pdf", ".xlsx", ".docx", ".jpg", ".png"];
      if (exts.some(ext => fname.endsWith(po + ext))) score += 30;

      // 업체명 포함 보너스
      if (co && fname.includes(co)) score += 20;

      // 파일명 길이 보너스 (짧을수록 정확)
      score += Math.max(0, 10 - Math.floor(fname.length / 10));

      return { ...file, score };
    });

    scored.sort((a, b) => b.score - a.score);
    const best = scored[0];

    console.log(`[Drive] 최적 파일: "${best.name}" (유사도 점수: ${best.score})`);
    return { name: best.name, url: best.webViewLink, score: best.score };

  } catch (e) {
    console.error("[Drive] 파일 검색 실패:", e);
    return null;
  }
}


// ─────────────────────────────────────────────
// 품목 리스트 추출 (ExtJS Grid)
// ─────────────────────────────────────────────

function extractOrderItems(container) {
  const items = [];
  try {
    const headerCells = container.querySelectorAll(".x-column-header-text");
    let itemNameIdx = -1, quantityIdx = -1;

    headerCells.forEach((cell, idx) => {
      const text = cell.textContent.trim();
      if (text.includes("품목") || text.includes("품명") || text.includes("제품명")) itemNameIdx = idx;
      if (text.includes("수량") || text.includes("주문수량")) quantityIdx = idx;
    });

    if (itemNameIdx === -1) itemNameIdx = 0;
    if (quantityIdx === -1) quantityIdx = 2;

    const rows = container.querySelectorAll(".x-grid-row");
    rows.forEach(row => {
      const cells    = row.querySelectorAll(".x-grid-cell-inner");
      if (!cells.length) return;
      const itemName = cells[itemNameIdx]?.textContent?.trim();
      const quantity = cells[quantityIdx]?.textContent?.trim();
      if (itemName) items.push({ name: itemName, quantity: quantity || "1" });
    });
  } catch (e) {
    console.warn("[얼마↔Monday] 품목 추출 오류:", e);
  }
  console.log(`[얼마↔Monday] 추출 품목 ${items.length}개`, items);
  return items;
}


// ─────────────────────────────────────────────
// Monday.com Subitem 생성
// ─────────────────────────────────────────────

async function createSubitems(parentItemId, items) {
  if (!items.length) return;

  for (const item of items) {
    const subColumnValues = {
      "numbers": item.quantity,
      // "text0": item.maker,
      // "text8": item.serialNo,
    };
    const colStr = JSON.stringify(subColumnValues).replace(/"/g, '\\"');
    const query  = `mutation {
      create_subitem(
        parent_item_id: ${parentItemId},
        item_name: "${item.name.replace(/"/g, '\\"')}",
        column_values: "${colStr}"
      ) { id name }
    }`;

    try {
      const res  = await fetch(API_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${API_KEY}`,
          "API-Version": "2024-01",
        },
        body: JSON.stringify({ query }),
      });
      const data = await res.json();
      if (data.errors) console.error(`[Subitem 오류] ${item.name}:`, data.errors);
      else             console.log(`[Subitem 성공] ${item.name}`);
    } catch (e) {
      console.error(`[Subitem 실패] ${item.name}:`, e);
    }
  }
}


// ─────────────────────────────────────────────
// [v3 신규] Drive webViewLink → Monday Link 컬럼 저장
// ─────────────────────────────────────────────

async function attachDriveLinkToMonday(itemId, driveFile) {
  if (!driveFile?.url) return;

  // Monday.com Link 컬럼 형식: { "url": "...", "text": "표시이름" }
  const linkValue = JSON.stringify({ url: driveFile.url, text: driveFile.name })
                      .replace(/"/g, '\\"');

  const query = `mutation {
    change_column_value(
      board_id: ${BOARD_ID},
      item_id: ${itemId},
      column_id: "${MONDAY_LINK_COLUMN_ID}",
      value: "${linkValue}"
    ) { id }
  }`;

  try {
    const res  = await fetch(API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${API_KEY}`,
        "API-Version": "2024-01",
      },
      body: JSON.stringify({ query }),
    });
    const data = await res.json();
    if (data.errors) console.error("[얼마↔Monday] Link 저장 오류:", data.errors);
    else             console.log(`[얼마↔Monday] Drive 링크 저장 성공: "${driveFile.name}"`);
  } catch (e) {
    console.error("[얼마↔Monday] Link 저장 요청 실패:", e);
  }
}


// ─────────────────────────────────────────────
// 메인 동기화 함수
// ─────────────────────────────────────────────

async function syncWithMonday(orderNumber, companyName, dueDate, items = [], memo = null) {
  // Step 1. 메인 아이템 생성
  const columnValues = {
    "text9": companyName,
    "date":  { "date": dueDate },
  };
  const colStr = JSON.stringify(columnValues).replace(/"/g, '\\"');
  const query  = `mutation {
    create_item(
      board_id: ${BOARD_ID},
      group_id: "${GROUP_ID}",
      item_name: "${orderNumber.replace(/"/g, '\\"')}",
      column_values: "${colStr}"
    ) { id }
  }`;

  const res = await fetch(API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${API_KEY}`,
      "API-Version": "2024-01",
    },
    body: JSON.stringify({ query }),
  });
  if (!res.ok) throw new Error(`HTTP 오류: ${res.status}`);

  const data = await res.json();
  if (data.errors) throw new Error(`GraphQL 오류: ${JSON.stringify(data.errors)}`);

  const newItemId = data?.data?.create_item?.id;
  console.log(`[얼마↔Monday] 아이템 생성 완료 (ID: ${newItemId})`);

  // Step 2. Subitem 생성 (품목 리스트)
  if (newItemId && items.length > 0) {
    console.log(`[얼마↔Monday] Subitem ${items.length}개 생성 중...`);
    await createSubitems(newItemId, items);
  }

  // Step 3. [v3] Drive 파일 검색 → Link 컬럼 저장
  if (newItemId && memo) {
    console.log(`[얼마↔Monday] Drive 검색 시작 (발주번호: ${memo})`);
    const driveFile = await findDriveFileByPONumber(memo, companyName);
    if (driveFile) {
      await attachDriveLinkToMonday(newItemId, driveFile);
    } else {
      console.warn(`[얼마↔Monday] Drive에서 "${memo}" 관련 파일 없음`);
    }
  }

  return data;
}


// ─────────────────────────────────────────────
// 메시지 리스너
// ─────────────────────────────────────────────

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {

  if (message.type === "ping") {
    sendResponse({ status: "pong" });
    return true;
  }

  if (message.type === "get_order_data") {
    const container = getActiveOrderContainer();
    if (!container) {
      sendResponse({
        status: "error",
        message: "주문서 컨테이너를 찾을 수 없습니다. 판매주문서조회 탭이 열려 있는지 확인하세요.",
      });
      return true;
    }

    const orderData = extractOrderData(container);
    const items     = extractOrderItems(container);
    const memo      = extractMemo(container); // [v3] 메모란 발주번호

    console.log("[얼마↔Monday] 수집 완료:", { ...orderData, memo, itemCount: items.length });
    sendResponse({ status: "ok", data: orderData, items, memo });
    return true;
  }

  if (message.type === "do_sync") {
    const { orderData, items, memo } = message;
    syncWithMonday(orderData.orderNumber, orderData.companyName, orderData.dueDate, items, memo)
      .then(result => sendResponse({ status: "success", data: result }))
      .catch(err   => sendResponse({ status: "error", message: err.message }));
    return true;
  }
});
