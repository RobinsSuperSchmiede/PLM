'use client';

import { type FormEvent, type ReactNode, useCallback, useEffect, useMemo, useState } from 'react';
import { Bot, CheckCircle2, ExternalLink, Loader2, Newspaper, Send, Unlink } from 'lucide-react';
import { toast } from 'sonner';

import { useI18n } from '@/components/i18n-provider';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { CopyButton, PageSkeleton } from '@/components/workspace-ui';
import { api, ApiError } from '@/lib/api';
import type { TelegramSettings as Telegram, TelegramUpdate } from '@/lib/types';
import { cn } from '@/lib/utils';

const leadTimes = [0, 5, 10, 15, 30, 60];

function failureMessage(failure: unknown) {
  return failure instanceof ApiError || failure instanceof Error ? failure.message : String(failure);
}

function timezones(): string[] {
  const intl = Intl as unknown as { supportedValuesOf?: (key: string) => string[] };
  return intl.supportedValuesOf?.('timeZone') ?? ['Europe/Berlin', 'Europe/Vienna', 'Europe/Zurich', 'Europe/London', 'UTC'];
}

export function TelegramSettings() {
  const { t } = useI18n();
  const [telegram, setTelegram] = useState<Telegram | null>(null);
  const [token, setToken] = useState('');
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setTelegram(await api.get<Telegram>('/telegram'));
    } catch (failure) {
      toast.error(failureMessage(failure));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // While waiting for the user to press "Start" in Telegram, check every few seconds whether the chat got linked.
  const waiting = Boolean(telegram?.token_set && !telegram.linked);
  useEffect(() => {
    if (!waiting) return;
    const interval = window.setInterval(() => void api.get<Telegram>('/telegram').then(setTelegram).catch(() => undefined), 3000);
    return () => window.clearInterval(interval);
  }, [waiting]);

  async function run<T>(key: string, action: () => Promise<T>, success?: string) {
    setBusy(key);
    try {
      const result = await action();
      if (success) toast.success(success);
      return result;
    } catch (failure) {
      toast.error(failureMessage(failure));
      return null;
    } finally {
      setBusy(null);
    }
  }

  async function patch(update: TelegramUpdate, key = 'patch') {
    const saved = await run(key, () => api.patch<Telegram>('/telegram', update));
    if (saved) setTelegram(saved);
    return saved;
  }

  async function saveToken(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token.trim()) return;
    const saved = await patch({ bot_token: token.trim() }, 'token');
    if (saved) {
      setToken('');
      toast.success(t('settings.tokenSaved', { bot: saved.bot_username ?? '' }));
    }
  }

  if (!telegram) return <PageSkeleton />;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base"><Send className="h-4 w-4" />{t('settings.telegramTitle')}</CardTitle>
          <CardDescription>{t('settings.telegramDesc')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <Step number={1} title={t('settings.tgStep1')} done={telegram.token_set}>
            {telegram.token_set ? (
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="secondary" className="gap-1.5 py-1"><Bot className="h-3.5 w-3.5" />@{telegram.bot_username}</Badge>
                <Button variant="ghost" size="sm" className="text-muted-foreground" disabled={busy !== null} onClick={() => void patch({ bot_token: '' }, 'remove')}>
                  {t('settings.removeBot')}
                </Button>
              </div>
            ) : (
              <>
                <p className="text-sm text-muted-foreground">{t('settings.tgStep1Desc')}</p>
                <form onSubmit={saveToken} className="flex flex-col gap-2 sm:flex-row">
                  <Input
                    type="password"
                    autoComplete="off"
                    value={token}
                    onChange={(event) => setToken(event.target.value)}
                    placeholder="123456789:AA…"
                    aria-label={t('settings.botToken')}
                    className="font-mono sm:max-w-sm"
                  />
                  <Button type="submit" disabled={!token.trim() || busy !== null}>
                    {busy === 'token' && <Loader2 className="animate-spin" />}{t('common.save')}
                  </Button>
                  <Button variant="outline" asChild>
                    <a href="https://t.me/BotFather" target="_blank" rel="noreferrer noopener"><ExternalLink />{t('settings.openBotFather')}</a>
                  </Button>
                </form>
              </>
            )}
          </Step>

          <Step number={2} title={t('settings.tgStep2')} done={telegram.linked} disabled={!telegram.token_set} last>
            {telegram.linked ? (
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-sm">
                  <CheckCircle2 className="h-4 w-4 text-success" />
                  <span className="font-medium">{t('settings.linkedTo', { name: telegram.chat_name ?? 'Telegram' })}</span>
                  <span className="hidden text-muted-foreground sm:inline">· {t('settings.linkedDesc')}</span>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button variant="outline" size="sm" disabled={busy !== null} onClick={() => void run('test', () => api.post('/telegram/test'), t('settings.messageSent'))}>
                    {busy === 'test' ? <Loader2 className="animate-spin" /> : <Send />}{t('settings.sendTestMessage')}
                  </Button>
                  <Button variant="outline" size="sm" disabled={busy !== null} onClick={() => void run('digest', () => api.post('/telegram/digest'), t('settings.messageSent'))}>
                    {busy === 'digest' ? <Loader2 className="animate-spin" /> : <Newspaper />}{t('settings.sendDigest')}
                  </Button>
                  <Button variant="ghost" size="sm" className="text-muted-foreground" disabled={busy !== null}
                    onClick={() => void run('unlink', () => api.post<Telegram>('/telegram/unlink')).then((saved) => saved && setTelegram(saved))}>
                    <Unlink />{t('settings.unlink')}
                  </Button>
                </div>
              </div>
            ) : telegram.token_set && (
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">{t('settings.tgStep2Desc')}</p>
                <div className="flex flex-wrap items-center gap-2">
                  {telegram.link_url && (
                    <Button asChild><a href={telegram.link_url} target="_blank" rel="noreferrer noopener"><Send />{t('settings.openTelegram')}</a></Button>
                  )}
                  <span className="inline-flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />{t('settings.waiting')}
                  </span>
                </div>
                <div className="space-y-1.5">
                  <p className="text-xs text-muted-foreground">{t('settings.orSend', { bot: telegram.bot_username ?? '' })}</p>
                  <div className="flex items-center gap-2">
                    <code className="truncate rounded-md border bg-muted/50 px-3 py-1.5 font-mono text-xs">/start {telegram.link_code}</code>
                    <CopyButton value={`/start ${telegram.link_code}`} />
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">{t('settings.needsApi')}</p>
              </div>
            )}
          </Step>
        </CardContent>
      </Card>

      <NotificationOptions telegram={telegram} onChange={(update) => void patch(update)} />
    </div>
  );
}

