import { cn } from '@/lib/cn';

type Tone = 'neutral' | 'pine' | 'gold' | 'red' | 'amber';

const tones: Record<Tone, string> = {
  neutral: 'bg-ink-100 text-ink-700',
  pine: 'bg-pine-100 text-pine-800',
  gold: 'bg-gold-100 text-gold-800',
  red: 'bg-red-100 text-red-700',
  amber: 'bg-amber-100 text-amber-800',
};

export function Badge({
  children,
  tone = 'neutral',
  className,
}: {
  children: React.ReactNode;
  tone?: Tone;
  className?: string;
}) {
  return <span className={cn('badge', tones[tone], className)}>{children}</span>;
}
