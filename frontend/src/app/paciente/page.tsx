'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useForm, useFieldArray, Controller } from 'react-hook-form';
import { useAuth } from '@/lib/auth-context';
import { api, ApiError } from '@/lib/api';
import { municipalityOptions, useMunicipalities } from '@/lib/catalogs';
import { Input, Textarea } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Switch } from '@/components/ui/Switch';
import { Button } from '@/components/ui/Button';
import { Alert } from '@/components/ui/Alert';
import { FileButton } from '@/components/ui/FileButton';
import { PageSpinner } from '@/components/ui/Spinner';
import { Badge } from '@/components/ui/Badge';

interface Medication {
  name: string;
  schedule: string;
}

interface PatientProfileForm {
  cedula?: string;
  phone?: string;
  birthDate?: string;
  sex?: string;
  bloodType?: string;
  allergies?: string;
  emergencyAddress?: string;
  emergencyMedicalPhone?: string;
  municipality?: string;
  isHealthy: boolean;
  conditionSummary?: string;
  medications: Medication[];
  treatingDoctors: { name: string }[];
}

interface PatientProfileResponse {
  firstName: string | null;
  lastName: string | null;
  cedula: string | null;
  patientCode: string;
  phone: string | null;
  birthDate: string | null;
  sex: string | null;
  bloodType: string | null;
  allergies: string | null;
  emergencyAddress: string | null;
  emergencyMedicalPhone: string | null;
  municipality: string | null;
  isHealthy: boolean;
  conditionSummary: string | null;
  medications: Medication[] | null;
  treatingDoctors: string[] | null;
  photoUrl: string | null;
  idPhotoUrl: string | null;
  hasIdPhoto: boolean;
  identityStatus: 'PENDING' | 'VERIFIED' | 'REJECTED';
  identityReviewNote: string | null;
}

const IDENTITY_BADGE: Record<PatientProfileResponse['identityStatus'], { label: string; tone: 'neutral' | 'amber' | 'pine' | 'red' }> = {
  PENDING: { label: 'En revisión', tone: 'amber' },
  VERIFIED: { label: 'Verificada', tone: 'pine' },
  REJECTED: { label: 'Rechazada', tone: 'red' },
};

const BLOOD_TYPES = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];

