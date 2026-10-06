import { avatarColors, initial } from '@/lib/avatar';

export default function Avatar({ userId, name, size = 36 }: { userId: number; name: string; size?: number }) {
  const { bg, fg } = avatarColors(userId);
  return (
    <span
      aria-hidden="true"
      className="flex shrink-0 items-center justify-center rounded-full font-bold"
      style={{ width: size, height: size, background: bg, color: fg, fontSize: size * 0.44 }}
    >
      {initial(name)}
    </span>
  );
}
