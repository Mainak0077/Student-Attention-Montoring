// dashboard.js - FINAL COMPLETE VERSION
console.log("Cognisense X Engine: Loaded");

// --- UI References ---
const wsStatus = document.getElementById("wsStatus");
const statusValue = document.getElementById("statusValue");
const yawnCountVal = document.getElementById("yawnCount");
const micStatus = document.getElementById("micStatus");
const yawnLog = document.getElementById("yawnLog");
const downloadBtn = document.getElementById("downloadBtn");

// --- State Variables ---
let ws = null;
let reconnectTimer = null;
let totalYawns = 0;
const MAX_POINTS = 60; // How many data points to show on the chart

// ===========================
// 1. CHART INITIALIZATION
// ===========================
const attCtx = document.getElementById("attentionChart").getContext("2d");
const attGrad = attCtx.createLinearGradient(0, 0, 0, 300);
attGrad.addColorStop(0, "rgba(46, 160, 67, 0.4)"); 
attGrad.addColorStop(1, "rgba(46, 160, 67, 0.0)");

const attentionChart = new Chart(attCtx, {
  type: 'line',
  data: {
    labels: [],
    datasets: [{
      label: 'Focus',
      data: [],
      borderColor: '#2ea043',
      backgroundColor: attGrad,
      borderWidth: 2,
      tension: 0.3,
      fill: true,
      pointRadius: 0
    }, {
      label: 'Fatigue (Yawn)',
      data: [],
      type: 'scatter',
      backgroundColor: '#da3633', // Red dots for yawns
      pointRadius: 6
    }]
  },
  options: {
    responsive: true,
    maintainAspectRatio: false,
    animation: false,
    scales: {
      y: { min: 0, max: 2.5, grid: { color: '#30363d' }, ticks: { display: false } },
      x: { display: false }
    },
    plugins: { legend: { display: false } }
  }
});

const spkCtx = document.getElementById("speakingChart").getContext("2d");
const speakingChart = new Chart(spkCtx, {
  type: 'bar',
  data: {
    labels: [],
    datasets: [{
      label: 'Audio',
      data: [],
      backgroundColor: '#bc8cff',
      borderRadius: 2
    }]
  },
  options: {
    responsive: true,
    maintainAspectRatio: false,
    animation: false,
    scales: {
      y: { min: 0, max: 1.2, display: false },
      x: { display: false }
    },
    plugins: { legend: { display: false } }
  }
});

// ===========================
// 2. CONNECTION & LOGIC
// ===========================
function connect() {
    if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) return;

    console.log("Connecting to server...");
    wsStatus.innerText = "CONNECTING...";
    wsStatus.style.background = "#e3b341"; // Yellow
    wsStatus.style.color = "#000";
    
    ws = new WebSocket("ws://127.0.0.1:8765/");

    ws.onopen = () => {
        console.log("✅ Connected to Server");
        wsStatus.innerText = "SYSTEM ONLINE";
        wsStatus.style.background = "#2ea043"; // Green
        wsStatus.style.color = "#fff";
        if (reconnectTimer) {
            clearInterval(reconnectTimer);
            reconnectTimer = null;
        }
    };

    // --- ON DISCONNECT: WIPE DATA ---
    ws.onclose = () => {
        console.log("❌ Connection Closed. Resetting Dashboard.");
        wsStatus.innerText = "MONITORING STOPPED";
        wsStatus.style.background = "#555"; 
        wsStatus.style.color = "#fff";
        
        ws = null;
        // Stop reconnecting loop if we manually stopped
        if (reconnectTimer) clearInterval(reconnectTimer);
        
        // TRIGGER BLANK STATE
        resetDashboard();
    };

    ws.onerror = (err) => {
        console.error("WS Error:", err);
        ws.close();
    };

    ws.onmessage = handleMessage;
}

// Start connection logic immediately
connect();

