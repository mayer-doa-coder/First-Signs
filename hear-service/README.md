# HeAR acoustic service

This server runs Google's TensorFlow HeAR 1.0.0 model and official small health-event detector outside the Next.js process. It creates one transient 512-value embedding from the most cough-like two-second window and applies a frozen logistic cough-presence classifier. It does not estimate TB probability or change the fixed symptom safety result.

Required server-only environment variables:

- `HEAR_MODEL_PATH`: local `google/hear` snapshot directory.
- `HEAR_CLASSIFIER_PATH`: trained classifier JSON path.
- `HEAR_SERVICE_TOKEN`: a private random bearer token shared only with Next.js.

Run locally after accepting Google's HAI-DEF terms:

```powershell
py -3.11 -m venv .artifacts/hear-venv
.artifacts\hear-venv\Scripts\pip install -r hear-service\requirements.txt
hf download google/hear --local-dir .artifacts\hear-model
$env:HEAR_MODEL_PATH = ".artifacts\hear-model"
$env:HEAR_CLASSIFIER_PATH = "hear-service\model\cough_classifier.json"
$env:HEAR_SERVICE_TOKEN = "use-a-private-random-value"
.artifacts\hear-venv\Scripts\uvicorn hear-service.app:app --host 127.0.0.1 --port 8017
```

Configure Next.js with the matching `HEAR_SERVICE_TOKEN` and `HEAR_SERVICE_URL=http://127.0.0.1:8017`. Audio is decoded and processed in memory; raw audio and embeddings are not stored.

## Render production deployment

The Next.js web service cannot run this Python process on `127.0.0.1`. Deploy this directory as a **separate Render Docker Web Service**, with the repository root as its Docker build context and `hear-service/Dockerfile` as its Dockerfile path. Use a persistent disk mounted at `/var/lib/first-signs-hear`; the service downloads the approved model there only when it is missing.

Set these server-only variables on the separate service:

- `HEAR_SERVICE_TOKEN`: a private random value.
- `HF_TOKEN`: a Hugging Face read token if the account needs one to download `google/hear`; accept the model's access terms first when required.
- `HEAR_MODEL_PATH=/var/lib/first-signs-hear/model`
- `HEAR_CLASSIFIER_PATH=/app/hear_service/model/cough_classifier.json`

After that service reports `GET /health` as `{"status":"ready"}`, set these on the Next.js Render service and redeploy it:

- `HEAR_SERVICE_URL=https://<your-hear-service>.onrender.com`
- `HEAR_SERVICE_TOKEN`: exactly the same private value used by the HeAR service.

Do not use `http://127.0.0.1:8017` or `localhost` in the production Next.js service. Those addresses only work when both processes run on the same machine locally.

Prepare and train the versioned downstream head:

```powershell
.artifacts\hear-venv\Scripts\python hear-service\prepare_coughvid.py .artifacts\datasets\coughvid\public_dataset.zip --output .artifacts\datasets\coughvid\prepared --per-class 300
.artifacts\hear-venv\Scripts\python hear-service\train_classifier.py .artifacts\datasets\coughvid\prepared\manifest.csv
```

The HeAR base weights remain frozen. Training only the small logistic head follows the model-card downstream-classifier pattern and avoids pretending that weak cough-presence labels can clinically fine-tune a TB model. See `DATASETS.md` for source, licence, and limitations.

The downloaded weights are free of model-access charges when run locally, but compute and hosting are not free. Use and any hosted distribution remain subject to Google's HAI-DEF terms. Do not commit or redistribute the downloaded model snapshot from `.artifacts/`.
