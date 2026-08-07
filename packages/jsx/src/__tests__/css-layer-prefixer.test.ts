/**
 * CSS Layer Prefixer - Unit Tests
 */

import { describe, test, expect } from 'bun:test'
import {
  prefixClass,
  prefixClassString,
  prefixConstantValue,
  applyCssLayerPrefix,
  extractIdentifiers,
} from '../css-layer-prefixer'
import type { ComponentIR, IRElement, IRMetadata, IRTemplatePart, ConstantInfo, TemplateAttr, LiteralAttr } from '../types'
import { compileJSX } from '../compiler'
import { TestAdapter } from '../adapters/test-adapter'
import { HonoAdapter } from '../../../../packages/adapter-hono/src/adapter/hono-adapter'

describe('prefixClass', () => {
  test('prefixes a simple class', () => {
    expect(prefixClass('bg-primary', 'components')).toBe('layer-components:bg-primary')
  })

  test('prefixes class with UnoCSS variants', () => {
    expect(prefixClass('hover:bg-primary/90', 'components')).toBe('layer-components:hover:bg-primary/90')
    expect(prefixClass('dark:bg-input/30', 'components')).toBe('layer-components:dark:bg-input/30')
    expect(prefixClass('sm:text-left', 'components')).toBe('layer-components:sm:text-left')
    expect(prefixClass('focus-visible:ring-2', 'components')).toBe('layer-components:focus-visible:ring-2')
  })

  test('prefixes class with stacked variants', () => {
    expect(prefixClass('dark:hover:bg-accent', 'components')).toBe('layer-components:dark:hover:bg-accent')
  })

  test('prefixes class with arbitrary values', () => {
    expect(prefixClass('[&_svg]:size-4', 'components')).toBe('layer-components:[&_svg]:size-4')
    expect(prefixClass('dark:[&[data-state=unchecked]]:bg-input/30', 'components'))
      .toBe('layer-components:dark:[&[data-state=unchecked]]:bg-input/30')
  })

  test('prefixes class with opacity modifier', () => {
    expect(prefixClass('bg-primary/90', 'components')).toBe('layer-components:bg-primary/90')
    expect(prefixClass('bg-black/80', 'components')).toBe('layer-components:bg-black/80')
  })

  test('does not prefix already-prefixed classes', () => {
    expect(prefixClass('layer-components:bg-primary', 'components')).toBe('layer-components:bg-primary')
    expect(prefixClass('layer-base:text-sm', 'components')).toBe('layer-base:text-sm')
  })

  test('returns empty string unchanged', () => {
    expect(prefixClass('', 'components')).toBe('')
  })
})

describe('prefixClassString', () => {
  test('prefixes multiple classes', () => {
    expect(prefixClassString('bg-primary text-white', 'components'))
      .toBe('layer-components:bg-primary layer-components:text-white')
  })

  test('handles single class', () => {
    expect(prefixClassString('flex', 'components')).toBe('layer-components:flex')
  })

  test('preserves leading/trailing whitespace', () => {
    expect(prefixClassString(' bg-primary ', 'components')).toBe(' layer-components:bg-primary ')
  })

  test('handles empty string', () => {
    expect(prefixClassString('', 'components')).toBe('')
    expect(prefixClassString('   ', 'components')).toBe('   ')
  })

  test('handles complex multi-class strings', () => {
    const input = 'inline-flex items-center justify-center rounded-md text-sm font-medium hover:bg-primary/90 h-10 px-4 py-2'
    const result = prefixClassString(input, 'components')
    expect(result).toBe(
      'layer-components:inline-flex layer-components:items-center layer-components:justify-center layer-components:rounded-md layer-components:text-sm layer-components:font-medium layer-components:hover:bg-primary/90 layer-components:h-10 layer-components:px-4 layer-components:py-2'
    )
  })
})

describe('prefixConstantValue', () => {
  test('prefixes single-quoted string literal', () => {
    expect(prefixConstantValue("'bg-primary text-white'", 'components'))
      .toBe("'layer-components:bg-primary layer-components:text-white'")
  })

  test('prefixes double-quoted string literal', () => {
    expect(prefixConstantValue('"flex items-center"', 'components'))
      .toBe('"layer-components:flex layer-components:items-center"')
  })

  test('prefixes object literal values (not keys)', () => {
    const input = `{
  default: 'bg-primary text-primary-foreground hover:bg-primary/90',
  destructive: 'bg-destructive text-white hover:bg-destructive/90',
}`
    const result = prefixConstantValue(input, 'components')
    expect(result).toContain("'layer-components:bg-primary layer-components:text-primary-foreground layer-components:hover:bg-primary/90'")
    expect(result).toContain("'layer-components:bg-destructive layer-components:text-white layer-components:hover:bg-destructive/90'")
    // Keys should not be prefixed
    expect(result).toContain('default:')
    expect(result).toContain('destructive:')
  })

  test('prefixes array elements', () => {
    const input = "['bg-primary', 'text-white']"
    const result = prefixConstantValue(input, 'components')
    expect(result).toBe("['layer-components:bg-primary', 'layer-components:text-white']")
  })

  test('returns non-class values unchanged', () => {
    // Function call
    expect(prefixConstantValue('createContext()', 'components')).toBe('createContext()')
    // Number
    expect(prefixConstantValue('42', 'components')).toBe('42')
    // Boolean
    expect(prefixConstantValue('true', 'components')).toBe('true')
    // Variable reference
    expect(prefixConstantValue('someVariable', 'components')).toBe('someVariable')
  })
})

