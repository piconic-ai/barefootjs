/**
 * Coverage bookkeeping (`spec/subset-conformance.md`): compute, per
 * conformance fixture, the `ParsedExpr` kinds, mechanical axes, and
 * lowering contexts it exercises — the aggregation that turns "does a
 * fixture cover X?" from folklore into a queryable map.
 *
 * Coverage is COMPUTED from the compiled IR, never declared by hand:
 * test262 anchors tests to spec clauses with frontmatter because no
 * compiler links a test to the grammar it exercises — here the compiler
 * is available, its parse IS the link, and a manual declaration would
 * only drift from it. The one hand-maintained artifact is the
 * denominator (`PARSED_EXPR_KINDS`, exhaustiveness-pinned in
 * `expression-parser.ts`) and the documented exclusion list in the
 * ledger-floor meta-test.
 *
 * Axes derive mechanically from the variant fields that change an
 * adapter's lowering: `logical:<op>`, `binary:<op>`, `unary:<op>`,
 * `literal:<literalType>`, `array-method:<method>`, `member:optional`,
 * `member:computed`. Kinds whose fields don't fork lowerings carry no
 * axis. Two axis families cover the halves of the change-time coupling
 * rule that used to have no mechanical numerator (the floor tests'
 * denominators are `BUILTIN_LOWERING_PLUGINS` and the `SORT_KEY_*`
 * registries): `lowering:<plugin.name>` records that a fixture's IR
 * carries a call a builtin lowering plugin recognises (matchers are
 * bound per component via each plugin's own `prepare`, the exact seam
 * adapters use at emit time — lowering nodes are never stored in the
 * IR, so recognition is re-run here), and `sort-key:<type>` /
 * `sort-target:<self|field>` / `sort-direction:<asc|desc>` /
 * `sort:multi-key` classify each loop's `sortComparator` arrow through
 * `sortComparatorFromArrow`, the same catalogue recovery the adapters'
 * legacy fallback uses. Contexts come from where a parsed tree hangs off the IR:
 * `text` (child expression), `attribute`, `condition`, `loop`.
 *
 * Granularity note: `kinds`/`axes` walk the ENTIRE IR, metadata included
 * (signal initial values, local constants, SSR seed plans) — those trees
 * are lowered too, just not in template positions. `contexts` is the
 * disambiguator: a fixture whose kind appears only in metadata has no
 * corresponding context entry.
 */

import {
  compileJSX,
  PARSED_EXPR_KINDS,
  BUILTIN_LOWERING_PLUGINS,
  sortComparatorFromArrow,
  type IRMetadata,
  type LoweringMatcher,
  type ParsedExpr,
} from '@barefootjs/jsx'
import { HonoAdapter } from '@barefootjs/hono/adapter'
import { jsxFixtures } from '../fixtures'
import type { JSXFixture } from './types'

export interface FixtureCoverage {
  kinds: string[]
  axes: string[]
  contexts: string[]
}

export interface CoverageMap {
  /** Per-fixture exercised sets, keyed by fixture id, sorted keys. */
  fixtures: Record<string, FixtureCoverage>
  /** Fixture-count per kind across the corpus (the ledger numerators). */
  kindCounts: Record<string, number>
  /** Fixture-count per axis across the corpus. */
  axisCounts: Record<string, number>
  /** Registry kinds no fixture exercises (the ledger-floor holes). */
  uncoveredKinds: string[]
}

const KIND_SET: ReadonlySet<string> = new Set(PARSED_EXPR_KINDS)

/**
 * Whether an object with a registry-matching `kind` string really is a
 * `ParsedExpr` node. The one KNOWN collision in serialized IR is
 * `LiteralAttr` (`{ kind: 'literal', value }` — no `literalType`); the
 * 'arrow' / 'unsupported' checks are defensive signatures against future
 * unions, not known impostors today.
 */
