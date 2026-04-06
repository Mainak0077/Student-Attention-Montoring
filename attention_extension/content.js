// content.js - FINAL (Manual Start + Pause Fix)
console.log("Cognisense Monitor: Master Loaded");

let stream = null;
let audioTrack = null;
let ws = null;
let videoInterval = null;
let muteCheckInterval = null;
let audioLoopActive = false;
let overlay = null;

// State Flags
let isPaused = false;

// ==========================================
// 1. UI & OVERLAY
// ==========================================
function createOverlay() {
    if (document.getElementById("cog-overlay")) return;
    
    overlay = document.createElement("div");
    overlay.id = "cog-overlay";
    overlay.style.cssText = "position:fixed; left:20px; bottom:20px; background:rgba(15, 23, 42, 0.95); color:#fff; padding:15px; border-radius:12px; z-index:2147483647; font-family: 'Segoe UI', sans-serif; font-size:13px; border:1px solid #334155; box-shadow: 0 10px 25px rgba(0,0,0,0.5); width: 240px; display:flex; flex-direction:column; gap:8px;";

    overlay.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid #334155; padding-bottom:8px;">
            <span style="font-weight:700; color:#00e676;">COGNISENSE </span>
            <button id="cog-mute-btn" style="background:#333; border:1px solid #555; color:white; cursor:pointer; font-size:10px; padding:2px 6px; border-radius:4px;">FORCE MUTE</button>
        </div>
        
        <div style="font-weight:600;">
            STATUS: <span id="cog-status" style="color:#00e676;">ONLINE</span>
        </div>

        <div style="color:#94a3b8; font-size:11px;">
            Mic: <span id="cog-mic" style="color:#fff;">Checking...</span>
        </div>
    `;
    document.body.appendChild(overlay);

    // Manual Override Listener
    document.getElementById("cog-mute-btn").onclick = () => {
        if (audioTrack) {
            audioTrack.enabled = !audioTrack.enabled;
            const status = audioTrack.enabled ? "ACTIVE (Manual)" : "MUTED (Manual)";
            const color = audioTrack.enabled ? "#00e676" : "#ef4444";
            updateMicStatus(status, color);
        }
    };
}

function updateSystemStatus(text, color) {
    if (!overlay) createOverlay();
    const el = document.getElementById('cog-status');
    if (el) { el.innerText = text; el.style.color = color; }
}

function updateMicStatus(text, color = "#fff") {
    if (!overlay) createOverlay();
    const el = document.getElementById('cog-mic');
    const btn = document.getElementById('cog-mute-btn');
    if (el) { el.innerText = text; el.style.color = color; }
    if (btn) { btn.innerText = text.includes("MUTED") ? "UNMUTE" : "FORCE MUTE"; }
}

// ==========================================
// 2. LOGIC: MUTE SYNC (Deep Scan)
// ==========================================
function syncMicWithMeet() {
    if (!audioTrack || isPaused) return; // Don't sync if Paused by user

    const buttons = Array.from(document.querySelectorAll("button"));
    const micBtn = buttons.find(b => {
        const label = (b.getAttribute("aria-label") || "").toLowerCase();
        return label.includes("microphone") || label.includes("mic ");
    });

    if (micBtn) {
        // Helper: Check if element is red
        const isRed = (el) => {
            const bg = window.getComputedStyle(el).backgroundColor; 
            const rgb = bg.match(/\d+/g);
            if (rgb && rgb.length >= 3) {
                return (parseInt(rgb[0]) > 200 && parseInt(rgb[1]) < 100);
            }
            return false;
        };

        // Check button + children
        let meetMuted = isRed(micBtn);
        if (!meetMuted) {
            for (let child of micBtn.getElementsByTagName("*")) {
                if (isRed(child)) { meetMuted = true; break; }
            }
        }

        // Apply State
        if (meetMuted && audioTrack.enabled) {
            audioTrack.enabled = false;
            updateMicStatus("MUTED (Synced)", "#ef4444");
        } else if (!meetMuted && !audioTrack.enabled) {
            audioTrack.enabled = true;
            updateMicStatus("ACTIVE (Synced)", "#00e676");
        }
    }
}

// ==========================================
// 3. CORE FUNCTIONS (Start/Stop/Pause)
// ==========================================
async function startMonitoring() {
    if (stream) {
        // If paused, RESUME
        if (isPaused) {
            isPaused = false;
            updateSystemStatus("ONLINE", "#00e676");
            console.log("Resumed.");
        }
        return;
    }

    createOverlay();
    
    try {
        updateSystemStatus("CONNECTING...", "yellow");
        ws = new WebSocket("ws://127.0.0.1:8765");
        ws.onopen = () => updateSystemStatus("ONLINE", "#00e676");
        ws.onclose = () => updateSystemStatus("DISCONNECTED", "#ef4444");
    } catch (e) { return; }

    try {
        stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        audioTrack = stream.getAudioTracks()[0];
        updateMicStatus("ACTIVE", "#00e676");
    } catch (err) {
        updateSystemStatus("CAM BLOCKED", "#ef4444");
        return;
    }

    const video = document.createElement("video");
    video.autoplay = true; video.muted = true; video.srcObject = stream;
    await video.play();
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");

    audioLoopActive = true;
    isPaused = false;

    // --- LOOPS ---
    videoInterval = setInterval(() => {
        if (isPaused) return; // PAUSE CHECK
        if (!ws || ws.readyState !== WebSocket.OPEN) return;
        
        canvas.width = 320; canvas.height = 240;
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        
        canvas.toBlob(blob => {
            if (blob && ws.readyState === WebSocket.OPEN) {
                const reader = new FileReader();
                reader.onloadend = () => ws.send(JSON.stringify({ type: "frame", data: reader.result.split(",")[1] }));
                reader.readAsDataURL(blob);
            }
        }, "image/jpeg", 0.5);
    }, 500);

    recordAudioSegment();
    muteCheckInterval = setInterval(syncMicWithMeet, 500);
}

function recordAudioSegment() {
    if (!audioLoopActive || !stream || !stream.active) return;

    try {
        const recorder = new MediaRecorder(stream);
        const chunks = [];
        recorder.ondataavailable = e => chunks.push(e.data);
        recorder.onstop = () => {
            if (!audioLoopActive) return;
            
            // Send ONLY if not paused AND track is enabled
            if (!isPaused && audioTrack && audioTrack.enabled) {
                const blob = new Blob(chunks, { type: 'audio/webm' });
                if (ws && ws.readyState === WebSocket.OPEN && blob.size > 0) {
                    const reader = new FileReader();
                    reader.onloadend = () => ws.send(JSON.stringify({ type: "audio", data: reader.result.split(',')[1] }));
                    reader.readAsDataURL(blob);
                }
            }
            if (audioLoopActive) recordAudioSegment();
        };
        recorder.start();
        setTimeout(() => { if (recorder.state === "recording") recorder.stop(); }, 2000);
    } catch (e) { setTimeout(recordAudioSegment, 1000); }
}

function pauseMonitoring() {
    if (stream && !isPaused) {
        isPaused = true;
        updateSystemStatus("PAUSED", "#f59e0b"); // Amber/Yellow
        updateMicStatus("PAUSED", "#f59e0b");
    }
}

function stopMonitoring() {
    isPaused = false;
    audioLoopActive = false;
    if (videoInterval) clearInterval(videoInterval);
    if (muteCheckInterval) clearInterval(muteCheckInterval);

    if (stream) {
        stream.getTracks().forEach(track => track.stop());
        stream = null;
        audioTrack = null;
    }
    if (ws) {
        ws.close();
        ws = null;
    }
    if (overlay) overlay.style.display = "none";
}

// ==========================================
// 4. LISTENER FOR POPUP BUTTONS
// ==========================================
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    console.log("Command Received:", request.action);
    
    if (request.action === "START") {
        startMonitoring();
        sendResponse({status: "started"});
    } 
    else if (request.action === "PAUSE") {
        pauseMonitoring();
        sendResponse({status: "paused"});
    }
    else if (request.action === "STOP") {
        stopMonitoring();
        sendResponse({status: "stopped"});
    }
    return true;
});

// REMOVED: setTimeout(startMonitoring, 2000); 
// This ensures the camera NEVER starts until you click "Start" in the popup.