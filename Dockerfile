# syntax=docker/dockerfile:1

# ---- build: full install + TypeScript compile ------------------------------
FROM node:22-bookworm-slim AS build
WORKDIR /app

# Prisma needs OpenSSL to detect its engine target at `prisma generate`.
RUN apt-get update && apt-get install -y --no-install-recommends openssl \
  && rm -rf /var/lib/apt/lists/*

# The schema must be present before `npm ci`: the postinstall hook runs
# `prisma generate`.
COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN npm ci

COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# ---- runtime: production dependencies + compiled output only ---------------
FROM node:22-bookworm-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends openssl \
  && rm -rf /var/lib/apt/lists/*

# `prisma` is a runtime dependency on purpose: it provides both the client
# generation at install time and `prisma migrate deploy` for releases.
COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN npm ci --omit=dev && npm cache clean --force

COPY --from=build /app/dist ./dist

USER node
EXPOSE 3000

# /health answers 503 while the instance drains, so orchestrators and load
# balancers stop routing to it before the process exits.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

# Exec form: node is PID 1 and receives SIGTERM directly, which the app
# handles (see src/shared/infrastructure/gracefulShutdown.ts).
CMD ["node", "dist/app.js"]
