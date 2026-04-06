// popup.js - FINAL COMPLETE VERSION

// Helper to send messages safely
function sendMessageToContentScript(message, callback) {
  chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
    if (tabs.length === 0) return;
    chrome.tabs.sendMessage(tabs[0].id, message, (response) => {
      // Ignore errors if popup closed, but log them for debugging
      if (chrome.runtime.lastError) {
        console.warn("Connection Error:", chrome.runtime.lastError.message);
        if (callback) callback({ status: "error" });
      } else if (callback) {
        callback(response);
      }
    });
  });
}

// Helper to update button appearance
function updatePauseButtonUI(isPaused) {
    const btn = document.getElementById("pauseBtn");
    if (isPaused) {
        btn.innerText = "RESUME MONITORING";
        btn.style.background = "#e3b341"; // Amber
        btn.style.color = "#000";
    } else {
        btn.innerText = "PAUSE MONITORING";
        btn.style.background = "#ffc107"; // Yellow
        btn.style.color = "#333";
    }
}

// 1. CHECK STATUS ON OPEN
document.addEventListener('DOMContentLoaded', () => {
    sendMessageToContentScript({ action: "GET_STATUS" }, (response) => {
        if (response && response.isRunning) {
            updatePauseButtonUI(response.isPaused);
        }
    });
});

// 2. START BUTTON
document.getElementById("startBtn").onclick = () => {
  sendMessageToContentScript({ action: "START" });
  window.close();
};

// 3. PAUSE BUTTON
document.getElementById("pauseBtn").onclick = () => {
  const btn = document.getElementById("pauseBtn");
  btn.disabled = true; 

  sendMessageToContentScript({ action: "PAUSE" }, (response) => {
      btn.disabled = false;
      
      if (response && response.status === "paused") {
          updatePauseButtonUI(true);
      } else if (response && response.status === "resumed") {
          updatePauseButtonUI(false);
      } else {
          // If response is "stopped" or "error"
          alert("⚠️ Monitoring hasn't started yet! Please click START first.");
      }
  });
};

// 4. STOP & SAVE BUTTON
document.getElementById("stopBtn").onclick = () => {
  const stopBtn = document.getElementById("stopBtn");
  stopBtn.innerText = "STOPPING...";
  stopBtn.disabled = true;

  sendMessageToContentScript({ action: "STOP" }, (response) => {
    console.log("Stop signal sent. Saving report...");
    stopBtn.innerText = "SAVING REPORT...";
    
    chrome.runtime.sendMessage({ action: "save_report" }, (res) => {
      if (res && res.status === "ok") {
        alert("✅ Report Saved!");
        window.close();
      } else {
        alert("❌ Error saving report.");
        stopBtn.disabled = false;
        stopBtn.innerText = "Stop Monitoring";
      }
    });
  });
};

document.getElementById("openDash").onclick = () => {
  chrome.tabs.create({ url: chrome.runtime.getURL("dashboard.html") });
};