/**
 * Regression test for #2589: a `let` declaration's explicit type
 * annotation was dropped in emitted `.tsx` SSR templates —
 * `let x: HTMLTextAreaElement | null = null` emitted as `let x = null`,
 * which TypeScript then infers as `null`/`never`, producing
 * TS7034/TS7005 (and TS2339 via `never` narrowing) under strict mode.
 * Runtime output (client JS) was always correct — this is a type-level
 * emission defect in the SSR template only.
 *
 * `ConstantInfo.typeAnnotation` (verbatim `node.type.getText()`, only
 * present when the author wrote an explicit annotation) is now threaded
 * through and printed by the `HonoAdapter` (`JsxAdapter` base) for `let`
 * declarations, both function-scope and module-scope, initialized and
 * uninitialized. `const` declarations are deliberately left unchanged:
 * their type always infers correctly from the (immutable) initializer,
 * so emitting an annotation there would only churn output for no
 * typecheck gain (see the design note in the class docstring / #2589).
 */

import { describe, test, expect } from 'bun:test'
import { compileJSX } from '../compiler'
import { HonoAdapter } from '../../../../packages/adapter-hono/src/adapter/hono-adapter'

describe('let type annotation preservation in emitted templates (#2589)', () => {
  test('function-scope initialized let keeps its explicit type annotation', () => {
    const honoAdapter = new HonoAdapter()
    // `status()` is called directly from the returned JSX (unlike an
    // `onXxx` event-handler prop, which the SSR template stubs to a
    // no-op), so its body — and transitively `textareaEl`, which the
    // effect-guard shape (`syncScroll`, mirroring the issue) also reads —
    // stays reachable and survives into the emitted template.
    const source = `
      'use client'
      import { createSignal, createEffect } from '@barefootjs/client'

      export function Textarea() {
        let textareaEl: HTMLTextAreaElement | null = null
        const [value, setValue] = createSignal('')

        const syncScroll = () => {
          if (textareaEl) {
            textareaEl.scrollTop = textareaEl.scrollHeight
          }
        }

        const status = () => (textareaEl ? 'ready' : 'idle')

        createEffect(() => {
          value()
          syncScroll()
        })

        return <div>{status()}</div>
      }
    `

    const result = compileJSX(source, 'Textarea.tsx', { adapter: honoAdapter })
    expect(result.errors).toHaveLength(0)

    const template = result.files.find((f) => f.type === 'markedTemplate')!
    expect(template).toBeDefined()
    expect(template.content).toContain('let textareaEl: HTMLTextAreaElement | null = null')
  })

  test('module-scope initialized let keeps its explicit type annotation', () => {
    const honoAdapter = new HonoAdapter()
    const source = `
      'use client'
      import { createSignal } from '@barefootjs/client'

      let exportModulePromise: Promise<{ x: number }> | null = null

      export function Loader() {
        const [status, setStatus] = createSignal('idle')

        const load = () => {
          exportModulePromise = Promise.resolve({ x: 1 })
          setStatus('loaded')
        }

        return <button onClick={load}>{status()}</button>
      }
    `

    const result = compileJSX(source, 'Loader.tsx', { adapter: honoAdapter })
    expect(result.errors).toHaveLength(0)

    const template = result.files.find((f) => f.type === 'markedTemplate')!
    expect(template).toBeDefined()
    expect(template.content).toContain(
      'let exportModulePromise: Promise<{ x: number }> | null = null',
    )
  })

  test('module-scope uninitialized let keeps its explicit type annotation', () => {
    const honoAdapter = new HonoAdapter()
    const source = `
      'use client'
      import { createSignal } from '@barefootjs/client'

      let pending: number

      export function Counter() {
        const [count, setCount] = createSignal(0)

        const bump = () => {
          pending = count() + 1
          setCount(pending)
        }

        return <button onClick={bump}>{count()}</button>
      }
    `

    const result = compileJSX(source, 'Counter.tsx', { adapter: honoAdapter })
    expect(result.errors).toHaveLength(0)

    const template = result.files.find((f) => f.type === 'markedTemplate')!
    expect(template).toBeDefined()
    expect(template.content).toContain('let pending: number')
  })

  test('unannotated let does NOT gain an inferred type annotation', () => {
    const honoAdapter = new HonoAdapter()
    const source = `
      'use client'
      import { createSignal } from '@barefootjs/client'

      export function Toggle() {
        let y = null
        const [open, setOpen] = createSignal(false)

        const flip = () => {
          y = open() ? 1 : null
          setOpen(!open())
        }

        return <button onClick={flip}>{open() ? 'on' : 'off'}{String(y)}</button>
      }
    `

    const result = compileJSX(source, 'Toggle.tsx', { adapter: honoAdapter })
    expect(result.errors).toHaveLength(0)

    const template = result.files.find((f) => f.type === 'markedTemplate')!
    expect(template).toBeDefined()
    // No annotation must be synthesized from inference — only an
    // explicit source annotation is ever printed (`typeAnnotation`,
    // never `type` for an initialized declaration).
    expect(template.content).toContain('let y = null')
    expect(template.content).not.toMatch(/let y\s*:/)
  })

  test('const with an explicit annotation is unchanged (no annotation added at emit)', () => {
    const honoAdapter = new HonoAdapter()
    const source = `
      'use client'
      import { createSignal } from '@barefootjs/client'

      export function Labelled() {
        const label: string = 'hello'
        const [count, setCount] = createSignal(0)
        return <button onClick={() => setCount(count() + 1)}>{label}{count()}</button>
      }
    `

    const result = compileJSX(source, 'Labelled.tsx', { adapter: honoAdapter })
    expect(result.errors).toHaveLength(0)

    const template = result.files.find((f) => f.type === 'markedTemplate')!
    expect(template).toBeDefined()
    // By design (#2589 scoping decision) only `let` gets its annotation
    // re-emitted — `const` infers correctly from its initializer already,
    // so this stays `const label = 'hello'` with no annotation added.
    expect(template.content).toContain("const label = 'hello'")
    expect(template.content).not.toContain('const label: string')
  })

  test('ambient `declare let` is not re-emitted as a runtime binding', () => {
    const honoAdapter = new HonoAdapter()
    // `declare let` is a type-only contract: it has no initializer and
    // carries NodeFlags.Let, so after the uninitialized-`let` collection
    // fix it would match the module-scope collector unless ambient
    // statements are excluded. Re-emitting it as a runtime `let` would
    // shadow the real global with `undefined` in the SSR module.
    const source = `
      'use client'
      import { createSignal } from '@barefootjs/client'

      declare let __BF_AMBIENT__: string

      export function Widget() {
        const [n, setN] = createSignal(0)
        const status = () => (__BF_AMBIENT__ ? 'set' : 'unset')
        return <button onClick={() => setN(n() + 1)}>{status()}{n()}</button>
      }
    `

    const result = compileJSX(source, 'Widget.tsx', { adapter: honoAdapter })
    expect(result.errors).toHaveLength(0)

    const template = result.files.find((f) => f.type === 'markedTemplate')!
    expect(template).toBeDefined()
    // The reference inside `status` may survive, but no runtime `let`
    // declaration for the ambient name may be emitted.
    expect(template.content).not.toMatch(/^\s*let __BF_AMBIENT__/m)
  })
})
