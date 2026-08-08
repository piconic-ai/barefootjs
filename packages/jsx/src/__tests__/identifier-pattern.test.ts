/**
 * #2592 — `$`-containing identifiers broke the compiler's
 * `new RegExp(`\\b${name}\\b`)` "does this expression reference identifier
 * X?" heuristic in two ways: an unescaped `$` acts as a regex end anchor
 * (false negative anywhere but the very end of the pattern), and even once
 * escaped, `\b` treats `$` as a non-word character, so it fails to find a
 * boundary between e.g. `(` and a leading `$` (both non-word — no
 * transition). See `../identifier-pattern.ts` for the fix.
 */
import { describe, test, expect } from 'bun:test'
import { identifierPattern, identifierCallPattern } from '../identifier-pattern.ts'
import { compileJSX } from '../compiler.ts'
import { TestAdapter } from '../adapters/test-adapter.ts'

describe('identifierPattern (#2592)', () => {
  describe.each(['$item', 'item$', 'a$b', 'item'])('name = %p', (name) => {
    test('matches a standalone parenthesized reference', () => {
      expect(identifierPattern(name).test(`(${name})`)).toBe(true)
    })

    test('matches a reference after a binary operator', () => {
      expect(identifierPattern(name).test(`x + ${name}`)).toBe(true)
    })

    test('matches as the base of a member-access expression', () => {
      expect(identifierPattern(name).test(`${name}.foo`)).toBe(true)
    })

    test('does not match when it is a substring of a longer identifier (suffix)', () => {
      expect(identifierPattern(name).test(`my${name}`)).toBe(false)
    })

    test('does not match when it is a substring of a longer identifier (prefix)', () => {
      expect(identifierPattern(name).test(`${name}s`)).toBe(false)
    })

    test('does not match when it appears as a substring inside another identifier', () => {
      // e.g. name="item" inside "xitem" / name="$item" inside "x$item"
      expect(identifierPattern(name).test(`x${name}`)).toBe(false)
    })
  })

  // Literal spellings from the issue, so the fixture reads without having
  // to mentally substitute the parameterised %p name above.
  test('$item: matches ($item), x + $item, $item.foo', () => {
    const re = identifierPattern('$item')
    expect(re.test('($item)')).toBe(true)
    expect(re.test('x + $item')).toBe(true)
    expect(re.test('$item.foo')).toBe(true)
  })

  test('$item: does not match my$item, $items, item$s, aitem, xitem', () => {
    const re = identifierPattern('$item')
    expect(re.test('my$item')).toBe(false)
    expect(re.test('$items')).toBe(false)
    expect(re.test('item$s')).toBe(false)
    expect(re.test('aitem')).toBe(false)
    expect(re.test('xitem')).toBe(false)
  })

  test('item (plain, no $) still matches only standalone references', () => {
    const re = identifierPattern('item')
    expect(re.test('(item)')).toBe(true)
    expect(re.test('x + item')).toBe(true)
    expect(re.test('item.foo')).toBe(true)
    expect(re.test('my$item')).toBe(false)
    expect(re.test('$items')).toBe(false)
    expect(re.test('item$s')).toBe(false)
    expect(re.test('aitem')).toBe(false)
    expect(re.test('xitem')).toBe(false)
  })

  test('the `g` flag supports substitution scanning across multiple matches', () => {
    const re = identifierPattern('$x', 'g')
    expect('$x + $x'.replace(re, () => 'Y')).toBe('Y + Y')
  })

  test('regex-metacharacter identifiers are escaped, not interpreted', () => {
    // Not a realistic JS identifier, but guards the escape step directly:
    // an unescaped '.' would match any character.
    const re = identifierPattern('a.b')
    expect(re.test('a.b')).toBe(true)
    expect(re.test('axb')).toBe(false)
  })
})

describe('identifierCallPattern (#2592)', () => {
  test('matches call syntax for a $-prefixed getter, with or without whitespace', () => {
    expect(identifierCallPattern('$count').test('$count()')).toBe(true)
    expect(identifierCallPattern('$count').test('$count ()')).toBe(true)
    expect(identifierCallPattern('$count').test('1 + $count()')).toBe(true)
  })

  test('does not match a bare (non-call) reference', () => {
    expect(identifierCallPattern('$count').test('$count')).toBe(false)
  })

  test('does not match when the name is a substring of a longer call', () => {
    expect(identifierCallPattern('$count').test('my$count()')).toBe(false)
    expect(identifierCallPattern('$count').test('$counter()')).toBe(false)
  })

  test('plain (non-$) getter names keep matching call syntax as before', () => {
    expect(identifierCallPattern('count').test('count()')).toBe(true)
    expect(identifierCallPattern('count').test('acount()')).toBe(false)
    expect(identifierCallPattern('count').test('counter()')).toBe(false)
  })
})

// -----------------------------------------------------------------------------
// End-to-end: a `.map()` callback whose param is `$item` must classify
// identically to one named `item` — same slotId allocation, same
// `$item() ` accessor-wrapping in the emitted client JS. Before the fix,
// `referencesLoopParam` / `wrapLoopParamAsAccessor`'s `\b$item\b` pattern
// never matched, so the loop body silently lost slotId/reactive
// classification for the `$item`-named param (wrong-but-silent: `bun test`
// still passed because nothing asserted the accessor wrap for a `$`-param
// until now). Verified red-without/green-with: reverting `identifier-
// pattern.ts` to a plain `` new RegExp(`\\b${name}\\b`) ``-style
// implementation fails this describe block while leaving the plain-`item`
// sibling test green — see PR description for the local repro.
// -----------------------------------------------------------------------------
describe('$-prefixed loop param compiles identically to a plain-named one (#2592)', () => {
  const adapter = new TestAdapter()

  function compileMapBody(param: string): string {
    const source = `
      'use client'
      import { createSignal } from '@barefootjs/client'
      type Row = { id: number; label: string }
      export function List() {
        const [rows] = createSignal<Row[]>([])
        return (
          <ul>
            {rows().map((${param}) => (
              <Card key={${param}.id}>
                <CardHeader>{${param}.label}</CardHeader>
              </Card>
            ))}
          </ul>
        )
      }
    `
    const result = compileJSX(source, 'List.tsx', { adapter })
    const errors = result.errors.filter(e => e.severity === 'error')
    if (errors.length > 0) throw new Error(errors.map(e => e.message).join('\n'))
    return result.files.find(f => f.type === 'clientJs')!.content
  }

  test('a plain `item` param is wrapped as an accessor in the child component prop', () => {
    const js = compileMapBody('item')
    expect(js).toContain('item().label')
  })

  test('a `$item` param is wrapped as an accessor identically (was previously left bare)', () => {
    const js = compileMapBody('$item')
    expect(js).toContain('$item().label')
    expect(js).toContain('$item().id')
  })
})

describe('flags handling', () => {
  test("passing flags that already include 'u' does not throw (no duplicate flag)", () => {
    const p = identifierPattern('item', 'gu')
    expect(p.flags).toBe('gu')
    const c = identifierCallPattern('item', 'u')
    expect(c.flags).toBe('u')
    expect('a item b item'.replace(identifierPattern('item', 'gu'), 'x')).toBe('a x b x')
  })
})
