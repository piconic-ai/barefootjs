import { describe, expect, test } from 'bun:test'
import { analyzeComponent } from '../analyzer.ts'
import { isPropsAliasConst, isRenamedBodyPropParam } from '../props-binding.ts'
import { isChildrenPropParam } from '../types.ts'

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

/**
 * Whether a renamed body destructure binding reads as a prop under its local
 * name (#3579): only one with a default, which the analyzer gives its own
 * `ParamInfo` (`name: other`, `sourceName: label`).
 */
describe('isRenamedBodyPropParam', () => {
  function renamedOf(body: string, name: string): boolean {
    const ctx = analyzeComponent(
      `'use client'\nexport function S(props: { label?: string; text?: string }) {\n  ${body}\n  return <p>{${name}}</p>\n}`,
      'S.tsx',
    )
    return isRenamedBodyPropParam(ctx.localConstants.find(x => x.name === name)!, ctx.propsParams)
  }

  test('a renamed binding with a default is the prop under its local name', () => {
    expect(renamedOf("const { label: other = 'Default' } = props", 'other')).toBe(true)
    expect(renamedOf("const { label: other = ['y', ''].filter((x) => x !== '').join() } = props", 'other')).toBe(true)
  })

  test('a renamed binding without a default is not', () => {
    expect(renamedOf('const { label: other } = props', 'other')).toBe(false)
  })

  test('an un-renamed binding is left to isPropsAliasConst', () => {
    expect(renamedOf("const { label = 'Default' } = props", 'label')).toBe(false)
  })

  test('a renamed binding named like another prop does not take that prop entry', () => {
    // `text` is also a type member, so the analyzer adds no entry for the
    // renamed binding, and `text`'s own entry reads `props.text`.
    expect(renamedOf("const { label: text = 'Default' } = props", 'text')).toBe(false)
  })

  test('a hand-written `?? default` const is not', () => {
    expect(renamedOf("const other = props.label ?? 'Default'", 'other')).toBe(false)
  })

  test('a renamed binding of the children prop reads as the children prop', () => {
    const ctx = analyzeComponent(
      "'use client'\nexport function S(props: { children?: unknown }) {\n  const { children: kids = 'none' } = props\n  return <p>{kids}</p>\n}",
      'S.tsx',
    )
    const kids = ctx.localConstants.find(x => x.name === 'kids')!
    expect(isRenamedBodyPropParam(kids, ctx.propsParams)).toBe(true)
    const entry = ctx.propsParams.find(p => p.name === 'kids')!
    expect(isChildrenPropParam(entry)).toBe(true)
  })
})
