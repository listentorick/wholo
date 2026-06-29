FROM node:20-alpine AS base
RUN corepack enable && corepack prepare pnpm@9 --activate

FROM base AS builder
WORKDIR /app

# Install dependencies (layer-cached before copying source)
COPY .npmrc pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY packages/types/package.json ./packages/types/
COPY packages/admin-api-client/package.json ./packages/admin-api-client/
COPY apps/admin/package.json ./apps/admin/
COPY apps/admin-api/package.json ./apps/admin-api/
RUN pnpm install --frozen-lockfile

# Copy source
COPY packages/types ./packages/types
COPY packages/admin-api-client ./packages/admin-api-client
COPY apps/admin ./apps/admin
COPY apps/admin-api ./apps/admin-api

# Build shared packages
RUN pnpm --filter @wholo/types build
RUN pnpm --filter @wholo/admin-api-client build

# Build Next.js frontend — NEXT_PUBLIC_* vars must be baked into the bundle at build time
ARG NEXT_PUBLIC_KEYCLOAK_URL=http://localhost:8080
ARG NEXT_PUBLIC_KEYCLOAK_REALM=wholo
ARG NEXT_PUBLIC_KEYCLOAK_CLIENT_ID=wholo-admin
ENV NEXT_TELEMETRY_DISABLED=1
ENV NEXT_PUBLIC_KEYCLOAK_URL=${NEXT_PUBLIC_KEYCLOAK_URL}
ENV NEXT_PUBLIC_KEYCLOAK_REALM=${NEXT_PUBLIC_KEYCLOAK_REALM}
ENV NEXT_PUBLIC_KEYCLOAK_CLIENT_ID=${NEXT_PUBLIC_KEYCLOAK_CLIENT_ID}
RUN pnpm --filter @wholo/admin build

# Generate Prisma client then build NestJS BFF
WORKDIR /app/apps/admin-api
RUN npx prisma generate
WORKDIR /app
RUN pnpm --filter @wholo/admin-api build

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV NEXT_APP_DIR=/app/admin

# NestJS compiled output
COPY --from=builder /app/apps/admin-api/dist ./dist
COPY --from=builder /app/apps/admin-api/package.json ./package.json

# Next.js build output and static assets
COPY --from=builder /app/apps/admin/.next ./admin/.next
COPY --from=builder /app/apps/admin/public ./admin/public
COPY --from=builder /app/apps/admin/package.json ./admin/package.json
COPY --from=builder /app/apps/admin/next.config.ts ./admin/next.config.ts

# Shared runtime dependencies
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages/types/dist ./packages/types/dist
COPY --from=builder /app/packages/admin-api-client/dist ./packages/admin-api-client/dist

EXPOSE 3020
CMD ["node", "dist/main.js"]
