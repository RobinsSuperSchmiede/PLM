/** Per-browser design preferences (accent color, corner radius, density, surfaces, motion). */

export const accents = {
  /** Design-system default: no color, the accent follows the text color (dark in light mode, white in dark mode). */
  mono: { light: '240 4% 4.5%', dark: '0 0% 100%' },
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
  /** How strongly the wallpaper is washed towards the page color (0–80 %), for legibility. */
  wallpaperDim: number;
};

export const defaultAppearance: Appearance = {
  accent: 'mono',
  radius: 15,
  density: 'comfortable',
  surface: 'layered',
  accentButtons: false,
  reduceMotion: false,
  wallpaperDim: 25,
};

export const appearanceStorageKey = 'anamnesies.appearance';
/** The wallpaper image (a compressed JPEG data URL) lives in its own key so the settings stay small. */
export const wallpaperStorageKey = 'anamnesies.wallpaper';

export function applyAppearance(value: Appearance) {
  const root = document.documentElement;
  const accent = accents[value.accent] ?? accents.mono;
  root.style.setProperty('--brand-l', accent.light);
  root.style.setProperty('--brand-d', accent.dark);
  root.style.setProperty('--radius', `${value.radius}px`);
  root.dataset.accent = value.accent in accents ? value.accent : 'mono';
  root.dataset.density = value.density;
  root.dataset.surface = value.surface;
  root.dataset.accentButtons = String(value.accentButtons);
  root.dataset.motion = value.reduceMotion ? 'reduced' : 'full';
  root.style.setProperty('--wallpaper-dim', String((value.wallpaperDim ?? 0) / 100));
}

export function applyWallpaper(dataUrl: string | null) {
  const root = document.documentElement;
  if (dataUrl) {
    root.style.setProperty('--wallpaper', `url("${dataUrl}")`);
    root.dataset.wallpaper = 'on';
  } else {
    root.style.removeProperty('--wallpaper');
    delete root.dataset.wallpaper;
  }
}

export function loadWallpaper(): string | null {
  try {
    return window.localStorage.getItem(wallpaperStorageKey);
  } catch {
    return null;
  }
}

/** Stores (or removes) the wallpaper; throws when the browser storage is full. */
export function saveWallpaper(dataUrl: string | null) {
  if (dataUrl) window.localStorage.setItem(wallpaperStorageKey, dataUrl);
  else window.localStorage.removeItem(wallpaperStorageKey);
  applyWallpaper(dataUrl);
}

/** Scales an uploaded image down (longest edge 2400 px) and re-encodes it as JPEG to fit into local storage. */
export async function compressWallpaper(file: File, maxEdge = 2400, quality = 0.82): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Canvas not available');
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return canvas.toDataURL('image/jpeg', quality);
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
export const appearanceBootScript = `(function(){try{var a=${JSON.stringify(accents)};var v=JSON.parse(localStorage.getItem('${appearanceStorageKey}')||'{}');var r=document.documentElement;var k=a[v.accent]?v.accent:'mono';var c=a[k];r.dataset.accent=k;r.style.setProperty('--brand-l',c.light);r.style.setProperty('--brand-d',c.dark);if(typeof v.radius==='number')r.style.setProperty('--radius',v.radius+'px');r.dataset.density=v.density||'comfortable';r.dataset.surface=v.surface||'layered';r.dataset.accentButtons=String(!!v.accentButtons);r.dataset.motion=v.reduceMotion?'reduced':'full';r.style.setProperty('--wallpaper-dim',String((typeof v.wallpaperDim==='number'?v.wallpaperDim:25)/100));var w=localStorage.getItem('${wallpaperStorageKey}');if(w){r.style.setProperty('--wallpaper','url("'+w+'")');r.dataset.wallpaper='on';}}catch(e){}})();`;

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
