import { describe, test, expect } from 'bun:test'
import { classifyDOMProp, toHTMLAttrName, toHTMLAttrNameRuntime, toSpreadAttrName, spreadKeysRenamedTo, spreadKeysInOtherCase, foldAttrName, jsxAttrKey, SPREAD_KEY_ATTR_NAMES, isBooleanAttr, isEventProp, BOOLEAN_ATTRS } from '../dom-prop'

describe('classifyDOMProp', () => {
  test('children → skip', () => {
    expect(classifyDOMProp('children')).toEqual({ kind: 'skip', attrName: 'children' })
  })

  test('ref → ref', () => {
    expect(classifyDOMProp('ref')).toEqual({ kind: 'ref', attrName: 'ref' })
  })

  test('dangerouslySetInnerHTML → innerHTML', () => {
    expect(classifyDOMProp('dangerouslySetInnerHTML')).toEqual({
      kind: 'innerHTML',
      attrName: 'dangerouslySetInnerHTML',
    })
  })

  test('onClick → event', () => {
    const c = classifyDOMProp('onClick')
    expect(c.kind).toBe('event')
  })

  test('onDoubleClick → event', () => {
    expect(classifyDOMProp('onDoubleClick').kind).toBe('event')
  })

  test('on (two chars) → attr, not event', () => {
    expect(classifyDOMProp('on').kind).toBe('attr')
  })

  test('once → attr, not event (third char lowercase)', () => {
    expect(classifyDOMProp('once').kind).toBe('attr')
  })

  test('style → style', () => {
    expect(classifyDOMProp('style')).toEqual({ kind: 'style', attrName: 'style' })
  })

  test('value → property', () => {
    expect(classifyDOMProp('value')).toEqual({ kind: 'property', attrName: 'value' })
  })

  test('checked → property', () => {
    expect(classifyDOMProp('checked')).toEqual({ kind: 'property', attrName: 'checked' })
  })

  test('disabled → boolean', () => {
    const c = classifyDOMProp('disabled')
    expect(c.kind).toBe('boolean')
    expect(c.attrName).toBe('disabled')
  })

  test('hidden → boolean', () => {
    expect(classifyDOMProp('hidden').kind).toBe('boolean')
  })

  test('formnovalidate → boolean', () => {
    expect(classifyDOMProp('formnovalidate').kind).toBe('boolean')
  })

  test('className → attr with attrName "class"', () => {
    expect(classifyDOMProp('className')).toEqual({ kind: 'attr', attrName: 'class' })
  })

  test('htmlFor → attr with attrName "for"', () => {
    expect(classifyDOMProp('htmlFor')).toEqual({ kind: 'attr', attrName: 'for' })
  })

  test('strokeWidth → attr with kebab-case attrName', () => {
    expect(classifyDOMProp('strokeWidth')).toEqual({ kind: 'attr', attrName: 'stroke-width' })
  })

  test('fillOpacity → attr with kebab-case attrName', () => {
    expect(classifyDOMProp('fillOpacity')).toEqual({ kind: 'attr', attrName: 'fill-opacity' })
  })

  test('viewBox → attr with preserved camelCase', () => {
    expect(classifyDOMProp('viewBox')).toEqual({ kind: 'attr', attrName: 'viewBox' })
  })

  test('preserveAspectRatio → attr with preserved camelCase', () => {
    expect(classifyDOMProp('preserveAspectRatio')).toEqual({ kind: 'attr', attrName: 'preserveAspectRatio' })
  })

  test('data-x → attr passthrough', () => {
    expect(classifyDOMProp('data-x')).toEqual({ kind: 'attr', attrName: 'data-x' })
  })

  test('aria-label → attr passthrough', () => {
    expect(classifyDOMProp('aria-label')).toEqual({ kind: 'attr', attrName: 'aria-label' })
  })
})

