/**
 * The no-silent-divergence trichotomy, made executable (Stage 3 root cure,
 * spec/callback-fidelity.md).
 *
 * For EVERY `.map()` callback body shape, exactly one of these must hold:
 *   1. it compiles clean AND the emitted client bundle is sound
 *      (parses as plain JS, no raw JSX, no compiler-internal sentinel), or
 *   2. the compiler raises a BF error (loud, actionable refusal).
 *
 * A shape that compiles clean but emits a broken bundle is a SILENT HOLE —
 * the failure class this harness exists to make impossible to reintroduce.
 * Shapes cannot be enumerated; axes can. The matrix below sweeps:
 *
 *   - return kind: single element / fragment / bare identifier / ternary
 *   - loop position: top-level / nested inner map / conditional branch
 *   - array kind: prop / module-scope const / signal
 *   - leaf content: static+interpolation / event handler / component
 *   - adapter tier: JS runtime / DSL (acceptsCallbackBody = false)
 *
 * `KNOWN_HOLES` pins the exact current reality: entries are shapes that are
 * silent holes TODAY, tracked so the set only ever shrinks. A fixed hole must
 * be removed from the set (the test fails if a listed hole stops leaking —
 * no stale entries). The root-cure commits drive this set to empty; it must
 * never grow.
 */

import { describe, test, expect, beforeAll, afterAll } from 'bun:test'
import ts from 'typescript'
import { compileJSX } from '../compiler'
import { TestAdapter } from '../adapters/test-adapter'

// Arm the getJS trust-boundary assertion (analyzer-context.ts) for THIS
// file's compiles only: any getJS call on a JSX-bearing node throws instead
// of splicing raw JSX into output. Scoped via beforeAll/afterAll because bun
// runs suite files in one process — a module-scope assignment would leak the
// assertion into every later file and fail pre-existing raw-JSX-via-getJS
// paths outside this harness's axes (e.g. the Array.from mapper lowering),
// which are tracked for their own segments migration rather than pinned here.
let prevAssertEnv: string | undefined
beforeAll(() => {
  prevAssertEnv = process.env.BF_ASSERT_NO_JSX_IN_GETJS
  process.env.BF_ASSERT_NO_JSX_IN_GETJS = '1'
})
afterAll(() => {
  if (prevAssertEnv === undefined) delete process.env.BF_ASSERT_NO_JSX_IN_GETJS
  else process.env.BF_ASSERT_NO_JSX_IN_GETJS = prevAssertEnv
})

interface Shape {
  id: string
  source: string
  /** Run on the DSL tier too (default: JS runtime only). */
  dslTier?: boolean
}

/** Shapes that are silent holes today. Shrink-only — never add entries. */
// EMPTY — and it must stay that way. The structured-preamble migration healed
// the multi-root, nested-inner-map, and branch-loop holes by construction
// (every plan builder renders through the single `renderPreamble` door), and
// the Phase-1 acceptance guard closed the return-shape holes (bare identifier,
// ternary: no single element root → loud BF021 with restructuring guidance).
// A future entry here means a NEW silent hole shipped: fix the leak, don't
// grow the set.
const KNOWN_HOLES: ReadonlySet<string> = new Set([])

