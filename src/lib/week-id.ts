// Client-safe (no server imports): used by the header and by getSelectedWeek.

/** Picks the selected week id: the `week` param if it is a visible week, else the current week. */
export function resolveWeekId(
  param: string | string[] | null | undefined,
  visibleIds: number[],
  currentId: number | null,
): number | null {
  const raw = Array.isArray(param) ? param[0] : param;
  if (raw && /^\d+$/.test(raw)) {
    const id = Number(raw);
    if (visibleIds.includes(id)) return id;
  }
  return currentId;
}

const SAFE_FROM = /^\/(?:(?:picks|leaderboard|games|admin)(?:\/[a-z-]*)?|admin\/picks\/\d+|leaderboard\/player\/\d+)$/;

/** Only same-site app paths are valid `from` targets for the week picker. */
export function safeFrom(from: string | string[] | null | undefined): string {
  const raw = Array.isArray(from) ? from[0] : from;
  if (raw && SAFE_FROM.test(raw)) return raw;
  return '/picks';
}
