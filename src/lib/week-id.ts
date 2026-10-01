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
