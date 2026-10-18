"""Run a separate end-to-end inference check against real prepared recordings."""

from __future__ import annotations

import argparse
import csv
import io
import json
import math
from pathlib import Path
import struct
import wave

from app import analyze_bytes


def synthetic_wav() -> bytes:
    """Create a deterministic transport/inference sample, not clinical data."""
    sample_rate = 16_000
    frames = bytearray()
    for index in range(sample_rate * 2):
        value = round(math.sin(index / 11) * 9_000)
        frames.extend(struct.pack("<h", value))
    output = io.BytesIO()
    with wave.open(output, "wb") as audio:
        audio.setnchannels(1)
        audio.setsampwidth(2)
        audio.setframerate(sample_rate)
        audio.writeframes(frames)
    return output.getvalue()


def assert_result(result: dict[str, object]) -> None:
    required_keys = {
        "available", "model", "modelVersion", "classifierVersion",
        "embeddingCreated", "coughDetected", "signal",
    }
    if not required_keys.issubset(result):
        raise RuntimeError(f"UNSAFE_OR_INCOMPLETE_RESPONSE_KEYS {sorted(result)}")
    if set(result) - required_keys - {"triage"}:
        raise RuntimeError(f"UNEXPECTED_RESPONSE_KEYS {sorted(result)}")
    if result["model"] != "GOOGLE_HEAR" or result["embeddingCreated"] is not True:
        raise RuntimeError("HEAR_INFERENCE_NOT_CONFIRMED")
    if result["signal"] not in {
        "COUGH_LIKE_SIGNAL_PRESENT", "NO_COUGH_LIKE_SIGNAL_DETECTED", "INCONCLUSIVE"
    }:
        raise RuntimeError("INVALID_SIGNAL")
    triage = result.get("triage")
    if triage is not None:
        if not isinstance(triage, dict) or set(triage) != {"band", "modelVersion", "inputMode"}:
            raise RuntimeError("INVALID_TRIAGE_CONTRACT")


def verify(manifest: Path) -> list[dict[str, object]]:
    if not manifest.is_file():
        result = analyze_bytes(synthetic_wav())
        assert_result(result)
        return [{
            "mode": "synthetic_model_smoke_test",
            "clinicalAccuracyMeasured": False,
            "reason": "Prepared CoughVID manifest is not available on this low-storage workstation.",
            **result,
        }]

    rows = list(csv.DictReader(manifest.open(newline="", encoding="utf-8")))
    samples = [next(row for row in rows if row["label"] == label) for label in ("1", "0")]
    results: list[dict[str, object]] = []
    for row in samples:
        result = analyze_bytes(Path(row["path"]).read_bytes())
        assert_result(result)
        results.append({"weakLabel": int(row["label"]), **result})
    return results


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("manifest", type=Path)
    arguments = parser.parse_args()
    print(json.dumps(verify(arguments.manifest), indent=2))
