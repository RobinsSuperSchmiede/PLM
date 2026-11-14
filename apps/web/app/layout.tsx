import './globals.css';
import type { Metadata, Viewport } from 'next';
import { Inter, JetBrains_Mono } from 'next/font/google';
import { ThemeProvider } from 'next-themes';

import { AccessGate } from '@/components/access-gate';
import { AppShell } from '@/components/app-shell';
import { I18nProvider } from '@/components/i18n-provider';
import { Toaster } from '@/components/ui/sonner';
import { TooltipProvider } from '@/components/ui/tooltip';
import { appearanceBootScript } from '@/lib/appearance';

const inter = Inter({ subsets: ['latin'], variable: '--font-sans', display: 'swap' });
const mono = JetBrains_Mono({ subsets: ['latin'], weight: ['400'], variable: '--font-mono', display: 'swap' });

export const metadata: Metadata = {
  title: 'Anamnesies',
  description: 'A focused local-first workspace.',
  appleWebApp: { capable: true, title: 'Anamnesies', statusBarStyle: 'black-translucent' },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#A3A3A8',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="de" suppressHydrationWarning>
      <head>
        {/* Applies the saved accent, radius and density before the first paint. */}
        <script dangerouslySetInnerHTML={{ __html: appearanceBootScript }} />
      </head>
      <body className={`${inter.variable} ${mono.variable} font-sans`}>
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
          <I18nProvider>
            <TooltipProvider delayDuration={300}>
              <AccessGate>
                <AppShell>{children}</AppShell>
              </AccessGate>
              <Toaster position="bottom-right" />
            </TooltipProvider>
          </I18nProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
