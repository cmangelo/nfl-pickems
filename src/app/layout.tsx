import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = { title: "NFL Pick'em" };
export const viewport: Viewport = { width: 'device-width', initialScale: 1, themeColor: '#0f1115' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-dvh antialiased">{children}</body>
    </html>
  );
}
