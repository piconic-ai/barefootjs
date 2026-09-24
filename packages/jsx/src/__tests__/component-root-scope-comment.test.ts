/**
 * `decideComponentRootScopeComment` (#3141) — the shared flag every
 * adapter's `IRNodeEmitter.emitComponent` reads instead of re-deriving
 * "is this component root client-interactive" locally.
 *
 * Runs through `compileJSX` — the SAME entry point `@barefootjs/vite`'s
 * plugin and the CLI call in production (`packages/vite/src/plugin.ts`,
 * `packages/cli/src/lib/preview/compile.ts`) — rather than calling
 * `jsxToIR`/`buildMetadata` directly, with `outputIR: true` to inspect the
 * exact `ComponentIR` the adapter itself renders from. This exercises the
 * real ordering guarantee the fix depends on: `decideComponentRootScopeComment`
 * must run AFTER `metadata.clientAnalysis` is computed and BEFORE
 * `adapter.generate` reads `ir.root`, on the multi-component path
 * (`compileMultipleComponents`) this fixture's two-component file — `Kid` +
 * the exported root — takes, not the single-component one.
 */

import { describe, test, expect } from 'bun:test'
import { compileJSX } from '../compiler.ts'
import { TestAdapter } from '../adapters/test-adapter.ts'
import type { ComponentIR, IRComponent } from '../types.ts'

function irFor(source: string, filePath: string, componentName: string): ComponentIR {
  const result = compileJSX(source, filePath, { adapter: new TestAdapter(), outputIR: true })
  expect(result.errors).toEqual([])
  const irFile = result.files.find(
    (f) => f.type === 'ir' && f.path.includes(`.${componentName}.ir.json`),
  ) ?? result.files.find((f) => f.type === 'ir')
  expect(irFile).toBeDefined()
  return JSON.parse(irFile!.content) as ComponentIR
}

describe('decideComponentRootScopeComment', () => {
  test('flags a client component whose root is a bare child-component call', () => {
    const ir = irFor(
      `
      'use client'
      import { createSignal } from '@barefootjs/client'

      function Kid({ label, children }: { label: string; children?: unknown }) {
        return (
          <div>
            <p>{label}</p>
            {children}
          </div>
        )
      }

      export function ComponentRootClientScope({ label }: { label: string }) {
        const [text, setText] = createSignal(label)
        return (
          <Kid label={text()}>
            <button onClick={() => setText('loaded')}>load</button>
          </Kid>
        )
      }
      `,
      'ComponentRootClientScope.tsx',
      'ComponentRootClientScope',
    )
    expect(ir.root.type).toBe('component')
    expect((ir.root as IRComponent).needsScopeComment).toBe(true)
  })

  test('also flags a non-"use client" component whose root is a bare child-component call', () => {
    // No `'use client'` directive and no signals here — but ANY nested
    // component reference forces `clientAnalysis.needsInit` regardless
    // (`childInits.length > 0` in `needsClientJs`, `ir-to-client-js/index.ts`):
    // the parent always needs an init call to register/mount its child. So
    // `hasClientInteractivity` (this function's formula, matching Hono's
    // existing one) is true for EVERY `root.type === 'component'` shape,
    // not only explicit `'use client'` ones — this pins that down rather
    // than assuming the registry entry's `'use client'`-only `given` clause
    // is the actual gate.
    const ir = irFor(
      `
      function Kid({ label }: { label: string }) {
        return <div>{label}</div>
      }
      export function StaticWrapper({ label }: { label: string }) {
        return <Kid label={label} />
      }
      `,
      'StaticWrapper.tsx',
      'StaticWrapper',
    )
    expect(ir.root.type).toBe('component')
    expect((ir.root as IRComponent).needsScopeComment).toBe(true)
  })

  test('leaves a client component with a wrapping element root unflagged (nothing to change there)', () => {
    const ir = irFor(
      `
      'use client'
      import { createSignal } from '@barefootjs/client'
      export function Wrapped({ label }: { label: string }) {
        const [text] = createSignal(label)
        return <div>{text()}</div>
      }
      `,
      'Wrapped.tsx',
      'Wrapped',
    )
    expect(ir.root.type).toBe('element')
  })
})
