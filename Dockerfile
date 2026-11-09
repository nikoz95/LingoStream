# ── Multi-stage Build: Frontend ─────────────────
FROM node:22-alpine AS frontend-builder
WORKDIR /app/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
RUN chmod -R +x node_modules/.bin && npx --no-install vite build

# ── Main Runtime: Debian Bookworm with Python 3.11 ──
FROM python:3.11-slim-bookworm

ENV DEBIAN_FRONTEND=noninteractive \
    PYTHONUNBUFFERED=1 \
    DATABASE_URL=postgresql+asyncpg://user:password@127.0.0.1:5432/lingostream \
    JWT_SECRET=lingostream-secret-key-production \
    REDIS_URL=redis://127.0.0.1:6379/0 \
    S3_ENDPOINT_URL=http://127.0.0.1:9000 \
    S3_ACCESS_KEY_ID=minioadmin \
    S3_SECRET_ACCESS_KEY=minioadmin \
    S3_BUCKET_NAME=lingostream-books \
    S3_PUBLIC_URL=/api/v1/books

# Install PostgreSQL 15, Redis, Nginx, curl, and build tools
RUN apt-get update && apt-get install -y --no-install-recommends \
    postgresql-15 \
    postgresql-client-15 \
    redis-server \
    nginx \
    curl \
    gcc \
    g++ \
    make \
    libpq-dev \
    python3-dev \
    libffi-dev \
    libxml2-dev \
    libxslt1-dev \
    zlib1g-dev \
    && rm -rf /var/lib/apt/lists/*

# Install official MinIO binary
RUN curl -fsSL -o /usr/local/bin/minio https://dl.min.io/server/minio/release/linux-amd64/minio && \
    chmod +x /usr/local/bin/minio

# Install Python backend dependencies
WORKDIR /app/backend
COPY backend/requirements.txt .
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir -r requirements.txt

# Copy Backend source code
COPY backend/ .

# Copy Frontend built static assets from frontend-builder stage
COPY --from=frontend-builder /app/frontend/dist /var/www/html

# Setup Nginx configuration
COPY nginx.render.conf /etc/nginx/sites-available/default

# Copy entrypoint script and set permissions
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

# Initialize PostgreSQL cluster directory
RUN su - postgres -c "/usr/lib/postgresql/15/bin/initdb -D /var/lib/postgresql/15/main" || true

EXPOSE 80 10000

ENTRYPOINT ["/entrypoint.sh"]
