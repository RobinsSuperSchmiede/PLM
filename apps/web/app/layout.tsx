import './globals.css';
import type { Metadata } from 'next';
import { Inter } from 'next/font/google';

import { AppShell } from '@/components/app-shell';
import { AccessGate } from '@/components/access-gate';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'PLM · Workspace',
  description: 'A focused local-first workspace.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="de" className="dark" suppressHydrationWarning>
      <body className={inter.className}>
        <AccessGate><AppShell>{children}</AppShell></AccessGate>
      </body>
    </html>
  );
}
