const API_KEY = "your_monday_api_key";
const API_URL = "https://api.monday.com/v2";

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "web_event") {
    const query = `
      mutation {
        create_item (
          board_id: your_board_id,
          group_id: "topics",
          item_name: "New Web Event",
          column_values: "{ \\"text_column\\": \\"${message.data.text}\\", \\"url_column\\": \\"${message.data.url}\\" }"
        ) {
          id
        }
      }
    `;

    fetch(API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: API_KEY,
      },
      body: JSON.stringify({ query }),
    })
      .then((response) => response.json())
      .then((data) => console.log("Data sent to Monday.com:", data))
      .catch((error) => console.error("Error sending data to Monday.com:", error));
  }
});
