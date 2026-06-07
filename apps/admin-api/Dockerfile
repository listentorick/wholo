FROM node:20-alpine AS base
RUN corepack enable && corepack prepare pnpm@9 --activate

FROM base AS builder
WORKDIR /app
COPY .npmrc pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY packages/types/package.json ./packages/types/
COPY apps/admin-api/package.json ./apps/admin-api/
RUN pnpm install --frozen-lockfile
COPY packages/types ./packages/types
COPY apps/admin-api ./apps/admin-api
RUN pnpm --filter @wholo/types build
WORKDIR /app/apps/admin-api
RUN npx prisma generate
WORKDIR /app
RUN pnpm --filter @wholo/admin-api build

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages/types/dist ./packages/types/dist
COPY --from=builder /app/apps/admin-api/dist ./dist
COPY --from=builder /app/apps/admin-api/package.json ./package.json
EXPOSE 3002
CMD ["node", "dist/main.js"]
