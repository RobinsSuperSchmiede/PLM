# Development

## Frontend

```bash
npm install --prefix apps/web
npm --prefix apps/web run dev
```

## Backend

```bash
cd apps/api
python -m venv .venv
source .venv/bin/activate
pip install -e .
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

## Docker

```bash
docker compose up --build
```
