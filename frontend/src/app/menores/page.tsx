import Link from 'next/link';
import { Callout, DocLink, LegalPage, type LegalSection, P, Ul, legalMetadata } from '@/components/legal/LegalPage';

export const metadata = legalMetadata('menores');

const SECTIONS: LegalSection[] = [
  {
    id: 'regla',
    title: 'Regla',
    body: (
      <>
        <Callout>
          <strong>El registro de pacientes es solo para personas de 18 años o más.</strong> Al crear la cuenta, el usuario
          declara ser mayor de edad en una casilla propia; esa declaración queda registrada con su fecha y su versión.
        </Callout>
        <P>Los profesionales que publican un perfil deben ser, además, mayores de edad y estar habilitados para ejercer.</P>
      </>
    ),
  },
  {
    id: 'por-que',
    title: 'Por qué',
    body: (
      <>
        <P>
          La información de salud de niños, niñas y adolescentes merece una protección especial. Habilitar cuentas para
          menores exige resolver antes, con el cuidado debido, cuestiones que esta versión de la plataforma todavía no
          contempla:
        </P>
        <Ul
          items={[
            'la representación legal y el consentimiento de los padres o representantes;',
            'el acceso de los representantes a la cuenta;',
            'la emancipación;',
            'la confidencialidad de los adolescentes frente a sus representantes;',
            'el interés superior del niño, niña o adolescente;',
            'las excepciones de carácter médico.',
          ]}
        />
        <P>Mientras esas reglas no estén diseñadas, la plataforma no admite cuentas de pacientes menores de edad.</P>
      </>
    ),
  },
  {
    id: 'representantes',
    title: 'Padres y representantes',
    body: (
      <P>
        La atención médica de un menor ocurre directamente con el profesional, fuera de la plataforma. Un adulto puede usar
        el directorio para encontrar a un profesional para un menor a su cargo, pero no debe registrar en su propio perfil
        la información de salud de ese menor: el perfil privado es personal.
      </P>
    ),
  },
  {
    id: 'deteccion',
    title: 'Si se detecta una cuenta de un menor',
    body: (
      <P>
        Si tenemos conocimiento de que una cuenta de paciente pertenece a una persona menor de 18 años, la cuenta se dará
        de baja y sus datos se eliminarán conforme a la política de <DocLink to="retencion" />. Un representante puede
        pedirlo por el{' '}
        <Link href="/reclamos?tipo=ACCOUNT_DELETION" className="text-pine-700 underline">
          canal de solicitudes
        </Link>
        .
      </P>
    ),
  },
];

export default function MinorsPolicyPage() {
  return (
    <LegalPage
      slug="menores"
      sections={SECTIONS}
      related={['consentimiento-paciente', 'privacidad', 'terminos']}
    />
  );
}
