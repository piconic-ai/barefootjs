import { describe, test, expect } from 'bun:test'
import { mergeDuplicateNamedImports, rewriteBarefootClientSpecifiers } from '../lib/build'

describe('mergeDuplicateNamedImports', () => {
  test('no duplicates: content is returned unchanged', () => {
    const input = `import { a } from './x'\nimport { b } from './y'\n\nconsole.log(a, b)\n`
    expect(mergeDuplicateNamedImports(input)).toBe(input)
  })

  test('two imports from the same source merge into one with sorted union', () => {
    const input = [
      `import { b, a } from './x'`,
      `import { c, a } from './x'`,
      ``,
      `console.log(a, b, c)`,
      ``,
    ].join('\n')
    const out = mergeDuplicateNamedImports(input)
    expect(out).toBe(
      [
        `import { a, b, c } from './x'`,
        ``,
        `console.log(a, b, c)`,
        ``,
      ].join('\n'),
    )
  })

  test('three imports from the same source collapse', () => {
    const input = [
      `import { a } from './x'`,
      `import { b } from './x'`,
      `import { c } from './x'`,
    ].join('\n')
    expect(mergeDuplicateNamedImports(input)).toBe(`import { a, b, c } from './x'`)
  })

  test('imports from different sources are left independent', () => {
    const input = [
      `import { a } from './x'`,
      `import { b } from './y'`,
      `import { c } from './x'`,
    ].join('\n')
    expect(mergeDuplicateNamedImports(input)).toBe(
      [
        `import { a, c } from './x'`,
        `import { b } from './y'`,
      ].join('\n'),
    )
  })

  test('quote style of the first occurrence is preserved', () => {
    const input = [`import { a } from "./x"`, `import { b } from "./x"`].join('\n')
    expect(mergeDuplicateNamedImports(input)).toBe(`import { a, b } from "./x"`)
  })

  test('whitespace and trailing semicolons are tolerated', () => {
    const input = [
      `import {  a, b  } from './x';`,
      `import {b,  c} from './x'`,
    ].join('\n')
    const out = mergeDuplicateNamedImports(input)
    expect(out).toContain(`{ a, b, c }`)
    expect(out.match(/from\s+['"]\.\/x['"]/g)?.length).toBe(1)
  })

  test('default-and-named hybrid imports are passed through unchanged', () => {
    // The function is intentionally limited to `import { ... } from '...'`;
    // hybrids like `import D, { x } from '...'` should not be touched.
    const input = `import D, { a } from './x'\nimport { b } from './x'\n`
    const out = mergeDuplicateNamedImports(input)
    // The hybrid line must survive verbatim.
    expect(out).toContain(`import D, { a } from './x'`)
  })

  test('import-shaped lines inside a string literal are not merged (#1702)', () => {
    // Two inlined snippets each carrying an `import { a } from '@x'` line
    // share the same "source" textually, but they live inside template
    // literals — merging them would drop one and corrupt the string.
    const input = [
      `import { hydrate } from './barefoot.js'`,
      'const __bf_inline_0 = {',
      "  A: `import { a } from '@x'`,",
      "  B: `import { a } from '@x'`,",
      '}',
    ].join('\n')
    const out = mergeDuplicateNamedImports(input)
    // Both snippet strings survive verbatim; nothing is dropped/merged.
    expect(out).toBe(input)
  })
})

describe('rewriteBarefootClientSpecifiers', () => {
  test('rewrites real import specifiers to the relative runtime path', () => {
    const input = `import { hydrate } from '@barefootjs/client/runtime'`
    expect(rewriteBarefootClientSpecifiers(input, './barefoot.js')).toBe(
      `import { hydrate } from './barefoot.js'`,
    )
  })

  test('rewrites bare @barefootjs/client and subpath specifiers', () => {
    const input = [
      `import { createSignal } from '@barefootjs/client'`,
      `import { hydrate } from '@barefootjs/client/runtime'`,
    ].join('\n')
    const out = rewriteBarefootClientSpecifiers(input, '../barefoot.js')
    expect(out).toBe([
      `import { createSignal } from '../barefoot.js'`,
      `import { hydrate } from '../barefoot.js'`,
    ].join('\n'))
  })

  test('does NOT rewrite @barefootjs/client inside string literals (#1702)', () => {
    // A code snippet shipped as a string must keep its `@barefootjs/client`
    // text verbatim; only the real top-level import is rewritten.
    const input = [
      `import { hydrate } from '@barefootjs/client/runtime'`,
      'const __bf_inline_0 = {',
      "  SAMPLE: `\"use client\"",
      '',
      "import { createSignal } from '@barefootjs/client'",
      '',
      'export function Counter() {}`,',
      "  SPECIFIER: \"import { createSignal } from '@barefootjs/client'\",",
      '}',
    ].join('\n')
    const out = rewriteBarefootClientSpecifiers(input, './barefoot.js')
    // Real import rewritten…
    expect(out).toContain(`import { hydrate } from './barefoot.js'`)
    // …string contents untouched.
    expect(out).toContain("import { createSignal } from '@barefootjs/client'")
    expect(out).toContain("SPECIFIER: \"import { createSignal } from '@barefootjs/client'\"")
    expect(out).not.toContain("from './barefoot.js'\n\nexport function Counter")
  })

  test('rewrites export … from re-exports', () => {
    const input = `export { createSignal } from '@barefootjs/client'`
    expect(rewriteBarefootClientSpecifiers(input, './barefoot.js')).toBe(
      `export { createSignal } from './barefoot.js'`,
    )
  })

  test('no-op when @barefootjs/client is absent', () => {
    const input = `import { foo } from './bar'`
    expect(rewriteBarefootClientSpecifiers(input, './barefoot.js')).toBe(input)
  })
})
