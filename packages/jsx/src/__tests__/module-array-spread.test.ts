import { describe, expect, test } from 'bun:test'
import { analyzeComponent } from '../analyzer.ts'
import { buildMetadata } from '../compiler.ts'
import { compileJSX } from '../compiler.ts'
import { stringifyParsedExpr } from '../expression-parser.ts'
import { TestAdapter } from '../adapters/test-adapter.ts'
import { MAX_EXPANDED_ELEMENTS, MAX_EXPANDED_WEIGHT } from '../module-array-spread.ts'

/** The parsed tree of module const `name` in `source`, spelled back as JS. */
function parsedOf(source: string, name: string): string | undefined {
  const constants = buildMetadata(analyzeComponent(source, 'c.tsx')).localConstants
  const constant = constants.find(c => c.isModule && c.name === name)
  return constant?.parsed ? stringifyParsedExpr(constant.parsed) : undefined
}

const component = `export function C() { return <p>{ALL.length}</p> }`

/** Whether module const `ALL` in `source` still holds an element no template lowers (an unexpanded spread). */
function stillSpreads(source: string): boolean {
  const constants = buildMetadata(analyzeComponent(source, 'c.tsx')).localConstants
  const parsed = constants.find(c => c.isModule && c.name === 'ALL')?.parsed
  return parsed?.kind === 'array-literal' && parsed.elements.some(e => e.kind === 'unsupported')
}

