'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { type FormEvent, type ReactNode, Suspense, useEffect, useState } from 'react';
import { AtSign, CheckCircle2, Globe, Loader2, Lock, Mail, Monitor, Moon, Palette, PanelLeft, PlayCircle, RefreshCw, Send, ServerCog, Settings2, Sun, UserRound, Users, XCircle } from 'lucide-react';
import { useTheme } from 'next-themes';
import { toast } from 'sonner';

import { AccountSettings, UserManagement } from '@/components/account-settings';
import { AppearanceSettings } from '@/components/appearance-settings';
import { useAccount } from '@/components/auth-gate';
import { SidebarSettings } from '@/components/sidebar-settings';
import { useI18n } from '@/components/i18n-provider';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { TelegramSettings } from '@/components/telegram-settings';
import { Field, PageHeader, PageSkeleton, TokenField, UrlRow } from '@/components/workspace-ui';
import { useWorkspace } from '@/components/workspace-provider';
import { api, ApiError, peek } from '@/lib/api';
import { languages } from '@/lib/languages';
import { openOnboarding } from '@/lib/onboarding';
import type { AppSettings, DomainCheck, Language, SmtpSecurity, TelegramSettings as TelegramSettingsType, ThemePreference } from '@/lib/types';
import { cn } from '@/lib/utils';

const tabs = ['general', 'account', 'users', 'appearance', 'sidebar', 'domain', 'mcp', 'telegram', 'email', 'security'] as const;

export default function SettingsPage() {
  return <Suspense fallback={<PageSkeleton />}><SettingsView /></Suspense>;
}

function SettingsView() {
  const { t } = useI18n();
  const { settings, loading } = useWorkspace();
  const { mode, user } = useAccount();
  const router = useRouter();
  const requested = useSearchParams().get('tab');
  // Account tabs exist only with accounts; the user list only for admins.
  const visible = (value: (typeof tabs)[number]) => (value === 'account' ? mode === 'multi' : value === 'users' ? Boolean(user?.is_admin) : true);
  const tab = tabs.find((value) => value === requested && visible(value)) ?? 'general';

  if (loading || !settings) return <PageSkeleton />;

  return (
    <div>
      <PageHeader title={t('settings.title')} description={t('settings.description')} />
      <Tabs value={tab} onValueChange={(value) => router.replace(value === 'general' ? '/settings' : `/settings?tab=${value}`, { scroll: false })}>
        <TabsList className="h-auto flex-wrap">
          <TabsTrigger value="general"><Settings2 />{t('settings.general')}</TabsTrigger>
          {visible('account') && <TabsTrigger value="account"><UserRound />{t('account.title')}</TabsTrigger>}
          {visible('users') && <TabsTrigger value="users"><Users />{t('account.usersTitle')}</TabsTrigger>}
          <TabsTrigger value="appearance"><Palette />{t('appearance.title')}</TabsTrigger>
          <TabsTrigger value="sidebar"><PanelLeft />{t('sidebar.title')}</TabsTrigger>
          <TabsTrigger value="domain"><Globe />{t('settings.domain')}</TabsTrigger>
          <TabsTrigger value="mcp"><ServerCog />{t('settings.mcp')}</TabsTrigger>
          <TabsTrigger value="telegram"><Send />{t('settings.telegram')}</TabsTrigger>
          <TabsTrigger value="email"><Mail />{t('settings.email')}</TabsTrigger>
          <TabsTrigger value="security"><Lock />{t('settings.security')}</TabsTrigger>
        </TabsList>
        <TabsContent value="general"><GeneralSettings /></TabsContent>
        {visible('account') && <TabsContent value="account"><AccountSettings /></TabsContent>}
        {visible('users') && <TabsContent value="users"><UserManagement /></TabsContent>}
        <TabsContent value="appearance"><AppearanceSettings /></TabsContent>
        <TabsContent value="sidebar"><SidebarSettings /></TabsContent>
        <TabsContent value="domain"><DomainSettings settings={settings} /></TabsContent>
        <TabsContent value="mcp"><McpSettings settings={settings} /></TabsContent>
        <TabsContent value="telegram"><TelegramSettings /></TabsContent>
        <TabsContent value="email"><EmailSettings settings={settings} /></TabsContent>
        <TabsContent value="security"><SecuritySettings /></TabsContent>
      </Tabs>
    </div>
  );
}

