/**
 * content.js - 얼마에요 4.0 ↔ Monday.com 연동 (개선판)
 *
 * 개선 사항:
 * 1. Content Script 재활성화 문제 해결
 *    - MutationObserver로 '판매주문서조회' 메뉴/탭 전환을 감지
 *    - 탭 전환 시 자동으로 리스너 재등록
 * 2. 품목 리스트 → Monday.com Subitem 자동 생성
 */

const API_URL = "https://api.monday.com/v2";
const API_KEY = "eyJhbGciOiJIUzI1NiJ9.eyJ0aWQiOjQ1MjQ4MjQzNiwiYWFpIjoxMSwidWlkIjoxNzM0NjE3NiwiaWFkIjoiMjAyNC0xMi0zMVQxMzoxNzozMy4wMDBaIiwicGVyIjoibWU6d3JpdGUiLCJhY3RpZCI6NzYyMDg5OCwicmduIjoidXNlMSJ9.ErHY3OjBbsfl6RZQXxe5j02lVnwInaXUMIoOECH1RQw";
const BOARD_ID = "876363281";
const GROUP_ID = "new_group85406";

// ─────────────────────────────────────────────
// [개선 1] 페이지 전환 감지 및 리스너 재등록
// ─────────────────────────────────────────────

let isOrderViewActive = false;

/**
 * 현재 DOM에 '판매주문서조회' 영역이 활성화되어 있는지 확인
 * - 얼마에요 4.0은 SPA 구조이므로 실제 판매주문서 컨테이너 존재 여부로 판별
 */
function checkOrderViewActive() {
  const containers = document.querySelectorAll(".x-window.x-window-default");
  return containers.length > 0;
}

/**
 * DOM 변화를 감시하여 판매주문서 뷰 진입/이탈을 감지
 * SPA에서 탭/메뉴 전환 시 content.js가 재실행되지 않는 문제를 보완
 */
const pageObserver = new MutationObserver(() => {
  const nowActive = checkOrderViewActive();
  if (!isOrderViewActive && nowActive) {
    console.log("[얼마↔Monday] 판매주문서 뷰 감지 - 리스너 활성화");
    isOrderViewActive = true;
  } else if (isOrderViewActive && !nowActive) {
    console.log("[얼마↔Monday] 판매주문서 뷰 이탈 감지");
    isOrderViewActive = false;
  }
});

// body 전체 변화 감시 (SPA 라우팅 대응)
pageObserver.observe(document.body, { childList: true, subtree: true });


// ─────────────────────────────────────────────
// [핵심] 활성 주문서 컨테이너 가져오기
// ─────────────────────────────────────────────

function getActiveOrderContainer() {
  const containers = document.querySelectorAll(".x-window.x-window-default");
  if (!containers.length) return null;

  let maxZIndex = -1;
  let activeContainer = null;

  for (const container of containers) {
    const zIndex = parseInt(container.style.zIndex || "0", 10);
    if (zIndex > maxZIndex && container.style.display !== "none") {
      maxZIndex = zIndex;
      activeContainer = container;
    }
  }

  return activeContainer || containers[0];
}


// ─────────────────────────────────────────────
// [핵심] 주문서 기본 데이터 추출
// ─────────────────────────────────────────────

function extractOrderData(container) {
  const textfieldEls    = container.querySelectorAll("[id^='textfield-'][id$='-inputEl']");
  const companyNameEls  = container.querySelectorAll("[id^='common_Popup_TextField-'][id$='-inputEl']");
  const dueDateEls      = container.querySelectorAll("[id^='datefield-'][id$='-inputEl']");

  const orderNumber = textfieldEls[0]?.value?.trim() || "알 수 없음";
  const companyName = companyNameEls[1]?.value?.trim() || "알 수 없음";
  let dueDate       = dueDateEls[1]?.value?.trim() || "알 수 없음";

  if (dueDate !== "알 수 없음") {
    const parsed = new Date(dueDate);
    dueDate = isNaN(parsed) ? "알 수 없음" : parsed.toISOString().split("T")[0];
  }

  return { orderNumber, companyName, dueDate };
}


// ─────────────────────────────────────────────
// [개선 2] 품목 리스트 추출
// ─────────────────────────────────────────────

/**
 * 주문서 내 품목 리스트 그리드(Grid)에서 품목명·수량 추출
 *
 * 얼마에요 4.0은 ExtJS Grid를 사용합니다.
 * 각 행(row)은 .x-grid-row 클래스를 가지며
 * 셀(cell)은 .x-grid-cell-inner 클래스를 가집니다.
 *
 * ※ 실제 컬럼 순서는 화면 설정에 따라 다를 수 있으므로
 *   헤더 텍스트를 기준으로 인덱스를 동적으로 찾습니다.
 */
