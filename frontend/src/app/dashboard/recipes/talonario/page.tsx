'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api, apiBlob, ApiError, saveBlob } from '@/lib/api';
import { formatDate } from '@/lib/dates';
import { PRESCRIPTION_RULES, PRESCRIPTION_RULES_VERSION } from '@/lib/legal';
import { PAD_IMAGES, type PadImageKind, type PrescriptionPad } from '@/lib/prescriptions';
import { MissingRequirements } from '@/components/prescriptions/MissingRequirements';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { FileButton } from '@/components/ui/FileButton';
import { Input } from '@/components/ui/Input';
import { PageSpinner } from '@/components/ui/Spinner';

interface EstablishmentForm {
  establishmentName: string;
  establishmentAddress: string;
  establishmentRif: string;
  establishmentPhone: string;
  city: string;
  defaultValidityDays: string;
}

const IMAGE_ORDER: PadImageKind[] = ['signature', 'seal', 'logo'];
const IMAGE_URL: Record<PadImageKind, 'signatureUrl' | 'sealUrl' | 'logoUrl'> = {
  signature: 'signatureUrl',
  seal: 'sealUrl',
  logo: 'logoUrl',
};

function toForm(pad: PrescriptionPad): EstablishmentForm {
  return {
    establishmentName: pad.pad.establishmentName ?? '',
    establishmentAddress: pad.pad.establishmentAddress ?? '',
    establishmentRif: pad.pad.establishmentRif ?? '',
    establishmentPhone: pad.pad.establishmentPhone ?? '',
    city: pad.pad.city ?? '',
    defaultValidityDays: String(pad.pad.defaultValidityDays),
  };
}

