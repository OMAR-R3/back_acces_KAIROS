# ============================================================
# Dockerfile - Backend Kairos (Next.js 15 API)
# Colocar este archivo en la raíz del repo del backend
# renombrado simplemente como "Dockerfile"
# ============================================================

# ---- Etapa 1: Dependencias ----
FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# ---- Etapa 2: Build ----
FROM node:20-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Variables necesarias en build time (si tu código las usa durante el build,
# por ejemplo en app router con generación estática). Si solo se usan en
# runtime, no hace falta declararlas aquí.
# ARG SUPABASE_URL
# ARG SUPABASE_ANON_KEY
# ENV SUPABASE_URL=$SUPABASE_URL
# ENV SUPABASE_ANON_KEY=$SUPABASE_ANON_KEY

RUN npm run build

# ---- Etapa 3: Imagen final (runtime) ----
FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

# Usuario no root por seguridad
RUN addgroup --system --gid 1001 nodejs \
    && adduser --system --uid 1001 nextjs

COPY --from=builder /app/.next ./.next
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json

RUN mkdir -p /app/storage/documents && chown -R nextjs:nodejs /app/storage

USER nextjs

EXPOSE 3000

CMD ["npm", "start"]
