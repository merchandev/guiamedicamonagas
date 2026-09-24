'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Controller, useFieldArray, useForm } from 'react-hook-form';
import { api, ApiError } from '@/lib/api';
import { municipalityOptions, useMunicipalities } from '@/lib/catalogs';
import { ORGANIZATION_TYPE_LABELS, PLAN_TIER_LABELS, ORG_VERIFICATION_LABELS } from '@/lib/labels';
import { SOCIAL_PLATFORM_EXAMPLE, SOCIAL_PLATFORM_LABELS, SOCIAL_PLATFORMS, type SocialPlatform } from '@/lib/social';
import { can, useOrganization, type OrgDetail, type OrgType } from '@/components/organization/OrgContext';
import { Alert } from '@/components/ui/Alert';
import { FileButton } from '@/components/ui/FileButton';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Input, Textarea } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';

interface FormValues {
  type: OrgType;
  name: string;
  rif: string;
  description: string;
  openingHours: string;
  services: string;
  insurers: string;
  paymentMethods: string;
  locations: { name: string; address: string; municipality: string; phone: string; whatsapp: string }[];
  social: Record<SocialPlatform, string>;
}

const toList = (text: string) =>
  text
    .split(/[\n,]/)
    .map((s) => s.trim())
    .filter(Boolean);

function toForm(org: OrgDetail): FormValues {
  const social = Object.fromEntries(SOCIAL_PLATFORMS.map((p) => [p, ''])) as Record<SocialPlatform, string>;
  for (const link of org.socialLinks) social[link.platform] = link.url;
  return {
    type: org.type,
    name: org.name,
    rif: org.rif ?? '',
    description: org.description ?? '',
    openingHours: org.openingHours ?? '',
    services: (org.services ?? []).join(', '),
    insurers: (org.insurers ?? []).join(', '),
    paymentMethods: (org.paymentMethods ?? []).join(', '),
    locations: org.locations.map((l) => ({
      name: l.name,
      address: l.address,
      municipality: l.municipality ?? '',
      phone: l.phone ?? '',
      whatsapp: l.whatsapp ?? '',
    })),
    social,
  };
}

