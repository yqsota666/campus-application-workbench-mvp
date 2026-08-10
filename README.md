# Campus Application Workbench MVP

A local-first MVP for collecting campus job postings, manually reviewing captured evidence, coordinating registration/login checkpoints, and preparing resume prefill drafts.

## What This Demo Includes

- Static frontend workbench with separate pages for daily search, job review, registration assistance, resume prefill, tracking, and settings.
- FastAPI backend with JSON-file storage for local MVP development.
- Manual review gate before any captured job enters the application workflow.
- Registration/login assistance model that does not bypass CAPTCHA, SMS, QR login, agreement confirmation, or final submit.
- Sanitized demo profile, preferences, and job samples.

## Local Run

Backend:

```bash
cd backend
python3.10 -m venv .venv
.venv/bin/pip install -r requirements.txt
.venv/bin/uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload
```

Frontend:

```bash
cd frontend
python3 -m http.server 5173
```

Open `http://127.0.0.1:5173/`.

## Tests

```bash
cd backend
.venv/bin/python -m pytest -q
```

## Safety Boundary

This project is designed around explicit human confirmation. It should pause for user action whenever a site requires CAPTCHA, SMS verification, QR login, required manual agreement, low-confidence field mapping, or final submission.
