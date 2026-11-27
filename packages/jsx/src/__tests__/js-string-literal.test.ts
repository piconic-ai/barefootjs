/**
 * Every JS string literal the compiler emits is spelled by one helper,
 * `codeSafeStringLiteral` (`../js-string-literal.ts`, #3726). It escapes
 * `<`, `>`, U+2028 and U+2029 as `\uXXXX` and leaves everything else as
 * `JSON.stringify` prints it, so the emitted literal evaluates to the
 * original value and cannot close an inline `<script>`.
 */

import { describe, test, expect } from 'bun:test'
import ts from 'typescript'
import { compileJSX } from '../compiler'
import { TestAdapter } from '../adapters/test-adapter'
import { codeSafeStringLiteral, codeSafeStringArray } from '../js-string-literal'
import { quotePropName } from '../ir-to-client-js/utils'

const DANGEROUS = 'a</script>b\u2028c\u2029d<!--e-->'
const UNSAFE_RAW = /[<>\u2028\u2029]/

/** The value a JS literal's source text evaluates to. */
function evaluate(literal: string): unknown {
  return new Function(`return ${literal}`)()
}

describe('codeSafeStringLiteral', () => {
  test('prints a value without unsafe characters exactly as JSON.stringify does', () => {
    for (const value of ['Counter#binding:s0', '/docs/intro', 'w-1/2', 'say "hi"\n', '']) {
      expect(codeSafeStringLiteral(value)).toBe(JSON.stringify(value))
    }
  })

  test('escapes <, > and the line separators, and evaluates to the same string', () => {
    const literal = codeSafeStringLiteral(DANGEROUS)
    expect(literal).not.toMatch(UNSAFE_RAW)
    expect(literal).toContain('\\u003c/script\\u003e')
    expect(literal).toContain('\\u2028')
    expect(literal).toContain('\\u2029')
    expect(evaluate(literal)).toBe(DANGEROUS)
  })

  test('a backslash before an escaped character stays its own character', () => {
    const value = '\\<\\\\>'
    expect(evaluate(codeSafeStringLiteral(value))).toBe(value)
  })

  test('the array spelling evaluates to the same strings', () => {
    const values = [DANGEROUS, 'plain', '/a/b']
    const literal = codeSafeStringArray(values)
    expect(literal).not.toMatch(UNSAFE_RAW)
    expect(evaluate(literal)).toEqual(values)
    expect(codeSafeStringArray(['x', 'y/z'])).toBe(JSON.stringify(['x', 'y/z']))
  })

  test('a quoted prop name goes through the same spelling', () => {
    expect(quotePropName('label')).toBe('label')
    const name = quotePropName(DANGEROUS)
    expect(name).not.toMatch(UNSAFE_RAW)
    expect(evaluate(`({ ${name}: 1 })`)).toEqual({ [DANGEROUS]: 1 })
  })
})

describe('emitted client JS (#3726)', () => {
  // The source holds the raw characters: `JSON.stringify` writes `<`, `>`,
  // U+2028 and U+2029 into the JSX attribute string as they are.
  const source = `
    'use client'
    import { createSignal } from '@barefootjs/client'
    function Child(props: { label: string; 'data-note'?: string }) {
      return <span>{props.label}</span>
    }
    export function Parent() {
      const [n, setN] = createSignal(0)
      return (
        <div onClick={() => setN(n() + 1)}>
          <Child label=${JSON.stringify(DANGEROUS)} data-note=${JSON.stringify(DANGEROUS)} />
          {n()}
        </div>
      )
    }
  `

  const result = compileJSX(source, 'Parent.tsx', { adapter: new TestAdapter() })
  const clientJs = result.files.find(f => f.type === 'clientJs')?.content ?? ''

  test('compiles', () => {
    expect(result.errors).toHaveLength(0)
    expect(clientJs).not.toBe('')
  })

  test('the module source holds none of the unsafe characters', () => {
    expect(clientJs).not.toContain('</script')
    expect(clientJs).not.toMatch(/[\u2028\u2029]/)
  })

  test('a literal prop value and a quoted prop name evaluate back to the original values', () => {
    // Parse the emitted module and read the child-props object it passes
    // to `initChild`: its keys and values, evaluated from their source text.
    const sf = ts.createSourceFile('out.js', clientJs, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS)
    const objects: ts.ObjectLiteralExpression[] = []
    const visit = (node: ts.Node): void => {
      if (ts.isCallExpression(node) && node.expression.getText(sf) === 'initChild') {
        const arg = node.arguments[2]
        if (arg && ts.isObjectLiteralExpression(arg)) objects.push(arg)
      }
      ts.forEachChild(node, visit)
    }
    visit(sf)
    expect(objects).toHaveLength(1)
    const literalText = objects[0].getText(sf)
    expect(literalText).not.toMatch(UNSAFE_RAW)
    const props = evaluate(`(${literalText})`) as Record<string, unknown>
    expect(props).toEqual({ label: DANGEROUS, 'data-note': DANGEROUS })
  })
})
