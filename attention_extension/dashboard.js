console.log("Cognisense X Engine: Loaded");

const ws = new WebSocket("ws://127.0.0.1:8765/");

// UI References
const wsStatus = document.getElementById("wsStatus");
const statusValue = document.getElementById("statusValue");
const yawnCountVal = document.getElementById("yawnCount");
const micStatus = document.getElementById("micStatus");
const yawnLog = document.getElementById("yawnLog");
const downloadBtn = document.getElementById("downloadBtn");

// State Variables
let isSpeaking = false;
let lastAttentionLevel = 2; // Default to Focused
let totalYawns = 0;
const MAX_POINTS = 60; 

// ===========================
// DOWNLOAD REPORT LOGIC
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
        alert("Failed to generate report. Is server.py running?");
        downloadBtn.innerText = "❌ ERROR";
        downloadBtn.style.background = "#da3633";
    }

    // Reset button after 2 seconds
    setTimeout(() => {
        downloadBtn.innerText = "📥 SAVE REPORT";
        downloadBtn.style.background = "#2ea043";
        downloadBtn.disabled = false;
    }, 2000);
};

// ===========================
// Connection Logic
// ===========================
ws.onopen = () => {
  wsStatus.innerText = "SYSTEM ONLINE";
  wsStatus.style.color = "#2ea043"; 
};
ws.onclose = () => {
  wsStatus.innerText = "SYSTEM OFFLINE";
  wsStatus.style.color = "#da3633"; 
};

// ===========================
// Chart 1: Attention (Line)
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
      pointRadius: 0,
      spanGaps: true 
    }, {
      label: 'Yawn',
      data: [],
      type: 'scatter',
      backgroundColor: '#da3633',
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

// ===========================
// Chart 2: Voice (Bar)
// ===========================
const spkCtx = document.getElementById("speakingChart").getContext("2d");
const speakingChart = new Chart(spkCtx, {
  type: 'bar',
  data: {
    labels: [],
    datasets: [{
      label: 'Audio',
      data: [],
      backgroundColor: '#bc8cff',
      borderRadius: 2,
      barPercentage: 0.6
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
// HEARTBEAT ENGINE
// ===========================
setInterval(() => {
    const now = new Date().toLocaleTimeString();

    if (attentionChart.data.labels.length > MAX_POINTS) {
        attentionChart.data.labels.shift();
        attentionChart.data.datasets[0].data.shift(); 
        attentionChart.data.datasets[1].data.shift(); 
        speakingChart.data.labels.shift();
        speakingChart.data.datasets[0].data.shift();
    }

    attentionChart.data.labels.push(now);
    speakingChart.data.labels.push(now);

    attentionChart.data.datasets[0].data.push(lastAttentionLevel);
    attentionChart.data.datasets[1].data.push(null); 

    let audioLevel = isSpeaking ? (Math.random() * 0.5 + 0.5) : 0.05;
    speakingChart.data.datasets[0].data.push(audioLevel);

    attentionChart.update();
    speakingChart.update();

    if (isSpeaking) {
        micStatus.innerText = "DETECTED";
        micStatus.style.color = "#bc8cff";
    } else {
        micStatus.innerText = "SILENT";
        micStatus.style.color = "#8b949e";
    }

}, 500); 

// ===========================
// Data Listener
// ===========================
ws.onmessage = (event) => {
  try {
    const msg = JSON.parse(event.data);

    if (msg.type === "speaking_point") {
        isSpeaking = (msg.value === 1);
    }
    
    else if (msg.type === "attention_point") {
        if (msg.value !== null) {
            lastAttentionLevel = msg.value;
            if (msg.value === 2) { statusValue.innerText = "FOCUSED"; statusValue.style.color = "#2ea043"; }
            else if (msg.value === 1) { statusValue.innerText = "DISTRACTED"; statusValue.style.color = "#e3b341"; }
            else { statusValue.innerText = "DROWSY"; statusValue.style.color = "#da3633"; }
        }
    }
    
    else if (msg.type === "yawn") {
        const len = attentionChart.data.datasets[1].data.length;
        if (len > 0) {
            attentionChart.data.datasets[1].data[len - 1] = 0; 
            attentionChart.update();
        }
        totalYawns++;
        yawnCountVal.innerText = totalYawns;
        
        const div = document.createElement("div");
        div.className = "log-item log-alert";
        div.innerText = `[${new Date().toLocaleTimeString()}] FATIGUE EVENT`;
        yawnLog.prepend(div);
    }

  } catch (e) { console.error(e); }
};