const API_KEY = "eyJhbGciOiJIUzI1NiJ9.eyJ0aWQiOjQ1MjQ4MjQzNiwiYWFpIjoxMSwidWlkIjoxNzM0NjE3NiwiaWFkIjoiMjAyNC0xMi0zMVQxMzoxNzozMy4wMDBaIiwicGVyIjoibWU6d3JpdGUiLCJhY3RpZCI6NzYyMDg5OCwicmduIjoidXNlMSJ9.ErHY3OjBbsfl6RZQXxe5j02lVnwInaXUMIoOECH1RQw"; // Monday.com API 엔드포인트
const API_URL = "https://api.monday.com/v2"; // Monday.com API 키

// 메시지 수신 및 처리
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "web_event") {
    console.log("동기화 시작 신호 수신:", message.data);

    const { orderNumber, companyName, dueDate } = message.data;

    // 데이터 유효성 검사
    if (!orderNumber || !companyName || !dueDate) {
      console.error("유효하지 않은 데이터:", { orderNumber, companyName, dueDate });
      sendResponse({ status: "error", message: "유효하지 않은 데이터입니다." });
      return;
    }

    // 동기화 작업 수행
    syncWithMonday(orderNumber, companyName, dueDate)
      .then((result) => {
        console.log("동기화 성공:", result);
        sendResponse({ status: "success", message: "동기화 완료", data: result });
      })
      .catch((error) => {
        console.error("동기화 중 오류 발생:", error);
        sendResponse({ status: "error", message: "동기화 실패", error });
      });

    // 비동기 응답을 사용하기 위해 true 반환
    return true;
  }
});

// 동기화 작업 함수
async function syncWithMonday(orderNumber, companyName, dueDate) {
  console.log("Monday.com 동기화 작업 실행 중...");

  const columnValues = {
    "text9": companyName,         // companyName -> text9 컬럼
    "date": { "date": dueDate }   // dueDate -> date 컬럼
  };
  
// 쿼리 문자열을 한 줄로 압축하고 이스케이프 처리
  const columnValuesString = JSON.stringify(columnValues).replace(/"/g, '\\"');
  const query = `mutation { create_item(board_id: 876363281, group_id: "new_group85406", item_name: "${orderNumber}", column_values: "${columnValuesString}") { id } }`;

  console.log("전송할 쿼리:", query); // 디버깅용
  
// Monday.com API 호출
try {
    const response = await fetch(API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${API_KEY}`,
      },
      body: JSON.stringify({ query }),
    });

    if (!response.ok) {
      const errorText = await response.text(); // 오류 상세 정보 가져오기
      throw new Error(`HTTP 오류: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    if (data.errors) {
      throw new Error(`GraphQL 오류: ${JSON.stringify(data.errors)}`);
    }

    console.log("Monday.com 응답:", data);
    return data;
  } catch (error) {
    console.error("동기화 중 오류 발생:", error);
    throw error;
  }
}
