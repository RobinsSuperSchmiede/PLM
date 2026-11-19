'use client';

import dynamic from 'next/dynamic';
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { ArrowLeft, ArrowRight, Eye, EyeOff, LockKeyhole, Send } from 'lucide-react';

import { DesktopTitleBar } from '@/components/desktop-window';
import { DotLoader } from '@/components/dot-loader';
import { useI18n } from '@/components/i18n-provider';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { OtpStatus } from '@/components/ui/otp-input';
import { WorkspaceProvider } from '@/components/workspace-provider';
import { onboardingSteps } from '@/lib/onboarding';
import { clearSnapshot, setSnapshotScope } from '@/lib/snapshot-store';

// The ASCII map and the roadmap of the walkthrough frame the account setup, its first station.
const AsciiField = dynamic(() => import('@/components/onboarding/ascii-field').then((module) => module.AsciiField), { ssr: false });
const Roadmap = dynamic(() => import('@/components/onboarding/roadmap').then((module) => module.Roadmap), { ssr: false });

// The code input brings the animation library (~48 kB gzipped) with it. It is only needed for the
// Telegram step, so it is loaded there instead of with every page of the app.
const OtpInput = dynamic(() => import('@/components/ui/otp-input').then((module) => module.OtpInput), {
  ssr: false,
  loading: () => <div className="h-14" aria-hidden="true" />,
});

export type AccountUser = { id: string; username: string; display_name: string | null; is_admin: boolean };
type AuthStatus = { mode: 'single' | 'multi'; setup_required: boolean; user: AccountUser | null };

type AccountContextValue = {
  /** "single": no accounts, one local workspace. "multi": signed in with username and password. */
  mode: 'single' | 'multi';
  user: AccountUser | null;
  setUser: (user: AccountUser) => void;
  signOut: () => Promise<void>;
};

const AccountContext = createContext<AccountContextValue | null>(null);

export function useAccount() {
  const context = useContext(AccountContext);
  if (!context) throw new Error('useAccount must be used within AuthGate');
  return context;
}

/** Ends the session and reloads, so nothing of this account stays in memory or in this browser. */
async function endSession() {
  await fetch('/api/auth', { method: 'DELETE' }).catch(() => undefined);
  await clearSnapshot();
  window.location.href = '/';
}

export function AuthGate({ children }: { children: React.ReactNode }) {
  const { t } = useI18n();
  const [status, setStatus] = useState<AuthStatus | null>(null);
  const [error, setError] = useState(false);

  const load = useCallback(() => {
    setError(false);
    fetch('/api/auth', { cache: 'no-store' })
      .then((response) => (response.ok ? response.json() : Promise.reject(new Error(String(response.status)))))
      .then((payload: AuthStatus) => setStatus(payload))
      .catch(() => setError(true));
  }, []);

  useEffect(load, [load]);

  const signedIn = status !== null && (status.mode === 'single' || status.user !== null);
  // The offline copy of the workspace belongs to one account (see snapshot-store).
  if (signedIn) setSnapshotScope(status.mode === 'single' ? 'single' : status.user!.id);

  const account = useMemo<AccountContextValue | null>(() => (status && signedIn ? {
    mode: status.mode,
    user: status.user,
    setUser: (user) => setStatus((current) => (current ? { ...current, user } : current)),
    signOut: endSession,
  } : null), [status, signedIn]);

  if (error) {
    return (
      <main className="flex min-h-[100dvh] flex-col items-center justify-center gap-4 px-5 text-center">
        <DesktopTitleBar className="fixed inset-x-0 top-0 z-10" />
        <p className="text-sm text-muted-foreground">{t('access.unreachable')}</p>
        <Button variant="outline" size="sm" onClick={load}>{t('common.retry')}</Button>
      </main>
    );
  }

  if (status === null) {
    return (
      <main className="flex min-h-[100dvh] items-center justify-center" aria-busy="true">
        <DesktopTitleBar className="fixed inset-x-0 top-0 z-10" />
        <DotLoader size={36} label={t('common.loading')} className="text-muted-foreground" />
      </main>
    );
  }

  if (!account) {
    // A full reload after signing in starts the workspace cleanly for this account.
    return <SignIn setup={status.setup_required} onSignedIn={() => window.location.reload()} />;
  }

  return (
    <AccountContext.Provider value={account}>
      <WorkspaceProvider>{children}</WorkspaceProvider>
    </AccountContext.Provider>
  );
}

const RESEND_SECONDS = 30;

