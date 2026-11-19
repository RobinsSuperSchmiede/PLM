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

/**
 * Minimize, maximize and close – drawn by the app on Windows and Linux, the system's own on macOS.
 * Square hover areas without gaps, like the caption buttons of Windows itself.
 */
export function WindowControls({ win, className }: { win: DesktopWindow; className?: string }) {
  const { t } = useI18n();
  if (win.os === 'macos') return null;
  const button = 'flex h-8 w-[46px] items-center justify-center rounded-none text-muted-foreground transition-[background-color,color] duration-150 hover:bg-foreground/10 hover:text-foreground focus-visible:outline-none focus-visible:ring-[2px] focus-visible:ring-inset focus-visible:ring-ring [&_svg]:h-[14px] [&_svg]:w-[14px]';
  return (
    <div className={cn('flex items-center', className)}>
      <button type="button" className={button} onClick={() => void win.minimize()} aria-label={t('shell.windowMinimize')} title={t('shell.windowMinimize')}>
        <Minus strokeWidth={1.6} />
      </button>
      <button type="button" className={button} onClick={() => void win.toggleMaximize()}
        aria-label={win.maximized ? t('shell.windowRestore') : t('shell.windowMaximize')} title={win.maximized ? t('shell.windowRestore') : t('shell.windowMaximize')}>
        {win.maximized ? <Copy strokeWidth={1.6} className="-scale-x-100" /> : <Square strokeWidth={1.6} className="!h-3 !w-3" />}
      </button>
      <button type="button" className={cn(button, 'hover:bg-[#C42B1C] hover:text-white')} onClick={() => void win.close()} aria-label={t('shell.windowClose')} title={t('shell.windowClose')}>
        <X strokeWidth={1.6} />
      </button>
    </div>
  );
}

/**
 * A bare title bar for screens without the app header (sign-in, account setup, walkthrough): it moves
 * the window and holds the window buttons. Renders nothing in a browser.
 */
export function DesktopTitleBar({ className, children }: { className?: string; children?: React.ReactNode }) {
  const win = useDesktopWindow();
  if (!win) return null;
  return (
    <div {...titleBarProps(win)} className={cn('flex h-8 shrink-0 select-none items-start justify-end', className)}>
      {children}
      <WindowControls win={win} />
    </div>
  );
}

/**
 * In the desktop app a right click shows no browser menu (reload, inspect, ...): the app is not a web
 * page there. Menus of the app itself (the title bar, folders in the explorer) open as before. In a
 * browser nothing changes.
 */
export function DesktopContextMenu() {
  useEffect(() => {
    if (!window.__OPENSHELL__) return;
    const block = (event: MouseEvent) => event.preventDefault();
    document.addEventListener('contextmenu', block);
    return () => document.removeEventListener('contextmenu', block);
  }, []);
  return null;
}
