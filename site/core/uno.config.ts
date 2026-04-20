import { defineConfig, presetWind4 } from 'unocss'

export default defineConfig({
  presets: [presetWind4()],
  // Custom preflight: re-apply border-color after preset-wind4's reset preflight.
  // preset-wind4 uses `border: 0 solid` which implicitly sets border-color to
  // currentColor. This preflight runs after the reset (same @layer base, later
  // source order) so var(--border) wins.
  preflights: [{
    getCSS: () => '*, ::before, ::after { border-color: var(--border); }',
    layer: 'base',
  }],
  // Wrap UnoCSS output in CSS @layer blocks for cascade ordering.
  // Order: preflights < base < shortcuts < components < default
  outputToCssLayers: true,
  layers: {
    preflights: -2,
    components: -1,
    default: 0,
  },
  safelist: [
    'hidden', 'sm:block', 'sm:hidden', 'lg:block',
    'border-input',
  ],
  theme: {
    colors: {
      background: 'var(--background)',
      foreground: 'var(--foreground)',
      card: {
        DEFAULT: 'var(--card)',
        foreground: 'var(--card-foreground)',
      },
      primary: {
        DEFAULT: 'var(--primary)',
        foreground: 'var(--primary-foreground)',
      },
      secondary: {
        DEFAULT: 'var(--secondary)',
        foreground: 'var(--secondary-foreground)',
      },
      muted: {
        DEFAULT: 'var(--muted)',
        foreground: 'var(--muted-foreground)',
      },
      accent: {
        DEFAULT: 'var(--accent)',
        foreground: 'var(--accent-foreground)',
      },
      destructive: {
        DEFAULT: 'var(--destructive)',
        foreground: 'var(--destructive-foreground)',
      },
      border: 'var(--border)',
      input: 'var(--input)',
      ring: 'var(--ring)',
    },
    radius: {
      lg: 'var(--radius)',
      md: 'calc(var(--radius) - 2px)',
      sm: 'calc(var(--radius) - 4px)',
    },
    shadow: {
      sm: 'var(--shadow-sm)',
      DEFAULT: 'var(--shadow)',
      md: 'var(--shadow-md)',
      lg: 'var(--shadow-lg)',
      xl: 'var(--shadow-xl)',
      inner: 'var(--shadow-inner)',
      none: 'none',
    },
    font: {
      sans: 'var(--font-sans)',
      mono: 'var(--font-mono)',
    },
    tracking: {
      tighter: 'var(--tracking-tighter)',
      tight: 'var(--tracking-tight)',
      normal: 'var(--tracking-normal)',
      wide: 'var(--tracking-wide)',
      wider: 'var(--tracking-wider)',
    },
    duration: {
      fast: 'var(--duration-fast)',
      normal: 'var(--duration-normal)',
      slow: 'var(--duration-slow)',
    },
  },
  content: {
    filesystem: [
      './renderer.tsx',
      './landing/**/*.tsx',
      './integrations/**/*.tsx',
      './components/**/*.tsx',
      '../shared/components/**/*.tsx',
      './dist/**/*.tsx',
    ],
  },
})
