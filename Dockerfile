FROM node:20-bookworm-slim

WORKDIR /app

RUN set -eux; \
    apt-get update; \
    apt-get install -y --no-install-recommends \
    python3 \
    pkg-config \
    build-essential \
    libcairo2-dev \
    libpango1.0-dev \
    libpng-dev \
    libjpeg-dev \
    libgif-dev \
    librsvg2-dev \
    ; \
    rm -rf /var/lib/apt/lists/*

COPY package.json ./
COPY sifu_database/postinstall.js ./sifu_database/postinstall.js
RUN npm install --legacy-peer-deps --no-audit --no-fund \
    && npm rebuild sqlite3 --build-from-source \
    && npm cache clean --force

COPY . .

ENV PORT=5000
EXPOSE 5000

CMD ["node", "index.js"]
