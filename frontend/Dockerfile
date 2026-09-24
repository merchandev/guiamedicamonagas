FROM node:24.21.0-alpine3.24 AS builder

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts

COPY . .
ARG NEXT_PUBLIC_API_URL
ARG NEXT_PUBLIC_SITE_URL
ARG NEXT_BUILD_CPUS=1
ENV NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL}
ENV NEXT_PUBLIC_SITE_URL=${NEXT_PUBLIC_SITE_URL}
ENV NEXT_BUILD_CPUS=${NEXT_BUILD_CPUS}
RUN npm run build

# ---------------------------------------------------------------------------
# Runtime — imagen mínima, usuario sin privilegios
# ---------------------------------------------------------------------------
FROM node:24.21.0-alpine3.24 AS runtime

# Parches de Alpine posteriores a la imagen base y fuera npm/yarn/corepack
# (el servidor standalone de Next no los usa y solo suman CVE).
RUN apk upgrade --no-cache \
 && apk add --no-cache dumb-init \
 && rm -rf /usr/local/lib/node_modules/npm /usr/local/lib/node_modules/corepack \
           /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack \
           /opt/yarn-* /usr/local/bin/yarn /usr/local/bin/yarnpkg

WORKDIR /app
ENV NODE_ENV=production
ENV HOSTNAME="0.0.0.0"

# Next.js standalone output: incluye solo lo necesario para producción
COPY --from=builder --chown=node:node /app/.next/standalone ./
COPY --from=builder --chown=node:node /app/.next/static ./.next/static
COPY --from=builder --chown=node:node /app/public ./public

# ISR and image optimization must remain writable for the runtime user.
RUN mkdir -p .next/cache && chown -R node:node .next

# Cambiar a usuario sin privilegios
USER node

EXPOSE 3000

ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "server.js"]
