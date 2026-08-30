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

  test('passes through and dedupes side-effect imports, and a lone default import, by line', () => {
    const out = mergeTemplateImports([
      "import './a.css'",
      "import Foo from 'foo'",
      "import './a.css'",
      "import { x } from 'm'",
    ])
    expect(out).toBe("import './a.css'\nimport Foo from 'foo'\nimport { x } from 'm'")
  })

  // #2767 follow-up: two sibling components in a multi-component file both
  // compile from the SAME module-scope `import cfg from 'lib'` declaration,
  // but each component's own compiled output only lists the specifiers IT
  // uses — so one component's output can carry `import cfg from 'lib'` and
  // another's `import cfg, { helper } from 'lib'`. Exact-line dedup keeps
  // BOTH (they're different strings), redeclaring `cfg` — a hard
  // `SyntaxError`. Folding by source must collapse them into one line.
  test('folds a default import shared across sibling components instead of redeclaring the binding', () => {
    const out = mergeTemplateImports([
      "import cfg from 'lib'",
      "import cfg, { helper } from 'lib'",
    ])
    expect(out).toBe("import cfg, { helper } from 'lib'")
    expect((out.match(/\bcfg\b/g) ?? []).length).toBe(1)
  })

  test('folds a default import with named specifiers arriving in the opposite order', () => {
    const out = mergeTemplateImports([
      "import cfg, { helperA } from 'lib'",
      "import cfg, { helperB } from 'lib'",
    ])
    expect(out).toBe("import cfg, { helperA, helperB } from 'lib'")
  })

  test('keeps a default import separate from a differently-sourced named import', () => {
    const out = mergeTemplateImports([
      "import cfg from 'lib'",
      "import { helper } from 'other-lib'",
    ])
    expect(out).toBe("import cfg from 'lib'\nimport { helper } from 'other-lib'")
  })

  test('dedupes an identical namespace import shared across sibling components', () => {
    const out = mergeTemplateImports([
      "import * as NS from 'lib'",
      "import * as NS from 'lib'",
    ])
    expect(out).toBe("import * as NS from 'lib'")
  })
})
