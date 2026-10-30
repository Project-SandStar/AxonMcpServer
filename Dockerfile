# Axon MCP server (fileSystemSideCar Task 8.5)
#   /mcp     MCP StreamableHTTP
#   /health  health check
#   /admin   admin API (Basic Auth) + /admin/changes (Bearer, sidecar hook)
# Volumes: /app/.cache (SQLite usage.db, LanceDB axonvector.db),
#          /app/.cache/models (embedding models), /mirror (read-only sidecar files),
#          /netbird-ctl (shared with the NetBird container, see docker/docker-compose.example.yml)

FROM node:22-bookworm-slim AS dashboard
WORKDIR /dashboard
COPY dashboard/package.json dashboard/package-lock.json ./
RUN npm ci
COPY dashboard/next.config.ts dashboard/tsconfig.json dashboard/postcss.config.mjs ./
COPY dashboard/public ./public
COPY dashboard/src ./src
RUN npm run build

FROM node:22-bookworm-slim AS build
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ \
    && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json prisma.config.ts ./
COPY prisma ./prisma
COPY src ./src
RUN npx prisma generate && npm run build && npm prune --omit=dev

FROM node:22-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production \
    MCP_TRANSPORT=http \
    MCP_PORT=3847 \
    DATABASE_URL=file:/app/.cache/usage.db \
    AXON_MIRROR_DIR=/mirror
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=dashboard /dashboard/out ./dashboard/out
COPY --from=build /app/prisma ./prisma
COPY --from=build /app/src/parser/treeSitter/grammars ./src/parser/treeSitter/grammars
COPY package.json prisma.config.ts ./
COPY config/*.example.json ./config/
COPY workflows ./workflows
COPY templates ./templates
COPY scripts/docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh && mkdir -p /app/.cache/models /mirror /netbird-ctl \
    && chown -R node:node /app /netbird-ctl
USER node
VOLUME ["/app/.cache", "/app/.cache/models"]
EXPOSE 3847
HEALTHCHECK --interval=30s --timeout=5s --start-period=60s \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.MCP_PORT||3847)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["node", "--max-old-space-size=8192", "dist/index.js"]
