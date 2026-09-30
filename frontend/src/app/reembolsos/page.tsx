import Link from 'next/link';
import { Callout, DocLink, LegalPage, type LegalSection, LegalTable, P, Ul, legalMetadata } from '@/components/legal/LegalPage';

export const metadata = legalMetadata('reembolsos');

const SECTIONS: LegalSection[] = [
  {
    id: 'principio',
    title: 'Principio general',
    body: (
      <>
        <P>
          Cada caso se trata según su causa. Esta política no declara que los pagos sean «no reembolsables»: distingue
          entre los errores que deben corregirse o devolverse y los periodos de servicio que ya se prestaron.
        </P>
        <Callout>
          Nada de lo aquí dispuesto limita una devolución que la ley haga exigible ni los derechos irrenunciables de quien
          contrata.
        </Callout>
      </>
    ),
  },
  {
    id: 'cancelacion',
    title: 'Cancelación voluntaria',
    body: (
      <P>
        Los planes no se renuevan ni se cobran de forma automática, de modo que no hace falta cancelar nada para evitar un
        cobro futuro: basta con no renovar. El plan contratado sigue activo hasta el final del periodo pagado y después el
        perfil vuelve al plan básico gratuito.
      </P>
    ),
  },
  {
    id: 'casos',
    title: 'Casos y tratamiento',
    body: (
      <LegalTable
        head={['Caso', 'Tratamiento']}
        rows={[
          [
            'Pago duplicado o monto pagado en exceso',
            'Procede la devolución del excedente o, si el titular lo prefiere, su aplicación a un periodo siguiente.',
          ],
          [
            'Pago realizado que no se aplicó',
            'Se verifica el movimiento. Confirmado el pago, se activa el plan; si no fuera posible activarlo, procede la devolución.',
          ],
          [
            'Plan que nunca se activó por causa de la plataforma',
            'Procede la devolución, o la activación si el titular la prefiere.',
          ],
          [
            'Error técnico de la plataforma que impidió usar el plan',
            'Se corrige la falla y se compensa el tiempo afectado extendiendo el periodo o, si el titular lo prefiere y corresponde, con una devolución proporcional.',
          ],
          [
            'Cancelación voluntaria antes de que termine el periodo',
            'El plan sigue disponible hasta el final del periodo pagado. No genera por sí sola una devolución del periodo en curso; la solicitud se evalúa según sus circunstancias.',
          ],
          [
            'Periodo de servicio ya transcurrido',
            'No se devuelve, salvo que la ley disponga otra cosa o que haya mediado un error de la plataforma.',
          ],
          [
            'Pago fraudulento o hecho con medios de un tercero sin su autorización',
            'El pago se rechaza o se anula y la cuenta puede suspenderse. Si el titular legítimo del medio de pago reclama, se atiende su solicitud con la documentación correspondiente.',
          ],
          [
            'Suspensión o baja por incumplimiento del profesional',
            'No genera por sí sola una devolución del periodo en curso; la solicitud se evalúa según la causa y lo que la ley disponga.',
          ],
          ['Devolución legalmente exigible', 'Procede siempre, en los términos que la ley establezca.'],
        ]}
      />
    ),
  },
  {
    id: 'como',
    title: 'Cómo solicitarla',
    body: (
      <>
        <P>
          Presenta tu solicitud por el{' '}
          <Link href="/reclamos?tipo=BILLING" className="text-pine-700 underline">
            canal de reclamos, en la categoría de pagos
          </Link>
          , con estos datos:
        </P>
        <Ul
          items={[
            'banco y teléfono desde el que se hizo el pago;',
            'referencia, fecha y monto;',
            'el plan contratado y qué ocurrió;',
            'el comprobante, si no lo adjuntaste al reportar el pago.',
          ]}
        />
        <P>
          Recibirás un número de seguimiento y una respuesta motivada. Podemos pedirte información adicional para
          comprobar la titularidad del pago.
        </P>
      </>
    ),
  },
  {
    id: 'forma',
    title: 'Forma de la devolución',
    body: (
      <P>
        Cuando proceda, la devolución se hace al titular del pago. El medio, la moneda y el monto se indican en la
        respuesta a la solicitud, conforme a la normativa aplicable. De cada devolución se deja constancia.
      </P>
    ),
  },
  {
    id: 'relacion',
    title: 'Relación con otros documentos',
    body: (
      <P>
        Las condiciones de contratación están en <DocLink to="pagos" />. Esta política solo se refiere a los planes de la
        plataforma: los honorarios que un paciente pague a un profesional por su consulta son un asunto entre ambos, en el
        que Guía Médica Monagas no interviene.
      </P>
    ),
  },
];

export default function RefundPolicyPage() {
  return (
    <LegalPage
      slug="reembolsos"
      lead={
        <p>
          Qué ocurre con un pago duplicado, un pago que no se aplicó, un plan que no se activó o una cancelación. Aplica a
          los planes que los profesionales contratan en la plataforma.
        </p>
      }
      sections={SECTIONS}
      related={['pagos', 'condiciones-profesionales', 'reclamos']}
    />
  );
}
