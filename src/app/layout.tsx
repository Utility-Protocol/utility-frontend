import type { Metadata, Viewport } from 'next';

import Navbar from '@/components/Navbar';
import './globals.css';

export const metadata: Metadata = {
  title: 'Utility Protocol',
  description: 'IoT utility billing and telemetry dashboard',
};

export const viewport: Viewport = {
  themeColor: '#09090b',
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-zinc-950 font-sans text-zinc-100 antialiased">
        <Navbar />
        <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
          {children}
        </main>
      </body>
    </html>
  );
}