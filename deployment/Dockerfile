FROM node:20-bookworm AS runtime

ENV NODE_ENV=production

WORKDIR /app

RUN apt-get update && \
    apt-get install -y --no-install-recommends \
    python3 \
    make \
    g++ \
    sqlite3 \
    dumb-init \
    ca-certificates && \
    rm -rf /var/lib/apt/lists/*

COPY package/package*.json package/

RUN npm ci --prefix package --omit=dev && \
    npm rebuild sqlite3 --prefix package --build-from-source

COPY . .

RUN mkdir -p \
    /app/data \
    /app/logs \
    /app/backups \
    /media/movies \
    /media/subtitles \
    /media/thumbnails \
    "/media/hero banner" && \
    chown -R node:node /app /media

USER node

EXPOSE 10000

ENV NODE_PATH=/app/package/node_modules

CMD ["dumb-init", "node", "backend/server.js"]