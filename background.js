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
  } else if (message.type === "start_sync") {
    console.log("start_sync 메시지 수신");

    // 여기에 start_sync에 맞는 로직 추가
    // 현재는 단순 테스트용 메시지 응답
    sendResponse({ status: "success", message: "start_sync 메시지 처리 완료" });
  } else {
    console.warn("알 수 없는 메시지 타입:", message.type);
    sendResponse({ status: "error", message: "알 수 없는 메시지 타입입니다." });
  }
});

// 동기화 작업 함수
async function syncWithMonday(orderNumber, companyName, dueDate) {
  console.log("Monday.com 동기화 작업 실행 중...");
  
    // Monday.com API로 보내는 GraphQL 쿼리 작성
  // 주문번호를 item_name으로 사용
  // 아이템 생성 후 ID 반환
    const query = `
      mutation {
        create_item(
          board_id: 876363281,  
          group_id: "topics",  
          item_name: "${orderNumber}",  
          column_values: "${JSON.stringify({
            text: companyName,  // 업체명
            due_date: { date: dueDate },  // 납기일자 (날짜 형식)
          }).replace(/"/g, '\\"')}"  
        ) {
          id  
        }
      }
    `;// JSON을 문자열로 처리

    // Monday.com API 호출
  try{
  const response = await fetch(API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${API_KEY}`,
    },
    body: JSON.stringify({ query }),
  });
// *HTTP 상태 코드 검사 추가**
  if (!response.ok) { //  변경된 부분: HTTP 오류 확인 로직
  console.error(`HTTP 오류: ${response.status}`);
  throw new Error(`HTTP 오류: ${response.status}`);
}

  const data = await response.json();
    
    //GraphQL 응답 검사 추가
  if (data.errors) { //GraphQL 응답 오류 확인
    console.error("GraphQL 오류:", data.errors);
    throw new Error(`GraphQL 오류: ${JSON.stringify(data.errors)}`);
  }

    console.log("동기화 성공:", data); // 성공 로그 추가
    return data;   
  } catch(error){
    console.error("동기화 중 오류 발생:",error); // 에러 처리 추가
    throw error;//에러 재전달
  }
}
