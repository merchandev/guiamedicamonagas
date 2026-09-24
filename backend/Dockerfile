FROM node:24.21.0-alpine3.24 AS builder

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts

COPY . .
RUN DATABASE_URL="postgresql://placeholder:placeholder@localhost:5432/placeholder" \
    npx prisma generate
RUN npm run build
# Solo dependencias de producción en la imagen final (vitest, TypeScript, la CLI
# de Nest, etc. se quedan en esta etapa). La CLI de Prisma es dependencia de
# producción porque el contenedor aplica las migraciones; se regenera el cliente
# por si el prune tocara node_modules/.prisma.
RUN npm prune --omit=dev --ignore-scripts \
 && DATABASE_URL="postgresql://placeholder:placeholder@localhost:5432/placeholder" \
    node_modules/.bin/prisma generate

# ---------------------------------------------------------------------------
# Runtime — imagen mínima, usuario sin privilegios
# ---------------------------------------------------------------------------
FROM node:24.21.0-alpine3.24 AS runtime

# Parches de seguridad de Alpine publicados después de la imagen base (OpenSSL,
# musl…), dumb-init para las señales, y fuera npm/yarn/corepack: la API no
# instala paquetes en tiempo de ejecución y sus dependencias (tar, etc.) solo
# suman CVE. Las migraciones usan node_modules/.bin/prisma, no npx.
RUN apk upgrade --no-cache \
 && apk add --no-cache dumb-init \
 && rm -rf /usr/local/lib/node_modules/npm /usr/local/lib/node_modules/corepack \
           /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack \
           /opt/yarn-* /usr/local/bin/yarn /usr/local/bin/yarnpkg

WORKDIR /app
ENV NODE_ENV=production

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/prisma.config.ts ./prisma.config.ts
COPY --from=builder /app/tsconfig.json ./tsconfig.json
COPY --from=builder /app/certs ./certs
# El seed comparte el algoritmo de contraseñas con la API.
COPY --from=builder /app/src/common/utils/password.util.ts ./src/common/utils/password.util.ts

# Cambiar a usuario sin privilegios (ya incluido en node:alpine)
USER node

EXPOSE 4000

# dumb-init garantiza que las señales SIGTERM/SIGINT lleguen al proceso node
ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "dist/src/main.js"]
