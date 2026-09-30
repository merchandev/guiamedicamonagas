import Link from 'next/link';
import { Callout, DocLink, LegalPage, type LegalSection, P, Ul, legalMetadata } from '@/components/legal/LegalPage';

export const metadata = legalMetadata('pagos');

const SECTIONS: LegalSection[] = [
  {
    id: 'gratuito',
    title: 'Qué es gratuito',
    body: (
      <Ul
        items={[
          'El uso del directorio y la cuenta de paciente.',
          'El registro de un profesional, la verificación de sus documentos y el perfil básico.',
        ]}
      />
    ),
  },
  {
    id: 'planes',
    title: 'Planes de pago',
    body: (
      <>
        <P>
          Los planes de pago para profesionales añaden herramientas (por ejemplo, agenda, fotos, publicaciones,
          estadísticas, sedes adicionales, redes sociales) y visibilidad comercial. Los planes vigentes, lo que incluye
          cada uno y su precio están publicados en{' '}
          <Link href="/planes" className="text-pine-700 underline">
            Planes y precios
          </Link>
          ; esa página es la referencia al momento de contratar.
        </P>
        <P>
          Los planes Profesional Plus, Premium y Agencia solo pueden contratarse con el 100 % de los documentos exigidos
          aprobados.
        </P>
        <P>
          <strong>Plan Agencia.</strong> Incluye la producción de dos videos en colaboración con Guía Médica Monagas, que
          son para el profesional. Uno de ellos puede mostrarse como video de presentación en su ficha mientras el plan
          Agencia esté vigente; si el plan vence, el video deja de mostrarse y queda guardado. Los detalles de producción
          (fechas, contenido y entrega) se coordinan con cada profesional.
        </P>
      </>
    ),
  },
  {
    id: 'separacion',
    title: 'Un plan no compra la verificación',
    body: (
      <Callout>
        La verificación es gratuita e igual para todos. Un plan de pago no la sustituye, no la acelera y no cambia su
        resultado. Lo que un plan añade es comercial: herramientas y visibilidad. El color de la insignia solo refleja el
        plan. Ver <DocLink to="verificacion" /> y <DocLink to="publicidad-medica" />.
      </Callout>
    ),
  },
  {
    id: 'visibilidad',
    title: 'Visibilidad comercial',
    body: (
      <Ul
        items={[
          'El orden del directorio prioriza la relevancia de la búsqueda y los perfiles completos. Los planes de pago suman un impulso acotado.',
          'El espacio rotativo «Destacado» forma parte de los planes Premium y Agencia, con prioridad para Agencia. Es publicidad y se muestra señalada como tal.',
          'Ninguna de estas ventajas indica superioridad clínica ni equivale a una recomendación de la plataforma.',
        ]}
      />
    ),
  },
  {
    id: 'moneda',
    title: 'Moneda y tasa de cambio',
    body: (
      <P>
        Los precios se expresan en dólares de los Estados Unidos (USD) como referencia y se pagan en bolívares, a la tasa
        oficial publicada por el Banco Central de Venezuela vigente al momento de suscribirse. El monto en bolívares queda
        fijado en la cuota junto con la tasa aplicada y su fecha, y es el que debe pagarse.
      </P>
    ),
  },
  {
    id: 'forma',
    title: 'Forma de pago',
    body: (
      <>
        <P>
          El pago se hace por <strong>Pago Móvil</strong>, a los datos que la plataforma muestra en el panel del
          profesional al suscribirse. La plataforma no guarda datos de tarjetas ni realiza cobros automáticos.
        </P>
        <P>
          Después de pagar, el titular <strong>reporta el pago</strong> desde su panel indicando banco, teléfono emisor,
          referencia, monto y adjuntando el comprobante.
        </P>
      </>
    ),
  },
  {
    id: 'activacion',
    title: 'Validación y activación',
    body: (
      <Ul
        items={[
          'Una persona del equipo administrativo valida cada pago reportado contra el movimiento recibido. El plan se activa cuando el pago queda validado, no al reportarlo.',
          'Si el pago no puede validarse (por ejemplo, por una referencia que no coincide o un monto distinto), se rechaza indicando el motivo y el titular puede corregir el reporte.',
          'Una misma referencia de pago no puede usarse dos veces.',
          'Un administrador también puede registrar directamente un pago recibido o asignar un plan; esas acciones quedan en el registro de auditoría.',
        ]}
      />
    ),
  },
  {
    id: 'duracion',
    title: 'Duración, vencimiento y renovación',
    body: (
      <Ul
        items={[
          'Los planes son mensuales: cada pago cubre un periodo.',
          'No hay renovación ni cobro automático. Para continuar con el plan se reporta un nuevo pago.',
          'Si el periodo vence sin renovarse, el perfil vuelve al plan básico gratuito: sigue publicado y conserva su verificación, y dejan de estar disponibles las funciones exclusivas del plan vencido.',
        ]}
      />
    ),
  },
  {
    id: 'cambio',
    title: 'Cambio de plan',
    body: (
      <P>
        Mientras haya una suscripción en curso no se puede contratar otra desde el panel. Un cambio a un plan superior o
        inferior antes del vencimiento se gestiona con el equipo administrativo por el{' '}
        <Link href="/reclamos?tipo=BILLING" className="text-pine-700 underline">
          canal de solicitudes
        </Link>
        ; al vencer el periodo, el profesional puede contratar el plan que prefiera o quedarse en el básico.
      </P>
    ),
  },
  {
    id: 'promociones',
    title: 'Promociones',
    body: (
      <P>
        Las promociones o precios especiales, cuando existan, se anuncian con sus condiciones y su vigencia, y no se
        aplican de forma retroactiva salvo que la propia promoción lo indique.
      </P>
    ),
  },
  {
    id: 'errores',
    title: 'Errores, fraude y comprobantes',
    body: (
      <Ul
        items={[
          'Si un pago se aplicó con un error (monto, plan o periodo), se corrige al detectarse o al reclamarse.',
          'Reportar pagos inexistentes, comprobantes alterados o pagos hechos con medios de terceros sin autorización es causa de rechazo del pago y de suspensión de la cuenta, sin perjuicio de las acciones legales.',
          'Los comprobantes y los datos de cada pago son privados: solo los ven el titular y el personal administrativo autorizado, y se conservan como exige la normativa aplicable.',
        ]}
      />
    ),
  },
  {
    id: 'suspension',
    title: 'Suspensión por incumplimiento',
    body: (
      <P>
        Un plan de pago no impide que un perfil sea suspendido o dado de baja por incumplir los <DocLink to="terminos" />{' '}
        o las <DocLink to="condiciones-profesionales" />. El tratamiento del periodo pagado en ese caso está en la política
        de <DocLink to="reembolsos" />.
      </P>
    ),
  },
  {
    id: 'impuestos',
    title: 'Facturación e impuestos',
    body: (
      <P>
        La facturación y los impuestos se rigen por la normativa tributaria venezolana aplicable al operador, identificado
        en el <DocLink to="aviso-legal" />.
      </P>
    ),
  },
];

export default function PaymentsPolicyPage() {
  return (
    <LegalPage
      slug="pagos"
      lead={
        <p>
          La verificación y el perfil básico son gratuitos. Los planes de pago son mensuales, se pagan por Pago Móvil y no
          se renuevan ni se cobran de forma automática.
        </p>
      }
      sections={SECTIONS}
      related={['reembolsos', 'verificacion', 'publicidad-medica', 'condiciones-profesionales']}
    />
  );
}
