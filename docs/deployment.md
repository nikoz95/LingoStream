# LingoStream — Deployment & Build Guide

## 1. Local Multi-Container Setup (`docker-compose.yml`)
Runs 4 services:
- `db` — PostgreSQL 15 (`5432`)
- `redis` — Redis 7 (`6379`)
- `minio` — S3-compatible object storage (`9000` / `9001`)
- `backend` — Built from `backend/Dockerfile` (`8000`)
- `frontend` — Built from `frontend/Dockerfile` + `frontend/nginx.conf` (`80` and `3000`)

Commands:
```bash
# Build & start all containers
docker-compose up --build -d

# Check container status
docker-compose ps
```
> **Note on `frontend/Dockerfile`:** `foliate-js` includes an unused `./pdf.js` dynamic import that fails Vite's ES2020 top-level await check. `frontend/Dockerfile` patches `node_modules/foliate-js/view.js` during `RUN npm ci` so Vite only bundles EPUB/MOBI/FB2 support from `foliate-js`.

---

## 2. Cloud Single-Container Setup (Root `Dockerfile` / Koyeb / Render)
- Root `Dockerfile` (and `Dockerfile.koyeb` + `entrypoint.sh`) runs PostgreSQL, Redis, MinIO, and FastAPI in a single container, and FastAPI serves the static frontend directly from `/app/frontend/dist`.
- **Important Rule:** Whenever `frontend/` source code is modified, run `cd frontend && npm.cmd run build` so `frontend/dist` stays updated for single-container deployments.