function isParsedExprNode(kind: string, rec: Record<string, unknown>): boolean {
  switch (kind) {
    case 'literal':
      return 'literalType' in rec
    case 'arrow':
      return Array.isArray(rec.params) && 'body' in rec
    case 'unsupported':
      return 'raw' in rec && 'reason' in rec
    default:
      return true
  }
}

/** A builtin lowering plugin's matcher bound to one component's metadata. */
interface BoundLoweringMatcher {
  name: string
  match: LoweringMatcher
}

/**
 * Bind every builtin lowering plugin to a component's metadata via its own
 * `prepare` — the same per-component resolution adapters run at emit time.
 * A plugin whose import (or reachable prop type, for the Date plugins) is
 * absent returns no matcher and simply can't contribute its axis.
 */
function prepareBuiltinMatchers(metadata: IRMetadata): BoundLoweringMatcher[] {
  const bound: BoundLoweringMatcher[] = []
  for (const plugin of BUILTIN_LOWERING_PLUGINS) {
    const match = plugin.prepare(metadata)
    if (match) bound.push({ name: plugin.name, match })
  }
  return bound
}

/**
 * Classify an `IRLoopSort` comparator arrow into the finite catalogue and
 * record its axes: `sort-key:<type>` / `sort-target:<self|field>` /
 * `sort-direction:<asc|desc>` per key, plus `sort:multi-key` for a
 * `||`-chained comparator. An arrow outside the catalogue (served by the
 * runtime evaluator alone) records no axis — the floor ranges over the
 * `SORT_KEY_*` registries, not over arbitrary comparators.
 */
function collectSortAxes(sort: Record<string, unknown>, axes: Set<string>): void {
  const arrow = sort.arrow as ParsedExpr | undefined
  if (!arrow || typeof arrow !== 'object' || arrow.kind !== 'arrow') return
  const comparator = sortComparatorFromArrow(arrow)
  if (!comparator) return
  for (const key of comparator.keys) {
    axes.add(`sort-key:${key.type}`)
    axes.add(`sort-target:${key.key.kind}`)
    axes.add(`sort-direction:${key.direction}`)
  }
  if (comparator.keys.length > 1) axes.add('sort:multi-key')
}

function collectKindsAndAxes(
  node: unknown,
  kinds: Set<string>,
  axes: Set<string>,
  matchers: readonly BoundLoweringMatcher[],
): void {
  if (!node || typeof node !== 'object') return
  if (Array.isArray(node)) {
    for (const item of node) collectKindsAndAxes(item, kinds, axes, matchers)
    return
  }
  const rec = node as Record<string, unknown>
  const kind = rec.kind
  if (typeof kind === 'string' && KIND_SET.has(kind) && isParsedExprNode(kind, rec)) {
    kinds.add(kind)
    switch (kind) {
      case 'logical':
        axes.add(`logical:${rec.op}`)
        break
      case 'binary':
        axes.add(`binary:${rec.op}`)
        break
      case 'unary':
        axes.add(`unary:${rec.op}`)
        break
      case 'literal':
        axes.add(`literal:${rec.literalType}`)
        break
      case 'array-method':
        axes.add(`array-method:${rec.method}`)
        break
      case 'member':
        if (rec.optional === true) axes.add('member:optional')
        if (rec.computed === true) axes.add('member:computed')
        break
      case 'call': {
        // Lowering nodes are never stored in the IR — adapters recognise
        // calls at emit time — so recognition re-runs here through the
        // same bound matchers to compute the `lowering:<name>` numerator.
        const callee = rec.callee as ParsedExpr | undefined
        const args = rec.args as ParsedExpr[] | undefined
        if (callee && Array.isArray(args)) {
          for (const m of matchers) {
            if (m.match(callee, args)) axes.add(`lowering:${m.name}`)
          }
        }
        break
      }
    }
  }
  if (rec.sortComparator && typeof rec.sortComparator === 'object') {
    collectSortAxes(rec.sortComparator as Record<string, unknown>, axes)
  }
  for (const value of Object.values(rec)) collectKindsAndAxes(value, kinds, axes, matchers)
}

