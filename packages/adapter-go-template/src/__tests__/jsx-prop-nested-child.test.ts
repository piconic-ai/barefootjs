/**
 * A child component nested in a named JSX prop's element
 * (`header={<span><Badge /></span>}`) renders through the prop's companion
 * define with the parent's data, so the parent's Props carries its
 * `<Name>SlotN` field and constructor init like any other static child.
 * A static child's `key` becomes its `BfDataKey` (the reference's
 * `data-key`), and a literal prop value is a Go string literal with its
 * backslashes and quotes escaped. Rendered output is pinned by the
 * `jsx-prop-template-delimiters` / `jsx-prop-nested-component-positions`
 * conformance fixtures.
 */
import { describe, test, expect } from 'bun:test'
import { compileJSX } from '@barefootjs/jsx'
import { GoTemplateAdapter } from '../adapter/go-template-adapter'

const compile = (source: string) => {
  const result = compileJSX(source.trimStart(), 'test.tsx', { adapter: new GoTemplateAdapter(), outputIR: false })
  const types = result.files.find(f => f.type === 'types')?.content ?? ''
  const template = result.files.find(f => f.type === 'markedTemplate')?.content ?? ''
  return { types, template, errors: result.errors.filter(e => e.severity === 'error') }
}

const children = `
function Card(props: { header?: any; children?: any }) {
  return <section><header>{props.header}</header><div>{props.children}</div></section>
}
function Badge(props: { label?: string }) {
  return <em>{props.label}</em>
}
`

describe('GoTemplateAdapter - component nested in a named JSX prop', () => {
  test('the nested component gets its slot field on the parent', () => {
    const { types, template, errors } = compile(`${children}
export function Parent() {
  return <Card header={<span>x<Badge label="a" /></span>} />
}`)
    expect(errors).toEqual([])
    expect(template).toContain('{{template "Badge" .BadgeSlot0}}')
    expect(types).toContain('\tBadgeSlot0 BadgeProps `json:"-"`')
    expect(types).toContain('BadgeSlot0: NewBadgeProps(BadgeInput{')
  })

  test('alongside forwarded children, and nested deeper in the prop element', () => {
    const { types, errors } = compile(`${children}
export function Parent() {
  return <Card header={<span><i>x<Badge label="a" /></i></span>}><p>body</p></Card>
}`)
    expect(errors).toEqual([])
    expect(types).toContain('\tBadgeSlot0 BadgeProps `json:"-"`')
  })
})

describe('GoTemplateAdapter - static child key and literal props', () => {
  test('a literal key is stamped as BfDataKey, not an Input field', () => {
    const { types, errors } = compile(`${children}
export function Parent() {
  return <div><Badge key="k1" label="a" /></div>
}`)
    expect(errors).toEqual([])
    expect(types).not.toContain('Key:')
    expect(types).toContain('p.BfDataKey = "k1"; return p }(),')
  })

  test.each([['001'], ['08'], ['1e3'], ['0x10'], ['-0'], [' 1'], ['true'], ['a\\b']])(
    'a quoted key %p is its exact string, not a coerced literal',
    key => {
      const { types, errors } = compile(`${children}
export function Parent() {
  return <div><Badge key="${key}" /></div>
}`)
      expect(errors).toEqual([])
      expect(types).toContain(`p.BfDataKey = ${JSON.stringify(key)}; return p }(),`)
    },
  )

  test('a template-literal key is evaluated and stringified', () => {
    const { types, errors } = compile(`${children}
export function Parent(props: { id?: string }) {
  return <div><Badge key={\`k-\${props.id}\`} /></div>
}`)
    expect(errors).toEqual([])
    expect(types).toContain('p.BfDataKey = bf.String(bf.EvalExpr(')
  })

  test('a numeric key is stamped through bf.String', () => {
    const { types } = compile(`${children}
export function Parent() {
  return <div><Badge key={7} /></div>
}`)
    expect(types).toContain('p.BfDataKey = bf.String(7); return p }(),')
  })

  test('a child without a key keeps the plain constructor call', () => {
    const { types } = compile(`${children}
export function Parent() {
  return <div><Badge label="a" /></div>
}`)
    expect(types).not.toContain('BfDataKey = ')
    expect(types).toContain('BadgeSlot0: NewBadgeProps(BadgeInput{')
  })

  test.each([
    ['a backslash', String.raw`<Badge label="a\b" />`, String.raw`Label: "a\\b",`],
    ['a double quote', `<Badge label='say "hi"' />`, String.raw`Label: "say \"hi\"",`],
    ['single quotes around the value', `<Badge label="'q'" />`, `Label: "'q'",`],
    ['a template delimiter', '<Badge label="` ${x}" />', 'Label: "` ${x}",'],
  ])('a literal prop with %s is a Go string literal', (_name, call, field) => {
    const { types, errors } = compile(`${children}
export function Parent() {
  return <div>${call}</div>
}`)
    expect(errors).toEqual([])
    expect(types).toContain(field)
  })
})
