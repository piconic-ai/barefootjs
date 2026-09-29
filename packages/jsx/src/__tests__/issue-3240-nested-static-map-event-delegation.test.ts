/**
 * #3240: a nested `.map()` over STATIC arrays (module-level `const`s, so the
 * outer loop hydrates via `forEach` instead of `mapArray`) whose INNER row
 * has an event handler closing over the inner loop's own param. The
 * delegated listener lives on the outer loop's container
 * (`emitStaticIndexLookup`) and, pre-fix, resolved only the outer item by
 * index — it never declared the inner param, so the handler read an
 * undeclared identifier and threw `ReferenceError` on every click (visible
 * symptom: clicking does nothing).
 *
 * Root cause: `emitStaticIndexLookup` (unlike `emitKeyedLookup`, which
 * already resolves `ev.nestedLoops` via `data-key-N` `closest()` lookups)
 * ignored `ev.nestedLoops` entirely. Static arrays render no `data-key`
 * markers to `closest()` off for the OUTER resolution (hence the
 * `static-index` lookup kind in the first place), so the fix resolves each
 * nested level positionally instead — scoping a `containerSlotId` lookup to
 * the previously-resolved row and reading the clicked element's position
 * the same way `stringify/static-array-child-init.ts`'s hydration pass
 * already does for this exact nested-static-loop shape (#2798).
 *
 * This is the string-shape half of the regression pin; the runtime-behavior
 * half (mounts the compiled output in a real DOM and clicks it) lives in
 * `packages/client/__tests__/runtime/issue-3240-nested-static-map-event.test.ts`
 * — mirroring how #2189 split across
 * `event-delegation-index-param.test.ts` (shape) and
 * `event-delegation-index-param-e2e.test.ts` (runtime).
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

describe('static-index event delegation resolves nested .map() params (#3240)', () => {
  test('inner-loop handler param is declared and reachable inside the outer item guard', () => {
    const content = clientJsFor(`
      'use client'
      import { createSignal } from '@barefootjs/client'
      const GROUPS = ['a', 'b']
      const CHOICES = ['1', '2']
      export function Repro() {
        const [picked, setPicked] = createSignal('')
        return (
          <div>
            {GROUPS.map(group => (
              <div key={group}>
                {CHOICES.map(choice => (
                  <button key={choice} onClick={() => setPicked(\`\${group}\${choice}\`)}>{group}{choice}</button>
                ))}
              </div>
            ))}
          </div>
        )
      }
    `)

    // The outer item is still resolved positionally, unchanged.
    expect(content).toContain('const group = GROUPS[__idx]')
    // The inner item is now resolved too (pre-fix: never declared at all).
    expect(content).toContain('const choice = __iidx1 >= 0 ? CHOICES[__iidx1] : undefined')
    // The handler call is guarded on BOTH params, and runs after both are
    // declared (not before — a `choice` declared after the call would still
    // throw a TDZ `ReferenceError`).
    const choiceDeclIdx = content.indexOf('const choice = __iidx1')
    const guardIdx = content.indexOf('if (choice) {')
    const callIdx = content.indexOf('(() => setPicked(`${group}${choice}`))(__bfEvt)')
    expect(choiceDeclIdx).toBeGreaterThan(0)
    expect(guardIdx).toBeGreaterThan(choiceDeclIdx)
    expect(callIdx).toBeGreaterThan(guardIdx)
  })

  test('byte-stability: an event with no nested loops keeps the pre-#3240 shape', () => {
    const content = clientJsFor(`
      'use client'
      import { createSignal } from '@barefootjs/client'
      const ITEMS = ['a', 'b']
      export function Repro() {
        const [picked, setPicked] = createSignal('')
        return (
          <ul>
            {ITEMS.map(item => (
              <li key={item} onClick={() => setPicked(item)}>{item}</li>
            ))}
          </ul>
        )
      }
    `)

    // No nested-loop resolution machinery leaks into a plain (non-nested)
    // static-index event — same shape as before #3240.
    expect(content).not.toContain('__ic1')
    expect(content).not.toContain('__iidx1')
    expect(content).toMatch(/const item = ITEMS\[__idx\]\n\s*if \(item\) \{\n\s*;\(\(\) => setPicked\(item\)\)\(__bfEvt\)\n\s*\}/)
  })

  test('a nested array expression referencing the outer param resolves inside the outer guard', () => {
    // Exercises the props-driven-lookup shape from the issue (`CHOICES[settingKey]`)
    // — the nested array expression reads the outer param, so it must be
    // declared AFTER the outer item guard opens, not before.
    const content = clientJsFor(`
      'use client'
      import { createSignal } from '@barefootjs/client'
      const KEYS = ['x', 'y']
      const CHOICE_MAP: Record<string, string[]> = { x: ['1', '2'], y: ['3', '4'] }
      export function Repro() {
        const [picked, setPicked] = createSignal('')
        return (
          <div>
            {KEYS.map(settingKey => (
              <div key={settingKey}>
                {CHOICE_MAP[settingKey].map(choice => (
                  <button key={choice} onClick={() => setPicked(\`\${settingKey}:\${choice}\`)}>{settingKey}{choice}</button>
                ))}
              </div>
            ))}
          </div>
        )
      }
    `)

    expect(content).toContain('const choice = __iidx1 >= 0 ? CHOICE_MAP[settingKey][__iidx1] : undefined')
  })
})
