document.getElementById("sync").addEventListener("click", () => {
  chrome.runtime.sendMessage({ type: "start_sync" });
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "start_sync") {
    console.log("동기화 시작 신호 수신");
    // 동기화 작업 처리
  }
});
