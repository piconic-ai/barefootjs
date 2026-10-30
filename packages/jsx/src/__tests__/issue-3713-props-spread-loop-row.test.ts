/**
 * #3713 — Phase 1's props-object spread marker (`SpreadAttr.propsObject`)
 * on a child component inside a loop row. The client's loop-row props
 * builders merge a marked spread in source order through the shared
 * `childPropsObjectExpr`, so the marker must be set on a row's
 * `{...props}` and must not be set when a row binding named `props`
 * shadows the props object.
 *
 * The end-to-end runtime check (mount, row update, hydration) lives in
 * `packages/client/__tests__/runtime/issue-3713-props-spread-loop-row.test.ts`;
 * the rendered output is pinned by the `component-*-in-loop-row` and
 * `component-spread-props-in-static-loop-row` conformance fixtures.
 */
import { describe, test, expect } from 'bun:test'
import { analyzeComponent } from '../analyzer'
import { jsxToIR } from '../jsx-to-ir'
import type { IRNode, IRComponent, AttrValue } from '../types'

function findComponents(node: IRNode, name: string, out: IRComponent[] = []): IRComponent[] {
  if (node.type === 'component' && node.name === name) out.push(node)
  const children: IRNode[] = []
  if ('children' in node && Array.isArray(node.children)) children.push(...(node.children as IRNode[]))
  if (node.type === 'conditional') children.push(node.whenTrue, node.whenFalse)
  for (const child of children) findComponents(child, name, out)
  return out
}

function tagSpreads(source: string, componentName: string): AttrValue[] {
  const ctx = analyzeComponent(source, 'Repro.tsx', componentName)
  const ir = jsxToIR(ctx)!
  return findComponents(ir, 'Tag').map(tag => tag.props.find(p => p.name.startsWith('...'))!.value)
}

describe('#3713 — the props-object spread marker in loop rows', () => {
  test('a row spread of the props object is marked in every row shape', () => {
    const spreads = tagSpreads(`
      import { Tag } from './tag'
      export function List(props: { items: string[]; groups: { id: string; cells: string[] }[]; tone?: string }) {
        const fixed = ['x']
        return (
          <div>
            <ul>{props.items.map((it) => <Tag key={it} {...props} label={it} />)}</ul>
            <ol>{props.items.map((it) => <li key={it}>{props.tone ? <Tag {...props} /> : null}</li>)}</ol>
            <nav>{fixed.map((it) => <Tag key={it} {...props} />)}</nav>
            <dl>{props.groups.map((g) => <dd key={g.id}>{g.cells.map((c) => <Tag key={c} {...props} />)}</dd>)}</dl>
          </div>
        )
      }
    `, 'List')
    expect(spreads).toHaveLength(4)
    for (const spread of spreads) expect(spread).toMatchObject({ kind: 'spread', propsObject: true })
  })

  test('a loop row named `props` shadows the props object and is not marked', () => {
    const [spread] = tagSpreads(`
      import { Tag } from './tag'
      export function Shadow(props: { rows: { tone: string }[] }) {
        const rows = props.rows
        return <ul>{rows.map((props) => <Tag key={props.tone} {...props} />)}</ul>
      }
    `, 'Shadow')
    expect(spread.kind).toBe('spread')
    expect(spread).not.toHaveProperty('propsObject')
  })
})
