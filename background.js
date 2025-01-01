const API_KEY = "eyJhbGciOiJIUzI1NiJ9.eyJ0aWQiOjQ1MjQ4MjQzNiwiYWFpIjoxMSwidWlkIjoxNzM0NjE3NiwiaWFkIjoiMjAyNC0xMi0zMVQxMzoxNzozMy4wMDBaIiwicGVyIjoibWU6d3JpdGUiLCJhY3RpZCI6NzYyMDg5OCwicmduIjoidXNlMSJ9.ErHY3OjBbsfl6RZQXxe5j02lVnwInaXUMIoOECH1RQw"; // Monday.com API 엔드포인트
const API_URL = "https://api.monday.com/v2"; // Monday.com API 키

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "web_event") {
    // 받은 데이터 (주문번호, 업체명, 납기일자)
    const { orderNumber, companyName, dueDate } = message.data;

    // Monday.com API로 보내는 GraphQL 쿼리 작성
    const query = `
      mutation {
        create_item(
          board_id: 876363281,  // 게시판 ID
          group_id: "topics",  // 그룹 ID (예: "topics")
          item_name: "${orderNumber}",  // 주문번호를 item_name으로 사용
          column_values: "${JSON.stringify({
            text: companyName,  // 업체명
            due_date: { date: dueDate },  // 납기일자 (날짜 형식)
          }).replace(/"/g, '\\"')}"  // JSON을 문자열로 처리
        ) {
          id  // 아이템 생성 후 ID 반환
        }
      }
    `;

    // Monday.com API 호출
    fetch(API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${API_KEY}`,
      },
      body: JSON.stringify({ query }),
    })
      .then((response) => response.json())
      .then((data) => console.log("Data sent to Monday.com:", data))
      .catch((error) => console.error("Error sending data to Monday.com:", error));
  }
});
