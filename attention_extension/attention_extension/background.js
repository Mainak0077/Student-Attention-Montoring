// background.js
// Handles communication with Python backend for saving reports

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {

  // Called when popup asks to save report
  if (msg.action === "save_report") {
    
    fetch("http://localhost:8765/save_report", { method: "POST" })
      .then(response => {
        if (!response.ok) throw new Error("Server error");
        return response.blob(); // Expect a file, not JSON
      })
      .then(blob => {
        // Convert Blob to Base64 Data URL to trigger download
        const reader = new FileReader();
        reader.readAsDataURL(blob);
        reader.onloadend = function() {
          const dataUrl = reader.result;
          
          // Trigger the Chrome Download
          chrome.downloads.download({
            url: dataUrl,
            filename: "Attention_Report_" + new Date().toISOString().slice(0,10) + ".pdf",
            saveAs: true // Prompts user where to save
          }, (downloadId) => {
             if (chrome.runtime.lastError) {
                 sendResponse({ status: "error", error: chrome.runtime.lastError.message });
             } else {
                 sendResponse({ status: "ok", downloadId: downloadId });
             }
          });
        };
      })
      .catch(e => {
        console.error("Download failed:", e);
        sendResponse({ status: "error", error: String(e) });
      });

    // Required to allow async response
    return true;
  }

});