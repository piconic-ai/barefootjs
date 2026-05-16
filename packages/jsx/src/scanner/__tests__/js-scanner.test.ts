import { describe, test, expect } from 'bun:test'
import {
  replaceInExprContexts,
  findInterpolationEnd,
  findTopLevelTemplateLiterals,
} from '../js-scanner'

// ---------------------------------------------------------------------------
// replaceInExprContexts

describe('replaceInExprContexts', () => {
  test('replaces identifier in plain expression', () => {
    const out = replaceInExprContexts('foo + bar', /\bfoo\b/g, 'X')
    expect(out).toBe('X + bar')
  })

  test('does not replace inside double-quoted string', () => {
    const out = replaceInExprContexts('"foo" + foo', /\bfoo\b/g, 'X')
    expect(out).toBe('"foo" + X')
  })

  test('does not replace inside single-quoted string', () => {
    const out = replaceInExprContexts("'foo' + foo", /\bfoo\b/g, 'X')
    expect(out).toBe("'foo' + X")
  })

  test('does not replace inside line comment', () => {
    const out = replaceInExprContexts('// foo bar\nfoo', /\bfoo\b/g, 'X')
    expect(out).toBe('// foo bar\nX')
  })

  test('does not replace inside block comment', () => {
    const out = replaceInExprContexts('/* foo */ foo', /\bfoo\b/g, 'X')
    expect(out).toBe('/* foo */ X')
  })

  test('comment-internal apostrophe does not start a string (regression for #135)', () => {
    // The apostrophe in "they're" must NOT swallow source up to the next
    // single quote. Hand-rolled utils.ts had this bug before commit 6743ba6d.
    const out = replaceInExprContexts(
      "// they're holding\nfoo + 'foo' + foo",
      /\bfoo\b/g,
      'X',
    )
    expect(out).toBe("// they're holding\nX + 'foo' + X")
  })

  test('does not replace inside regex literal', () => {
    const out = replaceInExprContexts("arr.filter(x => /foo/.test(x))", /\bfoo\b/g, 'X')
    expect(out).toBe("arr.filter(x => /foo/.test(x))")
  })

  test('regex literal containing apostrophe does not start a string', () => {
    const out = replaceInExprContexts(
      "arr.filter(x => /it's/.test(x)) + foo",
      /\bfoo\b/g,
      'X',
    )
    expect(out).toBe("arr.filter(x => /it's/.test(x)) + X")
  })

  test('division is treated as expression context, not regex', () => {
    const out = replaceInExprContexts('foo / 2 / 3', /\bfoo\b/g, 'X')
    expect(out).toBe('X / 2 / 3')
  })

  test('replaces inside template literal ${...} but not in string body', () => {
    const out = replaceInExprContexts('`foo ${foo} bar`', /\bfoo\b/g, 'X')
    expect(out).toBe('`foo ${X} bar`')
  })

  test('nested template literal: replaces in inner expression context only', () => {
    const out = replaceInExprContexts(
      '`outer ${`inner ${foo}`} foo`',
      /\bfoo\b/g,
      'X',
    )
    expect(out).toBe('`outer ${`inner ${X}`} foo`')
  })

  test('object literal inside template ${...} is expression context', () => {
    const out = replaceInExprContexts('`x ${ {a: foo} } y`', /\bfoo\b/g, 'X')
    expect(out).toBe('`x ${ {a: X} } y`')
  })

  test('escaped quote inside string does not terminate string', () => {
    const out = replaceInExprContexts('"a\\"foo" + foo', /\bfoo\b/g, 'X')
    expect(out).toBe('"a\\"foo" + X')
  })

  test('callback replacement receives captures', () => {
    const out = replaceInExprContexts(
      'foo + bar',
      /\b(foo|bar)\b/g,
      (_m, name) => name.toUpperCase(),
    )
    expect(out).toBe('FOO + BAR')
  })

  test('does not replace inside no-substitution template literal', () => {
    const out = replaceInExprContexts('`foo bar` + foo', /\bfoo\b/g, 'X')
    expect(out).toBe('`foo bar` + X')
  })

  test('negative lookahead spans token boundaries (regression: no double-wrap)', () => {
    // The loop-param wrapper uses `\bfoo\b(?!\s*\()` to skip call
    // sites. If the regex runs per-token, the lookahead only sees an
    // empty string after `foo` and the call site `foo(...)` mis-wraps.
    // Consecutive expression-context tokens must be batched.
    const re = /\bfoo\b(?!\s*\()/g
    expect(replaceInExprContexts('foo().bar', re, 'foo()')).toBe('foo().bar')
    expect(replaceInExprContexts('foo.bar', re, 'foo()')).toBe('foo().bar')
    expect(replaceInExprContexts('foo + foo()', re, 'foo()')).toBe('foo() + foo()')
  })

  test('lookahead in template ${...} respects neighbouring tokens', () => {
    const re = /\bfoo\b(?!\s*\()/g
    expect(replaceInExprContexts('`a${foo()}b`', re, 'foo()')).toBe('`a${foo()}b`')
    expect(replaceInExprContexts('`a${foo.x}b`', re, 'foo()')).toBe('`a${foo().x}b`')
  })

  test('mixed call sites and accesses in a single expression', () => {
    // `foo.bar + foo() + foo[0]` — only the property-access and
    // index-access reads should be wrapped; the call site stays.
    const re = /\bfoo\b(?!\s*\()/g
    expect(replaceInExprContexts('foo.bar + foo() + foo[0]', re, 'foo()'))
      .toBe('foo().bar + foo() + foo()[0]')
  })
})

// ---------------------------------------------------------------------------
// findInterpolationEnd

describe('findInterpolationEnd', () => {
  test('returns index of matching close brace for simple expression', () => {
    // `text${a}rest`
    //       ^ start (right after ${)
    //         ^ expected match
    const s = '${a}'
    const r = findInterpolationEnd(s, 2)
    expect(r).toBe(3)
    expect(s[r]).toBe('}')
  })

  test('handles nested object literal braces', () => {
    const s = '${foo({a: 1})}'
    const r = findInterpolationEnd(s, 2)
    expect(s[r]).toBe('}')
    expect(r).toBe(s.length - 1)
  })

  test('handles braces inside string literals', () => {
    const s = '${foo("})}")}'
    const r = findInterpolationEnd(s, 2)
    expect(s[r]).toBe('}')
    expect(r).toBe(s.length - 1)
  })

  test('handles nested template literal correctly', () => {
    const s = '${`inner ${x}`}'
    const r = findInterpolationEnd(s, 2)
    expect(s[r]).toBe('}')
    expect(r).toBe(s.length - 1)
  })

  test('handles braces inside regex literal', () => {
    const s = '${arr.filter(x => /\\}/.test(x))}'
    const r = findInterpolationEnd(s, 2)
    expect(s[r]).toBe('}')
    expect(r).toBe(s.length - 1)
  })

  test('returns -1 for unbalanced input', () => {
    expect(findInterpolationEnd('${foo(', 2)).toBe(-1)
  })

  test('handles braces inside comments', () => {
    const s = '${/* } */ foo}'
    const r = findInterpolationEnd(s, 2)
    expect(s[r]).toBe('}')
    expect(r).toBe(s.length - 1)
  })

  test('returns -1 for unterminated string inside the body', () => {
    // The unterminated `"bar)}` string swallows the closing brace; no
    // valid match exists, so the helper must bail rather than report
    // a synthetic position.
    expect(findInterpolationEnd('${foo("bar)}', 2)).toBe(-1)
  })

  test('returns -1 for unterminated template literal inside the body', () => {
    expect(findInterpolationEnd('${`unterminated ${x}', 2)).toBe(-1)
  })
})

// ---------------------------------------------------------------------------
// findTopLevelTemplateLiterals

describe('findTopLevelTemplateLiterals', () => {
  test('extracts both branches of a ternary with template-literal results', () => {
    const r = findTopLevelTemplateLiterals('cond ? `<a/>` : `<b/>`')
    expect(r).toEqual(['<a/>', '<b/>'])
  })

  test('returns empty array when no template literals are present', () => {
    expect(findTopLevelTemplateLiterals('cond ? "a" : "b"')).toEqual([])
  })

  test('nested template literals stay nested inside the top-level body', () => {
    // ` <a ${`<b/>`} /> ` — the inner `<b/>` is nested inside the
    // outer template's ${}; it is NOT itself top-level.
    const input = '`<a ${`<b/>`} />`'
    const r = findTopLevelTemplateLiterals(input)
    expect(r).toEqual(['<a ${`<b/>`} />'])
  })

  test('ignores backticks inside string literals', () => {
    const r = findTopLevelTemplateLiterals('"a `not template` b"')
    expect(r).toEqual([])
  })

  test('ignores backticks inside line comments', () => {
    const r = findTopLevelTemplateLiterals('// `not template`\n`real`')
    expect(r).toEqual(['real'])
  })

  test('ignores backticks inside block comments', () => {
    const r = findTopLevelTemplateLiterals('/* `not template` */ `real`')
    expect(r).toEqual(['real'])
  })

  test('returns null on unbalanced template literal', () => {
    expect(findTopLevelTemplateLiterals('`unbalanced ${x')).toBeNull()
  })

  test('handles template literals inside parentheses', () => {
    const r = findTopLevelTemplateLiterals('cond ? (`<a/>`) : (`<b/>`)')
    expect(r).toEqual(['<a/>', '<b/>'])
  })

  test('regex with apostrophe inside expression does not confuse the scanner', () => {
    const r = findTopLevelTemplateLiterals("arr.filter(x => /it's/.test(x)) ? `<a/>` : `<b/>`")
    expect(r).toEqual(['<a/>', '<b/>'])
  })
})
