"""Train the research-only TB triage artifact from compact, consented embeddings.

The input NPZ is intentionally embedding-only: arrays `embedding` (n,512),
`participant_id`, `label`, and the five app-aligned clinical columns. It never
accepts CoughVID or raw audio as a TB-training source.
"""
from __future__ import annotations
import argparse, json
from datetime import date
from pathlib import Path
import numpy as np
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import brier_score_loss, roc_auc_score, confusion_matrix
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import StandardScaler

CLINICAL = ("coughDays", "fever", "nightSweats", "weightLoss", "bloodInSputum")

def _groups(values: np.ndarray, labels: np.ndarray, test_size: float, seed: int):
    ids = np.unique(values)
    group_labels = np.array([int(np.max(labels[values == item])) for item in ids])
    return train_test_split(ids, test_size=test_size, random_state=seed, stratify=group_labels)

def _metrics(y: np.ndarray, probability: np.ndarray, threshold: float) -> dict[str, float]:
    prediction = probability >= threshold
    tn, fp, fn, tp = confusion_matrix(y, prediction, labels=[0, 1]).ravel()
    return {"rocAuc": float(roc_auc_score(y, probability)), "brier": float(brier_score_loss(y, probability)),
      "sensitivity": float(tp / max(1, tp + fn)), "specificity": float(tn / max(1, tn + fp))}

def train(source: Path, output: Path) -> dict:
    if "coughvid" in source.as_posix().lower(): raise RuntimeError("COUGHVID_CANNOT_BE_USED_FOR_TB_TRAINING")
    data = np.load(source, allow_pickle=False)
    required = {"embedding", "participant_id", "label", *CLINICAL}
    if not required.issubset(data.files): raise RuntimeError("TB_TRIAGE_INPUT_SCHEMA_INVALID")
    embedding = np.asarray(data["embedding"], dtype=np.float32); groups = data["participant_id"].astype(str); labels = np.asarray(data["label"], dtype=int)
    if embedding.ndim != 2 or embedding.shape[1] != 512 or len(np.unique(groups)) < 30 or set(np.unique(labels)) != {0, 1}: raise RuntimeError("TB_TRIAGE_INPUT_INSUFFICIENT")
    clinical = np.column_stack([np.asarray(data[key], dtype=np.float32) for key in CLINICAL])
    x = np.column_stack((embedding, clinical))
    train_groups, holdout_groups = _groups(groups, labels, .4, 2403)
    validation_groups, test_groups = _groups(holdout_groups, labels[np.isin(groups, holdout_groups)], .5, 2404)
    train_mask, validation_mask, test_mask = np.isin(groups, train_groups), np.isin(groups, validation_groups), np.isin(groups, test_groups)
    if min(labels[train_mask].sum(), labels[validation_mask].sum(), labels[test_mask].sum()) < 3: raise RuntimeError("TB_TRIAGE_SPLIT_INSUFFICIENT")
    scaler = StandardScaler().fit(x[train_mask]); best = None
    for c in (.05, .1, .3, 1.0):
        candidate = LogisticRegression(C=c, class_weight="balanced", max_iter=4000, random_state=2403).fit(scaler.transform(x[train_mask]), labels[train_mask])
        score = roc_auc_score(labels[validation_mask], candidate.predict_proba(scaler.transform(x[validation_mask]))[:,1])
        if best is None or score > best[0]: best = (score, candidate, c)
    _, classifier, c = best
    raw_val = classifier.decision_function(scaler.transform(x[validation_mask]))
    calibrator = LogisticRegression(C=1e6, max_iter=2000).fit(raw_val.reshape(-1,1), labels[validation_mask])
    val_probability = calibrator.predict_proba(raw_val.reshape(-1,1))[:,1]
    thresholds = np.linspace(.1,.9,161); threshold = float(max(thresholds, key=lambda point: _metrics(labels[validation_mask], val_probability, point)["sensitivity"] + _metrics(labels[validation_mask], val_probability, point)["specificity"]))
    raw_test = classifier.decision_function(scaler.transform(x[test_mask])); test_probability = calibrator.predict_proba(raw_test.reshape(-1,1))[:,1]
    artifact = {"task":"tb_triage_research_only", "version":f"TBSCREEN-HEAR-TRIAGE-{date.today():%Y%m%d}", "dataset":"TBscreen; consented forced cough only; terms acknowledged locally", "clinicalFeatureNames":list(CLINICAL), "weights":classifier.coef_[0].astype(float).tolist(), "bias":float(classifier.intercept_[0]), "mean":scaler.mean_.astype(float).tolist(), "scale":scaler.scale_.astype(float).tolist(), "calibration":{"method":"sigmoid_platt_validation", "slope":float(calibrator.coef_[0][0]), "intercept":float(calibrator.intercept_[0])}, "elevatedThreshold":threshold, "evaluation":{"participants":{"train":int(len(train_groups)),"validation":int(len(validation_groups)),"test":int(len(test_groups))}, "selectedC":c, "test":_metrics(labels[test_mask],test_probability,threshold), "limitations":["Research-only; not a diagnosis or rule-out.","No external Bangladesh validation.","Must not override fixed symptom safety rules."]}}
    output.parent.mkdir(parents=True, exist_ok=True); output.write_text(json.dumps(artifact,indent=2),encoding="utf-8")
    return artifact

if __name__ == "__main__":
    parser=argparse.ArgumentParser(); parser.add_argument("embeddings",type=Path); parser.add_argument("--output",type=Path,default=Path(__file__).parent/"model"/"tb_triage_classifier.json")
    args=parser.parse_args(); print(json.dumps(train(args.embeddings,args.output)["evaluation"],indent=2))
