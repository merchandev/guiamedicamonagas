'use client';

import Link from 'next/link';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';

interface TermsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAccept: () => void;
}

const SECTIONS = [
  {
    title: 'Herramienta tecnológica, no acto médico',
    body: 'Guía Médica Monagas conecta pacientes y profesionales y organiza su presencia digital. El diagnóstico, la indicación terapéutica y la responsabilidad médica corresponden siempre al profesional de la salud.',
  },
  {
    title: 'Responsabilidad profesional y legal',
    body: 'El médico debe usar datos reales y vigentes, cumplir el Artículo 8 de la Ley de Ejercicio de la Medicina y estar debidamente inscrito en el MPPS (SACS), el Colegio de Médicos de Monagas y el INPREMEDICO. La cuenta es personal e intransferible.',
  },
  {
    title: 'Verificación obligatoria de documentos',
    body: 'Antes de publicarse, cada perfil se revisa manualmente contra los documentos exigidos por ley. La plataforma muestra públicamente el N° MPPS, N° Colegio de Médicos de Monagas y N° INPREMEDICO para garantizar transparencia.',
  },
  {
    title: 'Pagos por Pago Móvil',
    body: 'La suscripción se paga por Pago Móvil en bolívares. El profesional reporta el pago con su comprobante y un administrador debe aprobarlo manualmente antes de activar el servicio.',
  },
];

export default function TermsModal({ isOpen, onClose, onAccept }: TermsModalProps) {
  return (
    <Modal open={isOpen} onClose={onClose} title="Condiciones de uso" widthClassName="max-w-2xl">
      <div className="space-y-4">
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
            Cancelar
          </Button>
          <Button
            onClick={() => {
              onAccept();
              onClose();
            }}
          >
            Aceptar y continuar
          </Button>
        </div>
      </div>
    </Modal>
  );
}
