import { CloudRain, Flame, Frown, Lock, Scale, Shuffle, Target, Trophy, Zap, type LucideIcon } from 'lucide-react';
import TeamLogo from '@/components/TeamLogo';
import { joinNames, upsetHeadline, upsetRightText, upsetWrongText, winnerBanner } from '@/lib/leaderboard-view';
import { formatMoney, payoutLine, type Pot } from '@/lib/pot';
import { percent, type PodiumStep, type WeekReport } from '@/lib/report';
import type { ScoringGame, WeekSummary } from '@/lib/scoring';
import { rankLabel } from '@/lib/week-view';
import { Avatar } from './RankedTable';

type Game = ScoringGame;

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h2 className="mb-2 mt-2 text-lg font-bold">{children}</h2>;
}

function WinnerHero({ weekNumber, summary, pot }: { weekNumber: number; summary: WeekSummary; pot: Pot | null }) {
  const banner = winnerBanner(weekNumber, summary.winners, summary.gamesTotal);
  if (!banner) {
    return (
      <p data-testid="no-winner" className="rounded-xl border border-border bg-surface p-4 text-center text-muted">
        No counted entries this week, so there is no winner yet.
      </p>
    );
  }
  const payout = payoutLine(pot, summary.winners.length);
  const share = pot && pot.totalCents > 0 ? Math.floor(pot.totalCents / summary.winners.length) : 0;
  return (
    <div
      data-testid="winner-banner"
      className="relative overflow-hidden rounded-2xl border border-accent/70 p-5 text-center"
      style={{ background: 'radial-gradient(120% 100% at 50% 0%, color-mix(in srgb, var(--accent) 32%, transparent) 0%, color-mix(in srgb, var(--accent) 8%, transparent) 55%, var(--surface) 100%)' }}
    >
      <span className="mx-auto mb-2 flex h-14 w-14 items-center justify-center rounded-full bg-accent text-on-accent shadow-[0_0_28px_color-mix(in_srgb,var(--accent)_50%,transparent)]">
        <Trophy size={30} aria-hidden="true" />
      </span>
      <div data-testid="winner-title" className="text-xs font-bold uppercase tracking-[0.18em] text-accent-bright">{banner.title}</div>
      <div data-testid="winner-names" className="mt-1 text-3xl font-black">{banner.names}</div>
      <div data-testid="winner-detail" className="mt-1 text-sm text-muted">{banner.detail}</div>
      {payout && (
        <div className="mt-4 rounded-xl bg-bg/50 px-4 py-3">
          <div data-testid="winner-prize" className="text-4xl font-black leading-none text-accent-bright">
            {formatMoney(share)}
            {summary.winners.length > 1 && <span className="ml-1 text-lg font-bold">each</span>}
          </div>
          <div data-testid="winner-payout" className="mt-1 text-sm font-semibold">{payout}</div>
        </div>
      )}
    </div>
  );
}

const STEP_STYLE: Record<number, { h: string; ring: string; label: string }> = {
  1: { h: 'h-20', ring: 'ring-accent', label: 'bg-accent text-on-accent' },
  2: { h: 'h-14', ring: 'ring-[#c0c6d0]', label: 'bg-[#c0c6d0] text-[#15181e]' },
  3: { h: 'h-10', ring: 'ring-[#c98a55]', label: 'bg-[#c98a55] text-[#1d1208]' },
};

function Podium({ steps }: { steps: PodiumStep[] }) {
  if (steps.length < 2) return null;
  // Classic order: 2nd, 1st, 3rd (by position in the list, so a shared 1st still stands in the middle).
  const order = [steps[1], steps[0], steps[2]].filter(Boolean) as PodiumStep[];
  return (
    <section data-testid="podium" aria-label="Podium" className="flex items-end justify-center gap-2">
      {order.map((s) => {
        const pos = steps.indexOf(s) + 1;
        const st = STEP_STYLE[pos];
        const first = s.entries[0];
        return (
          <div key={s.rank} data-testid={`podium-${pos}`} className="flex w-1/3 min-w-0 flex-col items-center">
            <span className={`rounded-full ring-2 ${st.ring}`}>
              <Avatar userId={first.userId} name={first.name} size={pos === 1 ? 52 : 42} />
            </span>
            <div data-testid="podium-names" className="mt-1.5 line-clamp-2 w-full text-center text-sm font-semibold leading-tight">
              {joinNames(s.entries.map((e) => e.name))}
            </div>
            <div className="text-xs text-muted">{s.correct} correct</div>
            <div className={`mt-1.5 flex w-full ${st.h} items-start justify-center rounded-t-lg border border-b-0 border-border bg-surface-2 pt-2`}>
              <span data-testid="podium-rank" className={`rounded-full px-2 py-0.5 text-xs font-black ${st.label}`}>
                {rankLabel(s.rank, s.tied)}
              </span>
            </div>
          </div>
        );
      })}
    </section>
  );
}