// ===========================
// 3. RESET FUNCTION (Blank State)
// ===========================
function resetDashboard() {
    console.log("🧹 Wiping Dashboard Data...");
    
    // 1. Reset Variables
    totalYawns = 0;
    
    // 2. Reset UI Text
    statusValue.innerText = "--";
    statusValue.style.color = "#c9d1d9";
    yawnCountVal.innerText = "0";
    micStatus.innerText = "SILENT";
    micStatus.style.color = "#8b949e";
    yawnLog.innerHTML = ""; // Clear event logs

    // 3. Clear Attention Chart
    attentionChart.data.labels = [];
    attentionChart.data.datasets.forEach((dataset) => {
        dataset.data = [];
    });
    attentionChart.update();

    // 4. Clear Audio Chart
    speakingChart.data.labels = [];
    speakingChart.data.datasets.forEach((dataset) => {
        dataset.data = [];
    });
    speakingChart.update();
}

// ===========================
// 4. MESSAGE HANDLER
// ===========================
function handleMessage(event) {
    try {
        const msg = JSON.parse(event.data);
        const now = new Date().toLocaleTimeString();

        // A. SPEAKING DATA
        if (msg.type === "speaking_point") {
            const isSpeaking = (msg.value === 1);
            
            // Update Text
            if (isSpeaking) {
                micStatus.innerText = "DETECTED";
                micStatus.style.color = "#bc8cff";
            } else {
                micStatus.innerText = "SILENT";
                micStatus.style.color = "#8b949e";
            }

            // Update Chart
            updateChart(speakingChart, now, isSpeaking ? 1.0 : 0.05, true);
        }
        
        // B. ATTENTION DATA
        else if (msg.type === "attention_point") {
            // Update Text
            if (msg.value === 2) { 
                statusValue.innerText = "FOCUSED"; 
                statusValue.style.color = "#2ea043"; 
            } else if (msg.value === 1) { 
                statusValue.innerText = "DISTRACTED"; 
                statusValue.style.color = "#e3b341"; 
            } else { 
                statusValue.innerText = "DROWSY"; 
                statusValue.style.color = "#da3633"; 
            }

            // Update Chart
            updateChart(attentionChart, now, msg.value, false);
        }
        
        // C. YAWN EVENT
        else if (msg.type === "yawn") {
            totalYawns++;
            yawnCountVal.innerText = totalYawns;
            
            // Log to sidebar
            const div = document.createElement("div");
            div.className = "log-item log-alert";
            div.innerText = `[${now}] FATIGUE EVENT`;
            yawnLog.prepend(div);
            
            // Add red dot to chart
            const len = attentionChart.data.datasets[1].data.length;
            if (len > 0) {
                attentionChart.data.datasets[1].data[len - 1] = 0; // Mark yawn at y=0
                attentionChart.update('none');
            }
        }

    } catch (e) { console.error("Parse Error:", e); }
}

// Helper: Efficient Chart Update
function updateChart(chart, label, dataPoint, isBar) {
    // Scroll chart if too long
    if (chart.data.labels.length > MAX_POINTS) {
        chart.data.labels.shift();
        chart.data.datasets[0].data.shift();
        if (!isBar && chart.data.datasets[1]) chart.data.datasets[1].data.shift();
    }
    
    chart.data.labels.push(label);
    chart.data.datasets[0].data.push(dataPoint);
    
    // Placeholder for scatter plot (Yawn)
    if (!isBar && chart.data.datasets[1]) {
        chart.data.datasets[1].data.push(null); 
    }
    
    chart.update('none'); // 'none' for performance
}

// ===========================
// 5. DOWNLOAD BUTTON LOGIC
// ===========================
downloadBtn.onclick = async () => {
    downloadBtn.innerText = "GENERATING...";
    downloadBtn.style.background = "#555";
    downloadBtn.disabled = true;

    try {
        const response = await fetch("http://127.0.0.1:8765/save_report", { method: "POST" });
        
        if (!response.ok) throw new Error("Server Error");
        
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "Cognisense_Report.pdf";
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        
        downloadBtn.innerText = "📥 SAVED!";
        downloadBtn.style.background = "#2ea043";
    } catch (err) {
        console.error(err);
        alert("Error: " + err.message);
        downloadBtn.innerText = "❌ ERROR";
        downloadBtn.style.background = "#da3633";
    }

    // Reset button after 3 seconds
    setTimeout(() => {
        downloadBtn.innerText = "📥 SAVE REPORT";
        downloadBtn.style.background = "#2ea043";
        downloadBtn.disabled = false;
    }, 3000);
};