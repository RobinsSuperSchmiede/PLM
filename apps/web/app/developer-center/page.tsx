'use client';

import { useCallback, useEffect, useState } from 'react';
import { Activity, Bot, Database, ExternalLink, RefreshCw, Server } from 'lucide-react';

import { useI18n } from '@/components/i18n-provider';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { PageHeader } from '@/components/workspace-ui';
import { useWorkspace } from '@/components/workspace-provider';
import { api } from '@/lib/api';
import type { Overview } from '@/lib/types';
import { cn } from '@/lib/utils';

type Ready = { status: string; database: string };

const endpoints = [
  ['GET', '/api/v1/health'],
  ['GET', '/api/v1/ready'],
  ['GET · PATCH', '/api/v1/settings'],
  ['CRUD', '/api/v1/projects · tasks · events · meetings'],
  ['CRUD', '/api/v1/notes · ideas · knowledge · records'],
  ['CRUD', '/api/v1/lists/{id}/items'],
  ['POST', '/mcp'],
];

export default function DeveloperCenterPage() {
  const { t } = useI18n();
  const { settings } = useWorkspace();
  const [ready, setReady] = useState<Ready | null | 'error'>(null);
  const [overview, setOverview] = useState<Overview | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    const [readyResult, overviewResult] = await Promise.allSettled([api.get<Ready>('/ready'), api.get<Overview>('/overview')]);
    setReady(readyResult.status === 'fulfilled' ? readyResult.value : 'error');
    setOverview(overviewResult.status === 'fulfilled' ? overviewResult.value : null);
    setRefreshing(false);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const online = ready !== null && ready !== 'error';
  const status = [
    { label: t('developer.api'), value: online ? t('developer.online') : t('developer.offline'), ok: online, icon: Server },
    { label: t('developer.database'), value: online ? ready.database : '—', ok: online, icon: Database },
    { label: t('developer.mcp'), value: settings?.mcp_enabled ? t('developer.online') : t('developer.offline'), ok: Boolean(settings?.mcp_enabled), icon: Bot },
  ];

  return (
    <div>
      <PageHeader
        title={t('developer.title')}
        description={t('developer.description')}
        action={<Button variant="outline" onClick={() => void refresh()} disabled={refreshing}><RefreshCw className={cn(refreshing && 'animate-spin')} />{t('common.retry')}</Button>}
      />

      <div className="grid gap-4 sm:grid-cols-3">
        {status.map(({ label, value, ok, icon: Icon }) => (
          <Card key={label}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardDescription className="font-medium">{label}</CardDescription>
              <Icon className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent className="flex items-center gap-2">
              <span className={cn('h-2 w-2 rounded-full', ok ? 'bg-success' : 'bg-destructive')} />
              <span className="text-lg font-semibold capitalize">{value}</span>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base"><Activity className="h-4 w-4" />{t('developer.endpoints')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1.5">
            {endpoints.map(([method, path]) => (
              <div key={path} className="flex items-center gap-3 text-sm">
                <Badge variant="outline" className="w-24 justify-center font-mono text-[10px]">{method}</Badge>
                <code className="truncate font-mono text-xs">{path}</code>
              </div>
            ))}
            <div className="pt-3">
              <p className="text-sm font-medium">{t('developer.docs')}</p>
              <p className="mb-2 text-sm text-muted-foreground">{t('developer.docsDesc')}</p>
              <Button variant="outline" size="sm" asChild>
                <a href="http://localhost:8000/docs" target="_blank" rel="noreferrer noopener"><ExternalLink />localhost:8000/docs</a>
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base"><Database className="h-4 w-4" />{t('developer.tables')}</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader><TableRow className="hover:bg-transparent"><TableHead className="pl-5">Table</TableHead><TableHead className="pr-5 text-right">Rows</TableHead></TableRow></TableHeader>
              <TableBody>
                {Object.entries(overview?.tables ?? {}).map(([name, count]) => (
                  <TableRow key={name}>
                    <TableCell className="pl-5 font-mono text-xs">{name}</TableCell>
                    <TableCell className="pr-5 text-right tabular-nums">{count}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