function GameCard({
  testId,
  icon: Icon,
  label,
  tone,
  game,
  lines,
}: {
  testId: string;
  icon: LucideIcon;
  label: string;
  tone: string;
  game: Game;
  lines: { testId?: string; text: string }[];
}) {
  const head = upsetHeadline(game);
  return (
    <div
      data-testid={testId}
      className="flex w-[11.5rem] shrink-0 snap-start flex-col rounded-2xl border border-border p-3"
      style={{ background: `linear-gradient(180deg, color-mix(in srgb, ${tone} 20%, transparent) 0%, var(--surface) 70%)` }}
    >
      <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider" style={{ color: tone }}>
        <Icon size={14} aria-hidden="true" />
        {label}
      </div>
      <div className="mt-3 flex items-center justify-center gap-2">
        <span className={game.winner === 'away' ? '' : 'opacity-40'}>
          <TeamLogo abbr={game.awayTeam} size={34} />
        </span>
        <span className="text-xs text-muted">@</span>
        <span className={game.winner === 'home' ? '' : 'opacity-40'}>
          <TeamLogo abbr={game.homeTeam} size={34} />
        </span>
      </div>
      <div data-testid={testId === 'upset' ? 'upset-headline' : undefined} className="mt-2 text-center text-base font-bold leading-tight">
        {head}
      </div>
      <div className="mt-2 flex flex-col gap-0.5 text-center text-xs text-muted">
        {lines.map((l) => (
          <span key={l.text} data-testid={l.testId}>
            {l.text}
          </span>
        ))}
      </div>
    </div>
  );
}

