'use client';

import { type FormEvent, type ReactNode, useCallback, useEffect, useState } from 'react';
import { KeyRound, Laptop, Loader2, LogOut, MoreHorizontal, ShieldCheck, Trash2, UserPlus } from 'lucide-react';
import { toast } from 'sonner';

import { useAccount } from '@/components/auth-gate';
import { useI18n } from '@/components/i18n-provider';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { badgeVariants } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { api } from '@/lib/api';
import { formatDateTime } from '@/lib/dates';
import { cn } from '@/lib/utils';

type Account = { id: string; username: string; display_name: string | null; is_admin: boolean; created_at: string; last_login_at: string | null };
type ManagedUser = Account & { disabled: boolean; is_self: boolean };
type SessionInfo = { id: string; created_at: string; last_used_at: string; expires_at: string; user_agent: string | null; current: boolean };

/** Badge as inline element, so it may sit inside text (the Badge component renders a div). */
function Pill({ variant, className, children }: { variant: 'secondary' | 'outline'; className?: string; children: ReactNode }) {
  return <span className={cn(badgeVariants({ variant }), className)}>{children}</span>;
}

const fail = (failure: unknown) => toast.error(failure instanceof Error ? failure.message : String(failure));

function Row({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="space-y-0.5">
        <p className="text-sm font-medium">{title}</p>
        {description && <p className="text-sm text-muted-foreground">{description}</p>}
      </div>
      {children}
    </div>
  );
}

/** Short, readable name for a browser's user agent ("Chrome · Windows"). */
function deviceName(agent: string | null, fallback: string): string {
  if (!agent) return fallback;
  const browser = /Edg\//.test(agent) ? 'Edge' : /Firefox\//.test(agent) ? 'Firefox' : /Chrome\//.test(agent) ? 'Chrome' : /Safari\//.test(agent) ? 'Safari' : null;
  const system = /Windows/.test(agent) ? 'Windows' : /iPhone|iPad/.test(agent) ? 'iOS' : /Android/.test(agent) ? 'Android' : /Mac OS X/.test(agent) ? 'macOS' : /Linux/.test(agent) ? 'Linux' : null;
  return [browser, system].filter(Boolean).join(' · ') || fallback;
}

