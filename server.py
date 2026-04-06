###########################################################
# FINAL SERVER.PY (Video + Audio + PDF + Speaking Fix)
###########################################################

import asyncio
import base64
import json
import os
import tempfile
import binascii
from datetime import datetime
import numpy as np
import cv2
from aiohttp import web
from pydub import AudioSegment

# -----------------------------------------------
# 1. Load Attention_final.py
# -----------------------------------------------
ATTENTION_MODULE_PATH = "Attention_final.py"

if not os.path.exists(ATTENTION_MODULE_PATH):
    raise FileNotFoundError("Place Attention_final.py inside the backend folder!")

import importlib.util
spec = importlib.util.spec_from_file_location("att_module", ATTENTION_MODULE_PATH)
att_module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(att_module)

monitor = att_module.AttentionMonitor(camera_idx=0, model_path="attention_classifier_model_finetuned")

# -----------------------------------------------
# 2. FORCE FFMPEG
# -----------------------------------------------
ffmpeg_local = os.path.abspath("ffmpeg.exe")
if os.path.exists(ffmpeg_local):
    print(f"[Backend] ✅ FFmpeg found at: {ffmpeg_local}")
    AudioSegment.converter = ffmpeg_local
    AudioSegment.ffmpeg = ffmpeg_local
else:
    print("[Backend] ⚠️ FFmpeg not found. Relying on System PATH.")

###########################################################
# Helper: Safe Base64 Decode
###########################################################
def safe_b64_decode(b64_string):
    """Robustly decodes base64."""
    if not b64_string: return bytes()

    if isinstance(b64_string, bytes):
        b64_string = b64_string.decode("utf-8")

    if "," in b64_string:
        b64_string = b64_string.split(",")[1]

    b64_string = b64_string.strip()
    missing_padding = len(b64_string) % 4
    if missing_padding:
        b64_string += '=' * (4 - missing_padding)

    try:
        return base64.b64decode(b64_string, validate=False)
    except binascii.Error:
        return base64.urlsafe_b64decode(b64_string)

def b64_to_image(b64string):
    try:
        data = safe_b64_decode(b64string)
        arr = np.frombuffer(data, np.uint8)
        return cv2.imdecode(arr, cv2.IMREAD_COLOR)
    except:
        return None

###########################################################
# Speaking detector (HIGH SENSITIVITY FIX)
###########################################################
###########################################################
# Speaking detector (ULTRA SENSITIVE FIX)
###########################################################
def detect_speaking(wav_path, threshold_db=-40.0): # <--- Changed from -50 to -60
    try:
        audio = AudioSegment.from_file(wav_path)
        loudness = audio.dBFS
        
        # Logic: If loudness is greater than -100 (e.g. -97), it counts as speaking
        is_speaking = loudness > threshold_db
        
        status = "YES" if is_speaking else "NO"
        print(f"🎤 Level: {loudness:.2f} dB | Speaking: {status}")
        
        return is_speaking
    except Exception as e:
        print(f"[Audio Error] {e}")
        return False
###########################################################
# WebSocket Handler
###########################################################
clients = set()

async def broadcast(msg):
    text = json.dumps(msg)
    dead = []
    for ws in clients:
        try:
            await ws.send_str(text)
        except:
            dead.append(ws)
    for ws in dead:
        clients.remove(ws)

def process_frame(img):
    if img is None: return 1, "No Image", 0, 0, False
    h, w = img.shape[:2]
    rgb = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)
    results = monitor.face_mesh.process(rgb)

    if not results.multi_face_landmarks: return 1, "No Face", 0, 0, False

    lm = results.multi_face_landmarks[0]
    pts = np.array([[p.x * w, p.y * h] for p in lm.landmark])

    try:
        face_2d = pts[monitor.face_2d_idx].astype(np.float64)
        focal_length = w
        cam_center = (w / 2, h / 2)
        cam_mat = np.array([[focal_length, 0, cam_center[0]], [0, focal_length, cam_center[1]], [0, 0, 1]])
        dist = np.zeros((4, 1))
        _, rvec, _ = cv2.solvePnP(monitor.face_3d_model_points, face_2d, cam_mat, dist)
        rmat, _ = cv2.Rodrigues(rvec)
        angles, *_ = cv2.RQDecomp3x3(rmat)
        pitch, yaw, _ = angles
    except:
        yaw = pitch = 0

    try:
        vert = pts[monitor.MOUTH_VERT]
        horz = pts[monitor.MOUTH_HORZ]
        mar = np.linalg.norm(vert[0]-vert[1]) / (np.linalg.norm(horz[0]-horz[1]) + 1e-6)
    except:
        mar = 0

    yawn = mar > att_module.YAWN_THRESHOLD

    if yawn: return 0, "Yawning", yaw, pitch, True
    if abs(yaw) > att_module.YAW_THRESHOLD: return 1, "Looking Away", yaw, pitch, False
    if pitch > att_module.PITCH_UP_THRESHOLD: return 1, "Looking Up", yaw, pitch, False
    if pitch < att_module.PITCH_DOWN_THRESHOLD: return 2, "Looking Down", yaw, pitch, False
    return 2, "Focused", yaw, pitch, False

