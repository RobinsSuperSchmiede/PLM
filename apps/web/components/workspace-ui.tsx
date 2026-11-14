'use client';

import { type ReactNode, useEffect, useRef, useState } from 'react';
import { Check, Copy, Inbox, KeyRound, Search, Trash2 } from 'lucide-react';

import { useI18n } from '@/components/i18n-provider';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { DotLoader } from '@/components/dot-loader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

export function PageHeader({ title, description, action }: { title: string; description?: string; action?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight sm:text-[28px]">{title}</h1>
        {description && <p className="text-sm text-muted-foreground">{description}</p>}
      </div>
      {action && <div className="flex shrink-0 items-center gap-2">{action}</div>}
    </div>
  );
}

export function EmptyState({ title, description, action, icon: Icon = Inbox, className }: {
  title: string;
  description?: string;
  action?: ReactNode;
  icon?: typeof Inbox;
  className?: string;
}) {
  return (
    <div className={cn('group flex min-h-48 flex-col items-center justify-center rounded-xl border border-dashed border-foreground/20 bg-muted px-6 py-12 text-center', className)}>
      <div className="relative mb-4">
        <div className="relative flex h-14 w-14 items-center justify-center rounded-2xl bg-field shadow-sm">
          <DotLoader size={30} animated={false} hoverAnimated className="text-muted-foreground transition-colors duration-200 group-hover:text-foreground" />
          <span className="absolute -bottom-1.5 -right-1.5 flex h-6 w-6 items-center justify-center rounded-lg bg-field shadow-sm">
            <Icon className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
          </span>
        </div>
      </div>
      <p className="text-sm font-medium">{title}</p>
      {description && <p className="mt-1 max-w-xs text-sm text-muted-foreground">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function PageSkeleton() {
  const { t } = useI18n();
  return (
    <div role="status" aria-label={t('common.loading')} className="relative space-y-6">
      <div className="space-y-2">
        <Skeleton className="h-7 w-48" />
        <Skeleton className="h-4 w-72 max-w-full" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[0, 1, 2, 3].map((item) => <Skeleton key={item} className="h-28 rounded-xl" />)}
      </div>
      <Skeleton className="h-64 rounded-xl" />
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
        <DotLoader size={40} className="text-muted-foreground duration-500 animate-in fade-in" />
      </div>
    </div>
  );
}

export function SearchInput({ value, onChange, placeholder, className }: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  className?: string;
}) {
  return (
    <div className={cn('relative w-full sm:w-64', className)}>
      <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      <Input type="search" value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} aria-label={placeholder} className="pl-8" />
    </div>
  );
}

/** Icon button that asks for confirmation before deleting. */
export function DeleteButton({ name, onConfirm, size = 'icon-sm', label }: {
  name: string;
  onConfirm: () => void;
  size?: 'icon-sm' | 'icon' | 'sm';
  label?: string;
}) {
  const { t } = useI18n();
  const button = useRef<HTMLButtonElement>(null);
  // The confirmation dialog is only built once it is needed: long lists render one button per row,
  // and a full dialog tree for each of them made page changes noticeably slower.
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button ref={button} variant="ghost" size={size} className="text-muted-foreground hover:text-destructive" aria-label={`${t('common.delete')}: ${name}`}
        aria-haspopup="dialog" onClick={(event) => { event.stopPropagation(); setOpen(true); }}>
        <Trash2 />
        {label}
      </Button>
      {open && (
        <AlertDialog open onOpenChange={setOpen}>
          <AlertDialogContent onCloseAutoFocus={(event) => { event.preventDefault(); button.current?.focus(); }}>
            <AlertDialogHeader>
              <AlertDialogTitle>{t('common.confirmDeleteTitle')}</AlertDialogTitle>
              <AlertDialogDescription>{t('common.confirmDeleteText', { name })}</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
              <AlertDialogAction onClick={onConfirm}>{t('common.delete')}</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </>
  );
}

export function CopyButton({ value, className }: { value: string; className?: string }) {
  const { t } = useI18n();
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const timeout = window.setTimeout(() => setCopied(false), 1500);
    return () => window.clearTimeout(timeout);
  }, [copied]);

  return (
    <Button
      type="button"
      variant="outline"
      size="icon-sm"
      className={className}
      aria-label={copied ? t('common.copied') : t('common.copy')}
      onClick={() => {
        void navigator.clipboard?.writeText(value).then(() => setCopied(true));
      }}
    >
      {copied ? <Check key="check" className="text-success duration-200 animate-in zoom-in-50" /> : <Copy key="copy" className="duration-200 animate-in fade-in" />}
    </Button>
  );
}

/** Small form row: label above control, optional hint below. */
export function Field({ label, htmlFor, hint, children, className }: {
  label: string;
  htmlFor?: string;
  hint?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('space-y-1.5', className)}>
      <label htmlFor={htmlFor} className="text-sm font-medium leading-none">{label}</label>
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

export function UrlRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="space-y-1.5">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <div className="flex items-center gap-2">
        <code className="flex-1 truncate rounded-md bg-muted px-3 py-1.5 font-mono text-xs">{value}</code>
        <CopyButton value={value} />
      </div>
    </div>
  );
}

export function TokenField({ value }: { value: string }) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="flex min-w-0 flex-1 items-center gap-2">
      <button type="button" onClick={() => setVisible((current) => !current)} className="flex-1 truncate rounded-md bg-muted px-3 py-1.5 text-left font-mono text-xs" aria-label="Toggle token visibility">
        <KeyRound className="mr-2 inline h-3.5 w-3.5 text-muted-foreground" />
        {visible ? value : '•'.repeat(32)}
      </button>
      <CopyButton value={value} />
    </div>
  );
}

/** Animates a number from its previous value to the new one. */
export function CountUp({ value, duration = 700 }: { value: number; duration?: number }) {
  const [display, setDisplay] = useState(0);
  const from = useRef(0);

  useEffect(() => {
    const start = from.current;
    if (start === value || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      from.current = value;
      setDisplay(value);
      return;
    }
    const startedAt = performance.now();
    let frame = 0;
    const tick = (now: number) => {
      const progress = Math.min(1, (now - startedAt) / duration);
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplay(Math.round(start + (value - start) * eased));
      if (progress < 1) frame = requestAnimationFrame(tick);
      else from.current = value;
    };
    frame = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(frame);
      from.current = value;
    };
  }, [value, duration]);

  return <>{display}</>;
}
