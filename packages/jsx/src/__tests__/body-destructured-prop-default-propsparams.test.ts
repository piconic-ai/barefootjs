/**
 * Pins #2943's fix: a BODY-destructured prop's default (`const { label =
 * 'none' } = props`) is now visible on `ir.metadata.propsParams` itself —
 * the SAME shared `ParamInfo` a parameter-destructured default
 * (`function Foo({ label = 'none' })`) already populated via
 * `extractPropsFromTypeMembers`'s sibling path. Before this fix,
 * `extractPropsFromTypeMembers` built `propsParams` purely from the TYPE
 * annotation, with no notion of a body destructure's own default — every
 * downstream SSR consumer of `ParamInfo.defaultValue`/`.optional` (each
 * template adapter's presence-guard classification, `extractSsrDefaults`'s
 * stash seed) then treated the prop as defaultless, guarding the attribute
 * and omitting it entirely instead of falling back to the default the way
 * Hono's real JS destructuring naturally does.
 *
 * See `analyzer.ts`'s `collectConstant` (the body-destructure branch) and
 * `bindingElementDefaultFields` (the helper it now shares with the
 * parameter-destructured path in `extractProps`).
 */

import { describe, test, expect } from 'bun:test'
import { analyzeComponent } from '../analyzer'
import { buildMetadata } from '../compiler'

function propsParamsFor(source: string) {
  const ctx = analyzeComponent(source, 'test.tsx')
  return buildMetadata(ctx).propsParams
}

describe('body-destructured prop defaults overlay onto propsParams (#2943)', () => {
  test('unrenamed default: the type-member entry gets defaultValue/parsed/optional', () => {
    const propsParams = propsParamsFor(`
      function Foo(props: { label?: string }) {
        const { label = 'none' } = props
        return <div data-label={label} />
      }
    `)
    expect(propsParams).toEqual([
      {
        name: 'label',
        type: { kind: 'primitive', raw: 'string', primitive: 'string' },
        optional: true,
        defaultValue: "'none'",
        parsed: { kind: 'literal', value: 'none', literalType: 'string' },
      },
    ])
  })

  test('renamed default: ADDS a second entry (sourceName-bearing) rather than replacing the original', () => {
    // `label` itself stays a real, separately-classified binding (no
    // default of its own — a bare `props.label` read elsewhere is still
    // correctly guarded/stash-seeded), and `text` carries `sourceName:
    // 'label'` so every `sourceName ?? name` consumer resolves the
    // caller-facing key.
    const propsParams = propsParamsFor(`
      function Foo(props: { label?: string }) {
        const { label: text = 'none' } = props
        return <div data-label={text} />
      }
    `)
    expect(propsParams).toHaveLength(2)
    expect(propsParams.find(p => p.name === 'label')).toEqual({
      name: 'label',
      type: { kind: 'primitive', raw: 'string', primitive: 'string' },
      optional: true,
    })
    expect(propsParams.find(p => p.name === 'text')).toEqual({
      name: 'text',
      type: { kind: 'primitive', raw: 'string', primitive: 'string' },
      optional: true,
      sourceName: 'label',
      defaultValue: "'none'",
      parsed: { kind: 'literal', value: 'none', literalType: 'string' },
    })
  })

  test('untyped `props` param: synthesizes a propsParams entry with `type: unknown` (matching the parameter form\'s own fallback)', () => {
    const propsParams = propsParamsFor(`
      function Foo(props) {
        const { label = 'none' } = props
        return <div data-label={label} />
      }
    `)
    expect(propsParams).toEqual([
      {
        name: 'label',
        type: { kind: 'unknown', raw: 'unknown' },
        optional: true,
        defaultValue: "'none'",
        parsed: { kind: 'literal', value: 'none', literalType: 'string' },
      },
    ])
  })

  test('arrow-function default (#2940): defaultContainsArrow is set and `parsed` is a real structured arrow, not a truncated re-parse', () => {
    const propsParams = propsParamsFor(`
      function Foo(props: { fmt?: (v: number) => string }) {
        const { fmt = (v) => 'v' + v } = props
        return <div>{fmt(1)}</div>
      }
    `)
    expect(propsParams).toHaveLength(1)
    const fmt = propsParams[0]!
    expect(fmt.name).toBe('fmt')
    expect(fmt.optional).toBe(true)
    expect(fmt.defaultValue).toBe("(v) => 'v' + v")
    expect(fmt.defaultContainsArrow).toBe(true)
    expect(fmt.parsed?.kind).toBe('arrow')
  })

  test('renamed, NO default (#2788 shape, unaffected): still just one propsParams entry — no `kids` synthesized', () => {
    // Defaultless renames stay on the pre-existing #2788 path
    // (`resolveBodyDestructuredPropAliases`'s SSR-stash local-name-seeding
    // safety net) — this fix's overlay only fires when `el.initializer`
    // is present, so it must never duplicate that mechanism's work.
    const propsParams = propsParamsFor(`
      function Foo(props: { children?: string }) {
        const { children: kids } = props
        return <span>{kids}</span>
      }
    `)
    expect(propsParams).toEqual([
      {
        name: 'children',
        type: { kind: 'primitive', raw: 'string', primitive: 'string' },
        optional: true,
      },
    ])
  })

  test('a `let` binding still gets the default overlaid — the default is a declaration-time fact, independent of live-rewrite safety', () => {
    // Unlike `resolveBodyPropAliases`'s `requireLiveRewriteSafe` gate
    // (which excludes `let`/mutated locals because turning them into a
    // LIVE `_p.X` read could silently write through to the caller's
    // prop), a static SSR default has no such hazard — it describes what
    // the source looked like at its own declaration line, nothing more.
    const propsParams = propsParamsFor(`
      function Foo(props: { label?: string }) {
        let { label = 'none' } = props
        label = label.toUpperCase()
        return <div data-label={label} />
      }
    `)
    expect(propsParams).toEqual([
      {
        name: 'label',
        type: { kind: 'primitive', raw: 'string', primitive: 'string' },
        optional: true,
        defaultValue: "'none'",
        parsed: { kind: 'literal', value: 'none', literalType: 'string' },
      },
    ])
  })
})
