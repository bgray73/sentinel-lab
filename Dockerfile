# syntax=docker/dockerfile:1

FROM node:24-alpine AS dependencies
WORKDIR /app
RUN npm install --global pnpm@10.15.1
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

FROM dependencies AS build
COPY . .
RUN pnpm build:production

FROM node:24-alpine AS production-dependencies
WORKDIR /app
RUN npm install --global pnpm@10.15.1
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --prod --frozen-lockfile

FROM node:24-alpine AS runtime
ENV NODE_ENV=production \
    PORT=4100 \
    DATABASE_PATH=/var/lib/sentinel/sentinel.db \
    SENTINEL_DATA_FILE=/var/lib/sentinel/monitoring.json \
    SENTINEL_TELEMETRY_FILE=/var/lib/sentinel/telemetry.json \
    SENTINEL_CMDB_FILE=/var/lib/sentinel/cmdb.json \
    SENTINEL_HARDWARE_OPERATIONS_FILE=/var/lib/sentinel/hardware-operations.json
WORKDIR /app
COPY --from=production-dependencies --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/package.json ./package.json
COPY --from=build --chown=node:node /app/dist ./dist
COPY --from=build --chown=node:node /app/server-dist ./server-dist
RUN mkdir -p /var/lib/sentinel && chown node:node /var/lib/sentinel
USER node
EXPOSE 4100
VOLUME ["/var/lib/sentinel"]
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:4100/api/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"]
CMD ["node", "server-dist/index.js"]
