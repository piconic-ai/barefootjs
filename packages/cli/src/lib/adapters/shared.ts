// Files reused by every adapter scaffold: the starter Counter component,
// the design-token CSS variables, the entry stylesheet, and the UnoCSS
// config the registry components depend on.

// Sentinel lines wrapping the stylesheet `<link>` block (plus its
// explanatory comment) in every adapter's <head> markup. `processCssHead`
// (lib/css.ts) rewrites these at scaffold time: under `--css unocss` the
// marker lines are dropped but the links stay; under `--css none` the
// whole region — comment, links, and markers — is removed so the bare
// scaffold ships a <head> with no stylesheet references at all. The
// tokens are deliberately not valid JSX/HTML: they only ever exist inside
// the adapter template strings and are always stripped before a file is
// written, so they never reach disk or a compiler.
export const CSS_LINKS_BEGIN = '@@BF_CSS_LINKS_BEGIN@@'
export const CSS_LINKS_END = '@@BF_CSS_LINKS_END@@'

// Starter Counter (Hono / CSR): uses the registry-fetched <Button> from
// `components/ui/button/`. `bf init` adds it via `addFromRegistry`
// during scaffolding, so the file is on disk before the user runs
// `bun install` — no manual `bf add button` step is required.
export const SHARED_COUNTER_TSX = `'use client'

import { createSignal, createMemo } from '@barefootjs/client'
import { Button } from '@/components/ui/button'

interface CounterProps {
  initial?: number
}

export function Counter(props: CounterProps) {
  const [count, setCount] = createSignal(props.initial ?? 0)
  const doubled = createMemo(() => count() * 2)

  return (
    <div className="counter">
      <p className="counter-value">count: {count()}</p>
      <p className="counter-doubled">doubled: {doubled()}</p>
      <div className="counter-buttons">
        <Button onClick={() => setCount(n => n + 1)}>+1</Button>
        <Button onClick={() => setCount(n => n - 1)} variant="secondary">-1</Button>
        <Button onClick={() => setCount(0)} variant="ghost">Reset</Button>
      </div>
    </div>
  )
}
`

// Starter IR test paired with SHARED_COUNTER_TSX. Pinned to the same
// assertions \`bf gen test Counter\` would emit against that source, so
// the scaffold ships a green \`<pm> test\` out of the box and doubles as
// a worked example of the IR-test pattern the docs steer users toward.
// Kept as a static template (rather than re-deriving via
// generateTestTemplate at scaffold time) so the test content is part
// of the same review surface as SHARED_COUNTER_TSX — if one changes,
// the other has to be updated in the same commit. The
// \`{{__TEST_RUNNER_IMPORT__}}\` slot is filled by init.ts with the
// detected PM's runner (\`bun:test\` for bun, \`vitest\` everywhere
// else); same slot mechanism as \`{{__PROJECT_NAME__}}\` and
// \`{{__PM_TYPES_ENTRY__}}\`.
export const SHARED_COUNTER_TEST_TSX = `import { describe, test, expect } from '{{__TEST_RUNNER_IMPORT__}}'
import { readFileSync } from 'fs'
import { resolve } from 'path'
import { renderToTest } from '@barefootjs/test'

const CounterSource = readFileSync(resolve(__dirname, 'Counter.tsx'), 'utf-8')

describe('Counter', () => {
  const result = renderToTest(CounterSource, 'Counter.tsx')

  test('has no compiler errors', () => {
    expect(result.errors).toEqual([])
  })

  test('componentName is Counter', () => {
    expect(result.componentName).toBe('Counter')
  })

  test('has expected signals', () => {
    expect(result.signals).toContain('count')
  })

  test('renders as <div>', () => {
    expect(result.root.tag).toBe('div')
  })

  test('has event handlers', () => {
    const all = result.findAll({})
    expect(
      all.some(n => n.events.includes('click') || n.props['onClick'] != null),
    ).toBe(true)
  })

  test('contains child components', () => {
    expect(result.find({ componentName: 'Button' })).not.toBeNull()
  })

  test('toStructure() shows expected tree', () => {
    const structure = result.toStructure()
    expect(structure.length).toBeGreaterThan(0)
    expect(structure).toContain('div')
  })
})
`

