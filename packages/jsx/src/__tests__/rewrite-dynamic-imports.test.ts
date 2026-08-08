/**
 * Unit coverage for `rewriteDynamicImportsInSource` (#2588) — the source-text
 * counterpart to `rewriteImportsForTemplate`.
 *
 * The e2e half lives in `packages/vite/src/__tests__/dynamic-import-rewrite.test.ts`
 * (real `vite build`, real emitted template). This half pins the cases that
 * an e2e fixture can't isolate: which AST nodes count, and the false matches
 * a regex-based implementation would produce. Those false-match cases are
 * the entire reason this parses (CLAUDE.md: never parse JS/TS with regex) —
 * without them, a regex rewrite would pass every other assertion here.
 */
import { describe, test, expect } from 'bun:test'
import { rewriteDynamicImportsInSource } from '../adapters/template-imports.ts'

/** Stand-in for `buildRelativeImportRewriter`: shifts one directory deeper. */
const deeper = (spec: string): string => `../${spec}`

describe('rewriteDynamicImportsInSource', () => {
  test('rewrites a dynamic import call', () => {
    expect(rewriteDynamicImportsInSource(`const m = import('./heavy')`, deeper))
      .toBe(`const m = import('.././heavy')`)
  })

  test('rewrites an import type node (`typeof import(...)`)', () => {
    expect(rewriteDynamicImportsInSource(`let p: Promise<typeof import('../lib/x')> | null = null`, deeper))
      .toBe(`let p: Promise<typeof import('../../lib/x')> | null = null`)
  })

  test('rewrites a qualified import type (`import(...).Foo`)', () => {
    expect(rewriteDynamicImportsInSource(`let v: import('../lib/x').Foo`, deeper))
      .toBe(`let v: import('../../lib/x').Foo`)
  })

  test('rewrites every occurrence, keeping earlier spans intact', () => {
    const out = rewriteDynamicImportsInSource(
      `const a = import('./one'); const b = import('./two'); const c = import('./three')`,
      deeper,
    )
    expect(out).toBe(
      `const a = import('.././one'); const b = import('.././two'); const c = import('.././three')`,
    )
  })

  test('leaves bare specifiers alone', () => {
    const src = `const m = import('hono/jsx')`
    expect(rewriteDynamicImportsInSource(src, deeper)).toBe(src)
  })

  test('leaves a non-literal specifier alone', () => {
    const src = `const m = import(chunkPath)`
    expect(rewriteDynamicImportsInSource(src, deeper)).toBe(src)
  })

  test('leaves static import statements to rewriteImportsForTemplate', () => {
    // The adapter rewrites those from the parsed `templateImports` list; if
    // this touched them too they would be rewritten twice.
    const src = `import { x } from './sibling'`
    expect(rewriteDynamicImportsInSource(src, deeper)).toBe(src)
  })

  test('does not touch `import(` inside a string literal', () => {
    const src = `const code = "const m = import('./heavy')"`
    expect(rewriteDynamicImportsInSource(src, deeper)).toBe(src)
  })

  test('does not touch `import(` inside a template literal', () => {
    const src = 'const code = `await import(\'./heavy\')`'
    expect(rewriteDynamicImportsInSource(src, deeper)).toBe(src)
  })

  test('does not touch `import(` inside a comment', () => {
    const src = `// const m = import('./heavy')\nconst n = 1`
    expect(rewriteDynamicImportsInSource(src, deeper)).toBe(src)
  })

  test('rewrites inside a TSX component body without disturbing the JSX', () => {
    const src = [
      `export function Lazy() {`,
      `  const onClick = async () => { await import('./heavy') }`,
      `  return <button onClick={onClick} data-x="import('./nope')">go</button>`,
      `}`,
    ].join('\n')
    const out = rewriteDynamicImportsInSource(src, deeper)
    expect(out).toContain(`await import('.././heavy')`)
    // The attribute string is data, not a module reference.
    expect(out).toContain(`data-x="import('./nope')"`)
  })

  test('returns the input unchanged when the rewriter is a no-op', () => {
    const src = `const m = import('./heavy')`
    expect(rewriteDynamicImportsInSource(src, (s) => s)).toBe(src)
  })

  test('returns the input unchanged when there is nothing to rewrite', () => {
    const src = `export const answer = 42`
    expect(rewriteDynamicImportsInSource(src, deeper)).toBe(src)
  })
})
