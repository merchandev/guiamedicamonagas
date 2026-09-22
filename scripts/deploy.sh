#!/bin/bash
# Despliegue en VPS para Guía Médica Monagas

echo "🚀 Iniciando despliegue de Guía Médica Monagas..."

# Cargar variables de entorno
if [ -f .env ]; then
  export $(cat .env | xargs)
else
  echo "⚠️ Archivo .env no encontrado. Copiando .env.example a .env..."
  cp .env.example .env
  export $(cat .env | xargs)
fi

echo "📦 Actualizando contenedores (perfil: prod)..."
docker compose --profile prod pull
docker compose --profile prod up -d --build

echo "🔄 Ejecutando migraciones de base de datos..."
docker compose --profile prod exec -T api npx prisma migrate deploy

echo "✅ Despliegue completado. Verifica los logs con 'docker compose logs -f'"
