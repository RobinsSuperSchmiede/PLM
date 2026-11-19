'use client';

import { Copy, Minus, Square, X } from 'lucide-react';
import { useEffect, useState } from 'react';

import { useI18n } from '@/components/i18n-provider';
import { cn } from '@/lib/utils';

/**
 * The desktop app (OpenShell with `window.title_bar: "overlay"`) has no system title bar: the app's
 * header takes its place. OpenShell provides the window functions as `window.__OPENSHELL__.window`;
 * in a browser it does not exist and nothing here changes the page.
 */
type OpenShellWindow = {
  title_bar: 'native' | 'overlay';
  os: string;
  minimize(): Promise<void>;
  toggleMaximize(): Promise<void>;
  close(): Promise<void>;
  isMaximized(): Promise<boolean>;
  showMenu(): Promise<void>;
};

declare global {
  interface Window {
    __OPENSHELL__?: { window?: OpenShellWindow };
  }
}

export type DesktopWindow = OpenShellWindow & { maximized: boolean };

/** The window functions when the header is the title bar, else `null` (browser, native title bar). */
export function useDesktopWindow(): DesktopWindow | null {
  const [win, setWin] = useState<OpenShellWindow | null>(null);
  const [maximized, setMaximized] = useState(false);

  useEffect(() => {
    const found = window.__OPENSHELL__?.window;
    if (found?.title_bar !== 'overlay' || typeof found.minimize !== 'function') return;
    setWin(found);
    // Maximizing and restoring resize the page, so the resize event keeps the button icon current.
    const update = () => void found.isMaximized().then(setMaximized).catch(() => undefined);
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);

  return win ? { ...win, maximized } : null;
}

/** Attributes for the bar that replaces the title bar: it moves the window and opens the window menu. */
export function titleBarProps(win: DesktopWindow | null) {
  if (!win) return {};
  return {
    // "deep": the whole bar moves the window; buttons, links and inputs in it keep working.
    'data-tauri-drag-region': 'deep',
    onContextMenu: (event: React.MouseEvent) => {
      if ((event.target as HTMLElement).closest('button, a, input, [role="button"], [role="menuitem"]')) return;
      event.preventDefault();
      void win.showMenu().catch(() => undefined);
    },
  };
}

/** Minimize, maximize and close – drawn by the app on Windows and Linux, the system's own on macOS. */
export function WindowControls({ win, className }: { win: DesktopWindow; className?: string }) {
  const { t } = useI18n();
  if (win.os === 'macos') return null;
  const button = 'flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground transition-[background-color,color] duration-300 ease-ds hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring [&_svg]:h-[14px] [&_svg]:w-[14px]';
  return (
    <div className={cn('flex items-center gap-0.5', className)}>
      <button type="button" className={button} onClick={() => void win.minimize()} aria-label={t('shell.windowMinimize')} title={t('shell.windowMinimize')}>
        <Minus strokeWidth={1.6} />
      </button>
      <button type="button" className={button} onClick={() => void win.toggleMaximize()}
        aria-label={win.maximized ? t('shell.windowRestore') : t('shell.windowMaximize')} title={win.maximized ? t('shell.windowRestore') : t('shell.windowMaximize')}>
        {win.maximized ? <Copy strokeWidth={1.6} className="-scale-x-100" /> : <Square strokeWidth={1.6} className="!h-3 !w-3" />}
      </button>
      <button type="button" className={cn(button, 'hover:bg-destructive hover:text-destructive-foreground')} onClick={() => void win.close()} aria-label={t('shell.windowClose')} title={t('shell.windowClose')}>
        <X strokeWidth={1.6} />
      </button>
    </div>
  );
}
