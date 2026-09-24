'use client';

import { useEffect, useState } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { api, ApiError } from '@/lib/api';
import { Input, Textarea } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Button } from '@/components/ui/Button';
import { Alert } from '@/components/ui/Alert';
import { PageSpinner } from '@/components/ui/Spinner';
import { Badge } from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/EmptyState';
import { municipalityOptions, useMunicipalities } from '@/lib/catalogs';
import { AffiliationsManager } from '@/components/AffiliationsManager';
import { PlanTier, Specialty } from '@/lib/types';
import { PLAN_TIER_LABELS } from '@/lib/labels';
import { ExtraLocationsManager } from '@/components/ExtraLocationsManager';
import { SocialLinksManager } from '@/components/SocialLinksManager';
import type { SocialLink } from '@/lib/social';
import { FileButton } from '@/components/ui/FileButton';
import { cn } from '@/lib/cn';

// Separación uniforme entre secciones y campos: ningún campo queda pegado al de al lado.
const SECTION_TITLE = 'border-b border-ink-100 pb-3 text-lg font-semibold text-ink-900';
const FIELD_GRID = 'grid gap-x-6 gap-y-5 sm:grid-cols-2';

interface OwnProfileForm {
  firstName: string;
  lastName: string;
  bio?: string;
  cedula?: string;
  rif?: string;
  mppsNumber?: string;
  colmedMonagasNumber?: string;
  inpremedicoNumber?: string;
  phone?: string;
  whatsapp?: string;
  municipality?: string;
  address?: string;
  seoTitle?: string;
  seoDescription?: string;
}

