'use client';

import { useEffect, useRef, useState } from 'react';
import { Check, ImagePlus, Monitor, Moon, RotateCcw, Sun, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { useTheme } from 'next-themes';

import { useI18n } from '@/components/i18n-provider';
import { TagChip } from '@/components/knowledge';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { useWorkspace } from '@/components/workspace-provider';
import {
  type Accent, type Appearance, accents, compressWallpaper, defaultAppearance, loadAppearance, loadWallpaper, saveAppearance, saveWallpaper,
} from '@/lib/appearance';
import type { ThemePreference } from '@/lib/types';
import { cn } from '@/lib/utils';

export function AppearanceSettings() {
  const { t } = useI18n();
  const { theme, setTheme } = useTheme();
  const { saveSettings } = useWorkspace();
  const [value, setValue] = useState<Appearance>(defaultAppearance);

  useEffect(() => setValue(loadAppearance()), []);

  const set = (patch: Partial<Appearance>) => {
    setValue((current) => {
      const next = { ...current, ...patch };
      saveAppearance(next);
      return next;
    });
  };

  const themes: { value: ThemePreference; label: string; icon: typeof Sun }[] = [
    { value: 'light', label: t('shell.light'), icon: Sun },
    { value: 'dark', label: t('shell.dark'), icon: Moon },
    { value: 'system', label: t('shell.system'), icon: Monitor },
  ];

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
      <Card>
        <CardContent className="divide-y p-5">
          <Section title={t('appearance.theme')}>
            <div className="grid max-w-md grid-cols-3 gap-3" role="radiogroup" aria-label={t('appearance.theme')}>
              {themes.map(({ value: option, label, icon: Icon }) => (
                <button key={option} type="button" role="radio" aria-checked={theme === option}
                  onClick={() => { setTheme(option); void saveSettings({ theme: option }); }}
                  className={cn('flex flex-col items-center gap-2 rounded-lg p-4 text-[13px] transition-[background-color,box-shadow] duration-500 ease-ds', theme === option ? 'bg-seg font-medium shadow-sm' : 'bg-muted hover:bg-accent')}>
                  <Icon className="h-5 w-5" />{label}
                </button>
              ))}
            </div>
          </Section>

          <Section title={t('appearance.wallpaper')} description={t('appearance.wallpaperDesc')}>
            <WallpaperPicker dim={value.wallpaperDim} onDimChange={(wallpaperDim) => set({ wallpaperDim })} />
          </Section>

          <Section title={t('appearance.accent')} description={t('appearance.accentDesc')}>
            <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={t('appearance.accent')}>
              {(Object.keys(accents) as Accent[]).map((accent) => (
                <button key={accent} type="button" role="radio" aria-checked={value.accent === accent} onClick={() => set({ accent })}
                  title={t(`appearance.accent_${accent}`)} aria-label={t(`appearance.accent_${accent}`)}
                  className={cn('flex h-10 w-10 items-center justify-center rounded-full border-2 transition-[border-color] duration-200', value.accent === accent ? 'border-foreground' : 'border-transparent')}
                  style={{ background: `hsl(${accents[accent].light})` }}>
                  {value.accent === accent && <Check className={cn('h-4 w-4', accent === 'mono' ? 'text-background' : 'text-white')} />}
                </button>
              ))}
            </div>
            <Toggle title={t('appearance.accentButtons')} description={t('appearance.accentButtonsDesc')} checked={value.accentButtons} onChange={(accentButtons) => set({ accentButtons })} />
          </Section>

          <Section title={t('appearance.radius')} description={t('appearance.radiusDesc')}>
            <div className="flex max-w-md items-center gap-4">
              <input type="range" min={0} max={22} step={1} value={value.radius} onChange={(event) => set({ radius: Number(event.target.value) })}
                aria-label={t('appearance.radius')} className="flex-1 accent-[hsl(var(--brand))]" />
              <span className="w-12 text-right text-sm tabular-nums text-muted-foreground">{value.radius}px</span>
            </div>
          </Section>

          <Section title={t('appearance.density')} description={t('appearance.densityDesc')}>
            <Segmented value={value.density} options={[{ value: 'compact', label: t('appearance.compact') }, { value: 'comfortable', label: t('appearance.comfortable') }]}
              onChange={(density) => set({ density })} label={t('appearance.density')} />
          </Section>

          <Section title={t('appearance.surface')} description={t('appearance.surfaceDesc')}>
            <Segmented value={value.surface} options={[{ value: 'layered', label: t('appearance.layered') }, { value: 'flat', label: t('appearance.flat') }]}
              onChange={(surface) => set({ surface })} label={t('appearance.surface')} />
            <Toggle title={t('appearance.motion')} description={t('appearance.motionDesc')} checked={value.reduceMotion} onChange={(reduceMotion) => set({ reduceMotion })} />
          </Section>

          <div className="pt-5">
            <Button variant="outline" onClick={() => { setValue(defaultAppearance); saveAppearance(defaultAppearance); }}><RotateCcw />{t('appearance.reset')}</Button>
          </div>
        </CardContent>
      </Card>

      <Card className="self-start xl:sticky xl:top-20">
        <CardContent className="space-y-4 p-5">
          <p className="text-sm font-medium">{t('appearance.preview')}</p>
          <p className="text-sm text-muted-foreground">{t('appearance.previewText')}</p>
          <div className="flex flex-wrap gap-2">
            <Button size="sm">{t('common.save')}</Button>
            <Button size="sm" variant="outline">{t('common.cancel')}</Button>
          </div>
          <div className="flex flex-wrap gap-1.5">
            <TagChip name="planung" plain /><TagChip name="kunde" plain /><TagChip name="ki" plain />
            <Badge variant="brand">Brand</Badge><Badge variant="info">Info</Badge><Badge variant="success">OK</Badge><Badge variant="destructive">!</Badge>
          </div>
          <div className="rounded-xl bg-card shadow-sm p-4">
            <p className="font-medium">Kickoff</p>
            <p className="mt-1 text-sm text-muted-foreground">Ziele, Scope und Verantwortlichkeiten klären.</p>
            <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-muted"><div className="h-full w-2/3 rounded-full bg-brand" /></div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function WallpaperPicker({ dim, onDimChange }: { dim: number; onDimChange: (value: number) => void }) {
  const { t } = useI18n();
  const input = useRef<HTMLInputElement>(null);
  const [image, setImage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);

  useEffect(() => setImage(loadWallpaper()), []);

  async function pick(file: File | undefined) {
    if (!file || !file.type.startsWith('image/')) return;
    setBusy(true);
    try {
      const dataUrl = await compressWallpaper(file);
      try {
        saveWallpaper(dataUrl);
      } catch {
        toast.error(t('appearance.wallpaperTooLarge'));
        return;
      }
      setImage(dataUrl);
      toast.success(t('appearance.wallpaperSaved'));
    } catch {
      toast.error(t('appearance.wallpaperFailed'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="max-w-xl space-y-4">
      <input ref={input} type="file" accept="image/*" className="sr-only" tabIndex={-1}
        onChange={(event) => { void pick(event.target.files?.[0]); event.target.value = ''; }} />
      <button type="button" onClick={() => input.current?.click()} disabled={busy}
        onDragOver={(event) => { event.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)}
        onDrop={(event) => { event.preventDefault(); setDragging(false); void pick(event.dataTransfer.files[0]); }}
        className={cn('group relative flex aspect-[16/7] w-full items-center justify-center overflow-hidden rounded-xl bg-muted bg-cover bg-center text-center transition-[box-shadow,transform] duration-500 ease-ds hover:shadow-md focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring',
          !image && 'outline-dashed outline-[1.5px] -outline-offset-[1.5px] outline-foreground/20', dragging && 'scale-[0.99] ring-[3px] ring-ring')}
        style={image ? { backgroundImage: `url("${image}")` } : undefined}>
        {image ? (
          <span className="ds-glass absolute bottom-3 right-3 inline-flex h-[22px] items-center gap-1.5 rounded-full px-2.5 text-xs font-book opacity-0 transition-opacity duration-500 group-hover:opacity-100 group-focus-visible:opacity-100">
            <ImagePlus className="h-[13px] w-[13px]" strokeWidth={1.6} />{t('appearance.wallpaperChange')}
          </span>
        ) : (
          <span className="flex flex-col items-center gap-1.5 px-6">
            <ImagePlus className="h-[18px] w-[18px] text-muted-foreground" strokeWidth={1.6} />
            <span className="text-xs font-medium">{t('appearance.wallpaperEmpty')}</span>
            <span className="ds-label">{t('appearance.wallpaperHint')}</span>
          </span>
        )}
      </button>
      <div className="flex flex-wrap items-center gap-1.5">
        <Button size="sm" variant="outline" onClick={() => input.current?.click()} disabled={busy}>
          <ImagePlus />{image ? t('appearance.wallpaperChange') : t('appearance.wallpaperChoose')}
        </Button>
        {image && (
          <Button size="sm" variant="ghost" onClick={() => { saveWallpaper(null); setImage(null); }}>
            <Trash2 />{t('appearance.wallpaperRemove')}
          </Button>
        )}
      </div>
      {image && (
        <div className="space-y-2">
          <div className="flex items-center gap-4">
            <span className="w-28 shrink-0 text-[13px]">{t('appearance.wallpaperDim')}</span>
            <input type="range" min={0} max={80} step={5} value={dim} onChange={(event) => onDimChange(Number(event.target.value))}
              aria-label={t('appearance.wallpaperDim')} className="flex-1 accent-[hsl(var(--foreground))]" />
            <span className="w-12 text-right text-xs tabular-nums text-muted-foreground">{dim}%</span>
          </div>
          <p className="ds-label">{t('appearance.wallpaperDimDesc')}</p>
        </div>
      )}
    </div>
  );
}

function Section({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-3 py-5 first:pt-0">
      <div className="space-y-0.5">
        <p className="text-sm font-medium">{title}</p>
        {description && <p className="text-sm text-muted-foreground">{description}</p>}
      </div>
      {children}
    </div>
  );
}

function Toggle({ title, description, checked, onChange }: { title: string; description: string; checked: boolean; onChange: (value: boolean) => void }) {
  return (
    <label className="flex max-w-xl cursor-pointer items-center justify-between gap-4 pt-2">
      <span><span className="block text-sm">{title}</span><span className="block text-xs text-muted-foreground">{description}</span></span>
      <Switch checked={checked} onCheckedChange={onChange} />
    </label>
  );
}

function Segmented<T extends string>({ value, options, onChange, label }: { value: T; options: { value: T; label: string }[]; onChange: (value: T) => void; label: string }) {
  return (
    <div className="inline-flex gap-0.5 rounded-full ds-glass p-[3px]" role="radiogroup" aria-label={label}>
      {options.map((option) => (
        <button key={option.value} type="button" role="radio" aria-checked={value === option.value} onClick={() => onChange(option.value)}
          className={cn('h-[22px] rounded-full px-4 text-xs font-book transition-[background-color,box-shadow,color] duration-600 ease-ds', value === option.value ? 'bg-seg text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground')}>
          {option.label}
        </button>
      ))}
    </div>
  );
}
