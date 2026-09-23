'use client';

import { useEffect, useState } from 'react';
import { api, ApiError } from '@/lib/api';
import { Alert } from '@/components/ui/Alert';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { PageSpinner } from '@/components/ui/Spinner';
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
          La verificación es gratuita y la misma para todos los planes. Cada requisito indica su naturaleza (legal, gremial,
          fiscal o de la plataforma). Un administrador revisa cada documento manualmente. Aceptamos PDF, JPG, PNG o WebP;
          los PDF con scripts o archivos incrustados se rechazan.
        </p>
      </div>

      {error && <Alert tone="error">{error}</Alert>}

      <div className="space-y-3">
        {data.required.map((req) => {
          const doc = latestByType(req.type);
          const status = doc ? DOCUMENT_STATUS_LABELS[doc.status] : null;
          return (
            <div key={req.type} className="card flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="font-medium text-ink-900">{DOCUMENT_TYPE_LABELS[req.type] ?? req.label}</p>
                <p className="text-xs text-ink-400">{req.categoryLabel}</p>
                {doc ? (
                  <div className="mt-1 flex items-center gap-2">
                    {status && <Badge tone={status.tone}>{status.label}</Badge>}
                    <span className="text-xs text-ink-400">{doc.originalFileName}</span>
                  </div>
                ) : (
                  <p className="mt-1 text-xs text-ink-400">Aún no has subido este documento</p>
                )}
                {doc?.status === 'REJECTED' && doc.reviewNote && (
                  <p className="mt-1 text-xs text-red-600">Motivo: {doc.reviewNote}</p>
                )}
                {doc?.status === 'EXPIRED' && (
                  <p className="mt-1 text-xs text-red-600">Este documento venció, debes renovarlo.</p>
                )}
              </div>
              <label>
                <span className="cursor-pointer rounded-lg border border-ink-200 px-3 py-2 text-sm font-medium text-ink-700 hover:bg-ink-50">
                  {uploadingType === req.type
                    ? 'Subiendo…'
                    : doc && doc.status !== 'REJECTED' && doc.status !== 'EXPIRED'
                      ? 'Reemplazar'
                      : 'Subir documento'}
                </span>
                <input
                  type="file"
                  accept="application/pdf,image/jpeg,image/png,image/webp"
                  className="hidden"
                  disabled={uploadingType === req.type}
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleUpload(req.type, file);
                    e.target.value = '';
                  }}
                />
              </label>
            </div>
          );
        })}
      </div>
    </div>
  );
}
