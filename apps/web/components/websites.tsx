'use client';

import { type FormEvent, useRef, useState } from 'react';
import { Check, Copy, ExternalLink, Globe, ImageOff, ImagePlus, Link2, Loader2, Pin, Plus } from 'lucide-react';
import { toast } from 'sonner';

import { useI18n } from '@/components/i18n-provider';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { DeleteButton, EmptyState, Field } from '@/components/workspace-ui';
import { useWorkspace } from '@/components/workspace-provider';
import { ApiError } from '@/lib/api';
import { formatDateTime } from '@/lib/dates';
import type { StoredFile, Website } from '@/lib/types';
import { cn } from '@/lib/utils';

function hostOf(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

/** Clipboard images have to be PNG; the stored screenshot may be JPEG or WebP. */
async function screenshotAsPng(websiteId: string): Promise<Blob> {
  const response = await fetch(`/api/v1/websites/${websiteId}/screenshot`, { cache: 'no-store' });
  if (!response.ok) throw new Error(response.statusText);
  const blob = await response.blob();
  if (blob.type === 'image/png') return blob;
  const bitmap = await createImageBitmap(blob);
  const canvas = document.createElement('canvas');
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0);
  return new Promise((resolve, reject) => canvas.toBlob((png) => (png ? resolve(png) : reject(new Error('encode'))), 'image/png'));
}

/** Websites attached to a project: screenshot, link and quick copy actions. */
export function WebsitesPanel({ projectId }: { projectId: string }) {
  const { t } = useI18n();
  const { data } = useWorkspace();
  const [adding, setAdding] = useState(false);
  const websites = data.websites.filter((item) => item.project_id === projectId);

  return (
    <div className="space-y-4">
      <div className="flex justify-end"><Button onClick={() => setAdding(true)}><Plus />{t('websites.add')}</Button></div>
      {websites.length ? (
        <div className="stagger grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
          {websites.map((website) => <WebsiteCard key={website.id} website={website} />)}
        </div>
      ) : (
        <EmptyState icon={Globe} title={t('websites.empty')} description={t('websites.emptyDesc')} />
      )}
      <WebsiteDialog open={adding} projectId={projectId} onClose={() => setAdding(false)} />
    </div>
  );
}

