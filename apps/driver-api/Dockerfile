FROM node:20-alpine AS base
RUN corepack enable && corepack prepare pnpm@9 --activate

FROM base AS builder
WORKDIR /app

# Install dependencies (layer-cached before copying source)
COPY .npmrc pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY packages/types/package.json ./packages/types/
COPY apps/driver/package.json ./apps/driver/
COPY apps/driver-api/package.json ./apps/driver-api/
RUN pnpm install --frozen-lockfile

# Copy source
COPY packages/types ./packages/types
COPY apps/driver ./apps/driver
COPY apps/driver-api ./apps/driver-api

# Build shared packages
RUN pnpm --filter @wholo/types build

# Build Next.js frontend — no login/no NEXT_PUBLIC_* build-time vars needed
# this round (driver-api has no authenticated routes; see ADR-059).
ENV NEXT_TELEMETRY_DISABLED=1
RUN pnpm --filter @wholo/driver build

# Build NestJS BFF
RUN pnpm --filter @wholo/driver-api build

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
# Tell main.ts where to find the Next.js app directory
ENV NEXT_APP_DIR=/app/driver

# NestJS compiled output
COPY --from=builder /app/apps/driver-api/dist ./dist
COPY --from=builder /app/apps/driver-api/package.json ./package.json

# Next.js build output and static assets
COPY --from=builder /app/apps/driver/.next ./driver/.next
COPY --from=builder /app/apps/driver/public ./driver/public
COPY --from=builder /app/apps/driver/package.json ./driver/package.json
COPY --from=builder /app/apps/driver/next.config.ts ./driver/next.config.ts

# Shared runtime dependencies
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages/types/dist ./packages/types/dist

EXPOSE 3004
CMD ["node", "dist/main.js"]
