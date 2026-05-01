/**
 * Pins the **import preservation contract**: every identifier referenced
 * by emitted client code must have a corresponding import (or local
 * declaration) in the same module.
 *
 * #1133 surfaced when `compileJSX` correctly preserved the import line
 * but the downstream `barefoot build` step stripped it. The staged-IR
 * refactor records every used external identifier in IR metadata, so
 * the build step can verify "every name used has a source" structurally.
 *
 * Covers issue shape #1133. These tests run against the compiler output
 * directly — the build-step layer needs separate fixtures (deferred to
 * P6 verification against piconic-ai/desk).
 */

import { describe, test, expect } from 'bun:test'
import { compile, expectValidJs } from './helpers'

describe('Import preservation: every used external name has an import line', () => {
  // TODO(#1138 P3 5/N): Today's compiler inlines `yjs` into template scope
  // (yjs.id → useYjs(_p.roomId, _p.readOnly).id), then concludes `useYjs` is
  // unused at init scope and drops the import. Will pass once relocate()'s
  // recursive-visibility check refuses the inline and the import-preservation
  // pass reads usedExternals from the relocate result.
  test.todo('relative import used in init body survives compile', () => {
    const { clientJs, errors } = compile(`
      'use client'
      import { useYjs } from './useYjs'

      interface Props { roomId: string; readOnly: boolean }

      export function DeskCanvas(props: Props) {
        const yjs = useYjs(props.roomId, props.readOnly)
        return <div data-yjs={yjs.id}>hi</div>
      }
    `)

    expect(errors).toEqual([])
    expect(clientJs).toMatch(/import\s+\{[^}]*useYjs[^}]*\}\s+from\s+['"]\.\/useYjs['"]/)
    expect(clientJs).toMatch(/useYjs\(/)
    expectValidJs(clientJs)
  })

  // TODO(#1138 P3 5/N): same shape as the test above, with two imports.
  test.todo('multiple imports from same source are bundled', () => {
    const { clientJs, errors } = compile(`
      'use client'
      import { helperA, helperB } from './helpers'

      export function Foo() {
        const x = helperA() + helperB()
        return <div data-x={x}>hi</div>
      }
    `)

    expect(errors).toEqual([])
    expect(clientJs).toMatch(/import\s+\{[^}]*helperA[^}]*\}\s+from\s+['"]\.\/helpers['"]/)
    expect(clientJs).toMatch(/import\s+\{[^}]*helperB[^}]*\}\s+from\s+['"]\.\/helpers['"]/)
    expectValidJs(clientJs)
  })

  test('unused import IS dropped (negative control)', () => {
    const { clientJs, errors } = compile(`
      'use client'
      import { unused } from './unused'

      export function Foo(props: { name: string }) {
        return <div>{props.name}</div>
      }
    `)

    expect(errors).toEqual([])
    expect(clientJs).not.toMatch(/import.*unused/)
  })
})
