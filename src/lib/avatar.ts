/** Avatar colors and initial (pure, client-safe). */

/** Avatar circle colors (fill, text) that read on the dark card; stable per user. */
const AVATARS: [string, string][] = [
  ['#1f4d3a', '#7ee2b0'],
  ['#2a3f6b', '#9cbcff'],
  ['#5a2d4f', '#f5a3d9'],
  ['#5c3b1e', '#ffc58a'],
  ['#3d2f6b', '#c4b2ff'],
  ['#21505a', '#86dff0'],
  ['#5a2a2a', '#ffaaa0'],
  ['#4a4a1e', '#e8e27a'],
];

export function avatarColors(userId: number): { bg: string; fg: string } {
  const [bg, fg] = AVATARS[((userId % AVATARS.length) + AVATARS.length) % AVATARS.length];
  return { bg, fg };
}

/** First letter for the avatar ("Ann (2)" => "A"). */
export function initial(name: string): string {
  return (name.trim()[0] ?? '?').toUpperCase();
}
