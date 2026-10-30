import { describe, expect, test } from 'bun:test'
import ts from 'typescript'
import { observesWholePropsObject } from '../props-object-whole-read'
import { analyzeComponent } from '../analyzer'
import { buildMetadata } from '../compiler'

const observes = (body: string): boolean => {
  const sf = ts.createSourceFile('c.tsx', `function C(props: P) {\n${body}\n}`, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  const fn = sf.statements[0] as ts.FunctionDeclaration
  return observesWholePropsObject(fn, 'props')
}

describe('observesWholePropsObject', () => {
  test('member reads with a known key are not whole reads', () => {
    expect(observes('return <b title={props.title} data-x={props["x"]} data-y={props?.y}>{props[0]}</b>')).toBe(false)
    expect(observes('const { a, b: c } = props; return <b>{a}{c}</b>')).toBe(false)
    expect(observes('const t: typeof props = null as any; return <b />')).toBe(false)
  })

  test('a spread, a dynamic key, a whole pass and a rest destructure are whole reads', () => {
    expect(observes('return <b {...props} />')).toBe(true)
    expect(observes('return <Inner {...props} />')).toBe(true)
    expect(observes('const k = "a"; return <b>{props[k]}</b>')).toBe(true)
    expect(observes('return <b>{Object.keys(props).join(",")}</b>')).toBe(true)
    expect(observes('const { a, ...rest } = props; return <b {...rest}>{a}</b>')).toBe(true)
    expect(observes('const o = { props }; return <b>{String(o)}</b>')).toBe(true)
  })

  test('a nested binding of the same name shadows the props object', () => {
    expect(observes('const f = (props: any) => ({ ...props }); return <b>{String(f)}</b>')).toBe(false)
    expect(observes('const xs = [1].map(n => { const props = { n }; return { ...props } }); return <b>{xs.length}</b>')).toBe(false)
    expect(observes('const f = (other: any) => ({ ...props }); return <b>{String(f)}</b>')).toBe(true)
  })

  test('IR metadata carries the answer for a props-object component', () => {
    const meta = (src: string) => buildMetadata(analyzeComponent(src, 'c.tsx'))
    expect(meta('export function Kid(props: { label: string }) { return <b {...props}>{props.label}</b> }').propsObjectObservedWhole).toBe(true)
    expect(meta('export function Kid(props: { label: string }) { return <b>{props.label}</b> }').propsObjectObservedWhole).toBe(false)
  })
})