export default function PatientProfilePage() {
  const { user } = useAuth();
  const municipalities = useMunicipalities();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [identity, setIdentity] = useState<{
    firstName: string;
    lastName: string;
    cedula: string | null;
    patientCode: string;
  } | null>(null);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [idPhotoUrl, setIdPhotoUrl] = useState<string | null>(null);
  const [identityStatus, setIdentityStatus] = useState<PatientProfileResponse['identityStatus']>('PENDING');
  const [identityReviewNote, setIdentityReviewNote] = useState<string | null>(null);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [uploadingIdPhoto, setUploadingIdPhoto] = useState(false);

  const { register, handleSubmit, reset, control, watch, setValue } = useForm<PatientProfileForm>({
    defaultValues: { isHealthy: false, medications: [], treatingDoctors: [] },
  });

  const medicationsArray = useFieldArray({ control, name: 'medications' });
  const doctorsArray = useFieldArray({ control, name: 'treatingDoctors' });
  const isHealthy = watch('isHealthy');

  const applyProfile = (profile: PatientProfileResponse) => {
    reset({
      cedula: '',
      phone: profile.phone ?? '',
      birthDate: profile.birthDate ?? '',
      sex: profile.sex ?? '',
      bloodType: profile.bloodType ?? '',
      allergies: profile.allergies ?? '',
      emergencyAddress: profile.emergencyAddress ?? '',
      emergencyMedicalPhone: profile.emergencyMedicalPhone ?? '',
      municipality: profile.municipality ?? '',
      isHealthy: profile.isHealthy,
      conditionSummary: profile.conditionSummary ?? '',
      medications: profile.medications ?? [],
      treatingDoctors: (profile.treatingDoctors ?? []).map((name) => ({ name })),
    });
    setIdentity({
      firstName: profile.firstName ?? '',
      lastName: profile.lastName ?? '',
      cedula: profile.cedula,
      patientCode: profile.patientCode,
    });
    setPhotoUrl(profile.photoUrl);
    setIdPhotoUrl(profile.idPhotoUrl);
    setIdentityStatus(profile.identityStatus);
    setIdentityReviewNote(profile.identityReviewNote);
  };

  useEffect(() => {
    api
      .get<PatientProfileResponse>('/patients/me')
      .then(applyProfile)
      .catch((e) => setError(e instanceof ApiError ? e.message : 'No se pudo cargar tu perfil'))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // El switch bloquea el campo de verdad: al activarlo se limpia el valor
  // en el propio formulario (y el servidor también lo descarta).
  const onToggleHealthy = (checked: boolean) => {
    setValue('isHealthy', checked);
    if (checked) setValue('conditionSummary', '');
  };

  const onSubmit = async (values: PatientProfileForm) => {
    setError(null);
    setSuccess(false);
    setSaving(true);
    try {
      const updated = await api.patch<PatientProfileResponse>('/patients/me', {
        cedula: !identity?.cedula && values.cedula ? values.cedula : undefined,
        phone: values.phone || undefined,
        birthDate: values.birthDate || undefined,
        sex: values.sex || undefined,
        bloodType: values.bloodType || undefined,
        allergies: values.allergies ?? undefined,
        emergencyAddress: values.emergencyAddress ?? undefined,
        emergencyMedicalPhone: values.emergencyMedicalPhone || undefined,
        municipality: values.municipality ?? undefined,
        isHealthy: values.isHealthy,
        conditionSummary: values.isHealthy ? undefined : (values.conditionSummary ?? undefined),
        medications: values.medications.filter((m) => m.name.trim() && m.schedule.trim()),
        treatingDoctors: values.treatingDoctors.map((d) => d.name.trim()).filter(Boolean),
      });
      applyProfile(updated);
      setSuccess(true);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'No se pudo guardar tu perfil');
    } finally {
      setSaving(false);
    }
  };

  const upload = async (
    path: string,
    file: File,
    setUploading: (v: boolean) => void,
    fallbackMessage: string,
  ) => {
    setUploading(true);
    setError(null);
    const formData = new FormData();
    formData.append('file', file);
    try {
      const updated = await api.upload<PatientProfileResponse>(path, formData);
      setPhotoUrl(updated.photoUrl);
      setIdPhotoUrl(updated.idPhotoUrl);
      setIdentityStatus(updated.identityStatus);
      setIdentityReviewNote(updated.identityReviewNote);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : fallbackMessage);
    } finally {
      setUploading(false);
    }
  };

  if (loading) return <PageSpinner />;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl">Mi perfil de paciente</h1>
        {identity && <Badge tone="neutral">{identity.patientCode}</Badge>}
      </div>

      <Alert tone="info">
        Tus datos personales y de salud se guardan cifrados. En su agenda, los médicos solo ven tu código{' '}
        <strong>{identity?.patientCode}</strong>; para ver algo más necesitan tu autorización, que controlas en{' '}
        <Link href="/paciente/permisos" className="font-medium underline">
          Permisos
        </Link>
        .
      </Alert>

      <form onSubmit={handleSubmit(onSubmit)} className="card space-y-8 p-6">
        {error && <Alert tone="error">{error}</Alert>}
        {success && <Alert tone="success">Perfil actualizado correctamente.</Alert>}

        <section className="space-y-4">
          <h2 className="border-b border-ink-100 pb-2 text-lg font-semibold text-ink-900">Datos personales</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <Input label="Nombres" value={identity?.firstName ?? ''} disabled hint="No editable aquí" />
            <Input label="Apellidos" value={identity?.lastName ?? ''} disabled hint="No editable aquí" />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            {identity?.cedula ? (
              <Input label="Cédula de identidad" value={identity.cedula} disabled hint="Para corregirla, contacta a soporte" />
            ) : (
              <Input label="Cédula de identidad" placeholder="V-12345678" {...register('cedula')} />
            )}
            <Input label="Correo electrónico" value={user?.email ?? ''} disabled hint="No editable aquí" />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Input label="Teléfono" placeholder="0414-1234567" {...register('phone')} />
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
        </section>

        <section className="space-y-4">
          <h2 className="border-b border-ink-100 pb-2 text-lg font-semibold text-ink-900">Foto de perfil</h2>
          <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
            {photoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={photoUrl} alt="Tu foto de perfil" className="h-20 w-20 flex-shrink-0 rounded-full object-cover" />
            ) : (
              <div className="h-20 w-20 flex-shrink-0 rounded-full bg-ink-100" aria-hidden="true" />
            )}
            <div className="space-y-2">
              <FileButton
                accept="image/jpeg,image/png,image/webp"
                disabled={uploadingPhoto}
                onFile={(file) => void upload('/patients/me/photo', file, setUploadingPhoto, 'No se pudo subir la foto')}
                describedBy="paciente-foto-ayuda"
              >
                {uploadingPhoto ? 'Subiendo…' : photoUrl ? 'Cambiar foto' : 'Subir foto'}
              </FileButton>
              <p id="paciente-foto-ayuda" className="text-xs text-ink-500">
                JPG, PNG o WebP. Máx. 5 MB. Se eliminan los metadatos (incluida la ubicación).
              </p>
            </div>
          </div>
        </section>

        <section className="space-y-4">
          <div className="flex flex-wrap items-center gap-2 border-b border-ink-100 pb-2">
            <h2 className="text-lg font-semibold text-ink-900">Foto de identificación</h2>
            {(idPhotoUrl || identityStatus === 'REJECTED') && (
              <Badge tone={IDENTITY_BADGE[identityStatus].tone}>{IDENTITY_BADGE[identityStatus].label}</Badge>
            )}
          </div>
          <p className="text-sm text-ink-600">
            Una foto legible de tu cédula u otro documento de identidad. Se guarda en almacenamiento privado: solo el equipo
            de verificación la revisa (cada apertura queda registrada) y ningún médico la ve.
          </p>
          {identityStatus === 'REJECTED' && (
            <Alert tone="error">
              No pudimos verificar tu identidad con la foto anterior
              {identityReviewNote ? <>: {identityReviewNote}</> : null}. Por tu privacidad la eliminamos; sube una nueva.
            </Alert>
          )}
          <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
            {idPhotoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={idPhotoUrl} alt="Tu foto de identificación" className="h-20 w-28 flex-shrink-0 rounded-lg border border-ink-200 object-cover" />
            ) : (
              <div className="h-20 w-28 flex-shrink-0 rounded-lg border border-dashed border-ink-300 bg-ink-50" aria-hidden="true" />
            )}
            <div className="space-y-2">
              <FileButton
                accept="image/jpeg,image/png,image/webp"
                disabled={uploadingIdPhoto}
                onFile={(file) =>
                  void upload('/patients/me/id-photo', file, setUploadingIdPhoto, 'No se pudo subir la foto de identificación')
                }
                describedBy="paciente-identidad-ayuda"
              >
                {uploadingIdPhoto ? 'Subiendo…' : idPhotoUrl ? 'Cambiar foto' : 'Subir foto de identificación'}
              </FileButton>
              <p id="paciente-identidad-ayuda" className="text-xs text-ink-500">JPG, PNG o WebP. Máx. 5 MB.</p>
            </div>
          </div>
        </section>

        <section className="space-y-4">
          <h2 className="border-b border-ink-100 pb-2 text-lg font-semibold text-ink-900">Datos médicos básicos</h2>
          <div className="grid gap-4 sm:grid-cols-3">
            <Input label="Fecha de nacimiento" type="date" {...register('birthDate')} />
            <Controller
              name="sex"
              control={control}
              render={({ field }) => (
                <Select
                  label="Sexo"
                  value={field.value ?? ''}
                  onChange={field.onChange}
                  options={[
                    { value: '', label: 'Prefiero no indicarlo' },
                    { value: 'F', label: 'Femenino' },
                    { value: 'M', label: 'Masculino' },
                    { value: 'Otro', label: 'Otro' },
                  ]}
                />
              )}
            />
            <Controller
              name="bloodType"
              control={control}
              render={({ field }) => (
                <Select
                  label="Grupo sanguíneo"
                  value={field.value ?? ''}
                  onChange={field.onChange}
                  options={[{ value: '', label: 'No lo sé' }, ...BLOOD_TYPES.map((t) => ({ value: t, label: t }))]}
                />
              )}
            />
          </div>
          <Textarea label="Alergias" rows={2} placeholder="Ej. Penicilina, mariscos" {...register('allergies')} />
        </section>

        <section className="space-y-4">
          <h2 className="border-b border-ink-100 pb-2 text-lg font-semibold text-ink-900">Medicamentos</h2>
          <p className="text-sm text-ink-600">Los medicamentos que tomas y el horario en que los tomas.</p>
          <div className="space-y-3">
            {medicationsArray.fields.map((field, index) => (
              <div key={field.id} className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
                <Input label="Medicamento" placeholder="Ej. Losartán 50mg" {...register(`medications.${index}.name`)} />
                <Input label="Horario" placeholder="Ej. 8:00 a.m. y 8:00 p.m." {...register(`medications.${index}.schedule`)} />
                <Button type="button" variant="outline" onClick={() => medicationsArray.remove(index)}>
                  Quitar
                </Button>
              </div>
            ))}
          </div>
          <Button type="button" variant="outline" size="sm" onClick={() => medicationsArray.append({ name: '', schedule: '' })}>
            Agregar medicamento
          </Button>
        </section>

        <section className="space-y-4">
          <h2 className="border-b border-ink-100 pb-2 text-lg font-semibold text-ink-900">Resumen de condición</h2>
          <Switch
            checked={isHealthy}
            onChange={onToggleHealthy}
            label="Soy una persona sana"
            hint="Si lo activas, no necesitas describir ninguna condición médica."
          />
          <Textarea
            label="Resumen de tu condición"
            rows={4}
            disabled={isHealthy}
            hint={isHealthy ? 'Bloqueado porque indicaste que eres una persona sana.' : undefined}
            {...register('conditionSummary')}
          />
        </section>

        <section className="space-y-4">
          <h2 className="border-b border-ink-100 pb-2 text-lg font-semibold text-ink-900">Contacto de emergencia</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <Input
              label="Número de emergencia médica"
              placeholder="0414-1234567"
              hint="A quién llamar en caso de una emergencia"
              {...register('emergencyMedicalPhone')}
            />
          </div>
          <Textarea label="Dirección para emergencia" rows={2} {...register('emergencyAddress')} />
        </section>

        <section className="space-y-4">
          <h2 className="border-b border-ink-100 pb-2 text-lg font-semibold text-ink-900">Doctores tratantes</h2>
          <div className="space-y-3">
            {doctorsArray.fields.map((field, index) => (
              <div key={field.id} className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
                <Input label="Nombre del doctor" {...register(`treatingDoctors.${index}.name`)} />
                <Button type="button" variant="outline" onClick={() => doctorsArray.remove(index)}>
                  Quitar
                </Button>
              </div>
            ))}
          </div>
          <Button type="button" variant="outline" size="sm" onClick={() => doctorsArray.append({ name: '' })}>
            Agregar doctor tratante
          </Button>
        </section>

        <Button type="submit" loading={saving} className="w-full sm:w-auto">
          Guardar cambios
        </Button>
      </form>
    </div>
  );
}
