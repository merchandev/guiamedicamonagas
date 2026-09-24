import Link from 'next/link';
import { serverGet } from '@/lib/server-fetch';
import { Organization, PaginatedResult, ProfessionalListItem, Specialty } from '@/lib/types';
import { Badge } from '@/components/ui/Badge';
import { DoctorCard } from '@/components/DoctorCard';
import { HeroSearch } from '@/components/HeroSearch';
import { FaqAccordion } from '@/components/FaqAccordion';
import { Reveal, RevealGroup, RevealItem } from '@/components/motion/Reveal';
import { Counter } from '@/components/motion/Counter';
import { HeroIllustration } from '@/components/illustrations/HeroIllustration';
import { WaveDivider } from '@/components/illustrations/WaveDivider';
import {
  BadgeCheckIcon,
  BuildingIcon,
  ClockIcon,
  FileCheckIcon,
  FlaskIcon,
  MapPinIcon,
  PillIcon,
  StethoscopeIcon,
  UserRoundIcon,
  WhatsAppIcon,
} from '@/components/icons';

const ORG_TYPE_META: Record<string, { label: string; icon: typeof PillIcon }> = {
  PHARMACY: { label: 'Farmacia', icon: PillIcon },
  LABORATORY: { label: 'Laboratorio', icon: FlaskIcon },
  CLINIC: { label: 'Clínica', icon: BuildingIcon },
};

const VERIFICATION_STEPS = [
  {
    title: 'Te registras',
    body: 'Creas tu cuenta profesional con tus datos y especialidades.',
    icon: UserRoundIcon,
  },
  {
    title: 'Subes tus documentos',
    body: 'Cédula, RIF, título, registro MPPS (SACS), matrícula del Colegio de Monagas y Artículo 8.',
    icon: FileCheckIcon,
  },
  {
    title: 'Revisión manual',
    body: 'Un administrador humano revisa cada documento. Ningún perfil se publica automáticamente.',
    icon: ClockIcon,
  },
  {
    title: 'Perfil público',
    body: 'Tu perfil se activa mostrando siempre tu N° MPPS y Colegio de Médicos de Monagas.',
    icon: BadgeCheckIcon,
  },
];

const FAQ_ITEMS = [
  {
    question: '¿Cómo verifican a los médicos?',
    answer:
      'Cada médico debe entregar su cédula, su RIF, su título universitario, el registro del título ante el MPPS (SACS), la matrícula del Colegio de Médicos de Monagas y la constancia del Artículo 8. Un administrador revisa cada documento manualmente antes de publicar el perfil.',
  },
  {
    question: '¿Es gratis buscar un médico en el directorio?',
    answer: 'Sí. Buscar, filtrar por especialidad o municipio y contactar a un médico verificado es completamente gratuito para pacientes.',
  },
  {
    question: '¿Cómo confío en que el médico está habilitado para ejercer?',
    answer:
      'Cada perfil verificado muestra públicamente su N° MPPS y N° del Colegio de Médicos de Monagas — la práctica estándar de transparencia médica en Venezuela. Puedes verificar estos números directamente con el Colegio de Médicos del Estado Monagas.',
  },
  {
    question: '¿Cómo se registra un médico en la guía?',
    answer:
      'Desde "Soy médico, quiero registrarme": creas tu cuenta, completas tu perfil, subes tus documentos y activas tu suscripción por Pago Móvil. Tu perfil se publica cuando un administrador aprueba todos tus documentos.',
  },
];

