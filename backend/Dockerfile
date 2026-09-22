FROM node:24.9-alpine AS builder

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts

COPY . .
RUN DATABASE_URL="postgresql://placeholder:placeholder@localhost:5432/placeholder" \
    npx prisma generate
RUN npm run build

# ---------------------------------------------------------------------------
# Runtime — imagen mínima, usuario sin privilegios
# ---------------------------------------------------------------------------
FROM node:24.9-alpine AS runtime

# Instalar dumb-init para señales correctas en contenedores
RUN apk add --no-cache dumb-init

WORKDIR /app
ENV NODE_ENV=production

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/prisma.config.ts ./prisma.config.ts

# Cambiar a usuario sin privilegios (ya incluido en node:alpine)
USER node

EXPOSE 4000

# dumb-init garantiza que las señales SIGTERM/SIGINT lleguen al proceso node
ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "dist/main"]
