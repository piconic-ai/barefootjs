/**
 * Marker Conformance (#1250 phase 3)
 *
 * For every shared JSX fixture, an adapter lowers the same IR into its
 * target language. The marker ids embedded in that lowering (slot,
 * conditional, loop) are part of the hydration contract: the client
 * runtime navigates by them, so an adapter that drops or renames them
 * silently breaks hydration. Per-adapter HTML conformance can't catch
 * the case where the rendered HTML looks fine but the marker set is
 * missing entries that the IR (and thus the client JS) expects.
 *
 * This suite asserts equivalence between two derivations of the same
 * marker set:
 *
 *   1. IR-side: walk the `ComponentIR` and collect every slot id /
 *      conditional id / loop marker id the IR layer assigned. This is
 *      adapter-independent ground truth — the analyzer computed it
 *      without ever consulting an adapter.
 *
 *   2. Adapter-side: lower the same IR through the adapter under test
 *      and extract the same id classes from the emitted template. The
 *      `bf="X"` / `bf-c="X"` / `loop:X` substrings are constants of the
 *      hydration contract; the wrapping syntax (attribute vs comment,
 *      JSX vs Go-template vs Mojo) is adapter-specific and ignored.
 *
 * Equivalent ⇒ the adapter faithfully translated every marker the IR
 * (and the client JS for the same source) expects to find at hydration
 * time.
 *
 * Design (Open/Closed):
 *
 *   - This module knows no adapter names. Each adapter package wires
 *     this suite up via `runAdapterConformanceTests`, providing its own
 *     factory and (optionally) a skip set for fixtures whose drift it
 *     is consciously tracking. Adding a new adapter is a one-package
 *     edit; no shared-layer file needs to change.
 */

import { describe, test, expect } from 'bun:test'
import {
  analyzeComponent,
  jsxToIR,
  buildMetadata,
  type ComponentIR,
  type IRNode,
  type IRElement,
  type IRConditional,
  type IRLoop,
  type IRComponent,
  type IRFragment,
  type IRIfStatement,
  type IRProvider,
  type IRAsync,
  type IRExpression,
  type TemplateAdapter,
} from '@barefootjs/jsx'
import { jsxFixtures } from '../fixtures'

export interface MarkerIdSets {
  slots: Set<string>
  conds: Set<string>
  loops: Set<string>
  /**
   * Loop END markers (`/loop:<id>`), collected separately from the start
   * markers so the suite can assert the boundary PAIR: the client runtime's
   * mapArray() needs both markers to bracket its insertion range, so a
   * start marker without its end (or vice versa) is a hydration break even
   * though the id "appears" in the template. clientOnly loops emit the
   * pair with no items between (#2066); the IR side has a single loop-id
   * set, which both template-side sets must match.
   */
  loopEnds: Set<string>
}

function emptySets(): MarkerIdSets {
  return { slots: new Set(), conds: new Set(), loops: new Set(), loopEnds: new Set() }
}

/**
 * Walk an IR subtree, calling `visit` on every node that is expected
 * to surface in the SSR template.
 *
 * `clientOnly` branches (loops, conditionals) hydrate from the client
 * runtime — their children never reach the SSR template. Walking into
 * them would inflate the IR-side marker set with ids the adapter
 * intentionally omits, producing false-positive drift.
 */
function walkIRNode(node: IRNode, visit: (n: IRNode) => void): void {
  visit(node)
  switch (node.type) {
    case 'element':
      for (const c of (node as IRElement).children) walkIRNode(c, visit)
      break
    case 'conditional': {
      const cond = node as IRConditional
      if (cond.clientOnly) break
      walkIRNode(cond.whenTrue, visit)
      walkIRNode(cond.whenFalse, visit)
      break
    }
    case 'loop': {
      const loop = node as IRLoop
      if (loop.clientOnly) break
      for (const c of loop.children) walkIRNode(c, visit)
      break
    }
    case 'component':
      for (const c of (node as IRComponent).children) walkIRNode(c, visit)
      break
    case 'fragment':
      for (const c of (node as IRFragment).children) walkIRNode(c, visit)
      break
    case 'if-statement': {
      const stmt = node as IRIfStatement
      walkIRNode(stmt.consequent, visit)
      if (stmt.alternate) walkIRNode(stmt.alternate, visit)
      break
    }
    case 'provider':
      for (const c of (node as IRProvider).children) walkIRNode(c, visit)
      break
    case 'async': {
      const a = node as IRAsync
      walkIRNode(a.fallback, visit)
      for (const c of a.children) walkIRNode(c, visit)
      break
    }
    // text, expression, slot are leaves
  }
}

/**
 * Collect marker ids the IR layer assigned, independent of any adapter.
 *
 *   - slots: `slotId` on `IRElement` (surfaces in the template as
 *     `bf="<id>"`) or `IRExpression` (surfaces as a text-marker call
 *     like `bfText("<id>")`). One IR-level namespace covers both.
 *   - conds: `IRConditional.slotId` is the conditional id (`cN`).
 *   - loops: `IRLoop.markerId` (`lN`) — disambiguates sibling `.map()`
 *     call sites under the same parent (#1087).
 *
 * Intentionally excluded:
 *
 *   - `IRComponent.slotId` is a child-scope identifier used to compute
 *     bf-h / bf-m (slot identity) for `upsertChild` lookups (#1249) —
 *     it carries a different hydration semantic than the `bf="<id>"`
 *     slot, and adapters emit it through a different attribute path.
 *     A future suite can verify it separately when adapters agree on
 *     its shape.
 *   - The dynamic scope id (`bf-s={__scopeId}`) is generated at
 *     render time, not at compile time; there is no IR-level id to
 *     compare against.
 */
