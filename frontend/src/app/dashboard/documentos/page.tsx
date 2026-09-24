'use client';

import { useEffect, useState } from 'react';
import { api, ApiError } from '@/lib/api';
import { Alert } from '@/components/ui/Alert';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { PageSpinner } from '@/components/ui/Spinner';
import { FileButton } from '@/components/ui/FileButton';
import { DOCUMENT_STATUS_LABELS, DOCUMENT_TYPE_LABELS } from '@/lib/labels';
import { DocumentType, ProfessionalDocument } from '@/lib/types';

interface DocsResponse {
  documents: ProfessionalDocument[];
  required: { type: DocumentType; label: string; category: string; categoryLabel: string }[];
  verificationStatus: string;
}

export default function DocumentsPage() {
  const [data, setData] = useState<DocsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [uploadingType, setUploadingType] = useState<DocumentType | null>(null);

  const load = () => api.get<DocsResponse>('/documents/me').then(setData).catch(() => undefined);

  useEffect(() => {
    load();
  }, []);

  const latestByType = (type: DocumentType) =>
    data?.documents
      .filter((d) => d.type === type)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0];

  const handleUpload = async (type: DocumentType, file: File) => {
    setError(null);
    setUploadingType(type);
    try {
      const formData = new FormData();
      formData.append('file', file);
      await api.upload(`/documents?type=${type}`, formData);
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'No se pudo subir el documento');
    } finally {
      setUploadingType(null);
    }
  };

  if (!data) return <PageSpinner />;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl">Documentos de verificación</h1>
        <p className="mt-1 text-ink-600">
          La verificación es gratuita y la misma para todos los planes. Los requisitos siguen el orden en que se obtienen:
          primero tu identidad y después tus títulos y registros. Cada uno indica su naturaleza (legal, de habilitación,
          fiscal o de la plataforma). Un administrador revisa cada documento manualmente. Con el 60% aprobado (más tu
          biografía y tu foto) tu perfil aparece en el directorio; con el 100% recibes el sello de verificado y puedes
          contratar Profesional Plus o Premium. Aceptamos PDF, JPG, PNG o WebP; los PDF con scripts o archivos incrustados
          se rechazan.
        </p>
      </div>

      {error && <Alert tone="error">{error}</Alert>}

      <div className="space-y-3">
        {data.required.map((req, index) => {
          const doc = latestByType(req.type);
          const status = doc ? DOCUMENT_STATUS_LABELS[doc.status] : null;
          return (
            <div key={req.type} className="card flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
              <div className="min-w-0 space-y-1">
                <p id={`documento-${req.type}`} className="font-medium text-ink-900">
                  <span className="text-ink-400">{index + 1}.</span> {DOCUMENT_TYPE_LABELS[req.type] ?? req.label}
                </p>
                <p className="text-xs text-ink-500">{req.categoryLabel}</p>
                {doc ? (
                  <div className="flex flex-wrap items-center gap-2 pt-1">
                    {status && <Badge tone={status.tone}>{status.label}</Badge>}
                    <span className="break-all text-xs text-ink-500">{doc.originalFileName}</span>
                  </div>
                ) : (
                  <p className="pt-1 text-xs text-ink-500">Aún no has subido este documento</p>
                )}
                {doc?.status === 'REJECTED' && doc.reviewNote && (
                  <p className="text-xs text-red-600">Motivo: {doc.reviewNote}</p>
                )}
                {doc?.status === 'EXPIRED' && (
                  <p className="text-xs text-red-600">Este documento venció, debes renovarlo.</p>
                )}
              </div>
              <FileButton
                accept="application/pdf,image/jpeg,image/png,image/webp"
                disabled={uploadingType === req.type}
                onFile={(file) => handleUpload(req.type, file)}
                describedBy={`documento-${req.type}`}
                className="flex-shrink-0 self-start sm:self-center"
              >
                {uploadingType === req.type
                  ? 'Subiendo…'
                  : doc && doc.status !== 'REJECTED' && doc.status !== 'EXPIRED'
                    ? 'Reemplazar'
                    : 'Subir documento'}
              </FileButton>
            </div>
          );
        })}
      </div>
    </div>
  );
}
