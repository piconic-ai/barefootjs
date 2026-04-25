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
})
