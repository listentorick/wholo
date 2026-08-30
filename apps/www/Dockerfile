# Stocdup marketing site (apps/www) — standalone Next.js server.
# Unlike portal/admin/driver, this app has no NestJS BFF wrapper; it ships as
# its own container using Next's `output: 'standalone'`.
# Build context is the monorepo root.

FROM node:20-alpine AS base
RUN corepack enable && corepack prepare pnpm@9 --activate

FROM base AS builder
WORKDIR /app

# Install deps first (better layer caching). www has no @wholo/* workspace deps.
COPY .npmrc pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY apps/www/package.json ./apps/www/
RUN pnpm install --frozen-lockfile

# Build
COPY apps/www ./apps/www
ENV NEXT_TELEMETRY_DISABLED=1
# Baked into the static build: whether to load the (proxied) Plausible script,
# and which hero A/B variants are live. Empty in local :local builds.
ARG PLAUSIBLE_ENABLED=
ARG PLAUSIBLE_DOMAIN=stocdup.com
ARG EXPERIMENT_HERO_VARIANTS=
ENV PLAUSIBLE_ENABLED=${PLAUSIBLE_ENABLED}
ENV PLAUSIBLE_DOMAIN=${PLAUSIBLE_DOMAIN}
ENV EXPERIMENT_HERO_VARIANTS=${EXPERIMENT_HERO_VARIANTS}
RUN pnpm --filter @wholo/www build

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3040
ENV HOSTNAME=0.0.0.0

RUN addgroup -g 1001 -S nodejs && adduser -S nextjs -u 1001

# Standalone output preserves the monorepo layout: server.js lives at apps/www/.
COPY --from=builder --chown=nextjs:nodejs /app/apps/www/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/apps/www/.next/static ./apps/www/.next/static
COPY --from=builder --chown=nextjs:nodejs /app/apps/www/public ./apps/www/public

USER nextjs
EXPOSE 3040
CMD ["node", "apps/www/server.js"]
