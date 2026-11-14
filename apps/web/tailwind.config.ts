import type { Config } from 'tailwindcss';
import typography from '@tailwindcss/typography';
import animate from 'tailwindcss-animate';

/**
 * Minimal design system: every color is an HSL triplet plus its own base alpha (`--name-a`),
 * so the white-based glass tokens (e.g. card = white at 14 %) still work with Tailwind's
 * opacity modifiers (`bg-card/60` → 60 % of the token's own alpha).
 */
const token = (name: string) => `hsl(var(--${name}) / calc(var(--${name}-a, 1) * <alpha-value>))`;

const config: Config = {
  darkMode: ['class'],
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}', './lib/**/*.{ts,tsx}'],
  theme: {
    container: { center: true, padding: '2rem', screens: { '2xl': '1400px' } },
    extend: {
      colors: {
        border: token('border'),
        input: token('input'),
        ring: token('ring'),
        background: token('background'),
        foreground: token('foreground'),
        primary: { DEFAULT: token('primary'), foreground: token('primary-foreground') },
        secondary: { DEFAULT: token('secondary'), foreground: token('secondary-foreground') },
        destructive: { DEFAULT: token('destructive'), foreground: token('destructive-foreground') },
        muted: { DEFAULT: token('muted'), foreground: token('muted-foreground') },
        accent: { DEFAULT: token('accent'), foreground: token('accent-foreground') },
        popover: { DEFAULT: token('popover'), foreground: token('popover-foreground') },
        card: { DEFAULT: token('card'), foreground: token('card-foreground') },
        field: { DEFAULT: token('field'), hover: token('field-hover') },
        glass: { DEFAULT: token('glass'), hover: token('glass-hover') },
        seg: token('seg'),
        surface: token('surface'),
        success: token('success'),
        warning: token('warning'),
        info: token('info'),
        brand: token('brand'),
      },
      fontFamily: {
        sans: ['var(--font-sans)', 'Inter', 'system-ui', 'sans-serif'],
        mono: ['var(--font-mono)', '"JetBrains Mono"', 'ui-monospace', 'monospace'],
      },
      fontWeight: {
        book: '450',
      },
      // Radius scale of the design system: 10 · 12 · 15 · 18 · 22 · full (base = --radius, 15 px).
      borderRadius: {
        sm: 'calc(var(--radius) - 5px)',
        md: 'calc(var(--radius) - 3px)',
        lg: 'var(--radius)',
        xl: 'calc(var(--radius) + 3px)',
        '2xl': 'calc(var(--radius) + 7px)',
      },
      // No borders, depth only through the glass sheen.
      boxShadow: {
        sm: 'var(--sheen)',
        DEFAULT: 'var(--sheen)',
        md: 'var(--sheen-hover)',
        lg: 'var(--sheen), var(--lift)',
        xl: 'var(--sheen), var(--float)',
        '2xl': 'var(--sheen), var(--float-lg)',
      },
      backdropBlur: {
        glass: '24px',
        surface: '28px',
      },
      transitionDuration: {
        350: '350ms',
        600: '600ms',
      },
      transitionTimingFunction: {
        ds: 'cubic-bezier(.16, 1, .3, 1)',
      },
      keyframes: {
        'accordion-down': { from: { height: '0' }, to: { height: 'var(--radix-accordion-content-height)' } },
        'accordion-up': { from: { height: 'var(--radix-accordion-content-height)' }, to: { height: '0' } },
      },
      animation: {
        'accordion-down': 'accordion-down 0.2s ease-out',
        'accordion-up': 'accordion-up 0.2s ease-out',
      },
    },
  },
  plugins: [animate, typography],
};

export default config;
