'use client';

import Link from 'next/link';
import { type FormEvent, type ReactNode, useCallback, useEffect, useState } from 'react';
import { useTheme } from 'next-themes';
import {
  ArrowLeft, ArrowRight, Bot, Check, CheckCircle2, ExternalLink, FolderTree, Loader2, Monitor, Moon, Palette, Pin, PlayCircle, Send, Sparkles, Sun,
} from 'lucide-react';
import { toast } from 'sonner';

import { FeatureReel } from '@/components/onboarding/feature-reel';
import { useI18n } from '@/components/i18n-provider';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Segmented } from '@/components/ui/segmented';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { CopyButton } from '@/components/workspace-ui';
import { useWorkspace } from '@/components/workspace-provider';
import { api, ApiError } from '@/lib/api';
import { type Accent, type Ambient, type Appearance, accents, ambients, defaultAppearance, loadAppearance, saveAppearance } from '@/lib/appearance';
import { type McpClient, mcpSnippets } from '@/lib/mcp';
import type { Language, TelegramSettings, ThemePreference } from '@/lib/types';
import { cn } from '@/lib/utils';

const steps = ['welcome', 'tour', 'design', 'mcp', 'telegram', 'done'] as const;
type Step = typeof steps[number];
const stepIcons: Record<Step, typeof Sparkles> = { welcome: Sparkles, tour: PlayCircle, design: Palette, mcp: Bot, telegram: Send, done: Check };

/**
 * First-run walkthrough: welcome, a short animated tour, design, MCP and the Telegram bot.
 * Finishing or skipping stores `onboarding_done`, so it shows up once per installation.
 */
