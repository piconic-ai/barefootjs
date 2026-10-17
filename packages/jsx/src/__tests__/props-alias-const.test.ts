import { describe, expect, test } from 'bun:test'
import { analyzeComponent } from '../analyzer.ts'
import { isPropsAliasConst } from '../props-binding.ts'

/**
 * Whether a const reads as its own prop (#3501): a bare `props.X` read, or
 * an un-renamed body destructure (with or without a default), but not a
 * hand-written `const X = props.X ?? d`, whose default the prop does not
 * carry. The destructure is told apart by the analyzer's
 * `ConstantInfo.propsDestructure`, not by the initializer text.
 */
function constOf(body: string, name = 'label') {
  const ctx = analyzeComponent(
    `'use client'\nexport function S(props: { label?: string }) {\n  ${body}\n  return <p>{${name}}</p>\n}`,
    'S.tsx',
  )
  return { c: ctx.localConstants.find(x => x.name === name)!, propsObjectName: ctx.propsObjectName }
}

function aliasOf(body: string, name = 'label'): boolean {
  const { c, propsObjectName } = constOf(body, name)
  return isPropsAliasConst(c, propsObjectName)
}

describe('isPropsAliasConst', () => {
  test('a bare props read is the prop', () => {
    expect(aliasOf('const label = props.label')).toBe(true)
  })

  test('a body destructure is the prop, with or without a default', () => {
    expect(aliasOf('const { label } = props')).toBe(true)
    expect(aliasOf("const { label = 'Default' } = props")).toBe(true)
  })

  test('a hand-written `?? default` const is not the prop', () => {
    expect(aliasOf("const label = props.label ?? 'Default'")).toBe(false)
    expect(aliasOf("let label = props.label ?? 'Default'")).toBe(false)
  })

  test('a `?? default` binding whose reassignment cannot fold still reads the prop', () => {
    expect(aliasOf("let label = props.label ?? 'Default'\n  for (const t of [1]) label = 'Fallback'")).toBe(true)
  })

  test('a `?? default` binding whose reassignment folds is not the prop', () => {
    expect(aliasOf("let label = props.label ?? 'Default'\n  if (!label) label = 'Fallback'")).toBe(false)
  })

  test('a renamed destructure binding is not an alias of a prop of its own name', () => {
    expect(aliasOf('const { label: text } = props', 'text')).toBe(false)
  })

  test('the analyzer records a body destructure on the const, and only that', () => {
    expect(constOf("const { label = 'Default' } = props").c.propsDestructure).toEqual({ sourceKey: 'label' })
    expect(constOf('const { label: text } = props', 'text').c.propsDestructure).toEqual({ sourceKey: 'label' })
    expect(constOf("const label = props.label ?? 'Default'").c.propsDestructure).toBeUndefined()
  })

  test('a read of another prop or a derived value is not the prop', () => {
    expect(aliasOf("const label = props.label + '!'")).toBe(false)
  })

  test('no props object means no alias', () => {
    expect(isPropsAliasConst(constOf('const label = props.label').c, null)).toBe(false)
  })
})
