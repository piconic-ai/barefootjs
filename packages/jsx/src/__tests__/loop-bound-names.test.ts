import { describe, test, expect } from 'bun:test'
import { analyzeComponent } from '../analyzer'
import { jsxToIR } from '../jsx-to-ir'
import { collectLoopBoundNames } from '../adapters/loop-bound-names'
import type { ComponentIR } from '../types'

// #2212 (Fable review): `collectLoopBoundNames` finds every name a loop
// callback binds as its item/index parameter, so each adapter's
// `collectStringValueNames` can exclude it from string-concat detection —
// a loop param shadowing an outer string-typed binding of the same name
// must never be misdetected as string-typed.
describe('collectLoopBoundNames (#2212)', () => {
  // `collectLoopBoundNames` only reads `.root`; the rest of `ComponentIR`
  // is irrelevant to this walk, so a minimal stand-in is fine here.
  function ir(source: string): ComponentIR {
    const ctx = analyzeComponent(source, 'Test.tsx')
    const root = jsxToIR(ctx)
    if (!root) throw new Error('expected IR')
    return { version: '0.1', metadata: {} as ComponentIR['metadata'], root, errors: [] }
  }

  test('a component with no loops has no bound names', () => {
    const component = ir(`
      function Test() { return <div>hi</div> }
      export { Test }
    `)
    expect(collectLoopBoundNames(component).size).toBe(0)
  })

  test('a simple loop param is bound', () => {
    const component = ir(`
      function Test({ items }: { items: string[] }) {
        return <ul>{items.map(name => <li key={name}>{name}</li>)}</ul>
      }
      export { Test }
    `)
    expect(collectLoopBoundNames(component)).toEqual(new Set(['name']))
  })

  test('both item and index params are bound', () => {
    const component = ir(`
      function Test({ items }: { items: string[] }) {
        return <ul>{items.map((name, idx) => <li key={idx}>{name}</li>)}</ul>
      }
      export { Test }
    `)
    expect(collectLoopBoundNames(component)).toEqual(new Set(['name', 'idx']))
  })

  test('nested loops contribute all their params', () => {
    const component = ir(`
      function Test({ groups }: { groups: { label: string; items: string[] }[] }) {
        return <div>{groups.map(group => <ul key={group.label}>{group.items.map(item => <li key={item}>{item}</li>)}</ul>)}</div>
      }
      export { Test }
    `)
    expect(collectLoopBoundNames(component)).toEqual(new Set(['group', 'item']))
  })

  test('a loop body wrapping a child component still contributes its param', () => {
    const component = ir(`
      import { Row } from './row'
      function Test({ items }: { items: string[] }) {
        return <ul>{items.map(item => <Row key={item} label={item} />)}</ul>
      }
      export { Test }
    `)
    expect(collectLoopBoundNames(component)).toEqual(new Set(['item']))
  })

  // Fable re-review (#2212): `param` holds the raw pattern text for a
  // destructured callback (`"{ name }"`), not the bound name itself — the
  // real bound names live in `paramBindings`. Adapters that lower a
  // destructure to a `{% set name = __bf_item.name %}`-style local (#2087)
  // leave `name` reachable as a bare identifier in the loop body, so it
  // needs the same exclusion as a plain loop param. `node.param`'s raw
  // pattern text still ends up in the set too (added unconditionally,
  // before this arm existed) — harmless noise, since it can never collide
  // with a real identifier name.
  test('a destructured loop param contributes its extracted binding names', () => {
    const component = ir(`
      function Test({ rows }: { rows: { name: string }[] }) {
        return <ul>{rows.map(({ name }) => <li key={name}>{name}</li>)}</ul>
      }
      export { Test }
    `)
    expect(collectLoopBoundNames(component)).toEqual(new Set(['{ name }', 'name']))
  })

  // Fable re-review (#2212): a `.filter(pred).map(cb)` chain's filter
  // predicate is emitted through the same binary/string-name machinery
  // using its OWN param, which may differ from the map callback's `param`.
  test('a filter().map() chain contributes both the filter predicate param and the map param', () => {
    const component = ir(`
      function Test({ values }: { values: number[] }) {
        return <ul>{values.filter(n => n > 3).map(v => <li key={v}>{v}</li>)}</ul>
      }
      export { Test }
    `)
    expect(collectLoopBoundNames(component)).toEqual(new Set(['n', 'v']))
  })
})
