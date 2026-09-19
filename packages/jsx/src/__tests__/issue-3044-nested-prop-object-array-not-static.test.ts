/**
 * #3044 — a client component receiving a REACTIVE prop that is an OBJECT
 * (`{ data }: { data: { items: T[] } }`), whose body maps a nested array
 * property off that prop (`data.items.map(...)`), stayed on the static
 * SSR-row-bind path instead of `mapArray`. `isArrayExprDirectPropRef`
 * (jsx-to-ir.ts) recognized:
 *   (a) a bare identifier that is itself a destructured prop (`items.map(...)`
 *       when `items` is the prop), and
 *   (b) a property access rooted at the WHOLE props object (`props.items`,
 *       one member access deep).
 * Neither covered a property access rooted at a destructured OBJECT-shaped
 * prop (`data.items`, where `data` — not `items` — is the prop): the
 * `.expression` of `data.items` is the identifier `data`, which is a
 * destructured prop binding rather than the whole props object, so case (b)
 * (gated on `propsObjName`, which is null in destructured-prop mode) never
 * matched. The loop was classified `isStaticArray: true`, so when the
 * parent signal driving `data` went from `{ items: [] }` (SSR) to
 * `{ items: [...] }` (e.g. in `onMount`), the child's static `forEach`-bind
 * init only ran once against the empty SSR row set and never inserted rows.
 *
 * Fix: `isArrayExprDirectPropRef`'s property-access branch now walks to the
 * ROOT identifier of the (possibly chained) member-access expression and
 * accepts it either as the whole props object OR as a destructured prop
 * binding (via the same `isDirectPropBindingName` terminal (a) already
 * uses), through the same alias-hop chain as before.
 */

import { describe, test, expect } from 'bun:test'
import { compileJSX } from '../compiler'
import { analyzeComponent } from '../analyzer'
import { jsxToIR } from '../jsx-to-ir'
import { TestAdapter } from '../adapters/test-adapter'
import type { IRNode } from '../types'

const adapter = new TestAdapter()

function getClientJs(source: string, filename: string): string {
  const result = compileJSX(source, filename, { adapter })
  expect(result.errors.filter(e => e.severity === 'error')).toHaveLength(0)
  const clientJs = result.files.find(f => f.type === 'clientJs')
  expect(clientJs).toBeDefined()
  return clientJs!.content
}

/** First `IRLoop` node found in a DFS of the component IR. */
function findLoop(node: IRNode | null, predicate: (n: any) => boolean = () => true): any {
  if (!node || typeof node !== 'object') return undefined
  if ((node as any).type === 'loop' && predicate(node)) return node
  for (const key of Object.keys(node)) {
    const v = (node as any)[key]
    if (Array.isArray(v)) {
      for (const c of v) {
        const found = findLoop(c, predicate)
        if (found) return found
      }
    } else if (v && typeof v === 'object') {
      const found = findLoop(v, predicate)
      if (found) return found
    }
  }
  return undefined
}

function loopFlags(source: string, filename: string, predicate?: (n: any) => boolean) {
  const ctx = analyzeComponent(source, filename, 'ReproChild')
  const ir = jsxToIR(ctx)
  expect(ir).not.toBeNull()
  const loop = findLoop(ir, predicate)
  expect(loop).toBeDefined()
  return { isStaticArray: loop.isStaticArray as boolean, isPropDerivedArray: loop.isPropDerivedArray as boolean | undefined }
}