describe('extractIdentifiers', () => {
  test('extracts standalone identifiers', () => {
    const ids = extractIdentifiers('baseClasses')
    expect(ids).toContain('baseClasses')
  })

  test('excludes property access after dot', () => {
    const ids = extractIdentifiers('props.class')
    expect(ids).toContain('props')
    expect(ids).not.toContain('class')
  })

  test('extracts identifiers from template literal', () => {
    const ids = extractIdentifiers('`${baseClasses} ${props.class ?? \'\'}`')
    expect(ids).toContain('baseClasses')
    expect(ids).toContain('props')
    expect(ids).not.toContain('class')
  })

  test('excludes identifiers inside string literals', () => {
    const ids = extractIdentifiers("variantClasses[props.variant ?? 'default']")
    expect(ids).toContain('variantClasses')
    expect(ids).toContain('props')
    expect(ids).not.toContain('default')
    expect(ids).not.toContain('variant')
  })
})

describe('applyCssLayerPrefix', () => {
  function makeIR(overrides: {
    root?: IRElement
    localConstants?: ConstantInfo[]
    propsObjectName?: string | null
    propsParams?: { name: string; type: any; optional: boolean }[]
  }): ComponentIR {
    const metadata: IRMetadata = {
      componentName: 'TestComponent',
      hasDefaultExport: true,
      isExported: true,
      isClientComponent: true,
      typeDefinitions: [],
      propsType: null,
      propsParams: overrides.propsParams ?? [],
      propsObjectName: overrides.propsObjectName ?? 'props',
      restPropsName: null,
      restPropsExpandedKeys: [],
      signals: [],
      memos: [],
      effects: [],
      onMounts: [],
      imports: [],
      templateImports: [],
      localFunctions: [],
      localConstants: overrides.localConstants ?? [],
    }

    return {
      version: '0.1',
      metadata,
      root: overrides.root ?? {
        type: 'element',
        tag: 'div',
        attrs: [],
        events: [],
        ref: null,
        children: [],
        slotId: null,
        needsScope: false,
        loc: { file: 'test.tsx', start: { line: 1, column: 0 }, end: { line: 1, column: 0 } },
      },
      errors: [],
    }
  }

  function makeLoc() {
    return { file: 'test.tsx', start: { line: 1, column: 0 }, end: { line: 1, column: 0 } }
  }

  test('prefixes static className attribute', () => {
    const ir = makeIR({
      root: {
        type: 'element',
        tag: 'div',
        attrs: [
          { name: 'className', value: { kind: 'literal', value: 'bg-primary text-white' }, loc: makeLoc() },
        ],
        events: [],
        ref: null,
        children: [],
        slotId: null,
        needsScope: false,
        loc: makeLoc(),
      },
    })

    applyCssLayerPrefix(ir, 'components')

    const classAttr = ir.root.type === 'element' ? ir.root.attrs[0] : null
    expect((classAttr?.value as LiteralAttr).value).toBe('layer-components:bg-primary layer-components:text-white')
  })

  test('prefixes static class attribute (HTML name)', () => {
    const ir = makeIR({
      root: {
        type: 'element',
        tag: 'div',
        attrs: [
          { name: 'class', value: { kind: 'literal', value: 'flex gap-2' }, loc: makeLoc() },
        ],
        events: [],
        ref: null,
        children: [],
        slotId: null,
        needsScope: false,
        loc: makeLoc(),
      },
    })

    applyCssLayerPrefix(ir, 'components')

    const classAttr = ir.root.type === 'element' ? ir.root.attrs[0] : null
    expect((classAttr?.value as LiteralAttr).value).toBe('layer-components:flex layer-components:gap-2')
  })

  test('prefixes constants referenced from dynamic className', () => {
    const ir = makeIR({
      root: {
        type: 'element',
        tag: 'button',
        attrs: [
          {
            name: 'className',
            value: { kind: 'expression', expr: '`${buttonClasses} ${props.class ?? \'\'}`' },
            loc: makeLoc(),
          },
        ],
        events: [],
        ref: null,
        children: [],
        slotId: null,
        needsScope: false,
        loc: makeLoc(),
      },
      localConstants: [
        { name: 'buttonClasses', value: "'bg-primary hover:bg-primary/90'", type: null, loc: makeLoc() },
        { name: 'unrelatedConst', value: "'not-a-class-const'", type: null, loc: makeLoc() },
      ],
    })

    applyCssLayerPrefix(ir, 'components')

    const buttonClasses = ir.metadata.localConstants.find(c => c.name === 'buttonClasses')
    expect(buttonClasses?.value).toBe("'layer-components:bg-primary layer-components:hover:bg-primary/90'")

    // Unrelated constant should not be prefixed
    const unrelated = ir.metadata.localConstants.find(c => c.name === 'unrelatedConst')
    expect(unrelated?.value).toBe("'not-a-class-const'")
  })

  test('prefixes object literal constants (variant classes)', () => {
    const ir = makeIR({
      root: {
        type: 'element',
        tag: 'button',
        attrs: [
          {
            name: 'className',
            value: { kind: 'expression', expr: "`${baseClasses} ${variantClasses[props.variant ?? 'default']} ${props.class ?? ''}`" },
            loc: makeLoc(),
          },
        ],
        events: [],
        ref: null,
        children: [],
        slotId: null,
        needsScope: false,
        loc: makeLoc(),
      },
      localConstants: [
        { name: 'baseClasses', value: "'h-10 px-4 py-2'", type: null, loc: makeLoc() },
        {
          name: 'variantClasses',
          value: "{\n  default: 'bg-primary hover:bg-primary/90',\n  destructive: 'bg-destructive hover:bg-destructive/90',\n}",
          type: null,
          loc: makeLoc(),
        },
      ],
    })

    applyCssLayerPrefix(ir, 'components')

    const base = ir.metadata.localConstants.find(c => c.name === 'baseClasses')
    expect(base?.value).toBe("'layer-components:h-10 layer-components:px-4 layer-components:py-2'")

    const variants = ir.metadata.localConstants.find(c => c.name === 'variantClasses')
    expect(variants?.value).toContain("'layer-components:bg-primary layer-components:hover:bg-primary/90'")
    expect(variants?.value).toContain("'layer-components:bg-destructive layer-components:hover:bg-destructive/90'")
  })

  test('prefixes `template` AttrValue ternary parts', () => {
    const templateParts: IRTemplatePart[] = [
      { type: 'string', value: 'btn ' },
      { type: 'ternary', condition: 'disabled()', whenTrue: 'btn-disabled opacity-50', whenFalse: 'btn-enabled' },
    ]

    const ir = makeIR({
      root: {
        type: 'element',
        tag: 'button',
        attrs: [
          { name: 'className', value: { kind: 'template', parts: templateParts }, loc: makeLoc() },
        ],
        events: [],
        ref: null,
        children: [],
        slotId: null,
        needsScope: false,
        loc: makeLoc(),
      },
    })

    applyCssLayerPrefix(ir, 'components')

    const attr = (ir.root as IRElement).attrs[0]
    const tl = attr.value as TemplateAttr
    expect(tl.parts[0]).toEqual({ type: 'string', value: 'layer-components:btn ' })
    expect(tl.parts[1]).toEqual({
      type: 'ternary',
      condition: 'disabled()',
      whenTrue: 'layer-components:btn-disabled layer-components:opacity-50',
      whenFalse: 'layer-components:btn-enabled',
    })
  })

  test('does not prefix non-class attributes', () => {
    const ir = makeIR({
      root: {
        type: 'element',
        tag: 'div',
        attrs: [
          { name: 'id', value: { kind: 'literal', value: 'main-content' }, loc: makeLoc() },
          { name: 'data-state', value: { kind: 'literal', value: 'open' }, loc: makeLoc() },
          { name: 'className', value: { kind: 'literal', value: 'flex' }, loc: makeLoc() },
        ],
        events: [],
        ref: null,
        children: [],
        slotId: null,
        needsScope: false,
        loc: makeLoc(),
      },
    })

    applyCssLayerPrefix(ir, 'components')

    const root = ir.root as IRElement
    expect((root.attrs[0].value as LiteralAttr).value).toBe('main-content')
    expect((root.attrs[1].value as LiteralAttr).value).toBe('open')
    expect((root.attrs[2].value as LiteralAttr).value).toBe('layer-components:flex')
  })

  test('handles nested elements', () => {
    const ir = makeIR({
      root: {
        type: 'element',
        tag: 'div',
        attrs: [
          { name: 'className', value: { kind: 'literal', value: 'container' }, loc: makeLoc() },
        ],
        events: [],
        ref: null,
        children: [
          {
            type: 'element',
            tag: 'span',
            attrs: [
              { name: 'className', value: { kind: 'literal', value: 'text-sm' }, loc: makeLoc() },
            ],
            events: [],
            ref: null,
            children: [],
            slotId: null,
            needsScope: false,
            loc: makeLoc(),
          },
        ],
        slotId: null,
        needsScope: false,
        loc: makeLoc(),
      },
    })

    applyCssLayerPrefix(ir, 'components')

    const root = ir.root as IRElement
    expect((root.attrs[0].value as LiteralAttr).value).toBe('layer-components:container')
    const child = root.children[0] as IRElement
    expect((child.attrs[0].value as LiteralAttr).value).toBe('layer-components:text-sm')
  })

  test('resolves transitive constant references', () => {
    const ir = makeIR({
      root: {
        type: 'element',
        tag: 'div',
        attrs: [
          {
            name: 'className',
            value: { kind: 'expression', expr: 'fullClasses' },
            loc: makeLoc(),
          },
        ],
        events: [],
        ref: null,
        children: [],
        slotId: null,
        needsScope: false,
        loc: makeLoc(),
      },
      localConstants: [
        { name: 'baseClasses', value: "'bg-primary'", type: null, loc: makeLoc() },
        { name: 'fullClasses', value: "`${baseClasses} text-white`", type: null, loc: makeLoc() },
      ],
    })

    applyCssLayerPrefix(ir, 'components')

    // fullClasses is directly referenced → should be prefixed (but it's a template literal,
    // which prefixConstantValue doesn't handle, so value stays unchanged)
    // baseClasses is transitively referenced → should be prefixed
    const base = ir.metadata.localConstants.find(c => c.name === 'baseClasses')
    expect(base?.value).toBe("'layer-components:bg-primary'")
  })

  test('multi-component file prefixes a shared const identically in every component IR (#2570)', () => {
    // `sharedClasses` is used in CLASS position only by CompA; CompB reads it
    // in a non-class expression. Per-IR application prefixed only CompA's
    // copy, which — now that module-scope constants are hoisted to ONE
    // module declaration — emitted the constant twice with different values
    // ("tabsClasses has already been declared" in the site/ui build). The
    // file-wide union must leave every IR's copy byte-identical.
    const source = `
      const sharedClasses = 'flex flex-col gap-2'

      export function CompA() {
        return <div className={sharedClasses + ' extra'}>a</div>
      }

      export function CompB() {
        return <div data-cls={sharedClasses}>b</div>
      }
    `
    const result = compileJSX(source, '/virtual/Tabs.tsx', {
      adapter: new TestAdapter(),
      cssLayerPrefix: 'components',
    })
    expect(result.errors.filter(e => e.severity === 'error')).toEqual([])
    const template = result.files.find(f => f.type === 'markedTemplate')!.content

    const declarations = template.match(/^const sharedClasses = .*$/gm) ?? []
    expect(declarations).toHaveLength(1)
    expect(declarations[0]).toContain('layer-components:flex')
  })

  test('prefixes a `Record`-shaped `as const` class map constant\'s typedValue (#2575)', () => {
    // `preserveTypes` emitters (Hono) prefer `typedValue ?? value` when
    // emitting a module-scope constant so `.tsx` output stays type-checked
    // — see `generateModuleScopeDeclarations` in
    // `packages/adapter-hono/src/adapter/hono-adapter.ts`'s base class.
    // `applyCssLayerPrefixToFile` used to rewrite only `value`, leaving
    // `typedValue` — the string Hono actually emits — unprefixed for any
    // constant whose initializer carries type syntax (`as const`, a
    // `satisfies`/`Record<...>` annotation, …). Regression for the fix:
    // both strings must be prefixed together, and the `as const` assertion
    // must survive the round trip verbatim.
    const source = `
      const toneClasses: Record<'info' | 'warn', string> = {
        info: 'text-blue-500',
        warn: 'text-amber-500',
      } as const

      export function Banner() {
        return <div className={toneClasses.info}>hi</div>
      }
    `
    const result = compileJSX(source, '/virtual/Banner.tsx', {
      adapter: new HonoAdapter(),
      cssLayerPrefix: 'components',
    })
    expect(result.errors.filter(e => e.severity === 'error')).toEqual([])
    const template = result.files.find(f => f.type === 'markedTemplate')!.content

    const declarations = template.match(/^const toneClasses = [\s\S]*?\} as const$/m) ?? []
    expect(declarations).toHaveLength(1)
    const declaration = declarations[0]

    // Classes are prefixed...
    expect(declaration).toContain("info: 'layer-components:text-blue-500'")
    expect(declaration).toContain("warn: 'layer-components:text-amber-500'")
    // ...and the `as const` assertion survives the rewrite.
    expect(declaration.trim().endsWith('} as const')).toBe(true)
  })
})
