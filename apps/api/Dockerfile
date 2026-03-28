# ============================================
# Stage 1: Dependencies
# ============================================
FROM node:20-alpine AS deps
WORKDIR /app
RUN npm install -g pnpm@9

COPY package.json pnpm-workspace.yaml ./
COPY apps/api/package.json ./apps/api/
COPY packages/shared/package.json ./packages/shared/

RUN --mount=type=cache,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile --prod=false

# ============================================
# Stage 2: Builder
# ============================================
FROM node:20-alpine AS builder
WORKDIR /app
RUN npm install -g pnpm@9

COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/api/node_modules ./apps/api/node_modules
COPY --from=deps /app/packages/shared/node_modules ./packages/shared/node_modules
COPY . .

RUN pnpm --filter @erp/shared build
RUN pnpm --filter @erp/api db:generate
RUN pnpm --filter @erp/api build

# ============================================
# Stage 3: Runner (minimal production image)
# ============================================
FROM node:20-alpine AS runner
WORKDIR /app

RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 erp-api

RUN npm install -g pnpm@9

COPY --from=builder --chown=erp-api:nodejs /app/apps/api/dist ./dist
COPY --from=builder --chown=erp-api:nodejs /app/apps/api/prisma ./prisma
COPY --from=builder --chown=erp-api:nodejs /app/apps/api/package.json ./package.json
COPY --from=deps --chown=erp-api:nodejs /app/apps/api/node_modules ./node_modules

USER erp-api

ENV NODE_ENV=production
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
  CMD wget -qO- http://localhost:3000/api/v1/health/live || exit 1

CMD ["node", "dist/server.js"]
