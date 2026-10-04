import type { Metadata, Viewport } from 'next';
import ThemeTuner from '@/components/ThemeTuner';
import { isThemeTunerEnabled, THEME_BOOT_SCRIPT } from '@/lib/theme-tuner';
import './globals.css';

export const metadata: Metadata = { title: "NFL Pick'em" };
// viewport-fit=cover exposes env(safe-area-inset-*) so the floating tab bar clears the iPhone home indicator.
export const viewport: Viewport = { width: 'device-width', initialScale: 1, themeColor: '#0f1115', viewportFit: 'cover' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  // Staging-only color tuner (THEME_TUNER=1, never Vercel production): applies a saved accent before paint.
  const tuner = isThemeTunerEnabled(process.env);
  return (
    // suppressHydrationWarning: the tuner boot script may set inline CSS variables on <html> before hydration.
    <html lang="en" data-theme-tuner={tuner ? '1' : undefined} suppressHydrationWarning={tuner}>
      {tuner && (
        <head>
          <script dangerouslySetInnerHTML={{ __html: THEME_BOOT_SCRIPT }} />
        </head>
      )}
      <body className="min-h-dvh antialiased">
        {children}
        {tuner && <ThemeTuner />}
      </body>
    </html>
  );
}
