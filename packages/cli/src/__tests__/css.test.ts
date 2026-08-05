// Unit coverage for the `--css none` scaffold transforms (lib/css.ts).
// These run the pure string rewrites against the real adapter markup and
// script shapes so a future edit to either side surfaces here, not in a
// broken scaffold.

import { describe, test, expect } from 'bun:test'
import { processCssHead, stripUnocssFromScript, stripUnoGitignore } from '../lib/css'
import { ADAPTERS } from '../lib/templates'
import { CSS_LINKS_BEGIN, CSS_LINKS_END } from '../lib/adapters/shared'

// Adapter id → the scaffold file that carries the <head> stylesheet block.
// Mirrors the CSS-link contract cases in templates.test.ts.
const HEAD_FILES: Array<[string, string]> = [
  ['hono', 'renderer.tsx'],
  ['hono-node', 'renderer.tsx'],
  ['echo', 'renderer.go'],
  ['gin', 'renderer.go'],
  ['chi', 'renderer.go'],
  ['nethttp', 'renderer.go'],
  ['mojo', 'app.pl'],
  ['xslate', 'app.psgi'],
  ['csr', 'pages/index.html'],
]

describe('processCssHead', () => {
  test('every head-bearing adapter file carries the marker pair', () => {
    for (const [id, file] of HEAD_FILES) {
      const contents = ADAPTERS[id].files[file]
      expect(contents, `${id}/${file} missing`).toBeTruthy()
      expect(contents, `${id}/${file} missing begin marker`).toContain(CSS_LINKS_BEGIN)
      expect(contents, `${id}/${file} missing end marker`).toContain(CSS_LINKS_END)
    }
  })

  test('unocss path keeps the links but drops the marker lines', () => {
    for (const [id, file] of HEAD_FILES) {
      const out = processCssHead(ADAPTERS[id].files[file], true)
      expect(out, `${id}/${file} leaked begin marker`).not.toContain(CSS_LINKS_BEGIN)
      expect(out, `${id}/${file} leaked end marker`).not.toContain(CSS_LINKS_END)
      expect(out, `${id}/${file} lost uno.css link`).toContain('uno.css')
      expect(out, `${id}/${file} lost tokens.css link`).toContain('tokens.css')
    }
  })

  test('none path removes the whole stylesheet region', () => {
    for (const [id, file] of HEAD_FILES) {
      const out = processCssHead(ADAPTERS[id].files[file], false)
      expect(out, `${id}/${file} leaked begin marker`).not.toContain(CSS_LINKS_BEGIN)
      expect(out, `${id}/${file} leaked end marker`).not.toContain(CSS_LINKS_END)
      expect(out, `${id}/${file} kept uno.css`).not.toContain('uno.css')
      expect(out, `${id}/${file} kept tokens.css`).not.toContain('tokens.css')
      expect(out, `${id}/${file} kept styles.css`).not.toContain('styles.css')
      // Surrounding markup survives — only the marked region is gone.
      expect(out, `${id}/${file} dropped </head>`).toMatch(/<\/head>/)
    }
  })

  test('content without markers passes through untouched', () => {
    const plain = 'export const x = 1\n'
    expect(processCssHead(plain, false)).toBe(plain)
    expect(processCssHead(plain, true)).toBe(plain)
  })
})

