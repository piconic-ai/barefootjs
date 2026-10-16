import { describe, expect, test } from 'bun:test'
import { analyzeComponent } from '../analyzer.ts'
import { isPropsAliasConst } from '../props-binding.ts'

/**
 * Whether a const reads as its own prop (#3501): a bare `props.X` read, or
 * a body destructure with a default, but not a source-written
 * `const X = props.X ?? d`, whose default the prop does not carry.
 */
function aliasOf(body: string): boolean {
  const ctx = analyzeComponent(
    `'use client'\nexport function S(props: { label?: string }) {\n  ${body}\n  return <p>{label}</p>\n}`,
    'S.tsx',
  )
  const c = ctx.localConstants.find(x => x.name === 'label')!
  return isPropsAliasConst(c, ctx.propsObjectName, ctx.propsParams)
}

describe('isPropsAliasConst', () => {
  test('a bare props read is the prop', () => {
    expect(aliasOf('const label = props.label')).toBe(true)
  })

  test('a body destructure is the prop, with or without a default', () => {
    expect(aliasOf('const { label } = props')).toBe(true)
    expect(aliasOf("const { label = 'Default' } = props")).toBe(true)
  })

  test('a source-written `?? default` const is not the prop', () => {
    expect(aliasOf("const label = props.label ?? 'Default'")).toBe(false)
  })

  test('a read of another prop or a derived value is not the prop', () => {
    expect(aliasOf("const label = props.label + '!'")).toBe(false)
  })

  test('no props object means no alias', () => {
    expect(isPropsAliasConst({ name: 'label', value: 'props.label' }, null, [])).toBe(false)
  })
})
