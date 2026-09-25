'use client';

import { useState } from 'react';
import Link from 'next/link';
import { api, ApiError } from '@/lib/api';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { EmptyState } from '@/components/ui/EmptyState';
import {
  DOCTOR_SOCIAL_LIMITS,
  SOCIAL_PLATFORM_EXAMPLE,
  SOCIAL_PLATFORM_ICONS,
  SOCIAL_PLATFORM_LABELS,
  type SocialLink,
  type SocialPlatform,
} from '@/lib/social';
import type { PlanTier } from '@/lib/types';

export function SocialLinksManager({ planTier, initialLinks }: { planTier: PlanTier; initialLinks: SocialLink[] }) {
  const limits = DOCTOR_SOCIAL_LIMITS[planTier];
  const [links, setLinks] = useState<SocialLink[]>(initialLinks);
  const [platform, setPlatform] = useState<SocialPlatform | ''>('');
  const [url, setUrl] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const availablePlatforms = limits.allowedPlatforms.filter((p) => !links.some((l) => l.platform === p));
  const atMax = links.length >= limits.maxLinks;

  const save = async (next: SocialLink[]) => {
    setError(null);
    setSaving(true);
    try {
      // Solo plataforma y enlace: las filas guardadas traen id y fechas, y
      // reenviarlas hacía fallar el guardado a partir de la segunda red.
      const saved = await api.put<SocialLink[]>('/professionals/me/social-links', {
        links: next.map(({ platform, url }) => ({ platform, url })),
      });
      setLinks(saved);
      return true;
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'No se pudieron guardar tus redes');
      return false;
    } finally {
      setSaving(false);
    }
  };

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!platform || !url) return;
    const ok = await save([...links, { platform, url }]);
    if (ok) {
      setPlatform('');
      setUrl('');
    }
  };

  const remove = async (target: SocialPlatform) => {
    await save(links.filter((l) => l.platform !== target));
  };

  if (limits.maxLinks === 0) {
    return (
      <EmptyState
        title="Redes sociales y web es un beneficio desde el plan Profesional Plus"
        description="Actualiza tu plan para mostrar tus redes sociales y tu sitio web en tu perfil público."
        action={
          <Link href="/dashboard/pagos">
            <Button>Ver planes</Button>
          </Link>
        }
      />
    );
  }

  return (
    <div className="card space-y-6 p-6">
      <div>
        <h2 className="text-lg font-semibold text-ink-900">Redes sociales y web</h2>
        <p className="mt-1 text-sm text-ink-600">
          Tu plan permite hasta {limits.maxLinks} {limits.maxLinks === 1 ? 'ícono' : 'íconos'} sin repetir, con la URL
          oficial de cada red (ej. instagram.com/tu_usuario).
        </p>
      </div>
      {error && <Alert tone="error">{error}</Alert>}

      {links.length > 0 && (
        <ul className="space-y-2">
          {links.map((link) => {
            const Icon = SOCIAL_PLATFORM_ICONS[link.platform];
            return (
              <li key={link.platform} className="flex items-center justify-between rounded-lg border border-ink-100 p-3 text-sm">
                <div className="flex min-w-0 items-center gap-2">
                  <Icon className="h-4 w-4 flex-shrink-0 text-ink-500" />
                  <div className="min-w-0">
                    <p className="font-medium text-ink-800">{SOCIAL_PLATFORM_LABELS[link.platform]}</p>
                    <p className="truncate text-ink-500">{link.url}</p>
                  </div>
                </div>
                <Button variant="ghost" size="sm" loading={saving} onClick={() => remove(link.platform)}>
                  Eliminar
                </Button>
              </li>
            );
          })}
        </ul>
      )}

      {atMax ? (
        <p className="text-xs text-ink-400">Ya agregaste el máximo de redes/web de tu plan.</p>
      ) : (
        <form onSubmit={add} className="grid gap-3 sm:grid-cols-[160px_1fr_auto] sm:items-end">
          <Select
            label="Red"
            value={platform}
            onChange={(v) => setPlatform(v as SocialPlatform)}
            options={availablePlatforms.map((p) => ({ value: p, label: SOCIAL_PLATFORM_LABELS[p] }))}
          />
          <Input
            label="URL oficial"
            placeholder={platform ? SOCIAL_PLATFORM_EXAMPLE[platform] : 'Selecciona una red primero'}
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            hint={platform ? `Ej. ${SOCIAL_PLATFORM_EXAMPLE[platform]}` : undefined}
          />
          <Button type="submit" loading={saving} disabled={!platform || !url}>
            Agregar
          </Button>
        </form>
      )}
    </div>
  );
}