export default function PrescriptionPadPage() {
  const [pad, setPad] = useState<PrescriptionPad | null>(null);
  const [form, setForm] = useState<EstablishmentForm | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState<PadImageKind | null>(null);
  const [rulesChecked, setRulesChecked] = useState(false);
  const [accepting, setAccepting] = useState(false);
  const [previewing, setPreviewing] = useState(false);

  const apply = (next: PrescriptionPad) => {
    setPad(next);
    setForm(toForm(next));
  };

  useEffect(() => {
    api.get<PrescriptionPad>('/prescriptions/pad').then(
      (loaded) => {
        setPad(loaded);
        setForm(toForm(loaded));
      },
      (e) => setError(e instanceof ApiError ? e.message : 'No se pudo cargar tu talonario'),
    );
  }, []);

  const field = (key: keyof EstablishmentForm) => ({
    value: form?.[key] ?? '',
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => setForm((current) => (current ? { ...current, [key]: e.target.value } : current)),
  });

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form) return;
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      apply(
        await api.patch<PrescriptionPad>('/prescriptions/pad', {
          establishmentName: form.establishmentName,
          establishmentAddress: form.establishmentAddress,
          establishmentRif: form.establishmentRif,
          establishmentPhone: form.establishmentPhone,
          city: form.city,
          defaultValidityDays: Number(form.defaultValidityDays) || 30,
        }),
      );
      setNotice('Guardamos los datos del establecimiento.');
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'No se pudieron guardar los datos');
    } finally {
      setSaving(false);
    }
  };

  const acceptRules = async () => {
    setAccepting(true);
    setError(null);
    setNotice(null);
    try {
      apply(await api.patch<PrescriptionPad>('/prescriptions/pad', { acceptRules: true }));
      setNotice('Aceptaste las condiciones del récipe digital.');
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'No se pudieron aceptar las condiciones');
    } finally {
      setAccepting(false);
    }
  };

  const upload = async (kind: PadImageKind, file: File) => {
    setUploading(kind);
    setError(null);
    setNotice(null);
    try {
      const formData = new FormData();
      formData.append('file', file);
      apply(await api.upload<PrescriptionPad>(`/prescriptions/pad/${kind}`, formData));
      setNotice(`Guardamos tu ${PAD_IMAGES[kind].title.replace(' (opcional)', '').toLowerCase()}.`);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'No se pudo subir la imagen');
    } finally {
      setUploading(null);
    }
  };

  const remove = async (kind: PadImageKind) => {
    setUploading(kind);
    setError(null);
    setNotice(null);
    try {
      apply(await api.delete<PrescriptionPad>(`/prescriptions/pad/${kind}`));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'No se pudo quitar la imagen');
    } finally {
      setUploading(null);
    }
  };

  const preview = async () => {
    setPreviewing(true);
    setError(null);
    try {
      saveBlob(await apiBlob('/prescriptions/pad/preview'), 'recipe-muestra.pdf');
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'No se pudo generar la muestra');
    } finally {
      setPreviewing(false);
    }
  };

  if (!pad || !form) return error ? <Alert tone="error">{error}</Alert> : <PageSpinner />;

  const { prescriber } = pad;
  return (
    <div className="space-y-8">
      <div>
        <Link href="/dashboard/recipes" className="text-sm text-pine-700 hover:underline">
          ← Récipes
        </Link>
        <h1 className="mt-1 text-2xl">Talonario de récipes</h1>
        <p className="mt-1 max-w-2xl text-sm text-ink-600">
          Lo que se imprime en cada récipe además de tus datos verificados: el establecimiento, tu firma, tu sello y, si
          quieres, el logo de tu consultorio. Puedes cambiarlo cuando quieras: los récipes ya emitidos no cambian.
        </p>
      </div>

      <MissingRequirements pad={pad} />
      {error && <Alert tone="error">{error}</Alert>}
      {notice && <Alert tone="success">{notice}</Alert>}

      <section aria-labelledby="tus-datos" className="card space-y-2 p-5">
        <h2 id="tus-datos" className="text-lg font-semibold text-ink-900">
          Tus datos en el récipe
        </h2>
        <p className="text-sm text-ink-800">
          Dr(a). {prescriber.fullName}
          {prescriber.specialties.length ? ` · ${prescriber.specialties.join(' · ')}` : ''}
        </p>
        <p className="text-sm text-ink-700">
          C.I. {prescriber.cedula || '—'} · M.P.P.S. N° {prescriber.mppsNumber || '—'}
          {prescriber.colegioNumber ? ` · C.M. N° ${prescriber.colegioNumber}` : ''}
        </p>
        <p className="text-xs text-ink-500">
          Salen de tu perfil verificado. Para cambiarlos, edítalos en{' '}
          <Link href="/dashboard/perfil" className="underline">
            Mi perfil
          </Link>
          : el cambio vuelve a revisión antes de que puedas emitir de nuevo.
        </p>
      </section>

      <form onSubmit={save} aria-labelledby="establecimiento" className="card space-y-4 p-5">
        <div>
          <h2 id="establecimiento" className="text-lg font-semibold text-ink-900">
            Establecimiento de salud
          </h2>
          <p className="mt-1 text-sm text-ink-600">
            La norma pide el nombre, la dirección y el RIF del establecimiento impresos en el récipe. Si atiendes en tu propio
            consultorio, usa tu RIF.
          </p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Input label="Nombre del establecimiento" required placeholder="Consultorio Dra. Pérez" maxLength={120} {...field('establishmentName')} />
          <Input label="RIF del establecimiento" required placeholder="J-12345678-9" maxLength={14} {...field('establishmentRif')} />
          <div className="sm:col-span-2">
            <Input label="Dirección" required placeholder="Av. Bolívar, Centro Médico X, consultorio 12, Maturín" maxLength={200} {...field('establishmentAddress')} />
          </div>
          <Input label="Teléfono (opcional)" inputMode="tel" placeholder="0291-5550000" maxLength={40} {...field('establishmentPhone')} />
          <Input label="Lugar de emisión" required placeholder="Maturín, estado Monagas" maxLength={80} {...field('city')} />
          <Input
            label="Vigencia que se propone al emitir (días)"
            type="number"
            min={1}
            max={365}
            hint="La norma pide una fecha de vencimiento; la eliges en cada récipe."
            {...field('defaultValidityDays')}
          />
        </div>
        <Button type="submit" loading={saving}>
          Guardar establecimiento
        </Button>
      </form>

      <section aria-labelledby="imagenes" className="space-y-4">
        <div>
          <h2 id="imagenes" className="text-lg font-semibold text-ink-900">
            Firma, sello y logo
          </h2>
          <p className="mt-1 text-sm text-ink-600">
            Fotos en JPG, PNG o WebP de hasta 5 MB. Se guardan de forma privada y solo se usan en tus récipes.
          </p>
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          {IMAGE_ORDER.map((kind) => {
            const info = PAD_IMAGES[kind];
            const url = pad.pad[IMAGE_URL[kind]];
            const hintId = `talonario-${kind}-ayuda`;
            return (
              <div key={kind} className="card flex flex-col gap-3 p-4">
                <h3 className="font-semibold text-ink-900">{info.title}</h3>
                <div
                  className="flex h-32 items-center justify-center rounded-lg border border-dashed border-ink-200 bg-[length:16px_16px] bg-[linear-gradient(45deg,#f1f3f2_25%,transparent_25%,transparent_75%,#f1f3f2_75%),linear-gradient(45deg,#f1f3f2_25%,transparent_25%,transparent_75%,#f1f3f2_75%)] bg-[position:0_0,8px_8px]"
                >
                  {url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={url} alt={`Tu ${info.title.replace(' (opcional)', '').toLowerCase()}`} className="max-h-28 max-w-full object-contain" />
                  ) : (
                    <span className="text-sm text-ink-500">{info.required ? 'Falta subirla' : 'Sin logo'}</span>
                  )}
                </div>
                <p id={hintId} className="text-xs text-ink-600">
                  {info.hint}
                </p>
                <div className="mt-auto flex flex-wrap gap-2">
                  <FileButton
                    accept="image/jpeg,image/png,image/webp"
                    disabled={uploading !== null}
                    describedBy={hintId}
                    onFile={(file) => void upload(kind, file)}
                  >
                    {uploading === kind ? 'Procesando…' : url ? 'Cambiar' : 'Subir'}
                  </FileButton>
                  {url && (
                    <Button variant="ghost" disabled={uploading !== null} onClick={() => void remove(kind)}>
                      Quitar
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
        <Button variant="outline" onClick={() => void preview()} loading={previewing}>
          Descargar una muestra en PDF
        </Button>
      </section>

      <section aria-labelledby="condiciones" className="card space-y-3 p-5">
        <h2 id="condiciones" className="text-lg font-semibold text-ink-900">
          Condiciones del récipe digital
        </h2>
        <ul className="list-disc space-y-1.5 pl-5 text-sm text-ink-800">
          {PRESCRIPTION_RULES.map((rule) => (
            <li key={rule}>{rule}</li>
          ))}
        </ul>
        {pad.pad.rulesAcceptedAt ? (
          <p className="text-sm text-pine-800">
            Las aceptaste el {formatDate(pad.pad.rulesAcceptedAt, { dateStyle: 'long' })} (versión {pad.rulesVersion}).
          </p>
        ) : (
          <div className="space-y-3">
            <label className="flex items-start gap-2 text-sm text-ink-800">
              <input
                type="checkbox"
                className="mt-0.5 h-4 w-4 rounded border-ink-300 text-pine-700"
                checked={rulesChecked}
                onChange={(e) => setRulesChecked(e.target.checked)}
              />
              <span>Leí y acepto las condiciones del récipe digital (versión {PRESCRIPTION_RULES_VERSION}).</span>
            </label>
            <Button disabled={!rulesChecked} loading={accepting} onClick={() => void acceptRules()}>
              Aceptar las condiciones
            </Button>
          </div>
        )}
      </section>
    </div>
  );
}
