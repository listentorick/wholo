FROM node:20-alpine AS base
RUN corepack enable && corepack prepare pnpm@9 --activate

FROM base AS builder
WORKDIR /app
COPY .npmrc pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY packages/types/package.json ./packages/types/
COPY apps/portal-api/package.json ./apps/portal-api/
RUN pnpm install --frozen-lockfile
COPY packages/types ./packages/types
COPY apps/portal-api ./apps/portal-api
RUN pnpm --filter @wholo/types build
RUN pnpm --filter @wholo/portal-api build

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages/types/dist ./packages/types/dist
COPY --from=builder /app/apps/portal-api/dist ./dist
COPY --from=builder /app/apps/portal-api/package.json ./package.json
EXPOSE 3003
CMD ["node", "dist/main.js"]