function SignIn({ setup, onSignedIn }: { setup: boolean; onSignedIn: () => void }) {
  const { t, language } = useI18n();
  const [step, setStep] = useState<'password' | 'telegram'>('password');
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [repeat, setRepeat] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [code, setCode] = useState('');
  const [otpStatus, setOtpStatus] = useState<OtpStatus>('idle');
  const [expiresAt, setExpiresAt] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);
  const [narrow, setNarrow] = useState(false);

  useEffect(() => setNarrow(window.innerWidth < 420), []);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = window.setTimeout(() => setCooldown((value) => value - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [cooldown]);

  async function submitPassword(event: React.FormEvent) {
    event.preventDefault();
    setMessage('');
    if (setup) {
      if (password.length < 8) return setMessage(t('access.passwordTooShort'));
      if (password !== repeat) return setMessage(t('access.passwordMismatch'));
    }
    setBusy(true);
    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password, setup, display_name: setup ? displayName || undefined : undefined }),
      });
      const payload = (await response.json().catch(() => ({}))) as { second_factor?: string; expires_at?: string; error?: string };
      if (!response.ok) {
        if (response.status === 401) setMessage(t('access.wrong'));
        else if (response.status === 429) setMessage(payload.error?.includes('code') ? t('auth.tooMany') : t('access.tooManyAttempts'));
        else if (response.status === 400 && setup && payload.error) setMessage(payload.error);
        else if (response.status === 503) setMessage(t('auth.sendFailed'));
        else if (response.status === 502) setMessage(t('access.unreachable'));
        else setMessage(t('access.failed'));
        return;
      }
      if (payload.second_factor === 'telegram') {
        setPassword('');
        setRepeat('');
        setStep('telegram');
        setExpiresAt(payload.expires_at ?? null);
        setCooldown(RESEND_SECONDS);
        return;
      }
      onSignedIn();
    } catch {
      setMessage(t('access.failed'));
    } finally {
      setBusy(false);
    }
  }

  function failCode(text: string) {
    setOtpStatus('error');
    setMessage(text);
    window.setTimeout(() => {
      setCode('');
      setOtpStatus('idle');
    }, 650);
  }

  async function submitCode(value: string) {
    setBusy(true);
    setMessage('');
    try {
      const response = await fetch('/api/auth/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: value }),
      });
      const payload = (await response.json().catch(() => ({}))) as { remaining?: number; expired?: boolean };
      if (!response.ok) {
        if (payload.expired) {
          failCode(t('auth.expired'));
          window.setTimeout(() => setStep('password'), 1600);
        } else {
          failCode(t('auth.wrongSecond', { count: payload.remaining ?? 0 }));
        }
        return;
      }
      setOtpStatus('success');
      window.setTimeout(onSignedIn, 450);
    } catch {
      failCode(t('access.failed'));
    } finally {
      setBusy(false);
    }
  }

  async function resend() {
    setBusy(true);
    try {
      const response = await fetch('/api/auth/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resend: true }),
      });
      const payload = (await response.json().catch(() => ({}))) as { expires_at?: string; expired?: boolean };
      if (response.ok) {
        setExpiresAt(payload.expires_at ?? null);
        setCooldown(RESEND_SECONDS);
        setMessage(t('auth.resent'));
      } else if (payload.expired) {
        setStep('password');
      } else {
        setMessage(response.status === 429 ? t('auth.tooMany') : t('auth.sendFailed'));
      }
    } finally {
      setBusy(false);
    }
  }

  const telegramStep = step === 'telegram';

  const passwordForm = (
    <form id="auth-form" onSubmit={(event) => void submitPassword(event)} className="mt-8 space-y-4 text-left">
      <div className="space-y-1.5">
        <Label htmlFor="auth-username">{t('access.username')}</Label>
        <Input id="auth-username" value={username} onChange={(event) => setUsername(event.target.value)} autoComplete="username" autoCapitalize="none" spellCheck={false} required autoFocus className="h-9" />
        {setup && <p className="px-1 text-xs text-muted-foreground">{t('access.usernameRules')}</p>}
      </div>
      {setup && (
        <div className="space-y-1.5">
          <Label htmlFor="auth-display-name">{t('access.displayName')} <span className="font-normal text-muted-foreground">({t('common.optional')})</span></Label>
          <Input id="auth-display-name" value={displayName} onChange={(event) => setDisplayName(event.target.value)} autoComplete="name" className="h-9" />
        </div>
      )}
      <div className="space-y-1.5">
        <Label htmlFor="auth-password">{t('access.password')}</Label>
        <div className="relative">
          <Input id="auth-password" type={showPassword ? 'text' : 'password'} value={password} onChange={(event) => setPassword(event.target.value)}
            autoComplete={setup ? 'new-password' : 'current-password'} required className="h-9 pr-10" />
          <button type="button" onClick={() => setShowPassword((value) => !value)} aria-label={showPassword ? t('access.hidePassword') : t('access.showPassword')}
            className="absolute right-1 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring">
            {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>
      </div>
      {setup && (
        <div className="space-y-1.5">
          <Label htmlFor="auth-repeat">{t('access.passwordRepeat')}</Label>
          <Input id="auth-repeat" type={showPassword ? 'text' : 'password'} value={repeat} onChange={(event) => setRepeat(event.target.value)} autoComplete="new-password" required className="h-9" />
        </div>
      )}
      <div className="min-h-[1.25rem] text-center text-sm" aria-live="polite">
        {message && <span role="alert" className="text-destructive">{message}</span>}
      </div>
      {!setup && (
        <Button type="submit" className="h-9 w-full" disabled={busy || !username || !password}>
          {busy ? <DotLoader size={14} /> : null}
          {busy ? t('access.signingIn') : t('access.signIn')}
        </Button>
      )}
    </form>
  );

  // First start: creating the account is the first station of the walkthrough, in its frame.
  if (setup && !telegramStep) {
    return (
      <div className="fixed inset-0 flex flex-col overflow-hidden bg-background" role="main" aria-labelledby="setup-title">
        <AsciiField step={0} steps={onboardingSteps.length} />
        <DesktopTitleBar className="relative z-10" />
        <div className="relative min-h-0 flex-1 overflow-y-auto overscroll-contain">
          <div className="onboarding-in-next mx-auto flex min-h-full w-full max-w-md flex-col justify-center px-5 py-10 sm:px-8">
            <h1 id="setup-title" className="intro-rise text-[32px] font-semibold leading-[1.1] tracking-[-0.03em] sm:text-[40px]">{t('access.setupTitle')}</h1>
            <p className="intro-rise mt-2 text-[15px] text-muted-foreground" style={{ '--d': '120ms' } as React.CSSProperties}>{t('access.setupDescription')}</p>
            <div className="intro-rise" style={{ '--d': '220ms' } as React.CSSProperties}>{passwordForm}</div>
          </div>
        </div>
        <footer className="relative shrink-0 pb-2 sm:pb-4">
          <div className="mx-auto flex w-full max-w-6xl items-center justify-end gap-2 px-5 sm:px-8">
            <Button size="lg" type="submit" form="auth-form" disabled={busy || !username || !password || !repeat}>
              {busy ? <DotLoader size={14} /> : null}
              {busy ? t('access.signingIn') : t('access.setupSubmit')}
              {!busy && <ArrowRight />}
            </Button>
          </div>
          <Roadmap labels={onboardingSteps.map((entry) => t(`onboarding.step_${entry}`))} current={0} onSelect={() => undefined} label={t('onboarding.progress')} />
        </footer>
      </div>
    );
  }
  const Icon = telegramStep ? Send : LockKeyhole;
  const title = telegramStep ? t('auth.secondTitle') : t('access.signInTitle');
  const description = telegramStep ? t('auth.secondDescription') : t('access.signInDescription');

  return (
    <main className="relative flex min-h-[100dvh] items-center justify-center overflow-hidden px-5 py-10">
      <DesktopTitleBar className="fixed inset-x-0 top-0 z-10" />
      <div key={step} className="relative w-full max-w-sm text-center duration-500 animate-in fade-in slide-in-from-bottom-2">
        <div className="mx-auto mb-6 flex h-14 w-14 items-center justify-center rounded-[18px] bg-card shadow-sm">
          <Icon className="h-5 w-5 text-brand" strokeWidth={1.6} />
        </div>
        <p className="ds-label mb-2">Anamnesies</p>
        <h1 className="text-[20px] font-semibold tracking-[-0.015em]">{title}</h1>
        <p className="mx-auto mt-2 max-w-xs text-[13px] leading-[1.55] text-[hsl(var(--fg-2)/var(--fg-2-a))]">{description}</p>

        {telegramStep ? (
          <>
            <div className="mt-8 flex justify-center">
              <OtpInput
                length={6}
                value={code}
                onChange={(value) => {
                  setCode(value);
                  if (otpStatus === 'error') setOtpStatus('idle');
                }}
                onComplete={(value) => void submitCode(value)}
                status={otpStatus}
                size={narrow ? 'md' : 'lg'}
                disabled={busy}
                autoFocus
                aria-label={t('auth.secondTitle')}
                className="max-w-full"
              />
            </div>
            <div className="mt-5 min-h-[1.5rem] text-sm" aria-live="polite">
              {busy ? (
                <span className="inline-flex items-center gap-2 text-muted-foreground"><DotLoader size={14} />{t('auth.verifying')}</span>
              ) : message ? (
                <span role={otpStatus === 'error' ? 'alert' : undefined} className={otpStatus === 'error' ? 'text-destructive' : 'text-muted-foreground'}>{message}</span>
              ) : expiresAt ? (
                <span className="text-muted-foreground">{t('auth.validUntil', { time: new Date(expiresAt).toLocaleTimeString(language, { hour: '2-digit', minute: '2-digit' }) })}</span>
              ) : null}
            </div>
            <div className="mt-6 flex items-center justify-center gap-2">
              <Button variant="ghost" size="sm" onClick={() => { setStep('password'); setCode(''); setMessage(''); }}><ArrowLeft />{t('auth.back')}</Button>
              <Button variant="outline" size="sm" disabled={busy || cooldown > 0} onClick={() => void resend()}>
                {cooldown > 0 ? t('auth.resendIn', { seconds: cooldown }) : t('auth.resend')}
              </Button>
            </div>
          </>
        ) : passwordForm}
      </div>
    </main>
  );
}