function Step({ number, title, done, disabled, last, children }: {
  number: number;
  title: string;
  done: boolean;
  disabled?: boolean;
  last?: boolean;
  children: ReactNode;
}) {
  return (
    <div className={cn('relative flex gap-4', disabled && 'opacity-50')}>
      {!last && <span className="absolute left-[13px] top-8 h-[calc(100%-1rem)] w-px bg-border" aria-hidden="true" />}
      <span
        className={cn(
          'relative flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-xs font-semibold transition-colors duration-300',
          done ? 'border-success bg-success text-white' : 'bg-background',
        )}
      >
        {done ? <CheckCircle2 className="h-4 w-4 duration-300 animate-in zoom-in-50" /> : number}
      </span>
      <div className="min-w-0 flex-1 space-y-3 pb-1 pt-0.5">
        <p className="text-sm font-medium">{title}</p>
        {!disabled && children}
      </div>
    </div>
  );
}

function NotificationOptions({ telegram, onChange }: { telegram: Telegram; onChange: (update: TelegramUpdate) => void }) {
  const { t } = useI18n();
  const zones = useMemo(timezones, []);
  const [timezone, setTimezone] = useState(telegram.timezone);
  const [digestTime, setDigestTime] = useState(telegram.digest_time);

  useEffect(() => setTimezone(telegram.timezone), [telegram.timezone]);
  useEffect(() => setDigestTime(telegram.digest_time), [telegram.digest_time]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{t('settings.notificationsTitle')}</CardTitle>
        <CardDescription>{t('settings.notificationsDesc')}</CardDescription>
      </CardHeader>
      <CardContent className="divide-y">
        <OptionRow title={t('settings.tgEnabled')} description={t('settings.tgEnabledDesc')}>
          <Switch checked={telegram.enabled} onCheckedChange={(enabled) => onChange({ enabled })} aria-label={t('settings.tgEnabled')} />
        </OptionRow>
        <OptionRow title={t('settings.digest')} description={t('settings.digestDesc')}>
          <div className="flex items-center gap-3">
            <Input
              type="time"
              value={digestTime}
              disabled={!telegram.daily_digest}
              onChange={(event) => setDigestTime(event.target.value)}
              onBlur={() => digestTime && digestTime !== telegram.digest_time && onChange({ digest_time: digestTime })}
              aria-label={t('common.time')}
              className="w-28"
            />
            <Switch checked={telegram.daily_digest} onCheckedChange={(daily_digest) => onChange({ daily_digest })} aria-label={t('settings.digest')} />
          </div>
        </OptionRow>
        <OptionRow title={t('settings.eventReminder')} description={t('settings.eventReminderDesc')}>
          <Select value={String(telegram.event_reminder_minutes)} onValueChange={(value) => onChange({ event_reminder_minutes: Number(value) })}>
            <SelectTrigger className="w-40" aria-label={t('settings.eventReminder')}><SelectValue /></SelectTrigger>
            <SelectContent>
              {leadTimes.map((minutes) => (
                <SelectItem key={minutes} value={String(minutes)}>
                  {minutes === 0 ? t('settings.off') : minutes === 60 ? t('settings.hourBefore') : t('settings.minutesBefore', { count: minutes })}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </OptionRow>
        <OptionRow title={t('settings.timezone')} description={t('settings.timezoneDesc')}>
          <Input
            list="timezones"
            value={timezone}
            onChange={(event) => setTimezone(event.target.value)}
            onBlur={() => zones.includes(timezone) && timezone !== telegram.timezone ? onChange({ timezone }) : setTimezone(telegram.timezone)}
            aria-label={t('settings.timezone')}
            className="w-56"
          />
          <datalist id="timezones">{zones.map((zone) => <option key={zone} value={zone} />)}</datalist>
        </OptionRow>
        <OptionRow title={t('settings.commands')} description={t('settings.commandsDesc')}>
          <Switch checked={telegram.commands_enabled} onCheckedChange={(commands_enabled) => onChange({ commands_enabled })} aria-label={t('settings.commands')} />
        </OptionRow>
      </CardContent>
    </Card>
  );
}

function OptionRow({ title, description, children }: { title: string; description: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-3 py-4 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between">
      <div className="space-y-0.5">
        <p className="text-sm font-medium">{title}</p>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}
