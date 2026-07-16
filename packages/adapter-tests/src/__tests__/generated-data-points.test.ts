/**
 * Meta-tests for the type-derived adversarial catalogue
 * (`spec/subset-conformance.md` roadmap 3).
 *
 * The committed `generated-data-points.json` is what the data-point
 * conformance suite actually runs; freshness against a recomputation is
 * what keeps a catalogue or fixture change from silently diverging from
 * it (regen: `bun packages/adapter-tests/scripts/generate-data-points.ts`).
 * The unit tests pin the generator's contract: JSON-domain values only,
 * one-prop-at-a-time variation over the primary props, absent points for
 * optionals, and dedup against the primary and declared points.
 */

import { describe, test, expect } from 'bun:test'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createFixture } from '../types'
import { generateDataPointsForFixture, generateAllDataPoints } from '../adversarial-catalog'

const ARTIFACT_PATH = resolve(import.meta.dir, '../../generated-data-points.json')

describe('generated-data-points artifact', () => {
  // Recomputed at registration, not inside the test body — the corpus
  // compile takes ~50s and bun's per-test timeout is 5s (same shape as
  // coverage-map.test.ts).
  const recomputed = generateAllDataPoints()

  test('committed generated-data-points.json is fresh', () => {
    const committed = JSON.parse(readFileSync(ARTIFACT_PATH, 'utf8'))
    const REGEN = 'regen: bun packages/adapter-tests/scripts/generate-data-points.ts'
    const ids = new Set([...Object.keys(committed), ...Object.keys(recomputed)])
    for (const id of ids) {
      if (!Bun.deepEquals(committed[id], recomputed[id])) {
        throw new Error(
          `generated-data-points.json is stale for fixture '${id}':\n` +
            `  committed:  ${JSON.stringify(committed[id])}\n` +
            `  recomputed: ${JSON.stringify(recomputed[id])}\n${REGEN}`,
        )
      }
    }
    expect(committed).toEqual(recomputed)
  })
})

describe('generateDataPointsForFixture', () => {
  const fixture = createFixture({
    id: 'catalog-unit-probe',
    description: 'generator contract probe',
    source: `
export function Probe(props: { label: string; size?: number; on?: boolean }) {
  return <div>{props.label}{props.size ?? 0}{props.on ? 'y' : 'n'}</div>
}
`,
    props: { label: 'Hello', size: 5 },
    expectedHtml: '<div bf-s="test">placeholder</div>',
  })

  const points = generateDataPointsForFixture(fixture)
  const byName = new Map(points.map(p => [p.name, p.props]))

  test('varies one prop at a time over the primary props', () => {
    expect(byName.get('gen:label:empty')).toEqual({ label: '', size: 5 })
    expect(byName.get('gen:size:zero')).toEqual({ label: 'Hello', size: 0 })
  })

  test('optional props get an absent point (key omitted, not undefined)', () => {
    const absent = byName.get('gen:size:absent')
    expect(absent).toEqual({ label: 'Hello' })
    expect(Object.hasOwn(absent as object, 'size')).toBe(false)
  })

  test('boolean and string catalogue values are emitted', () => {
    expect(byName.get('gen:on:true')).toEqual({ label: 'Hello', size: 5, on: true })
    expect(byName.get('gen:label:multibyte')).toEqual({ label: '日本語', size: 5 })
  })

  test('candidates equal to the primary props are deduped', () => {
    // `on` is absent in the primary props, so `gen:on:absent` would
    // reproduce them verbatim.
    expect(byName.has('gen:on:absent')).toBe(false)
  })

  test('fixtures without expectedHtml generate nothing (no gate to run behind)', () => {
    const gateless = createFixture({
      id: 'catalog-unit-gateless',
      description: 'no expectedHtml',
      source: 'export function G({ a }: { a: string }) { return <p>{a}</p> }\n',
      props: { a: 'x' },
    })
    expect(generateDataPointsForFixture(gateless)).toEqual([])
  })

  test('destructured optional props generate the same points as the object style (#2259)', () => {
    const destructured = createFixture({
      id: 'catalog-unit-destructured',
      description: 'destructured optional resolution',
      source: `
export function D({ label, size }: { label: string; size?: number }) {
  return <div>{label}{size ?? 0}</div>
}
`,
      props: { label: 'Hello', size: 5 },
      expectedHtml: '<div bf-s="test">placeholder</div>',
    })
    const byName = new Map(generateDataPointsForFixture(destructured).map(p => [p.name, p.props]))
    expect(byName.get('gen:size:absent')).toEqual({ label: 'Hello' })
    expect(byName.get('gen:size:zero')).toEqual({ label: 'Hello', size: 0 })
    expect(byName.get('gen:label:empty')).toEqual({ label: '', size: 5 })
  })

  test('destructured optional NON-primitives get an absent point despite unknown type (#2259)', () => {
    // Type resolution stays primitive-only, but the optional flag is now
    // collected for every member — `absent` derives from it alone.
    const destructured = createFixture({
      id: 'catalog-unit-destructured-nonprimitive',
      description: 'optional flag without type resolution',
      source: `
type Todo = { id: number }
export function D({ items }: { items?: Todo[] }) {
  return <div>{(items ?? []).length}</div>
}
`,
      props: { items: [{ id: 1 }] },
      expectedHtml: '<div bf-s="test">placeholder</div>',
    })
    const names = generateDataPointsForFixture(destructured).map(p => p.name)
    expect(names).toContain('gen:items:absent')
  })

  test('declared points dedupe generated duplicates by value', () => {
    const declared = createFixture({
      id: 'catalog-unit-declared',
      description: 'declared point collides with catalogue value',
      source: 'export function D({ a }: { a: string }) { return <p>{a}</p> }\n',
      props: { a: 'x' },
      dataPoints: [{ name: 'hand-empty', props: { a: '' } }],
      expectedHtml: '<p bf-s="test">x</p>',
    })
    const names = generateDataPointsForFixture(declared).map(p => p.name)
    expect(names).not.toContain('gen:a:empty')
    expect(names).toContain('gen:a:markup')
  })
})

