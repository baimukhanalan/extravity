FROM node:22-bookworm-slim AS whatsapp-deps

WORKDIR /bridge
COPY whatsapp-bridge/package.json whatsapp-bridge/package-lock.json ./
RUN npm ci --ignore-scripts --omit=dev

FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends chromium nodejs \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .
COPY --from=whatsapp-deps /bridge/node_modules /app/whatsapp-bridge/node_modules

EXPOSE 8000

# Runs independently configurable collectors. Social sessions require encrypted
# persistent volumes and explicit source allowlists.
CMD ["sh", "-c", "exec uvicorn server:app --host 0.0.0.0 --port ${PORT:-8000}"]