/**
 * Contexts are collected from the IR hooks a parsed tree hangs off:
 * `parsed` on expression nodes and attr values (expression AND spread
 * attrs), `parsedCondition` on conditional/if nodes, `arrayParsed` on
 * loops. Anything reached through an element's `attrs` — including IR
 * trees nested inside a `jsx-children` attr value — records as
 * 'attribute'; a context is only recorded when the hook actually
 * carries a tree.
 */
function collectContexts(node: unknown, contexts: Set<string>, inAttr = false): void {
  if (!node || typeof node !== 'object') return
  if (Array.isArray(node)) {
    for (const item of node) collectContexts(item, contexts, inAttr)
    return
  }
  const rec = node as Record<string, unknown>
  if (rec.type === 'expression' && rec.parsed) contexts.add(inAttr ? 'attribute' : 'text')
  if (rec.parsedCondition) contexts.add('condition')
  if (rec.arrayParsed) contexts.add('loop')
  if (Array.isArray(rec.attrs)) {
    for (const attr of rec.attrs as Array<Record<string, unknown>>) {
      const value = attr?.value as Record<string, unknown> | undefined
      if (!value || typeof value !== 'object') continue
      if ((value.kind === 'expression' || value.kind === 'spread') && value.parsed) {
        contexts.add('attribute')
      }
      collectContexts(value, contexts, true)
    }
  }
  for (const [key, value] of Object.entries(rec)) {
    if (key === 'attrs') continue
    collectContexts(value, contexts, inAttr)
  }
}

export function computeFixtureCoverage(fixture: JSXFixture): FixtureCoverage {
  const kinds = new Set<string>()
  const axes = new Set<string>()
  const contexts = new Set<string>()
  // A fixture's coverage is the UNION over its parent source and every
  // sibling `components` file — 32 fixtures put the expression they exist
  // to exercise in a child (`record-index-lookup-via-child-prop`'s Record
  // lookup lives entirely in the child component), so a parent-only walk
  // reports them empty.
  const sources: Array<[string, string]> = [
    ['component.tsx', fixture.source],
    ...Object.entries(fixture.components ?? {}),
  ]
  for (const [filename, source] of sources) {
    const result = compileJSX(source, filename, {
      adapter: new HonoAdapter(),
      outputIR: true,
      siblingTemplatesRegistered: Boolean(fixture.components),
    })
    for (const file of result.files) {
      if (file.type !== 'ir') continue
      const ir = JSON.parse(file.content)
      collectKindsAndAxes(ir, kinds, axes, prepareBuiltinMatchers(ir.metadata as IRMetadata))
      collectContexts(ir.root, contexts)
    }
  }
  return {
    kinds: [...kinds].sort(),
    axes: [...axes].sort(),
    contexts: [...contexts].sort(),
  }
}

export function computeCoverageMap(): CoverageMap {
  const fixtures: Record<string, FixtureCoverage> = {}
  const kindCounts: Record<string, number> = {}
  const axisCounts: Record<string, number> = {}
  // Code-unit sort everywhere (never localeCompare): the artifact is
  // byte-committed and the freshness test compares key order, so
  // ICU-collation differences across machines would fail it spuriously
  // and reorder thousands of committed lines on regen.
  for (const fixture of [...jsxFixtures].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))) {
    const coverage = computeFixtureCoverage(fixture)
    fixtures[fixture.id] = coverage
    for (const kind of coverage.kinds) kindCounts[kind] = (kindCounts[kind] ?? 0) + 1
    for (const axis of coverage.axes) axisCounts[axis] = (axisCounts[axis] ?? 0) + 1
  }
  const sortRecord = (rec: Record<string, number>) =>
    Object.fromEntries(Object.entries(rec).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)))
  return {
    fixtures,
    kindCounts: sortRecord(kindCounts),
    axisCounts: sortRecord(axisCounts),
    uncoveredKinds: PARSED_EXPR_KINDS.filter(k => !kindCounts[k]).sort(),
  }
}
