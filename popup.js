document.getElementById("sync").addEventListener("click", () => {
  chrome.runtime.sendMessage({ type: "start_sync" });
});

