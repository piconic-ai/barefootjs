/**
 * #2724 — a bare `const x = y` alias hop between a prop and a keyed
 * `.map()` of child components made the loop's array look, to
 * `isArrayExprDirectPropRef` (jsx-to-ir.ts), like a local constant with no
 * prop/signal origin. The loop was then classified `isStaticArray: true`
 * and compiled to the static `qsaChildScopes` + `forEach` init path instead
 * of `mapArray`. That static path's `renderChild()` calls (client runtime)
 * carry no `bf-h`/`bf-m` scope-relationship attributes on a CSR-only mount
 * (no existing SSR markup to hydrate against), so the `qsaChildScopes`
 * selector in the static init never matches — the row's child component
 * never gets `initChild`ed, so its signals and event listeners never wire
 * up. Found by the #2481 mutation sweep's `alias-props` mutation against
 * the `toggle-shared` fixture (`packages/adapter-tests/e2e/
 * mutation-quarantine.ts`'s former G4 entry).
 *
 * Fix: `isArrayExprDirectPropRef` now resolves a bare identifier (or, for a
 * `props.<key>`-shaped array, the property access's OBJECT) through a
 * `const x = y` alias-hop chain via `resolveAliasOrigin` (`props-binding.ts`)
 * — the same shared walker `forwardsCallerRestProps` already uses for the
 * rest/props-spread alias case — checking, at each hop, whether the name is
 * itself a destructured prop OR a local constant whose `.parsed` shape is a
 * bare `<propsObjName>.<key>` member access. Deliberately structural
 * (AST-derived), not the regex-based `isPropsReference`: this return value
 * also feeds `IRLoop.isPropDerivedArray`, which the Go adapter reads to
 * decide whether a nested component's field is literally the loop's
 * prop-sourced data, so a regex false positive here would misclassify
 * DSL-adapter codegen too, not just add a redundant `mapArray`.
 *
 * A design review of the initial fix (before it merged) found the
 * unrestricted alias-hop walk introduced two NEW false positives of its
 * own — both covered below (the "review finding" tests) — plus one gap in
 * the same bug class the initial fix didn't reach (the destructure-rename
 * test) and one pre-existing, out-of-scope imprecision fixed separately by
 * #2835 (see the comment at the bottom).
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
  const ctx = analyzeComponent(source, filename, 'List')
  const ir = jsxToIR(ctx)
  expect(ir).not.toBeNull()
  const loop = findLoop(ir, predicate)
  expect(loop).toBeDefined()
  return { isStaticArray: loop.isStaticArray as boolean, isPropDerivedArray: loop.isPropDerivedArray as boolean | undefined }
}

const CHILD = `
  type ItemProps = { label: string }
  function Item(props: ItemProps) {
    const [on, setOn] = createSignal(false)
    return <button onClick={() => setOn(!on())}>{props.label}: {on() ? 'ON' : 'OFF'}</button>
  }
`

describe('#2724 — prop-alias keyed loop stays on mapArray, not the static path', () => {
  test('one-hop alias of a destructured prop uses mapArray', () => {
    const clientJs = getClientJs(`
      'use client'
      import { createSignal } from '@barefootjs/client'
      ${CHILD}
      type Props = { items: ItemProps[] }
      export function List({ items }: Props) {
        const items__alias = items
        return <div>{items__alias.map((item) => <Item key={item.label} label={item.label} />)}</div>
      }
    `, 'AliasHop.tsx')
    expect(clientJs).toMatch(/\bmapArray(Lazy)?\s*\(/)
    expect(clientJs).not.toMatch(/qsaChildScopes\(/)
  })

  test('local const derived from a whole-props member access uses mapArray', () => {
    const clientJs = getClientJs(`
      'use client'
      import { createSignal } from '@barefootjs/client'
      ${CHILD}
      type Props = { items: ItemProps[] }
      export function List(props: Props) {
        const arr = props.items
        return <div>{arr.map((item) => <Item key={item.label} label={item.label} />)}</div>
      }
    `, 'MemberAlias.tsx')
    expect(clientJs).toMatch(/\bmapArray(Lazy)?\s*\(/)
    expect(clientJs).not.toMatch(/qsaChildScopes\(/)
  })

  test('two-hop alias chain uses mapArray', () => {
    const clientJs = getClientJs(`
      'use client'
      import { createSignal } from '@barefootjs/client'
      ${CHILD}
      type Props = { items: ItemProps[] }
      export function List({ items }: Props) {
        const a1 = items
        const a2 = a1
        return <div>{a2.map((item) => <Item key={item.label} label={item.label} />)}</div>
      }
    `, 'TwoHop.tsx')
    expect(clientJs).toMatch(/\bmapArray(Lazy)?\s*\(/)
    expect(clientJs).not.toMatch(/qsaChildScopes\(/)
  })

  test('an alias of the WHOLE props object, accessed via property access, uses mapArray', () => {
    // `const p = props; p.items.map(...)` — the same shape
    // `packages/adapter-tests/mutation/mutations.ts`'s `alias-props`
    // mutation produces for a `(props)`-arg component. Unlike a bare-
    // identifier alias, this shape isn't caught by the Go adapter's BF101
    // gate either (that gate only matches bare-identifier array
    // expressions), so before this fix it stayed silently misclassified
    // as static instead of erroring loudly.
    const flags = loopFlags(`
      'use client'
      ${CHILD}
      type Props = { items: ItemProps[] }
      export function List(props: Props) {
        const p = props
        return <div>{p.items.map((item) => <Item key={item.label} label={item.label} />)}</div>
      }
    `, 'ObjectAlias.tsx')
    expect(flags.isStaticArray).toBe(false)
    expect(flags.isPropDerivedArray).toBe(true)
  })

  test('a two-hop alias of the whole props object also uses mapArray', () => {
    const flags = loopFlags(`
      'use client'
      ${CHILD}
      type Props = { items: ItemProps[] }
      export function List(props: Props) {
        const p1 = props
        const p2 = p1
        return <div>{p2.items.map((item) => <Item key={item.label} label={item.label} />)}</div>
      }
    `, 'ObjectAliasTwoHop.tsx')
    expect(flags.isStaticArray).toBe(false)
    expect(flags.isPropDerivedArray).toBe(true)
  })

  test('a body-destructured RENAME of a prop uses mapArray', () => {
    // `const { items: rows } = props` — same bug class as the headline
    // fix, but via a different route: the analyzer's body-destructure
    // expansion (`collectConstant`, analyzer.ts) never attached a
    // structured `.parsed` to the expanded constant, so the member-access
    // recognition this fix relies on had nothing to read. An UN-renamed
    // destructure (`const { items } = props`) worked before this fix too,
    // but only because the local name happens to equal a `props` type
    // member name, which the rename breaks.
    const flags = loopFlags(`
      'use client'
      ${CHILD}
      type Props = { items: ItemProps[] }
      export function List(props: Props) {
        const { items: rows } = props
        return <div>{rows.map((item) => <Item key={item.label} label={item.label} />)}</div>
      }
    `, 'RenamedDestructure.tsx')
    expect(flags.isStaticArray).toBe(false)
    expect(flags.isPropDerivedArray).toBe(true)
  })

  test('regression guard: a genuinely static module-level array still takes the static path', () => {
    const clientJs = getClientJs(`
      'use client'
      import { createSignal } from '@barefootjs/client'
      ${CHILD}
      const ITEMS: ItemProps[] = [{ label: 'a' }, { label: 'b' }]
      export function List() {
        return <div>{ITEMS.map((item) => <Item key={item.label} label={item.label} />)}</div>
      }
    `, 'ModuleConst.tsx')
    expect(clientJs).toMatch(/qsaChildScopes\(/)
    expect(clientJs).not.toMatch(/\bmapArray(Lazy)?\s*\(/)
  })

  test('false-positive guard: an unrelated local object that merely shares a prop-like key name stays static', () => {
    // `state.items` must not be mistaken for `props.items` just because
    // `items` is also a destructured prop name elsewhere in the component —
    // the alias walk only ever resolves `state`'s OWN declaration, never a
    // same-named identifier's meaning at a different binding site.
    const clientJs = getClientJs(`
      'use client'
      import { createSignal } from '@barefootjs/client'
      ${CHILD}
      type Props = { items: ItemProps[] }
      export function List({ items }: Props) {
        const state = { items: [{ label: 'z' }] }
        return <div>{state.items.map((item) => <Item key={item.label} label={item.label} />)}</div>
      }
    `, 'NameCollision.tsx')
    expect(clientJs).toMatch(/qsaChildScopes\(/)
    expect(clientJs).not.toMatch(/\bmapArray(Lazy)?\s*\(/)
  })

  test('review finding (second pass): a `let` alias of a prop still uses mapArray, not the static path', () => {
    // A first review pass restricted the alias-hop walk to `const` only,
    // reasoning that a reassignable `let` doesn't promise "this IS the
    // prop's own data". That reasoning does not hold: `isStaticArray`
    // treats "not recognized as prop-derived" as STATIC, not dynamic, so
    // excluding `let` doesn't move a `let`-aliased prop array to the safe
    // (over-reconciling) side — it silently reproduces #2724's own bug
    // shape for exactly this case (the array stays on the static
    // `qsaChildScopes` path, so a CSR-only mount never wires up the row's
    // child). Reverted in a second review pass; see `propAliasHopCandidates`'s
    // docstring (jsx-to-ir.ts) for the full reasoning, including why this
    // is safe for the Go-adapter-facing `isPropDerivedArray` reading too.
    const flags = loopFlags(`
      'use client'
      ${CHILD}
      type Props = { items: ItemProps[] }
      export function List({ items }: Props) {
        let cur = items
        return <div>{cur.map((item) => <Item key={item.label} label={item.label} />)}</div>
      }
    `, 'LetAlias.tsx')
    expect(flags.isStaticArray).toBe(false)
    expect(flags.isPropDerivedArray).toBe(true)
  })

  test('review finding: an inner loop is not misclassified through an outer alias const its own row parameter shadows', () => {
    // `rows.map((list) => list.map(...))` where a component-scope
    // `const list = items` exists SEPARATELY: the inner loop's `list` must
    // resolve to the OUTER LOOP'S ROW VALUE (not itself prop-derived —
    // it's an arbitrary array-of-arrays element), never hop into the
    // unrelated, shadowed `const list = items` just because the names
    // collide. Confirmed via a direct IR probe during review that this
    // shape reaches the Go adapter's real `isPropDerived`-branching
    // codegen (`go-template-adapter.ts`) rather than being caught by its
    // BF101 gate — that gate explicitly allows a scope-bound array name
    // through (`!this.scope.isBound(arrayName)`), so a wrong flag here
    // would have reached real Go output, not just this IR.
    const ctx = analyzeComponent(`
      'use client'
      ${CHILD}
      type Props = { rows: ItemProps[][]; items: ItemProps[] }
      export function List({ rows, items }: Props) {
        const list = items
        return (
          <div>
            {rows.map((list, ri) => (
              <ul key={ri}>{list.map((item) => <Item key={item.label} label={item.label} />)}</ul>
            ))}
          </div>
        )
      }
    `, 'ShadowedAlias.tsx', 'List')
    const ir = jsxToIR(ctx)
    const innerLoop = findLoop(ir, (n: any) => n.array === 'list')
    expect(innerLoop).toBeDefined()
    expect(innerLoop.isStaticArray).toBe(true)
    expect(innerLoop.isPropDerivedArray).toBeUndefined()
  })

  test('pullfrog review finding: shadow guard also applies when the shadowed outer const is member-access-valued', () => {
    // The previous test's `const list = items` is IDENTIFIER-valued, so its
    // `.parsed` is `{kind: 'identifier'}` — that shape never satisfies
    // `isDirectPropBindingName`'s member-access branch, so it never
    // exercised that branch's own shadow-awareness. A MEMBER-ACCESS-valued
    // shadowed const (`const list = props.entries`) does: `isArrayExprDirectPropRef`
    // calls `isDirectPropBindingName("list", ctx)` as the very FIRST
    // `resolveAliasOrigin` terminal check, before any hop — and that
    // function used to read the shadow-unaware `constantsByName(ctx)`
    // index directly, finding the outer `list` and recognizing its
    // `props.entries` value as prop-derived, entirely bypassing
    // `propAliasHopCandidates`'s shadow filter (which only ever guards hop
    // CONTINUATION, never this first call). Fixed by adding the same
    // `ctx.scope.isBound` guard directly to `isDirectPropBindingName`.
    const ctx = analyzeComponent(`
      'use client'
      ${CHILD}
      type Props = { rows: ItemProps[][]; entries: ItemProps[] }
      export function List(props: Props) {
        const list = props.entries
        return (
          <div>
            {props.rows.map((list, ri) => (
              <ul key={ri}>{list.map((item) => <Item key={item.label} label={item.label} />)}</ul>
            ))}
          </div>
        )
      }
    `, 'ShadowedMemberAlias.tsx', 'List')
    const ir = jsxToIR(ctx)
    const innerLoop = findLoop(ir, (n: any) => n.array === 'list')
    expect(innerLoop).toBeDefined()
    expect(innerLoop.isStaticArray).toBe(true)
    expect(innerLoop.isPropDerivedArray).toBeUndefined()
  })

  test('regression guard: a chained `.filter()` alias stays static (no function call on the FINAL hop)', () => {
    const flags = loopFlags(`
      'use client'
      ${CHILD}
      type Props = { items: ItemProps[] }
      export function List({ items }: Props) {
        const a = items.filter((i) => i.label.length > 0)
        const b = a
        return <div>{b.map((item) => <Item key={item.label} label={item.label} />)}</div>
      }
    `, 'FilterChainAlias.tsx')
    expect(flags.isStaticArray).toBe(true)
  })

  test('regression guard: `??` fallback on a props member stays static (#2806)', () => {
    const flags = loopFlags(`
      'use client'
      ${CHILD}
      type Props = { items?: ItemProps[] }
      export function List(props: Props) {
        const arr = props.items ?? []
        return <div>{arr.map((item) => <Item key={item.label} label={item.label} />)}</div>
      }
    `, 'NullishFallback.tsx')
    expect(flags.isStaticArray).toBe(true)
  })
})

/**
 * The pre-existing `(props: Props)`-shape name-collision imprecision noted
 * here previously is fixed — see #2835 and
 * `issue-2835-props-type-member-name-collision.test.ts`.
 */