/** Settings → Account: profile, password, signed-in browsers and sign-out (multi-user mode). */
export function AccountSettings() {
  const { t, language } = useI18n();
  const { user, setUser, signOut } = useAccount();
  const [account, setAccount] = useState<Account | null>(null);
  const [name, setName] = useState('');
  const [savingName, setSavingName] = useState(false);
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [repeat, setRepeat] = useState('');
  const [savingPassword, setSavingPassword] = useState(false);
  const [sessions, setSessions] = useState<SessionInfo[] | null>(null);

  const loadSessions = useCallback(() => api.get<SessionInfo[]>('/account/sessions').then(setSessions).catch(fail), []);

  useEffect(() => {
    api.get<Account>('/account').then((loaded) => { setAccount(loaded); setName(loaded.display_name ?? ''); }).catch(fail);
    void loadSessions();
  }, [loadSessions]);

  async function saveName(event: FormEvent) {
    event.preventDefault();
    setSavingName(true);
    try {
      const saved = await api.patch<Account>('/account', { display_name: name });
      setAccount(saved);
      if (user) setUser({ ...user, display_name: saved.display_name });
      toast.success(t('common.saved'));
    } catch (failure) {
      fail(failure);
    } finally {
      setSavingName(false);
    }
  }

  async function changePassword(event: FormEvent) {
    event.preventDefault();
    if (next.length < 8) return toast.error(t('access.passwordTooShort'));
    if (next !== repeat) return toast.error(t('access.passwordMismatch'));
    setSavingPassword(true);
    try {
      await api.post('/account/password', { current_password: current, new_password: next });
      setCurrent(''); setNext(''); setRepeat('');
      toast.success(t('account.passwordChanged'));
      void loadSessions();
    } catch (failure) {
      fail(failure);
    } finally {
      setSavingPassword(false);
    }
  }

  async function revoke(session: SessionInfo) {
    if (session.current) return void signOut();
    try {
      await api.delete(`/account/sessions/${session.id}`);
      setSessions((list) => list?.filter((entry) => entry.id !== session.id) ?? null);
      toast.success(t('account.revoked'));
    } catch (failure) {
      fail(failure);
    }
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t('account.profile')}</CardTitle>
          <CardDescription>
            {account ? t('account.signedInAs', { name: account.username }) : t('common.loading')}
            {account?.is_admin && <Pill variant="secondary" className="ml-2 align-middle">{t('account.admin')}</Pill>}
          </CardDescription>
        </CardHeader>
        <form onSubmit={(event) => void saveName(event)}>
          <CardContent className="space-y-1.5">
            <Label htmlFor="account-name">{t('access.displayName')}</Label>
            <Input id="account-name" value={name} onChange={(event) => setName(event.target.value)} maxLength={120} className="max-w-sm" autoComplete="name" />
          </CardContent>
          <CardFooter>
            <Button type="submit" disabled={savingName || !account || name === (account.display_name ?? '')}>
              {savingName && <Loader2 className="animate-spin" />}{t('common.save')}
            </Button>
          </CardFooter>
        </form>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t('account.passwordTitle')}</CardTitle>
          <CardDescription>{t('account.passwordDesc')}</CardDescription>
        </CardHeader>
        <form onSubmit={(event) => void changePassword(event)}>
          {/* Lets password managers attach the new password to the right account. */}
          <input type="text" name="username" autoComplete="username" value={account?.username ?? ''} readOnly hidden />
          <CardContent className="grid max-w-sm gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="pw-current">{t('account.currentPassword')}</Label>
              <Input id="pw-current" type="password" value={current} onChange={(event) => setCurrent(event.target.value)} autoComplete="current-password" required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pw-new">{t('account.newPassword')}</Label>
              <Input id="pw-new" type="password" value={next} onChange={(event) => setNext(event.target.value)} autoComplete="new-password" required minLength={8} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pw-repeat">{t('access.passwordRepeat')}</Label>
              <Input id="pw-repeat" type="password" value={repeat} onChange={(event) => setRepeat(event.target.value)} autoComplete="new-password" required />
            </div>
          </CardContent>
          <CardFooter>
            <Button type="submit" disabled={savingPassword || !current || !next || !repeat}>
              {savingPassword ? <Loader2 className="animate-spin" /> : <KeyRound />}{t('account.changePassword')}
            </Button>
          </CardFooter>
        </form>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t('account.sessionsTitle')}</CardTitle>
          <CardDescription>{t('account.sessionsDesc')}</CardDescription>
        </CardHeader>
        <CardContent className="divide-y">
          {sessions === null ? (
            <p className="text-sm text-muted-foreground">{t('common.loading')}</p>
          ) : sessions.map((session) => (
            <div key={session.id} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
              <Laptop className="h-4 w-4 shrink-0 text-muted-foreground" strokeWidth={1.6} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">
                  {deviceName(session.user_agent, t('account.unknownDevice'))}
                  {session.current && <Pill variant="secondary" className="ml-2 align-middle">{t('account.thisDevice')}</Pill>}
                </p>
                <p className="text-xs text-muted-foreground">{t('account.lastActive', { time: formatDateTime(session.last_used_at, language) })}</p>
              </div>
              <Button variant="ghost" size="sm" onClick={() => void revoke(session)}><LogOut />{t('account.revoke')}</Button>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-5">
          <Row title={t('account.signOut')} description={t('account.signOutDesc')}>
            <Button variant="outline" onClick={() => void signOut()}><LogOut />{t('account.signOut')}</Button>
          </Row>
        </CardContent>
      </Card>
    </div>
  );
}

/** Settings → Users (admins only): create, edit, disable and delete accounts. */
export function UserManagement() {
  const { t, language } = useI18n();
  const [users, setUsers] = useState<ManagedUser[] | null>(null);
  const [creating, setCreating] = useState(false);
  const [resetting, setResetting] = useState<ManagedUser | null>(null);
  const [deleting, setDeleting] = useState<ManagedUser | null>(null);

  const load = useCallback(() => api.get<ManagedUser[]>('/users').then(setUsers).catch(fail), []);
  useEffect(() => { void load(); }, [load]);

  async function update(user: ManagedUser, changes: Partial<Pick<ManagedUser, 'is_admin' | 'disabled'>>) {
    try {
      const saved = await api.patch<ManagedUser>(`/users/${user.id}`, changes);
      setUsers((list) => list?.map((entry) => (entry.id === saved.id ? saved : entry)) ?? null);
      toast.success(t('account.userUpdated'));
    } catch (failure) {
      fail(failure);
    }
  }

  async function remove(user: ManagedUser) {
    try {
      await api.delete(`/users/${user.id}`);
      setUsers((list) => list?.filter((entry) => entry.id !== user.id) ?? null);
      toast.success(t('account.userDeleted'));
    } catch (failure) {
      fail(failure);
    } finally {
      setDeleting(null);
    }
  }

  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between gap-4 space-y-0">
        <div className="space-y-1.5">
          <CardTitle className="text-base">{t('account.usersTitle')}</CardTitle>
          <CardDescription>{t('account.usersDesc')}</CardDescription>
        </div>
        <Button onClick={() => setCreating(true)}><UserPlus />{t('account.addUser')}</Button>
      </CardHeader>
      <CardContent className="divide-y">
        {users === null ? (
          <p className="text-sm text-muted-foreground">{t('common.loading')}</p>
        ) : users.map((user) => (
          <div key={user.id} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold uppercase">
              {(user.display_name || user.username).slice(0, 2)}
            </div>
            <div className="min-w-0 flex-1">
              <p className="flex flex-wrap items-center gap-1.5 text-sm font-medium">
                <span className="truncate">{user.display_name || user.username}</span>
                {user.display_name && <span className="font-normal text-muted-foreground">@{user.username}</span>}
                {user.is_admin && <Pill variant="secondary">{t('account.admin')}</Pill>}
                {user.disabled && <Pill variant="outline">{t('account.disabled')}</Pill>}
                {user.is_self && <Pill variant="outline">{t('account.you')}</Pill>}
              </p>
              <p className="text-xs text-muted-foreground">
                {user.last_login_at ? t('account.lastLogin', { time: formatDateTime(user.last_login_at, language) }) : t('account.neverSignedIn')}
              </p>
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" aria-label={t('common.actions')}><MoreHorizontal /></Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onSelect={() => setResetting(user)}><KeyRound />{t('account.resetPassword')}</DropdownMenuItem>
                {!user.is_self && (
                  <>
                    <DropdownMenuItem onSelect={() => void update(user, { is_admin: !user.is_admin })}>
                      <ShieldCheck />{user.is_admin ? t('account.removeAdmin') : t('account.makeAdmin')}
                    </DropdownMenuItem>
                    <DropdownMenuItem onSelect={() => void update(user, { disabled: !user.disabled })}>
                      <LogOut />{user.disabled ? t('account.enable') : t('account.disable')}
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem className="text-destructive focus:text-destructive" onSelect={() => setDeleting(user)}>
                      <Trash2 />{t('account.deleteUser')}
                    </DropdownMenuItem>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        ))}
      </CardContent>

      <CreateUserDialog open={creating} onOpenChange={setCreating} onCreated={(user) => setUsers((list) => [...(list ?? []), user])} />
      <ResetPasswordDialog user={resetting} onClose={() => setResetting(null)} />
      <AlertDialog open={deleting !== null} onOpenChange={(open) => { if (!open) setDeleting(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('account.deleteUser')}</AlertDialogTitle>
            <AlertDialogDescription>{t('account.deleteUserText', { name: deleting?.username ?? '' })}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={() => deleting && void remove(deleting)}>{t('common.delete')}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}

function CreateUserDialog({ open, onOpenChange, onCreated }: { open: boolean; onOpenChange: (open: boolean) => void; onCreated: (user: ManagedUser) => void }) {
  const { t } = useI18n();
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [isAdmin, setIsAdmin] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) { setUsername(''); setDisplayName(''); setPassword(''); setIsAdmin(false); }
  }, [open]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (password.length < 8) return toast.error(t('access.passwordTooShort'));
    setSaving(true);
    try {
      const user = await api.post<ManagedUser>('/users', { username, password, display_name: displayName || null, is_admin: isAdmin });
      onCreated(user);
      toast.success(t('account.userCreated', { name: user.username }));
      onOpenChange(false);
    } catch (failure) {
      fail(failure);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={(event) => void submit(event)} className="space-y-4">
          <DialogHeader>
            <DialogTitle>{t('account.addUser')}</DialogTitle>
            <DialogDescription>{t('account.addUserDesc')}</DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="new-username">{t('access.username')}</Label>
            <Input id="new-username" value={username} onChange={(event) => setUsername(event.target.value)} autoComplete="off" autoCapitalize="none" spellCheck={false} required />
            <p className="px-1 text-xs text-muted-foreground">{t('access.usernameRules')}</p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="new-display-name">{t('access.displayName')} <span className="font-normal text-muted-foreground">({t('common.optional')})</span></Label>
            <Input id="new-display-name" value={displayName} onChange={(event) => setDisplayName(event.target.value)} autoComplete="off" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="new-password">{t('access.password')}</Label>
            <Input id="new-password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="new-password" required minLength={8} />
          </div>
          <Row title={t('account.admin')} description={t('account.adminDesc')}>
            <Switch checked={isAdmin} onCheckedChange={setIsAdmin} aria-label={t('account.admin')} />
          </Row>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>{t('common.cancel')}</Button>
            <Button type="submit" disabled={saving || !username || !password}>{saving && <Loader2 className="animate-spin" />}{t('common.create')}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ResetPasswordDialog({ user, onClose }: { user: ManagedUser | null; onClose: () => void }) {
  const { t } = useI18n();
  const [password, setPassword] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => setPassword(''), [user]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!user) return;
    if (password.length < 8) return toast.error(t('access.passwordTooShort'));
    setSaving(true);
    try {
      await api.patch(`/users/${user.id}`, { password });
      toast.success(t('account.passwordChanged'));
      onClose();
    } catch (failure) {
      fail(failure);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={user !== null} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={(event) => void submit(event)} className="space-y-4">
          <DialogHeader>
            <DialogTitle>{t('account.resetPassword')}</DialogTitle>
            <DialogDescription>{t('account.resetPasswordDesc', { name: user?.username ?? '' })}</DialogDescription>
          </DialogHeader>
          <input type="text" name="username" autoComplete="username" value={user?.username ?? ''} readOnly hidden />
          <div className="space-y-1.5">
            <Label htmlFor="reset-password">{t('account.newPassword')}</Label>
            <Input id="reset-password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="new-password" required minLength={8} />
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose}>{t('common.cancel')}</Button>
            <Button type="submit" disabled={saving || !password}>{saving && <Loader2 className="animate-spin" />}{t('common.save')}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