const shapes: Shape[] = [
  {
    id: 'canonical-array-builder',
    dslTier: true,
    source: `
function T({ rows }: { rows: { id: string; cells: string[] }[] }) {
  return <table><tbody>{rows.map((r) => {
    const out = []
    for (const c of r.cells) out.push(<td>{c}</td>)
    return <tr key={r.id}>{out}</tr>
  })}</tbody></table>
}
export { T }`,
  },
  {
    id: 'while-push-builder',
    source: `
function T({ rows }: { rows: { id: string; cells: string[] }[] }) {
  return <table><tbody>{rows.map((r) => {
    const out = []
    let i = 0
    while (i < r.cells.length) { out.push(<td>{r.cells[i]}</td>); i++ }
    return <tr key={r.id}>{out}</tr>
  })}</tbody></table>
}
export { T }`,
  },
  {
    id: 'conditional-push-builder',
    source: `
function T({ rows }: { rows: { id: string; on: boolean; cells: string[] }[] }) {
  return <table><tbody>{rows.map((r) => {
    const out = []
    for (const c of r.cells) if (r.on) out.push(<td>{c}</td>)
    return <tr key={r.id}>{out}</tr>
  })}</tbody></table>
}
export { T }`,
  },
  {
    id: 'return-bare-identifier',
    dslTier: true,
    source: `
function T({ rows }: { rows: { id: string; cells: string[] }[] }) {
  return <ul>{rows.map((r) => {
    const out = []
    for (const c of r.cells) out.push(<li key={r.id + c}>{c}</li>)
    return out
  })}</ul>
}
export { T }`,
  },
  {
    id: 'return-multi-root-fragment',
    dslTier: true,
    source: `
function T({ rows }: { rows: { id: string; cells: string[] }[] }) {
  return <table><tbody>{rows.map((r) => {
    const extra = <td>x</td>
    return <>{r.cells.map((c) => <td key={c}>{c}</td>)}{extra}</>
  })}</tbody></table>
}
export { T }`,
  },
  {
    id: 'return-ternary-after-builder',
    source: `
function T({ rows }: { rows: { id: string; on: boolean; cells: string[] }[] }) {
  return <table><tbody>{rows.map((r) => {
    const out = []
    for (const c of r.cells) out.push(<td>{c}</td>)
    return r.on ? <tr key={r.id}>{out}</tr> : <tr key={r.id}><td>off</td></tr>
  })}</tbody></table>
}
export { T }`,
  },
  {
    id: 'nested-inner-map-builder',
    source: `
function T({ groups }: { groups: { id: string; rows: { id: string; cells: string[] }[] }[] }) {
  return <div>{groups.map((g) => (
    <table key={g.id}><tbody>{g.rows.map((r) => {
      const out = []
      for (const c of r.cells) out.push(<td>{c}</td>)
      return <tr key={r.id}>{out}</tr>
    })}</tbody></table>
  ))}</div>
}
export { T }`,
  },
  {
    id: 'branch-loop-builder',
    source: `
'use client'
import { createSignal } from '@barefootjs/client'
function T({ rows }: { rows: { id: string; cells: string[] }[] }) {
  const [show] = createSignal(true)
  return <div>{show() ? <table><tbody>{rows.map((r) => {
    const out = []
    for (const c of r.cells) out.push(<td>{c}</td>)
    return <tr key={r.id}>{out}</tr>
  })}</tbody></table> : <p>none</p>}</div>
}
export { T }`,
  },
  {
    id: 'static-module-const-array-builder',
    source: `
const ROWS = [{ id: '1', cells: ['a', 'b'] }, { id: '2', cells: ['c'] }]
function T() {
  return <table><tbody>{ROWS.map((r) => {
    const out = []
    for (const c of r.cells) out.push(<td>{c}</td>)
    return <tr key={r.id}>{out}</tr>
  })}</tbody></table>
}
export { T }`,
  },
  {
    id: 'signal-array-builder',
    source: `
'use client'
import { createSignal } from '@barefootjs/client'
function T() {
  const [rows] = createSignal([{ id: '1', cells: ['a'] }])
  return <table><tbody>{rows().map((r) => {
    const out = []
    for (const c of r.cells) out.push(<td>{c}</td>)
    return <tr key={r.id}>{out}</tr>
  })}</tbody></table>
}
export { T }`,
  },
  {
    id: 'leaf-with-event-handler',
    source: `
function T({ rows }: { rows: { id: string; cells: string[] }[] }) {
  return <table><tbody>{rows.map((r) => {
    const out = []
    for (const c of r.cells) out.push(<td onClick={() => console.log(c)}>{c}</td>)
    return <tr key={r.id}>{out}</tr>
  })}</tbody></table>
}
export { T }`,
  },
  {
    id: 'component-root-builder',
    // Builder preamble + component root: the component would receive raw HTML
    // strings on the client but JSX elements at SSR — refused (dom-ops row
    // construction cannot host a string-lowered preamble).
    source: `
import { Row } from './row'
function T({ rows }: { rows: { id: string; cells: string[] }[] }) {
  return <table><tbody>{rows.map((r) => {
    const out = []
    for (const c of r.cells) out.push(<td>{c}</td>)
    return <Row key={r.id} cells={out} />
  })}</tbody></table>
}
export { T }`,
  },
  {
    id: 'leaf-with-component',
    source: `
import { Badge } from './badge'
function T({ rows }: { rows: { id: string; cells: string[] }[] }) {
  return <table><tbody>{rows.map((r) => {
    const out = []
    for (const c of r.cells) out.push(<td><Badge label={c} /></td>)
    return <tr key={r.id}>{out}</tr>
  })}</tbody></table>
}
export { T }`,
  },
  {
    id: 'flatmap-block-body',
    // flatMap block bodies ride the same segments + renderPreamble machinery.
    source: `
function T({ items }: { items: { id: string; tags: string[] }[] }) {
  return <ul>{items.flatMap((it) => {
    return it.tags.map((t) => <li key={t}>{t}</li>)
  })}</ul>
}
export { T }`,
  },
  {
    id: 'flatmap-nested-in-map',
    source: `
function T({ groups }: { groups: { id: string; items: { id: string; tags: string[] }[] }[] }) {
  return <div>{groups.map((g) => (
    <ul key={g.id}>{g.items.flatMap((it) => {
      return it.tags.map((t) => <li key={t}>{t}</li>)
    })}</ul>
  ))}</div>
}
export { T }`,
  },
  {
    id: 'flatmap-expression-body',
    // The unbraced twin of flatmap-block-body: `t => t.tags.map(...)` with no
    // block. Pre-fix this fell through every dispatch arm to the IRExpression
    // scalar path and spliced the raw callback — JSX included — verbatim into
    // the client bundle (a silent SyntaxError caught only by parseErrors).
    dslTier: true,
    source: `
function T({ items }: { items: { id: string; tags: string[] }[] }) {
  return <ul>{items.flatMap((it) => it.tags.map((t) => <li key={t}>{t}</li>))}</ul>
}
export { T }`,
  },
  {
    id: 'flatmap-expression-body-parenthesized',
    source: `
function T({ items }: { items: { id: string; tags: string[] }[] }) {
  return <ul>{items.flatMap((it) => (it.tags.map((t) => <li key={t}>{t}</li>)))}</ul>
}
export { T }`,
  },
  {
    id: 'flatmap-expression-body-signal-array',
    source: `
'use client'
import { createSignal } from '@barefootjs/client'
function T() {
  const [items] = createSignal([{ id: '1', tags: ['a'] }])
  return <ul>{items().flatMap((it) => it.tags.map((t) => <li key={t}>{t}</li>))}</ul>
}
export { T }`,
  },
  {
    id: 'map-jsx-inside-unrecognized-call',
    // An inline JSX literal in a body shape no dispatch arm recognizes (a call
    // wrapping JSX). The structural net refuses loudly instead of letting the
    // scalar fallback splice the raw JSX into the bundle.
    dslTier: true,
    source: `
declare function wrap(x: unknown): unknown
function T({ items }: { items: { id: string }[] }) {
  return <ul>{items.map((it) => wrap(<li key={it.id}>{it.id}</li>))}</ul>
}
export { T }`,
  },
  {
    id: 'flatmap-leaf-in-template-literal',
    // A leaf inside a template literal is refused (segment boundary would
    // split the literal's lexical state) — same rule as map preambles.
    source: `
function T({ items }: { items: { id: string }[] }) {
  return <ul>{items.flatMap((it) => {
    const s = \`x\${<b>{it.id}</b>}\`
    return [<li key={it.id}>{s}</li>]
  })}</ul>
}
export { T }`,
  },
  {
    id: 'value-only-preamble',
    dslTier: true,
    source: `
function T({ items }: { items: { id: string; name: string }[] }) {
  return <ul>{items.map((it) => {
    const label = it.name.toUpperCase()
    return <li key={it.id}>{label}</li>
  })}</ul>
}
export { T }`,
  },
  {
    id: 'client-marked-builder-on-dsl',
    dslTier: true,
    source: `
function T({ rows }: { rows: { id: string; cells: string[] }[] }) {
  return <table><tbody>{/* @client */ rows.map((r) => {
    const out = []
    for (const c of r.cells) out.push(<td>{c}</td>)
    return <tr key={r.id}>{out}</tr>
  })}</tbody></table>
}
export { T }`,
  },
]

