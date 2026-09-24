/**
 * BarefootJS Compiler — reactive attrs on an element forwarded as a
 * loop-row child component's `children` (#3143).
 *
 * `{items.map(item => <Chip><a href={...}>...</a></Chip>)}` used to compile
 * clean but silently drop any effect for the `<a>`'s own reactive
 * attributes — no diagnostic, the DOM just never patched after the first
 * render. Two distinct loop-plan shapes hit this, both fixed here:
 *
 *   - a DYNAMIC (signal-derived) array whose row root is a component
 *     (`buildComponentLoopPlan`, `control-flow/plan/build-component-loop.ts`)
 *     — `elem.bindings.reactiveAttrs`/`.reactiveTexts` were collected but
 *     never read by that builder, AND the "simple" (no nested child
 *     components) stringifier path returned before ever looking at the
 *     reactive-effects plan at all.
 *   - a STATIC array (a plain literal, not a signal) whose row root is a
 *     component (`buildStaticLoopPlan`, `control-flow/plan/build-loop.ts`)
 *     — `attrsBySlot` was unconditionally skipped whenever the row root was
 *     a child component, a migration-era artifact (#1253) that never
 *     applied to the equivalent `texts` collection a few lines below it.
 *
 * The static-array shape is also the real-browser regression fixture
 * `loop-row-child-children-attrs` (`packages/adapter-tests/fixtures/
 * loop-row-child-children-attrs.ts`, its `interactions` — quarantine
 * removed by this same change) and the known-limitation registry entry
 * `loop-row-child-children-attrs-frozen` (narrowed by this change to the
 * unrelated go-template SSR-construction bug the same fixture also caught).
 */

import { describe, test, expect } from 'bun:test'
import { compileJSX } from '../compiler'
import { TestAdapter } from '../adapters/test-adapter'

const adapter = new TestAdapter()

describe('loop-row child component forwarded-children reactive attrs (#3143)', () => {
  test('dynamic (signal-derived) array + component-root loop: forwarded <a> attrs get a createEffect', () => {
    const source = `
      'use client'
      import { createSignal } from '@barefootjs/client'

      function Chip({ children }: { children?: any }) {
        return <span>{children}</span>
      }

      export function Nav() {
        const [active, setActive] = createSignal('a')
        const [opts] = createSignal(['a', 'b'])
        return (
          <div>
            {opts().map(opt => (
              <Chip key={opt}>
                <a
                  href={active() === opt ? '/current' : \`/other/\${opt}\`}
                  data-current={active() === opt ? 'true' : 'false'}
                >{opt}</a>
              </Chip>
            ))}
          </div>
        )
      }
    `
    const result = compileJSX(source, 'Nav.tsx', { adapter })
    expect(result.errors).toHaveLength(0)
    const content = result.files.find((f) => f.type === 'clientJs')!.content

    // The forwarded <a>'s own reactive attrs must reach a createEffect —
    // not just be baked once into the `children` props getter.
    expect(content).toContain("setAttribute('href'")
    expect(content).toContain("setAttribute('data-current'")
    expect(content).toMatch(/createEffect\(\(\) => \{[\s\S]*?setAttribute\('href'/)
  })

  test('static array (plain literal) + component-root loop: forwarded <a> attrs get a createEffect', () => {
    const source = `
      'use client'
      import { createSignal } from '@barefootjs/client'

      function Chip({ children }: { children?: any }) {
        return <span>{children}</span>
      }

      export function Nav() {
        const [active, setActive] = createSignal('a')
        const opts = ['a', 'b']
        return (
          <div>
            {opts.map(opt => (
              <Chip key={opt}>
                <a
                  href={active() === opt ? '/current' : \`/other/\${opt}\`}
                  data-current={active() === opt ? 'true' : 'false'}
                >{opt}</a>
              </Chip>
            ))}
          </div>
        )
      }
    `
    const result = compileJSX(source, 'Nav.tsx', { adapter })
    expect(result.errors).toHaveLength(0)
    const content = result.files.find((f) => f.type === 'clientJs')!.content

    expect(content).toContain("setAttribute('href'")
    expect(content).toContain("setAttribute('data-current'")
    expect(content).toMatch(/createEffect\(\(\) => \{[\s\S]*?setAttribute\('href'/)
  })
})
