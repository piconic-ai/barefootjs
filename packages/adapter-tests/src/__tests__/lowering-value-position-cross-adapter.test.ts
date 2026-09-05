/**
 * Registered-lowering-in-nested-value-position, across every adapter (#2843).
 *
 * `queryHref(base, { … })`'s object-literal argument is only "supported" via
 * the lowering registry (#2057) — a bare object literal at `'rendered'`
 * position is otherwise refused (BF101). Before #2843, the registry
 * consultation for that refusal lived in each adapter's OWN top-level
 * `convertExpressionTo*` entry point, so it only fired when `queryHref(...)`
 * was itself the DIRECT attribute value. A registered call anywhere else in
 * the tree — inside a ternary branch (#2842), inside a template-literal
 * interpolation (this file) — fell through to the generic recursive support
 * gate, which had never heard of the registry, and refused the nested
 * object-literal argument with BF101 on the 7 DSL adapters (Go and Hono were
 * unaffected: Go's `call()` dispatcher already consulted the registry first,
 * per #2842; Hono is real JS pass-through with no support gate at all).
 *
 * The fix moved the registry consultation into the SHARED core (the
 * `checkSupport`/`isSupported`/`isSupportedValue` gate in
 * `expression-parser.ts`, and the shared `call` case in `emitParsedExpr`'s
 * dispatcher, `parsed-expr-emitter.ts`) — one decision, one implementation,
 * every adapter wires up only its own already-existing rendering logic via a
 * new `lowering` seam on its top-level `ParsedExprEmitter`. This test pins
 * that EVERY adapter agrees: a template-literal-nested `queryHref` call
 * lowers to that adapter's `query` helper, with zero BF101/error
 * diagnostics — the cross-adapter regression coverage the "no test
 * comparing them" defect class (CLAUDE.md) calls for.
 */
import { describe, test, expect } from 'bun:test'
import { compileJSX } from '@barefootjs/jsx'
import type { TemplateAdapter } from '@barefootjs/jsx'
import { HonoAdapter } from '@barefootjs/hono/adapter'
import { GoTemplateAdapter } from '@barefootjs/go-template/adapter'
import { JinjaAdapter } from '@barefootjs/jinja/adapter'
import { XslateAdapter } from '@barefootjs/xslate/adapter'
import { TwigAdapter } from '@barefootjs/twig/adapter'
import { ErbAdapter } from '@barefootjs/erb/adapter'
import { MojoAdapter } from '@barefootjs/mojolicious/adapter'
import { BladeAdapter } from '@barefootjs/blade/adapter'
import { MinijinjaAdapter } from '@barefootjs/rust/adapter'

const SOURCE = `
'use client'
import { queryHref } from '@barefootjs/client'
export function P(props: { base: string; tag: string }) {
  return <a title={\`pre \${queryHref(props.base, { tag: props.tag })}\`}>x</a>
}
`

interface AdapterCase {
  name: string
  make: () => TemplateAdapter
  /** Substring the rendered `title` attribute must contain — this adapter's `query` helper call. */
  queryCall: string
  /** Substring that must NOT appear — an unresolved bare `queryHref` reference (registry miss). */
  unresolved: string | null
}

const ADAPTERS: readonly AdapterCase[] = [
  {
    name: 'hono',
    make: () => new HonoAdapter(),
    // Reference adapter: real JS pass-through, no lowering registry needed —
    // `queryHref` resolves as an ordinary imported call.
    queryCall: 'queryHref(props.base, { tag: props.tag })',
    unresolved: null,
  },
  {
    name: 'go-template',
    make: () => new GoTemplateAdapter(),
    queryCall: 'bf_query .Base (true) "tag" .Tag',
    unresolved: '.QueryHref',
  },
  {
    name: 'jinja',
    make: () => new JinjaAdapter(),
    queryCall: "bf.query(base, 1, 'tag', tag)",
    unresolved: 'queryHref',
  },
  {
    name: 'xslate',
    make: () => new XslateAdapter(),
    queryCall: "$bf.query($base, 1, 'tag', $tag)",
    unresolved: 'queryHref',
  },
  {
    name: 'twig',
    make: () => new TwigAdapter(),
    queryCall: "bf.query(base, 1, 'tag', tag)",
    unresolved: 'queryHref',
  },
  {
    name: 'erb',
    make: () => new ErbAdapter(),
    queryCall: "bf.query(v[:base], 1, 'tag', v[:tag])",
    unresolved: 'queryHref',
  },
  {
    name: 'mojolicious',
    make: () => new MojoAdapter(),
    queryCall: "bf->query($base, 1, 'tag', $tag)",
    unresolved: 'queryHref',
  },
  {
    name: 'blade',
    make: () => new BladeAdapter(),
    queryCall: "$bf->query($base, 1, 'tag', $tag)",
    unresolved: 'queryHref',
  },
  {
    name: 'rust-minijinja',
    make: () => new MinijinjaAdapter(),
    queryCall: "bf.query(base, 1, 'tag', tag)",
    unresolved: 'queryHref',
  },
]

describe('a registered lowering call nested in a template-literal interpolation lowers identically on every adapter (#2843)', () => {
  for (const adapter of ADAPTERS) {
    test(adapter.name, () => {
      const result = compileJSX(SOURCE, 'P.tsx', { adapter: adapter.make() })
      expect(result.errors.filter(e => e.severity === 'error')).toEqual([])
      const file = result.files.find(f => f.type === 'markedTemplate')
      expect(file).toBeDefined()
      expect(file!.content).toContain(adapter.queryCall)
      if (adapter.unresolved !== null) {
        expect(file!.content).not.toContain(adapter.unresolved)
      }
    })
  }
})
