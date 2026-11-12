# Stocdup help site (apps/help, ADR-080): Docusaurus static build served by nginx.
# Content comes from documentation/docs (written by the scenario-docs skill).
# Build context is the monorepo root.

FROM node:20-alpine AS builder
RUN corepack enable && corepack prepare pnpm@9 --activate
WORKDIR /app

# Install deps first (better layer caching). help has no @wholo/* workspace deps.
COPY .npmrc pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY apps/help/package.json ./apps/help/
RUN pnpm install --frozen-lockfile --filter @wholo/help

COPY apps/help ./apps/help
COPY documentation/docs ./documentation/docs
ENV DOCUSAURUS_TELEMETRY_DISABLED=1
# Canonical site URL baked into the build (sitemap, canonical links). CI passes
# https://help.stocdup.com; local :local builds keep the localhost default.
ARG HELP_SITE_URL=
ENV HELP_SITE_URL=${HELP_SITE_URL}
RUN pnpm --filter @wholo/help build

FROM nginxinc/nginx-unprivileged:1.28-alpine AS runner
COPY apps/help/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=builder /app/apps/help/build /usr/share/nginx/html
EXPOSE 3060
