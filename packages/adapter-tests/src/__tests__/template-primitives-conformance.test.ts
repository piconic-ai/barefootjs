/**
 * Template-Primitive Conformance Tests
 *
 * Cross-adapter conformance for the `templatePrimitives` /
 * `acceptsTemplateCall` contract added in #1187 phase 3. Each test
 * case is a small component whose generated client JS should either
 * inline a template-scope call or fall back to `(undefined)` —
 * depending on what the adapter promises it can render.
 *
 * Pattern:
 *
 * - `cases` is the canonical set of behaviours every adapter is
 *   expected to satisfy *eventually*.
 * - `adapters` enumerates each adapter under test with an opt-out
 *   `skip` set: cases the adapter doesn't yet support. Adapters that
 *   fully implement the contract (currently: Hono, via broad
 *   `acceptsTemplateCall`) skip nothing. Adapters that haven't filled
 *   their `templatePrimitives` yet (Go, future Perl) skip the cases
 *   their template runtime can't render.
 *
 * When an adapter graduates a case (registers the primitive or flips
 * to broad acceptance), the matching entry comes off the skip list
 * and the test starts passing — no test rewrite needed.
 */

import { describe, test, expect } from 'bun:test'
// Source-path imports (not via package exports). Several adapters and
// `@barefootjs/jsx` itself ship dist builds in their `exports` field; in
// dev that dist may be stale relative to `src/`, which breaks the
// conformance signal. Reach the source directly so this suite always
// reflects the in-tree behaviour.
import { compileJSX } from '../../../jsx/src/compiler'
import type { TemplateAdapter } from '../../../jsx/src/types'
import { HonoAdapter } from '../../../adapter-hono/src/adapter/hono-adapter'
import { GoTemplateAdapter } from '../../../adapter-go-template/src/adapter/go-template-adapter'

const FALLBACK_SENTINEL = '(undefined)'

// Closed enumeration of conformance case ids so adapter `skip` sets can't
// drift from the case list — a typo here is a TypeScript error rather
// than a silently-skipped (or silently-not-skipped) test.
const CaseId = {
  JSON_STRINGIFY_VIA_CONST: 'json-stringify-via-const',
  MATH_FLOOR_VIA_CONST: 'math-floor-via-const',
  USER_IMPORT_VIA_CONST: 'user-import-via-const',
  NO_DOUBLE_REWRITE_OF_PROPS_OBJECT: 'no-double-rewrite-of-props-object',
} as const
type CaseId = (typeof CaseId)[keyof typeof CaseId]

interface ConformanceCase {
  id: CaseId
  description: string
  source: string
  /** Assertion run against the generated client JS string. */
  assert: (clientJs: string) => void
}

const cases: ConformanceCase[] = [
  {
    id: CaseId.JSON_STRINGIFY_VIA_CONST,
    description: 'JSON.stringify(props.x) via const inlines into template',
    source: `
      'use client'
      export function Foo(props: { config: object }) {
        const json = JSON.stringify(props.config)
        return <div data-config={json}>hi</div>
      }
    `,
    assert: (clientJs) => {
      expect(clientJs).not.toContain(FALLBACK_SENTINEL)
      expect(clientJs).toContain('JSON.stringify(_p.config)')
    },
  },
  {
    id: CaseId.MATH_FLOOR_VIA_CONST,
    description: 'Math.floor(props.score) via const inlines into template',
    source: `
      'use client'
      export function Foo(props: { score: number }) {
        const rounded = Math.floor(props.score)
        return <div data-rounded={rounded}>hi</div>
      }
    `,
    assert: (clientJs) => {
      expect(clientJs).not.toContain(FALLBACK_SENTINEL)
      expect(clientJs).toContain('Math.floor(_p.score)')
    },
  },
  {
    id: CaseId.USER_IMPORT_VIA_CONST,
    description: 'user-imported function via const inlines into template',
    source: `
      'use client'
      import { customSerialize } from './lib'
      export function Foo(props: { config: object }) {
        const serialized = customSerialize(props.config)
        return <div data-config={serialized}>hi</div>
      }
    `,
    assert: (clientJs) => {
      expect(clientJs).not.toContain(FALLBACK_SENTINEL)
      expect(clientJs).toContain('customSerialize(_p.config)')
    },
  },
  {
    id: CaseId.NO_DOUBLE_REWRITE_OF_PROPS_OBJECT,
    description: 'props-object lift does not leak `_p._p.X` into the template',
    source: `
      'use client'
      import { customSerialize } from './lib'
      export function Foo(props: { a: number; b: number }) {
        const json = customSerialize({ a: props.a, b: props.b })
        return <div data-config={json}>hi</div>
      }
    `,
    assert: (clientJs) => {
      // Pre-fix this produced `_p._p.a` / `_p._p.b` because the
      // props-object name was lifted via the per-key form.
      expect(clientJs).not.toContain('_p._p')
      expect(clientJs).toContain('_p.a')
      expect(clientJs).toContain('_p.b')
    },
  },
]

interface AdapterUnderTest {
  name: string
  factory: () => TemplateAdapter
  /**
   * Cases this adapter doesn't yet support. Empty when the adapter
   * satisfies every case. The `CaseId` constant constrains entries.
   */
  skip: Set<CaseId>
}

const adapters: AdapterUnderTest[] = [
  {
    name: 'hono',
    factory: () => new HonoAdapter(),
    // Hono uses `acceptsTemplateCall: () => true` (its SSR runtime is
    // JS), so every case is in scope.
    skip: new Set(),
  },
  {
    name: 'go-template',
    factory: () => new GoTemplateAdapter(),
    // Go's template runtime is the Go html/template engine — it can
    // render only callees the adapter explicitly maps to a Go template
    // function via `templatePrimitives`. None are mapped yet (#1188),
    // so every positive-inlining case stays skipped until that lands.
    skip: new Set([
      CaseId.JSON_STRINGIFY_VIA_CONST,
      CaseId.MATH_FLOOR_VIA_CONST,
      CaseId.USER_IMPORT_VIA_CONST,
      CaseId.NO_DOUBLE_REWRITE_OF_PROPS_OBJECT,
    ]),
  },
]

for (const a of adapters) {
  describe(`[${a.name}] template primitives conformance (#1187 phase 3)`, () => {
    for (const c of cases) {
      const t = a.skip.has(c.id) ? test.skip : test
      t(`${c.id}: ${c.description}`, () => {
        const result = compileJSX(c.source, 'Test.tsx', { adapter: a.factory() })
        const clientJs = result.files.find((f) => f.type === 'clientJs')?.content ?? ''
        c.assert(clientJs)
      })
    }
  })
}
