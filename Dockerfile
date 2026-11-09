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
    wget \
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

# Copy official MinIO binary and client from elestio/minio
COPY --from=elestio/minio:latest /usr/bin/minio /usr/local/bin/minio
COPY --from=elestio/minio:latest /usr/bin/mc /usr/local/bin/mc

# Install Python backend dependencies
WORKDIR /app/backend
COPY backend/requirements.txt .
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir -r requirements.txt

# Copy Backend source code
COPY backend/ .

# Copy pre-built Frontend production assets directly into Nginx html directory
COPY frontend/dist /var/www/html

# Setup Nginx configuration
COPY nginx.render.conf /etc/nginx/sites-available/default

# Configure PostgreSQL pg_hba.conf for internal local connections
RUN sed -i 's/peer/trust/g' /etc/postgresql/15/main/pg_hba.conf && \
    sed -i 's/scram-sha-256/trust/g' /etc/postgresql/15/main/pg_hba.conf && \
    sed -i 's/md5/trust/g' /etc/postgresql/15/main/pg_hba.conf

# Copy entrypoint script and set permissions
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

EXPOSE 80 10000

ENTRYPOINT ["/entrypoint.sh"]
