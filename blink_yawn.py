import cv2
import mediapipe as mp
import numpy as np
import csv
from datetime import datetime

# Mediapipe face mesh setup
mp_face_mesh = mp.solutions.face_mesh
face_mesh = mp_face_mesh.FaceMesh(
    max_num_faces=1,
    min_detection_confidence=0.5,
    min_tracking_confidence=0.5
)

# Thresholds
BLINK_THRESHOLD = 0.21
YAWN_THRESHOLD = 0.6

# Counters
blink_count = 0
yawn_count = 0

# State variables to avoid multiple counts for one blink/yawn
blink_active = False
yawn_active = False

# OpenCV video capture
cap = cv2.VideoCapture(0)

def euclidean_dist(a, b):
    return np.linalg.norm(a - b)

while True:
    ret, frame = cap.read()
    if not ret:
        break

    rgb_frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
    results = face_mesh.process(rgb_frame)

    if results.multi_face_landmarks:
        for face_landmarks in results.multi_face_landmarks:
            h, w, _ = frame.shape
            landmarks = np.array([(lm.x * w, lm.y * h) for lm in face_landmarks.landmark])

            # EAR calculation (Eye Aspect Ratio)
            left_eye = landmarks[[33, 160, 158, 133, 153, 144]]
            right_eye = landmarks[[362, 385, 387, 263, 373, 380]]
            ear_left = (euclidean_dist(left_eye[1], left_eye[5]) + euclidean_dist(left_eye[2], left_eye[4])) / (2.0 * euclidean_dist(left_eye[0], left_eye[3]))
            ear_right = (euclidean_dist(right_eye[1], right_eye[5]) + euclidean_dist(right_eye[2], right_eye[4])) / (2.0 * euclidean_dist(right_eye[0], right_eye[3]))
            ear = (ear_left + ear_right) / 2.0

            # MAR calculation (Mouth Aspect Ratio)
            mouth = landmarks[[61, 81, 311, 291, 308, 402, 14, 178]]
            mar = (euclidean_dist(mouth[1], mouth[6]) + euclidean_dist(mouth[2], mouth[5]) + euclidean_dist(mouth[3], mouth[4])) / (3.0 * euclidean_dist(mouth[0], mouth[7]))

            # Blink detection (open -> closed -> open)
            if ear < BLINK_THRESHOLD and not blink_active:
                blink_active = True
            elif ear >= BLINK_THRESHOLD and blink_active:
                blink_count += 1
                blink_active = False

            # Yawn detection (small -> wide -> small)
            if mar > YAWN_THRESHOLD and not yawn_active:
                yawn_active = True
            elif mar <= YAWN_THRESHOLD and yawn_active:
                yawn_count += 1
                yawn_active = False

            # Display on screen
            cv2.putText(frame, f"EAR: {ear:.2f}", (30,30), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0,255,0), 2)
            cv2.putText(frame, f"MAR: {mar:.2f}", (30,60), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (255,0,0), 2)
            cv2.putText(frame, f"Blinks: {blink_count}", (30,90), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0,0,255), 2)
            cv2.putText(frame, f"Yawns: {yawn_count}", (30,120), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0,255,255), 2)

    cv2.imshow("Attention Detection", frame)

    # Press 'q' to exit
    if cv2.waitKey(1) & 0xFF == ord('q'):
        break

cap.release()
cv2.destroyAllWindows()

# Save report to CSV
filename = f"attention_report_{datetime.now().strftime('%Y%m%d_%H%M%S')}.csv"
with open(filename, mode='w', newline='') as file:
    writer = csv.writer(file)
    writer.writerow(["Blinks", "Yawns", "Date & Time"])
    writer.writerow([blink_count, yawn_count, datetime.now().strftime("%Y-%m-%d %H:%M:%S")])

print(f"Report saved as {filename}")
