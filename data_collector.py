import cv2
import mediapipe as mp
import numpy as np
import os
import uuid
import time

# --- Configuration ---
# Directory to save the dataset
DATASET_PATH = "attention_dataset"

# Classes for data collection
# The key is the keyboard press, the value is the folder name
CLASSES = {
    'f': 'focused',
    'b': 'blinking',
    'y': 'yawning',
    'a': 'away'
}

# Preprocessing settings
FACE_CROP_PADDING = 30 # Pixels to add around the detected face bounding box

# --- Setup ---
# Initialize MediaPipe Face Mesh
mp_face_mesh = mp.solutions.face_mesh
face_mesh = mp_face_mesh.FaceMesh(
    max_num_faces=1,
    refine_landmarks=True,
    min_detection_confidence=0.5,
    min_tracking_confidence=0.5
)

# Create dataset directories if they don't exist
for class_name in CLASSES.values():
    class_path = os.path.join(DATASET_PATH, class_name)
    os.makedirs(class_path, exist_ok=True)
    print(f"Created directory: {class_path}")

# Function to get the current count of images in each class folder
def get_class_counts():
    counts = {}
    for key, class_name in CLASSES.items():
        class_path = os.path.join(DATASET_PATH, class_name)
        counts[class_name] = len(os.listdir(class_path))
    return counts

# --- Main Data Collection Loop ---
cap = cv2.VideoCapture(0)
print("\n--- Starting Data Collection ---")
print("Press the key corresponding to the class to save a preprocessed frame.")
print("Press 'ESC' to exit.")

# Cooldown to prevent saving too many images at once
last_save_time = time.time()
SAVE_COOLDOWN = 0.5 # Seconds

while cap.isOpened():
    ret, frame = cap.read()
    if not ret:
        print("Failed to grab frame.")
        break

    h, w, _ = frame.shape
    rgb_frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
    results = face_mesh.process(rgb_frame)

    # Display instructions and class counts for balancing
    class_counts = get_class_counts()
    y_offset = 30
    cv2.putText(frame, "Press key to save frame:", (10, y_offset), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (255, 255, 255), 2)
    for key, name in CLASSES.items():
        y_offset += 25
        text = f"'{key}' -> {name}: {class_counts[name]}"
        cv2.putText(frame, text, (10, y_offset), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 255, 0), 2)


    if results.multi_face_landmarks:
        # Get landmarks for the first face
        mesh_points_normalized = results.multi_face_landmarks[0].landmark
        mesh_points = np.array([[p.x * w, p.y * h] for p in mesh_points_normalized])

        # --- PREPROCESSING STEP: CROP FACE ---
        # Get bounding box coordinates
        x_min, y_min = np.min(mesh_points, axis=0).astype(int)
        x_max, y_max = np.max(mesh_points, axis=0).astype(int)

        # Add padding
        x_min_padded = max(0, x_min - FACE_CROP_PADDING)
        y_min_padded = max(0, y_min - FACE_CROP_PADDING)
        x_max_padded = min(w, x_max + FACE_CROP_PADDING)
        y_max_padded = min(h, y_max + FACE_CROP_PADDING)
        
        # Draw bounding box on the frame for visualization
        cv2.rectangle(frame, (x_min_padded, y_min_padded), (x_max_padded, y_max_padded), (0, 255, 0), 2)
        
        # Crop the face from the original frame
        cropped_face = frame[y_min_padded:y_max_padded, x_min_padded:x_max_padded]

        # --- DATA COLLECTION & LABELING ---
        key = cv2.waitKey(1) & 0xFF

        # Check if the pressed key corresponds to a class and if cooldown has passed
        if chr(key) in CLASSES.keys() and (time.time() - last_save_time > SAVE_COOLDOWN):
            class_name = CLASSES[chr(key)]
            save_path = os.path.join(DATASET_PATH, class_name)
            
            # Generate a unique filename
            filename = f"{class_name}_{uuid.uuid1()}.png"
            full_path = os.path.join(save_path, filename)

            # Save the preprocessed (cropped) face
            if cropped_face.size != 0:
                cv2.imwrite(full_path, cropped_face)
                print(f"Saved: {full_path}")
                last_save_time = time.time()
            else:
                print(f"Skipped saving for class '{class_name}' due to empty crop.")

        # Exit on ESC key
        if key == 27:
            break

    cv2.imshow("Data Collection for Attention Monitor - Mainak", frame)
    # Check for exit key even if no face is detected
    if cv2.waitKey(1) & 0xFF == 27:
        break


cap.release()
cv2.destroyAllWindows()
print("\n--- Data Collection Finished ---")
print("Final counts:")
final_counts = get_class_counts()
for name, count in final_counts.items():
    print(f"- {name}: {count} samples")