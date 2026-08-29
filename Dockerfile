# Taşıtsan — self-host (VPS) üretim imajı.
# Lovable Cloud dağıtımını etkilemez; yalnız `docker build` ile kullanılır.

# ---- 1) Bağımlılıklar ----
FROM oven/bun:1 AS deps
WORKDIR /app
COPY package.json bun.lock* bunfig.toml* ./
RUN bun install --frozen-lockfile || bun install

# ---- 2) Build ----
FROM oven/bun:1 AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# VITE_* değişkenleri build sırasında client bundle'a gömülür.
ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_PUBLISHABLE_KEY
ARG VITE_SUPABASE_PROJECT_ID
ENV VITE_SUPABASE_URL=$VITE_SUPABASE_URL \
    VITE_SUPABASE_PUBLISHABLE_KEY=$VITE_SUPABASE_PUBLISHABLE_KEY \
    VITE_SUPABASE_PROJECT_ID=$VITE_SUPABASE_PROJECT_ID \
    VITE_SELFHOST=true \
    NODE_ENV=production
# NOT: self-host'ta MUTLAKA build:selfhost kullanılır. `bun run build`
# Lovable Cloud (Cloudflare) config'i ile çalışır ve .output/public üretmez.
RUN bun run build:selfhost

# ---- 3) Çalıştırma ----
FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production \
    PORT=3000 \
    HOST=0.0.0.0
COPY --from=build /app/.output ./.output
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/public/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", ".output/server/index.mjs"]
