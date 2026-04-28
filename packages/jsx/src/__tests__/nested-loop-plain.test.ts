/**
 * BarefootJS Compiler — Plain nested loops without a conditional wrapper
 *
 * Sibling case of nested-loop-conditional.test.ts, which covers
 * `outer.map(n => { n.cond ? { inner.map(...) } : null })` (an inner
 * loop wrapped in a conditional).
 *
 * This file covers the bug surfaced while building the State Machine
 * Playground block (Phase 9 blocks, issue #135): a direct inner
 * `.map()` inside the outer `.map()` callback body — with no
 * conditional wrapping the inner — is not emitted as a nested
 * `mapArray()` when the outer loop itself lives inside a reactive
 * conditional branch.
 *
 * Shape that breaks:
 *
 *   {show() ? null : (
 *     <ul>
 *       {groups().map(g => (
 *         <div>
 *           <ul>
 *             {g.entries.map(e => <li>{e.text}</li>)}   // no mapArray emitted
 *           </ul>
 *         </div>
 *       ))}
 *     </ul>
 *   )}
 *
 * Observed output: one `mapArray()` for `groups()` inside the
 * conditional branch's `bindEvents`. The inner `g.entries.map()` is
 * only present as a static `.map().join('')` inside the outer item's
 * `template()` innerHTML. When the outer mapArray reuses an existing
 * element (group key unchanged), the inner list never re-renders — so
 * entries appended to an existing group never appear in the DOM.
 *
 * Expected: every inner `.map()` whose source is an outer-param-derived
 * expression should be wired as a nested `mapArray()`, regardless of
 * whether the outer loop sits at the top level or inside a conditional
 * branch.
 */

import { describe, test, expect } from 'bun:test'
import { compileJSXSync } from '../compiler'
import { TestAdapter } from '../adapters/test-adapter'

const adapter = new TestAdapter()

