# syntax=docker/dockerfile:1.7
#
# EduAttend — production image.
#
#   docker build --target web   -t eduattend-web .     # the website/API (Next.js standalone server)
#   docker build --target tools -t eduattend-tools .   # migrations, seed and the background worker
#
# See docs/deployment.md. Debian (glibc) base for the native argon2 password hashing module.

FROM node:22-bookworm-slim AS base
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1 NPM_CONFIG_UPDATE_NOTIFIER=false

# ── Dependencies (cached until package*.json or the Prisma schema change) ──
FROM base AS deps
COPY package.json package-lock.json prisma.config.ts ./
COPY prisma ./prisma
# `prisma generate` runs on postinstall; it never connects, but the config requires a URL.
ENV DATABASE_URL="postgresql://build:build@localhost:5432/build"
RUN npm ci --no-audit --no-fund

# ── Build ──
FROM deps AS build
COPY . .
# Build-time placeholders only: real values are read from the environment at runtime.
ENV AUTH_SECRET="build-time-placeholder-never-used-at-runtime" \
    APP_URL="http://localhost:3000" \
    NODE_ENV=production
ARG APP_VERSION=dev
ENV APP_VERSION=${APP_VERSION}
RUN npm run build

# ── Web: minimal runtime with only the traced files ──
FROM base AS web
ENV NODE_ENV=production PORT=3000 HOSTNAME=0.0.0.0
ARG APP_VERSION=dev
ENV APP_VERSION=${APP_VERSION}
COPY --from=build --chown=node:node /app/.next/standalone ./
COPY --from=build --chown=node:node /app/.next/static ./.next/static
COPY --from=build --chown=node:node /app/public ./public
# Local file storage (mount a volume here, or use STORAGE_PROVIDER=s3).
RUN mkdir -p /app/storage && chown node:node /app/storage
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "server.js"]

# ── Tools: full toolchain for `prisma migrate deploy`, seeding and the job worker ──
FROM build AS tools
ENV NODE_ENV=production
RUN mkdir -p /app/storage && chown -R node:node /app/storage
USER node
CMD ["npm", "run", "jobs:worker"]
