from fastapi import FastAPI, File, UploadFile, HTTPException
from fastapi.responses import JSONResponse
from pydantic import BaseModel
import tempfile
import os
import cv2
import numpy as np
import face_recognition
import ffmpeg
import shutil
import json

app = FastAPI(title="NexaPay Liveness Service")


class AnalyzeResponse(BaseModel):
    passed: bool
    stage_failed: str | None = None
    similarity_score: float | None = None
    motion_peaks: int | None = None
    error: str | None = None


def extract_frames(video_path: str, fps: int = 5, max_frames: int = 50) -> list:
    vidcap = cv2.VideoCapture(video_path)
    frames = []
    total_fps = vidcap.get(cv2.CAP_PROP_FPS) or 25
    step = max(1, int(round(total_fps / fps)))
    idx = 0
    success, image = vidcap.read()
    while success and len(frames) < max_frames:
        if idx % step == 0:
            frames.append(cv2.cvtColor(image, cv2.COLOR_BGR2RGB))
        success, image = vidcap.read()
        idx += 1
    vidcap.release()
    return frames


def motion_peaks_count(frames: list) -> int:
    if len(frames) < 2:
        return 0
    prev_gray = cv2.cvtColor(frames[0], cv2.COLOR_RGB2GRAY)
    magnitudes = []
    for f in frames[1:]:
        gray = cv2.cvtColor(f, cv2.COLOR_RGB2GRAY)
        flow = cv2.calcOpticalFlowFarneback(prev_gray, gray, None, 0.5, 3, 15, 3, 5, 1.2, 0)
        mag, _ = cv2.cartToPolar(flow[..., 0], flow[..., 1])
        magnitudes.append(np.mean(mag))
        prev_gray = gray
    mags = np.array(magnitudes)
    threshold = max(5.0, np.mean(mags) + np.std(mags) * 1.0)
    peaks = np.sum(mags > threshold)
    return int(peaks)


def faces_count_per_frame(frames: list) -> list:
    counts = []
    for f in frames:
        try:
            locs = face_recognition.face_locations(f)
            counts.append(len(locs))
        except Exception:
            counts.append(0)
    return counts


def average_similarity(reference_image, frames_sampled) -> float:
    try:
        ref_enc = face_recognition.face_encodings(reference_image)
        if not ref_enc:
            return 0.0
        ref_vec = ref_enc[0]
        sims = []
        for f in frames_sampled:
            encs = face_recognition.face_encodings(f)
            if not encs:
                sims.append(0.0)
            else:
                sims.append(float(np.dot(ref_vec, encs[0]) / (np.linalg.norm(ref_vec) * np.linalg.norm(encs[0]))))
        return float(np.mean(sims)) if sims else 0.0
    except Exception:
        return 0.0


@app.post("/liveness/analyze", response_model=AnalyzeResponse)
async def analyze_liveness(cin_front: UploadFile = File(...), liveness_video: UploadFile = File(...)):
    # Basic validations
    if cin_front.content_type.split('/')[0] not in ("image", "application"):
        raise HTTPException(status_code=400, detail="cin_front must be an image or pdf")
    if liveness_video.content_type.split('/')[0] != "video":
        raise HTTPException(status_code=400, detail="liveness_video must be a video file")

    tmpdir = tempfile.mkdtemp(prefix="nexapay_liveness_")
    try:
        cin_path = os.path.join(tmpdir, "cin_front")
        with open(cin_path, "wb") as f:
            shutil.copyfileobj(cin_front.file, f)

        video_path = os.path.join(tmpdir, "liveness_video")
        with open(video_path, "wb") as f:
            shutil.copyfileobj(liveness_video.file, f)

        frames = extract_frames(video_path, fps=5, max_frames=60)
        if len(frames) < 5:
            return JSONResponse(status_code=422, content={"passed": False, "stage_failed": "MOTION", "error": "VIDEO_TOO_SHORT"})

        motion_peaks = motion_peaks_count(frames)
        if motion_peaks < 3:
            return JSONResponse(status_code=422, content={"passed": False, "stage_failed": "MOTION", "motion_peaks": motion_peaks, "error": "LIVENESS_INSUFFICIENT_MOTION"})

        counts = faces_count_per_frame(frames)
        if any(c != 1 for c in counts[:min(len(counts), 10)]):
            return JSONResponse(status_code=422, content={"passed": False, "stage_failed": "FACE_PRESENCE", "error": "LIVENESS_FACE_NOT_FOUND"})

        # Load reference image
        ref_img = face_recognition.load_image_file(cin_path)

        # sample 5 evenly spaced frames
        indices = np.linspace(0, len(frames) - 1, num=5, dtype=int)
        sampled = [frames[i] for i in indices]
        similarity = average_similarity(ref_img, sampled)

        if similarity < 0.78:
            return JSONResponse(status_code=422, content={"passed": False, "stage_failed": "FACE_MATCH", "similarity_score": similarity, "error": "LIVENESS_FACE_MISMATCH"})

        return {"passed": True, "stage_failed": None, "similarity_score": similarity, "motion_peaks": motion_peaks, "error": None}
    finally:
        try:
            shutil.rmtree(tmpdir)
        except Exception:
            pass


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=5001)
