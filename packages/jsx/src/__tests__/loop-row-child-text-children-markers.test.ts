/**
 * BarefootJS Compiler — keyed loop row: forwarded text children of a child
 * component keep their SSR slot markers on hydration (#3064).
 *
 * Given a keyed `.map()` row whose child component call receives
 * parent-owned reactive text as `children`
 * (`<TableRow key={...}><TableCell>{payment.id}</TableCell></TableRow>`),
 * the row's hydration effect used to rewrite each forwarded cell with
 * `__c.textContent = ...` on every run — including its OWN first run, which
 * fires immediately even when nothing has changed yet — discarding the
 * `<!--bf:^sN-->…<!--/-->` slot marker pair the server emitted around the
 * forwarded text. The fix patches through the marker (`$t`'s resolved Text
 * node, `.data =`) instead of clobbering the whole child root, mirroring
 * how a parent-owned text patches everywhere else in the compiler
 * (`packages/client/src/runtime/query.ts`'s `$t`/`textNodeAfterComment`).
 *
 * Real-browser regression pin: the shared `data-table` fixture
 * (`packages/adapter-tests/fixtures/data-table.ts`, `site/ui/components/
 * data-table-demo.tsx`'s `DataTablePreviewDemo` — see `oracle-quarantine.ts`,
 * quarantine removed by this same change) and the known-limitation entry
 * `loop-row-child-text-children-markers-dropped` (deleted by this change).
 */

import { describe, test, expect } from 'bun:test'
import { compileJSX } from '../compiler'
import { TestAdapter } from '../adapters/test-adapter'

const adapter = new TestAdapter()

describe('keyed loop row: forwarded text children keep their SSR markers (#3064)', () => {
  test('a single bare-expression child patches through $t, not textContent', () => {
    const source = `
      'use client'
      import { createSignal } from '@barefootjs/client'

      function Cell({ children }: { children?: any }) {
        return <td>{children}</td>
      }
      function Row({ children }: { children?: any }) {
        return <tr>{children}</tr>
      }

      type Payment = { id: string }

      export function Table() {
        const [payments] = createSignal<Payment[]>([])
        return (
          <table>
            <tbody>
              {payments().map(payment => (
                <Row key={payment.id}>
                  <Cell>{payment.id}</Cell>
                </Row>
              ))}
            </tbody>
          </table>
        )
      }
    `
    const result = compileJSX(source, 'Table.tsx', { adapter })
    expect(result.errors).toHaveLength(0)
    const content = result.files.find((f) => f.type === 'clientJs')!.content

    // Must patch through the marker-aware $t primitive, not blindly
    // overwrite the whole child root's textContent (which would discard
    // the SSR `<!--bf:^sN-->…<!--/-->` marker pair around `payment.id`).
    expect(content).toContain('$t(__c,')
    expect(content).not.toMatch(/__c\.textContent = Array\.isArray\(__v\) \? __v\.join/)
    // The resolved Text node's `.data` is written, not innerHTML/textContent.
    expect(content).toMatch(/\.data = String\(payment\(\)\.id/)
  })

  test('mixed static text + expression child (e.g. "$" + amount) only patches the expression slot', () => {
    const source = `
      'use client'
      import { createSignal } from '@barefootjs/client'

      function Cell({ children }: { children?: any }) {
        return <td>{children}</td>
      }
      function Row({ children }: { children?: any }) {
        return <tr>{children}</tr>
      }

      type Payment = { id: string; amount: number }

      export function Table() {
        const [payments] = createSignal<Payment[]>([])
        return (
          <table>
            <tbody>
              {payments().map(payment => (
                <Row key={payment.id}>
                  <Cell>\${payment.amount.toFixed(2)}</Cell>
                </Row>
              ))}
            </tbody>
          </table>
        )
      }
    `
    const result = compileJSX(source, 'Table.tsx', { adapter })
    expect(result.errors).toHaveLength(0)
    const content = result.files.find((f) => f.type === 'clientJs')!.content

    expect(content).toContain('$t(__c,')
    expect(content).toMatch(/\.data = String\(payment\(\)\.amount\.toFixed\(2\)/)
    // The static "$" text must never be part of a patch expression — only
    // the reactive part gets its own marker/slot.
    expect(content).not.toMatch(/\.data = String\(\["\$"/)
  })

  test('composite loop (plain-element row + nested component + inner loop) patches through $t too', () => {
    // `emitComponentAndEventSetup` (control-flow/shared.ts) is the SAME
    // decision + emission `stringify/component-loop.ts`'s `emitNestedInit`
    // used to duplicate, for the composite-loop shape (a plain-element loop
    // row with both a nested child component AND an inner `.map()`, which
    // routes through `upsertChild` instead of `initChild`+`createComponent`).
    // #3064's fix lives in the ONE shared `buildChildrenTextEffect`/
    // `stringifyChildrenTextEffect` pair both call, so this shape must be
    // covered by its own fixture, not just inferred from the component-root
    // case above.
    const source = `
      'use client'
      import { createSignal } from '@barefootjs/client'

      function Badge({ children }: { children?: any }) {
        return <span>{children}</span>
      }

      type Item = { id: number; name: string; tags: string[] }

      export function List() {
        const [items] = createSignal<Item[]>([])
        return (
          <ul>
            {items().map(item => (
              <li key={item.id}>
                {item.tags.map(tag => <em key={tag}>{tag}</em>)}
                <Badge>{item.name}</Badge>
              </li>
            ))}
          </ul>
        )
      }
    `
    const result = compileJSX(source, 'List.tsx', { adapter })
    expect(result.errors).toHaveLength(0)
    const content = result.files.find((f) => f.type === 'clientJs')!.content

    // upsertChild confirms this row is on the composite (not component-root)
    // path — the shape `emitComponentAndEventSetup` handles.
    expect(content).toContain('upsertChild(')
    expect(content).toContain('$t(__c,')
    expect(content).toMatch(/\.data = String\(item\(\)\.name/)
    expect(content).not.toMatch(/__c\.textContent = Array\.isArray\(__v\) \? __v\.join/)
  })
})
