// popup.js

function sendMessageToContentScript(message) {
  chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
    if (tabs.length === 0) return;
    chrome.tabs.sendMessage(tabs[0].id, message, (response) => {
      if (chrome.runtime.lastError) {
        console.log("Connection error. Ensure you are on a Google Meet page.");
      }
    });
  });
}

document.getElementById("startBtn").onclick = () => {
  sendMessageToContentScript({ action: "START" });
  window.close();
};

// NEW: Pause Button Action
document.getElementById("pauseBtn").onclick = () => {
  sendMessageToContentScript({ action: "PAUSE" });
};

document.getElementById("stopBtn").onclick = () => {
  sendMessageToContentScript({ action: "STOP" });
};

document.getElementById("openDash").onclick = () => {
  chrome.tabs.create({ url: chrome.runtime.getURL("dashboard.html") });
};

document.getElementById("saveReport").onclick = () => {
  chrome.runtime.sendMessage({ action: "save_report" }, (response) => {
    if (!response) { alert("Backend not running."); return; }
    if (response.status === "ok") { alert("Report requested!"); } 
    else { alert("Failed: " + response.error); }
  });
};