'use client';

import { useEffect, useState } from 'react';
import { Check, Monitor, Moon, RotateCcw, Sun } from 'lucide-react';
import { useTheme } from 'next-themes';

import { useI18n } from '@/components/i18n-provider';
import { TagChip } from '@/components/knowledge';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { useWorkspace } from '@/components/workspace-provider';
import { type Accent, type Appearance, accents, defaultAppearance, loadAppearance, saveAppearance } from '@/lib/appearance';
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
                  className={cn('flex flex-col items-center gap-2 rounded-lg border-2 p-4 text-sm transition-colors hover:bg-accent', theme === option ? 'border-brand' : 'border-muted')}>
                  <Icon className="h-5 w-5" />{label}
                </button>
              ))}
            </div>
          </Section>

          <Section title={t('appearance.accent')} description={t('appearance.accentDesc')}>
            <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={t('appearance.accent')}>
              {(Object.keys(accents) as Accent[]).map((accent) => (
                <button key={accent} type="button" role="radio" aria-checked={value.accent === accent} onClick={() => set({ accent })}
                  title={t(`appearance.accent_${accent}`)} aria-label={t(`appearance.accent_${accent}`)}
                  className={cn('flex h-10 w-10 items-center justify-center rounded-full border-2 transition-transform duration-200 hover:scale-110', value.accent === accent ? 'border-foreground' : 'border-transparent')}
                  style={{ background: `hsl(${accents[accent].light})` }}>
                  {value.accent === accent && <Check className="h-4 w-4 text-white" />}
                </button>
              ))}
            </div>
            <Toggle title={t('appearance.accentButtons')} description={t('appearance.accentButtonsDesc')} checked={value.accentButtons} onChange={(accentButtons) => set({ accentButtons })} />
          </Section>

          <Section title={t('appearance.radius')} description={t('appearance.radiusDesc')}>
            <div className="flex max-w-md items-center gap-4">
              <input type="range" min={0} max={20} step={1} value={value.radius} onChange={(event) => set({ radius: Number(event.target.value) })}
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
          <div className="rounded-xl border bg-card p-4">
            <p className="font-medium">Kickoff</p>
            <p className="mt-1 text-sm text-muted-foreground">Ziele, Scope und Verantwortlichkeiten klären.</p>
            <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-muted"><div className="h-full w-2/3 rounded-full bg-brand" /></div>
          </div>
        </CardContent>
      </Card>
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
    <div className="inline-flex gap-1 rounded-lg bg-muted p-1" role="radiogroup" aria-label={label}>
      {options.map((option) => (
        <button key={option.value} type="button" role="radio" aria-checked={value === option.value} onClick={() => onChange(option.value)}
          className={cn('rounded-md px-4 py-1.5 text-sm font-medium transition-all', value === option.value ? 'bg-background shadow-sm' : 'text-muted-foreground hover:text-foreground')}>
          {option.label}
        </button>
      ))}
    </div>
  );
}
