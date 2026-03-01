/**
 * background.js - 얼마에요 4.0 ↔ Monday.com 연동 (개선판 v2)
 *
 * [Subitem 보드 컬럼 ID - "Subitems of Weekly Team Tasks" 기준]
 * name      → Name        (품목명, item_name으로 자동 처리)
 * numbers   → 수량
 * text0     → Maker
 * text8     → S/N
 * text      → T/N (or C/N)
 * text3     → VT번호
 * long_text → 비고
 * checkbox  → 확인
 * person    → Owner
 * files1    → Files
 */

const API_KEY  = "eyJhbGciOiJIUzI1NiJ9.eyJ0aWQiOjQ1MjQ4MjQzNiwiYWFpIjoxMSwidWlkIjoxNzM0NjE3NiwiaWFkIjoiMjAyNC0xMi0zMVQxMzoxNzozMy4wMDBaIiwicGVyIjoibWU6d3JpdGUiLCJhY3RpZCI6NzYyMDg5OCwicmduIjoidXNlMSJ9.ErHY3OjBbsfl6RZQXxe5j02lVnwInaXUMIoOECH1RQw";
const API_URL  = "https://api.monday.com/v2";
const BOARD_ID = "876363281";

// ⚠️ content.js와 동일하게 설정 필요
const GOOGLE_DRIVE_API_KEY  = "AIzaSyAOwptybR4j9CPeXRaIt5D8cMtMLwO6vc8";
const MONDAY_LINK_COLUMN_ID = "link_mm119pnk"; // title: "Link", type: "link" ✅

// ─────────────────────────────────────────────
// [개선 1] 탭 전환 시 content script 재주입
// SPA에서 URL 변경 없이 뷰만 바뀌는 경우 content.js가
// 언로드될 수 있으므로, 탭 활성화 시 재주입 시도
// ─────────────────────────────────────────────

chrome.tabs.onActivated.addListener(async ({ tabId }) => {
  try {
    const tab = await chrome.tabs.get(tabId);
    if (tab.url && tab.url.includes("ebook.iquest.co.kr")) {
      await reinjectContentScript(tabId);
    }
  } catch (e) {
    // 탭 정보 조회 실패 (닫힌 탭 등) - 무시
  }
});

// 페이지 내 URL 변경(SPA 해시/히스토리 변경) 감지
chrome.webNavigation?.onHistoryStateUpdated?.addListener(async (details) => {
  if (details.url.includes("ebook.iquest.co.kr")) {
    console.log("[얼마↔Monday] SPA 페이지 전환 감지 - content script 재주입");
    await reinjectContentScript(details.tabId);
  }
});

/**
 * content.js 재주입 함수
 * 이미 주입되어 있으면 ping으로 확인 후 생략, 응답 없으면 재주입
 */
async function reinjectContentScript(tabId) {
  try {
    // ping 메시지로 content script 활성 여부 확인
    await chrome.tabs.sendMessage(tabId, { type: "ping" });
    console.log("[얼마↔Monday] content script 이미 활성 상태");
  } catch {
    // 응답 없음 → 재주입
    try {
      await chrome.scripting.executeScript({
        target: { tabId },
        files: ["content.js"],
      });
      console.log("[얼마↔Monday] content script 재주입 완료");
    } catch (e) {
      console.warn("[얼마↔Monday] content script 재주입 실패:", e.message);
    }
  }
}


// ─────────────────────────────────────────────
// 메시지 수신: popup → background → Monday API
// (content.js에서 직접 호출이 막히는 환경 대비 폴백)
// ─────────────────────────────────────────────

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "ping") {
    sendResponse({ status: "pong" });
    return;
  }

  if (message.type === "web_event") {
    const { orderNumber, companyName, dueDate, items = [], memo = null } = message.data;

    if (!orderNumber || !companyName || !dueDate) {
      sendResponse({ status: "error", message: "유효하지 않은 데이터입니다." });
      return;
    }

    syncWithMonday(orderNumber, companyName, dueDate, items, memo)
      .then((result) => sendResponse({ status: "success", message: "동기화 완료", data: result }))
      .catch((error) => sendResponse({ status: "error", message: "동기화 실패", error: error.message }));

    return true; // 비동기 응답
  }
});


// ─────────────────────────────────────────────
// Monday.com API: 아이템 생성 + Subitem 생성
// ─────────────────────────────────────────────

