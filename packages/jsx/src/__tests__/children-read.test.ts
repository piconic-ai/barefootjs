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

/** The client JS `compileJSX` emits for `source`. */
function clientJs(source: string): string {
  const result = compileJSX(source.trimStart(), 'C.tsx', { adapter: new TestAdapter() })
  return result.files.find(f => f.type === 'clientJs')?.content ?? ''
}

describe('children prop renamed in the parameter destructure (#3572)', () => {
  test('is a children read, not a reactive prop slot', () => {
    const source = `
'use client'
export function Box({ children: kids }: { children?: unknown }) {
  return <div><p>{kids}</p><p>{kids ?? '<b>x</b>'}</p><p>{kids || '<b>y</b>'}</p></div>
}
`
    expect(childrenReads(source)).toEqual(['bare', 'nullish-fallback', 'or-fallback'])
    const js = clientJs(source)
    expect(js).not.toContain('createEffect')
    expect(js).not.toContain('escapeTextOrMarkup(_p.children')
    expect(js).toContain('markupOrEmpty(_p.children)')
  })

  test('compiles to the same client JS as the unrenamed binding', () => {
    const body = `{label}{KIDS}{KIDS ?? '<b>x</b>'}{KIDS ? <i>{KIDS}</i> : null}`
    const renamed = clientJs(`
'use client'
export function Box({ children: kids, label }: { children?: unknown; label?: string }) {
  return <div>${body.replaceAll('KIDS', 'kids')}</div>
}
`)
    const plain = clientJs(`
'use client'
export function Box({ children, label }: { children?: unknown; label?: string }) {
  return <div>${body.replaceAll('KIDS', 'children')}</div>
}
`)
    expect(renamed).toBe(plain)
  })

  test('a handler read binds the renamed local once from _p.children', () => {
    const js = clientJs(`
'use client'
export function Box({ children: kids }: { children?: unknown }) {
  return <button onClick={() => console.log(kids)}>{kids}</button>
}
`)
    expect(js).toContain('const kids = _p.children')
    expect(js).toContain('console.log(kids)')
  })

  test('a template-only read leaves no eager _p.children read in init', () => {
    const js = clientJs(`
'use client'
import { createSignal } from '@barefootjs/client'
export function Box({ children: kids }: { children?: unknown }) {
  const [n, setN] = createSignal(0)
  return <button onClick={() => setN(n() + 1)}>{n()}{kids}</button>
}
`)
    expect(js).toContain('function initBox')
    expect(js).not.toContain('const kids')
  })

  test('a local named children that binds another prop is that prop', () => {
    const js = clientJs(`
'use client'
export function Box({ label: children }: { label?: string }) {
  return <button onClick={() => console.log(children)}>{children}</button>
}
`)
    expect(js).not.toContain('_p.children')
    expect(js).toContain('console.log(_p.label)')
    expect(js).toContain('createEffect')
  })

  test('a const alias hop of the children prop is a children read', () => {
    expect(childrenReads(`
export function Box({ children, rows }: { children?: unknown; rows: string[] }) {
  const c = children
  const d = c
  return <div>{c}{d ?? '<b>x</b>'}<ul>{rows.map(c => <li key={c}>{c}</li>)}</ul></div>
}
`)).toEqual(['bare', 'nullish-fallback', undefined])
    expect(childrenReads(`
export function Box(props: { children?: unknown }) {
  const p = props
  const q = p
  const c = q.children
  return <div>{p.children}{q.children || '<b>x</b>'}{c}</div>
}
`)).toEqual(['bare', 'or-fallback', 'bare'])
  })

  test('a loop row shadowing a name an outer alias resolves through does not change the alias', () => {
    // The initializer `props.children` and the hop through `a` resolve in
    // the component scope; only the name read at the use site is checked
    // against the loop rows.
    expect(childrenReads(`
export function Box(props: { children?: unknown; rows: string[][] }) {
  const { children: c } = props
  return <ul>{props.rows.map((props, i) => <li key={i}>{c}{props.map((props, j) => <i key={j}>{c}</i>)}</li>)}</ul>
}
`)).toEqual(['bare', 'bare'])
    expect(childrenReads(`
export function Box({ children, rows }: { children?: unknown; rows: string[] }) {
  const a = children
  const b = a
  return <ul>{rows.map(a => <li key={a}>{b}{a}</li>)}{rows.map((children, i) => <li key={i}>{b}{children}</li>)}</ul>
}
`)).toEqual(['bare', undefined, 'bare', undefined])
  })

  test('a let alias of the children prop is not a children read', () => {
    expect(childrenReads(`
export function Box({ children }: { children?: unknown }) {
  let c = children
  return <div>{c}</div>
}
`)).toEqual([undefined])
  })

  test('a read through a const alias of the props object is not a reactive slot', () => {
    const js = clientJs(`
'use client'
export function Box(props: { children?: unknown }) {
  const p = props
  return <div>{p.children}</div>
}
`)
    expect(js).not.toContain('createEffect')
    expect(js).toContain('markupOrEmpty((_p).children)')
  })

  test('a fragment root reading only the renamed binding is transparent', () => {
    const js = clientJs(`
'use client'
export function Pass({ children: kids }: { children?: unknown }) {
  return <>{kids}</>
}
`)
    expect(js).toContain('transparent: true')
  })
})
