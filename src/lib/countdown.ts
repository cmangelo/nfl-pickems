/** Pure, client-safe countdown formatting (no server imports). */

const plural = (n: number, unit: string) => `${n} ${unit}${n === 1 ? '' : 's'}`;

/** "1 day 14 hrs left", "5 hrs 10 mins left", "42:07 left" (under an hour), "Locked" once the time is up. */
export function formatCountdown(ms: number): string {
  if (ms <= 0) return 'Locked';
  if (ms < 3_600_000) {
    const totalSec = Math.floor(ms / 1000);
    return `${String(Math.floor(totalSec / 60)).padStart(2, '0')}:${String(totalSec % 60).padStart(2, '0')} left`;
  }
  const totalMin = Math.floor(ms / 60_000);
  const days = Math.floor(totalMin / 1440);
  const hours = Math.floor((totalMin % 1440) / 60);
  const mins = totalMin % 60;
  if (days > 0) return `${plural(days, 'day')} ${plural(hours, 'hr')} left`;
  if (hours > 0) return `${plural(hours, 'hr')} ${plural(mins, 'min')} left`;
  return `${plural(mins, 'min')} left`;
}
