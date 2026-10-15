import { type ReactNode } from 'react';
import { FileQuestion } from 'lucide-react';

import { Button } from '@/components/ui/button';

export function PageHeader({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <p className="mb-1 text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground">Workspace</p>
        <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
        <p className="mt-1 text-xs text-muted-foreground">{description}</p>
      </div>
      {action}
    </div>
  );
}

export function EmptyState({ title, description, action }: { title: string; description: string; action?: ReactNode }) {
  return (
    <div className="flex min-h-48 flex-col items-center justify-center rounded-lg border border-dashed border-border px-5 py-10 text-center">
      <FileQuestion className="mb-3 h-5 w-5 text-muted-foreground" aria-hidden="true" />
      <p className="text-sm font-medium">{title}</p>
      <p className="mt-1 max-w-xs text-xs leading-5 text-muted-foreground">{description}</p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function PageSkeleton() {
  return (
    <div role="status" aria-label="Inhalte werden geladen" className="animate-pulse space-y-5">
      <div className="space-y-2"><div className="h-2 w-16 rounded bg-muted" /><div className="h-6 w-36 rounded bg-muted" /><div className="h-3 w-64 max-w-full rounded bg-muted" /></div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{[0, 1, 2].map((item) => <div key={item} className="h-24 rounded-lg border border-border bg-card p-4"><div className="h-3 w-1/2 rounded bg-muted" /><div className="mt-5 h-2 w-full rounded bg-muted" /></div>)}</div>
      <span className="sr-only">Laden …</span>
    </div>
  );
}

export function SearchInput({ value, onChange, placeholder }: { value: string; onChange: (value: string) => void; placeholder: string }) {
  return (
    <input
      type="search"
      value={value}
      onChange={(event) => onChange(event.target.value)}
      placeholder={placeholder}
      aria-label={placeholder}
      className="h-8 w-full rounded-md border border-input bg-background px-2.5 text-xs outline-none transition placeholder:text-muted-foreground focus-visible:ring-1 focus-visible:ring-ring sm:w-56"
    />
  );
}

export function CreateButton({ children, onClick }: { children: ReactNode; onClick: () => void }) {
  return <Button size="sm" onClick={onClick} className="h-8 gap-1.5 text-xs">{children}</Button>;
}
