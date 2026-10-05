# syntax=docker/dockerfile:1.7
# Scrum Manager API imajı (NestJS). Çok aşamalı: derleme → yalnız üretim bağımlılıkları → küçük çalışma imajı.
# Derleme bağlamı depo köküdür: docker build -f docker/api.Dockerfile .

ARG NODE_VERSION=24-alpine

# ---------- 1) Derleme ----------
FROM node:${NODE_VERSION} AS build
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH CI=true
RUN corepack enable
WORKDIR /repo

# Önce yalnızca manifestler: bağımlılık katmanı kod değişince yeniden indirilmez.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY packages/shared/package.json packages/shared/
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile --filter @scrum/api... --filter @scrum/shared

COPY tsconfig.base.json ./
COPY packages/shared packages/shared
COPY apps/api apps/api
RUN pnpm --filter @scrum/shared build \
 && pnpm --filter @scrum/api exec prisma generate \
 && pnpm --filter @scrum/api build

# Üretim bağımlılıklarıyla bağımsız klasör (workspace paketi @scrum/shared dahil).
# auto-install-peers kapalı: @prisma/client'ın isteğe bağlı eşi olan Prisma CLI/Studio (~250 MB) çalışma imajına girmez.
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm --filter @scrum/api deploy --prod --legacy --config.auto-install-peers=false /out
# Budama (~140 MB → ~55 MB): yalnızca PostgreSQL sorgu derleyicisi kalır; kaynak haritası, tip ve belge dosyaları atılır.
RUN cd /out \
 && find -L node_modules -path '*@prisma/client/runtime/*' \
      \( -name '*sqlserver*' -o -name '*cockroachdb*' -o -name '*mysql*' -o -name '*sqlite*' \) -type f -delete \
 && find -L node_modules dist -type f \
      \( -name '*.map' -o -name '*.d.ts' -o -name '*.d.mts' -o -name '*.d.cts' -o -name '*.md' \) -delete

# ---------- 2) Göç (migration) aracı: yalnızca Prisma CLI ----------
FROM node:${NODE_VERSION} AS migrate
WORKDIR /app
RUN npm install --omit=dev --no-audit --no-fund prisma@7.10.0 dotenv@18 \
 && npm cache clean --force
COPY apps/api/prisma ./prisma
COPY apps/api/prisma.config.ts ./
USER node
CMD ["npx", "prisma", "migrate", "deploy"]

# ---------- 3) Çalışma imajı ----------
FROM node:${NODE_VERSION} AS runtime
ENV NODE_ENV=production PORT=3000 UPLOAD_DIR=/data/uploads
WORKDIR /app
COPY --from=build --chown=node:node /out/package.json ./
COPY --from=build --chown=node:node /out/node_modules ./node_modules
COPY --from=build --chown=node:node /out/dist ./dist
RUN mkdir -p /data/uploads && chown -R node:node /data
USER node
EXPOSE 3000
HEALTHCHECK --interval=15s --timeout=5s --start-period=30s --retries=5 \
  CMD wget -qO- http://127.0.0.1:3000/api/health >/dev/null || exit 1
CMD ["node", "dist/main.js"]