describe('stripUnocssFromScript', () => {
  // The exact `build` / `deploy` / `start` script strings the adapters emit
  // today (`&&`-chain stripping only — no `concurrently` pane list to
  // rebalance). These clean out completely.
  const chainCases: Array<[string, string, string]> = [
    ['hono build', 'vite build && unocss', 'vite build'],
    ['hono deploy', 'vite build && unocss && wrangler deploy', 'vite build && wrangler deploy'],
    ['hono-node build', 'vite build && unocss', 'vite build'],
    ['go build', 'go mod tidy && vite build && unocss', 'go mod tidy && vite build'],
    ['mojo build', 'vite build && unocss', 'vite build'],
    ['xslate build', 'vite build && unocss', 'vite build'],
    ['csr build', 'vite build && unocss', 'vite build'],
    // No-op cases: scripts with no UnoCSS reference are untouched.
    ['plain go run', 'go run .', 'go run .'],
    ['plain perl daemon', 'perl app.pl daemon -l http://*:3002', 'perl app.pl daemon -l http://*:3002'],
  ]

  test.each(chainCases)('%s', (_label, input, expected) => {
    const out = stripUnocssFromScript(input)
    expect(out).toBe(expected)
    expect(out).not.toContain('unocss')
    expect(out).not.toContain('uno,')
  })

  // `dev` scripts carrying a `concurrently` pane list. Every adapter's
  // pane NAMES differ (`vite,uno,wrangler`, `dev,uno,server`,
  // `build,uno,server`, `build,uno`) — the rebalance is positional on the
  // `uno` entry, so all of them come out with the name and color lists
  // matching the surviving command count. A three-name list left over two
  // commands is the failure this pins: `concurrently` would label the
  // server pane `uno` and color it magenta.
  const rebalancedDevCases: Array<[string, string, string]> = [
    [
      'csr dev',
      'vite build && unocss && concurrently -k -n build,uno,server -c blue,magenta,green "vite build --watch" "unocss --watch" "tsx watch server.ts"',
      'vite build && concurrently -k -n build,server -c blue,green "vite build --watch" "tsx watch server.ts"',
    ],
    [
      'global watch (init.ts, uno)',
      'concurrently -k -n build,uno -c blue,magenta "vite build --watch" "unocss --watch"',
      'concurrently -k -n build -c blue "vite build --watch"',
    ],
    [
      'hono dev',
      'vite build && unocss && concurrently -k -n vite,uno,wrangler -c blue,magenta,green "vite dev" "unocss --watch" "wrangler dev --live-reload"',
      'vite build && concurrently -k -n vite,wrangler -c blue,green "vite dev" "wrangler dev --live-reload"',
    ],
    [
      'hono-node dev',
      'vite build && unocss && concurrently -k -n dev,uno,server -c blue,magenta,green "vite dev" "unocss --watch" "tsx watch server.tsx"',
      'vite build && concurrently -k -n dev,server -c blue,green "vite dev" "tsx watch server.tsx"',
    ],
    [
      'go dev',
      'go mod tidy && vite build && unocss && concurrently -k -n dev,uno,server -c blue,magenta,green "vite dev" "unocss --watch" "go run ."',
      'go mod tidy && vite build && concurrently -k -n dev,server -c blue,green "vite dev" "go run ."',
    ],
    [
      'mojo dev',
      'vite build && unocss && concurrently -k -n dev,uno,server -c blue,magenta,green "vite dev" "unocss --watch" "morbo app.pl -l http://*:3002"',
      'vite build && concurrently -k -n dev,server -c blue,green "vite dev" "morbo app.pl -l http://*:3002"',
    ],
    [
      'xslate dev',
      'vite build && unocss && concurrently -k -n dev,uno,server -c blue,magenta,green "vite dev" "unocss --watch" "plackup -s Starman --workers 5 -p 3003 app.psgi"',
      'vite build && concurrently -k -n dev,server -c blue,green "vite dev" "plackup -s Starman --workers 5 -p 3003 app.psgi"',
    ],
  ]

  test.each(rebalancedDevCases)('%s', (_label, input, expected) => {
    const out = stripUnocssFromScript(input)
    expect(out).toBe(expected)
    expect(out).not.toContain('unocss')
    expect(out).not.toContain('uno,')
  })


  test('leaves every adapter script unocss-free', () => {
    for (const adapter of Object.values(ADAPTERS)) {
      for (const v of Object.values(adapter.scripts)) {
        const rendered = typeof v === 'function' ? v('npm') : v
        expect(stripUnocssFromScript(rendered)).not.toContain('unocss')
      }
    }
  })
})

describe('stripUnoGitignore', () => {
  test('removes the # UnoCSS output block from a generated .gitignore', () => {
    const gitignore = ADAPTERS.hono.files['.gitignore']
    expect(gitignore).toContain('public/uno.css')
    const out = stripUnoGitignore(gitignore)
    expect(out).not.toContain('public/uno.css')
    expect(out).not.toContain('# UnoCSS output')
    // Other entries are untouched.
    expect(out).toContain('node_modules/')
  })

  test('no-op on content without the block', () => {
    const plain = 'node_modules/\n*.log\n'
    expect(stripUnoGitignore(plain)).toBe(plain)
  })
})
