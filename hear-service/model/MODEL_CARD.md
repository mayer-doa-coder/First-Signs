# HeAR cough-presence head V1

## Intended use

This regularized logistic head consumes one 512-value embedding from Google HeAR 1.0.0 and returns an experimental **cough-presence** signal. The official Google small health-event detector selects the most cough-like two-second window first. The two components must agree for a positive or negative result; disagreement returns `INCONCLUSIVE`.

It is supporting information only. It does not estimate TB probability, diagnose TB, determine referral eligibility, or modify the deterministic symptom-safety outcome.

## Training record

- Base model: `google/hear`, version 1.0.0, frozen.
- Dataset: CoughVID `public_dataset.zip` from Zenodo record 4048312.
- Labels: automated high-confidence weak cough-presence labels (`>= 0.95` positive, `<= 0.05` negative).
- Prepared: 300 positive and 300 negative recordings; 99 quiet/invalid recordings were rejected during decoding.
- Split: deterministic recording-identity groups, 60% train / 20% validation / 20% held-out test.
- Threshold: selected on validation F1 only; 0.805.
- Held-out test: 101 recordings; balanced accuracy 0.9360, F1 0.9531, precision 0.9531, sensitivity 0.9531.
- Artifact: `cough_classifier.json`, version `HEAR-COUGH-PRESENCE-V1`.

These results measure agreement with CoughVID's automated weak labels, not clinical correctness. They are not an independent external validation and must not be presented as performance for Bangladesh, TB detection, or diagnosis.

## Limitations and required validation

- CoughVID is crowdsourced and is not a Bangladesh-specific or TB-specific clinical dataset.
- Recording device, environment, population, and weak-label bias can reduce performance.
- A valid negative signal must never reassure a person against the fixed symptom recommendation.
- Before any health-impacting use, evaluate prospectively on representative Bangladesh devices and populations with appropriate ethics, consent, governance, and clinical/reference lab outcomes.
- Raw audio and embeddings are transient in this application and are not retained by the acoustic workflow.

See `../DATASETS.md` and Google's HAI-DEF model card and terms for provenance and licence restrictions.
# Optional research-only TB triage artifact

`tb_triage_classifier.json` is deliberately absent until a separately approved,
consented TBscreen training cohort has been processed. If present it must be a
versioned `tb_triage_research_only` artifact with 512 HeAR features plus the
five transient app inputs, participant-disjoint evaluation, calibration, and
Bangladesh external-validation limitations. The service exposes only a concern
band, never a probability. It is not a diagnosis or rule-out and cannot change
fixed symptom safety rules.
