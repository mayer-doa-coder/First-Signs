# Acoustic dataset record

## CoughVID

- Source: https://zenodo.org/records/4048312
- Paper: https://doi.org/10.1038/s41597-021-00937-4
- Authors: Lara Orlandic, Tomas Teijeiro, and David Atienza
- Licence: Creative Commons Attribution 4.0
- Download verified against the Zenodo record: `public_dataset.zip`, 951442487 bytes, MD5 `5c30a8b00c8bb7783a2c15a48cb8ea9e`.
- Prototype use: balanced cough-presence training data only. `cough_detected >= 0.95` and `<= 0.05` are automated high-confidence weak labels, not clinical ground truth.

No location, age, sex, health-status, or other participant metadata is copied into the prepared manifest or classifier artifact. The downloaded archive and extracted recordings stay under the gitignored `.artifacts/` directory.

This dataset is not a TB dataset. Results produced from it must not be described as TB risk, diagnosis, or clinical validation. Independent Bangladesh/device evaluation is still required before any health-impacting use.
# TBscreen (planned; terms-gated)

- External archive: `https://dataset.cs.washington.edu/shwetak/TBscreen_Dataset.zip`.
- The public code record does not itself grant the right to process raw cohort
  audio. Read and accept the dataset terms separately before setting the local
  acknowledgement variable.
- Only consented forced-cough recordings may be selected. Never use passive
  recordings, non-consented material, or CoughVID for TB training.
- The range reader stores embeddings, labels, participant IDs, and approved
  shared metadata only under the gitignored `.artifacts/tb-triage`; it deletes
  temporary audio immediately.
