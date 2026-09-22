'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api, ApiError } from '@/lib/api';
import { Alert } from '@/components/ui/Alert';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Input, Textarea } from '@/components/ui/Input';
import { PageSpinner } from '@/components/ui/Spinner';
import { EmptyState } from '@/components/ui/EmptyState';

interface Post {
  id: string;
  title: string;
  content: string;
  published: boolean;
  createdAt: string;
}

export default function PostsPage() {
  const [posts, setPosts] = useState<Post[] | null>(null);
  const [locked, setLocked] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');

  const load = async () => {
    try {
      const items = await api.get<Post[]>('/posts/me');
      setPosts(items);
    } catch (e) {
      if (e instanceof ApiError && e.status === 403) {
        setLocked(true);
        setPosts([]);
      } else {
        setError('No se pudieron cargar tus publicaciones');
      }
    }
  };

  useEffect(() => {
    load();
  }, []);

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await api.post('/posts', { title, content, published: true });
      setTitle('');
      setContent('');
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'No se pudo crear la publicación');
    } finally {
      setSubmitting(false);
    }
  };

  const togglePublished = async (post: Post) => {
    await api.patch(`/posts/${post.id}`, { title: post.title, content: post.content, published: !post.published }).catch(() => undefined);
    load();
  };

  const remove = async (id: string) => {
    if (!window.confirm('¿Eliminar esta publicación?')) return;
    await api.delete(`/posts/${id}`).catch(() => undefined);
    load();
  };

  if (posts === null) return <PageSpinner />;

  if (locked) {
    return (
      <EmptyState
        title="Las publicaciones son parte del plan Profesional Plus"
        description="Actualiza tu plan para compartir novedades, promociones o consejos de salud en tu perfil público."
        action={
          <Link href="/dashboard/pagos">
            <Button>Ver planes</Button>
          </Link>
        }
      />
    );
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl">Publicaciones</h1>

      <form onSubmit={create} className="card space-y-4 p-6">
        {error && <Alert tone="error">{error}</Alert>}
        <Input label="Título" required value={title} onChange={(e) => setTitle(e.target.value)} />
        <Textarea label="Contenido" required rows={5} value={content} onChange={(e) => setContent(e.target.value)} />
        <Button type="submit" loading={submitting}>
          Publicar
        </Button>
      </form>

      {posts.length === 0 ? (
        <EmptyState title="Aún no tienes publicaciones" />
      ) : (
        <div className="space-y-3">
          {posts.map((post) => (
            <div key={post.id} className="card p-5">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <h3 className="font-semibold text-ink-900">{post.title}</h3>
                  <p className="mt-1 line-clamp-2 text-sm text-ink-600">{post.content}</p>
                  <p className="mt-1 text-xs text-ink-400">{new Date(post.createdAt).toLocaleDateString('es-VE')}</p>
                </div>
                <Badge tone={post.published ? 'pine' : 'neutral'} className="flex-shrink-0">
                  {post.published ? 'Publicado' : 'Borrador'}
                </Badge>
              </div>
              <div className="mt-3 flex gap-2">
                <Button variant="outline" size="sm" onClick={() => togglePublished(post)}>
                  {post.published ? 'Ocultar' : 'Publicar'}
                </Button>
                <Button variant="ghost" size="sm" onClick={() => remove(post.id)}>
                  Eliminar
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
