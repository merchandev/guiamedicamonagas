import Link from 'next/link';
import { Alert } from '@/components/ui/Alert';
import { REQUIREMENTS, type PrescriptionPad } from '@/lib/prescriptions';

/** Lo que le falta al médico para emitir, con el enlace a donde se completa. */
export function MissingRequirements({ pad }: { pad: PrescriptionPad }) {
  if (pad.canIssue) return null;
  return (
    <Alert tone="warning" title="Para emitir récipes te falta:">
      <ul className="mt-1 list-disc space-y-1 pl-5">
        {pad.missing.map((key) => (
          <li key={key}>
            <Link href={REQUIREMENTS[key].href} className="underline">
              {REQUIREMENTS[key].label}
            </Link>
          </li>
        ))}
      </ul>
    </Alert>
  );
}
