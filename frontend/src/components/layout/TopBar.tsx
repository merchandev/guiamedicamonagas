import { BcvRateBadge } from '@/components/BcvRateBadge';

export function TopBar() {
  return (
    <div className="bg-pine-900 py-1.5 text-white">
      <div className="container-page flex justify-center sm:justify-end">
        <BcvRateBadge className="text-xs" />
      </div>
    </div>
  );
}
