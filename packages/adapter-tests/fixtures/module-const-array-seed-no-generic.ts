import { createFixture } from '../src/types'

/**
 * #2862 (pullfrog review, PR #2881): the sibling of `module-const-array-seed`
 * with NO explicit generic on `createSignal` — `const [rows] =
 * createSignal(INITIAL)` rather than `createSignal<Row[]>(INITIAL)`. The
 * analyzer's `collectSignal` types a bare-identifier `createSignal()`
 * argument with no type argument `unknown` (`packages/jsx/src/analyzer.ts`),
 * so `resolveModuleConstAsGo`'s `target.bakeType.kind !== 'unknown' ?
 * target.bakeType : (c.type ?? undefined)` fallback — falling back to the
 * module CONST's own declared type (`c.type`, from `const INITIAL: Row[] =
 * [...]`) rather than the signal's — is the exact branch exercised here.
 * `module-const-array-seed` itself always supplies an explicit generic, so
 * that fallback had no regression coverage before this fixture.
 */
export const fixture = createFixture({
  id: 'module-const-array-seed-no-generic',
  description: 'Signal seeded from a module-level array const with no explicit createSignal generic bakes its literal value (#2862)',
  source: `
'use client'
import { createSignal } from '@barefootjs/client'

interface Row {
  id: number
  label: string
}

const INITIAL: Row[] = [
  { id: 1, label: 'Alpha' },
  { id: 2, label: 'Bravo' },
]

export function ModuleConstArraySeedNoGeneric() {
  const [rows] = createSignal(INITIAL)
  return (
    <ul>
      {rows().map(row => (
        <li key={row.id}>{row.label}</li>
      ))}
    </ul>
  )
}
`,
  expectedHtml: `
    <ul bf-s="test" bf="s1">
      <li data-key="1"><!--bf:s0-->Alpha<!--/--></li>
      <li data-key="2"><!--bf:s0-->Bravo<!--/--></li>
    </ul>
  `,
})