export default function EditProfilePage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [specialties, setSpecialties] = useState<Specialty[]>([]);
  const [selectedSpecialties, setSelectedSpecialties] = useState<string[]>([]);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [planTier, setPlanTier] = useState<PlanTier>('FREE');
  const [socialLinks, setSocialLinks] = useState<SocialLink[]>([]);
  const [completeness, setCompleteness] = useState<number | null>(null);
  const municipalities = useMunicipalities();

  const { register, handleSubmit, reset, control } = useForm<OwnProfileForm>();

  useEffect(() => {
    Promise.all([
      api.get<any>('/professionals/me'),
      api.get<Specialty[]>('/specialties'),
    ])
      .then(([profile, allSpecialties]) => {
        reset(profile);
        setSelectedSpecialties(profile.specialties.map((s: any) => s.specialty.id));
        setPhotoUrl(profile.photoUrl);
        setPlanTier(profile.planTier ?? 'FREE');
        setCompleteness(profile.profileCompleteness ?? null);
        setSocialLinks(profile.socialLinks ?? []);
        setSpecialties(allSpecialties);
      })
      .finally(() => setLoading(false));
  }, [reset]);

  const toggleSpecialty = (id: string) => {
    setSelectedSpecialties((prev) => (prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id]));
  };

  const onSubmit = async (values: OwnProfileForm) => {
    setError(null);
    setSuccess(false);
    setSaving(true);
    try {
      await api.patch('/professionals/me', { ...values, specialtyIds: selectedSpecialties });
      setSuccess(true);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'No se pudo guardar el perfil');
    } finally {
      setSaving(false);
    }
  };

  const onPhotoChange = async (file: File) => {
    setUploadingPhoto(true);
    const formData = new FormData();
    formData.append('file', file);
    try {
      const updated = await api.upload<{ photoUrl: string | null }>('/professionals/me/photo', formData);
      setPhotoUrl(updated.photoUrl);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'No se pudo subir la foto');
    } finally {
      setUploadingPhoto(false);
    }
  };

  if (loading) return <PageSpinner />;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl">Mi perfil profesional</h1>
        {PLAN_TIER_LABELS[planTier] && <Badge tone={PLAN_TIER_LABELS[planTier].tone}>{PLAN_TIER_LABELS[planTier].label}</Badge>}
      </div>

      {completeness !== null && (
        <div className="card p-5 sm:p-6">
          <div className="flex flex-col gap-1 text-sm sm:flex-row sm:items-center sm:justify-between sm:gap-4">
            <span className="font-medium text-ink-900">Perfil completo al {completeness}%</span>
            <span className="text-ink-500">Es el criterio principal de orden en el directorio</span>
          </div>
          <div
            className="mt-3 h-2 overflow-hidden rounded-full bg-ink-100"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={completeness}
            aria-label="Completitud del perfil"
          >
            <div className="h-full rounded-full bg-pine-600" style={{ width: `${completeness}%` }} />
          </div>
          <p className="mt-3 text-xs leading-relaxed text-ink-500">
            Suma puntos con foto, biografía (80+ caracteres), especialidades, teléfono, dirección, municipio, números MPPS y
            de Colegio, agenda y ubicación.
          </p>
        </div>
      )}

      <form onSubmit={handleSubmit(onSubmit)} className="card space-y-10 p-6 sm:p-8">
        {error && <Alert tone="error">{error}</Alert>}
        {success && <Alert tone="success">Perfil actualizado correctamente.</Alert>}

        <section aria-labelledby="perfil-foto" className="space-y-4">
          <h2 id="perfil-foto" className={SECTION_TITLE}>
            Foto de perfil
          </h2>
          <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
            {photoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={photoUrl} alt="Tu foto de perfil" className="h-20 w-20 flex-shrink-0 rounded-full object-cover" />
            ) : (
              <div className="h-20 w-20 flex-shrink-0 rounded-full bg-ink-100" aria-hidden="true" />
            )}
            <div className="space-y-2">
              <FileButton accept="image/jpeg,image/png,image/webp" disabled={uploadingPhoto} onFile={onPhotoChange} describedBy="perfil-foto-ayuda">
                {uploadingPhoto ? 'Subiendo…' : photoUrl ? 'Cambiar foto' : 'Subir foto'}
              </FileButton>
              <p id="perfil-foto-ayuda" className="text-xs text-ink-500">
                Obligatoria para publicarte. JPG, PNG o WebP. Máx. 5 MB.
              </p>
            </div>
          </div>
        </section>

        <section aria-labelledby="perfil-basica" className="space-y-5">
          <h2 id="perfil-basica" className={SECTION_TITLE}>
            Información básica
          </h2>
          <div className={FIELD_GRID}>
            <Input label="Nombres" required {...register('firstName')} />
            <Input label="Apellidos" required {...register('lastName')} />
          </div>
          <Textarea
            label="Biografía"
            rows={4}
            {...register('bio')}
            hint="Obligatoria para publicarte (mínimo 80 caracteres). Cuéntale a los pacientes sobre tu experiencia."
          />
          <div className={FIELD_GRID}>
            <Input label="Cédula de identidad" placeholder="V-12345678" {...register('cedula')} />
            <Input label="RIF" placeholder="V-12345678-9" {...register('rif')} />
          </div>
        </section>

        <section aria-labelledby="perfil-avales" className="space-y-5">
          <h2 id="perfil-avales" className={cn(SECTION_TITLE, 'border-pine-100 text-pine-800')}>
            Avales legales y gremiales (Monagas)
          </h2>
          <p className="text-sm leading-relaxed text-ink-600">
            Estos números se muestran públicamente en tu perfil verificado, según las normativas del MPPS y el
            Colegio de Médicos de Monagas.
          </p>
          <div className={FIELD_GRID}>
            <Input label="N° Registro MPPS (SACS)" {...register('mppsNumber')} />
            <Input label="N° Colegio de Médicos Monagas" {...register('colmedMonagasNumber')} />
          </div>
        </section>

        <section aria-labelledby="perfil-especialidades" className="space-y-5">
          <h2 id="perfil-especialidades" className={SECTION_TITLE}>
            Especialidades
          </h2>
          <p id="perfil-especialidades-ayuda" className="text-sm leading-relaxed text-ink-600">
            «Medicina General» no pide documentos extra; cualquier otra especialidad requiere tu título de postgrado y la
            credencial de especialidad en la sección de documentos.
          </p>
          <div
            role="group"
            aria-labelledby="perfil-especialidades"
            aria-describedby="perfil-especialidades-ayuda"
            className="flex flex-wrap gap-2.5"
          >
            {specialties.map((s) => {
              const active = selectedSpecialties.includes(s.id);
              return (
                <button
                  type="button"
                  key={s.id}
                  aria-pressed={active}
                  onClick={() => toggleSpecialty(s.id)}
                  className={cn(
                    'min-h-[2.25rem] rounded-full border px-3.5 py-1.5 text-sm transition-colors',
                    active
                      ? 'border-pine-700 bg-pine-700 text-white hover:bg-pine-800'
                      : 'border-ink-300 bg-white text-ink-700 hover:border-ink-400 hover:bg-ink-50',
                  )}
                >
                  {s.name}
                </button>
              );
            })}
          </div>
        </section>

        <section aria-labelledby="perfil-contacto" className="space-y-5">
          <h2 id="perfil-contacto" className={SECTION_TITLE}>
            Contacto y ubicación
          </h2>
          <div className={FIELD_GRID}>
            <Input label="Teléfono" placeholder="0414-1234567" {...register('phone')} />
            <Input label="WhatsApp" placeholder="0414-1234567" {...register('whatsapp')} />
            <Controller
              name="municipality"
              control={control}
              render={({ field }) => (
                <Select
                  label="Municipio"
                  value={field.value ?? ''}
                  onChange={field.onChange}
                  options={municipalityOptions(municipalities, 'Selecciona')}
                />
              )}
            />
          </div>
          <Input label="Dirección de consulta" {...register('address')} />
        </section>

        <section aria-labelledby="perfil-resumen" className="space-y-5">
          <h2 id="perfil-resumen" className={SECTION_TITLE}>
            Resumen y SEO
          </h2>
          <Input label="Título SEO" hint="Máx. 70 caracteres" {...register('seoTitle')} />
          <Textarea
            label="Resumen corto (extracto)"
            rows={2}
            hint="1 o 2 líneas sobre tu práctica; se muestra en Google. Máx. 160 caracteres."
            {...register('seoDescription')}
          />
        </section>

        <div className="border-t border-ink-100 pt-6">
          <Button type="submit" loading={saving} className="w-full sm:w-auto">
            Guardar cambios
          </Button>
        </div>
      </form>

      <SocialLinksManager planTier={planTier} initialLinks={socialLinks} />
      <ExtraLocationsManager />
      <AffiliationsManager />
    </div>
  );
}
