"""Fetch the approved HeAR model to persistent storage, then start the API."""

from __future__ import annotations

import os
import sys
from pathlib import Path

from huggingface_hub import snapshot_download


def ensure_model() -> None:
    model_path = Path(os.environ.get("HEAR_MODEL_PATH", "/var/lib/first-signs-hear/model"))
    if (model_path / "saved_model.pb").is_file():
        return

    # The service never prints the optional HF_TOKEN. Access must be granted
    # to the operator's account before deploying a gated model.
    model_path.mkdir(parents=True, exist_ok=True)
    print("[hear] Downloading the approved google/hear model to persistent storage.", flush=True)
    snapshot_download(
        repo_id="google/hear",
        local_dir=model_path,
        token=os.environ.get("HF_TOKEN") or None,
    )


if __name__ == "__main__":
    ensure_model()
    os.execvp(
        "uvicorn",
        [
            "uvicorn",
            "hear_service.app:app",
            "--host",
            "0.0.0.0",
            "--port",
            os.environ.get("PORT", "8017"),
        ],
    )
