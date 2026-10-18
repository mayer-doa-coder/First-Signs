"""Transient Google HeAR inference service for experimental cough-event signals."""

from __future__ import annotations

import io
import json
import math
import os
import secrets
from pathlib import Path
from typing import Any

import av
import numpy as np
import tensorflow as tf
from av.audio.resampler import AudioResampler
from fastapi import FastAPI, File, Form, Header, HTTPException, UploadFile

SAMPLE_RATE = 16_000
CLIP_SAMPLES = 32_000
CLIP_STEP = 28_800  # Google's example uses 10% overlap.
MAX_AUDIO_BYTES = 16 * 1024 * 1024
MAX_AUDIO_SECONDS = 60
OFFICIAL_COUGH_THRESHOLD = 0.9
LABELS = ("Cough", "Snore", "Baby Cough", "Breathe", "Sneeze", "Throat Clear", "Laugh", "Speech")

ROOT = Path(__file__).resolve().parent
MODEL_ROOT = Path(os.environ.get("HEAR_MODEL_PATH", ROOT.parent / ".artifacts" / "hear-model"))
CLASSIFIER_PATH = Path(os.environ.get("HEAR_CLASSIFIER_PATH", ROOT / "model" / "cough_classifier.json"))
TRIAGE_CLASSIFIER_PATH = Path(os.environ.get("HEAR_TRIAGE_CLASSIFIER_PATH", ROOT / "model" / "tb_triage_classifier.json"))
SERVICE_TOKEN = os.environ.get("HEAR_SERVICE_TOKEN", "")

app = FastAPI(title="First Signs HeAR service", docs_url=None, redoc_url=None)
_models: dict[str, Any] = {}


def _authorized(authorization: str | None) -> None:
    expected = f"Bearer {SERVICE_TOKEN}"
    if not SERVICE_TOKEN or authorization is None or not secrets.compare_digest(authorization, expected):
        raise HTTPException(status_code=401, detail="UNAUTHORIZED")


def _load_models() -> dict[str, Any]:
    if _models:
        return _models
    if not (MODEL_ROOT / "saved_model.pb").is_file():
        raise RuntimeError("HEAR_MODEL_NOT_FOUND")
    if not CLASSIFIER_PATH.is_file():
        raise RuntimeError("HEAR_CLASSIFIER_NOT_FOUND")

    classifier = json.loads(CLASSIFIER_PATH.read_text(encoding="utf-8"))
    weights = np.asarray(classifier.get("weights"), dtype=np.float32)
    mean = np.asarray(classifier.get("mean"), dtype=np.float32)
    scale = np.asarray(classifier.get("scale"), dtype=np.float32)
    threshold = classifier.get("threshold")
    if (
        classifier.get("task") != "cough_presence_only"
        or not isinstance(classifier.get("version"), str)
        or not isinstance(threshold, (int, float))
        or not 0.0 < float(threshold) < 1.0
        or weights.shape != (512,)
        or mean.shape != (512,)
        or scale.shape != (512,)
        or not np.all(np.isfinite(weights))
        or not np.all(np.isfinite(mean))
        or not np.all(np.isfinite(scale))
    ):
        raise RuntimeError("INVALID_HEAR_CLASSIFIER")

    triage = _load_optional_triage_classifier()
    hear = tf.saved_model.load(str(MODEL_ROOT)).signatures["serving_default"]
    detector_path = MODEL_ROOT / "event_detector" / "event_detector_small"
    detector = tf.saved_model.load(str(detector_path)).signatures["serving_default"]
    _models.update(hear=hear, detector=detector, classifier=classifier,
                   weights=weights, mean=mean, scale=np.maximum(scale, 1e-6))
    if triage is not None:
        _models["triage"] = triage
    return _models


