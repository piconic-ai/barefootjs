/**
 * #2767 follow-up: two sibling components in the SAME multi-component file
 * compile independently from the same module-scope default import — each
 * component's compiled client JS only lists the specifiers IT actually
 * uses, so one component can emit `import cfg from './config'` while
 * another emits `import cfg, { helper } from './config'` for the exact
 * same source declaration. `compileMultipleComponents`'s client-JS merge
 * used to dedupe import lines by EXACT STRING, which kept both — a hard
 * `SyntaxError: Identifier 'cfg' has already been declared` in the merged
 * `.client.js`, with zero compile diagnostics. This is an end-to-end test
 * through the real `compileJSX` multi-component path (not the unit-level
 * `mergeTemplateImports`/`collectExternalImports` tests, which are correct
 * per-component but can't see this cross-component merge on their own).
 */
import { describe, test, expect } from 'bun:test'
import { compileJSX } from '../compiler'
import { TestAdapter } from '../adapters/test-adapter'

const adapter = new TestAdapter()

describe('multi-component file sharing a default import (#2767 follow-up)', () => {
  test('merges into one import line instead of redeclaring the default binding', () => {
    const source = `
'use client'
import cfg, { helper } from './config'
import { createSignal } from '@barefootjs/client'

export function CompA() {
  const [n, setN] = createSignal(cfg.start)
  return <button onClick={() => setN(n() + 1)}>{n()}</button>
}

export function CompB() {
  const [m, setM] = createSignal(cfg.start + helper())
  return <button onClick={() => setM(m() + 1)}>{m()}</button>
}
`
    const result = compileJSX(source, 'shared-default.tsx', { adapter })
    const errors = result.errors.filter(e => e.severity === 'error')
    expect(errors).toEqual([])

    const clientJs = result.files.find(f => f.type === 'clientJs')
    expect(clientJs).toBeDefined()

    const importLines = clientJs!.content
      .split('\n')
      .filter(l => l.includes("from './config'"))
    // Exactly one declaration for './config' — not one per component.
    expect(importLines).toEqual(["import cfg, { helper } from './config'"])

    // The binding is declared exactly once, not once per component.
    const declarationCount = (clientJs!.content.match(/\bimport\s+cfg\b/g) ?? []).length
    expect(declarationCount).toBe(1)
  })
})
