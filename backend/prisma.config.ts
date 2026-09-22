import { existsSync } from 'fs';
import { join } from 'path';
import { defineConfig, env } from 'prisma/config';

// Prisma 7 ya no carga `.env` automáticamente al leer este archivo
// (`dotenv: false` en su loader de config), así que hay que cargarlo a mano.
const envPath = join(__dirname, '.env');
if (existsSync(envPath)) {
  process.loadEnvFile(envPath);
}

export default defineConfig({
  schema: 'prisma/schema.prisma',
  datasource: {
    url: env('DATABASE_URL'),
  },
  migrations: {
    seed: 'ts-node prisma/seed.ts',
  },
});
