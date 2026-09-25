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
import { municipalityOptions, useMunicipalities } from '@/lib/catalogs';
import { AffiliationsManager } from '@/components/AffiliationsManager';
import { PlanTier, ProfessionalProgress, Specialty } from '@/lib/types';
import { PLAN_TIER_LABELS } from '@/lib/labels';
import { ExtraLocationsManager } from '@/components/ExtraLocationsManager';
import { SocialLinksManager } from '@/components/SocialLinksManager';
import { ProfessionalProgressCard } from '@/components/ProfessionalProgressCard';
import type { SocialLink } from '@/lib/social';
import { FileButton } from '@/components/ui/FileButton';
import { cn } from '@/lib/cn';
import { doctorSeoDescription, doctorSeoTitle } from '@/lib/seo';

// Separación uniforme entre secciones y campos: ningún campo queda pegado al de al lado.
const SECTION_TITLE = 'border-b border-ink-100 pb-3 text-lg font-semibold text-ink-900';
const FIELD_GRID = 'grid gap-x-6 gap-y-5 sm:grid-cols-2';

/** Campos que el médico edita en este formulario (y solo esos se envían). */
const FORM_FIELDS = [
  'firstName',
  'lastName',
  'bio',
  'cedula',
  'rif',
  'mppsNumber',
  'colmedMonagasNumber',
  'phone',
  'whatsapp',
  'municipality',
  'address',
  'seoDescription',
] as const;

type OwnProfileForm = Record<(typeof FORM_FIELDS)[number], string>;

interface OwnProfile extends Partial<Record<(typeof FORM_FIELDS)[number], string | null>> {
  slug: string;
  photoUrl: string | null;
  planTier: PlanTier;
  isPublished: boolean;
  bookingEnabled: boolean;
  specialties: { specialty: { id: string; name: string } }[];
  socialLinks: SocialLink[];
  progress: ProfessionalProgress;
}

/** Del perfil que devuelve la API, solo lo editable y sin nulos (los campos vacíos se ven vacíos). */
function toForm(profile: OwnProfile): OwnProfileForm {
  return Object.fromEntries(FORM_FIELDS.map((field) => [field, profile[field] ?? ''])) as OwnProfileForm;
}

const PLAN_ORDER: PlanTier[] = ['FREE', 'PROFESSIONAL', 'PROFESSIONAL_PLUS', 'PREMIUM'];
const showsBio = (tier: PlanTier) => PLAN_ORDER.indexOf(tier) >= PLAN_ORDER.indexOf('PROFESSIONAL');

