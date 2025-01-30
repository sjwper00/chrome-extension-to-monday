// 팝업에서 "Start Sync" 버튼 클릭 감지
document.getElementById("sync").addEventListener("click", () => {
  console.log("동기화 요청 메시지 전송 준비");

  // Content Script에 데이터 요청 메시지 전송
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (!tabs.length) {
      console.error("활성 탭이 없습니다.");
      return;
    }

    const activeTabId = tabs[0].id;

    chrome.tabs.sendMessage(activeTabId, { type: "get_order_data" }, (response) => {
      if (chrome.runtime.lastError) {
        console.error("Content Script와의 통신 오류:", chrome.runtime.lastError.message);
        return;
      }

      if (response && response.data) {
        const { orderNumber, companyName, dueDate } = response.data;

        // 동기화 요청 메시지 전송
        chrome.runtime.sendMessage(
          { type: "web_event", data: { orderNumber, companyName, dueDate } },
          (response) => {
            if (chrome.runtime.lastError) {
              console.error("백그라운드 스크립트 메시지 전송 실패:", chrome.runtime.lastError.message);
            } else {
              console.log("백그라운드 스크립트 응답:", response);
            }
          }
        );
      } else {
        console.error("주문 데이터 수신 실패");
      }
    });
  });
});