def _load_optional_triage_classifier() -> dict[str, Any] | None:
    """Return a structurally-valid research artifact, never a partial model."""
    if not TRIAGE_CLASSIFIER_PATH.is_file():
        return None
    try:
        artifact = json.loads(TRIAGE_CLASSIFIER_PATH.read_text(encoding="utf-8"))
        names = artifact.get("clinicalFeatureNames")
        weights = np.asarray(artifact.get("weights"), dtype=np.float32)
        mean = np.asarray(artifact.get("mean"), dtype=np.float32)
        scale = np.asarray(artifact.get("scale"), dtype=np.float32)
        calibration = artifact.get("calibration")
        threshold = artifact.get("elevatedThreshold")
        if (
            artifact.get("task") != "tb_triage_research_only"
            or not isinstance(artifact.get("version"), str)
            or names != ["coughDays", "fever", "nightSweats", "weightLoss", "bloodInSputum"]
            or weights.shape != (517,) or mean.shape != (517,) or scale.shape != (517,)
            or not isinstance(calibration, dict)
            or not isinstance(calibration.get("slope"), (int, float))
            or not isinstance(calibration.get("intercept"), (int, float))
            or not isinstance(threshold, (int, float)) or not 0.0 < float(threshold) < 1.0
            or not all(np.all(np.isfinite(value)) for value in (weights, mean, scale))
        ):
            return None
        artifact["_weights"] = weights
        artifact["_mean"] = mean
        artifact["_scale"] = np.maximum(scale, 1e-6)
        return artifact
    except (OSError, ValueError, TypeError):
        return None


def _triage_features(embedding: np.ndarray, values: dict[str, Any] | None) -> np.ndarray | None:
    if not isinstance(values, dict):
        return None
    cough_days = values.get("coughDays")
    flags = [values.get(name) for name in ("fever", "nightSweats", "weightLoss", "bloodInSputum")]
    if isinstance(cough_days, bool) or not isinstance(cough_days, (int, float)) or not 0 <= cough_days <= 3650:
        return None
    if not all(isinstance(value, bool) for value in flags):
        return None
    clinical = np.asarray([float(cough_days), *[float(value) for value in flags]], dtype=np.float32)
    return np.concatenate((embedding, clinical))


def _research_triage(embedding: np.ndarray, values: dict[str, Any] | None, cough_detected: bool, models: dict[str, Any]) -> dict[str, str] | None:
    artifact = models.get("triage")
    features = _triage_features(embedding, values)
    if artifact is None or features is None:
        return None
    if not cough_detected:
        return {"band": "INCONCLUSIVE", "modelVersion": str(artifact["version"]), "inputMode": "AUDIO_PLUS_SCREENING_ANSWERS"}
    normalized = (features - artifact["_mean"]) / artifact["_scale"]
    raw = float(np.dot(normalized, artifact["_weights"]) + artifact["bias"])
    calibrated = 1.0 / (1.0 + math.exp(-max(-40.0, min(40.0, artifact["calibration"]["slope"] * raw + artifact["calibration"]["intercept"]))))
    return {
        "band": "ELEVATED_ACOUSTIC_CONCERN" if calibrated >= float(artifact["elevatedThreshold"]) else "LOWER_ACOUSTIC_CONCERN",
        "modelVersion": str(artifact["version"]),
        "inputMode": "AUDIO_PLUS_SCREENING_ANSWERS",
    }


def _decode_audio(data: bytes) -> np.ndarray:
    try:
        with av.open(io.BytesIO(data), mode="r") as container:
            stream = next((item for item in container.streams if item.type == "audio"), None)
            if stream is None:
                raise ValueError("NO_AUDIO_STREAM")
            resampler = AudioResampler(format="fltp", layout="mono", rate=SAMPLE_RATE)
            chunks: list[np.ndarray] = []
            for frame in container.decode(stream):
                converted = resampler.resample(frame)
                for audio_frame in converted if isinstance(converted, list) else [converted]:
                    if audio_frame is not None:
                        chunks.append(audio_frame.to_ndarray().reshape(-1).astype(np.float32))
            flushed = resampler.resample(None)
            for audio_frame in flushed if isinstance(flushed, list) else [flushed]:
                if audio_frame is not None:
                    chunks.append(audio_frame.to_ndarray().reshape(-1).astype(np.float32))
    except Exception as error:
        raise ValueError("UNDECODABLE_AUDIO") from error
    if not chunks:
        raise ValueError("EMPTY_AUDIO")
    audio = np.concatenate(chunks)
    if audio.size > SAMPLE_RATE * MAX_AUDIO_SECONDS:
        audio = audio[: SAMPLE_RATE * MAX_AUDIO_SECONDS]
    peak = float(np.max(np.abs(audio)))
    rms = float(np.sqrt(np.mean(np.square(audio))))
    if peak < 0.01 or rms < 0.001:
        raise ValueError("AUDIO_TOO_QUIET")
    return audio


