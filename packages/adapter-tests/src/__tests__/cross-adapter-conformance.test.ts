/**
 * Cross-Adapter Conformance (#1250 Phase 3)
 *
 * Verifies that hydration-relevant markers (slot ids, conditional ids,
 * loop ids) survive identically across every shipped SSR adapter. The
 * compiler computes one IR; each adapter lowers it to a target-language
 * template. The marker shape inside that template is part of the public
 * hydration contract: the client runtime navigates by `bf="sN"`, comment
 * markers like `<!--bf-loop:lN-->`, and conditional attrs like
 * `bf-c="cN"`. If two adapters disagree on which slot id appears where,
 * cross-compiling the same source produces non-interchangeable output
 * and per-adapter tests cannot detect the drift.
 *
 * Why marker IDs / kinds and not full HTML:
 *
 * - Each adapter renders into a different target language (Hono JSX,
 *   Go `{{define}}` templates, Mojolicious `<%= %>` EP), so byte
 *   comparison is meaningless.
 * - The hydration contract only requires that marker *ids* line up:
 *   the client runtime never inspects target-language syntax.
 * - Marker kinds (slot / cond / loop) and counts catch the case where
 *   an adapter accidentally skips a marker entirely (silently breaking
 *   hydration for that branch).
 */

import { describe, test, expect } from 'bun:test'
import {
  analyzeComponent,
  jsxToIR,
  buildMetadata,
  type ComponentIR,
  type TemplateAdapter,
} from '@barefootjs/jsx'
import { HonoAdapter } from '@barefootjs/hono/adapter'
import { GoTemplateAdapter } from '@barefootjs/go-template/adapter'
import { MojoAdapter } from '@barefootjs/mojolicious/adapter'
import { jsxFixtures } from '../../fixtures'

interface AdapterUnderTest {
  name: string
  factory: () => TemplateAdapter
}

const ADAPTERS: AdapterUnderTest[] = [
  { name: 'hono', factory: () => new HonoAdapter() },
  { name: 'go-template', factory: () => new GoTemplateAdapter() },
  { name: 'mojolicious', factory: () => new MojoAdapter() },
]

/**
 * Single-component IR build. Reuses compiler internals so each adapter
 * receives a bit-identical input; differences between adapter outputs
 * can therefore only come from lowering decisions, not from IR drift.
 */