function AwardCard({
  testId,
  icon: Icon,
  label,
  tone,
  names,
  value,
  sub,
}: {
  testId: string;
  icon: LucideIcon;
  label: string;
  tone: string;
  names: string;
  value: string;
  sub?: string;
}) {
  return (
    <div
      data-testid={testId}
      className="flex min-w-0 flex-col rounded-2xl border border-border p-3"
      style={{ background: `linear-gradient(160deg, color-mix(in srgb, ${tone} 18%, transparent) 0%, var(--surface) 65%)` }}
    >
      <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider" style={{ color: tone }}>
        <Icon size={14} aria-hidden="true" />
        {label}
      </div>
      <div className="mt-2 line-clamp-2 text-lg font-bold leading-tight">{names}</div>
      <div className="text-2xl font-black leading-tight">{value}</div>
      {sub && <div className="mt-0.5 text-xs text-muted">{sub}</div>}
    </div>
  );
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** Final recap laid out as a weekly report: winner + payout, podium, games of the week, awards. */
export default function WeeklyReport({
  weekNumber,
  summary,
  report,
  games,
  pot,
  gamesText,
}: {
  weekNumber: number;
  summary: WeekSummary;
  report: WeekReport;
  games: Game[];
  pot: Pot | null;
  gamesText: string;
}) {
  const byId = new Map(games.map((g) => [g.id, g]));
  const stats = summary.stats;
  const upset = summary.upset;
  const upsetGame = upset ? byId.get(upset.gameId) : undefined;
  const upsetRight = upset ? upsetRightText(upset) : null;
  const lockGame = report.lock ? byId.get(report.lock.gameId) : undefined;
  const flipGame = report.coinFlip ? byId.get(report.coinFlip.gameId) : undefined;
  const blowGame = report.blowout ? byId.get(report.blowout.gameId) : undefined;

  const gameCards = [
    upset && upsetGame && upsetHeadline(upsetGame) && (
      <GameCard
        key="upset"
        testId="upset"
        icon={Zap}
        label="Upset of the week"
        tone="#f87171"
        game={upsetGame}
        lines={[
          { testId: 'upset-wrong', text: upsetWrongText(upset) },
          ...(upsetRight ? [{ testId: 'upset-right', text: upsetRight }] : []),
        ]}
      />
    ),
    report.lock && lockGame && (
      <GameCard
        key="lock"
        testId="lock"
        icon={Lock}
        label="Lock of the week"
        tone="#4ade80"
        game={lockGame}
        lines={[{ text: `${percent(report.lock.right, report.lock.pickers)} got it right` }]}
      />
    ),
    report.coinFlip && flipGame && (
      <GameCard
        key="flip"
        testId="coin-flip"
        icon={Scale}
        label="Coin flip"
        tone="#60a5fa"
        game={flipGame}
        lines={[{ text: `Split ${flipGame.awayTeam} ${report.coinFlip.away} · ${flipGame.homeTeam} ${report.coinFlip.home}` }]}
      />
    ),
    report.blowout && blowGame && (
      <GameCard
        key="blowout"
        testId="blowout"
        icon={Flame}
        label="Blowout"
        tone="#fb923c"
        game={blowGame}
        lines={[{ text: `Won by ${report.blowout.margin}` }]}
      />
    ),
  ].filter(Boolean);

  const awards = [
    report.closestTiebreaker && (
      <AwardCard
        key="tb"
        testId="award-tiebreaker"
        icon={Target}
        label="Closest tiebreaker"
        tone="#60a5fa"
        names={joinNames(report.closestTiebreaker.names)}
        value={report.closestTiebreaker.diff === 0 ? 'Nailed it' : `Off by ${report.closestTiebreaker.diff}`}
        sub={summary.tiebreakerActualTotal !== null ? `Actual total ${summary.tiebreakerActualTotal}` : undefined}
      />
    ),
    report.badBeat && (
      <AwardCard
        key="bad"
        testId="award-bad-beat"
        icon={Frown}
        label="Bad beat"
        tone="#f472b6"
        names={joinNames(report.badBeat.names)}
        value={`${report.badBeat.correct} correct`}
        sub={`Lost on the tiebreaker by ${plural(report.badBeat.behindBy, 'point', 'points')}`}
      />
    ),
    report.contrarian && (
      <AwardCard
        key="contra"
        testId="award-contrarian"
        icon={Shuffle}
        label="Contrarian"
        tone="#c084fc"
        names={joinNames(report.contrarian.names)}
        value={plural(report.contrarian.against, 'pick', 'picks')}
        sub={`Against the crowd · ${report.contrarian.hits === 0 ? 'none hit' : `${report.contrarian.hits} hit`}`}
      />
    ),
  ].filter(Boolean);

  return (
    <div className="flex flex-col gap-4">
      <header>
        <h1 className="text-2xl font-black">Weekly Report</h1>
        <p data-testid="final-status" className="text-sm text-muted">Final · {gamesText}</p>
      </header>

      <WinnerHero weekNumber={weekNumber} summary={summary} pot={pot} />
      <Podium steps={report.podium} />

      {stats && (
        <section className="grid grid-cols-2 gap-2">
          <AwardCard
            testId="stat-most"
            icon={Trophy}
            label="Most correct"
            tone="var(--accent-bright)"
            names={joinNames(stats.mostCorrect.names)}
            value={`${stats.mostCorrect.correct} correct`}
          />
          <AwardCard
            testId="stat-fewest"
            icon={CloudRain}
            label="Rough week"
            tone="#a16207"
            names={joinNames(stats.fewestCorrect.names)}
            value={`${stats.fewestCorrect.correct} correct`}
          />
          <div data-testid="stat-average" className="rounded-xl border border-border bg-surface px-3 py-2">
            <div className="text-xs text-muted">Average</div>
            <div className="text-xl font-bold">{stats.average} correct</div>
          </div>
          <div data-testid="stat-entries" className="rounded-xl border border-border bg-surface px-3 py-2">
            <div className="text-xs text-muted">Entries counted</div>
            <div className="text-xl font-bold">{stats.countedEntries}</div>
          </div>
        </section>
      )}

      {gameCards.length > 0 && (
        <section aria-label="Games of the week">
          <SectionTitle>Games of the week</SectionTitle>
          <div data-testid="games-of-week" className="-mx-4 flex snap-x scroll-px-4 gap-2 overflow-x-auto px-4 pb-1">{gameCards}</div>
        </section>
      )}

      {awards.length > 0 && (
        <section aria-label="Awards">
          <SectionTitle>Awards</SectionTitle>
          <div className="grid grid-cols-2 gap-2">{awards}</div>
        </section>
      )}

      <SectionTitle>Standings</SectionTitle>
    </div>
  );
}
