FROM node:20-alpine AS base
RUN corepack enable && corepack prepare pnpm@9 --activate

FROM base AS builder
WORKDIR /app
COPY .npmrc pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY packages/types/package.json ./packages/types/
COPY packages/admin-api-client/package.json ./packages/admin-api-client/
COPY apps/admin/package.json ./apps/admin/
RUN pnpm install --frozen-lockfile
COPY packages/types ./packages/types
COPY packages/admin-api-client ./packages/admin-api-client
COPY apps/admin ./apps/admin
ENV NEXT_TELEMETRY_DISABLED=1
RUN pnpm --filter @wholo/admin build

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=builder /app/apps/admin/.next/standalone ./
COPY --from=builder /app/apps/admin/.next/static ./apps/admin/.next/static
COPY --from=builder /app/apps/admin/public ./apps/admin/public
EXPOSE 3020
CMD ["node", "apps/admin/server.js"]
