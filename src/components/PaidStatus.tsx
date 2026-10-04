import { CircleCheck, CircleDashed } from 'lucide-react';
import { paymentStatus } from '@/lib/pot';

/** The viewer's own entry: whether an admin has marked it paid (and the fee, when one is set). */
export default function PaidStatus({ paid, feeCents }: { paid: boolean; feeCents: number | null }) {
  const s = paymentStatus(paid, feeCents);
  const Icon = paid ? CircleCheck : CircleDashed;
  return (
    <div
      data-testid="paid-status"
      data-paid={paid}
      className={`mb-4 flex items-center gap-2.5 rounded-xl border px-3 py-2 ${
        paid ? 'border-correct/50 bg-correct/10' : 'border-border bg-surface'
      }`}
    >
      <Icon size={20} aria-hidden="true" className={`shrink-0 ${paid ? 'text-correct' : 'text-muted'}`} />
      <div className="min-w-0">
        <div data-testid="paid-status-title" className={`text-sm font-semibold ${paid ? 'text-correct' : ''}`}>{s.title}</div>
        <div data-testid="paid-status-detail" className="text-xs text-muted">{s.detail}</div>
      </div>
    </div>
  );
}
