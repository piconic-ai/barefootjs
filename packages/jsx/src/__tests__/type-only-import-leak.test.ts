/**
 * End-to-end compiler pin for issue #2432's minimal reproduction.
 *
 * `collectExternalImports` used to decide which imported specifiers to
 * re-emit into generated client JS with a `\bname\b` text scan over the
 * generated code, never consulting the PER-SPECIFIER `isTypeOnly` flag
 * (only the whole-declaration `import type { ... }` flag). So
 * `import { paperColor, type Theme } from '../lib/theme'` re-emitted
 * `Theme` as a VALUE import whenever the word "Theme" merely appeared in
 * the emitted code — here, as an object key (`{ Theme: 'テーマ' }`).
 *
 * The CLI's relative-import inliner then places every requested name in
 * the target module's top-level IIFE `return { … }`. `Theme` is a
 * type-only export with no runtime binding, so the `return` referenced an
 * undeclared name — `ReferenceError: Theme is not defined` at load,
 * which kills the *entire* page's client JS before hydrate ever runs.
 * The failure is silent from the user's perspective: the SSR-rendered
 * markup is already on screen, so the page looks fine even though no
 * interactivity ever wires up. See piconic-ai/barefootjs#2432.
 */

import { describe, test, expect } from 'bun:test'
import { compileJSX } from '../compiler'
import { TestAdapter } from '../adapters/test-adapter'

const adapter = new TestAdapter()

describe('type-only import leak (#2432)', () => {
  test('a per-specifier type-only import is never re-emitted into client JS', () => {
    const source = `
      'use client'
      import { createSignal } from '@barefootjs/client'
      import { paperColor, type Theme } from '../lib/theme'

      export function ThemedBadge() {
        const labels = { Theme: 'テーマ' }
        const [color, setColor] = createSignal(paperColor({ paper: '#fff' }))
        return <div title={labels.Theme}>{color()}</div>
      }
    `

    const result = compileJSX(source, 'ThemedBadge.tsx', { adapter })
    expect(result.errors.filter(e => e.severity === 'error')).toHaveLength(0)

    const clientJs = result.files.find(f => f.type === 'clientJs')
    expect(clientJs).toBeDefined()
    const code = clientJs!.content

    // The value specifier survives as a real import.
    expect(code).toContain("import { paperColor } from '../lib/theme'")

    // No import statement anywhere in the bundle mentions `Theme` — the
    // only legal destination for a value import of that name would be a
    // binding that doesn't exist in the compiled `../lib/theme` module.
    const importLines = code.split('\n').filter(line => line.trim().startsWith('import'))
    for (const line of importLines) {
      expect(line).not.toContain('Theme')
    }
  })
})