export default function EditProfilePage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [profile, setProfile] = useState<OwnProfile | null>(null);
  const [specialties, setSpecialties] = useState<Specialty[]>([]);
  const [selectedSpecialties, setSelectedSpecialties] = useState<string[]>([]);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const municipalities = useMunicipalities();

  const { register, handleSubmit, reset, control, watch } = useForm<OwnProfileForm>();
  const values = watch();

  const applyProfile = (loaded: OwnProfile) => {
    setProfile(loaded);
    reset(toForm(loaded));
    setSelectedSpecialties(loaded.specialties.map((s) => s.specialty.id));
    setPhotoUrl(loaded.photoUrl);
  };

  useEffect(() => {
    Promise.all([api.get<OwnProfile>('/professionals/me'), api.get<Specialty[]>('/specialties')])
      .then(([loaded, allSpecialties]) => {
        applyProfile(loaded);
        setSpecialties(allSpecialties);
      })
      .catch((e) => setError(e instanceof ApiError ? e.message : 'No se pudo cargar tu perfil'))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggleSpecialty = (id: string) => {
    setSelectedSpecialties((prev) => (prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id]));
  };

  const onSubmit = async (form: OwnProfileForm) => {
    setError(null);
    setSuccess(false);
    setSaving(true);
    try {
      // Solo los campos del formulario; un campo vacío borra el dato. Antes se
      // reenviaba el perfil completo (id, slug, progreso…) y la API lo rechazaba.
      const payload = Object.fromEntries(FORM_FIELDS.map((field) => [field, (form[field] ?? '').trim()]));
      await api.patch('/professionals/me', { ...payload, specialtyIds: selectedSpecialties });
      applyProfile(await api.get<OwnProfile>('/professionals/me'));
      setSuccess(true);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'No se pudo guardar el perfil');
    } finally {
      setSaving(false);
    }
  };

  const onPhotoChange = async (file: File) => {
    setUploadingPhoto(true);
    setError(null);
    const formData = new FormData();
    formData.append('file', file);
    try {
      const updated = await api.upload<{ photoUrl: string | null }>('/professionals/me/photo', formData);
      setPhotoUrl(updated.photoUrl);
      applyProfile(await api.get<OwnProfile>('/professionals/me'));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'No se pudo subir la foto');
    } finally {
      setUploadingPhoto(false);
    }
  };

  if (loading) return <PageSpinner />;
  if (!profile) return <Alert tone="error">{error ?? 'No se pudo cargar tu perfil'}</Alert>;

  const planTier = profile.planTier ?? 'FREE';
  // Vista previa en vivo del SEO automático (misma función que la ficha pública).
  const seoInput = {
    firstName: values.firstName ?? '',
    lastName: values.lastName ?? '',
    specialties: specialties.filter((s) => selectedSpecialties.includes(s.id)).map((s) => s.name),
    municipality: values.municipality || null,
    summary: values.seoDescription || null,
    bio: showsBio(planTier) ? values.bio || null : null,
    bookingEnabled: profile.bookingEnabled,
  };
  const previewTitle = doctorSeoTitle(seoInput);
  const previewDescription = doctorSeoDescription(seoInput);
  const siteHost = (process.env.NEXT_PUBLIC_SITE_URL ?? 'https://guiamedicamonagas.com').replace(/^https?:\/\//, '');

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl">Mi perfil profesional</h1>
        {PLAN_TIER_LABELS[planTier] && <Badge tone={PLAN_TIER_LABELS[planTier].tone}>{PLAN_TIER_LABELS[planTier].label}</Badge>}
      </div>

      <ProfessionalProgressCard progress={profile.progress} isPublished={profile.isPublished} />

      <form onSubmit={handleSubmit(onSubmit)} className="card space-y-10 p-6 sm:p-8" noValidate>
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
                Obligatoria para publicarte. JPG, PNG o WebP; las fotos grandes del teléfono se ajustan solas. También
                acompaña tu ficha cuando se comparte por WhatsApp o redes.
              </p>
            </div>
          </div>
        </section>

        <section aria-labelledby="perfil-basica" className="space-y-5">
          <h2 id="perfil-basica" className={SECTION_TITLE}>
            Información básica
          </h2>
          <div className={FIELD_GRID}>
            <Input id="perfil-nombres" label="Nombres" required {...register('firstName')} />
            <Input id="perfil-apellidos" label="Apellidos" required {...register('lastName')} />
          </div>
          <Textarea
            id="perfil-biografia"
            label="Biografía profesional"
            rows={4}
            {...register('bio')}
            hint="Obligatoria para publicarte (mínimo 80 caracteres). Cuéntale a los pacientes sobre tu formación y experiencia."
          />
          <div className={FIELD_GRID}>
            <Input
              id="perfil-cedula"
              label="Cédula de identidad"
              placeholder="V-12345678"
              hint="Privada: solo la ve el equipo que verifica tus documentos."
              {...register('cedula')}
            />
            <Input
              id="perfil-rif"
              label="RIF"
              placeholder="V-12345678-9"
              hint="Privado: nunca se muestra ni se puede buscar."
              {...register('rif')}
            />
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
            <Input id="perfil-mpps" label="N° Registro MPPS (SACS)" {...register('mppsNumber')} />
            <Input id="perfil-colmed" label="N° Colegio de Médicos Monagas" {...register('colmedMonagasNumber')} />
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
            <Input id="perfil-telefono" label="Teléfono" placeholder="0414-1234567" {...register('phone')} />
            <Input id="perfil-whatsapp" label="WhatsApp" placeholder="0414-1234567" {...register('whatsapp')} />
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
          <Input
            id="perfil-direccion"
            label="Dirección de consulta"
            hint="Se muestra en tu ficha para que los pacientes lleguen; no se puede buscar por ella."
            {...register('address')}
          />
        </section>

        <section aria-labelledby="perfil-resumen" className="space-y-5">
          <h2 id="perfil-resumen" className={SECTION_TITLE}>
            Resumen para buscadores
          </h2>
          <Textarea
            id="perfil-resumen-corto"
            label="Resumen corto (extracto)"
            rows={2}
            maxLength={160}
            hint={`1 o 2 líneas sobre tu práctica. Con tu nombre y especialidad forma la descripción que muestra Google. ${(values.seoDescription ?? '').length}/160 caracteres.`}
            {...register('seoDescription')}
          />
          <div className="rounded-lg border border-ink-200 bg-ink-50/50 p-4" aria-label="Vista previa en Google">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-400">
              Así te verán en Google (se genera solo)
            </p>
            <p className="truncate text-xs text-ink-500">
              {siteHost} › medicos › {profile.slug}
            </p>
            <p className="mt-0.5 text-lg leading-snug text-[#1a0dab]">{previewTitle}</p>
            <p className="mt-1 text-sm leading-relaxed text-ink-600">{previewDescription}</p>
          </div>
        </section>

        <div className="border-t border-ink-100 pt-6">
          <Button type="submit" loading={saving} className="w-full sm:w-auto">
            Guardar cambios
          </Button>
        </div>
      </form>

      <SocialLinksManager planTier={planTier} initialLinks={profile.socialLinks ?? []} />
      <ExtraLocationsManager />
      <AffiliationsManager />
    </div>
  );
}
