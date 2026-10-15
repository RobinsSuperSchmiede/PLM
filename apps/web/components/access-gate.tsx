'use client';

import { FormEvent, useEffect, useState } from 'react';
import { WorkspaceProvider } from '@/components/workspace-provider';

const accessStorageKey = 'plm-access-granted';

export function AccessGate({ children }: { children: React.ReactNode }) {
  const [granted, setGranted] = useState(false);
  const [ready, setReady] = useState(false);
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    setGranted(window.localStorage.getItem(accessStorageKey) === 'true');
    setReady(true);
  }, []);

  async function submitCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!/^\d{6}$/.test(code)) {
      setError('Bitte gib einen sechsstelligen Zugangscode ein.');
      return;
    }
    setChecking(true);
    setError('');
    try {
      const response = await fetch('/api/access-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code }),
      });
      if (!response.ok) {
        setError(response.status === 503 ? 'Der Zugangscode ist nicht konfiguriert.' : 'Der Zugangscode ist nicht korrekt.');
        return;
      }
      window.localStorage.setItem(accessStorageKey, 'true');
      setGranted(true);
    } catch {
      setError('Der Zugang konnte nicht überprüft werden. Bitte versuche es erneut.');
    } finally {
      setChecking(false);
    }
  }

  if (!ready) return <main className="min-h-screen bg-black" aria-label="Anwendung wird geladen" />;
  if (!granted) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-black px-5 text-white">
        <form onSubmit={submitCode} className="w-full max-w-[260px] space-y-4">
          <h1 className="text-lg font-medium tracking-tight">Zugangscode</h1>
          <label className="sr-only" htmlFor="access-code">Sechsstelliger Zugangscode</label>
          <input
            id="access-code"
            autoFocus
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9]{6}"
            maxLength={6}
            value={code}
            onChange={(event) => setCode(event.target.value.replace(/\D/g, ''))}
            placeholder="••••••"
            className="h-11 w-full rounded-md border border-zinc-800 bg-zinc-950 px-3 text-center font-mono text-base tracking-[0.45em] outline-none transition focus:border-zinc-500 focus:ring-1 focus:ring-zinc-500"
            aria-describedby={error ? 'access-error' : undefined}
            aria-invalid={!!error}
          />
          <button type="submit" disabled={checking} className="sr-only">Zugang öffnen</button>
          {error && <p id="access-error" role="alert" className="text-center text-xs text-zinc-400">{error}</p>}
          {checking && <p role="status" className="text-center text-xs text-zinc-500">Wird überprüft …</p>}
        </form>
      </main>
    );
  }
  return <WorkspaceProvider>{children}</WorkspaceProvider>;
}
