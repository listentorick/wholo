FROM node:20-alpine AS base
RUN corepack enable && corepack prepare pnpm@9 --activate

FROM base AS builder
WORKDIR /app
# Install deps first (better layer caching)
COPY .npmrc pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY packages/types/package.json ./packages/types/
COPY packages/api-client/package.json ./packages/api-client/
COPY apps/portal/package.json ./apps/portal/
RUN pnpm install --frozen-lockfile
# Build
COPY packages/types ./packages/types
COPY packages/api-client ./packages/api-client
COPY apps/portal ./apps/portal
ENV NEXT_TELEMETRY_DISABLED=1
# NEXT_PUBLIC_* vars must be present at build time to be embedded in the browser bundle
ARG NEXT_PUBLIC_API_URL=http://localhost:3003
ARG NEXT_PUBLIC_KEYCLOAK_URL=http://localhost:8080
ARG NEXT_PUBLIC_KEYCLOAK_REALM=wholo
ARG NEXT_PUBLIC_KEYCLOAK_CLIENT_ID=wholo-portal
ENV NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL}
ENV NEXT_PUBLIC_KEYCLOAK_URL=${NEXT_PUBLIC_KEYCLOAK_URL}
ENV NEXT_PUBLIC_KEYCLOAK_REALM=${NEXT_PUBLIC_KEYCLOAK_REALM}
ENV NEXT_PUBLIC_KEYCLOAK_CLIENT_ID=${NEXT_PUBLIC_KEYCLOAK_CLIENT_ID}
RUN pnpm --filter @wholo/portal build

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=builder /app/apps/portal/.next/standalone ./
COPY --from=builder /app/apps/portal/.next/static ./apps/portal/.next/static
COPY --from=builder /app/apps/portal/public ./apps/portal/public
EXPOSE 3000
CMD ["node", "apps/portal/server.js"]
