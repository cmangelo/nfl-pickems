import { Coins } from 'lucide-react';
import { formatMoney, potDetail, type Pot } from '@/lib/pot';

/** The week's pot, front and center: big amount, how it adds up, and how it pays out. */
export default function PotCard({ pot, open = false }: { pot: Pot; open?: boolean }) {
  return (
    <section
      data-testid="pot"
      aria-label="Pot"
      className="relative overflow-hidden rounded-2xl border border-accent/50 p-4"
      style={{ background: 'linear-gradient(135deg, color-mix(in srgb, var(--accent) 22%, transparent) 0%, color-mix(in srgb, var(--accent) 6%, transparent) 55%, var(--surface) 100%)' }}
    >
      <div className="flex items-center gap-4">
        <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-accent text-on-accent shadow-[0_0_24px_color-mix(in_srgb,var(--accent)_45%,transparent)]">
          <Coins size={28} aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-accent-bright">{open ? 'Pot so far' : 'This week’s pot'}</div>
          <div data-testid="pot-amount" className="text-4xl font-black leading-none tracking-tight">
            {formatMoney(pot.totalCents)}
          </div>
          <div data-testid="pot-detail" className="mt-1 text-sm text-muted">
            {potDetail(pot)}
          </div>
          <div className="mt-0.5 text-xs font-semibold text-accent-bright/80">
            {open ? 'Grows as entries are paid' : 'Winner takes all · ties split it'}
          </div>
        </div>
      </div>
    </section>
  );
}
