/**
 * The props a DSL adapter passes to a child component (#3479): which entries,
 * spreads and captures `planComponentProps` makes of a component call, and
 * the order `spellComponentProps` spells them in.
 */

import { describe, test, expect } from 'bun:test'
import {
  isEmptyComponentProps,
  planComponentProps,
  propsSpreadParam,
  resolveComponentPropKeys,
  spellComponentProps,
  type ComponentPropEntry,
  type ComponentPropsOptions,
} from '../adapters/component-props'
import type { AttrValue, IRComponent, IRNode, IRProp } from '../types'

const loc = { file: 'x.tsx', start: { line: 1, column: 0 }, end: { line: 1, column: 0 } }
const text = (value: string): IRNode => ({ type: 'text', value, loc }) as IRNode

function prop(name: string, value: AttrValue): IRProp {
  return { name, value, loc } as IRProp
}
const literal = (value: string): AttrValue => ({ kind: 'literal', value })
const expression = (expr: string): AttrValue => ({ kind: 'expression', expr }) as AttrValue
const spread = (expr: string): AttrValue => ({ kind: 'spread', expr }) as AttrValue
const jsx = (...children: IRNode[]): AttrValue => ({ kind: 'jsx-children', children }) as AttrValue

function component(props: IRProp[], extra: Partial<IRComponent> = {}): IRComponent {
  return {
    type: 'component',
    name: 'Tag',
    props,
    propsType: null,
    children: [],
    template: 'tag',
    slotId: 's0',
    loc,
    ...extra,
  } as IRComponent
}

const noProps: ComponentPropsOptions = { propsObjectName: null, propsParams: [] }
const withProps: ComponentPropsOptions = {
  propsObjectName: 'props',
  propsParams: [{ name: 'tone' }, { name: 'size' }],
}

/** The plan, spelled as `key=value` parts and `...spread`. */
function spell(comp: IRComponent, options = noProps): string[] {
  const describe = (entry: ComponentPropEntry): string => {
    switch (entry.kind) {
      case 'value':
        return `${entry.name}=${entry.value.kind === 'literal' ? `'${entry.value.value}'` : (entry.value as { expr: string }).expr}`
      case 'named-slot':
        return `${entry.name}=<slot>`
      case 'props-param':
        return `${entry.name}=$${entry.name}`
      case 'slot-id':
        return `_bf_slot='${entry.slotId}'`
      case 'children':
        return 'children=<children>'
    }
  }
  return spellComponentProps(planComponentProps(comp, options), {
    entry: describe,
    spread: (value) => value.expr,
    presentParam: (name) => `${name}?=$${name}`,
  }).map((segment) => (segment.kind === 'spread' ? `...${segment.expr}` : `{${segment.parts.join(', ')}}`))
}

describe('planComponentProps', () => {
  test('ordinary props, then the slot id', () => {
    expect(spell(component([prop('tone', literal('warm')), prop('size', expression('size()'))]))).toEqual([
      `{tone='warm', size=size(), _bf_slot='s0'}`,
    ])
  })

  test('callback props and ref are client-only; a callback-named literal is kept', () => {
    const comp = component([
      prop('onClick', expression('handle')),
      prop('ref', expression('el')),
      prop('onLabel', literal('on')),
    ])
    expect(spell(comp)).toEqual([`{onLabel='on', _bf_slot='s0'}`])
  })

  test('a loop row root passes no slot id', () => {
    expect(spell(component([prop('tone', literal('warm'))], { loopItemRoot: true }))).toEqual([`{tone='warm'}`])
    expect(spell(component([], { slotId: null }))).toEqual(['{}'])
  })

  test('a spread folds in at its source position', () => {
    const comp = component([prop('tone', literal('a')), prop('', spread('rest')), prop('size', literal('b'))])
    expect(spell(comp)).toEqual([`{tone='a'}`, '...rest', `{size='b', _bf_slot='s0'}`])
  })

  test('{...props} enumerates the props params', () => {
    const comp = component([prop('', spread(' props ')), prop('label', literal('x'))])
    expect(spell(comp, withProps)).toEqual([`{tone=$tone, size=$size, label='x', _bf_slot='s0'}`])
  })

  test('a repeated key keeps its first position and takes the later value', () => {
    const later = component([prop('', spread('props')), prop('tone', literal('explicit'))])
    expect(spell(later, withProps)).toEqual([`{tone='explicit', size=$size, _bf_slot='s0'}`])
  })

  test('{...props} after an explicit prop carries that key only when the caller passed it', () => {
    const earlier = component([prop('tone', literal('first')), prop('', spread('props'))])
    expect(spell(earlier, withProps)).toEqual([`{tone='first'}`, '...tone?=$tone', `{size=$size, _bf_slot='s0'}`])
  })

  test('{...props} after a spread of unknown keys carries every key only when passed', () => {
    const comp = component([prop('', spread('rest')), prop('', spread('props'))], { slotId: null })
    expect(spell(comp, withProps)).toEqual(['{}', '...rest', '...tone?=$tone', '...size?=$size'])
  })

  test('a required param always wins: the caller always passes it', () => {
    const required: ComponentPropsOptions = {
      propsObjectName: 'props',
      propsParams: [{ name: 'tone', optional: false }, { name: 'size', optional: true }],
    }
    const comp = component([prop('tone', literal('first')), prop('size', literal('s')), prop('', spread('props'))])
    expect(spell(comp, required)).toEqual([`{tone=$tone, size='s'}`, '...size?=$size', `{_bf_slot='s0'}`])
  })

  test('an explicit prop after the spread replaces a passed-only key', () => {
    const comp = component([prop('tone', literal('a')), prop('', spread('props')), prop('tone', literal('z'))])
    expect(spell(comp, withProps)).toEqual([`{tone='a'}`, '...tone?=$tone', `{size=$size, tone='z', _bf_slot='s0'}`])
  })

  test('a key repeated across a spread stays twice: the spread may set it in between', () => {
    const comp = component([prop('tone', literal('a')), prop('', spread('rest')), prop('tone', literal('b'))])
    expect(spell(comp)).toEqual([`{tone='a'}`, '...rest', `{tone='b', _bf_slot='s0'}`])
  })

  test('named slots in place, the children last', () => {
    const nested = component([prop('header', jsx(text('H'))), prop('tone', literal('x'))], { children: [text('C')] })
    expect(spell(nested)).toEqual([`{header=<slot>, tone='x', _bf_slot='s0', children=<children>}`])
    // `children={<jsx/>}` is the children entry, not an ordinary prop.
    const attribute = component([prop('children', jsx(text('C'))), prop('tone', literal('x'))])
    expect(spell(attribute)).toEqual([`{tone='x', _bf_slot='s0', children=<children>}`])
  })

  test('the children follow a trailing spread, so the spread cannot override them', () => {
    const comp = component([prop('', spread('rest'))], { children: [text('C')], slotId: null })
    expect(spell(comp)).toEqual(['{}', '...rest', '{children=<children>}'])
  })
})

