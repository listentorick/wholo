FROM node:20-alpine AS base
RUN corepack enable && corepack prepare pnpm@9 --activate

FROM base AS builder
WORKDIR /app
# Install deps first (better layer caching)
COPY .npmrc pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY packages/types/package.json ./packages/types/
COPY packages/nest-telemetry/package.json ./packages/nest-telemetry/
COPY apps/api/package.json ./apps/api/
RUN pnpm install --frozen-lockfile
# Build
COPY packages/types ./packages/types
COPY packages/nest-telemetry ./packages/nest-telemetry
COPY apps/api ./apps/api
RUN pnpm --filter @wholo/types build
RUN pnpm --filter @wholo/nest-telemetry build
WORKDIR /app/apps/api
RUN npx prisma generate
WORKDIR /app
RUN pnpm --filter @wholo/api build

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages/types/dist ./packages/types/dist
COPY --from=builder /app/packages/types/package.json ./packages/types/package.json
# pnpm workspace link isn't copied with root node_modules; @wholo/types is imported at runtime
RUN mkdir -p node_modules/@wholo && ln -sfn ../../packages/types node_modules/@wholo/types
# @wholo/nest-telemetry has runtime exports (unlike the type-only @wholo/types),
# so it must resolve from node_modules at runtime — pnpm's hoisted linker only
# symlinks it into apps/<app>/node_modules, which the runner stage does not copy.
COPY --from=builder /app/packages/nest-telemetry/package.json ./node_modules/@wholo/nest-telemetry/package.json
COPY --from=builder /app/packages/nest-telemetry/dist ./node_modules/@wholo/nest-telemetry/dist
COPY --from=builder /app/apps/api/dist ./dist
COPY --from=builder /app/apps/api/prisma ./prisma
COPY --from=builder /app/apps/api/package.json ./package.json
EXPOSE 3001
CMD ["node", "dist/main.js"]
