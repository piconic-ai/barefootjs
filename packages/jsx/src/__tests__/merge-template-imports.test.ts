import { describe, test, expect } from 'bun:test'
import { mergeTemplateImports } from '../compiler'

describe('mergeTemplateImports', () => {
  test('merges same-source named imports with disjoint + overlapping symbols', () => {
    const out = mergeTemplateImports([
      "import { bfText, bfTextEnd } from '@barefootjs/hono/utils'",
      "import { bfComment } from '@barefootjs/hono/utils'",
      "import { bfComment, bfText, bfTextEnd } from '@barefootjs/hono/utils'",
    ])
    // Single statement, no redeclared binding (Deno rejects duplicates).
    expect(out).toBe("import { bfText, bfTextEnd, bfComment } from '@barefootjs/hono/utils'")
    expect((out.match(/from '@barefootjs\/hono\/utils'/g) ?? []).length).toBe(1)
  })

  // The merge must not depend on the emitter's exact spacing: a named import
  // that slipped past the matcher would fall through to by-line dedup and
  // re-introduce the duplicate `bfComment` binding Deno rejects. Mixed
  // spacing (compact, padded, double-spaced `from`, trailing `;`) must still
  // collapse to one statement.
  test('folds same-source imports regardless of whitespace / trailing semicolon', () => {
    const out = mergeTemplateImports([
      "import {bfText,bfTextEnd} from '@barefootjs/hono/utils'",
      "import {  bfComment  }  from  \"@barefootjs/hono/utils\";",
      "import { bfComment, bfText } from '@barefootjs/hono/utils'",
    ])
    expect(out).toBe("import { bfText, bfTextEnd, bfComment } from '@barefootjs/hono/utils'")
    expect((out.match(/from '@barefootjs\/hono\/utils'/g) ?? []).length).toBe(1)
  })

  // `import type` must stay separate from the value import even with compact
  // spacing — the value matcher must not swallow a type-only line.
  test('keeps type vs value separate under compact spacing', () => {
    const out = mergeTemplateImports([
      "import {Foo} from 'x'",
      "import type {Bar} from 'x'",
    ])
    expect(out).toBe("import { Foo } from 'x'\nimport type { Bar } from 'x'")
  })

  test('single-component input is unchanged (order preserved)', () => {
    const lines = [
      "import { bfComment, bfText, bfTextEnd } from '@barefootjs/hono/utils'",
      "import { createSignal } from '@barefootjs/hono/client-shim'",
      "import { Button } from '@/components/ui/button'",
    ]
    expect(mergeTemplateImports(lines)).toBe(lines.join('\n'))
  })

  test('keeps value and type imports from the same source separate', () => {
    const out = mergeTemplateImports([
      "import { Foo } from 'x'",
      "import type { Bar } from 'x'",
      "import { Baz } from 'x'",
    ])
    expect(out).toBe("import { Foo, Baz } from 'x'\nimport type { Bar } from 'x'")
  })

  test('passes through and dedupes side-effect / default imports by line', () => {
    const out = mergeTemplateImports([
      "import './a.css'",
      "import Foo from 'foo'",
      "import './a.css'",
      "import { x } from 'm'",
    ])
    expect(out).toBe("import './a.css'\nimport Foo from 'foo'\nimport { x } from 'm'")
  })
})
