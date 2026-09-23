'use client';

import { trackEvent as track } from '@/lib/analytics';
import { cn } from '@/lib/cn';
import { SOCIAL_PLATFORM_COLORS, SOCIAL_PLATFORM_ICONS, SOCIAL_PLATFORM_LABELS, type SocialLink } from '@/lib/social';

export function SocialLinksRow({
  links,
  resourceId,
  className,
}: {
  links: SocialLink[];
  resourceId?: string;
  className?: string;
}) {
  if (links.length === 0) return null;

  return (
    <div className={cn('flex flex-wrap gap-2', className)}>
      {links.map((link) => {
        const Icon = SOCIAL_PLATFORM_ICONS[link.platform];
        return (
          <a
            key={link.platform}
            href={link.url}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => resourceId && track('SOCIAL_LINK_CLICK', resourceId)}
            title={SOCIAL_PLATFORM_LABELS[link.platform]}
            className={cn(
              'flex h-9 w-9 items-center justify-center rounded-full transition-colors',
              SOCIAL_PLATFORM_COLORS[link.platform],
            )}
          >
            <Icon className="h-4 w-4" />
            <span className="sr-only">{SOCIAL_PLATFORM_LABELS[link.platform]}</span>
          </a>
        );
      })}
    </div>
  );
}
