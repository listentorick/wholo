FROM node:20-alpine AS base
RUN corepack enable && corepack prepare pnpm@9 --activate

FROM base AS builder
WORKDIR /app

# Install dependencies (layer-cached before copying source)
COPY .npmrc pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY packages/types/package.json ./packages/types/
COPY packages/api-client/package.json ./packages/api-client/
COPY apps/portal/package.json ./apps/portal/
COPY apps/portal-api/package.json ./apps/portal-api/
RUN pnpm install --frozen-lockfile

# Copy source
COPY packages/types ./packages/types
COPY packages/api-client ./packages/api-client
COPY apps/portal ./apps/portal
COPY apps/portal-api ./apps/portal-api

# Build shared packages
RUN pnpm --filter @wholo/types build
RUN pnpm --filter @wholo/api-client build

# Build Next.js frontend — NEXT_PUBLIC_* vars must be baked into the bundle at build time
ARG NEXT_PUBLIC_KEYCLOAK_URL=http://localhost:8080
ARG NEXT_PUBLIC_KEYCLOAK_REALM=wholo
ARG NEXT_PUBLIC_KEYCLOAK_CLIENT_ID=wholo-portal
ENV NEXT_TELEMETRY_DISABLED=1
ENV NEXT_PUBLIC_KEYCLOAK_URL=${NEXT_PUBLIC_KEYCLOAK_URL}
ENV NEXT_PUBLIC_KEYCLOAK_REALM=${NEXT_PUBLIC_KEYCLOAK_REALM}
ENV NEXT_PUBLIC_KEYCLOAK_CLIENT_ID=${NEXT_PUBLIC_KEYCLOAK_CLIENT_ID}
RUN pnpm --filter @wholo/portal build

# Build NestJS BFF
RUN pnpm --filter @wholo/portal-api build

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
# Tell main.ts where to find the Next.js app directory
ENV NEXT_APP_DIR=/app/portal

# NestJS compiled output
COPY --from=builder /app/apps/portal-api/dist ./dist
COPY --from=builder /app/apps/portal-api/package.json ./package.json

# Next.js build output and static assets
COPY --from=builder /app/apps/portal/.next ./portal/.next
COPY --from=builder /app/apps/portal/public ./portal/public
COPY --from=builder /app/apps/portal/package.json ./portal/package.json
COPY --from=builder /app/apps/portal/next.config.ts ./portal/next.config.ts

# Shared runtime dependencies
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages/types/dist ./packages/types/dist
COPY --from=builder /app/packages/api-client/dist ./packages/api-client/dist

EXPOSE 3003
CMD ["node", "dist/main.js"]
