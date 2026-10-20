/**
 * `{...props}` onto a child component (#3530): the child's `<Child>Input{...}`
 * literal follows the shared plan one key at a time. A param the spread
 * carries only when passed is a nil test on the parent's own Input field,
 * and a call the constructor can't merge at compile time is refused.
 * Rendered output is pinned by the `component-spread-*` conformance fixtures.
 */
import { describe, test, expect } from 'bun:test'
import { compileJSX } from '@barefootjs/jsx'
import { GoTemplateAdapter } from '../adapter/go-template-adapter'

const compile = (source: string) => {
  const result = compileJSX(source.trimStart(), 'test.tsx', { adapter: new GoTemplateAdapter(), outputIR: false })
  const all = result.files.find(f => f.type === 'types')?.content ?? ''
  // The child's Input literal in the parent's constructor.
  const start = all.indexOf('TagSlot0: NewTagProps(TagInput{')
  const types = start === -1 ? '' : all.slice(start, all.indexOf('}),', start))
  return { types, all, bf101: result.errors.filter(e => e.code === 'BF101') }
}

const source = (tagType: string, call: string, extraProp = '') => `
function Tag(props: ${tagType}) {
  return <b data-tone={props.tone} data-size={props.size}>{props.label}</b>
}
export function Parent(props: { tone?: string; size?: string; label?: string${extraProp} }) {
  return <p>${call}</p>
}
`
const OPTIONAL = '{ tone?: string; size?: string; label?: string }'

describe('GoTemplateAdapter - {...props} onto a child component', () => {
  test('an earlier explicit prop is kept when the caller omits the param', () => {
    const { types, all, bf101 } = compile(source(OPTIONAL, '<Tag tone="first" {...props} />'))
    expect(bf101).toEqual([])
    // The parent's own field is nillable, so an omitted param reads as nil.
    expect(all).toMatch(/type ParentInput struct \{[^}]*Tone interface\{\}/)
    expect(types).toContain('Tone: func() interface{} { if in.Tone != nil { return in.Tone }; return "first" }(),')
    expect(types).toContain('Label: in.Label,')
  })

  test('a later explicit prop replaces the param, which is not lowered at all', () => {
    const { types, bf101 } = compile(source(OPTIONAL, '<Tag {...props} tone="explicit" />'))
    expect(bf101).toEqual([])
    expect(types).toContain('Tone: "explicit",')
    expect(types).not.toContain('Tone: in.Tone,')
    expect(types).toContain('Size: in.Size,')
  })

  test("a concrete child field takes the passed param converted to the field's type", () => {
    const { types, bf101 } = compile(source('{ tone: string; size?: string; label?: string }', '<Tag tone="first" {...props} />'))
    expect(bf101).toEqual([])
    expect(types).toContain(
      'Tone: func() string { if in.Tone != nil { return func() string { if v, ok := in.Tone.(string); ok { return v }; return "" }() }; return "first" }(),',
    )
  })

  test("a param the child doesn't declare gets no field on its Input", () => {
    const { types, bf101 } = compile(source('{ label?: string }', '<Tag {...props} />', '; own?: string'))
    expect(bf101).toEqual([])
    expect(types).toContain('Label: in.Label,')
    expect(types).not.toContain('Own:')
    expect(types).not.toContain('Tone:')
  })

  test("a param the child doesn't declare goes into the child's rest bag", () => {
    const { types, bf101 } = compile(`
function Tag({ label, ...rest }: { label?: string; [key: string]: any }) {
  return <b {...rest}>{label}</b>
}
export function Parent(props: { label?: string; own?: string }) {
  return <p><Tag {...props} /></p>
}
`)
    expect(bf101).toEqual([])
    expect(types).toContain('Label: in.Label,')
    expect(types).toContain('Rest: map[string]any{"own": in.Own}')
  })

  test('a spread of keys only known at render time next to {...props} is refused', () => {
    const { bf101 } = compile(source(OPTIONAL, '<Tag {...props.extra} {...props} />', '; extra?: { tone?: string }'))
    expect(bf101.map(e => e.message)).toEqual([
      "'{...props}' on <Tag> can't be merged with the other props of the call: the call also spreads an object whose keys are only known at render time",
    ])
  })
})
