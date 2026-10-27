/**
 * A destructure default applies to an ABSENT prop only: an explicit `''` /
 * `0` / `false` stays the caller's value. A concrete Go field reads both as
 * its zero value, so an optional scalar prop whose literal default is not
 * that zero value takes a nillable `interface{}` Input field, and the props
 * constructor applies the default when the field is nil — once, before any
 * reader (Props field, signal seed, memo, child prop) sees it. A default that
 * IS the zero value needs no nil and keeps its concrete field.
 *
 * Rendered coverage: the `destructure-default-explicit-falsy` conformance
 * fixture and the generated `:empty` / `:zero` / `:false` data points.
 */
import { describe, test, expect } from 'bun:test'
import { compileJSX, type ComponentIR } from '@barefootjs/jsx'
import { GoTemplateAdapter } from '../adapter/go-template-adapter'

function types(src: string): string {
  const adapter = new GoTemplateAdapter()
  const result = compileJSX(src.trimStart(), 'T.tsx', { adapter, outputIR: true })
  const irFile = result.files.find(f => f.type === 'ir')
  if (!irFile) throw new Error('no IR')
  const errors = result.errors.filter(e => e.severity === 'error')
  if (errors.length > 0) throw new Error(errors.map(e => e.message).join('\n'))
  return adapter.generate(JSON.parse(irFile.content) as ComponentIR).types ?? ''
}

function template(src: string): string {
  const result = compileJSX(src.trimStart(), 'T.tsx', { adapter: new GoTemplateAdapter() })
  const file = result.files.find(f => f.type === 'markedTemplate')
  if (!file) throw new Error('no template')
  return file.content
}

function inputStruct(goTypes: string): string {
  const match = goTypes.match(/type \w+Input struct \{[\s\S]*?\n\}/)
  if (!match) throw new Error('no Input struct')
  return match[0]
}

describe('optional scalar prop with a literal destructure default', () => {
  const SRC = `
export function Box({ tag = 'z', n = 2, on = true, blank = '', zero = 0, off = false }: {
  tag?: string; n?: number; on?: boolean; blank?: string; zero?: number; off?: boolean
}) {
  return <p data-n={n}>{tag}|{String(on)}|{blank}|{zero}|{String(off)}</p>
}
`

  test('a non-zero default boxes the Input field so an explicit empty value stays distinct', () => {
    const input = inputStruct(types(SRC))
    expect(input).toMatch(/\bTag interface\{\}/)
    expect(input).toMatch(/\bN interface\{\}/)
    expect(input).toMatch(/\bOn interface\{\}/)
  })

  test('a zero-value default keeps its concrete field', () => {
    const input = inputStruct(types(SRC))
    expect(input).toMatch(/\bBlank string/)
    expect(input).toMatch(/\bZero float64/)
    expect(input).toMatch(/\bOff bool/)
  })

  test('the constructor applies the default to a nil field only', () => {
    const goTypes = types(SRC)
    expect(goTypes).toContain('if in.Tag == nil {\n\t\tin.Tag = "z"\n\t}')
    expect(goTypes).toContain('if in.N == nil {\n\t\tin.N = 2.0\n\t}')
    expect(goTypes).toContain('if in.On == nil {\n\t\tin.On = true\n\t}')
    // The zero test of a concrete field would read an explicit `''` / `0` /
    // `false` as absent.
    expect(goTypes).not.toContain('in.Tag == ""')
    expect(goTypes).not.toContain('in.N == 0')
    expect(goTypes).not.toContain('(in.On || true)')
  })

  test('hydration props carry only what the caller passed', () => {
    const goTypes = types(SRC)
    expect(goTypes).toContain('bfCallerTag := in.Tag')
    expect(goTypes).toContain('if bfCallerTag != nil {\n\t\tbfCallerProps["tag"] = bfCallerTag')
  })
})

describe('a literal default is emitted from its parsed value, not its spelling', () => {
  // Every spelling the nil-boxing decision accepts must also be emitted: a
  // source-text translation that knew only decimal numbers refused `1e3`
  // with BF101 ("reads an earlier prop") and spelled `'xA'` verbatim.
  test.each([
    ['1e3', 'number', '1000.0'],
    ['0x10', 'number', '16.0'],
    ['.5', 'number', '0.5'],
    ['1_000', 'number', '1000.0'],
    ['-1e3', 'number', '-1000.0'],
    // Past int64: an integer constant boxed into `interface{}` overflows
    // `int` and fails `go build`; a float constant boxes as `float64`.
    ['1e20', 'number', '100000000000000000000.0'],
    ['1e21', 'number', '1e+21'],
    ["'x\\u0041'", 'string', '"xA"'],
    ['`tpl`', 'string', '"tpl"'],
  ])('`n = %s` compiles and applies its value to a nil field', (spelling, tsType, goValue) => {
    const goTypes = types(`
export function T({ n = ${spelling} }: { n?: ${tsType} }) {
  return <p>{n}</p>
}
`)
    expect(inputStruct(goTypes)).toMatch(/\bN interface\{\}/)
    expect(goTypes).toContain(`if in.N == nil {\n\t\tin.N = ${goValue}\n\t}`)
    expect(goTypes).toContain(`N: func() interface{} { if in.N == nil { return ${goValue} }; return in.N }(),`)
  })
})

describe('a boxed numeric default renders with the JS number spelling', () => {
  // The default boxes as `float64`, like a JSON-decoded caller number; `fmt`
  // spells a float64 `1e20` as `1e+20` and `1500000` as `1.5e+06`, so the
  // nil-guarded attribute takes `bf_text` as text position does.
  test('a nil-guarded attribute reads the value through bf_text', () => {
    const tpl = template(`
export function T({ n = 1e20, s = 'x' }: { n?: number; s?: string }) {
  return <p data-n={n} data-s={s}>{n}</p>
}
`)
    expect(tpl).toContain('{{if ne .N nil}}data-n="{{bf_text .N}}"{{end}}')
    expect(tpl).toContain('{{if ne .S nil}}data-s="{{.S}}"{{end}}')
  })
})