async def ws_handler(request):
    ws = web.WebSocketResponse()
    await ws.prepare(request)
    clients.add(ws)
    print("Dashboard connected")

    async for msg in ws:
        if msg.type != web.WSMsgType.TEXT: continue
        data = json.loads(msg.data)
        typ = data.get("type")

        # --- VIDEO FRAME LOGIC ---
        if typ == "frame":
            try:
                img = b64_to_image(data["data"])
                att, status, yaw, pitch, yawn = process_frame(img)
                
                if att == 2: monitor.focused_frames += 1
                elif att == 1: monitor.away_frames += 1
                else: monitor.drowsy_frames += 1
                
                if yawn:
                    monitor.yawn_count += 1
                    monitor.yawn_timestamps.append(datetime.utcnow().timestamp())

                if att != 2:
                    if monitor.away_start_time is None: monitor.away_start_time = datetime.utcnow().timestamp()
                else:
                    if monitor.away_start_time is not None:
                        start = monitor.away_start_time
                        end = datetime.utcnow().timestamp()
                        monitor.distraction_periods.append((
                            datetime.fromtimestamp(start).strftime("%H:%M:%S"),
                            datetime.fromtimestamp(end).strftime("%H:%M:%S"),
                            end - start
                        ))
                        monitor.total_distraction_time += (end - start)
                        monitor.away_start_time = None

                await broadcast({"type": "attention_point", "ts": datetime.utcnow().isoformat(), "value": att, "status": status})
                if yawn: await broadcast({"type": "yawn", "ts": datetime.utcnow().isoformat()})
            except:
                pass 

        # --- AUDIO CHUNK LOGIC ---
        elif typ == "audio":
            try:
                raw = safe_b64_decode(data["data"])
                if not raw: continue

                with tempfile.NamedTemporaryFile(delete=False, suffix=".webm") as f:
                    f.write(raw)
                    wpath = f.name
                
                # Check for Speaking
                is_speaking = detect_speaking(wpath)

                if is_speaking:
                    if hasattr(monitor, 'log_speaking'):
                        monitor.log_speaking(2.0)
                    else:
                        monitor.total_speaking_time = getattr(monitor, 'total_speaking_time', 0) + 2.0
                
                # Cleanup
                if os.path.exists(wpath): os.remove(wpath)

                await broadcast({"type": "speaking_point", "ts": datetime.utcnow().isoformat(), "value": 1 if is_speaking else 0})

            except Exception as e:
                # print(f"Audio Error: {e}") # Silent error handling to avoid spam
                pass

    clients.remove(ws)
    print("Dashboard disconnected")
    return ws

###########################################################
# SAVE REPORT ROUTE (PDF Download Fix)
###########################################################
async def save_report(request):
    print("Generating report...")
    try:
        csv_name, json_name, pdf_name = monitor.save_report()
        if os.path.exists(pdf_name):
            with open(pdf_name, "rb") as f:
                file_content = f.read()
            return web.Response(body=file_content, content_type="application/pdf", headers={"Content-Disposition": f'attachment; filename="{pdf_name}"'})
        else:
            return web.json_response({"status": "error", "error": "PDF creation failed"})
    except Exception as e:
        print(f"Report error: {e}")
        return web.json_response({"status": "error", "error": str(e)}, status=500)

app = web.Application()
app.router.add_get("/", ws_handler)
app.router.add_post("/save_report", save_report)

print("\n------------------------------------------------")
print("✔ Backend server running at: ws://localhost:8765")
print("------------------------------------------------\n")

if __name__ == "__main__":
    web.run_app(app, host="0.0.0.0", port=8765)