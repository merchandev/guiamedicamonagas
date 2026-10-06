'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useFieldArray, useForm } from 'react-hook-form';
import { api, ApiError } from '@/lib/api';
import { formatDate } from '@/lib/dates';
import { PRESCRIPTION_CONTROLLED_NOTICE } from '@/lib/legal';
import {
  ADMINISTRATION_ROUTES,
  PHARMACEUTICAL_FORMS,
  type DirectoryPatient,
  type DoctorPrescription,
  type PrescriptionPad,
} from '@/lib/prescriptions';
import { MissingRequirements } from '@/components/prescriptions/MissingRequirements';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Input, Textarea } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { PageSpinner } from '@/components/ui/Spinner';

const MAX_ITEMS = 8;
const DAY_MS = 24 * 60 * 60 * 1000;
const CEDULA_PATTERN = { value: /^[VEJPGvejpg]-?[\d.]{5,11}$/, message: 'Cédula inválida (ej. V-12345678)' };

interface ItemForm {
  activeIngredient: string;
  concentration: string;
  pharmaceuticalForm: string;
  route: string;
  dose: string;
  duration: string;
  quantity: string;
  brandNames: string;
  nonSubstitutable: boolean;
  instructions: string;
}

interface IssueForm {
  patientId: string;
  patientName: string;
  patientCedula: string;
  patientBirthYear: string;
  minorWithoutId: boolean;
  guardianName: string;
  guardianCedula: string;
  items: ItemForm[];
  pharmacistNotes: string;
  patientInstructions: string;
  validityDays: string;
}

const EMPTY_ITEM: ItemForm = {
  activeIngredient: '',
  concentration: '',
  pharmaceuticalForm: '',
  route: 'oral',
  dose: '',
  duration: '',
  quantity: '',
  brandNames: '',
  nonSubstitutable: false,
  instructions: '',
};

const EMPTY_FORM: IssueForm = {
  patientId: '',
  patientName: '',
  patientCedula: '',
  patientBirthYear: '',
  minorWithoutId: false,
  guardianName: '',
  guardianCedula: '',
  items: [EMPTY_ITEM],
  pharmacistNotes: '',
  patientInstructions: '',
  validityDays: '30',
};

/** Un récipe anterior como base: mismos medicamentos y paciente (sin entregarlo a nadie). */
function fromSource(source: DoctorPrescription, validityDays: number): IssueForm {
  const { patient, items, pharmacistNotes, patientInstructions } = source.content;
  return {
    ...EMPTY_FORM,
    patientName: patient.fullName,
    patientCedula: patient.cedula ?? '',
    patientBirthYear: String(patient.birthYear),
    minorWithoutId: !patient.cedula,
    guardianName: patient.guardian?.fullName ?? '',
    guardianCedula: patient.guardian?.cedula ?? '',
    items: items.map((item) => ({
      ...item,
      quantity: item.quantity ?? '',
      brandNames: item.brandNames ?? '',
      instructions: item.instructions ?? '',
    })),
    pharmacistNotes: pharmacistNotes ?? '',
    patientInstructions: patientInstructions ?? '',
    validityDays: String(validityDays),
  };
}

const optional = (value: string) => value.trim() || undefined;

