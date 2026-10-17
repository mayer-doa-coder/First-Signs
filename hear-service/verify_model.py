"""Run a separate end-to-end inference check against real prepared recordings."""

from __future__ import annotations

import argparse
import csv
import json
from pathlib import Path

from app import analyze_bytes


def verify(manifest: Path) -> list[dict[str, object]]:
    rows = list(csv.DictReader(manifest.open(newline="", encoding="utf-8")))
    samples = [next(row for row in rows if row["label"] == label) for label in ("1", "0")]
    results: list[dict[str, object]] = []
    expected_keys = {
        "available", "model", "modelVersion", "classifierVersion",
        "embeddingCreated", "coughDetected", "signal",
    }
    for row in samples:
        result = analyze_bytes(Path(row["path"]).read_bytes())
        if set(result) != expected_keys:
            raise RuntimeError(f"UNSAFE_OR_INCOMPLETE_RESPONSE_KEYS {sorted(result)}")
        if result["model"] != "GOOGLE_HEAR" or result["embeddingCreated"] is not True:
            raise RuntimeError("HEAR_INFERENCE_NOT_CONFIRMED")
        if result["signal"] not in {
            "COUGH_LIKE_SIGNAL_PRESENT", "NO_COUGH_LIKE_SIGNAL_DETECTED", "INCONCLUSIVE"
        }:
            raise RuntimeError("INVALID_SIGNAL")
        results.append({"weakLabel": int(row["label"]), **result})
    return results


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("manifest", type=Path)
    arguments = parser.parse_args()
    print(json.dumps(verify(arguments.manifest), indent=2))