// Bare starter Counter for `--css none`: same reactive shape as
// SHARED_COUNTER_TSX but with no dependency on the registry <Button> (and
// therefore no UnoCSS utility classes). Native <button> elements keep the
// "bring your own CSS" scaffold self-contained — nothing is fetched from
// the UI registry, and the app builds and hydrates with zero stylesheets.
// The `counter*` classNames are left as plain hooks the user can target
// once they add their own CSS.
export const SHARED_COUNTER_BARE_TSX = `'use client'

import { createSignal, createMemo } from '@barefootjs/client'

interface CounterProps {
  initial?: number
}

export function Counter(props: CounterProps) {
  const [count, setCount] = createSignal(props.initial ?? 0)
  const doubled = createMemo(() => count() * 2)

  return (
    <div className="counter">
      <p className="counter-value">count: {count()}</p>
      <p className="counter-doubled">doubled: {doubled()}</p>
      <div className="counter-buttons">
        <button type="button" onClick={() => setCount(n => n + 1)}>+1</button>
        <button type="button" onClick={() => setCount(n => n - 1)}>-1</button>
        <button type="button" onClick={() => setCount(0)}>Reset</button>
      </div>
    </div>
  )
}
`

// Starter IR test paired with SHARED_COUNTER_BARE_TSX. Mirrors
// SHARED_COUNTER_TEST_TSX but drops the "contains child components"
// assertion — the bare Counter renders native <button> elements rather
// than the registry <Button>, so there is no child component to find.
export const SHARED_COUNTER_BARE_TEST_TSX = `import { describe, test, expect } from '{{__TEST_RUNNER_IMPORT__}}'
import { readFileSync } from 'fs'
import { resolve } from 'path'
import { renderToTest } from '@barefootjs/test'

const CounterSource = readFileSync(resolve(__dirname, 'Counter.tsx'), 'utf-8')

describe('Counter', () => {
  const result = renderToTest(CounterSource, 'Counter.tsx')

  test('has no compiler errors', () => {
    expect(result.errors).toEqual([])
  })

  test('componentName is Counter', () => {
    expect(result.componentName).toBe('Counter')
  })

  test('has expected signals', () => {
    expect(result.signals).toContain('count')
  })

  test('renders as <div>', () => {
    expect(result.root.tag).toBe('div')
  })

  test('has event handlers', () => {
    const all = result.findAll({})
    expect(
      all.some(n => n.events.includes('click') || n.props['onClick'] != null),
    ).toBe(true)
  })

  test('toStructure() shows expected tree', () => {
    const structure = result.toStructure()
    expect(structure.length).toBeGreaterThan(0)
    expect(structure).toContain('div')
  })
})
`

// Theme tokens (CSS variables) referenced by the registry components'
// utility classes (`bg-primary`, `text-foreground`, etc.). Mirrors
// integrations/shared/styles/tokens.css so registry components ship
// looking the same as the official examples.
export const TOKENS_CSS = `:root {
  /* ── Typography ──────────────────────────────────────── */
  --font-sans: -apple-system, BlinkMacSystemFont, "Segoe UI", "Noto Sans", Helvetica, Arial, sans-serif;
  --font-mono: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace;
  --tracking-tighter: -0.05em;
  --tracking-tight: -0.025em;
  --tracking-normal: 0;
  --tracking-wide: 0.025em;
  --tracking-wider: 0.05em;

  /* ── Spacing & sizing ────────────────────────────────── */
  --spacing: 0.25rem;
  --header-height: 52px;

  /* ── Border radius ───────────────────────────────────── */
  --radius: 0.625rem;
  --radius-sm: calc(var(--radius) * 0.6);
  --radius-md: calc(var(--radius) * 0.8);
  --radius-lg: var(--radius);
  --radius-xl: calc(var(--radius) * 1.4);

  /* ── Transitions ─────────────────────────────────────── */
  --duration-fast: 0.15s;
  --duration-normal: 0.25s;

  /* ── Colors (OKLCH, neutral theme) ─────────────── */
  --background: oklch(1 0 0);
  --foreground: oklch(0.145 0 0);
  --card: oklch(1 0 0);
  --card-foreground: oklch(0.145 0 0);
  --popover: oklch(1 0 0);
  --popover-foreground: oklch(0.145 0 0);
  --primary: oklch(0.205 0 0);
  --primary-foreground: oklch(0.985 0 0);
  --secondary: oklch(0.97 0 0);
  --secondary-foreground: oklch(0.205 0 0);
  --muted: oklch(0.97 0 0);
  --muted-foreground: oklch(0.556 0 0);
  --accent: oklch(0.97 0 0);
  --accent-foreground: oklch(0.205 0 0);
  --destructive: oklch(0.577 0.245 27.325);
  --destructive-foreground: oklch(0.985 0 0);
  --border: oklch(0.96 0 0);
  --input: oklch(0.96 0 0);
  --ring: oklch(0.708 0 0);

  /* ── Shadows ─────────────────────────────────────────── */
  --shadow-sm: 0 1px 2px 0 rgb(0 0 0 / 0.05);
  --shadow: 0 1px 3px 0 rgb(0 0 0 / 0.1), 0 1px 2px -1px rgb(0 0 0 / 0.1);
  --shadow-md: 0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1);
  --shadow-lg: 0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1);
}

.dark {
  --background: oklch(0.145 0 0);
  --foreground: oklch(0.985 0 0);
  --card: oklch(0.205 0 0);
  --card-foreground: oklch(0.985 0 0);
  --primary: oklch(0.35 0 0);
  --primary-foreground: oklch(0.985 0 0);
  --secondary: oklch(0.269 0 0);
  --secondary-foreground: oklch(0.985 0 0);
  --muted: oklch(0.269 0 0);
  --muted-foreground: oklch(0.708 0 0);
  --accent: oklch(0.269 0 0);
  --accent-foreground: oklch(0.985 0 0);
  --destructive: oklch(0.704 0.191 22.216);
  --destructive-foreground: oklch(0.985 0 0);
  --border: oklch(1 0 0 / 10%);
  --input: oklch(1 0 0 / 15%);
  --ring: oklch(0.556 0 0);
}
`

