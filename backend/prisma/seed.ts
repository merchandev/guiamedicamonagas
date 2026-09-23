import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { hashPassword } from '../src/common/utils/password.util';

const prisma = new PrismaClient({ adapter: new PrismaPg(process.env.DATABASE_URL!) });

const SPECIALTIES = [
  'Medicina General',
  'Pediatría',
  'Ginecología y Obstetricia',
  'Cardiología',
  'Dermatología',
  'Traumatología',
  'Medicina Interna',
  'Cirugía General',
  'Oftalmología',
  'Otorrinolaringología',
  'Psiquiatría',
  'Endocrinología',
  'Urología',
  'Neurología',
  'Gastroenterología',
  'Nefrología',
  'Oncología',
  'Odontología',
];

const PLANS = [
  {
    tier: 'FREE' as const,
    name: 'Perfil Básico',
    description: 'Registro gratuito con presencia mínima en el directorio.',
    priceUsd: 0,
    billingCycle: 'MONTHLY' as const,
    maxLocations: 1,
    postsLimit: 0,
    features: ['Nombre', 'Especialidad', 'Ubicación (municipio)'],
  },
  {
    tier: 'PROFESSIONAL' as const,
    name: 'Profesional',
    description: 'Perfil verificado y completo para recibir pacientes.',
    priceUsd: 10,
    billingCycle: 'MONTHLY' as const,
    maxLocations: 1,
    postsLimit: 0,
    features: [
      'Perfil verificado',
      'Foto de perfil',
      'Biografía',
      'Especialidades',
      'Botón de WhatsApp',
      'Dirección de consulta',
      'SEO del perfil',
      'Documentos y avales visibles',
      'Estadísticas básicas',
    ],
  },
  {
    tier: 'PROFESSIONAL_PLUS' as const,
    name: 'Profesional Plus',
    description: 'Para profesionales que quieren crecer su presencia y captar más pacientes.',
    priceUsd: 15,
    billingCycle: 'MONTHLY' as const,
    maxLocations: 3,
    postsLimit: 5,
    features: [
      'Todo lo del plan Profesional',
      'Publicaciones (hasta 5 activas)',
      'Estadísticas completas',
      'Formulario de mensajes de pacientes',
      'Varias sedes de consulta (hasta 3)',
      'Prioridad moderada en el directorio',
    ],
  },
  {
    tier: 'PREMIUM' as const,
    name: 'Premium',
    description: 'Máxima visibilidad y herramientas de crecimiento para tu consulta.',
    priceUsd: 25,
    billingCycle: 'MONTHLY' as const,
    maxLocations: 5,
    postsLimit: null,
    features: [
      'Todo lo del plan Profesional Plus',
      'Perfil destacado',
      'Mayor posicionamiento en el directorio',
      'Publicaciones ilimitadas',
      'Analítica avanzada',
      'Espacio para publicidad y promociones',
      'Prioridad máxima',
    ],
  },
  {
    tier: 'ORGANIZATION' as const,
    name: 'Farmacia / Laboratorio / Clínica',
    description: 'Presencia verificada en el directorio para organizaciones de salud.',
    priceUsd: 40,
    billingCycle: 'MONTHLY' as const,
    maxLocations: 4,
    postsLimit: null,
    features: ['Perfil de organización verificado', 'Hasta 4 sedes', 'Datos de contacto por sede'],
  },
];

function slugify(input: string): string {
  return input
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

async function main() {
  console.log('Sembrando especialidades...');
  for (const name of SPECIALTIES) {
    await prisma.specialty.upsert({
      where: { slug: slugify(name) },
      update: {},
      create: { name, slug: slugify(name) },
    });
  }

  console.log('Sembrando catálogo de planes...');
  for (const plan of PLANS) {
    await prisma.subscriptionPlan.upsert({
      where: { tier: plan.tier },
      update: {
        name: plan.name,
        description: plan.description,
        priceUsd: plan.priceUsd,
        billingCycle: plan.billingCycle,
        maxLocations: plan.maxLocations,
        postsLimit: plan.postsLimit,
        features: plan.features,
        isActive: true,
      },
      create: {
        tier: plan.tier,
        name: plan.name,
        description: plan.description,
        priceUsd: plan.priceUsd,
        billingCycle: plan.billingCycle,
        maxLocations: plan.maxLocations,
        postsLimit: plan.postsLimit,
        features: plan.features,
      },
    });
  }

  console.log('Sembrando tasa de cambio USD→Bs por defecto...');
  await prisma.siteSettings.upsert({
    where: { key: 'exchange_rate' },
    update: {},
    create: { key: 'exchange_rate', value: { usdToBs: 50, updatedAt: new Date().toISOString() } },
  });

  const superadminEmail = process.env.SEED_SUPERADMIN_EMAIL ?? 'admin@guiamedicamonagas.com';
  const superadminPassword = process.env.SEED_SUPERADMIN_PASSWORD;

  if (!superadminPassword) {
    if (process.env.NODE_ENV === 'production') {
      // En producción, un seed "exitoso" sin superadmin deja el sitio sin
      // nadie que pueda administrar nada — mejor fallar fuerte que seguir
      // en silencio como antes.
      throw new Error(
        'SEED_SUPERADMIN_PASSWORD no está definida. En producción es obligatoria: ' +
          'define SEED_SUPERADMIN_EMAIL y SEED_SUPERADMIN_PASSWORD en .env.prod antes de sembrar.',
      );
    }
    console.log('SEED_SUPERADMIN_PASSWORD no definida: se omite la creación del superadmin.');
  } else {
    console.log(`Sembrando superadmin (${superadminEmail})...`);
    const passwordHash = await hashPassword(superadminPassword);
    await prisma.user.upsert({
      where: { email: superadminEmail },
      update: {},
      create: {
        email: superadminEmail,
        passwordHash,
        role: 'SUPERADMIN',
        isEmailVerified: true,
      },
    });
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
