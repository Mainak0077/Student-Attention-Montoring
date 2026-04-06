// content.js - FINAL VERSION (With Server-Side Pause Tracking)
console.log("Cognisense Monitor: Master Loaded");

// --- Global Variables ---
let stream = null;
let audioTrack = null;
let ws = null;
let videoInterval = null;
let muteCheckInterval = null;
let audioLoopActive = false;
let overlay = null;
let isPaused = false;
let isManuallyMuted = false;

// ==========================================
// 1. UI & OVERLAY HELPERS
// ==========================================
function createOverlay() {
    if (document.getElementById("cog-overlay")) {
        overlay = document.getElementById("cog-overlay");
        overlay.style.display = "flex";
        
        const btn = document.getElementById('cog-mute-btn');
        if (btn) {
             btn.innerText = isManuallyMuted ? "UNMUTE" : "FORCE MUTE";
             btn.style.borderColor = isManuallyMuted ? "#ef4444" : "#555";
             btn.style.color = isManuallyMuted ? "#ef4444" : "white";
        }
        return;
    }
    
    overlay = document.createElement("div");
    overlay.id = "cog-overlay";
    overlay.style.cssText = "position:fixed; left:20px; bottom:80px; background:rgba(15, 23, 42, 0.95); color:#fff; padding:15px; border-radius:12px; z-index:2147483647 !important; font-family: 'Segoe UI', sans-serif; font-size:13px; border:1px solid #334155; box-shadow: 0 10px 25px rgba(0,0,0,0.5); width: 240px; display:flex; flex-direction:column; gap:8px;";

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

    document.getElementById("cog-mute-btn").onclick = () => {
        if (!audioTrack) return;
        isManuallyMuted = !isManuallyMuted;

        if (isManuallyMuted) {
            audioTrack.enabled = false;
            updateMicStatus("MUTED (Manual)", "#ef4444");
        } else {
            updateMicStatus("Checking...", "#fff");
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
    
    if (btn) {
        if (isManuallyMuted) {
            btn.innerText = "UNMUTE";
            btn.style.borderColor = "#ef4444";
            btn.style.color = "#ef4444";
        } else {
            btn.innerText = "FORCE MUTE";
            btn.style.borderColor = "#555";
            btn.style.color = "white";
        }
    }
}

// ==========================================
// 2. ROBUST SYNC LOGIC
// ==========================================
function syncMicWithMeet() {
    if (!audioTrack || isPaused) return; 

    // --- 1. FIND THE BUTTON ---
    const buttons = Array.from(document.querySelectorAll("button"));
    const micBtn = buttons.find(b => {
        const label = (b.getAttribute("aria-label") || "").toLowerCase();
        // Check standard labels or data attributes
        return label.includes("microphone") || label.includes("mic ") || b.getAttribute("data-is-muted") !== null;
    });

    // FAIL-SAFE: If button not found, do NOT assume Mic is ON. 
    // Just respect manual mute and exit.
    if (!micBtn) {
        if (isManuallyMuted && audioTrack.enabled) {
            audioTrack.enabled = false;
            updateMicStatus("MUTED (Manual)", "#ef4444");
        }
        return; 
    }

    // --- 2. DETECT STATUS (Hybrid Check) ---
    let meetMuted = false;

    // CHECK A: Is it Red? (Background or Icon Fill)
    const isRed = (el) => {
        const style = window.getComputedStyle(el);
        const bg = style.backgroundColor; 
        const fill = style.fill; // For SVGs
        const checkColor = (c) => {
            const rgb = c.match(/\d+/g);
            // Red > 180 (Relaxed threshold), Green < 100
            return (rgb && rgb.length >= 3 && parseInt(rgb[0]) > 180 && parseInt(rgb[1]) < 100);
        };
        return checkColor(bg) || checkColor(fill);
    };

    if (isRed(micBtn)) meetMuted = true;
    if (!meetMuted) {
        // Check children (icon paths often hold the color)
        for (let child of micBtn.getElementsByTagName("*")) { if (isRed(child)) { meetMuted = true; break; } }
    }

    // CHECK B: Text Label Fallback ("Turn on microphone" means it is currently OFF/Muted)
    if (!meetMuted) {
        const label = (micBtn.getAttribute("aria-label") || "").toLowerCase();
        // If label says "turn on", the mic is currently OFF (Muted)
        if (label.includes("turn on")) meetMuted = true; 
        
        // Also check explicit data attribute if present
        if (micBtn.getAttribute("data-is-muted") === "true") meetMuted = true;
    }

    // --- 3. APPLY LOGIC ---
    if (!meetMuted) {
        // === CASE A: Meet Mic is ON ===
        // Force Enable (Auto-Release)
        isManuallyMuted = false; 
        
        if (!audioTrack.enabled) {
            audioTrack.enabled = true;
            updateMicStatus("ACTIVE (Synced)", "#00e676");
        } 
        else if (document.getElementById('cog-mic')?.innerText.includes("Manual")) {
             updateMicStatus("ACTIVE (Synced)", "#00e676");
        }

    } else {
        // === CASE B: Meet Mic is OFF ===
        // Respect Force Mute
        if (isManuallyMuted) {
            if (audioTrack.enabled) audioTrack.enabled = false;
            // Prevent flickering text
            if (!document.getElementById('cog-mic')?.innerText.includes("Manual")) {
                updateMicStatus("MUTED (Manual)", "#ef4444");
            }
        } else {
            // Standard Sync
            if (audioTrack.enabled) {
                audioTrack.enabled = false;
                updateMicStatus("MUTED (Synced)", "#ef4444");
            }
        }
    }
}

// ==========================================
// 3. CORE FUNCTIONS (Standard)
// ==========================================
async function startMonitoring() {
    if (stream) {
        if (isPaused) togglePause();
        else updateSystemStatus("ONLINE", "#00e676");
        return;
    }

    createOverlay();
    isPaused = false;
    isManuallyMuted = false; 
    
    try {
        updateSystemStatus("CONNECTING...", "yellow");
        ws = new WebSocket("ws://127.0.0.1:8765");
        ws.onopen = () => updateSystemStatus("ONLINE", "#00e676");
        ws.onclose = () => { if (stream) updateSystemStatus("DISCONNECTED", "#ef4444"); };
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

    // Video Loop
    videoInterval = setInterval(() => {
        if (!ws || ws.readyState !== WebSocket.OPEN) {
            if (stream) stopMonitoring(); 
            return;
        }
        if (isPaused) return; 
        
        canvas.width = 320; canvas.height = 240;
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        
        canvas.toBlob(blob => {
            if (blob && ws && ws.readyState === WebSocket.OPEN) {
                const reader = new FileReader();
                reader.onloadend = () => {
                    if (ws && ws.readyState === WebSocket.OPEN && !isPaused) {
                        ws.send(JSON.stringify({ type: "frame", data: reader.result.split(",")[1] }));
                        updateSystemStatus("ONLINE", "#00e676"); 
                    }
                };
                reader.readAsDataURL(blob);
            }
        }, "image/jpeg", 0.5);
    }, 500);

    // Audio Loop
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
            // Gatekeeper
            if (ws && ws.readyState === WebSocket.OPEN && !isPaused && audioTrack && audioTrack.enabled) {
                const blob = new Blob(chunks, { type: 'audio/webm' });
                if (blob.size > 0) {
                    const reader = new FileReader();
                    reader.onloadend = () => {
                        if (ws && ws.readyState === WebSocket.OPEN) {
                            ws.send(JSON.stringify({ type: "audio", data: reader.result.split(',')[1] }));
                        }
                    };
                    reader.readAsDataURL(blob);
                }
            }
            if (audioLoopActive) recordAudioSegment();
        };
        recorder.start();
        setTimeout(() => { if (recorder.state === "recording") recorder.stop(); }, 2000);
    } catch (e) { if (audioLoopActive) setTimeout(recordAudioSegment, 1000); }
}

// --- UPDATED PAUSE TOGGLE LOGIC (WITH SERVER MSG) ---
function togglePause() {
    // Safety: If monitoring not started, return "stopped"
    if (!stream) return "stopped";

    if (!isPaused) {
        // ACTION: PAUSE
        isPaused = true;

        // SEND PAUSE SIGNAL TO SERVER
        if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: "status", status: "paused" }));
        }

        updateSystemStatus("PAUSED", "#f59e0b");
        updateMicStatus("PAUSED", "#f59e0b");
        return "paused";
    } else {
        // ACTION: RESUME
        isPaused = false;

        // SEND RESUME SIGNAL TO SERVER
        if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: "status", status: "resumed" }));
        }

        updateSystemStatus("ONLINE", "#00e676");
        
        // Restore Status Logic
        if (isManuallyMuted) updateMicStatus("MUTED (Manual)", "#ef4444");
        else updateMicStatus("Checking...", "#fff");
        
        return "resumed";
    }
}

function stopMonitoring() {
    console.log("🛑 Stopping...");
    isPaused = false;
    isManuallyMuted = false;
    audioLoopActive = false;
    if (videoInterval) { clearInterval(videoInterval); videoInterval = null; }
    if (muteCheckInterval) { clearInterval(muteCheckInterval); muteCheckInterval = null; }
    if (stream) {
        stream.getTracks().forEach(track => { track.stop(); track.enabled = false; });
        stream = null; audioTrack = null;
    }
    if (ws) { ws.onclose = null; ws.close(); ws = null; }
    if (overlay) overlay.style.display = "none";
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "START") { startMonitoring(); sendResponse({status: "started"}); } 
    else if (request.action === "PAUSE") { const s = togglePause(); sendResponse({status: s}); }
    else if (request.action === "STOP") { stopMonitoring(); sendResponse({status: "stopped"}); }
    else if (request.action === "GET_STATUS") { sendResponse({ isPaused: isPaused, isRunning: !!stream }); }
    return true;
});