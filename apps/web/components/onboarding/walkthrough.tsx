'use client';

import Link from 'next/link';
import { type CSSProperties, type FormEvent, type ReactNode, useCallback, useEffect, useRef, useState } from 'react';
import { useTheme } from 'next-themes';
import {
  ArrowLeft, ArrowRight, Bot, Check, CheckCircle2, ExternalLink, FolderTree, Loader2, Monitor, Moon, Pin, Send, Sun,
} from 'lucide-react';
import { toast } from 'sonner';

import { DesktopTitleBar } from '@/components/desktop-window';
import { AsciiField } from '@/components/onboarding/ascii-field';
import { FeatureReel } from '@/components/onboarding/feature-reel';
import { Roadmap } from '@/components/onboarding/roadmap';
import { useI18n } from '@/components/i18n-provider';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Segmented } from '@/components/ui/segmented';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { CopyButton } from '@/components/workspace-ui';
import { useWorkspace } from '@/components/workspace-provider';
import { api, ApiError } from '@/lib/api';
import { type Accent, type Ambient, type Appearance, accents, ambients, defaultAppearance, loadAppearance, saveAppearance } from '@/lib/appearance';
import { languages } from '@/lib/languages';
import { type OnboardingStep, onboardingSteps } from '@/lib/onboarding';
import { type McpClient, mcpSnippets } from '@/lib/mcp';
import type { Language, TelegramSettings, ThemePreference } from '@/lib/types';
import { cn } from '@/lib/utils';

const steps = onboardingSteps;
type Step = OnboardingStep;
/** The account already exists when the walkthrough runs: it starts at the second station. */
const FIRST = 1;

/** Delay for one animated element. */
const d = (ms: number) => ({ '--d': `${ms}ms` }) as CSSProperties;

/**
 * First-run walkthrough, full screen: welcome, a short animated tour, design, MCP and the Telegram bot.
 * An ASCII contour map moves in the background and a curved roadmap at the bottom marks the stations.
 * Finishing or skipping stores `onboarding_done`, so it shows up once per installation.
 */