export default async function HomePage() {
  const [specialties, doctorsResult, organizations] = await Promise.all([
    serverGet<Specialty[]>('/specialties'),
    serverGet<PaginatedResult<ProfessionalListItem>>('/professionals?limit=6'),
    serverGet<Organization[]>('/organizations'),
  ]);

  const specialtiesList = specialties ?? [];
  const doctors = doctorsResult?.items ?? [];
  const orgsPreview = (organizations ?? []).slice(0, 3);

  const stats = [
    { value: doctorsResult?.total ?? 0, label: 'Médicos verificados', icon: StethoscopeIcon },
    { value: specialtiesList.length, label: 'Especialidades', icon: BadgeCheckIcon },
    { value: organizations?.length ?? 0, label: 'Farmacias y clínicas', icon: BuildingIcon },
    { value: 13, label: 'Municipios de Monagas', icon: MapPinIcon },
  ];

  return (
    <div className="overflow-x-clip">
      <section className="relative overflow-hidden border-b border-ink-100 bg-gradient-to-b from-pine-50/60 to-canvas">
        <div className="container-page grid gap-14 py-16 md:grid-cols-2 md:items-center md:py-24">
          <Reveal>
            <Badge tone="pine" className="mb-4">Directorio verificado del estado Monagas</Badge>
            <h1 className="text-4xl leading-tight text-ink-950 md:text-5xl">
              Encuentra un médico de confianza en Monagas
            </h1>
            <p className="mt-5 max-w-lg text-lg text-ink-600">
              Cada profesional en esta guía fue verificado contra sus avales del MPPS y el Colegio de Médicos de
              Monagas antes de aparecer aquí.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link
                href="/medicos"
                className="rounded-lg bg-pine-700 px-6 py-3 text-sm font-semibold text-white shadow-soft transition-transform hover:-translate-y-0.5 hover:bg-pine-800"
              >
                Buscar un médico
              </Link>
              <Link
                href="/registro"
                className="rounded-lg border border-ink-200 bg-white px-6 py-3 text-sm font-semibold text-ink-800 transition-transform hover:-translate-y-0.5 hover:bg-ink-50"
              >
                Soy médico, quiero registrarme
              </Link>
            </div>
          </Reveal>

          <Reveal delay={0.15}>
            <HeroIllustration />
          </Reveal>
        </div>

        <div className="container-page relative z-10 pb-14 md:pb-20">
          <Reveal delay={0.25}>
            <HeroSearch specialties={specialtiesList} />
          </Reveal>
        </div>
      </section>

      <div className="relative">
        <WaveDivider colorClassName="text-pine-800" />
        <section className="-mt-px bg-pine-800">
          <div className="container-page grid grid-cols-2 gap-6 py-10 text-center text-white sm:grid-cols-4">
            {stats.map((s) => (
              <div key={s.label} className="flex flex-col items-center">
                <s.icon className="mb-2 h-6 w-6 text-pine-200" />
                <p className="text-3xl font-bold">
                  <Counter value={s.value} suffix="+" />
                </p>
                <p className="mt-1 text-xs uppercase tracking-wide text-pine-100">{s.label}</p>
              </div>
            ))}
          </div>
        </section>
        <WaveDivider colorClassName="text-pine-800" flip />
      </div>

      <section className="container-page py-16">
        <Reveal>
          <div className="mb-8 flex items-end justify-between">
            <h2 className="text-2xl">Especialidades</h2>
            <Link href="/especialidades" className="text-sm font-medium text-pine-700 hover:underline">
              Ver todas
            </Link>
          </div>
        </Reveal>
        <RevealGroup className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
          {specialtiesList.slice(0, 8).map((s) => (
            <RevealItem key={s.id}>
              <Link
                href={`/medicos?especialidad=${s.slug}`}
                className="card group flex h-full flex-col gap-3 px-4 py-5 text-sm font-medium text-ink-800 transition-all hover:-translate-y-1 hover:shadow-card"
              >
                <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-pine-50 text-pine-700 transition-colors group-hover:bg-pine-700 group-hover:text-white">
                  <StethoscopeIcon className="h-5 w-5" />
                </span>
                <span>
                  {s.name}
                  {typeof s._count?.professionals === 'number' && (
                    <span className="mt-1 block text-xs font-normal text-ink-400">
                      {s._count.professionals} profesional{s._count.professionals === 1 ? '' : 'es'}
                    </span>
                  )}
                </span>
              </Link>
            </RevealItem>
          ))}
          {specialtiesList.length === 0 && (
            <p className="col-span-full text-sm text-ink-400">Aún no hay especialidades cargadas.</p>
          )}
        </RevealGroup>
      </section>

      {doctors.length > 0 && (
        <section className="border-t border-ink-100 bg-white py-16">
          <div className="container-page">
            <Reveal>
              <div className="mb-8 flex items-end justify-between">
                <div>
                  <h2 className="text-2xl">Médicos verificados recientemente</h2>
                  <p className="mt-1 text-sm text-ink-500">Perfiles que acaban de pasar la revisión de documentos.</p>
                </div>
                <Link href="/medicos" className="text-sm font-medium text-pine-700 hover:underline">
                  Ver directorio
                </Link>
              </div>
            </Reveal>
            <RevealGroup className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {doctors.map((doctor) => (
                <RevealItem key={doctor.id}>
                  <DoctorCard doctor={doctor} />
                </RevealItem>
              ))}
            </RevealGroup>
          </div>
        </section>
      )}

      {orgsPreview.length > 0 && (
        <section className="container-page py-16">
          <Reveal>
            <div className="mb-8 flex items-end justify-between">
              <h2 className="text-2xl">Farmacias, laboratorios y clínicas</h2>
              <Link href="/farmacias" className="text-sm font-medium text-pine-700 hover:underline">
                Ver todas
              </Link>
            </div>
          </Reveal>
          <RevealGroup className="grid gap-4 sm:grid-cols-3">
            {orgsPreview.map((org) => {
              const meta = ORG_TYPE_META[org.type];
              return (
                <RevealItem key={org.id}>
                  <div className="card flex h-full flex-col gap-3 p-5 transition-transform hover:-translate-y-1 hover:shadow-card">
                    <div className="flex items-center justify-between">
                      <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-gold-50 text-gold-700">
                        <meta.icon className="h-5 w-5" />
                      </span>
                      <Badge tone="neutral">{meta.label}</Badge>
                    </div>
                    <h3 className="font-semibold text-ink-900">{org.name}</h3>
                    {org.locations[0] && (
                      <p className="text-sm text-ink-500">
                        {org.locations[0].address}
                        {org.locations[0].municipality ? `, ${org.locations[0].municipality}` : ''}
                      </p>
                    )}
                  </div>
                </RevealItem>
              );
            })}
          </RevealGroup>
        </section>
      )}

      <section className="border-t border-ink-100 bg-white py-16">
        <div className="container-page">
          <Reveal>
            <h2 className="mb-10 text-2xl">Cómo verificamos cada perfil</h2>
          </Reveal>
          <RevealGroup className="grid gap-8 sm:grid-cols-2 md:grid-cols-4">
            {VERIFICATION_STEPS.map((step, i) => (
              <RevealItem key={step.title} className="relative">
                <div className="flex h-11 w-11 items-center justify-center rounded-full bg-pine-700 text-white">
                  <step.icon className="h-5 w-5" />
                </div>
                <p className="mt-3 text-xs font-semibold uppercase tracking-wide text-pine-700">Paso {i + 1}</p>
                <h3 className="mt-1 text-lg font-semibold text-ink-900">{step.title}</h3>
                <p className="mt-2 text-sm text-ink-600">{step.body}</p>
              </RevealItem>
            ))}
          </RevealGroup>
        </div>
      </section>

      <div className="relative">
        <WaveDivider colorClassName="text-pine-900" />
        <section className="-mt-px bg-pine-900 py-16 text-white">
          <div className="container-page grid gap-10 md:grid-cols-2 md:items-center">
            <Reveal>
              <h2 className="text-2xl text-white">¿Eres médico en Monagas?</h2>
              <p className="mt-3 max-w-md text-pine-100">
                Aparece en el directorio con tu perfil verificado, recibe pacientes por WhatsApp y muestra tu N°
                MPPS y Colegio de Médicos de Monagas con total transparencia.
              </p>
              <Link
                href="/registro"
                className="mt-6 inline-block rounded-lg bg-white px-6 py-3 text-sm font-semibold text-pine-900 transition-transform hover:-translate-y-0.5 hover:bg-pine-50"
              >
                Registrar mi perfil
              </Link>
            </Reveal>

            <Reveal delay={0.15}>
              <div className="rounded-xl2 bg-pine-800/60 p-5">
                <div className="flex items-center gap-2 rounded-lg bg-white/95 px-4 py-3 shadow-soft">
                  <WhatsAppIcon className="h-5 w-5 flex-shrink-0 text-[#25D366]" />
                  <p className="text-sm text-ink-800">
                    Hola doctor, ¿tiene cupo esta semana? Lo vi en Guía Médica Monagas.
                  </p>
                </div>
                <ul className="mt-4 space-y-3 text-sm text-pine-100">
                  {[
                    'Perfil público con tus especialidades y datos de contacto',
                    'Botón directo de WhatsApp para que los pacientes te escriban',
                    'Notificaciones por correo y WhatsApp sobre tus documentos y pagos',
                    'Suscripción sencilla por Pago Móvil, sin tarjetas',
                  ].map((item) => (
                    <li key={item} className="flex gap-2">
                      <span className="text-white">✓</span>
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            </Reveal>
          </div>
        </section>
        <WaveDivider colorClassName="text-pine-900" flip />
      </div>

      <section className="container-page py-16">
        <Reveal>
          <h2 className="mb-8 text-2xl">Preguntas frecuentes</h2>
          <FaqAccordion items={FAQ_ITEMS} />
        </Reveal>
      </section>
    </div>
  );
}
