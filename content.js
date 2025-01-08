const API_URL = "https://api.monday.com/v2";
const API_KEY = "eyJhbGciOiJIUzI1NiJ9.eyJ0aWQiOjQ1MjQ4MjQzNiwiYWFpIjoxMSwidWlkIjoxNzM0NjE3NiwiaWFkIjoiMjAyNC0xMi0zMVQxMzoxNzozMy4wMDBaIiwicGVyIjoibWU6d3JpdGUiLCJhY3RpZCI6NzYyMDg5OCwicmduIjoidXNlMSJ9.ErHY3OjBbsfl6RZQXxe5j02lVnwInaXUMIoOECH1RQw"; // Monday.com에서 발급받은 API 키를 입력하세요.
const BOARD_ID = "876363281"; // Weekly Board ID
const groupId = "new_group85406"// 자신의 '발주접수' Group ID

function sendToMonday(orderNumber, companyName) {
  const query = `mutation {
    create_item(
      board_id: ${BOARD_ID},
      group_id: "${groupId}",  
      item_name: ${orderNumber},
      column_values: "${JSON.stringify({
        text: companyName, // 업체명
        due_date: { date: dueDate }, //날짜 값
      }).replace(/"/g, '\\"')}"
    ) {
      id
    }
  }`;
//group_id 추가
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

// 주문서 생성 감지
const observer = new MutationObserver((mutations) => {
  mutations.forEach((mutation) => {
    if (mutation.addedNodes.length > 0) {
      const newOrder = document.querySelector(".order-details"); // 주문서의 DOM 구조에 맞게 수정
      if (newOrder) {
        const orderNumber = newOrder.querySelector(".x-form-field x-form-text x-form-text-default  ").value.trim(); // 주문번호 클래스 -> 얼마에요에서 주문번호에 대한 id element
        const companyName = newOrder.querySelector(".x-form-field x-form-required-field x-form-text x-form-text-default ").value.trim(); // 거래처명 클래스 -> 얼마에요에서 거래처명에 대한 class element
        const dueDate = newOrder.querySelector("..x-form-field x-form-text x-form-text-default  ").value.trim(); // 얼마에요에서 납기일에 대한 class element
        sendToMonday(orderNumber, companyName, dueDate);
      }
    }
  });
});

const targetNode = document.querySelector("#order-container"); // 주문서가 추가되는 컨테이너 ID
if (targetNode) {
  observer.observe(targetNode, { childList: true, subtree: true });
}

// 폼 제출 시 이벤트 감지
document.addEventListener("submit", function (event) {
  // 이벤트 대상이 "order-form"인지 확인
  if (event.target && event.target.id === "widget_button_save-2422-btnInnerEl") { //저장 버튼 트리거 id
    event.preventDefault(); // 폼 기본 동작 방지 (페이지가 닫히지 않도록 처리)

    // 비동기 작업 처리
    setTimeout(() => {
      // 폼 필드 선택
      const orderNumberField = event.target.querySelector(".x-form-field.x-form-text.x-form-text-default");
      const companyNameField = event.target.querySelector(".x-form-field.x-form-required-field.x-form-text.x-form-text-default");
      const dueDateField = event.target.querySelector(".x-form-field.x-form-text.x-form-text-default");

      // 값 추출 및 트림 처리
      const orderNumber = orderNumberField?.value?.trim() || null;
      const companyName = companyNameField?.value?.trim() || null;
      const dueDate = dueDateField?.value?.trim() || null;

      // 모든 데이터가 유효한지 확인
      if (!orderNumber || !companyName || !dueDate) {
        console.warn("폼 데이터를 가져오지 못했습니다:", { orderNumber, companyName, dueDate });
        return;
      }

      // 받은 데이터를 백그라운드 스크립트로 전달
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

      // Monday.com에 아이템 생성
      sendToMonday(orderNumber, companyName, dueDate);
    }, 50); // 50ms 지연 추가
  }
});