/**
 * Union- and object-typed synthesis (#2277) — mirrors the Date catalogue's
 * own probe (`data-domain.test.ts`). Both probes use `props: Type` (not
 * destructured): only that path resolves the full `TypeInfo` (`unionTypes`
 * / `properties`) the catalogue reads — `collectMemberTypes`'
 * primitives-only gate degrades a destructured non-primitive member to
 * `unknown` (see `union-catalogued.ts` / `object-catalogued.ts`'s
 * docstrings).
 */
describe('union catalogue synthesis (#2277)', () => {
  const fixture = createFixture({
    id: 'catalog-unit-union',
    description: 'union catalogue probe',
    source: `
function Probe(props: { placement?: 'top' | 'right' | 'bottom' }) {
  return <div>{props.placement}</div>
}
export { Probe }
`,
    props: { placement: 'top' },
    expectedHtml: '<div bf-s="test">placeholder</div>',
  })
  const points = generateDataPointsForFixture(fixture)
  const byName = new Map(points.map(p => [p.name, p.props]))

  test('emits one gen:<param>:union:<member> point per literal member', () => {
    expect(byName.get('gen:placement:union:right')).toEqual({ placement: 'right' })
    expect(byName.get('gen:placement:union:bottom')).toEqual({ placement: 'bottom' })
    // 'top' reproduces the primary props verbatim — deduped, not a bug.
    expect(byName.has('gen:placement:union:top')).toBe(false)
  })

  test('optional union prop also gets the absent point', () => {
    const absent = byName.get('gen:placement:absent')
    expect(absent).toEqual({})
    expect(Object.hasOwn(absent as object, 'placement')).toBe(false)
  })

  test('every generated point is JSON-clean (round-trips unchanged)', () => {
    for (const [, props] of byName) {
      expect(JSON.parse(JSON.stringify(props))).toEqual(props)
    }
  })
})

describe('object catalogue synthesis (#2277)', () => {
  const fixture = createFixture({
    id: 'catalog-unit-object',
    description: 'object catalogue probe',
    source: `
function Probe(props: { cfg: { id: number; label?: string } }) {
  return <div>{props.cfg.id}</div>
}
export { Probe }
`,
    props: { cfg: { id: 5, label: 'hi' } },
    expectedHtml: '<div bf-s="test">placeholder</div>',
  })
  const points = generateDataPointsForFixture(fixture)
  const byName = new Map(points.map(p => [p.name, p.props]))

  test('emits object:minimal — required fields only, optionals omitted', () => {
    const minimal = byName.get('gen:cfg:object:minimal') as { cfg: Record<string, unknown> } | undefined
    expect(minimal).toEqual({ cfg: { id: 0 } })
    expect(Object.hasOwn(minimal!.cfg, 'label')).toBe(false)
  })

  test('emits one object:+<field> point per optional field', () => {
    expect(byName.get('gen:cfg:object:+label')).toEqual({ cfg: { id: 0, label: '' } })
  })

  test('every generated point is JSON-clean (round-trips unchanged)', () => {
    for (const [, props] of byName) {
      expect(JSON.parse(JSON.stringify(props))).toEqual(props)
    }
  })
})
