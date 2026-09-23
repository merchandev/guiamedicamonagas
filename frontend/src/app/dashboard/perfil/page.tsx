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
import { MONAGAS_MUNICIPALITIES } from '@/lib/monagas';
import { PlanTier, Specialty } from '@/lib/types';
import { PLAN_TIER_LABELS } from '@/lib/labels';
import { ExtraLocationsManager } from '@/components/ExtraLocationsManager';
import { SocialLinksManager } from '@/components/SocialLinksManager';
import type { SocialLink } from '@/lib/social';

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

  const onPhotoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
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
      <div className="flex items-center gap-3">
        <h1 className="text-2xl">Mi perfil profesional</h1>
        {PLAN_TIER_LABELS[planTier] && <Badge tone={PLAN_TIER_LABELS[planTier].tone}>{PLAN_TIER_LABELS[planTier].label}</Badge>}
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="card space-y-8 p-6">
        {error && <Alert tone="error">{error}</Alert>}
        {success && <Alert tone="success">Perfil actualizado correctamente.</Alert>}

        <section>
          <div className="flex items-center gap-4">
            {photoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={photoUrl} alt="Foto de perfil" className="h-20 w-20 rounded-full object-cover" />
            ) : (
              <div className="h-20 w-20 rounded-full bg-ink-100" />
            )}
            <div>
              <label className="cursor-pointer rounded-lg border border-ink-200 px-3 py-2 text-sm font-medium text-ink-700 hover:bg-ink-50">
                {uploadingPhoto ? 'Subiendo…' : 'Cambiar foto'}
                <input type="file" accept="image/*" className="hidden" onChange={onPhotoChange} disabled={uploadingPhoto} />
              </label>
              <p className="mt-1 text-xs text-ink-400">JPG, PNG o WebP. Máx. 5MB.</p>
            </div>
          </div>
        </section>

        <section className="space-y-4">
          <h2 className="border-b border-ink-100 pb-2 text-lg font-semibold text-ink-900">Información básica</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <Input label="Nombres" required {...register('firstName')} />
            <Input label="Apellidos" required {...register('lastName')} />
          </div>
          <Textarea label="Biografía" rows={4} {...register('bio')} hint="Cuéntale a los pacientes sobre tu experiencia" />
          <div className="grid gap-4 sm:grid-cols-2">
            <Input label="Cédula de identidad" placeholder="V-12345678" {...register('cedula')} />
            <Input label="RIF" placeholder="V-12345678-9" {...register('rif')} />
          </div>
        </section>

        <section className="space-y-4">
          <h2 className="border-b border-pine-100 pb-2 text-lg font-semibold text-pine-800">
            Avales legales y gremiales (Monagas)
          </h2>
          <p className="text-sm text-ink-600">
            Estos números se muestran públicamente en tu perfil verificado, según las normativas del MPPS y el
            Colegio de Médicos de Monagas.
          </p>
          <div className="grid gap-4 sm:grid-cols-2">
            <Input label="N° Registro MPPS (SACS)" {...register('mppsNumber')} />
            <Input label="N° Colegio de Médicos Monagas" {...register('colmedMonagasNumber')} />
          </div>
        </section>

        <section className="space-y-4">
          <h2 className="border-b border-ink-100 pb-2 text-lg font-semibold text-ink-900">Especialidades</h2>
          <p className="text-sm text-ink-600">
            Si seleccionas alguna especialidad, deberás subir tu título de postgrado y credencial de especialidad en
            la sección de documentos.
          </p>
          <div className="flex flex-wrap gap-2">
            {specialties.map((s) => (
              <button
                type="button"
                key={s.id}
                onClick={() => toggleSpecialty(s.id)}
                className={`rounded-full border px-3 py-1.5 text-sm ${
                  selectedSpecialties.includes(s.id)
                    ? 'border-pine-700 bg-pine-700 text-white'
                    : 'border-ink-200 text-ink-600 hover:bg-ink-50'
                }`}
              >
                {s.name}
              </button>
            ))}
          </div>
        </section>

        <section className="space-y-4">
          <h2 className="border-b border-ink-100 pb-2 text-lg font-semibold text-ink-900">Contacto y ubicación</h2>
          <div className="grid gap-4 sm:grid-cols-2">
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
                  options={[
                    { value: '', label: 'Selecciona' },
                    ...MONAGAS_MUNICIPALITIES.map((m) => ({ value: m, label: m })),
                  ]}
                />
              )}
            />
          </div>
          <Input label="Dirección de consulta" {...register('address')} />
        </section>

        <section className="space-y-4">
          <h2 className="border-b border-ink-100 pb-2 text-lg font-semibold text-ink-900">SEO del perfil</h2>
          <Input label="Título SEO" hint="Máx. 70 caracteres" {...register('seoTitle')} />
          <Textarea label="Meta descripción" rows={2} hint="Máx. 160 caracteres" {...register('seoDescription')} />
        </section>

        <Button type="submit" loading={saving} className="w-full sm:w-auto">
          Guardar cambios
        </Button>
      </form>

      <SocialLinksManager planTier={planTier} initialLinks={socialLinks} />
      <ExtraLocationsManager />
    </div>
  );
}
