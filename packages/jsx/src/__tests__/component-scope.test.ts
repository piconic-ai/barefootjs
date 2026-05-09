/**
 * Compiler-level coverage for file-scoped component name disambiguation.
 *
 * Locks in the invariant that originally fired the
 * "ThemeSwitcher icon grows after toggle" production bug
 * (https://github.com/piconic-ai/barefootjs/pull/1093):
 *
 *   - non-exported helpers in two different files MUST register under
 *     distinct hydrate keys, so the runtime registry can't be clobbered
 *     by a same-named component from another module
 *   - exported components MUST keep their original name so
 *     `<Imported />` JSX in a third file still resolves the same way
 *   - within a single file, non-exported helpers' hydrate / renderChild
 *     keys must agree (otherwise the local lookup itself breaks)
 *
 * All three are direct consequences of the rewrite in
 * `ir-to-client-js/component-scope.ts`; the regressions they prevent
 * are silent (wrong template returned, no error thrown), so unit
 * coverage at the compiler boundary is more valuable than relying on
 * downstream e2e to catch them.
 */

import { describe, test, expect } from 'bun:test'
import { compileJSX } from '../compiler'
import { computeFileScope } from '../ir-to-client-js/component-scope'
import { TestAdapter } from '../adapters/test-adapter'

const adapter = new TestAdapter()

function clientJs(result: ReturnType<typeof compileJSX>): string {
  const file = result.files.find((f) => f.type === 'clientJs')
  if (!file) throw new Error('expected clientJs output')
  return file.content
}

const themeSwitcherSource = `
  'use client'
  import { createSignal } from '@barefootjs/client'

  function SunIcon() {
    return <svg width="20" height="20"><path d="sun" /></svg>
  }

  function MoonIcon() {
    return <svg width="20" height="20"><path d="moon" /></svg>
  }

  export function ThemeSwitcher() {
    const [dark, setDark] = createSignal(false)
    return (
      <button onClick={() => setDark(v => !v)}>
        {dark() ? <SunIcon /> : <MoonIcon />}
      </button>
    )
  }
`

// Same component identifiers as themeSwitcherSource, but exported as
// the public API of an icon library — the production collision shape.
const iconLibrarySource = `
  'use client'
  export function SunIcon() {
    return <svg><path d="lucide-sun" /></svg>
  }
  export function MoonIcon() {
    return <svg><path d="lucide-moon" /></svg>
  }
`

describe('component-scope: file-scoped registry keys for non-exported helpers', () => {
  test('non-exported helpers in two files register under distinct hydrate keys', () => {
    const themeJs = clientJs(compileJSX(themeSwitcherSource, 'site/shared/components/theme-switcher.tsx', { adapter }))
    const iconJs = clientJs(compileJSX(iconLibrarySource, 'ui/components/ui/icon/index.tsx', { adapter }))

    // Theme switcher's local SunIcon is private — must NOT register the
    // bare name (which would race with the icon library's export).
    expect(themeJs).not.toMatch(/hydrate\('SunIcon',/)
    expect(themeJs).toMatch(/hydrate\('SunIcon__[a-f0-9]{8}',/)
    expect(themeJs).toMatch(/hydrate\('MoonIcon__[a-f0-9]{8}',/)

    // Icon library's exported SunIcon stays unscoped — that's how
    // cross-file `<SunIcon />` JSX continues to resolve it.
    expect(iconJs).toMatch(/hydrate\('SunIcon',/)
    expect(iconJs).toMatch(/hydrate\('MoonIcon',/)
    expect(iconJs).not.toMatch(/hydrate\('SunIcon__/)
  })

  test('exported main component is not scoped even when it has non-exported siblings', () => {
    const themeJs = clientJs(compileJSX(themeSwitcherSource, 'site/shared/components/theme-switcher.tsx', { adapter }))
    expect(themeJs).toMatch(/hydrate\('ThemeSwitcher',/)
    expect(themeJs).not.toMatch(/hydrate\('ThemeSwitcher__/)
  })

  test('within one file, hydrate / renderChild / initChild use the same scoped key', () => {
    const themeJs = clientJs(compileJSX(themeSwitcherSource, 'site/shared/components/theme-switcher.tsx', { adapter }))

    // Pull the suffix from the hydrate registration so the assertion
    // fails loudly if the rewrite ever drifts between emit points.
    const suffix = themeJs.match(/hydrate\('SunIcon(__[a-f0-9]{8})',/)?.[1]
    expect(suffix).toBeDefined()
    expect(themeJs).toContain(`renderChild('SunIcon${suffix}'`)
    expect(themeJs).toContain(`initChild('SunIcon${suffix}'`)
    expect(themeJs).toContain(`renderChild('MoonIcon${suffix}'`)
    expect(themeJs).toContain(`initChild('MoonIcon${suffix}'`)
  })

  test('different file paths produce different scope hashes', () => {
    const a = computeFileScope('site/shared/components/theme-switcher.tsx')
    const b = computeFileScope('ui/components/ui/icon/index.tsx')
    expect(a).not.toBe(b)
    expect(a).toMatch(/^[a-f0-9]{8}$/)
    expect(b).toMatch(/^[a-f0-9]{8}$/)
  })

  test('same path produces a stable scope hash', () => {
    const path = 'site/shared/components/theme-switcher.tsx'
    expect(computeFileScope(path)).toBe(computeFileScope(path))
  })

  test('paths sharing a common suffix still hash distinctly', () => {
    // The xorshift mix in computeFileScope exists specifically so
    // `a/index.tsx` and `b/index.tsx` don't collapse to neighboring
    // hashes that share a hex prefix.
    const a = computeFileScope('packages/foo/src/index.tsx')
    const b = computeFileScope('packages/bar/src/index.tsx')
    expect(a).not.toBe(b)
  })
})

