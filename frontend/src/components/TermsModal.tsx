'use client';

import Link from 'next/link';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { LEGAL_EFFECTIVE_DATE_LABEL, PRIVACY_VERSION, TERMS_VERSION } from '@/lib/legal';

interface TermsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAccept: () => void;
  acceptLabel?: string;
  cancelLabel?: string;
  closeOnAccept?: boolean;
}

const SECTIONS = [
  {
    title: 'Herramienta tecnológica, no acto médico',
    body: 'Guía Médica Monagas conecta pacientes con profesionales y organizaciones de salud verificados y organiza su agenda y presencia digital. No presta servicios médicos: el diagnóstico y la indicación terapéutica corresponden siempre al profesional.',
  },
  {
    title: 'Verificación gratuita e igual para todos',
    body: 'Todo médico y organización pasa la misma revisión documental antes de publicarse, sin importar su plan. Los planes pagos dan herramientas y visibilidad (señalada como «Destacado»), nunca la verificación.',
  },
  {
    title: 'Tus datos de salud son tuyos',
    body: 'Los datos personales y de salud del paciente se guardan cifrados. Ningún médico los ve sin tu autorización explícita, que eliges por alcance y tiempo y puedes revocar cuando quieras. Cada consulta de tus datos queda registrada.',
  },
  {
    title: 'Pagos por Pago Móvil',
    body: 'Los planes se cotizan en USD y se pagan en bolívares a la tasa oficial del BCV del día, por Pago Móvil. Un administrador valida cada pago antes de activar el plan.',
  },
];

export default function TermsModal({
  isOpen,
  onClose,
  onAccept,
  acceptLabel = 'Aceptar y continuar',
  cancelLabel = 'Cancelar',
  closeOnAccept = true,
}: TermsModalProps) {
  return (
    <Modal open={isOpen} onClose={onClose} title="Condiciones de uso" widthClassName="max-w-2xl">
      <div className="space-y-4">
        <p className="text-xs text-ink-500">
          Términos v{TERMS_VERSION} y Política de privacidad v{PRIVACY_VERSION} — vigentes desde el {LEGAL_EFFECTIVE_DATE_LABEL}.
        </p>
        {SECTIONS.map((s) => (
          <div key={s.title} className="rounded-lg border border-ink-100 bg-ink-50/50 p-4">
            <h3 className="mb-1 text-sm font-semibold text-ink-900">{s.title}</h3>
            <p className="text-sm text-ink-600">{s.body}</p>
          </div>
        ))}

        <p className="text-sm text-ink-500">
          Puedes leer el documento completo en{' '}
          <Link href="/terminos-y-condiciones" target="_blank" className="font-medium text-pine-700 underline">
            Términos y condiciones
          </Link>{' '}
          y en la{' '}
          <Link href="/privacidad" target="_blank" className="font-medium text-pine-700 underline">
            Política de privacidad
          </Link>
          .
        </p>

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={onClose}>
            {cancelLabel}
          </Button>
          <Button
            onClick={() => {
              onAccept();
              if (closeOnAccept) onClose();
            }}
          >
            {acceptLabel}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