function SettingRow({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-3 py-4 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between">
      <div className="space-y-0.5">
        <p className="text-sm font-medium">{title}</p>
        {description && <p className="text-sm text-muted-foreground">{description}</p>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

function GeneralSettings() {
  const { t, language, setLanguage } = useI18n();
  const { theme, setTheme } = useTheme();
  const { saveSettings } = useWorkspace();
  const themes: { value: ThemePreference; label: string; icon: typeof Sun }[] = [
    { value: 'light', label: t('shell.light'), icon: Sun },
    { value: 'dark', label: t('shell.dark'), icon: Moon },
    { value: 'system', label: t('shell.system'), icon: Monitor },
  ];

  return (
    <Card>
      <CardContent className="divide-y p-5">
        <div className="space-y-3 pb-5">
          <div className="space-y-0.5">
            <p className="text-sm font-medium">{t('settings.appearance')}</p>
            <p className="text-sm text-muted-foreground">{t('settings.appearanceDesc')}</p>
          </div>
          <div className="grid max-w-md grid-cols-3 gap-3" role="radiogroup" aria-label={t('settings.appearance')}>
            {themes.map(({ value, label, icon: Icon }) => (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={theme === value}
                onClick={() => { setTheme(value); void saveSettings({ theme: value }); }}
                className={cn('flex flex-col items-center gap-2 rounded-xl p-4 text-[13px] transition-[background-color,box-shadow] duration-500 ease-ds', theme === value ? 'bg-seg font-medium shadow-sm' : 'bg-muted hover:bg-accent')}
              >
                <Icon className="h-[18px] w-[18px]" strokeWidth={1.6} />
                {label}
              </button>
            ))}
          </div>
        </div>
        <div className="pt-5">
          <SettingRow title={t('settings.language')} description={t('settings.languageDesc')}>
            <Select value={language} onValueChange={(value) => { setLanguage(value as Language); void saveSettings({ language: value as Language }); }}>
              <SelectTrigger className="w-48" aria-label={t('settings.language')}><SelectValue /></SelectTrigger>
              <SelectContent>
                {languages.map((entry) => <SelectItem key={entry.code} value={entry.code} lang={entry.code}>{entry.flag} {entry.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </SettingRow>
        </div>
        <div className="pt-5">
          <SettingRow title={t('onboarding.restartTitle')} description={t('onboarding.restartDesc')}>
            <Button variant="outline" onClick={openOnboarding}><PlayCircle />{t('onboarding.restart')}</Button>
          </SettingRow>
        </div>
      </CardContent>
    </Card>
  );
}

function DomainSettings({ settings }: { settings: AppSettings }) {
  const { t } = useI18n();
  const { saveSettings } = useWorkspace();
  const [form, setForm] = useState({ custom_domain: settings.custom_domain ?? '', mcp_domain: settings.mcp_domain ?? '', use_https: settings.use_https });
  const [saving, setSaving] = useState(false);
  const [checks, setChecks] = useState<DomainCheck[] | null>(null);
  const [checking, setChecking] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    const saved = await saveSettings({ custom_domain: form.custom_domain.trim() || null, mcp_domain: form.mcp_domain.trim() || null, use_https: form.use_https });
    setSaving(false);
    if (saved) {
      setForm({ custom_domain: saved.custom_domain ?? '', mcp_domain: saved.mcp_domain ?? '', use_https: saved.use_https });
      toast.success(t('common.saved'));
    }
  }

  async function runCheck() {
    setChecking(true);
    try {
      setChecks((await api.get<{ checks: DomainCheck[] }>('/settings/domain-check')).checks);
    } catch (failure) {
      toast.error(failure instanceof ApiError ? failure.message : String(failure));
    } finally {
      setChecking(false);
    }
  }

  return (
    <div className="space-y-6">
      <Card>
        <form onSubmit={submit}>
          <CardHeader>
            <CardTitle className="text-base">{t('settings.domainTitle')}</CardTitle>
            <CardDescription>{t('settings.domainDesc')}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <Field label={t('settings.customDomain')} htmlFor="custom-domain" hint={t('settings.customDomainHint')}>
                <Input id="custom-domain" value={form.custom_domain} onChange={(event) => setForm({ ...form, custom_domain: event.target.value })} placeholder="plm.example.com" />
              </Field>
              <Field label={t('settings.mcpDomain')} htmlFor="mcp-domain" hint={t('settings.mcpDomainHint')}>
                <Input id="mcp-domain" value={form.mcp_domain} onChange={(event) => setForm({ ...form, mcp_domain: event.target.value })} placeholder="mcp.example.com" />
              </Field>
            </div>
            <SettingRow title={t('settings.https')} description={t('settings.httpsDesc')}>
              <Switch checked={form.use_https} onCheckedChange={(checked) => setForm({ ...form, use_https: checked })} aria-label={t('settings.https')} />
            </SettingRow>
            <Separator />
            <div className="grid gap-3 text-sm md:grid-cols-2">
              <UrlRow label={t('settings.appUrl')} value={settings.app_url ?? 'http://localhost:3000'} />
              <UrlRow label={t('assistant.endpoint')} value={settings.mcp_url} />
            </div>
          </CardContent>
          <CardFooter className="justify-between gap-2 border-t px-5 py-3">
            <Button type="button" variant="outline" onClick={() => void runCheck()} disabled={checking || (!settings.custom_domain && !settings.mcp_domain && !settings.email_from_address)}>
              {checking ? <Loader2 className="animate-spin" /> : <Globe />}{checking ? t('settings.checking') : t('settings.check')}
            </Button>
            <Button type="submit" disabled={saving}>{saving ? t('common.saving') : t('common.save')}</Button>
          </CardFooter>
        </form>
      </Card>

      {checks && (
        <Card>
          <CardContent className="space-y-2 p-5">
            {checks.map((check) => (
              <div key={check.domain} className="flex items-start gap-3 text-sm">
                {check.resolves ? <CheckCircle2 className="mt-0.5 h-4 w-4 text-success" /> : <XCircle className="mt-0.5 h-4 w-4 text-destructive" />}
                <div>
                  <p className="font-mono">{check.domain}</p>
                  <p className="text-muted-foreground">
                    {check.resolves ? `${t('settings.resolves', { addresses: check.addresses.join(', ') })} – ${check.points_to_local ? t('settings.pointsLocal') : t('settings.notLocal')}` : t('settings.notResolves')}
                  </p>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function McpSettings({ settings }: { settings: AppSettings }) {
  const { t } = useI18n();
  const { saveSettings, setSettings } = useWorkspace();
  const [rotating, setRotating] = useState(false);

  async function rotate() {
    setRotating(true);
    try {
      setSettings(await api.post<AppSettings>('/settings/mcp-token'));
      toast.success(t('settings.rotated'));
    } catch (failure) {
      toast.error(failure instanceof ApiError ? failure.message : String(failure));
    } finally {
      setRotating(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{t('settings.mcpTitle')}</CardTitle>
        <CardDescription>{t('settings.mcpDesc')}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="divide-y">
          <SettingRow title={t('settings.mcpEnabled')} description={t('settings.mcpEnabledDesc')}>
            <Switch checked={settings.mcp_enabled} onCheckedChange={(checked) => void saveSettings({ mcp_enabled: checked })} aria-label={t('settings.mcpEnabled')} />
          </SettingRow>
          <SettingRow title={t('settings.requireToken')} description={t('settings.requireTokenDesc')}>
            <Switch checked={settings.mcp_require_token} onCheckedChange={(checked) => void saveSettings({ mcp_require_token: checked })} aria-label={t('settings.requireToken')} />
          </SettingRow>
        </div>
        <Separator />
        <div className="grid gap-4 md:grid-cols-2">
          <UrlRow label={t('assistant.endpoint')} value={settings.mcp_url} />
          <UrlRow label={t('assistant.localEndpoint')} value={settings.mcp_local_url} />
        </div>
        <div className="space-y-1.5">
          <p className="text-xs font-medium text-muted-foreground">{t('assistant.token')}</p>
          <div className="flex items-center gap-2">
            <TokenField value={settings.mcp_token ?? ''} />
            <Button variant="outline" size="sm" onClick={() => void rotate()} disabled={rotating}><RefreshCw className={cn(rotating && 'animate-spin')} />{t('settings.rotate')}</Button>
          </div>
          <p className="text-xs text-muted-foreground">{t('assistant.tokenHint')}</p>
        </div>
      </CardContent>
    </Card>
  );
}

function EmailSettings({ settings }: { settings: AppSettings }) {
  const { t } = useI18n();
  const { saveSettings } = useWorkspace();
  const initial = () => ({
    smtp_host: settings.smtp_host ?? '',
    smtp_port: String(settings.smtp_port),
    smtp_security: settings.smtp_security,
    smtp_username: settings.smtp_username ?? '',
    smtp_password: '',
    email_from_name: settings.email_from_name ?? '',
    email_from_address: settings.email_from_address ?? '',
  });
  const [form, setForm] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [testTo, setTestTo] = useState('');
  const [sending, setSending] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    const saved = await saveSettings({
      smtp_host: form.smtp_host.trim() || null,
      smtp_port: Number(form.smtp_port) || 587,
      smtp_security: form.smtp_security,
      smtp_username: form.smtp_username.trim() || null,
      email_from_name: form.email_from_name.trim() || null,
      email_from_address: form.email_from_address.trim() || null,
      ...(form.smtp_password ? { smtp_password: form.smtp_password } : {}),
    });
    setSaving(false);
    if (saved) {
      setForm((current) => ({ ...current, smtp_password: '' }));
      toast.success(t('common.saved'));
    }
  }

  async function sendTest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSending(true);
    try {
      await api.post('/settings/test-email', { to: testTo.trim() });
      toast.success(t('settings.testSent'));
    } catch (failure) {
      toast.error(failure instanceof ApiError ? failure.message : String(failure));
    } finally {
      setSending(false);
    }
  }

  const domain = settings.custom_domain ?? 'example.com';

  return (
    <div className="space-y-6">
      <Card>
        <form onSubmit={submit}>
          <CardHeader>
            <CardTitle className="text-base">{t('settings.emailTitle')}</CardTitle>
            <CardDescription>{t('settings.emailDesc')}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <Field label={t('settings.fromName')} htmlFor="from-name">
                <Input id="from-name" value={form.email_from_name} onChange={(event) => setForm({ ...form, email_from_name: event.target.value })} placeholder="Anamnesies" />
              </Field>
              <Field label={t('settings.fromAddress')} htmlFor="from-address" hint={t('settings.fromAddressHint', { domain })}>
                <Input id="from-address" type="email" value={form.email_from_address} onChange={(event) => setForm({ ...form, email_from_address: event.target.value })} placeholder={`plm@${domain}`} />
              </Field>
            </div>
            <Separator />
            <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_120px_160px]">
              <Field label={t('settings.smtpHost')} htmlFor="smtp-host">
                <Input id="smtp-host" value={form.smtp_host} onChange={(event) => setForm({ ...form, smtp_host: event.target.value })} placeholder={`smtp.${domain}`} />
              </Field>
              <Field label={t('settings.smtpPort')} htmlFor="smtp-port">
                <Input id="smtp-port" type="number" min={1} max={65535} value={form.smtp_port} onChange={(event) => setForm({ ...form, smtp_port: event.target.value })} />
              </Field>
              <Field label={t('settings.smtpSecurity')}>
                <Select value={form.smtp_security} onValueChange={(value) => setForm({ ...form, smtp_security: value as SmtpSecurity, smtp_port: value === 'ssl' ? '465' : value === 'starttls' ? '587' : form.smtp_port })}>
                  <SelectTrigger aria-label={t('settings.smtpSecurity')}><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="starttls">STARTTLS</SelectItem>
                    <SelectItem value="ssl">SSL/TLS</SelectItem>
                    <SelectItem value="none">{t('settings.securityNone')}</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <Field label={t('settings.username')} htmlFor="smtp-username">
                <Input id="smtp-username" autoComplete="off" value={form.smtp_username} onChange={(event) => setForm({ ...form, smtp_username: event.target.value })} />
              </Field>
              <Field label={t('settings.password')} htmlFor="smtp-password" hint={settings.smtp_password_set ? t('settings.passwordSet') : undefined}>
                <Input id="smtp-password" type="password" autoComplete="new-password" value={form.smtp_password} onChange={(event) => setForm({ ...form, smtp_password: event.target.value })} placeholder={settings.smtp_password_set ? '••••••••' : ''} />
              </Field>
            </div>
          </CardContent>
          <CardFooter className="justify-end border-t px-5 py-3">
            <Button type="submit" disabled={saving}>{saving ? t('common.saving') : t('common.save')}</Button>
          </CardFooter>
        </form>
      </Card>

      <Card>
        <form onSubmit={sendTest}>
          <CardHeader>
            <CardTitle className="text-base">{t('settings.testEmail')}</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2 sm:flex-row">
            <div className="relative flex-1">
              <AtSign className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input type="email" required value={testTo} onChange={(event) => setTestTo(event.target.value)} placeholder={t('settings.testTo')} aria-label={t('settings.testTo')} className="pl-8" />
            </div>
            <Button type="submit" variant="secondary" disabled={sending || !settings.smtp_host || !settings.email_from_address}>
              {sending ? <Loader2 className="animate-spin" /> : <Send />}{t('settings.sendTest')}
            </Button>
          </CardContent>
        </form>
      </Card>
    </div>
  );
}

function SecuritySettings() {
  const { t } = useI18n();
  const { mode } = useAccount();

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t('settings.exposureTitle')}</CardTitle>
          <CardDescription>{t('settings.exposureDesc')}</CardDescription>
        </CardHeader>
      </Card>
      {mode === 'multi' ? <TwoFactorSetting /> : (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base"><Lock className="h-4 w-4" />{t('account.singleTitle')}</CardTitle>
            <CardDescription>{t('account.singleDesc')}</CardDescription>
          </CardHeader>
        </Card>
      )}
    </div>
  );
}

function TwoFactorSetting() {
  const { t } = useI18n();
  const [telegram, setTelegram] = useState<TelegramSettingsType | null>(() => peek<TelegramSettingsType>('/telegram') ?? null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.get<TelegramSettingsType>('/telegram').then(setTelegram).catch(() => setTelegram(null));
  }, []);

  const ready = Boolean(telegram?.enabled && telegram.linked);

  async function toggle(value: boolean) {
    setSaving(true);
    try {
      const saved = await api.patch<TelegramSettingsType>('/telegram', { login_2fa: value });
      setTelegram(saved);
      toast.success(value ? t('auth.twoFactorOn') : t('auth.twoFactorOff'));
    } catch (failure) {
      toast.error(failure instanceof Error ? failure.message : String(failure));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardContent className="space-y-3 p-5">
        <SettingRow title={t('auth.twoFactor')} description={t('auth.twoFactorDesc')}>
          <Switch checked={Boolean(telegram?.login_2fa)} disabled={!ready || saving} onCheckedChange={(value) => void toggle(value)} aria-label={t('auth.twoFactor')} />
        </SettingRow>
        {telegram && !ready && (
          <p className="text-sm text-muted-foreground">
            {t('auth.twoFactorNeedsTelegram')} <Link href="/settings?tab=telegram" className="font-medium text-foreground underline-offset-4 hover:underline">{t('telegramHub.setup')}</Link>
          </p>
        )}
      </CardContent>
    </Card>
  );
}