def _clips(audio: np.ndarray) -> list[np.ndarray]:
    if audio.size < CLIP_SAMPLES:
        audio = np.pad(audio, (0, CLIP_SAMPLES - audio.size))
    starts = list(range(0, max(1, audio.size - CLIP_SAMPLES + 1), CLIP_STEP))
    final_start = max(0, audio.size - CLIP_SAMPLES)
    if not starts or starts[-1] != final_start:
        starts.append(final_start)
    return [audio[start : start + CLIP_SAMPLES].astype(np.float32) for start in starts]


def _probability(embedding: np.ndarray, models: dict[str, Any]) -> float:
    normalized = (embedding - models["mean"]) / models["scale"]
    logit = float(np.dot(normalized, models["weights"]) + models["classifier"]["bias"])
    return 1.0 / (1.0 + math.exp(-max(-40.0, min(40.0, logit))))


def analyze_bytes(data: bytes, triage_inputs: dict[str, Any] | None = None) -> dict[str, Any]:
    models = _load_models()
    clips = _clips(_decode_audio(data))
    detector_scores: list[float] = []
    for clip in clips:
        output = models["detector"](audio_wav=tf.constant(clip.reshape(1, -1)))
        scores = next(iter(output.values())).numpy()[0]
        detector_scores.append(float(scores[LABELS.index("Cough")]))

    best_index = int(np.argmax(detector_scores))
    best_clip = clips[best_index].reshape(1, -1)
    embedding_output = models["hear"](x=tf.constant(best_clip))
    embedding = next(iter(embedding_output.values())).numpy()[0].astype(np.float32)
    if embedding.shape != (512,) or not np.all(np.isfinite(embedding)):
        raise RuntimeError("INVALID_HEAR_EMBEDDING")

    detector_detected = detector_scores[best_index] >= OFFICIAL_COUGH_THRESHOLD
    classifier_score = _probability(embedding, models)
    classifier_detected = classifier_score >= float(models["classifier"]["threshold"])
    signal = (
        "COUGH_LIKE_SIGNAL_PRESENT" if detector_detected and classifier_detected
        else "NO_COUGH_LIKE_SIGNAL_DETECTED" if not detector_detected and not classifier_detected
        else "INCONCLUSIVE"
    )
    result: dict[str, Any] = {
        "available": True,
        "model": "GOOGLE_HEAR",
        "modelVersion": "1.0.0",
        "classifierVersion": str(models["classifier"]["version"]),
        "embeddingCreated": True,
        "coughDetected": detector_detected,
        "signal": signal,
    }
    triage = _research_triage(embedding, triage_inputs, detector_detected, models)
    if triage is not None:
        result["triage"] = triage
    return result


@app.get("/health")
def health() -> dict[str, str]:
    try:
        _load_models()
        return {"status": "ready"}
    except Exception:
        raise HTTPException(status_code=503, detail="MODEL_NOT_READY")


@app.post("/analyze")
async def analyze(
    audio: UploadFile = File(...),
    triage_inputs: str | None = Form(default=None),
    authorization: str | None = Header(default=None),
) -> dict[str, Any]:
    _authorized(authorization)
    data = await audio.read(MAX_AUDIO_BYTES + 1)
    if len(data) < 1_024 or len(data) > MAX_AUDIO_BYTES:
        raise HTTPException(status_code=400, detail="INVALID_AUDIO_SIZE")
    try:
        parsed_inputs = json.loads(triage_inputs) if triage_inputs else None
        return analyze_bytes(data, parsed_inputs)
    except (ValueError, RuntimeError):
        raise HTTPException(status_code=422, detail="AUDIO_PROCESSING_FAILED")
