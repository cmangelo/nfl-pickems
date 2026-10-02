/** Largest value of a Postgres `integer` column (serial ids). Anything above would raise a DB error. */
const MAX_INT4 = 2147483647;

/** True for a positive integer that fits an `integer` id column. Server actions get arbitrary client input. */
export function isId(n: unknown): n is number {
  return typeof n === 'number' && Number.isInteger(n) && n > 0 && n <= MAX_INT4;
}
