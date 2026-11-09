#!/bin/bash
set -e

echo "=== Starting LingoStream All-In-One Services ==="

# 1. Start Redis
echo "Starting Redis..."
redis-server --daemonize yes

# 2. Setup and Start PostgreSQL
echo "Starting PostgreSQL..."
su - postgres -c "/usr/lib/postgresql/15/bin/pg_ctl -D /var/lib/postgresql/15/main -l /var/log/postgresql.log start" || true

# Wait for Postgres to be ready
until su - postgres -c "pg_isready" > /dev/null 2>&1; do
  echo "Waiting for postgres..."
  sleep 1
done

# Create user & database if not exists
su - postgres -c "psql -tc \"SELECT 1 FROM pg_database WHERE datname = 'lingostream'\" | grep -q 1 || psql -c \"CREATE USER \\\"user\\\" WITH PASSWORD 'password'; CREATE DATABASE lingostream OWNER \\\"user\\\"; GRANT ALL PRIVILEGES ON DATABASE lingostream TO \\\"user\\\";\"" || true

# 3. Start MinIO
echo "Starting MinIO..."
mkdir -p /data/lingostream-books
MINIO_ROOT_USER=minioadmin MINIO_ROOT_PASSWORD=minioadmin minio server /data --console-address ":9001" &

# Wait for MinIO
sleep 2

# 4. Start Backend (FastAPI)
echo "Starting FastAPI Backend..."
cd /app/backend
uvicorn main:app --host 127.0.0.1 --port 8000 &

# 5. Start Nginx (Frontend) in foreground (handles external HTTP traffic on port 80/PORT)
echo "Starting Nginx on port ${PORT:-80}..."
# Substitute PORT if Render provides $PORT
if [ -n "$PORT" ] && [ "$PORT" != "80" ]; then
    sed -i "s/listen 80;/listen $PORT;/g" /etc/nginx/sites-available/default
fi

nginx -g "daemon off;"