// Entry stylesheet the page links to. Imports tokens.css for theme
// variables, then uno.css for the UnoCSS-generated utility classes,
// then defines registry-component styles inside `@layer components`
// so consumer utility classes (default UnoCSS layer) win on overlap.
// No `@import url(...)` here. CSS @import is chained: the browser
// only discovers tokens.css / uno.css *after* parsing styles.css,
// which produces a visible flash of unstyled content while the
// extra round-trip is in flight. Each adapter's HTML layout
// instead links tokens.css / styles.css / uno.css directly so all
// three are fetched in parallel.
export const STYLES_CSS = `html, body {
  margin: 0;
  padding: 0;
  font-family: var(--font-sans);
  background: var(--background);
  color: var(--foreground);
}

main {
  display: grid;
  place-items: center;
  min-height: 100vh;
  padding: 2rem;
  text-align: center;
}

.counter {
  padding: 1.5rem;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--card);
}

.counter-value {
  font-size: 2rem;
  font-weight: 600;
  margin: 0;
}

.counter-doubled {
  margin: 0.25rem 0 1rem;
  opacity: 0.7;
}

.counter-buttons {
  display: flex;
  gap: 0.5rem;
  justify-content: center;
}
`

// Empty placeholder so /static/uno.css resolves on the very first page
// load before \`unocss --watch\` has had a chance to write its first
// output. The watcher will overwrite this file on the first scan.
export const UNO_CSS_PLACEHOLDER = `/* generated by unocss --watch */
`

// Scaffold favicon — a minimal, neutral "footprint" mark (a heel + four
// toes) inside a rounded square, in plain hex colors (no `currentColor`,
// since a favicon renders outside any page's CSS cascade). Shipped by
// every adapter so the very first \`npm run dev\` doesn't show a 404 for
// \`/favicon.ico\` in the console (issue #2124). Plain colors (not
// theme-token \`var(--...)\` references) because tokens.css isn't
// guaranteed to have loaded — or to exist at all under \`--css none\` —
// by the time the browser requests the icon.
export const FAVICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">
  <rect width="32" height="32" rx="7" fill="#1c1917"/>
  <ellipse cx="16" cy="20.5" rx="6" ry="7" fill="#fafaf9"/>
  <circle cx="9" cy="10" r="2.6" fill="#fafaf9"/>
  <circle cx="14.5" cy="7.2" r="2.8" fill="#fafaf9"/>
  <circle cx="20.5" cy="7.2" r="2.8" fill="#fafaf9"/>
  <circle cx="25" cy="10.5" r="2.4" fill="#fafaf9"/>
