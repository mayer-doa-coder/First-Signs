"""Train a frozen-HeAR logistic cough classifier from a prepared manifest."""

from __future__ import annotations

import argparse
import csv
import json
from pathlib import Path

import numpy as np
import tensorflow as tf
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import balanced_accuracy_score, f1_score, precision_score, recall_score
from sklearn.model_selection import GroupShuffleSplit
from sklearn.preprocessing import StandardScaler

from app import CLIP_SAMPLES, LABELS, MODEL_ROOT, _decode_audio, _clips


def embed_files(manifest: Path) -> tuple[np.ndarray, np.ndarray, np.ndarray, int]:
    hear = tf.saved_model.load(str(MODEL_ROOT)).signatures["serving_default"]
    detector = tf.saved_model.load(
        str(MODEL_ROOT / "event_detector" / "event_detector_small")
    ).signatures["serving_default"]
    embeddings: list[np.ndarray] = []
    labels: list[int] = []
    groups: list[str] = []
    skipped = 0
    with manifest.open(newline="", encoding="utf-8") as source:
        for row in csv.DictReader(source):
            try:
                audio = _decode_audio(Path(row["path"]).read_bytes())
            except (OSError, ValueError):
                skipped += 1
                continue
            # Match production preprocessing: select the window with the
            # strongest cough-event score, without consulting the weak label.
            candidates = _clips(audio)
            detector_scores = []
            for candidate in candidates:
                detector_output = detector(audio_wav=tf.constant(candidate.reshape(1, CLIP_SAMPLES)))
                detector_scores.append(
                    float(next(iter(detector_output.values())).numpy()[0, LABELS.index("Cough")])
                )
            clip = candidates[int(np.argmax(detector_scores))]
            output = hear(x=tf.constant(clip.reshape(1, CLIP_SAMPLES)))
            embeddings.append(next(iter(output.values())).numpy()[0])
            labels.append(int(row["label"]))
            groups.append(row["group"])
            if len(embeddings) % 50 == 0:
                print(f"Embedded {len(embeddings)} recordings", flush=True)
    return np.asarray(embeddings), np.asarray(labels), np.asarray(groups), skipped


def train(manifest: Path, output: Path) -> dict[str, object]:
    x, y, groups, skipped = embed_files(manifest)
    class_counts = np.bincount(y, minlength=2)
    if class_counts.min() < 100:
        raise RuntimeError(f"INSUFFICIENT_USABLE_RECORDINGS counts={class_counts.tolist()}")
    holdout_splitter = GroupShuffleSplit(n_splits=1, test_size=0.4, random_state=2403)
    train_index, holdout_index = next(holdout_splitter.split(x, y, groups))
    validation_splitter = GroupShuffleSplit(n_splits=1, test_size=0.5, random_state=2404)
    validation_relative, test_relative = next(
        validation_splitter.split(x[holdout_index], y[holdout_index], groups[holdout_index])
    )
    validation_index = holdout_index[validation_relative]
    test_index = holdout_index[test_relative]
    scaler = StandardScaler().fit(x[train_index])
    classifier = LogisticRegression(C=1.0, class_weight="balanced", max_iter=2_000, random_state=2403)
    classifier.fit(scaler.transform(x[train_index]), y[train_index])

    validation_probabilities = classifier.predict_proba(scaler.transform(x[validation_index]))[:, 1]
    thresholds = np.linspace(0.1, 0.9, 161)
    threshold = float(max(thresholds, key=lambda value: f1_score(y[validation_index], validation_probabilities >= value)))
    test_probabilities = classifier.predict_proba(scaler.transform(x[test_index]))[:, 1]
    predictions = test_probabilities >= threshold
    artifact: dict[str, object] = {
        "version": "HEAR-COUGH-PRESENCE-V1",
        "task": "cough_presence_only",
        "dataset": "CoughVID high-confidence weak cough-presence labels (>=0.95 / <=0.05)",
        "weights": classifier.coef_[0].astype(float).tolist(),
        "bias": float(classifier.intercept_[0]),
        "mean": scaler.mean_.astype(float).tolist(),
        "scale": scaler.scale_.astype(float).tolist(),
        "threshold": threshold,
        "evaluation": {
            "usable_recordings": int(len(y)),
            "skipped_invalid_or_quiet": int(skipped),
            "negative_recordings": int(class_counts[0]),
            "positive_recordings": int(class_counts[1]),
            "held_out_recordings": int(len(test_index)),
            "balanced_accuracy": float(balanced_accuracy_score(y[test_index], predictions)),
            "f1": float(f1_score(y[test_index], predictions)),
            "precision": float(precision_score(y[test_index], predictions, zero_division=0)),
            "sensitivity": float(recall_score(y[test_index], predictions)),
        },
    }
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(artifact, indent=2), encoding="utf-8")
    return artifact


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("manifest", type=Path)
    parser.add_argument("--output", type=Path, default=Path(__file__).parent / "model" / "cough_classifier.json")
    arguments = parser.parse_args()
    result = train(arguments.manifest, arguments.output)
    print(json.dumps(result["evaluation"], indent=2))
