#!/bin/bash
set -e

echo "=== Starting LingoStream All-In-One Services ==="

# 1. Start Redis
echo "Starting Redis..."
redis-server --daemonize yes

# 2. Setup and Start PostgreSQL
echo "Starting PostgreSQL..."
service postgresql start

# Wait for Postgres to be ready
until su - postgres -c "pg_isready" > /dev/null 2>&1; do
  echo "Waiting for postgres..."
  sleep 1
done

# Create user & database if not exists
su - postgres -c "psql -tc \"SELECT 1 FROM pg_roles WHERE rolname = 'user'\"" | grep -q 1 || su - postgres -c "psql -c \"CREATE USER \\\"user\\\" WITH PASSWORD 'password' SUPERUSER;\""
su - postgres -c "psql -tc \"SELECT 1 FROM pg_database WHERE datname = 'lingostream'\"" | grep -q 1 || su - postgres -c "psql -c \"CREATE DATABASE lingostream OWNER \\\"user\\\";\""

# 3. Start MinIO
echo "Starting MinIO..."
mkdir -p /data/lingostream-books
MINIO_ROOT_USER=minioadmin MINIO_ROOT_PASSWORD=minioadmin minio server /data --console-address ":9001" &

# Wait for MinIO and ensure bucket exists
sleep 3
mc alias set local http://127.0.0.1:9000 minioadmin minioadmin || true
mc mb local/lingostream-books || true
mc anonymous set download local/lingostream-books || true

# 4. Start FastAPI Backend (serves API + Frontend SPA directly)
APP_PORT="${PORT:-10000}"
echo "Starting FastAPI Backend on 0.0.0.0:${APP_PORT}..."
cd /app/backend
exec uvicorn main:app --host 0.0.0.0 --port "${APP_PORT}"