describe('toHTMLAttrName (compile-time)', () => {
  test('className → class', () => {
    expect(toHTMLAttrName('className')).toBe('class')
  })

  test('htmlFor → for', () => {
    expect(toHTMLAttrName('htmlFor')).toBe('for')
  })

  test('strokeWidth → stroke-width', () => {
    expect(toHTMLAttrName('strokeWidth')).toBe('stroke-width')
  })

  // #2172: HTML camelCase aliases resolve through HTML_CAMEL_ALIASES —
  // these are known HTML attributes with a defined lowercase spelling,
  // NOT the generic kebab conversion (which stays data-*/aria-* only).
  test('tabIndex lowers to tabindex (HTML alias table)', () => {
    expect(toHTMLAttrName('tabIndex')).toBe('tabindex')
  })

  test('autoFocus lowers to autofocus (HTML alias table)', () => {
    expect(toHTMLAttrName('autoFocus')).toBe('autofocus')
  })

  test('readOnly lowers to the BOOLEAN_ATTRS member readonly', () => {
    expect(toHTMLAttrName('readOnly')).toBe('readonly')
  })

  test('spellCheck lowers to the enumerated (non-boolean) spellcheck', () => {
    expect(toHTMLAttrName('spellCheck')).toBe('spellcheck')
  })

  test('unknown camelCase names still pass through unchanged', () => {
    expect(toHTMLAttrName('myCustomAttr')).toBe('myCustomAttr')
  })
})

describe('toHTMLAttrNameRuntime', () => {
  test('className → class', () => {
    expect(toHTMLAttrNameRuntime('className')).toBe('class')
  })

  test('htmlFor → for', () => {
    expect(toHTMLAttrNameRuntime('htmlFor')).toBe('for')
  })

  test('strokeWidth → stroke-width', () => {
    expect(toHTMLAttrNameRuntime('strokeWidth')).toBe('stroke-width')
  })

  test('viewBox stays camelCase (SVG XML attr)', () => {
    expect(toHTMLAttrNameRuntime('viewBox')).toBe('viewBox')
  })

  test('clipPathUnits stays camelCase (SVG XML attr)', () => {
    expect(toHTMLAttrNameRuntime('clipPathUnits')).toBe('clipPathUnits')
  })

  test('data-* camelCase → kebab-case', () => {
    expect(toHTMLAttrNameRuntime('dataTestId')).toBe('data-test-id')
  })

  test('aria-* camelCase → kebab-case', () => {
    expect(toHTMLAttrNameRuntime('ariaLabel')).toBe('aria-label')
  })

  test('tabIndex lowers to tabindex (HTML alias table, #2172)', () => {
    expect(toHTMLAttrNameRuntime('tabIndex')).toBe('tabindex')
  })

  test('autoFocus lowers to autofocus (HTML alias table, #2172)', () => {
    expect(toHTMLAttrNameRuntime('autoFocus')).toBe('autofocus')
  })

  test('readOnly lowers to the boolean attr spelling readonly (HTML alias table, #2172)', () => {
    expect(toHTMLAttrNameRuntime('readOnly')).toBe('readonly')
  })

  test('spellCheck lowers to the enumerated attr spelling spellcheck (HTML alias table, #2172)', () => {
    expect(toHTMLAttrNameRuntime('spellCheck')).toBe('spellcheck')
  })

  test('unknown camelCase names still pass through unchanged', () => {
    expect(toHTMLAttrNameRuntime('myCustomAttr')).toBe('myCustomAttr')
  })
})

describe('isBooleanAttr', () => {
  test('standard booleans', () => {
    for (const attr of ['checked', 'disabled', 'readonly', 'selected', 'required', 'hidden', 'autofocus', 'autoplay', 'controls', 'loop', 'muted', 'open', 'multiple', 'novalidate', 'formnovalidate']) {
      expect(isBooleanAttr(attr)).toBe(true)
    }
  })

  test('non-booleans', () => {
    expect(isBooleanAttr('class')).toBe(false)
    expect(isBooleanAttr('style')).toBe(false)
    expect(isBooleanAttr('value')).toBe(false)
  })

  test('case-insensitive', () => {
    expect(isBooleanAttr('DISABLED')).toBe(true)
    expect(isBooleanAttr('Checked')).toBe(true)
  })
})

describe('isEventProp', () => {
  test('onClick → true', () => {
    expect(isEventProp('onClick')).toBe(true)
  })

  test('onKeyDown → true', () => {
    expect(isEventProp('onKeyDown')).toBe(true)
  })

  test('on → false (too short)', () => {
    expect(isEventProp('on')).toBe(false)
  })

  test('once → false (third char lowercase)', () => {
    expect(isEventProp('once')).toBe(false)
  })

  test('onion → false (third char lowercase)', () => {
    expect(isEventProp('onion')).toBe(false)
  })

  test('on1 → false (digit, not uppercase letter)', () => {
    expect(isEventProp('on1')).toBe(false)
  })

  test('on_foo → false (underscore, not uppercase letter)', () => {
    expect(isEventProp('on_foo')).toBe(false)
  })
})

