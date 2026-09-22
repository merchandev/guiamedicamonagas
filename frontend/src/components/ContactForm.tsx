'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { api, ApiError } from '@/lib/api';
import { Input, Textarea } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { Alert } from '@/components/ui/Alert';

const schema = z.object({
  senderName: z.string().min(2, 'Ingresa tu nombre'),
  senderEmail: z.string().email('Correo inválido'),
  senderPhone: z
    .string()
    .regex(/^0(412|414|416|424|426)-?\d{7}$/, 'Teléfono inválido (ej. 0414-1234567)')
    .optional()
    .or(z.literal('')),
  content: z.string().min(10, 'Escribe al menos 10 caracteres'),
  website: z.string().max(0).optional(),
});

type FormValues = z.infer<typeof schema>;

export function ContactForm({ professionalSlug }: { professionalSlug: string }) {
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema) });

  const onSubmit = async (values: FormValues) => {
    setError(null);
    try {
      await api.post('/contact', { ...values, professionalSlug });
      setSent(true);
      reset();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'No se pudo enviar el mensaje');
    }
  };

  if (sent) {
    return (
      <Alert tone="success" title="Mensaje enviado">
        El profesional recibirá tu mensaje por correo y en su panel. Te responderá directamente.
      </Alert>
    );
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      {error && <Alert tone="error">{error}</Alert>}
      <Input label="Tu nombre" required {...register('senderName')} error={errors.senderName?.message} />
      <Input label="Tu correo" type="email" required {...register('senderEmail')} error={errors.senderEmail?.message} />
      <Input label="Tu teléfono (opcional)" placeholder="0414-1234567" {...register('senderPhone')} error={errors.senderPhone?.message} />
      <Textarea label="Mensaje" required rows={4} {...register('content')} error={errors.content?.message} />
      <input
        type="text"
        tabIndex={-1}
        aria-hidden="true"
        autoComplete="off"
        className="hidden"
        {...register('website')}
      />
      <Button type="submit" loading={isSubmitting} className="w-full">
        Enviar mensaje
      </Button>
    </form>
  );
}