describe('#3044 — nested array off a destructured object prop uses mapArray, not the static path', () => {
  test('headline repro: `data.items.map(...)` where `data` is a destructured object prop uses mapArray', () => {
    const clientJs = getClientJs(`
      'use client'
      export type ReproData = { items: { id: string; label: string }[] }
      export function ReproChild({ data }: { data: ReproData }) {
        return (
          <ul aria-label="items">
            {data.items.map((item) => <li key={item.id}>{item.label}</li>)}
          </ul>
        )
      }
    `, 'ReproChild.tsx')
    expect(clientJs).toMatch(/\bmapArray(Lazy)?\s*\(/)
    expect(clientJs).not.toMatch(/qsaChildScopes\(/)
  })

  test('flags: `data.items.map(...)` is classified isPropDerivedArray / non-static', () => {
    const flags = loopFlags(`
      'use client'
      export type ReproData = { items: { id: string; label: string }[] }
      export function ReproChild({ data }: { data: ReproData }) {
        return (
          <ul aria-label="items">
            {data.items.map((item) => <li key={item.id}>{item.label}</li>)}
          </ul>
        )
      }
    `, 'ReproChildFlags.tsx')
    expect(flags.isStaticArray).toBe(false)
    expect(flags.isPropDerivedArray).toBe(true)
  })

  test('an alias hop of the destructured object prop also uses mapArray (`const d = data; d.items.map(...)`)', () => {
    const flags = loopFlags(`
      'use client'
      export type ReproData = { items: { id: string; label: string }[] }
      export function ReproChild({ data }: { data: ReproData }) {
        const d = data
        return <ul>{d.items.map((item) => <li key={item.id}>{item.label}</li>)}</ul>
      }
    `, 'AliasedObjectProp.tsx')
    expect(flags.isStaticArray).toBe(false)
    expect(flags.isPropDerivedArray).toBe(true)
  })

  test('whole-props form, two-level chain (`props.data.items.map(...)`) also uses mapArray', () => {
    const flags = loopFlags(`
      'use client'
      export type ReproData = { items: { id: string; label: string }[] }
      export function ReproChild(props: { data: ReproData }) {
        return <ul>{props.data.items.map((item) => <li key={item.id}>{item.label}</li>)}</ul>
      }
    `, 'WholePropsTwoLevel.tsx')
    expect(flags.isStaticArray).toBe(false)
    expect(flags.isPropDerivedArray).toBe(true)
  })

  test('false-positive guard: a nested array off an unrelated local object (not a prop) stays static', () => {
    const flags = loopFlags(`
      'use client'
      export function ReproChild({ data }: { data: { items: { id: string; label: string }[] } }) {
        const state = { items: [{ id: 'z', label: 'z' }] }
        return <ul>{state.items.map((item) => <li key={item.id}>{item.label}</li>)}</ul>
      }
    `, 'NameCollisionObjectProp.tsx')
    expect(flags.isStaticArray).toBe(true)
    expect(flags.isPropDerivedArray).toBeUndefined()
  })

  // Pullfrog review findings on the initial fix (both confirmed against the
  // real compiler before being fixed):

  test('pullfrog review finding: a local const aliasing `data.items` (one hop before .map()) also uses mapArray', () => {
    // `const items = data.items; items.map(...)` — the extremely common
    // "alias the array to a local const before mapping" pattern. The
    // initial fix only widened `isArrayExprDirectPropRef`'s OWN property-
    // access branch (the `.map()` array expression itself); it left
    // `isDirectPropBindingName`'s member-parsed check — used to resolve a
    // local const's value — still single-level (`parsed.object.kind ===
    // 'identifier' && parsed.object.name === propsObjName`), so this shape
    // reproduced #3044's exact silent-freeze bug one alias hop away.
    const flags = loopFlags(`
      'use client'
      export type ReproData = { items: { id: string; label: string }[] }
      export function ReproChild({ data }: { data: ReproData }) {
        const items = data.items
        return <ul>{items.map((item) => <li key={item.id}>{item.label}</li>)}</ul>
      }
    `, 'ConstAliasOfObjectProp.tsx')
    expect(flags.isStaticArray).toBe(false)
    expect(flags.isPropDerivedArray).toBe(true)
  })

  test('pullfrog review finding: a local const aliasing the whole-props two-level chain also uses mapArray', () => {
    // `const items = props.data.items; items.map(...)` — same gap as above,
    // reached through the whole-props (non-destructured) form instead.
    const flags = loopFlags(`
      'use client'
      export type ReproData = { items: { id: string; label: string }[] }
      export function ReproChild(props: { data: ReproData }) {
        const items = props.data.items
        return <ul>{items.map((item) => <li key={item.id}>{item.label}</li>)}</ul>
      }
    `, 'ConstAliasOfWholePropsChain.tsx')
    expect(flags.isStaticArray).toBe(false)
    expect(flags.isPropDerivedArray).toBe(true)
  })

  test('pullfrog review finding: a loop-row parameter shadowing the outer props-object name is not misclassified', () => {
    // `props.rows.map((props) => props.items.map(...))` — the inner `props`
    // is an arbitrary row value bound by the OUTER `.map()`, unrelated to
    // the real props object it happens to share a name with. The initial
    // fix's new property-access branch checked `name === propsObjName`
    // without the shadow guard `isDirectPropBindingName` uses right next to
    // it, and widened that unguarded check from a single member access
    // (`props.foo`) to an arbitrarily deep chain — increasing the blast
    // radius of a pre-existing gap. `isPropDerivedArray` feeds real
    // Go-adapter codegen decisions for nested components, so a false
    // positive here is a genuine misclassification risk, not just a
    // redundant `mapArray`.
    const ctx = analyzeComponent(`
      'use client'
      type Row = { items: { id: string; label: string }[] }
      export function Foo(props: { rows: Row[] }) {
        return (
          <div>
            {props.rows.map((props) => (
              <ul>{props.items.map((item) => <li key={item.id}>{item.label}</li>)}</ul>
            ))}
          </div>
        )
      }
    `, 'ShadowedPropsParam.tsx', 'Foo')
    const ir = jsxToIR(ctx)
    const inner = findLoop(ir, (n: any) => n.array === 'props.items')
    expect(inner).toBeDefined()
    expect(inner.isStaticArray).toBe(true)
    expect(inner.isPropDerivedArray).toBeUndefined()
  })
})
