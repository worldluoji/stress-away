# ============================================
# Multi-stage Dockerfile for stress-away (Next.js 16)
# Base: node:22-alpine | pnpm via Corepack
# ============================================

# ---------- Stage 1: deps (install + native build) ----------
FROM node:22-alpine AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
RUN pnpm install --frozen-lockfile

# ---------- Stage 2: builder (compile Next.js) ----------
FROM node:22-alpine AS builder
RUN apk add --no-cache libc6-compat
WORKDIR /app
RUN corepack enable
ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production

ARG NEXT_PUBLIC_TCB_ENV_ID
ARG NEXT_PUBLIC_TCB_ACCESS_KEY

ENV NEXT_PUBLIC_TCB_ENV_ID=${NEXT_PUBLIC_TCB_ENV_ID} \
    NEXT_PUBLIC_TCB_ACCESS_KEY=${NEXT_PUBLIC_TCB_ACCESS_KEY}

COPY --from=deps /app/node_modules ./node_modules
# .env.production is brought in by `COPY . .` below; it must exist at the
# project root so Next.js can inline all NEXT_PUBLIC_* into the client bundle.
# It is NOT copied to the runner stage (see rm below).
COPY . .
RUN pnpm build

# ---------- Stage 3: runner (minimal runtime image) ----------
FROM node:22-alpine AS runner
WORKDIR /app
RUN apk add --no-cache wget \
    && addgroup --system --gid 1001 nodejs \
    && adduser --system --uid 1001 nextjs
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
# Next.js 16 standalone mode auto-copies .env.production into .next/standalone/.
# Remove it from the final image: NEXT_PUBLIC_* are already baked into the
# client bundle by `pnpm build`, and runtime secrets must be passed via
# `docker run --env-file` instead.
RUN rm -f ./.env.production
USER nextjs
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
    CMD wget --quiet --tries=1 --spider http://127.0.0.1:3000/ || exit 1
CMD ["node", "server.js"]