interface Soundness {
  hasBfError: boolean
  sentinelLeak: boolean
  rawJsxLeak: boolean
  parseErrors: number
}

function assess(source: string, dsl: boolean): Soundness {
  const a = new TestAdapter()
  if (dsl) a.acceptsCallbackBody = () => false
  const r = compileJSX(source, 'T.tsx', { adapter: a })
  const cj = r.files.find((f) => f.type === 'clientJs')?.content ?? ''

  // Emitted client JS must be plain JS: parse it with JSX disabled and count
  // syntactic diagnostics. Raw JSX (`out.push(<td>…)`) is not valid plain JS.
  const sf = ts.createSourceFile('bundle.js', cj, ts.ScriptTarget.ES2022, /*setParentNodes*/ false, ts.ScriptKind.JS)
  const parseErrors = (sf as unknown as { parseDiagnostics: unknown[] }).parseDiagnostics.length

  return {
    hasBfError: r.errors.some((e) => e.severity !== 'warning'),
    sentinelLeak: /__BF_JSX_\d+__/.test(cj),
    rawJsxLeak: /\bpush\(</.test(cj),
    parseErrors,
  }
}

function isSound(s: Soundness): boolean {
  return !s.sentinelLeak && !s.rawJsxLeak && s.parseErrors === 0
}

describe('.map() body trichotomy — sound bundle XOR loud error, never silence', () => {
  for (const shape of shapes) {
    const tiers = shape.dslTier ? [false, true] : [false]
    for (const dsl of tiers) {
      const tier = dsl ? 'DSL' : 'JS-runtime'
      // Holes are tracked on the JS-runtime tier (DSL refuses via gating).
      const isKnownHole = !dsl && KNOWN_HOLES.has(shape.id)

      test(`${shape.id} (${tier})${isKnownHole ? ' [known hole]' : ''}`, () => {
        const s = assess(shape.source, dsl)
        if (isKnownHole) {
          // Pin the hole precisely: it must still be SILENT (no error) and
          // UNSOUND. When a root-cure commit fixes it, this assertion fails,
          // forcing the entry's removal — the set can only shrink.
          expect(s.hasBfError).toBe(false)
          expect(isSound(s)).toBe(false)
        } else {
          // The trichotomy: sound clean compile, or a loud error.
          expect(s.hasBfError || isSound(s)).toBe(true)
          if (s.hasBfError) {
            // Even a refused compile must not leak the sentinel into output.
            expect(s.sentinelLeak).toBe(false)
          }
        }
      })
    }
  }
})