export function PrescriptionForm({ sourceId }: { sourceId: string | null }) {
  const router = useRouter();
  const [pad, setPad] = useState<PrescriptionPad | null>(null);
  const [patients, setPatients] = useState<DirectoryPatient[]>([]);
  const [error, setError] = useState<string | null>(null);
  const { register, handleSubmit, reset, control, watch, setValue, formState } = useForm<IssueForm>({ defaultValues: EMPTY_FORM });
  const itemsArray = useFieldArray({ control, name: 'items' });
  const errors = formState.errors;

  useEffect(() => {
    Promise.all([
      api.get<PrescriptionPad>('/prescriptions/pad'),
      api.get<DirectoryPatient[]>('/prescriptions/patients').catch(() => [] as DirectoryPatient[]),
      sourceId ? api.get<DoctorPrescription>(`/prescriptions/${sourceId}`).catch(() => null) : Promise.resolve(null),
    ]).then(
      ([loadedPad, loadedPatients, source]) => {
        setPad(loadedPad);
        setPatients(loadedPatients);
        const days = loadedPad.pad.defaultValidityDays;
        reset(source ? fromSource(source, days) : { ...EMPTY_FORM, validityDays: String(days) });
      },
      (e) => setError(e instanceof ApiError ? e.message : 'No se pudo cargar tu talonario'),
    );
  }, [reset, sourceId]);

  const minor = watch('minorWithoutId');
  const patientId = watch('patientId');
  const validity = Number(watch('validityDays')) || 0;

  const pickPatient = (value: string) => {
    setValue('patientId', value);
    const chosen = patients.find((p) => p.patientId === value);
    if (chosen?.name) setValue('patientName', chosen.name);
  };

  const onSubmit = async (values: IssueForm) => {
    setError(null);
    const label = values.patientName.trim();
    if (!window.confirm(`¿Emitir el récipe para ${label}? Un récipe emitido no se edita: si tiene un error, lo anulas y emites otro.`)) return;
    try {
      const created = await api.post<DoctorPrescription>('/prescriptions', {
        ...(values.patientId ? { patientId: values.patientId } : {}),
        patientName: values.patientName,
        ...(values.minorWithoutId
          ? { guardianName: values.guardianName, guardianCedula: values.guardianCedula }
          : { patientCedula: values.patientCedula }),
        patientBirthYear: Number(values.patientBirthYear),
        items: values.items.map((item) => ({
          activeIngredient: item.activeIngredient,
          concentration: item.concentration,
          pharmaceuticalForm: item.pharmaceuticalForm,
          route: item.route,
          dose: item.dose,
          duration: item.duration,
          quantity: optional(item.quantity),
          brandNames: optional(item.brandNames),
          nonSubstitutable: item.nonSubstitutable,
          instructions: optional(item.instructions),
        })),
        pharmacistNotes: optional(values.pharmacistNotes),
        patientInstructions: optional(values.patientInstructions),
        validityDays: Number(values.validityDays),
      });
      router.push(`/dashboard/recipes/${created.id}`);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'No se pudo emitir el récipe');
    }
  };

  if (!pad) return error ? <Alert tone="error">{error}</Alert> : <PageSpinner />;
  if (!pad.canIssue) return <MissingRequirements pad={pad} />;

  const required = (message: string) => ({ required: message, validate: (v: string) => v.trim() !== '' || message });

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-8">
      <Alert tone="warning">{PRESCRIPTION_CONTROLLED_NOTICE}</Alert>

      <section aria-labelledby="rx-paciente" className="card space-y-4 p-5">
        <h2 id="rx-paciente" className="text-lg font-semibold text-ink-900">
          Paciente
        </h2>
        {patients.length > 0 && (
          <Select
            label="Enviarlo también a «Mis récipes» de un paciente de tu directorio (opcional)"
            value={patientId}
            onChange={pickPatient}
            options={[
              { value: '', label: 'No: lo comparto yo (PDF, WhatsApp o correo)' },
              ...patients.map((p) => ({ value: p.patientId, label: p.name ? `${p.name} · ${p.patientCode}` : p.patientCode })),
            ]}
          />
        )}
        <p className="text-xs text-ink-600">
          Si el paciente tiene cuenta y no está en tu directorio, puede agregar el récipe a «Mis récipes» con su código, siempre
          que la cédula del récipe sea la suya.
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Input
              label="Nombre y apellidos"
              required
              maxLength={120}
              error={errors.patientName?.message}
              {...register('patientName', required('Escribe el nombre y apellido del paciente'))}
            />
          </div>
          {!minor && (
            <Input
              label="Cédula"
              required
              placeholder="V-12345678"
              maxLength={14}
              error={errors.patientCedula?.message}
              {...register('patientCedula', { ...required('Escribe la cédula del paciente'), pattern: CEDULA_PATTERN })}
            />
          )}
          <Input
            label="Año de nacimiento"
            required
            type="number"
            inputMode="numeric"
            min={1900}
            max={new Date().getFullYear()}
            placeholder="1985"
            error={errors.patientBirthYear?.message}
            {...register('patientBirthYear', required('Escribe el año de nacimiento'))}
          />
        </div>
        <label className="flex items-start gap-2 text-sm text-ink-800">
          <input type="checkbox" className="mt-0.5 h-4 w-4 rounded border-ink-300 text-pine-700" {...register('minorWithoutId')} />
          <span>Es menor de edad y no tiene cédula: va la de su representante.</span>
        </label>
        {minor && (
          <div className="grid gap-4 sm:grid-cols-2">
            <Input
              label="Nombre del representante"
              required
              maxLength={120}
              error={errors.guardianName?.message}
              {...register('guardianName', required('Escribe el nombre del representante'))}
            />
            <Input
              label="Cédula del representante"
              required
              placeholder="V-12345678"
              maxLength={14}
              error={errors.guardianCedula?.message}
              {...register('guardianCedula', { ...required('Escribe la cédula del representante'), pattern: CEDULA_PATTERN })}
            />
          </div>
        )}
      </section>

      <section aria-labelledby="rx-medicamentos" className="space-y-4">
        <div>
          <h2 id="rx-medicamentos" className="text-lg font-semibold text-ink-900">
            Medicamentos
          </h2>
          <p className="mt-1 text-sm text-ink-600">
            Por el principio activo o Denominación Común Internacional (DCI), con su concentración, forma, vía, dosis y duración.
            Hasta {MAX_ITEMS} por récipe.
          </p>
        </div>
        <datalist id="rx-formas">
          {PHARMACEUTICAL_FORMS.map((form) => (
            <option key={form} value={form} />
          ))}
        </datalist>
        <datalist id="rx-vias">
          {ADMINISTRATION_ROUTES.map((route) => (
            <option key={route} value={route} />
          ))}
        </datalist>
        {itemsArray.fields.map((field, index) => {
          const itemErrors = errors.items?.[index];
          return (
            <fieldset key={field.id} className="card space-y-4 p-5">
              <legend className="sr-only">Medicamento {index + 1}</legend>
              <div className="flex items-center justify-between gap-2">
                <p aria-hidden="true" className="font-semibold text-ink-900">
                  Medicamento {index + 1}
                </p>
                {itemsArray.fields.length > 1 && (
                  <Button type="button" size="sm" variant="ghost" onClick={() => itemsArray.remove(index)}>
                    Quitar
                  </Button>
                )}
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <Input
                  label="Principio activo (DCI)"
                  required
                  placeholder="Amoxicilina"
                  maxLength={120}
                  error={itemErrors?.activeIngredient?.message}
                  {...register(`items.${index}.activeIngredient`, required('Escribe el principio activo'))}
                />
                <Input
                  label="Concentración"
                  required
                  placeholder="500 mg"
                  maxLength={60}
                  error={itemErrors?.concentration?.message}
                  {...register(`items.${index}.concentration`, required('Escribe la concentración'))}
                />
                <Input
                  label="Forma farmacéutica"
                  required
                  list="rx-formas"
                  placeholder="Cápsulas"
                  maxLength={60}
                  error={itemErrors?.pharmaceuticalForm?.message}
                  {...register(`items.${index}.pharmaceuticalForm`, required('Escribe la forma farmacéutica'))}
                />
                <Input
                  label="Vía de administración"
                  required
                  list="rx-vias"
                  maxLength={40}
                  error={itemErrors?.route?.message}
                  {...register(`items.${index}.route`, required('Escribe la vía de administración'))}
                />
                <Input
                  label="Dosis"
                  required
                  placeholder="1 cápsula cada 8 horas"
                  maxLength={160}
                  error={itemErrors?.dose?.message}
                  {...register(`items.${index}.dose`, required('Escribe la dosis'))}
                />
                <Input
                  label="Duración del tratamiento"
                  required
                  placeholder="7 días"
                  maxLength={60}
                  error={itemErrors?.duration?.message}
                  {...register(`items.${index}.duration`, required('Escribe la duración'))}
                />
                <Input label="Cantidad a dispensar (opcional)" placeholder="21 cápsulas" maxLength={60} {...register(`items.${index}.quantity`)} />
                <Input
                  label="Marcas comerciales equivalentes (opcional)"
                  placeholder="Dos o más, separadas por coma"
                  maxLength={120}
                  {...register(`items.${index}.brandNames`)}
                />
                <div className="sm:col-span-2">
                  <Input
                    label="Indicación para el paciente (opcional)"
                    placeholder="Tomar con alimentos"
                    maxLength={300}
                    {...register(`items.${index}.instructions`)}
                  />
                </div>
              </div>
              <label className="flex items-start gap-2 text-sm text-ink-800">
                <input type="checkbox" className="mt-0.5 h-4 w-4 rounded border-ink-300 text-pine-700" {...register(`items.${index}.nonSubstitutable`)} />
                <span>Insustituible: la farmacia no puede cambiarlo por otro equivalente.</span>
              </label>
            </fieldset>
          );
        })}
        {itemsArray.fields.length < MAX_ITEMS && (
          <Button type="button" variant="outline" size="sm" onClick={() => itemsArray.append({ ...EMPTY_ITEM })}>
            Agregar medicamento
          </Button>
        )}
      </section>

      <section aria-labelledby="rx-notas" className="card space-y-4 p-5">
        <h2 id="rx-notas" className="text-lg font-semibold text-ink-900">
          Indicaciones y vigencia
        </h2>
        <Textarea
          label="Indicaciones generales al paciente (opcional)"
          rows={4}
          maxLength={1500}
          placeholder="Reposo relativo, abundante agua y control en dos semanas."
          {...register('patientInstructions')}
        />
        <Textarea
          label="Advertencias al farmacéutico (opcional)"
          rows={2}
          maxLength={500}
          hint="Van en el cuerpo del récipe, que queda en la farmacia."
          {...register('pharmacistNotes')}
        />
        <div className="w-full sm:w-64">
          <Input
            label="Vigencia (días)"
            required
            type="number"
            min={1}
            max={365}
            hint={validity > 0 && validity <= 365 ? `Vence el ${formatDate(Date.now() + validity * DAY_MS, { dateStyle: 'long' })}.` : 'Entre 1 y 365 días.'}
            error={errors.validityDays?.message}
            {...register('validityDays', required('Indica la vigencia'))}
          />
        </div>
      </section>

      {error && <Alert tone="error">{error}</Alert>}
      <div className="flex flex-wrap gap-3">
        <Button type="submit" loading={formState.isSubmitting}>
          Emitir récipe
        </Button>
        <Link href="/dashboard/recipes" className="inline-flex h-11 items-center rounded-lg px-4 text-sm font-medium text-ink-700 hover:bg-ink-100">
          Cancelar
        </Link>
      </div>
    </form>
  );
}