export function extractIRMarkerIds(ir: ComponentIR): MarkerIdSets {
  const out = emptySets()
  walkIRNode(ir.root, (n) => {
    if (n.type === 'conditional') {
      const id = (n as IRConditional).slotId
      if (id) out.conds.add(id)
      return
    }
    if (n.type === 'loop') {
      const id = (n as IRLoop).markerId
      if (id) out.loops.add(id)
      return
    }
    if (n.type === 'expression') {
      const id = (n as IRExpression).slotId
      if (id) out.slots.add(id)
      return
    }
    if (n.type === 'element') {
      const el = n as IRElement
      if (el.slotId) out.slots.add(el.slotId)
      return
    }
  })
  return out
}

/**
 * Extract marker ids from a target-language template string.
 *
 * The marker shapes:
 *
 *   - slot: `bf="<id>"` attribute (intrinsic element / child component
 *     scope handle) OR a text-marker call whose first arg is `<id>`
 *     (`bfText("s2")`, `text_start("s2")`, `bfTextStart "s2"`). Both
 *     encode the same IR slot id; the choice between the two shapes
 *     is the adapter's call.
 *   - cond: `bf-c="<id>"` attribute OR `cond-start:<id>` substring
 *     inside a comment marker.
 *   - loop: `loop:<id>` substring (NOT preceded by `/`, which would
 *     match the end-marker form). The end-marker form (`/loop:<id>`) is
 *     collected into `loopEnds` so the pair contract is asserted, not
 *     just id presence.
 */
export function extractTemplateMarkerIds(template: string): MarkerIdSets {
  const out = emptySets()
  for (const m of template.matchAll(/\bbf="(\^?[\w-]+)"/g)) out.slots.add(m[1])
  for (const m of template.matchAll(/bfText\("(\^?[\w-]+)"\)/g)) out.slots.add(m[1])
  for (const m of template.matchAll(/text_start\("(\^?[\w-]+)"\)/g)) out.slots.add(m[1])
  for (const m of template.matchAll(/bfTextStart\s+"(\^?[\w-]+)"/g)) out.slots.add(m[1])
  for (const m of template.matchAll(/\bbf-c="([\w-]+)"/g)) out.conds.add(m[1])
  for (const m of template.matchAll(/cond-start:([\w-]+)/g)) out.conds.add(m[1])
  for (const m of template.matchAll(/(?:^|[^/])loop:([\w-]+)/g)) out.loops.add(m[1])
  for (const m of template.matchAll(/\/loop:([\w-]+)/g)) out.loopEnds.add(m[1])
  return out
}

function buildIRFromSource(source: string, filePath: string): ComponentIR | null {
  const ctx = analyzeComponent(source, filePath, undefined)
  if (!ctx.jsxReturn) return null
  const root = jsxToIR(ctx)
  if (!root) return null
  return {
    version: '0.1',
    metadata: buildMetadata(ctx),
    root,
    errors: [],
  }
}

export interface RunMarkerConformanceOptions {
  /** Label used in the `describe` heading (matches `runAdapterConformanceTests.name`). */
  name: string
  /** Fresh-instance factory; one adapter per test, no shared state. */
  factory: () => TemplateAdapter
  /**
   * Fixture ids the adapter under test is consciously skipping (drift
   * tracked outside this suite). Each entry should be paired with a
   * comment at the call site naming the missing marker and the issue
   * tracking the fix. Empty / missing means "skip nothing".
   */
  skipFixtures?: ReadonlySet<string>
}

/**
 * Run the marker conformance suite for a single adapter. Each fixture
 * becomes one test; skipped fixtures stay visible in the test report
 * via `test.skip` so spec drift can't hide as a silent omission.
 */
export function runMarkerConformance(opts: RunMarkerConformanceOptions): void {
  describe(`[${opts.name}] marker conformance (#1250 phase 3)`, () => {
    for (const fixture of jsxFixtures) {
      const skipped = opts.skipFixtures?.has(fixture.id) ?? false
      const t = skipped ? test.skip : test
      t(`${fixture.id}: template marker ids match IR`, () => {
        const ir = buildIRFromSource(fixture.source, `${fixture.id}.tsx`)
        if (!ir) {
          // Fixture can't be lowered at all (e.g. analyzer-error case
          // owned by a different suite). Marker conformance is
          // undefined for such inputs.
          return
        }
        const expected = extractIRMarkerIds(ir)
        let output: { template: string } | null = null
        try {
          // `siblingTemplatesRegistered: true` suppresses the BF103
          // cross-template diagnostic so fixtures with sibling-imported
          // child components don't trip the gate before we compare
          // markers. Per-adapter `expectedDiagnostics` already covers
          // the diagnostic contract for these fixtures.
          output = opts.factory().generate(ir, { siblingTemplatesRegistered: true })
        } catch {
          // Adapter intentionally refuses to lower this fixture.
          // That refusal is part of its diagnostic contract; marker
          // conformance can't apply when no template was produced.
          return
        }
        const actual = extractTemplateMarkerIds(output.template)
        expect([...actual.slots].sort()).toEqual([...expected.slots].sort())
        expect([...actual.conds].sort()).toEqual([...expected.conds].sort())
        expect([...actual.loops].sort()).toEqual([...expected.loops].sort())
        // Boundary-pair contract: every loop id must ALSO close with its
        // `/loop:<id>` end marker. The IR carries one loop-id set; the
        // template's start and end sets must both match it (#2066).
        expect([...actual.loopEnds].sort()).toEqual([...expected.loops].sort())
      })
    }
  })
}
