FROM node:24.9-alpine AS builder

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts

COPY . .
ARG NEXT_PUBLIC_API_URL
ARG NEXT_PUBLIC_SITE_URL
ENV NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL}
ENV NEXT_PUBLIC_SITE_URL=${NEXT_PUBLIC_SITE_URL}
RUN npm run build

# ---------------------------------------------------------------------------
# Runtime — imagen mínima, usuario sin privilegios
# ---------------------------------------------------------------------------
FROM node:24.9-alpine AS runtime

RUN apk add --no-cache dumb-init

WORKDIR /app
ENV NODE_ENV=production
ENV HOSTNAME="0.0.0.0"

# Next.js standalone output: incluye solo lo necesario para producción
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public

# Cambiar a usuario sin privilegios
USER node

EXPOSE 3000

ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "server.js"]
