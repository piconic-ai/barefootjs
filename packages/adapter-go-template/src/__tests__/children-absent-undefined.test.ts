/**
 * #3987: a component's `interface{}` Children Input field reads as JS reads
 * `props.children`. The constructor takes it through `bf.ChildrenIn`, so an
 * Input that leaves it out is `undefined`, and a parent passes an explicit
 * children value through `bf.PassChildren`, so a passed `null` stays `null`.
 * A concrete Children field (a required `children: string`) is read as it is.
 */
import { describe, test, expect } from 'bun:test'
import { compileJSX, type ComponentIR } from '@barefootjs/jsx'
import { GoTemplateAdapter } from '../adapter/go-template-adapter'

function typesOf(src: string): string {
  const adapter = new GoTemplateAdapter()
  const result = compileJSX(src.trimStart(), 'note.tsx', { adapter, outputIR: true })
  return result.files
    .filter(f => f.type === 'ir')
    .map(f => adapter.generate(JSON.parse(f.content) as ComponentIR).types)
    .join('\n')
}

describe('children read as undefined when omitted (#3987)', () => {
  test('the constructor reads an interface{} Children field through bf.ChildrenIn', () => {
    const types = typesOf(`
export function Check(props: { children?: unknown }) {
  return <p>{props.children === undefined ? 'fallback' : 'children'}</p>
}
`)
    expect(types).toContain('Children: bf.ChildrenIn(input.Children),')
    expect(types).toContain('Children: in.Children,')
  })

  test('a concrete Children field is read as it is', () => {
    const types = typesOf(`
export function Label(props: { children: string }) {
  return <p>{props.children}</p>
}
`)
    expect(types).toContain('Children string')
    expect(types).not.toContain('bf.ChildrenIn(')
  })

  test('a parent passes an explicit children value through bf.PassChildren', () => {
    const types = typesOf(`
function Check(props: { children?: unknown }) {
  return <p>{props.children === null ? 'null' : 'not-null'}</p>
}
export function Host(props: { k?: unknown }) {
  return <div><Check children={null} /><Check children={props.k} /><Check><i>c</i></Check></div>
}
`)
    expect(types).toContain('Children: bf.PassChildren(CheckInput{}.Children, nil),')
    expect(types).toContain('Children: bf.PassChildren(CheckInput{}.Children, in.K),')
    // JSX children are markup, never null: written as they are.
    expect(types).toContain('Children: template.HTML("<i>c</i>"),')
  })
})
