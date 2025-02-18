const API_URL = "https://api.monday.com/v2";
const API_KEY = "eyJhbGciOiJIUzI1NiJ9.eyJ0aWQiOjQ1MjQ4MjQzNiwiYWFpIjoxMSwidWlkIjoxNzM0NjE3NiwiaWFkIjoiMjAyNC0xMi0zMVQxMzoxNzozMy4wMDBaIiwicGVyIjoibWU6d3JpdGUiLCJhY3RpZCI6NzYyMDg5OCwicmduIjoidXNlMSJ9.ErHY3OjBbsfl6RZQXxe5j02lVnwInaXUMIoOECH1RQw";
const BOARD_ID = "876363281";
const GROUP_ID = "new_group85406"; // 자신의 '발주접수' Group ID

function sendToMonday(orderNumber, companyName, dueDate) {
  const query = `mutation {
    create_item(
      board_id: ${BOARD_ID},
      group_id: "${GROUP_ID}",  
      item_name: "${orderNumber}",  
      column_values: "${JSON.stringify({
        text: companyName,  // 업체명
        due_date: { date: dueDate }, // 납기일
      }).replace(/"/g, '\\"')}"
    ) {
      id
    }
  }`;

  fetch(API_URL, {
    method: "POST",
    headers: {
      "Authorization": API_KEY,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ query })
  })
    .then((response) => response.json())
    .then((data) => {
      console.log("아이템 생성 성공:", data);
    })
    .catch((error) => {
      console.error("Monday.com에 아이템 생성 실패:", error);
    });
}

// ➖ 메시지 수신 핸들러 추가 ➖
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "get_order_data") {
    const orderNumber = document.querySelector("[id^='textfield-'][id$='-inputEl']")?.value?.trim() || "알 수 없음";
    const companyName = document.querySelector("[id^='common_Popup_TextField-'][id$='-inputEl']")?.value?.trim() || "알 수 없음";
    const dueDate = document.querySelector("[id^='datefield-'][id$='-inputEl']")?.value?.trim() || "알 수 없음";

    sendResponse({ data: { orderNumber, companyName, dueDate } });
  }
  return true; // 비동기 응답을 위해 true 반환
});

// 주문서 생성 감지
const observer = new MutationObserver((mutations) => {
  mutations.forEach((mutation) => {
    if (mutation.addedNodes.length > 0) {
      const newOrder = document.querySelector(".order-details"); // 주문서의 DOM 구조에 맞게 수정
      if (newOrder) {
        const orderNumber = newOrder.querySelector(".x-form-text-wrap x-form-text-wrap-default")?.value?.trim();
        const companyName = newOrder.querySelector(".x-form-field x-form-required-field x-form-text x-form-text-default ")?.value?.trim();
        const dueDate = newOrder.querySelector(".x-form-field x-form-text x-form-text-default  ")?.value?.trim();
        sendToMonday(orderNumber, companyName, dueDate);
      }
    }
  });
});

const targetNode = document.querySelector("#order-container"); // 주문서 추가 컨테이너 ID
if (targetNode) {
  observer.observe(targetNode, { childList: true, subtree: true });
}

// 폼 제출 시 이벤트 감지
document.addEventListener("click", (event) => {
  const target = event.target;
  if (target && target.id === "[id^='widget_button_save-'][id$='-btnInnerEl']") {
    console.log("주문서 저장 버튼 클릭 감지!");

    // 비동기 작업 처리
    setTimeout(() => {
      const orderNumberField = document.querySelector(".x-form-text-wrap x-form-text-wrap-default");
      const companyNameField = document.querySelector(".x-form-field x-form-required-field x-form-text x-form-text-default ");
      const dueDateField = document.querySelector(".x-form-field x-form-text x-form-text-default  ");

      const orderNumber = orderNumberField?.value?.trim() || null;
      const companyName = companyNameField?.value?.trim() || null;
      const dueDate = dueDateField?.value?.trim() || null;

      if (!orderNumber || !companyName || !dueDate) {
        console.warn("폼 데이터를 가져오지 못했습니다:", { orderNumber, companyName, dueDate });
        return;
      }

      chrome.runtime.sendMessage({
        type: "web_event",
        data: {
          orderNumber,
          companyName,
          dueDate,
        },
      }, (response) => {
        if (chrome.runtime.lastError) {
          console.error("백그라운드 스크립트 메시지 전달 오류:", chrome.runtime.lastError.message);
        } else {
          console.log("백그라운드 스크립트로 메시지 전달 성공:", response);
        }
      });

      sendToMonday(orderNumber, companyName, dueDate);
    }, 100);
  }
});
