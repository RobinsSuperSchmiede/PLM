'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { ArrowDownLeft, ArrowUpRight, Loader2, MessageCircle, Send, Settings } from 'lucide-react';
import { toast } from 'sonner';

import { useI18n } from '@/components/i18n-provider';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { EmptyState, PageHeader, PageSkeleton } from '@/components/workspace-ui';
import { useWorkspace } from '@/components/workspace-provider';
import { api, peek } from '@/lib/api';
import { formatDateTime } from '@/lib/dates';
import { entityHref, entityIcons, entityLabelKeys } from '@/lib/entities';
import type { TelegramLogEntry, TelegramSettings } from '@/lib/types';
import { cn } from '@/lib/utils';

const commands = [
  { de: '/heute', en: '/today' },
  { de: '/aufgaben', en: '/tasks' },
  { de: '/aufgabe Steuer #finanzen', en: '/task Taxes #finance' },
  { de: '/notiz Idee @KundeA', en: '/note Idea @ClientA' },
  { de: '/termin morgen 14:00 Zahnarzt', en: '/event tomorrow 14:00 Dentist' },
  { de: '/erinnerung in 30m Tee', en: '/remind in 30m Tea' },
  { de: '/projekt Umzug', en: '/project Moving' },
];

export default function TelegramPage() {
  const { t, language } = useI18n();
  const { data } = useWorkspace();
  const [settings, setSettings] = useState<TelegramSettings | null>(() => peek<TelegramSettings>('/telegram') ?? null);
  const [log, setLog] = useState<TelegramLogEntry[] | null>(() => peek<TelegramLogEntry[]>('/telegram/messages?limit=200') ?? null);
  const [filter, setFilter] = useState<'all' | 'in' | 'out'>('all');
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);

  const load = useCallback(() => {
    api.get<TelegramSettings>('/telegram').then(setSettings).catch(() => setSettings(null));
    api.get<TelegramLogEntry[]>('/telegram/messages?limit=200').then(setLog).catch(() => setLog([]));
  }, []);
  useEffect(() => {
    load();
    const interval = window.setInterval(load, 15_000);
    return () => window.clearInterval(interval);
  }, [load]);

  if (!log) return <PageSkeleton />;

  const connected = Boolean(settings?.enabled && settings.linked);
  const visible = log.filter((entry) => filter === 'all' || entry.direction === filter);
  const incoming = log.filter((entry) => entry.direction === 'in').length;
  const projectName = (id: string | null) => data.projects.find((project) => project.id === id)?.name;

  async function send() {
    if (!text.trim()) return;
    setSending(true);
    try {
      await api.post('/telegram/message', { text: text.trim() });
      toast.success(t('ui.sent'));
      setText('');
      load();
    } catch (failure) {
      toast.error(t('common.errorSaving', { message: failure instanceof Error ? failure.message : String(failure) }));
    } finally {
      setSending(false);
    }
  }

  return (
    <div>
      <PageHeader title={t('telegramHub.title')} description={t('telegramHub.description')}
        action={<Button variant="outline" asChild><Link href="/settings?tab=telegram"><Settings />{t('telegramHub.settings')}</Link></Button>} />

      <div className="grid gap-6 xl:grid-cols-[minmax(0,380px)_minmax(0,1fr)]">
        <div className="space-y-6">
          <Card>
            <CardHeader><CardTitle className="text-base">{t('telegramHub.status')}</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center gap-3">
                <span className="relative flex h-3 w-3">
                  
                  <span className={cn('relative inline-flex h-3 w-3 rounded-full', connected ? 'bg-success' : 'bg-muted-foreground/40')} />
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-medium">{connected ? t('ui.telegramConnected') : t('telegramHub.notConnected')}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {connected ? t('telegramHub.connectedAs', { name: settings?.chat_name ?? 'Telegram', bot: settings?.bot_username ?? 'bot' }) : t('telegramHub.notConnectedDesc')}
                  </p>
                </div>
              </div>
              {!connected && <Button asChild className="w-full"><Link href="/settings?tab=telegram">{t('telegramHub.setup')}</Link></Button>}
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-xl bg-muted p-3.5"><p className="text-xs text-muted-foreground">{t('telegramHub.received')}</p><p className="text-xl font-semibold tabular-nums">{incoming}</p></div>
                <div className="rounded-xl bg-muted p-3.5"><p className="text-xs text-muted-foreground">{t('telegramHub.sentCount')}</p><p className="text-xl font-semibold tabular-nums">{log.length - incoming}</p></div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">{t('ui.quickSendTitle')}</CardTitle>
              <CardDescription>{t('ui.quickSendDesc')}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <Textarea value={text} onChange={(event) => setText(event.target.value)} rows={4} disabled={!connected} placeholder={t('ui.quickSendPlaceholder')}
                onKeyDown={(event) => { if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) { event.preventDefault(); void send(); } }} />
              <Button onClick={() => void send()} disabled={!connected || sending || !text.trim()} className="w-full">
                {sending ? <Loader2 className="animate-spin" /> : <Send />}{t('ui.send')}
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">{t('telegramHub.commands')}</CardTitle>
              <CardDescription>{t('telegramHub.commandsDesc')}</CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="space-y-1.5">
                {commands.map((command) => <li key={command.en}><code className="rounded bg-muted px-1.5 py-0.5 text-xs">{command[language === 'de' ? 'de' : 'en']}</code></li>)}
              </ul>
            </CardContent>
          </Card>
        </div>

        <Card className="flex min-h-[520px] flex-col">
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <CardTitle className="text-base">{t('telegramHub.history')}</CardTitle>
            <div className="flex gap-0.5 rounded-full ds-glass p-[3px]">
              {(['all', 'in', 'out'] as const).map((value) => (
                <button key={value} type="button" aria-pressed={filter === value} onClick={() => setFilter(value)}
                  className={cn('h-[22px] rounded-full px-2.5 text-xs font-book transition-[background-color,box-shadow,color] duration-600 ease-ds', filter === value ? 'bg-seg text-foreground shadow-sm' : 'text-muted-foreground')}>
                  {value === 'all' ? t('telegramHub.filterAll') : value === 'in' ? t('telegramHub.incoming') : t('telegramHub.outgoing')}
                </button>
              ))}
            </div>
          </CardHeader>
          <CardContent className="flex-1">
            {visible.length === 0 ? <EmptyState icon={MessageCircle} title={t('telegramHub.noHistory')} className="h-full border-0" /> : (
              <ol className="space-y-2">
                {visible.map((entry) => {
                  const Icon = entry.entity_type ? entityIcons[entry.entity_type] : null;
                  return (
                    <li key={entry.id} className="row-enter flex gap-3 rounded-2xl bg-muted px-3 py-2.5">
                      <span className={cn('mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full', entry.direction === 'in' ? 'ds-glass text-foreground' : 'bg-success/15 text-success')}>
                        {entry.direction === 'in' ? <ArrowDownLeft className="h-3.5 w-3.5" /> : <ArrowUpRight className="h-3.5 w-3.5" />}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="whitespace-pre-wrap break-words text-sm">{entry.text}</p>
                        <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                          <span>{formatDateTime(entry.at, language)}</span>
                          {Icon && entry.entity_type && entry.entity_id && entry.direction === 'in' && (
                            <Link href={entityHref(entry.entity_type, entry.entity_id)} className="inline-flex items-center gap-1 text-foreground hover:underline">
                              <Icon className="h-3 w-3" />{t('telegramHub.createdEntity')}: {t(entityLabelKeys[entry.entity_type])}
                            </Link>
                          )}
                          {projectName(entry.project_id) && entry.direction === 'in' && (
                            <Link href={`/projects/${entry.project_id}?tab=telegram`} className="underline-offset-4 hover:underline">{projectName(entry.project_id)}</Link>
                          )}
                        </p>
                      </div>
                    </li>
                  );
                })}
              </ol>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
