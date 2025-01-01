const API_URL = "https://api.monday.com/v2";
const API_KEY = "eyJhbGciOiJIUzI1NiJ9.eyJ0aWQiOjQ1MjQ4MjQzNiwiYWFpIjoxMSwidWlkIjoxNzM0NjE3NiwiaWFkIjoiMjAyNC0xMi0zMVQxMzoxNzozMy4wMDBaIiwicGVyIjoibWU6d3JpdGUiLCJhY3RpZCI6NzYyMDg5OCwicmduIjoidXNlMSJ9.ErHY3OjBbsfl6RZQXxe5j02lVnwInaXUMIoOECH1RQw"; // Monday.com에서 발급받은 API 키를 입력하세요.
const BOARD_ID = "Weekly Team Tasks"; // Weekly Board ID를 입력하세요.

function sendToMonday(orderNumber, companyName) {
  const query = `mutation {
    create_item(
      board_id: ${BOARD_ID},
      item_name: "${orderNumber}",
      column_values: "{\"업체명\": \"${companyName}\"}"
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
      console.error("에러 발생:", error);
    });
}

// 주문서 생성 감지
const observer = new MutationObserver((mutations) => {
  mutations.forEach((mutation) => {
    if (mutation.addedNodes.length > 0) {
      const newOrder = document.querySelector(".order-details"); // 주문서의 DOM 구조에 맞게 수정
      if (newOrder) {
        const orderNumber = newOrder.querySelector(".order-number").textContent.trim(); // 주문번호 클래스
        const companyName = newOrder.querySelector(".company-name").textContent.trim(); // 거래처명 클래스
        sendToMonday(orderNumber, companyName);
      }
    }
  });
});

const targetNode = document.querySelector("#order-container"); // 주문서가 추가되는 컨테이너 ID
if (targetNode) {
  observer.observe(targetNode, { childList: true, subtree: true });
}