function extractOrderItems(container) {
  const items = [];

  try {
    // 품목 그리드 헤더에서 컬럼 인덱스 파악
    const headerCells = container.querySelectorAll(".x-column-header-text");
    let itemNameIdx = -1;
    let quantityIdx = -1;

    headerCells.forEach((cell, idx) => {
      const text = cell.textContent.trim();
      if (text.includes("품목") || text.includes("품명") || text.includes("제품명")) {
        itemNameIdx = idx;
      }
      if (text.includes("수량") || text.includes("주문수량")) {
        quantityIdx = idx;
      }
    });

    // 헤더를 못 찾으면 기본값 사용 (0: 품목명, 2: 수량 - 일반적인 구성)
    if (itemNameIdx === -1) itemNameIdx = 0;
    if (quantityIdx === -1) quantityIdx = 2;

    // 각 행에서 데이터 추출
    const rows = container.querySelectorAll(".x-grid-row");
    rows.forEach((row) => {
      const cells = row.querySelectorAll(".x-grid-cell-inner");
      if (cells.length === 0) return;

      const itemName = cells[itemNameIdx]?.textContent?.trim();
      const quantity = cells[quantityIdx]?.textContent?.trim();

      if (itemName && itemName !== "") {
        items.push({
          name: itemName,
          quantity: quantity || "1",
        });
      }
    });
  } catch (e) {
    console.warn("[얼마↔Monday] 품목 추출 중 오류:", e);
  }

  console.log(`[얼마↔Monday] 추출된 품목 수: ${items.length}`, items);
  return items;
}


// ─────────────────────────────────────────────
// [개선 2] Monday.com Subitem 생성
// ─────────────────────────────────────────────

/**
 * 부모 아이템 ID를 받아 품목 리스트를 subitem으로 일괄 생성
 * Monday.com GraphQL: create_subitem mutation 사용
 */
async function createSubitems(parentItemId, items) {
  if (!items.length) {
    console.log("[얼마↔Monday] 생성할 품목 없음 - Subitem 생략");
    return;
  }

  for (const item of items) {
    const columnValues = {
      // Subitem 보드의 수량 컬럼 ID에 맞게 수정 필요
      // 예: "numbers" 타입 컬럼 ID가 "quantity"인 경우
      "numbers": item.quantity,
    };
    const columnValuesStr = JSON.stringify(columnValues).replace(/"/g, '\\"');

    const query = `mutation {
      create_subitem(
        parent_item_id: ${parentItemId},
        item_name: "${item.name.replace(/"/g, '\\"')}",
        column_values: "${columnValuesStr}"
      ) {
        id
        name
      }
    }`;

    try {
      const response = await fetch(API_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${API_KEY}`,
          "API-Version": "2024-01",
        },
        body: JSON.stringify({ query }),
      });

      const data = await response.json();
      if (data.errors) {
        console.error(`[얼마↔Monday] Subitem 생성 오류 (${item.name}):`, data.errors);
      } else {
        console.log(`[얼마↔Monday] Subitem 생성 성공: ${item.name}`, data);
      }
    } catch (e) {
      console.error(`[얼마↔Monday] Subitem 요청 실패 (${item.name}):`, e);
    }
  }
}


// ─────────────────────────────────────────────
// [핵심] Monday.com 메인 아이템 생성 + Subitem
// ─────────────────────────────────────────────

async function syncWithMonday(orderNumber, companyName, dueDate, items = []) {
  const columnValues = {
    "text9": companyName,
    "date": { "date": dueDate },
  };
  const columnValuesStr = JSON.stringify(columnValues).replace(/"/g, '\\"');

  const query = `mutation {
    create_item(
      board_id: ${BOARD_ID},
      group_id: "${GROUP_ID}",
      item_name: "${orderNumber.replace(/"/g, '\\"')}",
      column_values: "${columnValuesStr}"
    ) {
      id
    }
  }`;

  const response = await fetch(API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${API_KEY}`,
      "API-Version": "2024-01",
    },
    body: JSON.stringify({ query }),
  });

  if (!response.ok) {
    throw new Error(`HTTP 오류: ${response.status}`);
  }

  const data = await response.json();
  if (data.errors) {
    throw new Error(`GraphQL 오류: ${JSON.stringify(data.errors)}`);
  }

  const newItemId = data?.data?.create_item?.id;
  console.log(`[얼마↔Monday] 아이템 생성 성공 (ID: ${newItemId})`);

  // [개선 2] Subitem 생성
  if (newItemId && items.length > 0) {
    console.log(`[얼마↔Monday] Subitem ${items.length}개 생성 시작...`);
    await createSubitems(newItemId, items);
  }

  return data;
}


// ─────────────────────────────────────────────
// [개선 1] 메시지 리스너 - 항상 응답 가능하도록 등록
// popup.js에서 get_order_data 요청 시 처리
// ─────────────────────────────────────────────

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "get_order_data") {

    // [개선 1] 탭 전환 후 재진입 시에도 컨테이너를 새로 탐색
    const activeContainer = getActiveOrderContainer();

    if (!activeContainer) {
      console.warn("[얼마↔Monday] 주문서 컨테이너 없음. 판매주문서조회 탭을 확인하세요.");
      sendResponse({
        status: "error",
        message: "주문서 컨테이너를 찾을 수 없습니다. 판매주문서조회 탭이 열려 있는지 확인하세요.",
      });
      return true;
    }

    const orderData = extractOrderData(activeContainer);
    // [개선 2] 품목 데이터도 함께 추출
    const items = extractOrderItems(activeContainer);

    console.log("[얼마↔Monday] 수집 데이터:", orderData, "품목:", items);
    sendResponse({ status: "ok", data: orderData, items });
    return true;
  }

  if (message.type === "do_sync") {
    const { orderData, items } = message;
    syncWithMonday(orderData.orderNumber, orderData.companyName, orderData.dueDate, items)
      .then((result) => sendResponse({ status: "success", data: result }))
      .catch((err) => sendResponse({ status: "error", message: err.message }));
    return true;
  }
});
