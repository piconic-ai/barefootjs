/**
 * `IRExpression.childrenRead` (#3539): which expression children read the
 * component's own `children` prop, decided from the binding in Phase 1.
 */
import { describe, test, expect } from 'bun:test'
import { compileJSX } from '../compiler'
import { fallbackChainParts, nullishChainParts } from '../children-nullish'
import { parseExpression, stringifyParsedExpr } from '../expression-parser'
import { TestAdapter } from '../adapters/test-adapter'

/** `childrenRead` of every expression child, in document order. */
function childrenReads(source: string): (string | undefined)[] {
  const result = compileJSX(source.trimStart(), 'C.tsx', { adapter: new TestAdapter(), outputIR: true })
  const ir = JSON.parse(result.files.find(f => f.type === 'ir')!.content)
  const out: (string | undefined)[] = []
  const walk = (node: unknown): void => {
    if (!node || typeof node !== 'object') return
    const n = node as Record<string, unknown>
    if (n.type === 'expression') out.push(n.childrenRead as string | undefined)
    for (const value of Object.values(n)) {
      if (Array.isArray(value)) value.forEach(walk)
      else if (value && typeof value === 'object') walk(value)
    }
  }
  walk(ir.root)
  return out
}

describe('nullishChainParts', () => {
  test('a left-nested chain reads its head, else the remaining fallbacks', () => {
    const parts = nullishChainParts(parseExpression("(c ?? '<b>x</b>') ?? ''"))!
    expect(stringifyParsedExpr(parts.head)).toBe('c')
    expect(stringifyParsedExpr(parts.fallback)).toBe('"<b>x</b>" ?? ""')
  })

  test('a non-nullish expression has no parts', () => {
    expect(nullishChainParts(parseExpression('c || d'))).toBeNull()
  })
})

describe('fallbackChainParts', () => {
  test('a left-nested || chain reads its head, else the remaining fallbacks', () => {
    const parts = fallbackChainParts(parseExpression("(c || '<b>x</b>') || ''"), '||')!
    expect(stringifyParsedExpr(parts.head)).toBe('c')
    expect(stringifyParsedExpr(parts.fallback)).toBe('"<b>x</b>" || ""')
  })

  test('a chain of the other operator has no parts', () => {
    expect(fallbackChainParts(parseExpression('c ?? d'), '||')).toBeNull()
    expect(fallbackChainParts(parseExpression('(c ?? d) || e'), '??')).toBeNull()
  })
})

describe('childrenRead', () => {
  test('a chained fallback stays a fallback, not an empty read', () => {
    expect(childrenReads(`
export function Box(props: { children?: unknown }) {
  return <div>{(props.children ?? '<b>fallback</b>') ?? ''}{(props.children ?? '') ?? ''}</div>
}
`)).toEqual(['nullish-fallback', 'nullish-empty'])
  })

  test('an || fallback over the children prop is an or-fallback read', () => {
    expect(childrenReads(`
export function Box({ children, label }: { children?: unknown; label?: string }) {
  return <div>{children || '<b>x</b>'}{(children || label) || ''}{label || children}{(children ?? label) || ''}</div>
}
`)).toEqual(['or-fallback', 'or-fallback', undefined, undefined])
  })

  test('a loop preamble local named children shadows the prop', () => {
    expect(childrenReads(`
export function List({ children, rows }: { children?: unknown; rows: { label: string }[] }) {
  return (
    <div>
      {children}
      <ul>{rows.map(r => { const children = r.label; return <li key={r.label}>{children}</li> })}</ul>
    </div>
  )
}
`)).toEqual(['bare', undefined])
  })
})
