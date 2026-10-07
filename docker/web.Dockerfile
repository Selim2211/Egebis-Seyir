# syntax=docker/dockerfile:1.7
# Egebis Seyir web imajı: React uygulaması derlenir, Caddy ile sunulur (statik dosya + /api ters vekil + HTTPS).
# Derleme bağlamı depo köküdür: docker build -f docker/web.Dockerfile .

ARG NODE_VERSION=24-alpine

FROM node:${NODE_VERSION} AS build
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH CI=true
RUN corepack enable
WORKDIR /repo

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY packages/shared/package.json packages/shared/
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile --filter @scrum/web... --filter @scrum/shared

COPY tsconfig.base.json ./
COPY packages/shared packages/shared
COPY apps/web apps/web
RUN pnpm --filter @scrum/shared build && pnpm --filter @scrum/web build

FROM caddy:2-alpine AS runtime
COPY docker/Caddyfile /etc/caddy/Caddyfile
COPY --from=build /repo/apps/web/dist /srv
EXPOSE 80
