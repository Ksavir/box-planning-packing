# Build the browser app separately; Node is not needed in the running service.
FROM node:22-bookworm-slim AS frontend-build
WORKDIR /build/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

FROM python:3.12-slim-bookworm AS runtime
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PORT=10000 \
    PACKFLOW_DB_PATH=/app/data/packflow.db \
    PACKFLOW_FRONTEND_DIR=/app/frontend
WORKDIR /app/backend
COPY backend/requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt \
    && useradd --create-home --uid 10001 packflow \
    && mkdir -p /app/data \
    && chown packflow:packflow /app/data
COPY backend/app/ ./app/
COPY --from=frontend-build /build/frontend/dist/ /app/frontend/
USER packflow
EXPOSE 10000
CMD ["sh", "-c", "exec uvicorn app.web:app --host 0.0.0.0 --port ${PORT:-10000} --workers 1"]
