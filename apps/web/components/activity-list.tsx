'use client';

import Link from 'next/link';
import { FileText } from 'lucide-react';

import { useI18n } from '@/components/i18n-provider';
import { formatDateTime } from '@/lib/dates';
import { entityHref, entityIcons } from '@/lib/entities';
import type { ActivityEntry } from '@/lib/types';
import { cn } from '@/lib/utils';

/** Timeline of created/edited/archived entries (from the activity log). */
export function ActivityList({ entries }: { entries: ActivityEntry[] }) {
  const { t, language } = useI18n();
  if (!entries.length) return <p className="py-6 text-center text-sm text-muted-foreground">{t('projectHub.noActivity')}</p>;
  return (
    <ol className="relative space-y-3 border-l pl-4">
      {entries.map((entry) => {
        const Icon = entityIcons[entry.entity_type] ?? FileText;
        const gone = entry.action === 'delete';
        return (
          <li key={entry.id} className="relative">
            <span className={cn('absolute -left-[21px] top-1 h-2.5 w-2.5 rounded-full border-2 border-background',
              entry.action === 'create' ? 'bg-success' : entry.action === 'delete' ? 'bg-destructive' : entry.action === 'archive' ? 'bg-warning' : 'bg-info')} />
            <p className="flex items-center gap-1.5 text-sm">
              <Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              {gone ? <span className="truncate text-muted-foreground line-through">{entry.title || t('common.untitled')}</span> : (
                <Link href={entityHref(entry.entity_type, entry.entity_id)} className="truncate hover:underline">{entry.title || t('common.untitled')}</Link>
              )}
            </p>
            <p className="text-xs text-muted-foreground">
              {t(`activity.${entry.action}`)} · {formatDateTime(entry.at, language)}{entry.source !== 'app' && ` · ${t(`activity.via_${entry.source as 'app'}`)}`}
            </p>
          </li>
        );
      })}
    </ol>
  );
}
