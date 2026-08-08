/**
 * #2482 Stage 1b — `prop-handling.ts`'s `expandConstantForReactivity` /
 * `expandDynamicPropValue` run on `ClientJsContext`, a per-component object
 * with no loop-scope field at all. Both do a flat
 * `ctx.localConstants.find((c) => c.name === trimmedValue)` lookup with no
 * awareness that the expression being expanded might be sitting inside a
 * `.map()` row whose OWN item/index/destructured/preamble binding shadows
 * that same-named module/component-level const — the lookup resolves to
 * the OUTER const's value regardless.
 *
 * This test pins the reachable, currently-shipping instance: a per-item
 * reactive DOM attribute (forced via `/* @client *\/`, so it bypasses the
 * loop-param-only reactivity classifier and always reaches
 * `collectLoopChildReactiveAttrs` → `expandConstantForReactivity`) whose
 * value is a bare reference to the loop's OWN item parameter, which
 * shares a name with a module-level const. Before the fix, the per-item
 * `createEffect`-equivalent (`applyItem`/`createRow` in the lazy-row
 * runtime) baked in the outer const's fixed literal for every row instead
 * of reading the row's own item value — every row rendered the SAME
 * `data-label`, and it never diverged from that one baked value.
 *
 * Modeled on `csr-template-loop-shadowing.test.ts` (the sibling shadowing
 * fix for the CSR *template* lambda, #2222) — this is the analogous fix
 * for the per-item *reactive attribute effect* body, a different codegen
 * path (`reactivity.ts`'s `collectLoopChildReactiveAttrs`, not
 * `html-template.ts`).
 *
 * A second describe block below pins the INDEX-param shadowing case
 * (Copilot review on PR #2595): `buildLoopRowScope` initially omitted
 * the loop's second callback param (`.map((item, i) => ...)`'s `i`) from
 * the `BindingScope` it builds, so an `i`-shadows-a-module-const attr
 * const-folded the outer value exactly like the item-param case above,
 * empirically confirmed reachable through the same
 * `collectLoopChildReactiveAttrs` → `expandConstantForReactivity` path.
 * Fixed by threading the IR loop's `index` field through
 * `collectLoopChildBindings` / `collectLoopChildConditionals` /
 * `summarizeLoopChildBranch` / `collectLoopChildReactiveAttrs` /
 * `collectLoopChildReactiveTexts` into `buildLoopRowScope`.
 */

import { describe, test, expect } from 'bun:test'
import { compileJSX } from '../compiler'
import { TestAdapter } from '../adapters/test-adapter'

const adapter = new TestAdapter()

function clientJsFor(source: string): string {
  const result = compileJSX(source, 'Repro.tsx', { adapter })
  expect(result.errors.filter(e => e.severity === 'error')).toHaveLength(0)
  const clientJs = result.files.find(f => f.type === 'clientJs')
  expect(clientJs).toBeDefined()
  return clientJs!.content
}

describe('loop-child reactive attr vs a loop-param shadowing a module const (#2482)', () => {
  test('a /* @client */ attr reading the shadowing item param reads the row value, not the outer const', () => {
    const js = clientJsFor(`
      'use client'
      import { createSignal } from '@barefootjs/client'
      export function Widget({ items }: { items: string[] }) {
        const label = 'MODULE_CONST'
        const [n, setN] = createSignal(0)
        return (
          <div onClick={() => setN(n() + 1)}>
            <ul>
              {items.map((label) => (
                <li key={label} data-label={/* @client */ label}>{n()}</li>
              ))}
            </ul>
          </div>
        )
      }
    `)

    // The per-item attribute effect must read the row's OWN item
    // accessor — never the outer module const's baked literal.
    expect(js).toContain('const __x = label()')
    expect(js).not.toContain("const __x = 'MODULE_CONST'")
  })
})

describe('loop-child reactive attr vs a loop INDEX param shadowing a module const (#2482 / #2595)', () => {
  test('a /* @client */ attr reading the shadowing index param reads the row index, not the outer const', () => {
    const js = clientJsFor(`
      'use client'
      import { createSignal } from '@barefootjs/client'
      export function Widget({ items }: { items: string[] }) {
        const i = 'MODULE_CONST'
        const [n, setN] = createSignal(0)
        return (
          <div onClick={() => setN(n() + 1)}>
            <ul>
              {items.map((item, i) => (
                <li key={item} data-idx={/* @client */ i}>{n()}</li>
              ))}
            </ul>
          </div>
        )
      }
    `)

    // The per-item attribute effect must read the row's OWN index
    // closure variable — never the outer module const's baked literal.
    expect(js).toContain("const __v = i;")
    expect(js).not.toContain("const __v = 'MODULE_CONST';")
  })
})
