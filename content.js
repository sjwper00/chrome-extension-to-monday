document.addEventListener("click", (event) => {
  const eventData = {
    element: event.target.tagName,
    text: event.target.innerText,
    url: window.location.href,
    timestamp: new Date().toISOString(),
  };

  chrome.runtime.sendMessage({ type: "web_event", data: eventData });
});
