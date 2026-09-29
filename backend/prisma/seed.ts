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
    features: [
      'Verificación de credenciales gratuita',
      'Insignia de verificado (gris)',
      'Nombre',
      'Especialidad',
      'Ubicación (municipio)',
    ],
  },
  {
    tier: 'PROFESSIONAL' as const,
    name: 'Profesional',
    description: 'Perfil completo y agenda en línea para recibir pacientes.',
    priceUsd: 3.99,
    billingCycle: 'MONTHLY' as const,
    maxLocations: 1,
    postsLimit: 0,
    features: [
      'Insignia de verificado (azul)',
      'Foto de perfil',
      'Biografía',
      'Especialidades',
      'Botón de WhatsApp',
      'Dirección de consulta',
      'SEO del perfil',
      'Documentos y avales visibles',
      'Estadísticas básicas',
      'Agenda y citas en línea',
    ],
  },
  {
    tier: 'PROFESSIONAL_PLUS' as const,
    name: 'Profesional Plus',
    description: 'Para profesionales que quieren crecer su presencia y captar más pacientes.',
    priceUsd: 5.99,
    billingCycle: 'MONTHLY' as const,
    maxLocations: 3,
    postsLimit: 5,
    features: [
      'Todo lo del plan Profesional',
      'Publicaciones (hasta 5 activas)',
      'Estadísticas completas',
      'Formulario de mensajes de pacientes',
      'Varias sedes de consulta (hasta 3)',
      'Mayor visibilidad en el directorio',
    ],
  },
  {
    tier: 'PREMIUM' as const,
    name: 'Premium',
    description: 'Máxima visibilidad y herramientas de crecimiento para tu consulta.',
    priceUsd: 10.99,
    billingCycle: 'MONTHLY' as const,
    maxLocations: 5,
    postsLimit: null,
    features: [
      'Todo lo del plan Profesional Plus',
      'Insignia de verificado (dorada)',
      'Espacio «Destacado» rotativo en el directorio (señalado como patrocinado)',
      'Publicaciones ilimitadas',
      'Analítica avanzada',
      'Espacio para publicidad y promociones',
    ],
  },
  {
    tier: 'AGENCY' as const,
    name: 'Agencia',
    description: 'Todo lo de Premium más tu presentación en video, producida junto a Guía Médica Monagas.',
    priceUsd: 69.99,
    billingCycle: 'MONTHLY' as const,
    maxLocations: 5,
    postsLimit: null,
    features: [
      'Todo lo del plan Premium',
      '2 videos en colaboración con Guía Médica Monagas',
      'Video de presentación de YouTube en tu ficha',
      'Insignia de verificado dorada',
      'Prioridad en el espacio «Destacado» (señalado como patrocinado)',
    ],
  },
  {
    tier: 'ORGANIZATION' as const,
    name: 'Farmacia / Laboratorio / Clínica',
    description: 'Autogestión completa para farmacias, laboratorios y clínicas verificadas.',
    priceUsd: 40,
    billingCycle: 'MONTHLY' as const,
    maxLocations: 4,
    postsLimit: null,
    features: [
      'Verificación y perfil básico gratuitos',
      'Hasta 4 sedes con contacto propio',
      'Redes sociales y web',
      'Servicios, aseguradoras y métodos de pago',
      'Médicos asociados (con aceptación del médico)',
      'Estadísticas del perfil',
    ],
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

  // Solo crea los planes que falten. Cada despliegue corre este seed: si
  // actualizara, pisaría lo que la administración editó en /admin/planes
  // (precio, textos, plan desactivado). Los cambios de catálogo que vienen
  // con el código van en una migración (ej. 20260929220100).
  console.log('Sembrando catálogo de planes...');
  for (const plan of PLANS) {
    await prisma.subscriptionPlan.upsert({
      where: { tier: plan.tier },
      update: {},
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
    create: { key: 'exchange_rate', value: { usdToBs: 0, source: 'MANUAL', updatedAt: new Date(0).toISOString() } },
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
