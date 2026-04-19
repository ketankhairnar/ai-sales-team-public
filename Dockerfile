# Ship-focused Dockerfile: Node + SQLite.
# Playwright/Python tools excluded — hybrid mode uses mock scrapers on server.
# Live scraping would need full playwright base image instead.

FROM node:22-bookworm-slim AS build
WORKDIR /app

# Native deps for better-sqlite3
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential python3 ca-certificates \
    && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

FROM node:22-bookworm-slim AS runtime
WORKDIR /app

# Runtime deps only
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/src/db/schema.sql ./src/db/schema.sql

# Writable data dir for SQLite
RUN mkdir -p /app/data

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=3000
ENV DB_PATH=/app/data/app.db
EXPOSE 3000

CMD ["node", "./dist/server/entry.mjs"]
