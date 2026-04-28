import { describe, test, expect } from 'bun:test'
import { mergeDuplicateNamedImports } from '../lib/build'

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
})
