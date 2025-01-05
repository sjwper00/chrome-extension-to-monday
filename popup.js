// 팝업에서 "Start Sync" 버튼 클릭 감지
document.getElementById("sync").addEventListener("click", () => {
  console.log("동기화 요청 메시지 전송");

  // 백그라운드 스크립트로 메시지 전송
  chrome.runtime.sendMessage({ type: "start_sync" }, (response) => {
    if (chrome.runtime.lastError) {
      console.error("백그라운드 스크립트와의 통신 오류:", chrome.runtime.lastError.message);
    } else {
      console.log("백그라운드 스크립트 응답:", response);
    }
  });
});