describe('propsSpreadParam', () => {
  const none = { keys: new Set<string>(), spread: false }
  test('nothing earlier sets the key: an ordinary entry', () => {
    expect(propsSpreadParam({ name: 'tone' }, none)).toBe('entry')
  })
  test('an earlier entry or an earlier spread may set the key: only when passed', () => {
    expect(propsSpreadParam({ name: 'tone' }, { keys: new Set(['tone']), spread: false })).toBe('present')
    expect(propsSpreadParam({ name: 'tone', optional: true }, { keys: new Set(), spread: true })).toBe('present')
  })
  test('a required param is always passed, so it always wins', () => {
    expect(propsSpreadParam({ name: 'tone', optional: false }, { keys: new Set(['tone']), spread: true })).toBe('entry')
  })
})

describe('resolveComponentPropKeys', () => {
  test('per key, in first-set order: the passed param over the latest unconditional entry', () => {
    const comp = component([prop('tone', literal('first')), prop('size', literal('s')), prop('', spread('props'))], {
      slotId: null,
    })
    const resolved = resolveComponentPropKeys(planComponentProps(comp, withProps))!
    expect(resolved.map((r) => [r.key, r.base?.kind, r.presentParams])).toEqual([
      ['tone', 'value', ['tone']],
      ['size', 'value', ['size']],
    ])
  })

  test('a later entry clears the passed-only params before it', () => {
    const comp = component([prop('tone', literal('a')), prop('', spread('props')), prop('tone', literal('z'))], {
      slotId: null,
    })
    const tone = resolveComponentPropKeys(planComponentProps(comp, withProps))!.find((r) => r.key === 'tone')!
    expect(tone.presentParams).toEqual([])
    expect(tone.base).toEqual({ kind: 'value', name: 'tone', value: literal('z') })
  })

  test('a spread of unknown keys cannot be resolved at compile time', () => {
    const comp = component([prop('', spread('rest')), prop('', spread('props'))])
    expect(resolveComponentPropKeys(planComponentProps(comp, withProps))).toBeNull()
  })
})

describe('spellComponentProps', () => {
  test('spells entries in source order and drops an empty part', () => {
    const order: string[] = []
    const comp = component([prop('a', jsx(text('A'))), prop('b', literal('x')), prop('c', jsx(text('C')))], {
      children: [text('D')],
    })
    const segments = spellComponentProps(planComponentProps(comp, noProps), {
      entry: (entry) => {
        order.push(entry.kind === 'slot-id' || entry.kind === 'children' ? entry.kind : entry.name)
        return entry.kind === 'value' ? '' : 'part'
      },
      spread: () => '',
      presentParam: () => '',
    })
    expect(order).toEqual(['a', 'b', 'c', 'slot-id', 'children'])
    expect(segments).toEqual([{ kind: 'entries', parts: ['part', 'part', 'part', 'part'] }])
  })

  test('isEmptyComponentProps: no part in any segment', () => {
    expect(isEmptyComponentProps([{ kind: 'entries', parts: [] }])).toBe(true)
    expect(isEmptyComponentProps([{ kind: 'entries', parts: [] }, { kind: 'spread', expr: 'x' }])).toBe(false)
  })
})