describe('BOOLEAN_ATTRS', () => {
  test('is a ReadonlySet', () => {
    expect(BOOLEAN_ATTRS).toBeInstanceOf(Set)
  })

  test('contains expected entries', () => {
    expect(BOOLEAN_ATTRS.has('disabled')).toBe(true)
    expect(BOOLEAN_ATTRS.has('formnovalidate')).toBe(true)
  })
})

describe('toSpreadAttrName', () => {
  test('renames the eight keys the reference renames in a spread bag', () => {
    expect(SPREAD_KEY_ATTR_NAMES).toEqual({
      className: 'class',
      htmlFor: 'for',
      crossOrigin: 'crossorigin',
      httpEquiv: 'http-equiv',
      itemProp: 'itemprop',
      fetchPriority: 'fetchpriority',
      noModule: 'nomodule',
      formAction: 'formaction',
    })
    for (const [key, name] of Object.entries(SPREAD_KEY_ATTR_NAMES)) expect(toSpreadAttrName(key)).toBe(name)
  })

  test('writes every other key as it is', () => {
    for (const key of ['class', 'for', 'tabIndex', 'ariaLabel', 'dataTestId', 'strokeWidth', 'viewBox', 'data-x', 'toString', '__proto__']) {
      expect(toSpreadAttrName(key)).toBe(key)
    }
  })
})

describe('spreadKeysRenamedTo', () => {
  const all = new Set(Object.keys(SPREAD_KEY_ATTR_NAMES))
  // [attribute, keys by default (every helper), keys for a helper renaming all eight]
  const matrix: Array<[string, string[], string[]]> = [
    ['class', ['className'], ['className']],
    ['for', ['htmlFor'], ['htmlFor']],
    ['http-equiv', ['httpEquiv'], ['httpEquiv']],
    ['crossorigin', [], ['crossOrigin']],
    ['itemprop', [], ['itemProp']],
    ['fetchpriority', [], ['fetchPriority']],
    ['nomodule', [], ['noModule']],
    ['formaction', [], ['formAction']],
    ['id', [], []],
    ['tabindex', [], []],
    ['htmlFor', [], []],
  ]
  for (const [attr, byDefault, byAll] of matrix) {
    test(`${attr}`, () => {
      expect(spreadKeysRenamedTo(attr)).toEqual(byDefault)
      expect(spreadKeysRenamedTo(attr, all)).toEqual(byAll)
    })
  }
})

describe('spreadKeysInOtherCase', () => {
  // [attribute, the keys that spell it in another letter case]
  const matrix: Array<[string, string[]]> = [
    ['tabindex', ['tabIndex']],
    // A boolean attribute lists none.
    ['readonly', []],
    ['maxlength', ['maxLength']],
    ['viewbox', ['viewBox']],
    // A key the reference renames is `spreadKeysRenamedTo`'s answer.
    ['crossorigin', []],
    ['for', []],
    // Kebab-cased, not another letter case.
    ['accept-charset', []],
    ['stroke-width', []],
    ['id', []],
    // The attribute's own spelling is not listed.
    ['viewBox', []],
  ]
  for (const [attr, keys] of matrix) {
    test(`${attr}`, () => {
      expect(spreadKeysInOtherCase(attr)).toEqual(keys)
    })
  }

  test('every listed key folds to the attribute', () => {
    for (const [attr] of matrix) {
      for (const key of spreadKeysInOtherCase(attr)) expect(foldAttrName(key)).toBe(foldAttrName(attr))
    }
  })
})

describe('jsxAttrKey', () => {
  test('spells class as className and every other attribute as it is', () => {
    expect(jsxAttrKey('class')).toBe('className')
    expect(jsxAttrKey('for')).toBe('for')
    expect(jsxAttrKey('tabindex')).toBe('tabindex')
  })
})

describe('foldAttrName', () => {
  test('folds the ASCII letters only, as the HTML tokenizer does', () => {
    expect(foldAttrName('tabIndex')).toBe('tabindex')
    expect(foldAttrName('VIEWBOX')).toBe('viewbox')
    expect(foldAttrName('Ä')).toBe('Ä')
    expect(foldAttrName('data-Ä')).toBe('data-Ä')
    // U+212A KELVIN SIGN lowercases to `k` in JS, but is not ASCII.
    expect(foldAttrName('\u212A')).toBe('\u212A')
  })
})
