import { describe, test, expect } from 'bun:test'
import { analyzeComponent } from '../analyzer'
import { jsxToIR } from '../jsx-to-ir'
import { templateNameCollisionErrors } from '../adapters/template-name-collisions'
import type { ComponentIR } from '../types'

// #3404: BF105 fires only for names visible at the same point — the
// component's own names and the bindings of the enclosing loop rows.
describe('templateNameCollisionErrors (#3404)', () => {
  function ir(source: string): ComponentIR {
    const ctx = analyzeComponent(source, 'Test.tsx')
    const root = jsxToIR(ctx)
    if (!root) throw new Error('expected IR')
    const metadata = { localConstants: [], localFunctions: [], signals: [], memos: [] } as unknown as ComponentIR['metadata']
    return { version: '0.1', metadata, root, errors: [] }
  }
  const ident = (name: string) => (name === 'loop' ? '__bf_loop' : name)
  const codes = (component: ComponentIR, props: string[]) =>
    templateNameCollisionErrors(component, props, ident, 'Jinja', 'Test').map(e => e.code)

  test('two props that share a template variable collide', () => {
    const component = ir(`
      function Test(props: { loop: string; __bf_loop: string }) { return <div>{props.loop}{props.__bf_loop}</div> }
      export { Test }
    `)
    expect(codes(component, ['loop', '__bf_loop'])).toEqual(['BF105'])
  })

  test('bindings of sibling loops do not collide', () => {
    const component = ir(`
      function Test(props: { a: string[]; b: string[] }) {
        return <div>
          <ul>{props.a.map(loop => <li key={loop}>{loop}</li>)}</ul>
          <ul>{props.b.map(__bf_loop => <li key={__bf_loop}>{__bf_loop}</li>)}</ul>
        </div>
      }
      export { Test }
    `)
    expect(codes(component, ['a', 'b'])).toEqual([])
  })

  test('a nested row binding collides with an enclosing row binding', () => {
    const component = ir(`
      function Test(props: { groups: string[][] }) {
        return <div>{props.groups.map(loop => <ul key={loop[0]}>{loop.map(__bf_loop => <li key={__bf_loop}>{__bf_loop}</li>)}</ul>)}</div>
      }
      export { Test }
    `)
    expect(codes(component, ['groups'])).toEqual(['BF105'])
  })

  test('a row binding collides with a prop', () => {
    const component = ir(`
      function Test(props: { loop: string; items: string[] }) {
        return <ul>{props.items.map(__bf_loop => <li key={__bf_loop}>{props.loop}</li>)}</ul>
      }
      export { Test }
    `)
    expect(codes(component, ['loop', 'items'])).toEqual(['BF105'])
  })
})