async function syncWithMonday(orderNumber, companyName, dueDate, items = [], memo = null) {
  const columnValues = {
    "text9": companyName,
    "date": { "date": dueDate },
  };
  const columnValuesStr = JSON.stringify(columnValues).replace(/"/g, '\\"');

  const query = `mutation {
    create_item(
      board_id: 876363281,
      group_id: "new_group85406",
      item_name: "${orderNumber.replace(/"/g, '\\"')}",
      column_values: "${columnValuesStr}"
    ) { id }
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

  if (!response.ok) throw new Error(`HTTP 오류: ${response.status}`);

  const data = await response.json();
  if (data.errors) throw new Error(`GraphQL 오류: ${JSON.stringify(data.errors)}`);

  const newItemId = data?.data?.create_item?.id;

  // Subitem 생성
  if (newItemId && items.length > 0) {
    await createSubitems(newItemId, items);
  }

  // Drive 파일 검색 → Monday Link 컬럼 저장
  if (newItemId && memo) {
    console.log(`[Drive] 검색 시작 (발주번호: ${memo})`);
    const driveFile = await findDriveFileByPONumber(memo, companyName);
    if (driveFile) {
      await attachDriveLinkToMonday(newItemId, driveFile);
    } else {
      console.warn(`[Drive] "${memo}" 관련 파일을 찾지 못했습니다.`);
    }
  }

  return data;
}

async function createSubitems(parentItemId, items) {
  for (const item of items) {
    // ──────────────────────────────────────────────────────
    // Subitem 컬럼 값 설정
    // "Subitems of Weekly Team Tasks" 보드 실제 컬럼 ID 기준
    //
    // ✅ 현재 채우는 컬럼:
    //   "numbers"   → 수량 (얼마에요 주문서에서 추출)
    //
    // 📝 필요 시 아래 컬럼 추가 가능 (얼마에요 데이터와 매핑):
    //   "text0"     → Maker
    //   "text8"     → S/N
    //   "text"      → T/N (or C/N)
    //   "text3"     → VT번호
    //   "long_text" → 비고
    // ──────────────────────────────────────────────────────
    const subColumnValues = {
      "numbers": item.quantity,   // 수량 (id: numbers, type: numbers)
      // "text0": item.maker,     // Maker - 얼마에요에서 해당 필드 추출 시 활성화
      // "text8": item.serialNo,  // S/N  - 얼마에요에서 해당 필드 추출 시 활성화
    };

    const subColStr = JSON.stringify(subColumnValues).replace(/"/g, '\\"');

    const query = `mutation {
      create_subitem(
        parent_item_id: ${parentItemId},
        item_name: "${item.name.replace(/"/g, '\\"')}",
        column_values: "${subColStr}"
      ) { id name }
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

    const d = await res.json();
    if (d.errors) {
      console.error(`[Subitem 오류] ${item.name}:`, d.errors);
    } else {
      console.log(`[Subitem 성공] ${item.name}`);
    }
  }
}


// ─────────────────────────────────────────────
// Google Drive 유사 파일 검색
// ─────────────────────────────────────────────

async function findDriveFileByPONumber(poNumber, companyName) {
  if (!poNumber) return null;
  if (GOOGLE_DRIVE_API_KEY === "여기에_Google_Drive_API_Key_입력") {
    console.warn("[Drive] API Key 미설정 - 검색 생략");
    return null;
  }

  try {
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

      if (fname.includes(po)) score += 100;

      const exts = ["", ".pdf", ".xlsx", ".docx", ".jpg", ".png"];
      if (exts.some(ext => fname.endsWith(po + ext))) score += 30;

      if (co && fname.includes(co)) score += 20;
      score += Math.max(0, 10 - Math.floor(fname.length / 10));

      return { ...file, score };
    });

    scored.sort((a, b) => b.score - a.score);
    const best = scored[0];
    console.log(`[Drive] 최적 파일: "${best.name}" (점수: ${best.score})`);
    return { name: best.name, url: best.webViewLink, score: best.score };

  } catch (e) {
    console.error("[Drive] 파일 검색 실패:", e);
    return null;
  }
}


// ─────────────────────────────────────────────
// Monday.com Link 컬럼에 Drive URL 저장
// ─────────────────────────────────────────────

async function attachDriveLinkToMonday(itemId, driveFile) {
  if (!driveFile?.url) return;

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
    const d = await res.json();
    if (d.errors) console.error("[얼마↔Monday] Link 저장 오류:", d.errors);
    else          console.log(`[얼마↔Monday] Drive 링크 저장 성공: "${driveFile.name}"`);
  } catch (e) {
    console.error("[얼마↔Monday] Link 저장 요청 실패:", e);
  }
}
