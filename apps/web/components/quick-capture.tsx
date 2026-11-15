'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { ArrowDownLeft, ArrowUpRight, CheckSquare2, ExternalLink, FileText, Lightbulb, Send } from 'lucide-react';
import { toast } from 'sonner';

import { DotLoader } from '@/components/dot-loader';
import { useI18n } from '@/components/i18n-provider';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useWorkspace } from '@/components/workspace-provider';
import { api, peek } from '@/lib/api';
import { formatDateTime } from '@/lib/dates';
import { entityHref, entityLabelKeys } from '@/lib/entities';
import type { EntityType, Project, TelegramLogEntry, TelegramSettings } from '@/lib/types';
import { cn } from '@/lib/utils';

type Mode = 'send' | 'note' | 'task' | 'idea';

const modes: { value: Mode; icon: typeof Send }[] = [
  { value: 'send', icon: Send },
  { value: 'note', icon: FileText },
  { value: 'task', icon: CheckSquare2 },
  { value: 'idea', icon: Lightbulb },
];

const slug = (value: string) => value.toLowerCase().replace(/[^0-9a-zäöüß]/g, '');

/** Pull #tags and an @Project mention out of a captured text (same rules as the Telegram bot). */
export function parseCapture(text: string, projects: Project[]) {
  const tags = [...text.matchAll(/(?<![\w&])#([^\s#@,.;:!?]+)/g)].map((match) => match[1].toLowerCase());
  let rest = text.replace(/(?<![\w&])#([^\s#@,.;:!?]+)/g, '');
  let project: Project | undefined;
  for (const match of rest.matchAll(/(?<![\w])@(\S+)/g)) {
    project = projects.find((item) => slug(item.name) === slug(match[1]));
    if (project) {
      rest = rest.replace(match[0], '');
      break;
    }
  }
  const cleaned = rest.split('\n').map((line) => line.replace(/[ \t]{2,}/g, ' ').trim()).join('\n').trim();
  return { text: cleaned, tags, project };
}

/** Telegram in the header bar: connection status, bot link, recent messages and quick capture. */
export function TelegramMenu() {
  const { t, language } = useI18n();
  const { data, create, setTags } = useWorkspace();
  const [open, setOpen] = useState(false);
  const [telegram, setTelegram] = useState<TelegramSettings | null>(() => peek<TelegramSettings>('/telegram') ?? null);
  const [recent, setRecent] = useState<TelegramLogEntry[]>([]);
  const [mode, setMode] = useState<Mode>('send');
  const [alsoSend, setAlsoSend] = useState(false);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const connected = Boolean(telegram?.enabled && telegram.linked);

  const load = useCallback(() => {
    api.get<TelegramSettings>('/telegram').then(setTelegram).catch(() => setTelegram(null));
  }, []);

  useEffect(() => {
    load();
    const interval = window.setInterval(load, 60_000);
    return () => window.clearInterval(interval);
  }, [load]);

  useEffect(() => {
    if (open) api.get<TelegramLogEntry[]>('/telegram/messages?limit=4').then(setRecent).catch(() => setRecent([]));
  }, [open]);

  useEffect(() => {
    if (telegram && !connected && mode === 'send') setMode('note');
  }, [connected, mode, telegram]);

  async function submit() {
    const raw = text.trim();
    if (!raw || busy) return;
    setBusy(true);
    try {
      if (mode === 'send' || alsoSend) await api.post('/telegram/message', { text: raw });
      if (mode !== 'send') {
        const parsed = parseCapture(raw, data.projects);
        const [first, ...rest] = parsed.text.split('\n');
        const body = rest.join('\n').trim() || null;
        const projectId = parsed.project?.id ?? null;
        const type: EntityType = mode;
        const created = mode === 'note'
          ? await create('notes', { title: first, content: body, project_id: projectId })
          : mode === 'task'
            ? await create('tasks', { title: first || raw, description: body, project_id: projectId })
            : await create('ideas', { title: first || raw, description: body, project_id: projectId });
        if (!created) return;
        if (parsed.tags.length) await setTags(type, created.id, parsed.tags);
        toast.success(t('ui.captured', { type: t(entityLabelKeys[type]) }), {
          action: { label: t('graph.open'), onClick: () => { window.location.href = entityHref(type, created.id); } },
        });
      } else {
        toast.success(t('ui.sent'));
      }
      setText('');
      setOpen(false);
    } catch (failure) {
      toast.error(t('common.errorSaving', { message: failure instanceof Error ? failure.message : String(failure) }));
    } finally {
      setBusy(false);
    }
  }

  const botUrl = telegram?.bot_username ? `https://t.me/${telegram.bot_username}` : null;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <Button variant="outline" size="icon" className="ds-float relative h-8 w-8" aria-label={`${t('nav.telegram')} – ${connected ? t('ui.telegramConnected') : t('ui.telegramOffline')}`}>
              <Send />
              <span className={cn('absolute right-0 top-0 h-2 w-2 rounded-full ring-2 ring-background', connected ? 'bg-success' : 'bg-muted-foreground/50')} aria-hidden="true" />
            </Button>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent>{connected ? t('ui.telegramConnected') : t('ui.telegramOffline')}</TooltipContent>
      </Tooltip>
      <PopoverContent align="end" className="w-[min(26rem,calc(100vw-1.5rem))] p-0">
        <div className="flex items-center gap-3 border-b px-4 py-3">
          <span className="relative flex h-2.5 w-2.5">
            
            <span className={cn('relative inline-flex h-2.5 w-2.5 rounded-full', connected ? 'bg-success' : 'bg-muted-foreground/40')} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold">{connected ? t('ui.telegramConnected') : t('ui.telegramOffline')}</p>
            <p className="truncate text-xs text-muted-foreground">
              {connected ? t('telegramHub.connectedAs', { name: telegram?.chat_name ?? 'Telegram', bot: telegram?.bot_username ?? 'bot' }) : t('telegramHub.notConnectedDesc')}
            </p>
          </div>
          {botUrl ? (
            <Button variant="outline" size="sm" asChild><a href={botUrl} target="_blank" rel="noreferrer">Bot<ExternalLink /></a></Button>
          ) : (
            <Button size="sm" asChild><Link href="/settings?tab=telegram" onClick={() => setOpen(false)}>{t('telegramHub.setup')}</Link></Button>
          )}
        </div>

        <div className="space-y-3 p-4">
          <div className="grid grid-cols-4 gap-0.5 rounded-full ds-glass p-[3px]" role="radiogroup" aria-label={t('ui.captureAs')}>
            {modes.map(({ value, icon: Icon }) => (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={mode === value}
                disabled={value === 'send' && !connected}
                onClick={() => setMode(value)}
                className={cn(
                  'flex h-[22px] items-center justify-center gap-1.5 rounded-full px-2 text-xs font-book transition-[background-color,box-shadow,color] duration-600 ease-ds disabled:opacity-40',
                  mode === value ? 'bg-seg text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
                )}
              >
                <Icon className="h-3.5 w-3.5" />
                {value === 'send' ? t('ui.send') : t(entityLabelKeys[value])}
              </button>
            ))}
          </div>
          <Textarea
            autoFocus
            value={text}
            onChange={(event) => setText(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
                event.preventDefault();
                void submit();
              }
            }}
            placeholder={t('ui.quickSendPlaceholder')}
            rows={3}
            className="min-h-[96px]"
          />
          <div className="flex items-center gap-3">
            {mode !== 'send' && connected ? (
              <label className="flex flex-1 items-center gap-2 text-xs text-muted-foreground">
                <Switch checked={alsoSend} onCheckedChange={setAlsoSend} />
                {t('ui.alsoSend')}
              </label>
            ) : (
              <p className="flex-1 text-xs text-muted-foreground">{t('ui.shortcutHint', { key: 'Ctrl' })}</p>
            )}
            <Button size="sm" onClick={() => void submit()} disabled={busy || !text.trim()}>
              {busy ? <DotLoader size={14} className="text-primary-foreground" /> : <Send />}
              {mode === 'send' ? t('ui.send') : t('common.save')}
            </Button>
          </div>
        </div>

        {recent.length > 0 && (
          <ul className="space-y-1 border-t px-2 py-2">
            {recent.map((entry) => (
              <li key={entry.id} className="flex items-start gap-2 rounded-xl px-2 py-1.5 text-xs">
                {entry.direction === 'in' ? <ArrowDownLeft className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" /> : <ArrowUpRight className="mt-0.5 h-3.5 w-3.5 shrink-0 text-success" />}
                <span className="min-w-0 flex-1 truncate">{entry.text}</span>
                <span className="shrink-0 text-muted-foreground">{formatDateTime(entry.at, language)}</span>
              </li>
            ))}
          </ul>
        )}
        <div className="flex justify-between border-t px-4 py-2.5 text-xs">
          <Link href="/telegram" onClick={() => setOpen(false)} className="font-medium hover:underline">{t('telegramHub.history')}</Link>
          <Link href="/settings?tab=telegram" onClick={() => setOpen(false)} className="text-muted-foreground hover:text-foreground">{t('telegramHub.settings')}</Link>
        </div>
      </PopoverContent>
    </Popover>
  );
}
