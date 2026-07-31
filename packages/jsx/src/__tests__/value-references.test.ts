/**
 * Tests for `packages/jsx/src/value-references.ts` — the single-door
 * "is this identifier a VALUE reference" classifier shared by
 * `collectExternalImports` (jsx) and `detectStrippedReferences` (cli).
 *
 * There was no direct test file for this module before this one. It was
 * added as a follow-up to #2432: a Copilot review on the original PR
 * flagged that `ts.PropertyDeclaration` (class field) names were not
 * excluded, so a class field like `helper` in `class C { helper = 1 }`
 * was misclassified as a value reference. Harmless for the jsx-side
 * caller (an extra kept import), but a false BF053 build error for the
 * cli-side caller when the same name is a stripped import binding.
 */

import { describe, test, expect } from 'bun:test'
import { collectValueReferencedNames } from '../value-references'

describe('collectValueReferencedNames', () => {
  test('class field name only is NOT a reference', () => {
    const result = collectValueReferencedNames('class C { helper = 1 }')
    expect(result).not.toBeNull()
    expect(result?.has('helper')).toBe(false)
  })

  test('static class field name only is NOT a reference', () => {
    const result = collectValueReferencedNames('class C { static helper = 1 }')
    expect(result).not.toBeNull()
    expect(result?.has('helper')).toBe(false)
  })

  test('computed class field name IS a reference (does not over-exclude)', () => {
    const result = collectValueReferencedNames('class C { [helper] = 1 }')
    expect(result).not.toBeNull()
    expect(result?.has('helper')).toBe(true)
  })

  test('class method name is NOT a reference', () => {
    const result = collectValueReferencedNames('class C { helper() {} }')
    expect(result).not.toBeNull()
    expect(result?.has('helper')).toBe(false)
  })

  test('object-literal key is NOT a reference', () => {
    const result = collectValueReferencedNames('const o = { helper: 1 };')
    expect(result).not.toBeNull()
    expect(result?.has('helper')).toBe(false)
  })

  test('property access name is NOT a reference', () => {
    const result = collectValueReferencedNames('obj.helper();')
    expect(result).not.toBeNull()
    expect(result?.has('helper')).toBe(false)
  })

  test('shorthand property IS a reference (reads the binding)', () => {
    const result = collectValueReferencedNames('const o = { helper };')
    expect(result).not.toBeNull()
    expect(result?.has('helper')).toBe(true)
  })

  test('a genuine call IS a reference', () => {
    const result = collectValueReferencedNames('helper();')
    expect(result).not.toBeNull()
    expect(result?.has('helper')).toBe(true)
  })

  test('new.target: "target" is NOT a reference', () => {
    const result = collectValueReferencedNames('function f() { return new.target; }')
    expect(result).not.toBeNull()
    expect(result?.has('target')).toBe(false)
  })

  test('unparseable text returns null ("cannot answer")', () => {
    const result = collectValueReferencedNames('const x = ;;; {{{ ]]]')
    expect(result).toBeNull()
  })
})