export function Walkthrough({ onClose }: { onClose: () => void }) {
  const { t } = useI18n();
  const { saveSettings } = useWorkspace();
  const [step, setStep] = useState<Step>('welcome');
  const [direction, setDirection] = useState<'next' | 'prev'>('next');
  const [leaving, setLeaving] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const index = steps.indexOf(step);

  const finish = useCallback(() => {
    void saveSettings({ onboarding_done: true });
    setLeaving(true);
    window.setTimeout(onClose, 320);
  }, [onClose, saveSettings]);

  const go = useCallback((target: number) => {
    const next = Math.max(FIRST, Math.min(steps.length - 1, target));
    setDirection(next >= index ? 'next' : 'prev');
    setStep(steps[next]);
  }, [index]);

  const next = useCallback(() => (index === steps.length - 1 ? finish() : go(index + 1)), [finish, go, index]);

  useEffect(() => { root.current?.focus(); }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { finish(); return; }
      // Arrow keys move along the roadmap unless a field or a control that uses them has the focus.
      const target = event.target as HTMLElement | null;
      if (target?.closest('input, textarea, select, [contenteditable="true"], [role="tablist"], [role="radiogroup"], [role="listbox"], [role="menu"]')) return;
      if (event.key === 'ArrowRight') next();
      if (event.key === 'ArrowLeft') go(index - 1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [finish, go, index, next]);

  return (
    <div ref={root} tabIndex={-1}
      className={cn('fixed inset-0 z-[70] flex flex-col overflow-hidden bg-background outline-none transition-[opacity,filter] duration-300 ease-ds animate-in fade-in',
        leaving && 'opacity-0 blur-sm')}
      role="dialog" aria-modal="true" aria-labelledby="onboarding-title">
      <AsciiField step={index} steps={steps.length} />

      <DesktopTitleBar className="relative z-10" />
      <header className="relative flex min-h-9 items-center justify-end gap-4 px-5 pt-4 sm:px-8 sm:pt-6">
        {step !== 'done' && <Button variant="ghost" size="sm" className="text-muted-foreground" onClick={finish}>{t('onboarding.skip')}</Button>}
      </header>

      <main className="relative min-h-0 flex-1 overflow-y-auto overscroll-contain">
        <div key={step} className={cn('mx-auto flex min-h-full w-full flex-col justify-center px-5 py-10 sm:px-8',
          step === 'tour' ? 'max-w-3xl' : step === 'design' ? 'max-w-4xl' : 'max-w-2xl',
          direction === 'next' ? 'onboarding-in-next' : 'onboarding-in-prev')}>
          {step === 'welcome' && <WelcomeStep />}
          {step === 'tour' && <TourStep />}
          {step === 'design' && <DesignStep />}
          {step === 'mcp' && <McpStep />}
          {step === 'telegram' && <TelegramStep />}
          {step === 'done' && <DoneStep onNavigate={finish} />}
        </div>
      </main>

      <footer className="relative shrink-0 pb-2 sm:pb-4">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-2 px-5 sm:px-8">
          <Button variant="ghost" onClick={() => go(index - 1)} disabled={index <= FIRST} className={cn(index <= FIRST && 'invisible')}><ArrowLeft />{t('onboarding.back')}</Button>
          <div className="flex items-center gap-2">
            {(step === 'mcp' || step === 'telegram') && <Button variant="ghost" className="text-muted-foreground" onClick={next}>{t('onboarding.later')}</Button>}
            <Button size="lg" onClick={next}>
              {step === 'welcome' ? t('onboarding.start') : step === 'done' ? t('onboarding.finish') : t('onboarding.next')}
              {step !== 'done' && <ArrowRight />}
            </Button>
          </div>
        </div>
        <Roadmap labels={steps.map((entry) => t(`onboarding.step_${entry}`))} current={index} onSelect={go} label={t('onboarding.progress')} />
      </footer>
    </div>
  );
}

function StepHeader({ title, lead }: { title: string; lead: string }) {
  return (
    <div className="mb-8 space-y-2">
      <h2 id="onboarding-title" className="intro-rise text-[32px] font-semibold leading-[1.1] tracking-[-0.03em] sm:text-[40px]">{title}</h2>
      <p className="intro-rise text-[15px] text-muted-foreground" style={d(120)}>{lead}</p>
    </div>
  );
}

function WelcomeStep() {
  const { t, language, setLanguage } = useI18n();
  const { saveSettings } = useWorkspace();
  return (
    <div className="flex flex-col items-center text-center">
      <h2 id="onboarding-title" className="intro-rise text-[40px] font-semibold leading-[1.05] tracking-[-0.035em] sm:text-[56px]">{t('onboarding.welcomeTitle')}</h2>
      <p className="intro-rise mt-4 max-w-md text-[15px] leading-relaxed text-muted-foreground sm:text-base" style={d(260)}>{t('onboarding.welcomeLead')}</p>
      <div className="intro-rise mt-10" style={d(420)}>
        <Select value={language} onValueChange={(value) => { setLanguage(value as Language); void saveSettings({ language: value as Language }); }}>
          <SelectTrigger className="w-52" aria-label={t('settings.language')}><SelectValue /></SelectTrigger>
          <SelectContent className="z-[80]">
            {languages.map((entry) => <SelectItem key={entry.code} value={entry.code} lang={entry.code}>{entry.flag} {entry.label}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}

function TourStep() {
  const { t } = useI18n();
  return (
    <>
      <StepHeader title={t('onboarding.tourTitle')} lead={t('onboarding.tourLead')} />
      <div className="intro-rise" style={d(220)}><FeatureReel /></div>
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
      <StepHeader title={t('onboarding.designTitle')} lead={t('onboarding.designLead')} />
      <div className="grid items-center gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="space-y-6">
          <Option title={t('appearance.theme')} delay={180}>
            <div className="grid max-w-sm grid-cols-3 gap-2" role="radiogroup" aria-label={t('appearance.theme')}>
              {themes.map(({ value: option, label, icon: Icon }) => (
                <button key={option} type="button" role="radio" aria-checked={theme === option}
                  onClick={() => { setTheme(option); void saveSettings({ theme: option }); }}
                  className={cn('flex flex-col items-center gap-2 rounded-2xl p-3.5 text-[13px] transition-[background-color,box-shadow] duration-500 ease-ds',
                    theme === option ? 'bg-seg font-medium shadow-sm ring-1 ring-foreground/20' : 'bg-muted hover:bg-accent')}>
                  <Icon className="h-5 w-5" strokeWidth={1.6} />{label}
                </button>
              ))}
            </div>
          </Option>

          <Option title={t('appearance.accent')} delay={260}>
            <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={t('appearance.accent')}>
              {(Object.keys(accents) as Accent[]).map((accent) => (
                <button key={accent} type="button" role="radio" aria-checked={value.accent === accent} onClick={() => set({ accent })}
                  title={t(`appearance.accent_${accent}`)} aria-label={t(`appearance.accent_${accent}`)}
                  className={cn('flex h-9 w-9 items-center justify-center rounded-full border-2 transition-[border-color,transform] duration-200 hover:scale-105', value.accent === accent ? 'border-foreground' : 'border-transparent')}
                  style={{ background: `hsl(${accents[accent].light})` }}>
                  {value.accent === accent && <Check className={cn('h-4 w-4', accent === 'mono' ? 'text-background' : 'text-white')} />}
                </button>
              ))}
            </div>
          </Option>

          <Option title={t('ambient.title')} delay={340}>
            <Segmented value={value.ambient} label={t('ambient.title')} onChange={(ambient: Ambient) => set({ ambient })}
              options={ambients.map((option) => ({ value: option, label: t(`ambient.${option}`) }))} />
          </Option>

          <Option title={t('appearance.density')} delay={420}>
            <Segmented value={value.density} label={t('appearance.density')} onChange={(density) => set({ density })}
              options={[{ value: 'compact', label: t('appearance.compact') }, { value: 'comfortable', label: t('appearance.comfortable') }]} />
          </Option>
        </div>
        <div className="intro-rise hidden lg:block" style={d(300)}><DesignPreview density={value.density} /></div>
      </div>
    </>
  );
}

/** A miniature workspace that shows the chosen theme, accent and density right away. */
function DesignPreview({ density }: { density: Appearance['density'] }) {
  const rows = [0.72, 0.5, 0.86, 0.6];
  return (
    <div className="ds-panel overflow-hidden p-0" aria-hidden="true">
      <div className="flex items-center gap-1.5 border-b px-4 py-3">
        {[0, 1, 2].map((dot) => <span key={dot} className="h-2 w-2 rounded-full bg-foreground/15" />)}
      </div>
      <div className="flex">
        <div className="w-24 space-y-2 border-r p-3">
          {[0.9, 0.6, 0.75, 0.5].map((width, position) => (
            <span key={position} className={cn('block h-2 rounded-full', position === 0 ? 'bg-brand' : 'bg-foreground/10')} style={{ width: `${width * 100}%` }} />
          ))}
        </div>
        <div className={cn('flex-1 p-4 transition-[gap] duration-500', density === 'compact' ? 'space-y-1.5' : 'space-y-3')}>
          <span className="mb-2 block h-3 w-2/5 rounded-full bg-foreground/80" />
          {rows.map((width, position) => (
            <div key={position} className={cn('flex items-center gap-2.5 rounded-xl bg-muted px-3 transition-[padding] duration-500', density === 'compact' ? 'py-1.5' : 'py-2.5')}>
              <span className={cn('h-3 w-3 shrink-0 rounded-full border-[1.5px]', position === 1 ? 'border-brand bg-brand' : 'border-foreground/25')} />
              <span className="h-2 rounded-full bg-foreground/15" style={{ width: `${width * 100}%` }} />
            </div>
          ))}
          <span className="mt-2 inline-flex h-6 w-24 rounded-full bg-brand" />
        </div>
      </div>
    </div>
  );
}

function Option({ title, delay, children }: { title: string; delay: number; children: ReactNode }) {
  return (
    <div className="intro-rise space-y-2.5" style={d(delay)}>
      <p className="text-[13px] font-medium">{title}</p>
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
      <StepHeader title={t('onboarding.mcpTitle')} lead={t('onboarding.mcpLead')} />
      <div className="mb-8 flex flex-wrap gap-2">
        {(['mcpExample1', 'mcpExample2', 'mcpExample3'] as const).map((key, position) => (
          <span key={key} className="intro-rise ds-glass rounded-full px-3.5 py-1.5 text-[13px]" style={d(200 + position * 110)}>
            <span className="mr-1.5 font-mono text-brand">&gt;</span>{t(`onboarding.${key}`)}
          </span>
        ))}
      </div>

      {!settings.mcp_enabled && <p role="alert" className="mb-4 rounded-2xl bg-warning/10 px-4 py-3 text-[13px]">{t('assistant.disabled')}</p>}

      <Tabs defaultValue="claudeCode" className="intro-rise" style={d(480)}>
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

      <p className="mt-5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
        <span>{t('onboarding.mcpToken')}</span>
        <Link href="/ai-assistant" className="inline-flex items-center gap-1 font-medium text-foreground hover:underline">{t('onboarding.mcpPage')}<ArrowRight className="h-3 w-3" /></Link>
      </p>
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
      <StepHeader title={t('onboarding.telegramTitle')} lead={t('onboarding.telegramLead')} />
      {!telegram ? (
        <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
      ) : (
        <ol className="space-y-6">
          <TgStep number={1} done={telegram.token_set} title={t('onboarding.tgCreate')} delay={200}>
            <ol className="list-decimal space-y-1 pl-4 text-[13px] text-muted-foreground marker:text-foreground/50">
              <li>{t('onboarding.tgCreate1')}</li>
              <li>{t('onboarding.tgCreate2')}</li>
              <li>{t('onboarding.tgCreate3')}</li>
            </ol>
            <Button variant="outline" size="sm" asChild><a href="https://t.me/BotFather" target="_blank" rel="noreferrer noopener"><ExternalLink />{t('settings.openBotFather')}</a></Button>
          </TgStep>

          <TgStep number={2} done={telegram.token_set} title={t('onboarding.tgToken')} delay={320}>
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

          <TgStep number={3} done={telegram.linked} disabled={!telegram.token_set} title={t('onboarding.tgLink')} delay={440} last>
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
    </>
  );
}

function TgStep({ number, title, done, disabled, last, delay, children }: { number: number; title: string; done: boolean; disabled?: boolean; last?: boolean; delay: number; children: ReactNode }) {
  return (
    <li className={cn('intro-rise relative flex gap-4', disabled && 'opacity-50')} style={d(delay)}>
      {!last && <span className="absolute left-[13px] top-8 h-[calc(100%-0.5rem)] w-px border-l border-dashed border-foreground/20" aria-hidden="true" />}
      <span className={cn('relative flex h-7 w-7 shrink-0 items-center justify-center rounded-full font-mono text-xs transition-colors duration-300', done ? 'bg-brand text-background' : 'ds-glass')}>
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
    <div className="flex flex-col items-center text-center">
      <pre className="intro-pop mb-6 font-mono text-[13px] leading-[1.2] text-brand" aria-hidden="true">{treasure}</pre>
      <h2 id="onboarding-title" className="intro-rise text-[40px] font-semibold leading-[1.05] tracking-[-0.035em] sm:text-[52px]" style={d(120)}>{t('onboarding.doneTitle')}</h2>
      <p className="intro-rise mt-3 max-w-md text-[15px] text-muted-foreground" style={d(240)}>{t('onboarding.doneLead')}</p>
      <div className="mt-10 grid w-full max-w-xl gap-2 sm:grid-cols-3">
        {links.map(({ href, icon: Icon, title, text }, position) => (
          <Link key={href} href={href} onClick={onNavigate} className="intro-rise group rounded-2xl bg-muted/70 p-4 text-left transition-colors duration-300 hover:bg-accent"
            style={d(360 + position * 110)}>
            <Icon className="mb-2 h-4 w-4 text-muted-foreground transition-colors group-hover:text-brand" strokeWidth={1.6} />
            <p className="text-[13px] font-medium">{title}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">{text}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}

/** The end of the trail: x marks the spot. */
const treasure = [
  ' .  *  . ',
  '*  \\ /  *',
  '    X    ',
  '*  / \\  *',
  " '  *  ' ",
].join('\n');