describe('plain nested loops without conditional wrapper', () => {
  test('baseline: inner .map() directly inside outer .map() at top level wires nested mapArray', () => {
    const source = `
      'use client'
      import { createSignal, createMemo } from '@barefootjs/client'

      type Entry = { id: number; text: string }
      type Group = { key: string; entries: Entry[] }

      export function GroupedList() {
        const [entries, setEntries] = createSignal<Entry[]>([])
        const groups = createMemo<Group[]>(() => [{ key: 'all', entries: entries() }])

        return (
          <div>
            {groups().map((g: Group) => (
              <div key={g.key}>
                <ul>
                  {g.entries.map((e: Entry) => (
                    <li key={String(e.id)}>{e.text}</li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )
      }
    `
    const result = compileJSXSync(source, 'GroupedList.tsx', { adapter })
    expect(result.errors).toHaveLength(0)

    const clientJs = result.files.find(f => f.type === 'clientJs')
    expect(clientJs).toBeDefined()
    const js = clientJs!.content

    // 2 mapArrays expected: groups(), g.entries.
    const mapArrayCount = (js.match(/\bmapArray\(/g) || []).length
    expect(mapArrayCount).toBeGreaterThanOrEqual(2)
  })

  test('regression: inner .map() inside outer .map() inside a conditional branch wires nested mapArray', () => {
    // Same shape as the State Machine Playground's history rendering:
    //   { count() === 0 ? <p>empty</p> : <ul>{groups().map(g => <div><ul>{g.entries.map(...)}</ul></div>)}</ul> }
    const source = `
      'use client'
      import { createSignal, createMemo } from '@barefootjs/client'

      type Entry = { id: number; text: string }
      type Group = { key: string; entries: Entry[] }

      export function GroupedList() {
        const [entries, setEntries] = createSignal<Entry[]>([])
        const groups = createMemo<Group[]>(() => [{ key: 'all', entries: entries() }])
        const count = createMemo(() => entries().length)

        return (
          <div>
            {count() === 0 ? (
              <p>empty</p>
            ) : (
              <ul>
                {groups().map((g: Group) => (
                  <div key={g.key}>
                    <ul>
                      {g.entries.map((e: Entry) => (
                        <li key={String(e.id)}>{e.text}</li>
                      ))}
                    </ul>
                  </div>
                ))}
              </ul>
            )}
          </div>
        )
      }
    `
    const result = compileJSXSync(source, 'GroupedList.tsx', { adapter })
    expect(result.errors).toHaveLength(0)

    const clientJs = result.files.find(f => f.type === 'clientJs')
    expect(clientJs).toBeDefined()
    const js = clientJs!.content

    // 2 mapArrays expected: groups() inside the conditional branch, and
    // g.entries inside each group.
    // Bug: only groups() gets a mapArray; g.entries is baked into
    // static innerHTML. So entries added to an existing group do not
    // render on the client.
    const mapArrayCount = (js.match(/\bmapArray\(/g) || []).length
    expect(mapArrayCount).toBeGreaterThanOrEqual(2)
  })

  test('regression: 3-level nested loop wires mapArray at the deepest level (not forEach)', () => {
    // Before the fix, `emitInnerLoopSetup` decided "is this loop reactive?"
    // by checking the IR's `inner.refsOuterParam` — a flag set at collect
    // time against the *outermost* loop's param only. At depth 2+, the array
    // expression typically references the *immediate* parent (e.g.
    // `g.items` inside `t.groups.map(g => ...)` body), so the check failed
    // and the loop fell through to the static `forEach` branch. Result:
    // additions / removals at the deepest level silently never reached
    // the DOM.
    //
    // Fix: re-check dynamically at each level against the parent param
    // passed in, and narrow the parent param when recursing into child
    // levels.
    const source = `
      'use client'
      import { createSignal } from '@barefootjs/client'
      export function T() {
        const [tree, setTree] = createSignal([
          { id: 1, groups: [{ id: 11, items: [{ id: 111, n: 'a' }] }] },
        ])
        return (
          <ul onClick={() => setTree(prev => [...prev])}>
            {tree().map(t => (
              <li key={t.id}>
                <ul>
                  {t.groups.map(g => (
                    <li key={g.id}>
                      <ul>{g.items.map(it => <li key={it.id}>{it.n}</li>)}</ul>
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        )
      }
    `
    const result = compileJSXSync(source, 'T.tsx', { adapter })
    expect(result.errors.filter(e => e.severity === 'error')).toHaveLength(0)
    const js = result.files.find(f => f.type === 'clientJs')!.content

    // The deepest array (`g.items`) must appear inside a mapArray, with
    // its parent (`g`) wrapped as an accessor. If it ever falls back to
    // a `forEach`, this guard fires.
    expect(js).toMatch(/mapArray\(\(\)\s*=>\s*g\(\)\.items/)
    expect(js).not.toMatch(/\bg\.items\.forEach\b/)
    // All three levels must be reactive; expect at least 3 mapArray sites
    // (outer + two inner).
    const mapArrayCount = (js.match(/\bmapArray\(/g) || []).length
    expect(mapArrayCount).toBeGreaterThanOrEqual(3)
  })

  test('regression: composite renderItem hoists inner mapArray out of the SSR/CSR if/else (O-1)', () => {
    // Before the fix, the composite renderItem's SSR/CSR split duplicated
    // the entire inner-loop emission verbatim — both branches re-emitted
    // the same `qsa(__el, '[bf="..."]')` + `mapArray(() => g().items, ...)`
    // block. Doubled code size, doubled effect setup work, and any
    // future bug fix would have needed to be applied in two places.
    //
    // Fix: hoist `emitInnerLoopSetup` after the if/else (the mapArray
    // call it emits is mode-independent). For this 2-level fixture we
    // expect exactly 2 mapArray call sites in the file (outer + the
    // single deduped inner), not 3.
    const source = `
      'use client'
      import { createSignal } from '@barefootjs/client'
      export function L() {
        const [groups, setGroups] = createSignal([{ id: 1, items: [{ id: 11, n: 'a' }] }])
        return (
          <ul onClick={() => setGroups(prev => [...prev])}>
            {groups().map(g => (
              <li key={g.id}>
                <ul>{g.items.map(it => <li key={it.id}>{it.n}</li>)}</ul>
              </li>
            ))}
          </ul>
        )
      }
    `
    const result = compileJSXSync(source, 'L.tsx', { adapter })
    expect(result.errors.filter(e => e.severity === 'error')).toHaveLength(0)
    const js = result.files.find(f => f.type === 'clientJs')!.content

    const innerMapArrayCount = (js.match(/mapArray\(\(\)\s*=>\s*g\(\)\.items/g) || []).length
    expect(innerMapArrayCount).toBe(1)
  })

  test('regression #1052: inner .map() block-body locals are re-declared inside the mapArray renderItem', () => {
    // Before the fix, an inner `.map()` callback that declares local
    // variables (block body with `const x = ...`) and uses them in the
    // returned JSX produced a broken renderItem callback: the locals
    // appeared in the cloned-template IIFE but were never declared in
    // the renderItem closure, raising `ReferenceError: x is not defined`
    // when the inner mapArray needed to create new elements.
    //
    // Fix: thread the inner loop's `mapPreamble` through `NestedLoop`
    // and re-emit it (with inner+outer loop param references rewritten
    // to signal-accessor form) at the top of the renderItem callback so
    // the IIFE and any subsequent reads see the locals.
    const source = `
      'use client'
      import { createSignal } from '@barefootjs/client'

      type Cell = { id: number; value: string; flag: boolean }

      export function GridDemo() {
        const [grid, setGrid] = createSignal<Cell[][]>([
          [{ id: 1, value: 'a', flag: true }],
        ])
        return (
          <div onClick={() => setGrid(prev => [...prev])}>
            {grid().map((row, i) => (
              <div key={i}>
                {row.map((cell) => {
                  const derivedClass = cell.flag ? 'on' : 'off'
                  return (
                    <span key={cell.id} className={derivedClass}>{cell.value}</span>
                  )
                })}
              </div>
            ))}
          </div>
        )
      }
    `
    const result = compileJSXSync(source, 'GridDemo.tsx', { adapter })
    expect(result.errors.filter(e => e.severity === 'error')).toHaveLength(0)
    const js = result.files.find(f => f.type === 'clientJs')!.content

    // The inner mapArray's renderItem must declare `derivedClass` so the
    // new-element-creation IIFE doesn't throw `ReferenceError`. The
    // declaration must use `cell()` — the signal-accessor form of the
    // inner loop param — not the bare `cell` from the outer template.
    expect(js).toMatch(
      /\(cell, __innerIdx[^,]+, __existing\) => \{[\s\S]*?const\s+derivedClass\s*=\s*cell\(\)\.flag/
    )
    // Within the inner renderItem body (delimited by the outer
    // `mapArray(() => row()` block), every reference to the inner loop
    // param must be the accessor form — bare `cell.flag` would mean the
    // preamble wrapping pass missed a reference.
    const innerSection = js.slice(
      js.indexOf('mapArray(() => row()'),
      js.indexOf('return __innerEl1_0'),
    )
    expect(innerSection.length).toBeGreaterThan(0)
    expect(innerSection).not.toMatch(/\bcell\.flag\b/)
  })

  test('regression #1064: static inner forEach also re-declares inner .map() block-body locals', () => {
    // Sibling of #1052 in the **static** inner-loop emission path. When the
    // outer array is a plain literal (not a signal) and the inner `.map()`
    // callback's block-body declares locals referenced by a child component
    // prop or event handler, the static `forEach` body did not declare those
    // locals — `initChild`'s prop getter would throw `ReferenceError` when
    // the child component first mounted.
    //
    // Fix: thread `inner.mapPreamble` through `InnerLoopStaticEmit` and emit
    // it (raw — `forEach`'s param is the literal item, not a signal accessor)
    // at the top of the forEach body so the component setup can resolve the
    // locals.
    const source = `
      'use client'
      import { createSignal } from '@barefootjs/client'

      type Item = { id: number; n: number }

      function MyChild(props: { label: string }) {
        return <span>{props.label}</span>
      }

      export function StaticGrid() {
        const items: Item[][] = [[{ id: 1, n: 5 }]]
        const [, setX] = createSignal(0)
        return (
          <div onClick={() => setX(1)}>
            {items.map((row, i) => (
              <div key={i}>
                {row.map((it) => {
                  const lbl = \`item-\${it.n}\`
                  return <MyChild key={it.id} label={lbl} />
                })}
              </div>
            ))}
          </div>
        )
      }
    `
    const result = compileJSXSync(source, 'StaticGrid.tsx', { adapter })
    expect(result.errors.filter(e => e.severity === 'error')).toHaveLength(0)
    const js = result.files.find(f => f.type === 'clientJs')!.content

    // The static `forEach((it, ...) => { ... })` body must declare `lbl`
    // before `initChild('MyChild', ...)` runs. `it` is the raw item here
    // (forEach, not mapArray) so the preamble is emitted unwrapped.
    expect(js).toMatch(
      /\.forEach\(\(it, __innerIdx\) => \{[\s\S]*?const\s+lbl\s*=\s*`item-\$\{it\.n\}`[\s\S]*?initChild\('MyChild(?:__[a-f0-9]+)?'/
    )
    // No `ReferenceError` shape: the `initChild('MyChild', ...)` getter must
    // reach a declared `lbl` — the static body cannot rely on the outer
    // `.map()` callback's scope (that scope only existed at SSR time).
    const staticSection = js.slice(
      js.indexOf('items.forEach('),
      js.indexOf('hydrate(\'StaticGrid\''),
    )
    expect(staticSection).toMatch(/const\s+lbl\s*=/)
    expect(staticSection).toMatch(/initChild\('MyChild(?:__[a-f0-9]+)?'/)
    expect(staticSection.indexOf('const lbl')).toBeLessThan(staticSection.indexOf('initChild'))
  })

  test('regression #1064: single-comp static array with preamble (loop body is one component)', () => {
    // The `single-comp` static-init shape fires when the `.map()` body
    // returns a single component instance. Its `__childScopes.forEach`
    // body resolves the loop param via index lookup — but did not
    // declare outer `.map()` locals, so the propsExpr getter saw
    // `ReferenceError` at first render.
    const source = `
      'use client'
      import { createSignal } from '@barefootjs/client'

      type Item = { id: number; n: number }

      function MyChild(props: { label: string }) {
        return <span>{props.label}</span>
      }

      export function FlatList() {
        const items: Item[] = [{ id: 1, n: 5 }]
        const [, setX] = createSignal(0)
        return (
          <ul onClick={() => setX(1)}>
            {items.map((it) => {
              const lbl = \`item-\${it.n}\`
              return <MyChild key={it.id} label={lbl} />
            })}
          </ul>
        )
      }
    `
    const result = compileJSXSync(source, 'FlatList.tsx', { adapter })
    expect(result.errors.filter(e => e.severity === 'error')).toHaveLength(0)
    const js = result.files.find(f => f.type === 'clientJs')!.content

    // The single-comp emit declares the loop param via `[<idx>]` lookup;
    // the preamble must appear after that lookup and before initChild
    // so propsExpr getters can read it.
    const section = js.slice(
      js.indexOf('__childScopes.forEach'),
      js.indexOf('hydrate(\'FlatList\''),
    )
    expect(section).toMatch(/const\s+it\s*=\s*items\[__idx\][\s\S]*?const\s+lbl\s*=\s*`item-\$\{it\.n\}`[\s\S]*?initChild\('MyChild(?:__[a-f0-9]+)?'/)
    expect(section.indexOf('const lbl')).toBeLessThan(section.indexOf('initChild'))
  })

  test('regression #1064: inner-loop-nested static array with OUTER preamble', () => {
    // The `inner-loop-nested` shape carries two preamble slots
    // (`outerPreludeStatements` + `innerPreludeStatements`). The previous
    // test exercised the inner one; this one exercises the outer slot —
    // the outer preamble must land after `if (!__outerEl) return` and
    // before the inner forEach so the inner forEach's component setup
    // can read it.
    const source = `
      'use client'
      import { createSignal } from '@barefootjs/client'

      type Cell = { id: number; n: number }
      type Row = { id: number; cells: Cell[]; label: string }

      function MyChild(props: { tag: string }) {
        return <span>{props.tag}</span>
      }

      export function OuterPreambleGrid() {
        const rows: Row[] = [{ id: 1, label: 'top', cells: [{ id: 11, n: 5 }] }]
        const [, setX] = createSignal(0)
        return (
          <div onClick={() => setX(1)}>
            {rows.map((row) => {
              const rowTag = \`row-\${row.label}\`
              return (
                <div key={row.id}>
                  {row.cells.map((cell) => (
                    <MyChild key={cell.id} tag={rowTag + '-' + cell.n} />
                  ))}
                </div>
              )
            })}
          </div>
        )
      }
    `
    const result = compileJSXSync(source, 'OuterPreambleGrid.tsx', { adapter })
    expect(result.errors.filter(e => e.severity === 'error')).toHaveLength(0)
    const js = result.files.find(f => f.type === 'clientJs')!.content

    // The outer preamble (`const rowTag = ...`) must appear in the
    // outer forEach body, after `if (!__outerEl) return` and before the
    // inner forEach — and the inner forEach's `initChild` getter reads it.
    const section = js.slice(
      js.indexOf('rows.forEach('),
      js.indexOf('hydrate(\'OuterPreambleGrid\''),
    )
    expect(section).toMatch(/if \(!__outerEl\) return[\s\S]*?const\s+rowTag\s*=\s*`row-\$\{row\.label\}`[\s\S]*?\.cells\.forEach/)
    expect(section.indexOf('const rowTag')).toBeLessThan(section.indexOf('initChild'))
  })

  test('regression #1064: control-flow static inner forEach (signal outer + literal-array inner) emits inner preamble', () => {
    // The `control-flow/inner-loop.ts::emitStatic` path fires when a
    // reactive composite renderItem hosts a static inner loop — the
    // outer array is a signal, but the inner array is referenced via
    // a non-reactive lookup so its rendering stays setup-only.
    // Use a `__innerIdx<uid>` suffix in the regex to specifically
    // target this path (vs. the unsuffixed `static-array-child-init`).
    const source = `
      'use client'
      import { createSignal } from '@barefootjs/client'

      type Cell = { id: number; n: number }
      const SHARED: Cell[] = [{ id: 1, n: 7 }]

      function MyChild(props: { tag: string }) {
        return <span>{props.tag}</span>
      }

      export function MixedGrid() {
        const [rows, setRows] = createSignal([{ id: 1, key: 'a' }])
        return (
          <div onClick={() => setRows(prev => [...prev])}>
            {rows().map((row) => (
              <div key={row.id}>
                {SHARED.map((cell) => {
                  const tag = \`\${row.key}-\${cell.n}\`
                  return <MyChild key={cell.id} tag={tag} />
                })}
              </div>
            ))}
          </div>
        )
      }
    `
    const result = compileJSXSync(source, 'MixedGrid.tsx', { adapter })
    expect(result.errors.filter(e => e.severity === 'error')).toHaveLength(0)
    const js = result.files.find(f => f.type === 'clientJs')!.content

    // The static forEach uses a `__innerIdx<uid>` suffix in this path —
    // assert preamble appears in that body and precedes any prop read.
    expect(js).toMatch(/SHARED\.forEach\(\(cell, __innerIdx\d+_\d+\) => \{[\s\S]*?const\s+tag\s*=/)
  })
})
