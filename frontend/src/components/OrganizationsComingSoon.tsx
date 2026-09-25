import Link from 'next/link';
import { Badge } from '@/components/ui/Badge';
import { BuildingIcon, FlaskIcon, PillIcon } from '@/components/icons';

const COMING = [
  { title: 'Farmacias', body: 'Sedes, horarios y contacto directo.', icon: PillIcon },
  { title: 'Laboratorios', body: 'Sedes, horarios y servicios.', icon: FlaskIcon },
  { title: 'Clínicas', body: 'Servicios, sedes y contacto directo.', icon: BuildingIcon },
];

/** /farmacias mientras no haya alianzas (ver ORGANIZATIONS_LAUNCHED). */
export function OrganizationsComingSoon() {
  return (
    <div className="container-page py-10">
      <section
        aria-labelledby="proximamente-titulo"
        className="rounded-xl2 border border-ink-100 bg-gradient-to-b from-gold-50/60 to-white px-6 py-12 text-center sm:px-10 md:py-16"
      >
        <Badge tone="gold">Próximamente</Badge>
        <h1 id="proximamente-titulo" className="mx-auto mt-4 max-w-2xl text-3xl md:text-4xl">
          Farmacias, laboratorios y clínicas
        </h1>
        <p className="mx-auto mt-4 max-w-xl text-ink-600">
          Estamos preparando alianzas con farmacias, laboratorios y clínicas del estado Monagas. Muy pronto podrás
          encontrarlas aquí, verificadas con el mismo cuidado que nuestros médicos.
        </p>

        <ul className="mx-auto mt-10 grid max-w-3xl gap-4 text-left sm:grid-cols-3">
          {COMING.map((item) => (
            <li key={item.title} className="rounded-xl bg-white p-5 shadow-soft">
              <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-gold-50 text-gold-700">
                <item.icon className="h-5 w-5" />
              </span>
              <h2 className="mt-3 font-semibold text-ink-900">{item.title}</h2>
              <p className="mt-1 text-sm text-ink-600">{item.body}</p>
            </li>
          ))}
        </ul>

        <div className="mt-10 flex flex-wrap justify-center gap-3">
          <Link
            href="/medicos"
            className="rounded-lg bg-pine-700 px-6 py-3 text-sm font-semibold text-white shadow-soft transition-transform hover:-translate-y-0.5 hover:bg-pine-800"
          >
            Buscar un médico
          </Link>
          <Link
            href="/especialidades"
            className="rounded-lg border border-ink-200 bg-white px-6 py-3 text-sm font-semibold text-ink-800 transition-transform hover:-translate-y-0.5 hover:bg-ink-50"
          >
            Ver especialidades
          </Link>
        </div>
      </section>

      <p className="mx-auto mt-6 max-w-xl text-center text-sm text-ink-500">
        ¿Tienes una farmacia, un laboratorio o una clínica en Monagas? Estamos abriendo las primeras alianzas; muy pronto
        podrás sumarte desde aquí.
      </p>
    </div>
  );
}