function WebsiteCard({ website }: { website: Website }) {
  const { t, language } = useI18n();
  const { data, remove, insert, update } = useWorkspace();
  const project = data.projects.find((item) => item.id === website.project_id);
  const isCover = Boolean(project && website.screenshot_id && project.cover_file_id === website.screenshot_id);
  const [copied, setCopied] = useState<'url' | 'image' | null>(null);
  const [uploading, setUploading] = useState(false);
  const [broken, setBroken] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const host = hostOf(website.url);
  const title = website.title || host;

  function flash(kind: 'url' | 'image') {
    setCopied(kind);
    window.setTimeout(() => setCopied((current) => (current === kind ? null : current)), 1500);
  }

  async function copyUrl() {
    try {
      await navigator.clipboard.writeText(website.url);
      flash('url');
      toast.success(t('websites.urlCopied'));
    } catch {
      toast.error(t('websites.copyFailed'));
    }
  }

  async function copyScreenshot() {
    try {
      // Passing the promise keeps the user gesture alive in Safari while the image loads.
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': screenshotAsPng(website.id) })]);
      flash('image');
      toast.success(t('websites.screenshotCopied'));
    } catch {
      toast.error(t('websites.copyFailed'));
    }
  }

  async function upload(file: File) {
    setUploading(true);
    try {
      const form = new FormData();
      form.append('screenshot', file);
      const response = await fetch(`/api/v1/websites/${website.id}/screenshot`, { method: 'POST', body: form });
      const payload: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        const detail = payload && typeof payload === 'object' && 'detail' in payload ? String((payload as { detail: unknown }).detail) : response.statusText;
        throw new ApiError(detail, response.status);
      }
      insert('websites', payload as Website);
      setBroken(false);
      // The screenshot is a project file as well; fetch it so the file lists know it.
      const stored = await fetch(`/api/v1/files/${(payload as Website).screenshot_id}`).then((res) => (res.ok ? res.json() : null));
      if (stored) insert('files', stored as StoredFile);
    } catch (failure) {
      toast.error(failure instanceof Error ? failure.message : String(failure));
    } finally {
      setUploading(false);
    }
  }

  return (
    <article className="card-hover group flex flex-col overflow-hidden rounded-2xl bg-card shadow-sm">
      <a href={website.url} target="_blank" rel="noreferrer noopener" className="relative block aspect-[16/10] overflow-hidden bg-muted">
        {website.screenshot_id && !broken ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={`/api/v1/websites/${website.id}/screenshot?size=720&v=${website.screenshot_id}`} alt="" loading="lazy" onError={() => setBroken(true)}
            className="h-full w-full object-cover object-top transition-transform duration-700 ease-ds group-hover:scale-[1.02]" />
        ) : (
          <span className="flex h-full w-full flex-col items-center justify-center gap-2 text-xs text-muted-foreground">
            <ImageOff className="h-5 w-5" strokeWidth={1.6} />{t('websites.noScreenshot')}
          </span>
        )}
      </a>
      <div className="flex flex-1 flex-col gap-1 p-4">
        <div className="flex min-w-0 items-center gap-2">
          {website.favicon_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={website.favicon_url} alt="" width={16} height={16} className="h-4 w-4 shrink-0 rounded-[4px]" onError={(event) => { event.currentTarget.style.display = 'none'; }} />
          ) : <Globe className="h-4 w-4 shrink-0 text-muted-foreground" />}
          <p className="truncate text-sm font-medium" title={title}>{title}</p>
        </div>
        <a href={website.url} target="_blank" rel="noreferrer noopener" className="truncate font-mono text-[11px] text-muted-foreground hover:text-foreground" title={website.url}>{website.url}</a>
        {website.description && <p className="mt-1 line-clamp-3 text-xs text-muted-foreground">{website.description}</p>}
        <div className="mt-auto flex items-center gap-1 pt-3">
          <span className="mr-auto text-[11px] text-muted-foreground">{formatDateTime(website.created_at, language)}</span>
          <Button variant="ghost" size="icon-sm" aria-label={t('websites.copyUrl')} title={t('websites.copyUrl')} onClick={() => void copyUrl()}>
            {copied === 'url' ? <Check className="text-success" /> : <Link2 />}
          </Button>
          {website.screenshot_id && (
            <Button variant="ghost" size="icon-sm" aria-label={t('websites.copyScreenshot')} title={t('websites.copyScreenshot')} onClick={() => void copyScreenshot()}>
              {copied === 'image' ? <Check className="text-success" /> : <Copy />}
            </Button>
          )}
          {project && website.screenshot_id && (
            <Button variant="ghost" size="icon-sm" aria-pressed={isCover} title={isCover ? t('cover.removeCover') : t('cover.screenshotAsCover')}
              aria-label={isCover ? t('cover.removeCover') : t('cover.screenshotAsCover')}
              onClick={() => void update('projects', project.id, { cover_file_id: isCover ? null : website.screenshot_id }).then((ok) => ok && toast.success(isCover ? t('cover.coverRemoved') : t('cover.coverSet')))}>
              <Pin className={cn(isCover && 'fill-current')} />
            </Button>
          )}
          <Button variant="ghost" size="icon-sm" disabled={uploading} aria-label={website.screenshot_id ? t('websites.replaceScreenshot') : t('websites.uploadScreenshot')}
            title={website.screenshot_id ? t('websites.replaceScreenshot') : t('websites.uploadScreenshot')} onClick={() => fileInput.current?.click()}>
            {uploading ? <Loader2 className="animate-spin" /> : <ImagePlus />}
          </Button>
          <Button variant="ghost" size="icon-sm" asChild aria-label={t('websites.open')} title={t('websites.open')}>
            <a href={website.url} target="_blank" rel="noreferrer noopener"><ExternalLink /></a>
          </Button>
          <DeleteButton name={title} onConfirm={() => void remove('websites', website.id).then((ok) => ok && toast.success(t('websites.removed')))} />
          <input ref={fileInput} type="file" accept="image/png,image/jpeg,image/webp" hidden
            onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ''; if (file) void upload(file); }} />
        </div>
      </div>
    </article>
  );
}

function WebsiteDialog({ open, projectId, onClose }: { open: boolean; projectId: string; onClose: () => void }) {
  const { t } = useI18n();
  const { create } = useWorkspace();
  const [form, setForm] = useState({ url: '', title: '', description: '' });
  const [saving, setSaving] = useState(false);
  const validUrl = /^https?:\/\/\S+$/i.test(form.url.trim());

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!validUrl) return;
    setSaving(true);
    const created = await create('websites', {
      url: form.url.trim(), title: form.title.trim() || hostOf(form.url.trim()), description: form.description.trim() || null, project_id: projectId,
    });
    setSaving(false);
    if (created) {
      toast.success(t('websites.added'));
      setForm({ url: '', title: '', description: '' });
      onClose();
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>{t('websites.add')}</DialogTitle></DialogHeader>
        <form onSubmit={submit} className="space-y-5">
          <Field label={t('websites.url')} htmlFor="website-url" hint={form.url && !validUrl ? t('websites.invalidUrl') : undefined}>
            <Input id="website-url" type="url" autoFocus placeholder="https://" value={form.url} onChange={(event) => setForm({ ...form, url: event.target.value })} required />
          </Field>
          <Field label={t('websites.titleLabel')} htmlFor="website-title">
            <Input id="website-title" value={form.title} placeholder={validUrl ? hostOf(form.url.trim()) : ''} onChange={(event) => setForm({ ...form, title: event.target.value })} />
          </Field>
          <Field label={t('websites.description')} htmlFor="website-description">
            <Textarea id="website-description" rows={3} value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} />
          </Field>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>{t('common.cancel')}</Button>
            <Button type="submit" disabled={saving || !validUrl} className={cn(saving && 'opacity-80')}>{saving && <Loader2 className="animate-spin" />}{t('common.add')}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