export default function OrganizationProfilePage() {
  const { current: org, setCurrent } = useOrganization();
  const municipalities = useMunicipalities();
  const [saving, setSaving] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const { register, handleSubmit, control, reset } = useForm<FormValues>({ defaultValues: org ? toForm(org) : undefined });
  const locations = useFieldArray({ control, name: 'locations' });

  useEffect(() => {
    if (org) reset(toForm(org));
  }, [org, reset]);

  if (!org) return null;
  const identityEditable = can(org, 'EDIT_IDENTITY');
  const status = ORG_VERIFICATION_LABELS[org.verificationStatus];
  const hasPlan = org.planTier === 'ORGANIZATION';

  const onSubmit = async (values: FormValues) => {
    setError(null);
    setSuccess(null);
    setSaving(true);
    try {
      const updated = await api.put<OrgDetail>(`/organizations/me/${org.id}`, {
        type: values.type,
        name: values.name,
        rif: values.rif || undefined,
        description: values.description || undefined,
        openingHours: values.openingHours || undefined,
        services: toList(values.services),
        insurers: toList(values.insurers),
        paymentMethods: toList(values.paymentMethods),
        locations: values.locations.map((l) => ({
          name: l.name,
          address: l.address,
          municipality: l.municipality || undefined,
          phone: l.phone || undefined,
          whatsapp: l.whatsapp || undefined,
        })),
        socialLinks: hasPlan
          ? SOCIAL_PLATFORMS.filter((p) => values.social[p]?.trim()).map((p) => ({ platform: p, url: values.social[p].trim() }))
          : [],
      });
      setCurrent(updated);
      setSuccess(
        updated.verificationStatus === 'VERIFIED'
          ? 'Cambios guardados y publicados.'
          : 'Cambios guardados. Un administrador revisará los datos antes de publicar tu organización.',
      );
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'No se pudieron guardar los cambios');
    } finally {
      setSaving(false);
    }
  };

  const onLogo = async (file: File) => {
    setUploadingLogo(true);
    setError(null);
    const formData = new FormData();
    formData.append('file', file);
    try {
      setCurrent(await api.upload<OrgDetail>(`/organizations/me/${org.id}/logo`, formData));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'No se pudo subir el logo');
    } finally {
      setUploadingLogo(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl">{org.name}</h1>
        {status && <Badge tone={status.tone}>{status.label}</Badge>}
        <Badge tone={PLAN_TIER_LABELS[org.planTier]?.tone ?? 'neutral'}>
          {org.planTier === 'ORGANIZATION' ? 'Plan de organizaciones' : 'Perfil básico gratuito'}
        </Badge>
        {org.isPublished && org.verificationStatus === 'VERIFIED' && (
          <Link href={`/organizaciones/${org.slug}`} className="text-sm text-pine-700 underline">
            Ver perfil público
          </Link>
        )}
      </div>

      {org.verificationStatus !== 'VERIFIED' && (
        <Alert tone={org.verificationStatus === 'REJECTED' ? 'error' : 'info'}>
          {org.verificationStatus === 'REJECTED'
            ? `Un administrador pidió correcciones: ${org.rejectionReason ?? ''}. Corrige los datos y guarda para volver a revisión.`
            : 'Tu organización está pendiente de verificación. Aparecerá en el directorio cuando un administrador apruebe sus datos.'}
        </Alert>
      )}

      <div className="card flex flex-wrap items-center gap-x-5 gap-y-3 p-6">
        {org.logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={org.logoUrl} alt={`Logo de ${org.name}`} className="h-20 w-20 flex-shrink-0 rounded-lg object-cover" />
        ) : (
          <div className="flex h-20 w-20 flex-shrink-0 items-center justify-center rounded-lg bg-ink-100 text-xs text-ink-500">Sin logo</div>
        )}
        <div className="space-y-2">
          <FileButton
            accept="image/jpeg,image/png,image/webp"
            disabled={uploadingLogo}
            onFile={(file) => void onLogo(file)}
            describedBy="organizacion-logo-ayuda"
          >
            {uploadingLogo ? 'Subiendo…' : 'Cambiar logo'}
          </FileButton>
          <p id="organizacion-logo-ayuda" className="text-xs text-ink-500">JPG, PNG o WebP. Máx. 3 MB.</p>
        </div>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="card space-y-8 p-6">
        {error && <Alert tone="error">{error}</Alert>}
        {success && <Alert tone="success">{success}</Alert>}

        <section className="space-y-4">
          <h2 className="border-b border-ink-100 pb-2 text-lg font-semibold text-ink-900">Datos de la organización</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            {/* readOnly (no disabled): react-hook-form descarta los campos deshabilitados al enviar */}
            <Input
              label="Nombre"
              required
              readOnly={!identityEditable}
              hint={identityEditable ? undefined : 'Solo el dueño puede cambiarlo'}
              {...register('name', { required: true })}
            />
            <Controller
              name="type"
              control={control}
              render={({ field }) => (
                <Select
                  label="Tipo"
                  disabled={!identityEditable}
                  value={field.value}
                  onChange={field.onChange}
                  options={(Object.keys(ORGANIZATION_TYPE_LABELS) as OrgType[]).map((t) => ({ value: t, label: ORGANIZATION_TYPE_LABELS[t] }))}
                />
              )}
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Input
              label="RIF"
              placeholder="J-12345678-9"
              readOnly={!identityEditable}
              hint={identityEditable ? undefined : 'Solo el dueño puede cambiarlo'}
              {...register('rif')}
            />
            <Input label="Horario de atención" placeholder="Lun–Sáb 8:00 a.m. – 8:00 p.m." {...register('openingHours')} />
          </div>
          <p className="text-xs text-ink-500">Cambiar nombre, tipo o RIF de una organización verificada la devuelve a revisión.</p>
          <Textarea label="Descripción" rows={3} {...register('description')} />
        </section>

        <section className="space-y-4">
          <h2 className="border-b border-ink-100 pb-2 text-lg font-semibold text-ink-900">Servicios y condiciones</h2>
          <Textarea label="Servicios" rows={2} hint="Separados por coma. Ej. Entrega a domicilio, Toma de muestras" {...register('services')} />
          <div className="grid gap-4 sm:grid-cols-2">
            <Textarea label="Aseguradoras aceptadas" rows={2} hint="Separadas por coma" {...register('insurers')} />
            <Textarea label="Métodos de pago" rows={2} hint="Ej. Pago Móvil, Efectivo, Punto de venta" {...register('paymentMethods')} />
          </div>
        </section>

        <section className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-ink-100 pb-2">
            <h2 className="text-lg font-semibold text-ink-900">Sedes</h2>
            <span className="text-xs text-ink-500">
              {locations.fields.length} de {org.maxLocations} {org.maxLocations === 1 ? 'sede' : 'sedes'} permitidas
            </span>
          </div>
          {locations.fields.map((field, index) => (
            <div key={field.id} className="space-y-3 rounded-lg border border-ink-100 p-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <Input label="Nombre de la sede" required {...register(`locations.${index}.name`, { required: true })} />
                <Controller
                  name={`locations.${index}.municipality`}
                  control={control}
                  render={({ field: f }) => (
                    <Select label="Municipio" value={f.value} onChange={f.onChange} options={municipalityOptions(municipalities, 'Selecciona')} />
                  )}
                />
              </div>
              <Input label="Dirección" required {...register(`locations.${index}.address`, { required: true })} />
              <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
                <Input label="Teléfono" {...register(`locations.${index}.phone`)} />
                <Input label="WhatsApp" {...register(`locations.${index}.whatsapp`)} />
                {locations.fields.length > 1 && (
                  <Button type="button" variant="outline" onClick={() => locations.remove(index)}>
                    Quitar
                  </Button>
                )}
              </div>
            </div>
          ))}
          {locations.fields.length < org.maxLocations ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => locations.append({ name: '', address: '', municipality: '', phone: '', whatsapp: '' })}
            >
              Agregar sede
            </Button>
          ) : (
            !hasPlan && (
              <p className="text-xs text-ink-500">
                El perfil gratuito incluye 1 sede. El{' '}
                <Link href="/organizacion/plan" className="text-pine-700 underline">
                  plan de organizaciones
                </Link>{' '}
                permite varias sedes, redes sociales y médicos asociados.
              </p>
            )
          )}
        </section>

        <section className="space-y-4">
          <h2 className="border-b border-ink-100 pb-2 text-lg font-semibold text-ink-900">Redes sociales y web</h2>
          {hasPlan ? (
            <div className="grid gap-3 sm:grid-cols-2">
              {SOCIAL_PLATFORMS.map((p) => (
                <Input key={p} label={SOCIAL_PLATFORM_LABELS[p]} placeholder={SOCIAL_PLATFORM_EXAMPLE[p]} {...register(`social.${p}`)} />
              ))}
            </div>
          ) : (
            <p className="text-sm text-ink-500">Disponible con el plan de organizaciones.</p>
          )}
        </section>

        <Button type="submit" loading={saving} className="w-full sm:w-auto">
          Guardar cambios
        </Button>
      </form>
    </div>
  );
}
