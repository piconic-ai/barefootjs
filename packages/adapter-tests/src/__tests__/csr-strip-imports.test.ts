/**
 * `stripTopLevelImports` (CSR harness): only real top-level import
 * declarations go; import/export-looking text inside strings, template
 * literals and comments is module content and must survive verbatim.
 */

import { describe, test, expect } from 'bun:test'
import { stripTopLevelImports } from '../csr-render'

describe('stripTopLevelImports', () => {
  test('removes every top-level import form', () => {
    const code = [
      "import { a, b as c } from '@barefootjs/client/runtime'",
      "import d from './d'",
      "import * as e from './e'",
      "import './side-effect';",
      'const kept = 1',
    ].join('\n')
    expect(stripTopLevelImports(code).trim()).toBe('const kept = 1')
  })

  test('keeps import/export-looking lines inside template literals, strings and comments', () => {
    const code = [
      "import { x } from './x'",
      'const t = `before',
      "import { Tag } from './tag'",
      "import './side-effect'",
      'export default t',
      'after`',
      "const s = \"import { y } from './y'\"",
      "// import { z } from './z'",
      '/*',
      "import './w'",
      '*/',
    ].join('\n')
    const expected = code.slice(code.indexOf('\n'))
    expect(stripTopLevelImports(code)).toBe(expected)
  })

  test('leaves a module without imports byte-identical', () => {
    const code = 'hydrate("A", { template: (p) => `<p>${p.x}</p>` })\n'
    expect(stripTopLevelImports(code)).toBe(code)
  })
})
