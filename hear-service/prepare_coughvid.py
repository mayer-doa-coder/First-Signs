"""Prepare balanced, high-confidence CoughVID weak labels without extracting the full archive."""

from __future__ import annotations

import argparse
import csv
import io
import random
import re
import zipfile
from pathlib import Path, PurePosixPath


def prepare(archive: Path, output: Path, per_class: int) -> Path:
    rng = random.Random(2403)
    with zipfile.ZipFile(archive) as source:
        names = source.namelist()
        metadata_name = next((name for name in names if name.lower().endswith("metadata_compiled.csv")), None)
        if metadata_name is None:
            raise RuntimeError("COUGHVID_METADATA_NOT_FOUND")

        audio_by_stem: dict[str, str] = {}
        for name in names:
            suffix = PurePosixPath(name).suffix.lower()
            if suffix in {".wav", ".webm", ".ogg", ".mp3", ".m4a"}:
                audio_by_stem[PurePosixPath(name).stem] = name

        rows = list(csv.DictReader(io.TextIOWrapper(source.open(metadata_name), encoding="utf-8-sig")))
        positives: list[tuple[dict[str, str], str]] = []
        negatives: list[tuple[dict[str, str], str]] = []
        for row in rows:
            identifier = (row.get("uuid") or "").strip()
            if not re.fullmatch(r"[0-9a-fA-F-]{36}", identifier):
                continue
            audio_name = audio_by_stem.get(identifier)
            try:
                score = float(row.get("cough_detected") or "nan")
            except ValueError:
                continue
            if not audio_name:
                continue
            if score >= 0.95:
                positives.append((row, audio_name))
            elif score <= 0.05:
                negatives.append((row, audio_name))

        if len(positives) < per_class or len(negatives) < per_class:
            raise RuntimeError(
                f"INSUFFICIENT_BALANCED_RECORDINGS positive={len(positives)} negative={len(negatives)}"
            )
        selected = [(item, 1) for item in rng.sample(positives, per_class)]
        selected += [(item, 0) for item in rng.sample(negatives, per_class)]
        rng.shuffle(selected)

        audio_directory = output / "audio"
        audio_directory.mkdir(parents=True, exist_ok=True)
        manifest = output / "manifest.csv"
        with manifest.open("w", newline="", encoding="utf-8") as target:
            writer = csv.DictWriter(target, fieldnames=["path", "label", "group"])
            writer.writeheader()
            for (row, audio_name), label in selected:
                identifier = row["uuid"].strip()
                suffix = PurePosixPath(audio_name).suffix.lower()
                destination = audio_directory / f"{identifier}{suffix}"
                destination.write_bytes(source.read(audio_name))
                writer.writerow({
                    "path": str(destination.resolve()),
                    "label": label,
                    "group": identifier,
                })
    return manifest


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("archive", type=Path)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--per-class", type=int, default=300)
    arguments = parser.parse_args()
    print(prepare(arguments.archive, arguments.output, arguments.per_class))
