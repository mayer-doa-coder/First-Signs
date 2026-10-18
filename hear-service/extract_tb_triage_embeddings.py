"""Create a compact, embedding-only TBscreen training cache."""
from __future__ import annotations
import argparse, json
from pathlib import Path
import numpy as np
import tensorflow as tf
from app import CLIP_SAMPLES, LABELS, MODEL_ROOT, _clips, _decode_audio
from tbscreen_stream import DEFAULT_CACHE_LIMIT, RangeZipReader, TBscreenError, require_terms_acknowledgement, with_transient_member

CLINICAL = ("coughDays", "fever", "nightSweats", "weightLoss", "bloodInSputum")

def selections(path: Path):
    for line in path.read_text(encoding="utf-8").splitlines():
        record=json.loads(line)
        if record.get("permission_sound") is not True: continue
        if not isinstance(record.get("participant_id"),str) or record.get("label") not in (0,1) or not isinstance(record.get("audio_member"),str): raise RuntimeError("TBSCREEN_SELECTION_SCHEMA_INVALID")
        if any(key not in record for key in CLINICAL): raise RuntimeError("TBSCREEN_SELECTION_SCHEMA_INVALID")
        yield record

def embed(selection_file: Path, output: Path, url: str, cache: Path, limit: int):
    require_terms_acknowledgement(); reader=RangeZipReader(url)
    hear=tf.saved_model.load(str(MODEL_ROOT)).signatures["serving_default"]
    detector=tf.saved_model.load(str(MODEL_ROOT / "event_detector" / "event_detector_small")).signatures["serving_default"]
    values={"embedding":[],"participant_id":[],"label":[], **{key:[] for key in CLINICAL}}
    for record in selections(selection_file):
        def consume(path: Path):
            audio=_decode_audio(path.read_bytes()); candidates=_clips(audio); scores=[]
            for candidate in candidates:
                result=detector(audio_wav=tf.constant(candidate.reshape(1,CLIP_SAMPLES)))
                scores.append(float(next(iter(result.values())).numpy()[0,LABELS.index("Cough")]))
            result=hear(x=tf.constant(candidates[int(np.argmax(scores))].reshape(1,CLIP_SAMPLES)))
            return next(iter(result.values())).numpy()[0].astype(np.float32)
        try: vector=with_transient_member(reader,record["audio_member"],cache,consume,limit)
        except (TBscreenError, ValueError): continue
        values["embedding"].append(vector); values["participant_id"].append(record["participant_id"]); values["label"].append(record["label"])
        for key in CLINICAL: values[key].append(float(record[key]))
    if not values["embedding"]: raise RuntimeError("NO_CONSENTED_USABLE_RECORDINGS")
    output.parent.mkdir(parents=True,exist_ok=True)
    np.savez_compressed(output, embedding=np.asarray(values["embedding"],dtype=np.float32), participant_id=np.asarray(values["participant_id"]), label=np.asarray(values["label"],dtype=np.int8), **{key:np.asarray(values[key],dtype=np.float32) for key in CLINICAL})

if __name__ == "__main__":
    parser=argparse.ArgumentParser(); parser.add_argument("selection",type=Path); parser.add_argument("--output",type=Path,default=Path(".artifacts/tb-triage/consented_embeddings.npz")); parser.add_argument("--cache",type=Path,default=Path(".artifacts/tb-triage/cache")); parser.add_argument("--url",default="https://dataset.cs.washington.edu/shwetak/TBscreen_Dataset.zip"); parser.add_argument("--cache-limit-bytes",type=int,default=DEFAULT_CACHE_LIMIT)
    args=parser.parse_args(); embed(args.selection,args.output,args.url,args.cache,args.cache_limit_bytes)