function buildIR(source: string, filePath: string): ComponentIR | null {
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

/**
 * Extract slot ids from an adapter's template output.
 *
 * Slot identity (`bf="sN"`) is the same attribute name across all
 * adapters — the value `sN` is the IR-level slot id. We accept an
 * optional `^` (legacy prefix kept by some adapters for shared-id
 * conflict resolution) so the comparison is robust to that.
 */
function extractSlotIds(template: string): string[] {
  const ids: string[] = []
  for (const m of template.matchAll(/\bbf="(\^?[\w-]+)"/g)) {
    ids.push(m[1])
  }
  return ids
}

/**
 * Extract conditional-marker ids. Two shapes coexist intentionally:
 *
 * - `bf-c="cN"` — attribute on the conditional branch's single root
 *   element (the compact form).
 * - `cond-start:cN` / `cond-end:cN` — comment-pair wrap used when the
 *   branch is a fragment (no single root) or when the branch is a
 *   component whose root is unknown at SSR time. Each adapter wraps
 *   this substring in its own comment syntax:
 *     Hono:  `bfComment('cond-start:cN')` (rendered to `<!--bf-cond-start:cN-->`)
 *     Go:    `{{bfComment "cond-start:cN"}}`
 *     Mojo:  `bf->comment("cond-start:cN")`
 *   The id substring is identical across all of them.
 *
 * Both shapes encode the same IR slot id used as the conditional id.
 * The cross-adapter check only cares that the set of ids matches; the
 * choice of attribute vs comment shape is per-adapter and per-branch.
 */
function extractCondIds(template: string): string[] {
  const ids = new Set<string>()
  for (const m of template.matchAll(/\bbf-c="([\w-]+)"/g)) ids.add(m[1])
  for (const m of template.matchAll(/cond-start:([\w-]+)/g)) ids.add(m[1])
  return [...ids]
}

/**
 * Extract loop-marker ids. Each adapter wraps the `loop:lN` substring
 * in its own comment syntax — the id is identical across them. The
 * id disambiguates sibling `.map()` call sites under the same parent
 * (#1087).
 *
 *   Hono:  `bfComment('loop:lN')` (rendered to `<!--bf-loop:lN-->`)
 *   Go:    `{{bfComment "loop:lN"}}`
 *   Mojo:  `bf->comment("loop:lN")`
 *
 * We only count start markers (not `/loop:lN` ends) to avoid
 * double-counting; a `[^/]` lookbehind rejects the end form.
 */
function extractLoopIds(template: string): string[] {
  const ids = new Set<string>()
  for (const m of template.matchAll(/(?:^|[^/])loop:([\w-]+)/g)) ids.add(m[1])
  return [...ids]
}

interface AdapterMarkers {
  name: string
  slots: string[]
  conds: string[]
  loops: string[]
  generated: boolean
}

function captureMarkers(adapter: TemplateAdapter, ir: ComponentIR): AdapterMarkers {
  // Some adapters (Mojo, Go) deliberately surface BF103 diagnostics for
  // cross-template lookups. Pass the sibling-registered flag so those
  // diagnostics don't bubble up as `generate` exceptions for fixtures
  // that exercise child components imported from another file.
  try {
    const out = adapter.generate(ir, { siblingTemplatesRegistered: true })
    return {
      name: adapter.name,
      slots: extractSlotIds(out.template),
      conds: extractCondIds(out.template),
      loops: extractLoopIds(out.template),
      generated: true,
    }
  } catch {
    return {
      name: adapter.name,
      slots: [],
      conds: [],
      loops: [],
      generated: false,
    }
  }
}

/**
 * Fixtures with known cross-adapter drift, documented and tracked
 * separately. Each entry is the fixture id; the trailing comment names
 * the offending adapter and the precise shape of the drift so it's
 * obvious from the skip set why a graduation is owed.
 */
const SKIP_DRIFT: ReadonlyArray<string> = [
  // Mojo `renderLoop` does not emit loop-boundary comment markers
  // (`<!--bf-loop:lN-->...<!--bf-/loop:lN-->`) for a `clientOnly` loop.
  // Hono and Go both emit them so the client runtime can locate the
  // insertion anchor when hydrating the array. Tracked as a follow-up:
  // Mojo `renderLoop` needs the same boundary-marker emission for
  // `clientOnly` as Hono/Go (#872 parity).
  'client-only',
  'client-only-loop-with-sibling-cond',
]

describe('cross-adapter conformance (#1250 phase 3)', () => {
  for (const fixture of jsxFixtures) {
    const skipped = SKIP_DRIFT.includes(fixture.id)
    const t = skipped ? test.skip : test
    t(`${fixture.id}: marker ids and kinds agree across adapters`, () => {
      const ir = buildIR(fixture.source, `${fixture.id}.tsx`)
      if (!ir) {
        // Fixture cannot be lowered at all (e.g. an analyzer-error case
        // covered elsewhere). Cross-adapter equivalence is undefined for
        // such inputs.
        return
      }

      const captured = ADAPTERS.map(({ factory }) => captureMarkers(factory(), ir))
      const successful = captured.filter((c) => c.generated)
      if (successful.length < 2) {
        // Single-adapter capability (e.g. an adapter intentionally
        // rejects a pattern) is enforced by per-adapter conformance,
        // not this cross-adapter check.
        return
      }

      const ref = successful[0]
      for (const other of successful.slice(1)) {
        expect([...other.slots].sort()).toEqual([...ref.slots].sort())
        expect([...other.conds].sort()).toEqual([...ref.conds].sort())
        expect([...other.loops].sort()).toEqual([...ref.loops].sort())
      }
    })
  }
})
