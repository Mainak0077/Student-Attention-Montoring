import cv2
import numpy as np
import mediapipe as mp
import math
import time
import csv
import os
from datetime import datetime
import platform

# ===============================
# 1. Configuration
# ===============================
YAW_THRESHOLD = 30     # Degrees left/right
PITCH_UP = 20          # Degrees looking up
PITCH_DOWN = -15       # Degrees looking down
ALERT_DELAY = 2        # Seconds before triggering alert

FRAME_SIZE = (640, 480)
FOCAL_LENGTH = FRAME_SIZE[0]
CENTER = (FRAME_SIZE[0] / 2, FRAME_SIZE[1] / 2)
CAMERA_MATRIX = np.array([
    [FOCAL_LENGTH, 0, CENTER[0]],
    [0, FOCAL_LENGTH, CENTER[1]],
    [0, 0, 1]
], dtype="double")
DIST_COEFFS = np.zeros((4, 1))  # No lens distortion

MODEL_POINTS = np.array([
    (0.0, 0.0, 0.0),          # Nose tip
    (0.0, -330.0, -65.0),     # Chin
    (-225.0, 170.0, -135.0),  # Left eye left corner
    (225.0, 170.0, -135.0),   # Right eye right corner
    (-150.0, -150.0, -125.0), # Left mouth corner
    (150.0, -150.0, -125.0)   # Right mouth corner
], dtype=np.float32)

# ===============================
# 2. Helper Functions
# ===============================
def rotation_vector_to_euler_angles(rvec):
    """Convert rotation vector to yaw, pitch, roll."""
    rmat, _ = cv2.Rodrigues(rvec)
    sy = math.sqrt(rmat[0, 0] ** 2 + rmat[1, 0] ** 2)

    if sy < 1e-6:  # Gimbal lock
        x = math.atan2(-rmat[1, 2], rmat[1, 1])
        y = math.atan2(-rmat[2, 0], sy)
        z = 0
    else:
        x = math.atan2(rmat[2, 1], rmat[2, 2])  # Pitch
        y = math.atan2(-rmat[2, 0], sy)         # Yaw
        z = math.atan2(rmat[1, 0], rmat[0, 0])  # Roll

    return np.degrees([y, x, z])  # Yaw, Pitch, Roll

def trigger_alert():
    """Play built-in alert beep."""
    if platform.system() == "Windows":
        import winsound
        winsound.Beep(1000, 500)  # 1kHz for 0.5 sec
    else:
        print("\a", end="", flush=True)  # Terminal bell

def log_distraction(logs, start_time):
    """Log distraction with timestamp."""
    elapsed = time.time() - start_time
    logs.append([
        datetime.now().strftime("%Y-%m-%d %H:%M:%S"),  # Full date+time
        round(elapsed, 2)
    ])

# ===============================
# 3. Initialize Face Mesh
# ===============================
mp_face_mesh = mp.solutions.face_mesh
face_mesh = mp_face_mesh.FaceMesh(
    static_image_mode=False,
    max_num_faces=1,
    refine_landmarks=True,
    min_detection_confidence=0.5,
    min_tracking_confidence=0.5
)

# ===============================
# 4. Main Loop
# ===============================
cap = cv2.VideoCapture(0, cv2.CAP_DSHOW)
away_start_time = None
distraction_logs = []

while cap.isOpened():
    ret, frame = cap.read()
    if not ret:
        print("❌ Camera not detected.")
        break

    h, w, _ = frame.shape
    frame_rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
    results = face_mesh.process(frame_rgb)

    if results.multi_face_landmarks:
        for face_landmarks in results.multi_face_landmarks:
            landmarks = face_landmarks.landmark

            image_points = np.array([
                (landmarks[1].x * w, landmarks[1].y * h),     # Nose tip
                (landmarks[152].x * w, landmarks[152].y * h), # Chin
                (landmarks[263].x * w, landmarks[263].y * h), # Left eye right corner
                (landmarks[33].x * w, landmarks[33].y * h),   # Right eye left corner
                (landmarks[287].x * w, landmarks[287].y * h), # Left mouth corner
                (landmarks[57].x * w, landmarks[57].y * h)    # Right mouth corner
            ], dtype="double")

            success, rvec, tvec = cv2.solvePnP(MODEL_POINTS, image_points, CAMERA_MATRIX, DIST_COEFFS)
            yaw, pitch, roll = rotation_vector_to_euler_angles(rvec)

            looking_away = abs(yaw) > YAW_THRESHOLD or pitch > PITCH_UP or pitch < PITCH_DOWN

            if looking_away:
                if away_start_time is None:
                    away_start_time = time.time()
                elif time.time() - away_start_time > ALERT_DELAY:
                    trigger_alert()
                    log_distraction(distraction_logs, away_start_time)
                    away_start_time = None
                cv2.putText(frame, "WARNING: Stay Focused!", (100, 100),
                            cv2.FONT_HERSHEY_SIMPLEX, 1.2, (0, 0, 255), 3)
            else:
                away_start_time = None

            # Draw pose axes
            axis = np.float32([[500, 0, 0], [0, 500, 0], [0, 0, 500]])
            imgpts, _ = cv2.projectPoints(axis, rvec, tvec, CAMERA_MATRIX, DIST_COEFFS)
            nose_tip = tuple(np.int32(image_points[0]))
            cv2.line(frame, nose_tip, tuple(np.int32(imgpts[0].ravel())), (0, 0, 255), 3)
            cv2.line(frame, nose_tip, tuple(np.int32(imgpts[1].ravel())), (0, 255, 0), 3)
            cv2.line(frame, nose_tip, tuple(np.int32(imgpts[2].ravel())), (255, 0, 0), 3)

            cv2.putText(frame, f"Yaw: {yaw:.2f}", (30, 30),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 255, 255), 2)
            cv2.putText(frame, f"Pitch: {pitch:.2f}", (30, 60),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 255, 255), 2)
            cv2.putText(frame, f"Roll: {roll:.2f}", (30, 90),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 255, 255), 2)

    cv2.imshow("Attention Monitor", frame)

    if cv2.waitKey(1) & 0xFF == 27:  # Esc key
        break

cap.release()
cv2.destroyAllWindows()

# ===============================
# 5. Save Logs (One CSV per Day)
# ===============================
log_folder = os.path.join(os.getcwd(), "logs")
os.makedirs(log_folder, exist_ok=True)

# File for today's date
date_str = datetime.now().strftime("%Y-%m-%d")
csv_filename = f"distraction_log_{date_str}.csv"
csv_path = os.path.join(log_folder, csv_filename)

# If file doesn't exist, create with header
file_exists = os.path.isfile(csv_path)
with open(csv_path, "a", newline="") as file:
    writer = csv.writer(file)
    if not file_exists:
        writer.writerow(["Timestamp", "Duration (s)"])
    if distraction_logs:
        writer.writerows(distraction_logs)

print(f"\n Distraction log updated: '{csv_filename}' in {log_folder}")
print(f" New Distractions This Run: {len(distraction_logs)}")
total_time = sum(d[1] for d in distraction_logs)
print(f" Total Time Distracted This Run: {total_time:.2f} seconds")
input("\nPress Enter to exit...")


