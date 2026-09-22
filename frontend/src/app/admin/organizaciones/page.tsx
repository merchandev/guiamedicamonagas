'use client';

import { useEffect, useState } from 'react';
import { api, ApiError } from '@/lib/api';
import { Alert } from '@/components/ui/Alert';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { PageSpinner } from '@/components/ui/Spinner';
import { MONAGAS_MUNICIPALITIES } from '@/lib/monagas';
import { Organization } from '@/lib/types';
import { VerificationBadge } from '@/components/VerificationBadge';
import { SocialLinksRow } from '@/components/SocialLinksRow';
import {
  SOCIAL_PLATFORM_EXAMPLE,
  SOCIAL_PLATFORM_LABELS,
  type SocialLink,
  type SocialPlatform,
} from '@/lib/social';

const TYPE_LABELS: Record<string, string> = { PHARMACY: 'Farmacia', LABORATORY: 'Laboratorio', CLINIC: 'Clínica' };
const ORG_SOCIAL_PLATFORMS: SocialPlatform[] = ['INSTAGRAM', 'FACEBOOK', 'TIKTOK', 'WEBSITE'];

export default function AdminOrganizationsPage() {
  const [items, setItems] = useState<Organization[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({
    type: 'PHARMACY',
    name: '',
    description: '',
    locationName: '',
    address: '',
    municipality: '',
    phone: '',
    whatsapp: '',
  });
  const [socialLinks, setSocialLinks] = useState<SocialLink[]>([]);
  const [newSocialPlatform, setNewSocialPlatform] = useState<SocialPlatform | ''>('');
  const [newSocialUrl, setNewSocialUrl] = useState('');

  const load = () => api.get<Organization[]>('/organizations').then(setItems);

  useEffect(() => {
    load();
  }, []);

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await api.post('/organizations', {
        type: form.type,
        name: form.name,
        description: form.description || undefined,
        locations: [
          {
            name: form.locationName || form.name,
            address: form.address,
            municipality: form.municipality || undefined,
            phone: form.phone || undefined,
            whatsapp: form.whatsapp || undefined,
          },
        ],
        socialLinks,
      });
      setForm({ type: 'PHARMACY', name: '', description: '', locationName: '', address: '', municipality: '', phone: '', whatsapp: '' });
      setSocialLinks([]);
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'No se pudo crear la organización');
    } finally {
      setSubmitting(false);
    }
  };

  const remove = async (id: string) => {
    if (!window.confirm('¿Eliminar esta organización?')) return;
    await api.delete(`/organizations/${id}`).catch(() => undefined);
    load();
  };

  if (!items) return <PageSpinner />;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl">Farmacias, laboratorios y clínicas</h1>

      <form onSubmit={create} className="card space-y-4 p-5">
        {error && <Alert tone="error">{error}</Alert>}
        <div className="grid gap-4 sm:grid-cols-2">
          <Select
            label="Tipo"
            value={form.type}
            onChange={(value) => setForm({ ...form, type: value })}
            options={[
              { value: 'PHARMACY', label: 'Farmacia' },
              { value: 'LABORATORY', label: 'Laboratorio' },
              { value: 'CLINIC', label: 'Clínica' },
            ]}
          />
          <Input label="Nombre" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </div>
        <Input label="Descripción (opcional)" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
        <div className="grid gap-4 sm:grid-cols-2">
          <Input label="Dirección" required value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
          <Select
            label="Municipio"
            value={form.municipality}
            onChange={(value) => setForm({ ...form, municipality: value })}
            options={[
              { value: '', label: 'Selecciona' },
              ...MONAGAS_MUNICIPALITIES.map((m) => ({ value: m, label: m })),
            ]}
          />
          <Input label="Teléfono" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          <Input label="WhatsApp" value={form.whatsapp} onChange={(e) => setForm({ ...form, whatsapp: e.target.value })} />
        </div>

        <div className="space-y-3 border-t border-ink-100 pt-4">
          <p className="text-sm font-semibold text-ink-900">Redes sociales y web (hasta 4, sin repetir)</p>
          {socialLinks.length > 0 && (
            <ul className="space-y-1.5">
              {socialLinks.map((link) => (
                <li key={link.platform} className="flex items-center justify-between rounded-lg border border-ink-100 p-2 text-sm">
                  <span>
                    <span className="font-medium text-ink-800">{SOCIAL_PLATFORM_LABELS[link.platform]}:</span>{' '}
                    <span className="text-ink-500">{link.url}</span>
                  </span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setSocialLinks(socialLinks.filter((l) => l.platform !== link.platform))}
                  >
                    Eliminar
                  </Button>
                </li>
              ))}
            </ul>
          )}
          {socialLinks.length < 4 && (
            <div className="grid gap-3 sm:grid-cols-[160px_1fr_auto] sm:items-end">
              <Select
                label="Red"
                value={newSocialPlatform}
                onChange={(v) => setNewSocialPlatform(v as SocialPlatform)}
                options={ORG_SOCIAL_PLATFORMS.filter((p) => !socialLinks.some((l) => l.platform === p)).map((p) => ({
                  value: p,
                  label: SOCIAL_PLATFORM_LABELS[p],
                }))}
              />
              <Input
                label="URL oficial"
                placeholder={newSocialPlatform ? SOCIAL_PLATFORM_EXAMPLE[newSocialPlatform] : 'Selecciona una red primero'}
                value={newSocialUrl}
                onChange={(e) => setNewSocialUrl(e.target.value)}
              />
              <Button
                type="button"
                variant="outline"
                disabled={!newSocialPlatform || !newSocialUrl}
                onClick={() => {
                  if (!newSocialPlatform || !newSocialUrl) return;
                  setSocialLinks([...socialLinks, { platform: newSocialPlatform, url: newSocialUrl }]);
                  setNewSocialPlatform('');
                  setNewSocialUrl('');
                }}
              >
                Agregar red
              </Button>
            </div>
          )}
        </div>

        <Button type="submit" loading={submitting}>
          Agregar
        </Button>
      </form>

      <div className="card divide-y divide-ink-50">
        {items.map((org) => (
          <div key={org.id} className="flex items-center justify-between p-4">
            <div>
              <p className="flex items-center gap-1.5 font-medium text-ink-900">
                {org.name}
                <VerificationBadge kind="organization" type={org.type} />
                <Badge tone="neutral" className="ml-1">{TYPE_LABELS[org.type]}</Badge>
              </p>
              <p className="text-sm text-ink-500">{org.locations[0]?.address}</p>
              <SocialLinksRow links={org.socialLinks} className="mt-2" />
            </div>
            <Button variant="ghost" size="sm" onClick={() => remove(org.id)}>
              Eliminar
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}
