/**
 * Regression test for #2573 (xyflow TS2304 family): a component function's
 * own generic type parameters (`function Flow<NodeType, EdgeType>(...)`)
 * were dropped from the emitted `.tsx` SSR template — the function
 * signature came out as `function Flow(...)` even though its props type
 * annotation (and often its body) kept referencing `NodeType`/`EdgeType`
 * verbatim (`props: FlowComponentProps<NodeType, EdgeType>`,
 * `createFlowStore<NodeType, EdgeType>(props)`). TypeScript then reported
 * "Cannot find name 'NodeType'" (TS2304) at every such reference — the
 * declaration that would have brought the name into scope was never
 * emitted. Runtime output (client JS) was always correct; this is a
 * type-level emission defect in the SSR template only.
 *
 * `IRMetadata.typeParameters` now carries the source's type parameter list
 * verbatim (`node.getText()` per parameter, mirroring `ConstantInfo.
 * typeAnnotation`'s #2589 precedent), and `HonoAdapter`/`TestAdapter` splice
 * it between the function name and the parameter list.
 */

import { describe, test, expect } from 'bun:test'
import { compileJSX } from '../compiler'
import { HonoAdapter } from '../../../../packages/adapter-hono/src/adapter/hono-adapter'

describe('component type parameter preservation in emitted templates (#2573)', () => {
  test('a generic function component keeps its type parameters on the emitted signature', () => {
    const honoAdapter = new HonoAdapter()
    const source = `
      interface NodeBase { id: string }
      interface EdgeBase { id: string }
      interface FlowProps<NodeType extends NodeBase, EdgeType extends EdgeBase> {
        nodes: NodeType[]
        edges: EdgeType[]
      }

      export function Flow<NodeType extends NodeBase = NodeBase, EdgeType extends EdgeBase = EdgeBase>(
        props: FlowProps<NodeType, EdgeType>,
      ) {
        const count = props.nodes.length + props.edges.length
        return <div>{count}</div>
      }
    `

    const result = compileJSX(source, 'Flow.tsx', { adapter: honoAdapter })
    expect(result.errors).toHaveLength(0)

    const template = result.files.find((f) => f.type === 'markedTemplate')!
    expect(template).toBeDefined()
    expect(template.content).toContain(
      'function Flow<NodeType extends NodeBase = NodeBase, EdgeType extends EdgeBase = EdgeBase>(',
    )
  })

  test('a non-generic function component gains no type parameter clause', () => {
    const honoAdapter = new HonoAdapter()
    const source = `
      interface CardProps { title: string }
      export function Card(props: CardProps) {
        return <div>{props.title}</div>
      }
    `

    const result = compileJSX(source, 'Card.tsx', { adapter: honoAdapter })
    expect(result.errors).toHaveLength(0)

    const template = result.files.find((f) => f.type === 'markedTemplate')!
    expect(template).toBeDefined()
    expect(template.content).toContain('function Card(')
    expect(template.content).not.toMatch(/function Card</)
  })
})
