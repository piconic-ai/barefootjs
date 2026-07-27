/**
 * #2389 patch-on-update: a keyed `.map()` row body whose preamble builds
 * content from item state (`const stateLabel = t.done ? ... ; const cells
 * = []; cells.push(<td>{stateLabel}</td>)`) goes STALE on a same-key item
 * update — `mapArray` reuses the row via per-item `setItem`, re-running
 * only the row's wired text/attr slots. `{cells}` had no slot wiring at
 * all, so it froze at its mount-time content forever while the sibling
 * `{t.name}` text slot updated normally.
 *
 * The fix: a loop-body expression child whose free identifiers intersect
 * the preamble's `declaredNames` is classified as a preamble-patched
 * region — slot-marked like an ordinary reactive text (so SSR/CSR row
 * templates render `<!--bf:sN-->...<!--/-->` / `{bfText("sN")}` the same
 * door a reactive text uses), but wired on the client via a claimed
 * 'markup' slot writer (`@barefootjs/client/runtime/claim-slots.ts`) rather
 * than a `reactiveTexts` `.textContent` assignment (which would corrupt the
 * array-joined markup). Dedup — skip the DOM write when the new value
 * matches the writer's own held `last` value — lives inside that writer;
 * every write, including the first, applies unless deduped (see
 * `claim-slots.ts`'s module docstring).
 */

import { describe, test, expect } from 'bun:test'
import { compileJSX } from '../compiler'
import { TestAdapter } from '../adapters/test-adapter'
import { HonoAdapter } from '../../../adapter-hono/src/index.ts'

const ROW_SOURCE = `
  'use client'
  import { createSignal } from '@barefootjs/client'
  export function Todos() {
    const [todos, setTodos] = createSignal([
      { id: 1, name: 'a', done: false },
      { id: 2, name: 'b', done: false },
    ])
    const toggle = (id: number) =>
      setTodos(todos().map(t => t.id === id ? { ...t, done: !t.done } : t))
    return (
      <table><tbody>
        {todos().map((t) => {
          const stateLabel = t.done ? 'done & dusted' : 'open'
          const cells = []
          cells.push(<td className="state">{stateLabel}</td>)
          return (
            <tr key={t.id}>
              {cells}
              <td>{t.name}</td>
              <td><button onClick={() => toggle(t.id)}>toggle</button></td>
            </tr>
          )
        })}
      </tbody></table>
    )
  }
`

function compileWith(adapter: TestAdapter | HonoAdapter, source: string = ROW_SOURCE) {
  const result = compileJSX(source, 'Todos.tsx', { adapter })
  expect(result.errors.filter((e) => e.severity === 'error')).toHaveLength(0)
  const clientJs = result.files.find((f) => f.type === 'clientJs')
  const marked = result.files.find((f) => f.type === 'markedTemplate' || f.type === 'ssr')
  expect(clientJs).toBeDefined()
  return { clientJs: clientJs!.content, marked: marked?.content, result }
}

describe('preamble-region-patch (#2389)', () => {
  test('(a) row template + SSR marked template both carry the region slot marker', () => {
    const { clientJs } = compileWith(new TestAdapter())
    // Row template (the `__tpl.innerHTML = ...` string literal inside
    // renderItem): the region renders as a paired comment marker around the
    // array-joined value, exactly like a reactive text slot.
    expect(clientJs).toMatch(/<!--bf:s\d+-->\$\{Array\.isArray\(cells\) \? cells\.join\(''\) : \(cells \?\? ''\)\}<!--\/-->/)

    const hono = compileWith(new HonoAdapter())
    expect(hono.clientJs).toContain("kind: 'markup'")
    expect(hono.clientJs).toContain('lazySlots(__el')
    // Hono SSR renders the SAME slotId through `renderExpression`'s generic
    // `{bfText("id")}...{bfTextEnd()}` door — no bespoke region handling.
    const slotMatch = /<!--bf:(s\d+)-->\$\{Array\.isArray\(cells\)/.exec(hono.clientJs)
    expect(slotMatch).not.toBeNull()
    const slotId = slotMatch![1]
    expect(hono.marked).toContain(`{bfText("${slotId}")}`)
    expect(hono.marked).toContain('{cells}')
    expect(hono.marked).toContain('{bfTextEnd()}')
  })

  test('(b) renderItem emits the region-patch effect, re-running the preamble in accessor form', () => {
    const { clientJs } = compileWith(new TestAdapter())
    expect(clientJs).toContain("kind: 'markup'")
    // The preamble re-runs inside the effect with the loop-param accessor
    // wrap (`t().done`), not the plain (`t.done`) form used at the
    // top-level construction line.
    expect(clientJs).toMatch(/createEffect\(\(\) => \{\s*const stateLabel = t\(\)\.done/)
    // The write goes through the claimed 'markup' writer — dedup (skip an
    // unchanged string, on every write including the first) now lives
    // inside `writeMarkup` itself (`claim-slots.ts`), not a per-region
    // `__last` local next to the write call.
    expect(clientJs).toMatch(/__bfw_\w+\('s\d+', Array\.isArray\(cells\)/)
  })

  test('(c) a loop without a preamble gets no region', () => {
    const source = `
      'use client'
      import { createSignal } from '@barefootjs/client'
      export function Plain() {
        const [items, setItems] = createSignal([{ id: 1, name: 'a' }])
        return <ul>{items().map(t => <li key={t.id}>{t.name}</li>)}</ul>
      }
    `
    const { clientJs } = compileWith(new TestAdapter(), source)
    expect(clientJs).not.toContain("kind: 'markup'")
  })

  test('(c) a static-array loop with a preamble gets no region', () => {
    const source = `
      import { createSignal } from '@barefootjs/client'
      const items = [{ id: 1, done: false }, { id: 2, done: true }]
      export function StaticRows() {
        return (
          <table><tbody>
            {items.map((t) => {
              const stateLabel = t.done ? 'done' : 'open'
              const cells = []
              cells.push(<td>{stateLabel}</td>)
              return <tr key={t.id}>{cells}<td>{t.id}</td></tr>
            })}
          </tbody></table>
        )
      }
    `
    const { clientJs } = compileWith(new TestAdapter(), source)
    expect(clientJs).not.toContain("kind: 'markup'")
  })

  test('(d) a preamble local never referenced by an expression child gets no region', () => {
    const source = `
      'use client'
      import { createSignal } from '@barefootjs/client'
      export function Unread() {
        const [todos, setTodos] = createSignal([{ id: 1, name: 'a', done: false }])
        return (
          <ul>
            {todos().map((t) => {
              // Declared but never read as a bare expression child anywhere
              // in the returned JSX — nothing qualifies for a region.
              const stateLabel = t.done ? 'done' : 'open'
              return <li key={t.id}>{t.name}</li>
            })}
          </ul>
        )
      }
    `
    const { clientJs } = compileWith(new TestAdapter(), source)
    expect(clientJs).not.toContain("kind: 'markup'")
  })
})
