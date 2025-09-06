import cv2
import mediapipe as mp
import numpy as np

# Initialize MediaPipe Face Mesh
mp_face_mesh = mp.solutions.face_mesh
face_mesh = mp_face_mesh.FaceMesh(refine_landmarks=True, max_num_faces=1)

# Landmark indices for iris
LEFT_IRIS = [474, 475, 476, 477]
RIGHT_IRIS = [469, 470, 471, 472]

# Landmark indices for eye corners & eyelids
LEFT_EYE = [33, 133, 159, 145]   # outer, inner, upper lid, lower lid
RIGHT_EYE = [362, 263, 386, 374] # outer, inner, upper lid, lower lid

def get_eye_center(landmarks, w, h):
    """Return center of given eye landmarks."""
    pts = np.array([[p.x * w, p.y * h] for p in landmarks])
    return np.mean(pts, axis=0).astype(int)

def detect_gaze_direction(left_iris, right_iris, left_eye, right_eye, w, h):
    """Return gaze direction & deviation values."""
    # Horizontal deviation
    avg_x = (left_iris[0] + right_iris[0]) / 2
    deviation_x = avg_x - w/2

    # Vertical deviation (relative to eyelids)
    avg_y = (left_iris[1] + right_iris[1]) / 2
    eye_top = (left_eye[2][1] + right_eye[2][1]) / 2
    eye_bottom = (left_eye[3][1] + right_eye[3][1]) / 2
    vertical_center = (eye_top + eye_bottom) / 2
    deviation_y = avg_y - vertical_center

    # Classify
    if deviation_x < -40:
        horiz = "Left"
    elif deviation_x > 40:
        horiz = "Right"
    else:
        horiz = "Center"

    if deviation_y < -10:
        vert = "Up"
    elif deviation_y > 10:
        vert = "Down"
    else:
        vert = "Center"

    # Combine
    if horiz == "Center" and vert == "Center":
        direction = "Center"
    elif vert == "Center":
        direction = horiz
    elif horiz == "Center":
        direction = vert
    else:
        direction = f"{vert}-{horiz}"

    return direction, deviation_x, deviation_y

cap = cv2.VideoCapture(0)

while cap.isOpened():
    ret, frame = cap.read()
    if not ret:
        break

    h, w, _ = frame.shape
    rgb_frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
    results = face_mesh.process(rgb_frame)

    if results.multi_face_landmarks:
        mesh = results.multi_face_landmarks[0].landmark

        # Iris centers
        left_iris_center = get_eye_center([mesh[i] for i in LEFT_IRIS], w, h)
        right_iris_center = get_eye_center([mesh[i] for i in RIGHT_IRIS], w, h)

        # Eye reference points
        left_eye_pts = [tuple(np.multiply([mesh[i].x, mesh[i].y], [w, h]).astype(int)) for i in LEFT_EYE]
        right_eye_pts = [tuple(np.multiply([mesh[i].x, mesh[i].y], [w, h]).astype(int)) for i in RIGHT_EYE]

        # Detect gaze
        gaze_dir, dev_x, dev_y = detect_gaze_direction(
            left_iris_center, right_iris_center, left_eye_pts, right_eye_pts, w, h
        )

        # Draw pupils
        cv2.circle(frame, tuple(left_iris_center), 3, (0, 255, 0), -1)
        cv2.circle(frame, tuple(right_iris_center), 3, (0, 255, 0), -1)

        # Draw text
        cv2.putText(frame, f"Gaze: {gaze_dir}", (30, 50),
                    cv2.FONT_HERSHEY_SIMPLEX, 1, (0, 255, 255), 2)
        cv2.putText(frame, f"DevX: {int(dev_x)} | DevY: {int(dev_y)}", (30, 90),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.8, (255, 255, 0), 2)

    cv2.imshow("Extended Gaze Tracking", frame)
    if cv2.waitKey(1) & 0xFF == 27:  # ESC to quit
        break

cap.release()
cv2.destroyAllWindows()
