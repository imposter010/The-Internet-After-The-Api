# syntax=docker/dockerfile:1

FROM node:22-bookworm-slim AS build
WORKDIR /app

# Compose runs its own MongoDB container; do not download a test MongoDB binary.
ENV MONGOMS_DISABLE_POSTINSTALL=1
COPY package*.json ./
COPY apps/provider/package.json ./apps/provider/package.json
COPY apps/gateway/package.json ./apps/gateway/package.json
COPY apps/console/package.json ./apps/console/package.json
COPY apps/shopflow/package.json ./apps/shopflow/package.json
COPY packages/shared/package.json ./packages/shared/package.json
RUN if [ -f package-lock.json ]; then npm ci --include=dev; else npm install --include=dev; fi

COPY . .
# This URL is public and must be reachable by the browser, including on a LAN.
ARG VITE_GATEWAY_URL=http://localhost:8000
ARG VITE_DASHBOARD_URL
ARG VITE_SHOPFLOW_URL
ENV VITE_GATEWAY_URL=${VITE_GATEWAY_URL} \
    VITE_DASHBOARD_URL=${VITE_DASHBOARD_URL} \
    VITE_SHOPFLOW_URL=${VITE_SHOPFLOW_URL}
RUN npm run build

FROM node:22-bookworm-slim AS runtime
WORKDIR /app
COPY --from=build --chown=node:node /app ./

# Vite needs development dependencies; this target is for the demo frontends.
FROM runtime AS frontend
ENV NODE_ENV=development
USER node
EXPOSE 5173 5174
CMD ["npm", "run", "dev:dashboard"]

# Provider and gateway need only production dependencies plus built UI assets.
FROM runtime AS backend
ENV NODE_ENV=production
RUN npm prune --omit=dev --ignore-scripts
USER node
EXPOSE 8000 8001
HEALTHCHECK --interval=10s --timeout=5s --start-period=20s --retries=5 \
    CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||8000)+'/health',{signal:AbortSignal.timeout(3000)}).then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "apps/gateway/src/server.js"]
