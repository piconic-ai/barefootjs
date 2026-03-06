import { defineConfig, presetWind } from 'unocss'

export default defineConfig({
  presets: [presetWind()],
  // Wrap UnoCSS output in CSS @layer blocks for cascade ordering.
  // Order: preflights < base < shortcuts < components < default
  // Base resets (globals.css) go into @layer base.
  // Component base classes (layer-components:) override base resets,
  // and user override classes (default) beat component classes.
  outputToCssLayers: true,
  layers: {
    preflights: -2,
    components: -1,
    default: 0,
  },
  // Safelist responsive classes used in dynamic contexts
  safelist: [
    'hidden', 'sm:block', 'sm:hidden', 'lg:block', 'sm:pl-56',
    'border-input', 'border-border',
    'border-destructive', 'ring-destructive/20',
    'group/card', 'group-hover/card:opacity-100',
  ],
  // Theme configuration with CSS variable references (OKLCH colors)
  theme: {
    colors: {
      background: 'var(--background)',
      foreground: 'var(--foreground)',
      card: {
        DEFAULT: 'var(--card)',
        foreground: 'var(--card-foreground)',
      },
      popover: {
        DEFAULT: 'var(--popover)',
        foreground: 'var(--popover-foreground)',
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
      success: {
        DEFAULT: 'var(--success)',
        foreground: 'var(--success-foreground)',
      },
      warning: {
        DEFAULT: 'var(--warning)',
        foreground: 'var(--warning-foreground)',
      },
      info: {
        DEFAULT: 'var(--info)',
        foreground: 'var(--info-foreground)',
      },
      border: 'var(--border)',
      input: 'var(--input)',
      ring: 'var(--ring)',
    },
    borderRadius: {
      lg: 'var(--radius)',
      md: 'calc(var(--radius) - 2px)',
      sm: 'calc(var(--radius) - 4px)',
    },
    // Shadow scale - Use 'shadow-*' utilities
    boxShadow: {
      sm: 'var(--shadow-sm)',
      DEFAULT: 'var(--shadow)',
      md: 'var(--shadow-md)',
      lg: 'var(--shadow-lg)',
      xl: 'var(--shadow-xl)',
      inner: 'var(--shadow-inner)',
      none: 'none',
    },
    // Typography - Use 'font-*' utilities
    fontFamily: {
      sans: 'var(--font-sans)',
      mono: 'var(--font-mono)',
    },
    // Letter spacing - Use 'tracking-*' utilities
    letterSpacing: {
      tighter: 'var(--tracking-tighter)',
      tight: 'var(--tracking-tight)',
      normal: 'var(--tracking-normal)',
      wide: 'var(--tracking-wide)',
      wider: 'var(--tracking-wider)',
    },
    // Animation tokens - Use 'duration' for duration-* utilities
    duration: {
      fast: 'var(--duration-fast)',
      normal: 'var(--duration-normal)',
      slow: 'var(--duration-slow)',
    },
    // Use 'easing' for ease-* utilities
    easing: {
      DEFAULT: 'var(--ease-default)',
      in: 'var(--ease-in)',
      out: 'var(--ease-out)',
      'in-out': 'var(--ease-in-out)',
    },
  },
  // Scan component files for class names
  content: {
    filesystem: [
      './*.tsx',
      './**/index.tsx',
      './pages/**/*.tsx',
      '../../ui/components/**/*.tsx',
      '../shared/components/**/*.tsx',
      './components/**/*.tsx',
      './dist/**/*.tsx',
    ],
  },
})
