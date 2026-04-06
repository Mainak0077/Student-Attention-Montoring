Attention Monitor Chrome Extension
==================================

This extension works together with a Python backend server.

HOW IT WORKS:
-------------
1. The extension captures webcam frames + microphone audio.
2. It sends the data to the Python backend using WebSockets.
3. The backend performs:
   - Face attention detection
   - Head pose estimation
   - Yawn detection
   - Speaking detection
   - Generates PDF/CSV/JSON reports
4. The Dashboard (dashboard.html) displays live charts:
   - Attention timeline
   - Speaking timeline
   - Yawn events

REQUIRED BACKEND:
-----------------
Run the backend server on your computer:

    python server.py

The server listens on:
    WebSocket: ws://localhost:8765
    Save report endpoint: http://localhost:8765/save_report

LOADING THE EXTENSION:
----------------------
1. Go to Chrome:  chrome://extensions
2. Enable Developer Mode
3. Click "Load unpacked"
4. Select this folder: attention-extension/

Then open Dashboard from the popup.

Created for the Attention Tracking Project.