export function Walkthrough({ onClose }: { onClose: () => void }) {
  const { t } = useI18n();
  const { saveSettings } = useWorkspace();
  const [step, setStep] = useState<Step>('welcome');
  const index = steps.indexOf(step);

  const finish = useCallback(() => {
    void saveSettings({ onboarding_done: true });
    onClose();
  }, [onClose, saveSettings]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') finish(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [finish]);

  const next = () => (index === steps.length - 1 ? finish() : setStep(steps[index + 1]));
  const back = () => setStep(steps[Math.max(0, index - 1)]);

  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center bg-background/60 backdrop-blur-md duration-500 animate-in fade-in sm:items-center sm:p-6"
      role="dialog" aria-modal="true" aria-labelledby="onboarding-title">
      <div className="ds-menu flex max-h-[100dvh] w-full max-w-3xl flex-col overflow-hidden rounded-t-3xl shadow-2xl duration-500 ease-ds animate-in fade-in slide-in-from-bottom-4 sm:max-h-[min(860px,94vh)] sm:rounded-3xl">
        {/* Step indicator */}
        <div className="flex items-center gap-3 border-b px-5 py-3">
          <ol className="flex flex-1 items-center gap-1.5" aria-label={t('onboarding.progress')}>
            {steps.map((entry, position) => {
              const Icon = stepIcons[entry];
              return (
                <li key={entry} className="flex flex-1 items-center gap-1.5">
                  <button type="button" onClick={() => setStep(entry)} aria-current={entry === step ? 'step' : undefined} title={t(`onboarding.step_${entry}`)}
                    className={cn('flex h-7 shrink-0 items-center gap-1.5 rounded-full px-2 text-xs transition-[background-color,color] duration-300',
                      entry === step ? 'bg-primary text-primary-foreground' : position < index ? 'text-foreground hover:bg-accent' : 'text-muted-foreground hover:bg-accent')}>
                    {position < index ? <Check className="h-3.5 w-3.5" /> : <Icon className="h-3.5 w-3.5" strokeWidth={1.8} />}
                    <span className={cn('hidden md:inline', entry !== step && 'md:hidden lg:inline')}>{t(`onboarding.step_${entry}`)}</span>
                  </button>
                  {position < steps.length - 1 && <span className={cn('h-px flex-1 transition-colors duration-500', position < index ? 'bg-foreground/50' : 'bg-border')} />}
                </li>
              );
            })}
          </ol>
          {step !== 'done' && <Button variant="ghost" size="sm" className="shrink-0 text-muted-foreground" onClick={finish}>{t('onboarding.skip')}</Button>}
        </div>

        <div key={step} className="min-h-0 flex-1 overflow-y-auto px-5 py-6 duration-500 ease-ds animate-in fade-in slide-in-from-right-2 sm:px-8">
          {step === 'welcome' && <WelcomeStep />}
          {step === 'tour' && <TourStep />}
          {step === 'design' && <DesignStep />}
          {step === 'mcp' && <McpStep />}
          {step === 'telegram' && <TelegramStep />}
          {step === 'done' && <DoneStep onNavigate={finish} />}
        </div>

        <div className="flex items-center justify-between gap-2 border-t px-5 py-3">
          <Button variant="ghost" onClick={back} disabled={index === 0}><ArrowLeft />{t('onboarding.back')}</Button>
          <div className="flex items-center gap-2">
            {(step === 'mcp' || step === 'telegram') && <Button variant="ghost" className="text-muted-foreground" onClick={next}>{t('onboarding.later')}</Button>}
            <Button onClick={next}>
              {step === 'welcome' ? t('onboarding.start') : step === 'done' ? t('onboarding.finish') : t('onboarding.next')}
              {step !== 'done' && <ArrowRight />}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function StepHeader({ title, description, id }: { title: string; description: string; id?: string }) {
  return (
    <div className="mb-6 space-y-1.5">
      <h2 id={id} className="text-2xl font-semibold tracking-[-0.02em]">{title}</h2>
      <p className="text-sm leading-relaxed text-muted-foreground">{description}</p>
    </div>
  );
}

function WelcomeStep() {
  const { t, language, setLanguage } = useI18n();
  const { saveSettings } = useWorkspace();
  const points: { icon: typeof Sparkles; key: 'welcomePoint1' | 'welcomePoint2' | 'welcomePoint3' }[] = [
    { icon: FolderTree, key: 'welcomePoint1' }, { icon: Bot, key: 'welcomePoint2' }, { icon: Send, key: 'welcomePoint3' },
  ];
  return (
    <div className="flex flex-col items-center py-4 text-center sm:py-8">
      <span className="relative mb-6 flex h-20 w-20 items-center justify-center">
        <span className="intro-glow absolute inset-0 rounded-full bg-brand/30 blur-2xl" />
        <span className="intro-pop relative flex h-16 w-16 items-center justify-center rounded-[22px] bg-primary text-primary-foreground shadow-lg"><Sparkles className="h-7 w-7" strokeWidth={1.6} /></span>
      </span>
      <h2 id="onboarding-title" className="intro-rise text-[32px] font-semibold leading-tight tracking-[-0.03em]" style={{ '--d': '150ms' } as React.CSSProperties}>{t('onboarding.welcomeTitle')}</h2>
      <p className="intro-rise mt-3 max-w-lg text-[15px] leading-relaxed text-muted-foreground" style={{ '--d': '300ms' } as React.CSSProperties}>{t('onboarding.welcomeText')}</p>
      <div className="mt-8 grid w-full max-w-xl gap-2 sm:grid-cols-3">
        {points.map(({ icon: Icon, key }, position) => (
          <div key={key} className="intro-rise rounded-2xl bg-muted/70 p-4 text-left" style={{ '--d': `${450 + position * 120}ms` } as React.CSSProperties}>
            <Icon className="mb-2 h-4 w-4 text-muted-foreground" strokeWidth={1.6} />
            <p className="text-[13px] leading-snug">{t(`onboarding.${key}`)}</p>
          </div>
        ))}
      </div>
      <div className="mt-8 flex items-center gap-3 text-sm text-muted-foreground">
        <span>{t('settings.language')}</span>
        <Segmented value={language} label={t('settings.language')} options={[{ value: 'de', label: 'Deutsch' }, { value: 'en', label: 'English' }]}
          onChange={(value: Language) => { setLanguage(value); void saveSettings({ language: value }); }} />
      </div>
    </div>
  );
}

function TourStep() {
  const { t } = useI18n();
  return (
    <>
      <StepHeader title={t('onboarding.tourTitle')} description={t('onboarding.tourText')} id="onboarding-title" />
      <FeatureReel />
    </>
  );
}

function DesignStep() {
  const { t } = useI18n();
  const { theme, setTheme } = useTheme();
  const { saveSettings } = useWorkspace();
  const [value, setValue] = useState<Appearance>(defaultAppearance);
  useEffect(() => setValue(loadAppearance()), []);
  const set = (patch: Partial<Appearance>) => {
    const next = { ...value, ...patch };
    setValue(next);
    saveAppearance(next);
  };
  const themes: { value: ThemePreference; label: string; icon: typeof Sun }[] = [
    { value: 'light', label: t('shell.light'), icon: Sun },
    { value: 'dark', label: t('shell.dark'), icon: Moon },
    { value: 'system', label: t('shell.system'), icon: Monitor },
  ];

  return (
    <>
      <StepHeader title={t('onboarding.designTitle')} description={t('onboarding.designText')} id="onboarding-title" />
      <div className="space-y-7">
        <Option title={t('appearance.theme')}>
          <div className="grid max-w-md grid-cols-3 gap-2.5" role="radiogroup" aria-label={t('appearance.theme')}>
            {themes.map(({ value: option, label, icon: Icon }) => (
              <button key={option} type="button" role="radio" aria-checked={theme === option}
                onClick={() => { setTheme(option); void saveSettings({ theme: option }); }}
                className={cn('flex flex-col items-center gap-2 rounded-2xl p-4 text-[13px] transition-[background-color,box-shadow] duration-500 ease-ds',
                  theme === option ? 'bg-seg font-medium shadow-sm ring-1 ring-foreground/20' : 'bg-muted hover:bg-accent')}>
                <Icon className="h-5 w-5" strokeWidth={1.6} />{label}
              </button>
            ))}
          </div>
        </Option>

        <Option title={t('appearance.accent')} description={t('appearance.accentDesc')}>
          <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={t('appearance.accent')}>
            {(Object.keys(accents) as Accent[]).map((accent) => (
              <button key={accent} type="button" role="radio" aria-checked={value.accent === accent} onClick={() => set({ accent })}
                title={t(`appearance.accent_${accent}`)} aria-label={t(`appearance.accent_${accent}`)}
                className={cn('flex h-10 w-10 items-center justify-center rounded-full border-2 transition-[border-color,transform] duration-200 hover:scale-105', value.accent === accent ? 'border-foreground' : 'border-transparent')}
                style={{ background: `hsl(${accents[accent].light})` }}>
                {value.accent === accent && <Check className={cn('h-4 w-4', accent === 'mono' ? 'text-background' : 'text-white')} />}
              </button>
            ))}
          </div>
        </Option>

        <Option title={t('ambient.title')} description={t('ambient.description')}>
          <Segmented value={value.ambient} label={t('ambient.title')} onChange={(ambient: Ambient) => set({ ambient })}
            options={ambients.map((option) => ({ value: option, label: t(`ambient.${option}`) }))} />
        </Option>

        <Option title={t('appearance.density')}>
          <Segmented value={value.density} label={t('appearance.density')} onChange={(density) => set({ density })}
            options={[{ value: 'compact', label: t('appearance.compact') }, { value: 'comfortable', label: t('appearance.comfortable') }]} />
        </Option>

        <p className="text-xs text-muted-foreground">{t('onboarding.designMore')}</p>
      </div>
    </>
  );
}

function Option({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return (
    <div className="space-y-2.5">
      <div>
        <p className="text-sm font-medium">{title}</p>
        {description && <p className="text-xs text-muted-foreground">{description}</p>}
      </div>
      {children}
    </div>
  );
}

function McpStep() {
  const { t } = useI18n();
  const { settings } = useWorkspace();
  if (!settings) return null;
  const snippets = mcpSnippets(settings);
  const clients: { value: McpClient; label: string; hint: string }[] = [
    { value: 'claudeCode', label: 'Claude Code', hint: t('onboarding.mcpClaudeCode') },
    { value: 'desktop', label: 'Claude Desktop', hint: t('onboarding.mcpDesktop') },
    { value: 'generic', label: t('onboarding.mcpOther'), hint: t('onboarding.mcpGeneric') },
  ];

  return (
    <>
      <StepHeader title={t('onboarding.mcpTitle')} description={t('onboarding.mcpText')} id="onboarding-title" />
      <div className="mb-6 grid gap-2 sm:grid-cols-3">
        {(['mcpExample1', 'mcpExample2', 'mcpExample3'] as const).map((key, position) => (
          <p key={key} className="intro-rise rounded-2xl bg-muted/70 px-3.5 py-3 text-[13px] italic leading-snug" style={{ '--d': `${position * 120}ms` } as React.CSSProperties}>„{t(`onboarding.${key}`)}“</p>
        ))}
      </div>

      {!settings.mcp_enabled && <p role="alert" className="mb-4 rounded-2xl bg-warning/10 px-4 py-3 text-[13px]">{t('assistant.disabled')}</p>}

      <Tabs defaultValue="claudeCode">
        <TabsList>{clients.map((client) => <TabsTrigger key={client.value} value={client.value}>{client.label}</TabsTrigger>)}</TabsList>
        {clients.map((client) => (
          <TabsContent key={client.value} value={client.value} className="space-y-2.5">
            <p className="text-[13px] text-muted-foreground">{client.hint}</p>
            <div className="relative">
              <pre className="max-h-52 overflow-auto rounded-xl bg-muted p-3.5 pr-12 font-mono text-xs leading-relaxed">{snippets[client.value]}</pre>
              <CopyButton value={snippets[client.value]} className="absolute right-2 top-2" />
            </div>
          </TabsContent>
        ))}
      </Tabs>

      <div className="mt-5 space-y-1.5 text-xs text-muted-foreground">
        <p>{t('onboarding.mcpToken')}</p>
        <p>{t('onboarding.mcpRemote')}</p>
        <Link href="/ai-assistant" className="inline-flex items-center gap-1 font-medium text-foreground hover:underline">{t('onboarding.mcpPage')}<ArrowRight className="h-3 w-3" /></Link>
      </div>
    </>
  );
}

function failureMessage(failure: unknown) {
  return failure instanceof ApiError || failure instanceof Error ? failure.message : String(failure);
}

function TelegramStep() {
  const { t } = useI18n();
  const [telegram, setTelegram] = useState<TelegramSettings | null>(null);
  const [token, setToken] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => { api.get<TelegramSettings>('/telegram').then(setTelegram).catch(() => undefined); }, []);

  // Waiting for "Start" in Telegram: check every few seconds whether the chat got linked.
  const waiting = Boolean(telegram?.token_set && !telegram.linked);
  useEffect(() => {
    if (!waiting) return;
    const interval = window.setInterval(() => void api.get<TelegramSettings>('/telegram').then(setTelegram).catch(() => undefined), 3000);
    return () => window.clearInterval(interval);
  }, [waiting]);

  async function saveToken(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token.trim()) return;
    setSaving(true);
    try {
      const saved = await api.patch<TelegramSettings>('/telegram', { bot_token: token.trim() });
      setTelegram(saved);
      setToken('');
      toast.success(t('settings.tokenSaved', { bot: saved.bot_username ?? '' }));
    } catch (failure) {
      toast.error(failureMessage(failure));
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <StepHeader title={t('onboarding.telegramTitle')} description={t('onboarding.telegramText')} id="onboarding-title" />
      {!telegram ? (
        <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
      ) : (
        <ol className="space-y-5">
          <TgStep number={1} done={telegram.token_set} title={t('onboarding.tgCreate')}>
            <ol className="list-decimal space-y-1 pl-4 text-[13px] text-muted-foreground marker:text-foreground/50">
              <li>{t('onboarding.tgCreate1')}</li>
              <li>{t('onboarding.tgCreate2')}</li>
              <li>{t('onboarding.tgCreate3')}</li>
            </ol>
            <Button variant="outline" size="sm" asChild><a href="https://t.me/BotFather" target="_blank" rel="noreferrer noopener"><ExternalLink />{t('settings.openBotFather')}</a></Button>
          </TgStep>

          <TgStep number={2} done={telegram.token_set} title={t('onboarding.tgToken')}>
            {telegram.token_set ? (
              <Badge variant="secondary" className="gap-1.5 py-1"><Bot className="h-3.5 w-3.5" />@{telegram.bot_username}</Badge>
            ) : (
              <form onSubmit={saveToken} className="flex flex-col gap-2 sm:flex-row">
                <Input type="password" autoComplete="off" value={token} onChange={(event) => setToken(event.target.value)} placeholder="123456789:AA…"
                  aria-label={t('settings.botToken')} className="font-mono sm:max-w-sm" />
                <Button type="submit" disabled={!token.trim() || saving}>{saving && <Loader2 className="animate-spin" />}{t('common.save')}</Button>
              </form>
            )}
          </TgStep>

          <TgStep number={3} done={telegram.linked} disabled={!telegram.token_set} title={t('onboarding.tgLink')} last>
            {telegram.linked ? (
              <p className="flex items-center gap-2 text-[13px] font-medium"><CheckCircle2 className="h-4 w-4 text-success" />{t('settings.linkedTo', { name: telegram.chat_name ?? 'Telegram' })}</p>
            ) : (
              <div className="space-y-2.5">
                <p className="text-[13px] text-muted-foreground">{t('settings.tgStep2Desc')}</p>
                <div className="flex flex-wrap items-center gap-3">
                  {telegram.link_url && <Button size="sm" asChild><a href={telegram.link_url} target="_blank" rel="noreferrer noopener"><Send />{t('settings.openTelegram')}</a></Button>}
                  <span className="inline-flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="h-3.5 w-3.5 animate-spin" />{t('settings.waiting')}</span>
                </div>
                <div className="flex items-center gap-2">
                  <code className="truncate rounded-full bg-muted px-3 py-1.5 font-mono text-xs">/start {telegram.link_code}</code>
                  <CopyButton value={`/start ${telegram.link_code}`} />
                </div>
              </div>
            )}
          </TgStep>
        </ol>
      )}
      <p className="mt-6 text-xs text-muted-foreground">{t('onboarding.tgLater')}</p>
    </>
  );
}

function TgStep({ number, title, done, disabled, last, children }: { number: number; title: string; done: boolean; disabled?: boolean; last?: boolean; children: ReactNode }) {
  return (
    <li className={cn('relative flex gap-4', disabled && 'opacity-50')}>
      {!last && <span className="absolute left-[13px] top-8 h-[calc(100%-0.75rem)] w-px bg-border" aria-hidden="true" />}
      <span className={cn('relative flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold transition-colors duration-300', done ? 'bg-success text-white' : 'ds-glass')}>
        {done ? <Check className="h-4 w-4 duration-300 animate-in zoom-in-50" /> : number}
      </span>
      <div className="min-w-0 flex-1 space-y-2.5 pt-0.5">
        <p className="text-sm font-medium">{title}</p>
        {!disabled && children}
      </div>
    </li>
  );
}

function DoneStep({ onNavigate }: { onNavigate: () => void }) {
  const { t } = useI18n();
  const links: { href: string; icon: typeof Sun; title: string; text: string }[] = [
    { href: '/today', icon: Sun, title: t('nav.today'), text: t('onboarding.doneToday') },
    { href: '/explorer', icon: FolderTree, title: t('nav.explorer'), text: t('onboarding.doneExplorer') },
    { href: '/focus', icon: Pin, title: t('nav.focus'), text: t('onboarding.doneFocus') },
  ];
  return (
    <div className="flex flex-col items-center py-4 text-center sm:py-6">
      <span className="intro-pop mb-5 flex h-14 w-14 items-center justify-center rounded-full bg-success text-white shadow-lg"><Check className="h-7 w-7" /></span>
      <h2 id="onboarding-title" className="text-[28px] font-semibold tracking-[-0.02em]">{t('onboarding.doneTitle')}</h2>
      <p className="mt-2 max-w-md text-sm leading-relaxed text-muted-foreground">{t('onboarding.doneText')}</p>
      <div className="mt-8 grid w-full max-w-xl gap-2 sm:grid-cols-3">
        {links.map(({ href, icon: Icon, title, text }, position) => (
          <Link key={href} href={href} onClick={onNavigate} className="intro-rise rounded-2xl bg-muted/70 p-4 text-left transition-colors duration-300 hover:bg-accent"
            style={{ '--d': `${200 + position * 120}ms` } as React.CSSProperties}>
            <Icon className="mb-2 h-4 w-4 text-muted-foreground" strokeWidth={1.6} />
            <p className="text-[13px] font-medium">{title}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">{text}</p>
          </Link>
        ))}
      </div>
      <p className="mt-6 text-xs text-muted-foreground">{t('onboarding.doneRestart')}</p>
    </div>
  );
}
