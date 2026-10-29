'use client';

import { useEffect, useState } from 'react';
import { ArrowLeft, LockKeyhole, Send } from 'lucide-react';

import { DotLoader } from '@/components/dot-loader';
import { useI18n } from '@/components/i18n-provider';
import { Button } from '@/components/ui/button';
import { OtpInput, type OtpStatus } from '@/components/ui/otp-input';
import { WorkspaceProvider } from '@/components/workspace-provider';

type Step = 'code' | 'telegram';
const RESEND_SECONDS = 30;

export function AccessGate({ children }: { children: React.ReactNode }) {
  const { t, language } = useI18n();
  const [granted, setGranted] = useState<boolean | null>(null);
  const [step, setStep] = useState<Step>('code');
  const [code, setCode] = useState('');
  const [status, setStatus] = useState<OtpStatus>('idle');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [expiresAt, setExpiresAt] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);
  // Smaller slots on narrow phones so all six fit next to each other.
  const [narrow, setNarrow] = useState(false);

  useEffect(() => setNarrow(window.innerWidth < 420), []);

  useEffect(() => {
    fetch('/api/access-code', { cache: 'no-store' })
      .then((response) => response.json())
      .then((payload: { granted?: boolean }) => setGranted(Boolean(payload.granted)))
      .catch(() => setGranted(false));
  }, []);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = window.setTimeout(() => setCooldown((value) => value - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [cooldown]);

  function fail(text: string) {
    setStatus('error');
    setMessage(text);
    // Clear after the shake so the next attempt starts fresh.
    window.setTimeout(() => {
      setCode('');
      setStatus('idle');
    }, 650);
  }

  async function submitAccessCode(value: string) {
    setBusy(true);
    setMessage('');
    try {
      const response = await fetch('/api/access-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: value }),
      });
      const payload = (await response.json().catch(() => ({}))) as { second_factor?: string; expires_at?: string; error?: string };
      if (!response.ok) {
        if (response.status === 401) fail(t('access.wrong'));
        else if (response.status === 429) fail(t('auth.tooMany'));
        else if (response.status === 503 && payload.error?.includes('configured')) fail(t('access.notConfigured'));
        else fail(response.status === 503 ? t('auth.sendFailed') : t('access.failed'));
        return;
      }
      setStatus('success');
      if (payload.second_factor === 'telegram') {
        window.setTimeout(() => {
          setStep('telegram');
          setCode('');
          setStatus('idle');
          setExpiresAt(payload.expires_at ?? null);
          setCooldown(RESEND_SECONDS);
        }, 450);
      } else {
        window.setTimeout(() => setGranted(true), 450);
      }
    } catch {
      fail(t('access.failed'));
    } finally {
      setBusy(false);
    }
  }

  async function submitSecondFactor(value: string) {
    setBusy(true);
    setMessage('');
    try {
      const response = await fetch('/api/access-code/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: value }),
      });
      const payload = (await response.json().catch(() => ({}))) as { remaining?: number; expired?: boolean };
      if (!response.ok) {
        if (payload.expired) {
          fail(t('auth.expired'));
          window.setTimeout(() => setStep('code'), 1600);
        } else {
          fail(t('auth.wrongSecond', { count: payload.remaining ?? 0 }));
        }
        return;
      }
      setStatus('success');
      window.setTimeout(() => setGranted(true), 450);
    } catch {
      fail(t('access.failed'));
    } finally {
      setBusy(false);
    }
  }

  async function resend() {
    setBusy(true);
    try {
      const response = await fetch('/api/access-code/verify', {
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
        setStep('code');
      } else {
        setMessage(response.status === 429 ? t('auth.tooMany') : t('auth.sendFailed'));
      }
    } finally {
      setBusy(false);
    }
  }

  if (granted === null) {
    return (
      <main className="flex min-h-[100dvh] items-center justify-center" aria-busy="true">
        <DotLoader size={36} label={t('common.loading')} className="text-brand" />
      </main>
    );
  }

  if (!granted) {
    const telegramStep = step === 'telegram';
    return (
      <main className="relative flex min-h-[100dvh] items-center justify-center overflow-hidden bg-background px-5">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(40rem_24rem_at_50%_-6rem,hsl(var(--brand)/0.18),transparent_70%)]" aria-hidden="true" />
        <div key={step} className="relative w-full max-w-sm text-center duration-500 animate-in fade-in slide-in-from-bottom-2">
          <div className="mx-auto mb-6 flex h-14 w-14 items-center justify-center rounded-2xl border bg-card shadow-sm">
            {telegramStep ? <Send className="h-6 w-6 text-brand" /> : <LockKeyhole className="h-6 w-6 text-brand" />}
          </div>
          <p className="mb-1 text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">Anamnesies</p>
          <h1 className="text-2xl font-semibold tracking-tight">{telegramStep ? t('auth.secondTitle') : t('access.title')}</h1>
          <p className="mx-auto mt-2 max-w-xs text-sm text-muted-foreground">{telegramStep ? t('auth.secondDescription') : t('access.description')}</p>

          <div className="mt-8 flex justify-center">
            <OtpInput
              length={6}
              value={code}
              onChange={(value) => {
                setCode(value);
                if (status === 'error') setStatus('idle');
              }}
              onComplete={(value) => void (telegramStep ? submitSecondFactor(value) : submitAccessCode(value))}
              status={status}
              size={narrow ? 'md' : 'lg'}
              mask={!telegramStep}
              disabled={busy}
              autoFocus
              aria-label={telegramStep ? t('auth.secondTitle') : t('access.title')}
              className="max-w-full"
            />
          </div>

          <div className="mt-5 min-h-[1.5rem] text-sm" aria-live="polite">
            {busy ? (
              <span className="inline-flex items-center gap-2 text-muted-foreground"><DotLoader size={14} />{telegramStep ? t('auth.verifying') : t('access.checking')}</span>
            ) : message ? (
              <span role={status === 'error' ? 'alert' : undefined} className={status === 'error' ? 'text-destructive' : 'text-muted-foreground'}>{message}</span>
            ) : telegramStep && expiresAt ? (
              <span className="text-muted-foreground">{t('auth.validUntil', { time: new Date(expiresAt).toLocaleTimeString(language, { hour: '2-digit', minute: '2-digit' }) })}</span>
            ) : null}
          </div>

          {telegramStep && (
            <div className="mt-6 flex items-center justify-center gap-2">
              <Button variant="ghost" size="sm" onClick={() => { setStep('code'); setCode(''); setMessage(''); }}><ArrowLeft />{t('auth.back')}</Button>
              <Button variant="outline" size="sm" disabled={busy || cooldown > 0} onClick={() => void resend()}>
                {cooldown > 0 ? t('auth.resendIn', { seconds: cooldown }) : t('auth.resend')}
              </Button>
            </div>
          )}
        </div>
      </main>
    );
  }

  return <WorkspaceProvider>{children}</WorkspaceProvider>;
}