</svg>
`

// `<link>` tag every adapter's <head> template embeds. Deliberately
// placed OUTSIDE the CSS_LINKS_BEGIN/END marker region in every
// template: that region is stripped wholesale by processCssHead under
// \`--css none\` (lib/css.ts), and the favicon must still resolve on the
// bare (no-UnoCSS) scaffold. \`favicon.svg\` itself is written directly
// into each adapter's static dir (not gated by the UnoCSS-only-files
// set in init.ts's scaffoldApp), so it survives both CSS paths.
// Self-closing (`/>`) so the same tag is valid both as JSX (Hono's
// renderer.tsx — a bare \`<link>\` is a JSX syntax error) and as plain
// HTML/Go-template/Perl-heredoc markup (where the trailing slash on a
// void element is legal HTML5 and simply ignored).
export const FAVICON_LINK_TAG = '<link rel="icon" type="image/svg+xml" href="__FAVICON_HREF__" />'

/**
 * Render the favicon `<link>` tag for a given href (adapters serve
 * `favicon.svg` from different URL prefixes depending on how they
 * mount their static dir — see each adapter's own comment).
 */
export function faviconLinkTag(href: string): string {
  return FAVICON_LINK_TAG.replace('__FAVICON_HREF__', href)
}

// UnoCSS config tuned for the registry's design tokens. Adapters that
// don't need the renderer.tsx scan patterns can override `cli.entry`
// with their own glob.
export function unoConfigTs(scanGlobs: string[]): string {
  const formatted = scanGlobs.map(g => `'${g}'`).join(', ')
  return `import { defineConfig, presetWind4 } from 'unocss'

// Mirrors site/ui/uno.config.ts — keeps the registry components looking
// the way they do in the docs site. Theme colors point at the CSS
// variables defined in tokens.css so a \`.dark\` class on <html> flips
// the whole palette without re-running UnoCSS.
export default defineConfig({
  presets: [presetWind4()],
  preflights: [{
    getCSS: () => '*, ::before, ::after { border-color: var(--border); }',
    layer: 'base',
  }],
  outputToCssLayers: true,
  layers: {
    preflights: -2,
    components: -1,
    default: 0,
  },
  theme: {
    colors: {
      background: 'var(--background)',
      foreground: 'var(--foreground)',
      card: { DEFAULT: 'var(--card)', foreground: 'var(--card-foreground)' },
      popover: { DEFAULT: 'var(--popover)', foreground: 'var(--popover-foreground)' },
      primary: { DEFAULT: 'var(--primary)', foreground: 'var(--primary-foreground)' },
      secondary: { DEFAULT: 'var(--secondary)', foreground: 'var(--secondary-foreground)' },
      muted: { DEFAULT: 'var(--muted)', foreground: 'var(--muted-foreground)' },
      accent: { DEFAULT: 'var(--accent)', foreground: 'var(--accent-foreground)' },
      destructive: { DEFAULT: 'var(--destructive)', foreground: 'var(--destructive-foreground)' },
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
    },
    font: {
      sans: 'var(--font-sans)',
      mono: 'var(--font-mono)',
    },
  },
  content: {
    filesystem: [${formatted}],
  },
  // The unocss CLI doesn't read content.filesystem, so duplicate the
  // patterns here for \`unocss\` / \`unocss --watch\` invocations.
  cli: {
    entry: {
      patterns: [${formatted}],
      outFile: 'public/uno.css',
    },
  },
})
`
}

// Empty manifest seed so the static \`import manifest from
// './dist/components/manifest.json'\` in renderer.tsx resolves on the
// very first server boot, before \`bf build\` has run.
export const COMPONENTS_MANIFEST_SEED = '{}\n'

// UnoCSS shared dev/runtime deps (every adapter pulls UnoCSS for now).
export const UNOCSS_DEV_DEPENDENCIES = {
  '@unocss/cli': '^66.0.0',
  '@unocss/preset-wind4': '^66.0.0',
  unocss: '^66.0.0',
}

// Cross-adapter `.gitignore` lines — entries that apply regardless of
// which backend the user picked at scaffold time. Adapters concat their
// outDir-specific / runtime-specific entries onto this base via
// `buildGitignore`.
const SHARED_GITIGNORE_LINES = [
  '# Dependencies',
  'node_modules/',
  '',
  '# UnoCSS output (regenerated by `unocss --watch` / `unocss`)',
  'public/uno.css',
  '',
  '# Logs',
  '*.log',
  'npm-debug.log*',
  'yarn-debug.log*',
  'yarn-error.log*',
  '',
  '# OS / editor',
  '.DS_Store',
  '.idea/',
  '.vscode/',
  '*.swp',
] as const

// Compose a per-adapter `.gitignore` from the shared base + each
// adapter's own section(s). Each `section` becomes its own paragraph
// (blank line separator) so the rendered file stays readable. The
// adapter is the right home for which paths are generated vs.
// hand-written — only the adapter knows its own `outDir`, dev-server
// scratch directories, and language-specific scratch files.
export function buildGitignore(sections: Array<{ heading: string; entries: string[] }>): string {
  const lines: string[] = []
  for (const section of sections) {
    lines.push(`# ${section.heading}`)
    for (const entry of section.entries) lines.push(entry)
    lines.push('')
  }
  lines.push(...SHARED_GITIGNORE_LINES)
  return lines.join('\n') + '\n'
}
