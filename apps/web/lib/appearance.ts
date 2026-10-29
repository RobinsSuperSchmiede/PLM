/** Per-browser design preferences (accent color, corner radius, density, surfaces, motion). */

export const accents = {
  violet: { light: '262 75% 55%', dark: '262 90% 72%' },
  blue: { light: '217 91% 52%', dark: '213 94% 66%' },
  green: { light: '152 65% 34%', dark: '152 62% 52%' },
  teal: { light: '183 75% 32%', dark: '178 70% 50%' },
  rose: { light: '346 77% 50%', dark: '346 85% 66%' },
  orange: { light: '24 90% 48%', dark: '27 96% 61%' },
  graphite: { light: '240 6% 30%', dark: '240 5% 80%' },
} as const;

export type Accent = keyof typeof accents;
export type Density = 'compact' | 'comfortable';
export type Surface = 'layered' | 'flat';

export type Appearance = {
  accent: Accent;
  /** Base corner radius in px (0 = square). */
  radius: number;
  density: Density;
  surface: Surface;
  accentButtons: boolean;
  reduceMotion: boolean;
};

export const defaultAppearance: Appearance = {
  accent: 'violet',
  radius: 10,
  density: 'comfortable',
  surface: 'layered',
  accentButtons: false,
  reduceMotion: false,
};

export const appearanceStorageKey = 'anamnesies.appearance';

export function applyAppearance(value: Appearance) {
  const root = document.documentElement;
  const accent = accents[value.accent] ?? accents.violet;
  root.style.setProperty('--brand-l', accent.light);
  root.style.setProperty('--brand-d', accent.dark);
  root.style.setProperty('--radius', `${value.radius / 16}rem`);
  root.dataset.density = value.density;
  root.dataset.surface = value.surface;
  root.dataset.accentButtons = String(value.accentButtons);
  root.dataset.motion = value.reduceMotion ? 'reduced' : 'full';
}

export function loadAppearance(): Appearance {
  try {
    const stored = window.localStorage.getItem(appearanceStorageKey);
    return stored ? { ...defaultAppearance, ...(JSON.parse(stored) as Partial<Appearance>) } : defaultAppearance;
  } catch {
    return defaultAppearance;
  }
}

export function saveAppearance(value: Appearance) {
  try {
    window.localStorage.setItem(appearanceStorageKey, JSON.stringify(value));
  } catch { /* storage unavailable */ }
  applyAppearance(value);
}

/** Runs before the first paint (inline in <head>) so the saved look shows without flicker. */
export const appearanceBootScript = `(function(){try{var a=${JSON.stringify(accents)};var v=JSON.parse(localStorage.getItem('${appearanceStorageKey}')||'{}');var r=document.documentElement;var c=a[v.accent]||a.violet;r.style.setProperty('--brand-l',c.light);r.style.setProperty('--brand-d',c.dark);if(typeof v.radius==='number')r.style.setProperty('--radius',v.radius/16+'rem');r.dataset.density=v.density||'comfortable';r.dataset.surface=v.surface||'layered';r.dataset.accentButtons=String(!!v.accentButtons);r.dataset.motion=v.reduceMotion?'reduced':'full';}catch(e){}})();`;

/** Stable, pleasant color for a tag (or category) name: hue from a string hash. */
export function hueOf(name: string): number {
  let hash = 0;
  for (const char of name) hash = (hash * 31 + char.charCodeAt(0)) | 0;
  return Math.abs(hash) % 360;
}

export function tagStyle(name: string): React.CSSProperties {
  const hue = hueOf(name);
  return {
    backgroundColor: `hsl(${hue} 70% 50% / 0.12)`,
    borderColor: `hsl(${hue} 70% 50% / 0.28)`,
    color: `hsl(${hue} 65% var(--tag-l, 40%))`,
  };
}

export function colorOf(name: string, alpha = 1): string {
  return `hsl(${hueOf(name)} 70% 55% / ${alpha})`;
}
