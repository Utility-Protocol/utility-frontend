import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Utility Protocol | Micro-Utility Grid',
  description:
    'Real-time decentralized telemetry for prosumer energy and water micro-utility settlement.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen bg-zinc-950 antialiased">{children}</body>
    </html>
  );
}