describe('expandModuleArraySpreads (#3979)', () => {
  test('a spread of a literal array const is replaced by its elements, in place', () => {
    expect(parsedOf(`const BASE = ['y']\nconst ALL = ['a', ...BASE, 'z']\n${component}`, 'ALL')).toBe(`["a", "y", "z"]`)
  })

  test('a chain of spreads resolves, in declaration order', () => {
    const source = `const A = ['a']\nconst B = [...A, 'b']\nconst ALL = [...B, ...A]\n${component}`
    expect(parsedOf(source, 'B')).toBe(`["a", "b"]`)
    expect(parsedOf(source, 'ALL')).toBe(`["a", "b", "a"]`)
  })

  test('a spread of an inline array literal, itself spreading a const, is expanded', () => {
    expect(parsedOf(`const A = ['a']\nconst ALL = [...['x', ...A]]\n${component}`, 'ALL')).toBe(`["x", "a"]`)
  })

  test('a typed or asserted source and spread read the same', () => {
    const source = `const BASE: string[] = ['y'] as const\nconst ALL = [...(BASE as string[]), 'z'] satisfies string[]\n${component}`
    expect(parsedOf(source, 'ALL')).toBe(`["y", "z"]`)
  })

  test('object rows are copied by their parsed trees', () => {
    const source = `const ROWS = [{ id: 'a' }]\nconst ALL = [...ROWS, { id: 'b' }]\n${component}`
    expect(parsedOf(source, 'ALL')).toBe(`[({ id: 'a' }), ({ id: 'b' })]`)
  })

  test('a source with no compile-time elements leaves the spread as it is', () => {
    const left = (decls: string) => stillSpreads(`${decls}\n${component}`)
    // A call, a Set, a member, a string.
    expect(left(`function mk() { return ['y'] }\nconst ALL = [...mk(), 'z']`)).toBe(true)
    expect(left(`const ALL = [...new Set(['y']), 'z']`)).toBe(true)
    expect(left(`const R = { xs: ['y'] }\nconst ALL = [...R.xs, 'z']`)).toBe(true)
    expect(left(`const S = 'y'\nconst ALL = [...S, 'z']`)).toBe(true)
    // A `let`, which a later statement may reassign.
    expect(left(`let BASE = ['y']\nconst ALL = [...BASE, 'z']`)).toBe(true)
    // A source with its own unresolved spread.
    expect(left(`const BASE = [...new Set(['y'])]\nconst ALL = [...BASE, 'z']`)).toBe(true)
  })

  test('a source a statement writes is not expanded', () => {
    const source = `const BASE = ['y']\nconst ALL = [...BASE, 'z']\nexport function C() {\n  BASE.push('w')\n  return <p>{ALL.length}</p>\n}`
    expect(stillSpreads(source)).toBe(true)
  })

  test('a const declared after the one spreading it is not read (JS throws in its TDZ)', () => {
    expect(stillSpreads(`const ALL = [...BASE, 'z']\nconst BASE = ['y']\n${component}`)).toBe(true)
  })

  test('a spread it cannot resolve keeps its place beside one it can', () => {
    const parsed = parsedOf(`const A = ['a']\nconst ALL = [...A, ...new Set(['y'])]\n${component}`, 'ALL')
    expect(parsed?.startsWith(`["a", `)).toBe(true)
  })

  test('a component-scope const is not expanded', () => {
    const source = `const BASE = ['y']\nexport function C() {\n  const local = [...BASE, 'z']\n  return <p>{local.length}</p>\n}`
    const constants = buildMetadata(analyzeComponent(source, 'c.tsx')).localConstants
    const local = constants.find(c => c.name === 'local')
    expect(local?.parsed?.kind).toBe('array-literal')
    expect(local?.parsed?.kind === 'array-literal' && local.parsed.elements[0].kind).toBe('unsupported')
  })

  test('the const keeps its source text: the client bundle still spreads the source', () => {
    const source = `'use client'\nimport { createMemo } from '@barefootjs/client'\nconst BASE = ['y']\nconst ALL = [...BASE, 'z']\nexport function C() {\n  const n = createMemo(() => ALL.length)\n  return <p>{n()}</p>\n}`
    const constants = buildMetadata(analyzeComponent(source, 'c.tsx')).localConstants
    expect(constants.find(c => c.name === 'ALL')?.value).toBe(`[...BASE, 'z']`)
    const result = compileJSX(source, 'c.tsx', { adapter: new TestAdapter() })
    const clientJs = result.files.find(f => f.type === 'clientJs')?.content ?? ''
    expect(clientJs).toContain('...BASE')
  })

  /** `const A0 = [0]` and each `Ai` spreading the previous one twice, through `A<levels>`. */
  const doublingChain = (levels: number) => {
    const lines = ['const A0 = [0]']
    for (let i = 1; i <= levels; i++) lines.push(`const A${i} = [...A${i - 1}, ...A${i - 1}]`)
    return lines.join('\n')
  }
  const elementsOf = (source: string, name: string) => {
    const constants = buildMetadata(analyzeComponent(source, 'c.tsx')).localConstants
    const parsed = constants.find(c => c.isModule && c.name === name)?.parsed
    return parsed?.kind === 'array-literal' ? parsed.elements : []
  }

  test('a chain that doubles the elements per declaration stops at the bound, fast', () => {
    // No component reads the chain. Phase 1 expands every recorded
    // declaration, so the bound, not the reads, keeps this small.
    const source = `${doublingChain(24)}\nexport function C() { return <p>ok</p> }`
    const started = performance.now()
    const constants = buildMetadata(analyzeComponent(source, 'c.tsx')).localConstants
    expect(performance.now() - started).toBeLessThan(2000)
    const elements = (name: string) => {
      const parsed = constants.find(c => c.isModule && c.name === name)?.parsed
      return parsed?.kind === 'array-literal' ? parsed.elements : []
    }
    expect(elements('A10')).toHaveLength(MAX_EXPANDED_ELEMENTS)
    // Past the bound the spreads stay unexpanded, as a non-literal source's do.
    expect(elements('A11').map(e => e.kind)).toEqual(['unsupported', 'unsupported'])
    expect(elements('A24').map(e => e.kind)).toEqual(['unsupported', 'unsupported'])
  })

  test('doubling through inline array literal spreads is bounded the same way', () => {
    const lines = ['const A0 = [0]']
    for (let i = 1; i <= 24; i++) lines.push(`const A${i} = [...[...A${i - 1}, ...A${i - 1}], ...[...A${i - 1}]]`)
    const source = `${lines.join('\n')}\nexport function C() { return <p>ok</p> }`
    const started = performance.now()
    const constants = buildMetadata(analyzeComponent(source, 'c.tsx')).localConstants
    expect(performance.now() - started).toBeLessThan(2000)
    const last = constants.find(c => c.isModule && c.name === 'A24')?.parsed
    expect(last?.kind === 'array-literal' && last.elements.some(e => e.kind === 'unsupported')).toBe(true)
    for (const c of constants) {
      if (c.parsed?.kind === 'array-literal') expect(c.parsed.elements.length).toBeLessThanOrEqual(MAX_EXPANDED_ELEMENTS)
    }
  })

  test('a chain just within the bound still expands', () => {
    const levels = Math.log2(MAX_EXPANDED_ELEMENTS)
    const source = `${doublingChain(levels)}\n${component.replace('ALL', `A${levels}`)}`
    const elements = elementsOf(source, `A${levels}`)
    expect(elements).toHaveLength(MAX_EXPANDED_ELEMENTS)
    expect(elements.every(e => e.kind === 'literal')).toBe(true)
  })

  test('the module-wide weight bounds wide elements copied many times', () => {
    // One element of about 2 * 600 nodes, copied by doubling: the weight runs
    // out long before the element bound.
    const wide = `[${Array.from({ length: 600 }, (_, i) => `'${i}'`).join(', ')}]`
    const source = `const A0 = [${wide}]\n${doublingChain(6).replace('const A0 = [0]\n', '')}\n${component}`
    const last = elementsOf(source, 'A6')
    expect(last.some(e => e.kind === 'unsupported')).toBe(true)
    expect(MAX_EXPANDED_WEIGHT).toBeLessThan(600 * 64)
  })

  describe('the element bound counts what later elements contribute', () => {
    const levels = Math.log2(MAX_EXPANDED_ELEMENTS)
    const kinds = (decls: string) => {
      const source = `${doublingChain(levels)}\nconst EMPTY: number[] = []\nconst ONE = [1]\n${decls}\n${component}`
      return elementsOf(source, 'ALL').map(e => e.kind)
    }
    const full = Array(MAX_EXPANDED_ELEMENTS).fill('literal')

    test('a known empty spread after a full source takes no slot, in either order', () => {
      expect(kinds(`const ALL = [...A${levels}, ...EMPTY]`)).toEqual(full)
      expect(kinds(`const ALL = [...EMPTY, ...A${levels}]`)).toEqual(full)
      expect(kinds(`const ALL = [...A${levels}, ...EMPTY, ...EMPTY]`)).toEqual(full)
      expect(kinds(`const ALL = [...EMPTY, ...A${levels}, ...EMPTY]`)).toEqual(full)
    })

    test('an inline empty array literal spread takes no slot either', () => {
      expect(kinds(`const ALL = [...A${levels}, ...[]]`)).toEqual(full)
      expect(kinds(`const ALL = [...A${levels}, ...[...EMPTY]]`)).toEqual(full)
    })

    test('a later element that does add one still overflows the bound, before anything is copied', () => {
      expect(kinds(`const ALL = [...A${levels}, ...EMPTY, 'x']`)).toEqual(['unsupported', 'literal'])
      expect(kinds(`const ALL = [...A${levels}, ...ONE]`)).toEqual(['unsupported', 'literal'])
      expect(kinds(`const ALL = [...A${levels}, ...[1]]`)).toEqual(['unsupported', 'literal'])
    })

    test('an unknown later spread still reserves one slot', () => {
      expect(kinds(`const ALL = [...A${levels}, ...new Set([1])]`)).toEqual(['unsupported', 'unsupported'])
    })
  })

  describe('looking at a spread the expansion leaves alone takes nothing from the budget', () => {
    // FIRST: 600 literals (600 nodes). SECOND: 620 arrays of 12 literals (13 nodes each, 8060 in all).
    const FIRST = `const FIRST = [${Array(600).fill('0').join(', ')}]`
    const SECOND = `const SECOND = [${Array(620).fill(`[${Array(12).fill('0').join(', ')}]`).join(', ')}]`
    const lengthOf = (decls: string, name: string) => {
      const source = `${FIRST}\n${SECOND}\n${decls}\nexport function C() { return <p>{${name}.length}</p> }`
      const elements = elementsOf(source, name)
      return elements.some(e => e.kind === 'unsupported') ? null : elements.length
    }

    test('a spread refused for the element bound leaves the budget for a later declaration', () => {
      expect(lengthOf(`const UNUSED = [...FIRST, ...[...SECOND]]\nconst ALL = [...FIRST]`, 'ALL')).toBe(600)
      expect(lengthOf(`const UNUSED = [...FIRST, ...[...SECOND], ...[...SECOND]]\nconst ALL = [...FIRST]`, 'ALL')).toBe(600)
      expect(lengthOf(`const UNUSED = [...FIRST, ...SECOND]\nconst ALL = [...FIRST]`, 'ALL')).toBe(600)
    })

    test('an inline literal spread is charged once, however deeply it nests', () => {
      // 8060 nodes, taken once: a second 8060-node copy still fits in 16384.
      expect(lengthOf(`const UNUSED = [...[...[...SECOND]]]\nconst ALL = [...SECOND]`, 'ALL')).toBe(620)
      expect(lengthOf(`const UNUSED = [...[...[...SECOND]]]\nconst ALL = [...SECOND]`, 'UNUSED')).toBe(620)
    })

    test('a copy that does not fit what is left is refused', () => {
      expect(lengthOf(`const A = [...SECOND]\nconst B = [...SECOND]\nconst ALL = [...SECOND]`, 'ALL')).toBeNull()
    })
  })
})

