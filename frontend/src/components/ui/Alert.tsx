import { cn } from '@/lib/cn';

type Tone = 'info' | 'success' | 'warning' | 'error';

const styles: Record<Tone, string> = {
  info: 'bg-pine-50 border-pine-200 text-pine-900',
  success: 'bg-pine-50 border-pine-200 text-pine-900',
  warning: 'bg-gold-50 border-gold-200 text-gold-900',
  error: 'bg-red-50 border-red-200 text-red-800',
};

/**
 * Mensaje en un recuadro. Los lectores de pantalla anuncian los errores al
 * aparecer (role="alert") y el resto sin interrumpir (role="status").
 */
export function Alert({
  children,
  tone = 'info',
  title,
  className,
}: {
  children: React.ReactNode;
  tone?: Tone;
  title?: string;
  className?: string;
}) {
  return (
    <div role={tone === 'error' ? 'alert' : 'status'} className={cn('rounded-lg border px-4 py-3 text-sm', styles[tone], className)}>
      {title && <p className="mb-1 font-semibold">{title}</p>}
      <div>{children}</div>
    </div>
  );
}
