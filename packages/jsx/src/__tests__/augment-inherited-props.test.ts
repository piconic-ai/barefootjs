import { describe, test, expect } from 'bun:test'

import { augmentInheritedPropAccesses } from '../augment-inherited-props'
import type { ComponentIR, IRMetadata, ParamInfo } from '../index'

/**
 * Build a minimal `ComponentIR` exercising the SolidJS props-object pattern.
 * Only the fields `augmentInheritedPropAccesses` reads are populated; the rest
 * are cast through `as` so the test stays focused on the scanned inputs.
 */
function makeIR(opts: {
  propsObjectName: string | null
  propsParams: ParamInfo[]
  memos?: Array<{ computation: string }>
  effects?: Array<{ body: string }>
  initStatements?: Array<{ body: string }>
  root?: unknown
}): ComponentIR {
  const metadata = {
    componentName: 'Checkbox',
    propsObjectName: opts.propsObjectName,
    propsParams: opts.propsParams,
    memos: opts.memos ?? [],
    signals: [],
    effects: opts.effects ?? [],
    initStatements: opts.initStatements ?? [],
  } as unknown as IRMetadata

  return {
    root: (opts.root ?? { type: 'element', tag: 'div', attrs: [], children: [] }) as never,
    metadata,
    errors: [],
  } as unknown as ComponentIR
}

describe('augmentInheritedPropAccesses', () => {
  test('adds inherited accessed props from memos, effects, and template attrs', () => {
    const ir = makeIR({
      propsObjectName: 'props',
      propsParams: [{ name: 'checked', type: { kind: 'primitive', raw: 'boolean', primitive: 'boolean' }, optional: false }],
      // className read in a classes memo → string
      memos: [{ computation: '`base ${props.className}`' }],
      // size read only in an effect → string (default classification)
      effects: [{ body: 'console.log(props.size)' }],
      root: {
        type: 'element',
        tag: 'button',
        attrs: [
          // bare-reference attribute → nillable (unknown)
          { name: 'id', value: { kind: 'expression', expr: 'props.id' } },
          // boolean attribute → boolean
          { name: 'disabled', value: { kind: 'expression', expr: 'props.disabled ?? false' } },
        ],
        children: [],
      },
    })

    augmentInheritedPropAccesses(ir)

    const byName = new Map(ir.metadata.propsParams.map(p => [p.name, p]))
    // Pre-existing param untouched.
    expect(byName.get('checked')?.type.kind).toBe('primitive')

    // className → string (memo / string context)
    expect(byName.get('className')?.type).toMatchObject({ kind: 'primitive', primitive: 'string' })
    // size → string, accessed ONLY in an effect (the intentional Mojo-unification path)
    expect(byName.get('size')?.type).toMatchObject({ kind: 'primitive', primitive: 'string' })
    // id → unknown (bare-reference, nillable/omittable)
    expect(byName.get('id')?.type).toMatchObject({ kind: 'unknown' })
    // disabled → boolean (boolean HTML attribute, even with `?? false`)
    expect(byName.get('disabled')?.type).toMatchObject({ kind: 'primitive', primitive: 'boolean' })

    // Synthetic params are marked optional.
    for (const name of ['className', 'size', 'id', 'disabled']) {
      expect(byName.get(name)?.optional).toBe(true)
    }
  })

  test('sees text-expression, condition, loop-array, and component-prop reads (#2126)', () => {
    // These carriers all lower `props.X` to a bare template scalar, so a
    // missed read means the emitted template references a var the props
    // type / ssrDefaults never declared — a strict-mode 500 on the
    // Perl-family adapters, a missing struct field on Go.
    const ir = makeIR({
      propsObjectName: 'props',
      propsParams: [],
      root: {
        type: 'element',
        tag: 'div',
        attrs: [],
        children: [
          // dynamic text child → string (default classification)
          { type: 'expression', expr: 'props.label' },
          // conditional condition → nillable (truth-tested only)
          {
            type: 'conditional',
            condition: 'props.show',
            whenTrue: { type: 'element', tag: 'span', attrs: [], children: [] },
            whenFalse: { type: 'text', value: '' },
          },
          // loop array → nillable (iterated only)
          {
            type: 'loop',
            array: '(props.items ?? [])',
            param: 'it',
            children: [{ type: 'expression', expr: 'it' }],
          },
          // component prop value → same AttrValue scan as element attrs
          {
            type: 'component',
            name: 'Child',
            props: [{ name: 'value', value: { kind: 'expression', expr: 'props.childValue ?? 1' } }],
            children: [],
          },
        ],
      },
    })

    augmentInheritedPropAccesses(ir)

    const byName = new Map(ir.metadata.propsParams.map(p => [p.name, p]))
    expect(byName.get('label')?.type).toMatchObject({ kind: 'primitive', primitive: 'string' })
    expect(byName.get('show')?.type).toMatchObject({ kind: 'unknown' })
    expect(byName.get('items')?.type).toMatchObject({ kind: 'unknown' })
    expect(byName.get('childValue')).toBeDefined()
    for (const name of ['label', 'show', 'items', 'childValue']) {
      expect(byName.get(name)?.optional).toBe(true)
    }
  })

  test('is idempotent — re-running adds nothing', () => {
    const ir = makeIR({
      propsObjectName: 'props',
      propsParams: [],
      memos: [{ computation: 'props.className' }],
    })
    augmentInheritedPropAccesses(ir)
    const afterFirst = ir.metadata.propsParams.length
    augmentInheritedPropAccesses(ir)
    expect(ir.metadata.propsParams.length).toBe(afterFirst)
    expect(afterFirst).toBe(1)
  })

  test('no-op when there is no props-object pattern', () => {
    const ir = makeIR({ propsObjectName: null, propsParams: [], memos: [{ computation: 'props.className' }] })
    augmentInheritedPropAccesses(ir)
    expect(ir.metadata.propsParams.length).toBe(0)
  })
})
