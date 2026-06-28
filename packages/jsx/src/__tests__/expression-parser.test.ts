import { describe, test, expect } from 'bun:test'
import ts from 'typescript'
import { parseExpression, isSupported, exprToString, stringifyParsedExpr, parseBlockBody, extractArrowBodyExpression, parseStyleObjectEntries, parseProviderObjectLiteral } from '../expression-parser'
import { collectAllTypeRanges, reconstructWithoutTypes } from '../strip-types'

describe('expression-parser', () => {
  describe('parseExpression', () => {
    test('parses simple identifier', () => {
      const result = parseExpression('count')
      expect(result.kind).toBe('identifier')
      if (result.kind === 'identifier') {
        expect(result.name).toBe('count')
      }
    })

    test('parses string literal', () => {
      const result = parseExpression("'all'")
      expect(result.kind).toBe('literal')
      if (result.kind === 'literal') {
        expect(result.value).toBe('all')
        expect(result.literalType).toBe('string')
      }
    })

    test('parses number literal', () => {
      const result = parseExpression('42')
      expect(result.kind).toBe('literal')
      if (result.kind === 'literal') {
        expect(result.value).toBe(42)
        expect(result.literalType).toBe('number')
      }
    })

    test('parses boolean literals', () => {
      const trueResult = parseExpression('true')
      expect(trueResult.kind).toBe('literal')
      if (trueResult.kind === 'literal') {
        expect(trueResult.value).toBe(true)
        expect(trueResult.literalType).toBe('boolean')
      }

      const falseResult = parseExpression('false')
      expect(falseResult.kind).toBe('literal')
      if (falseResult.kind === 'literal') {
        expect(falseResult.value).toBe(false)
        expect(falseResult.literalType).toBe('boolean')
      }
    })

    test('parses null', () => {
      const result = parseExpression('null')
      expect(result.kind).toBe('literal')
      if (result.kind === 'literal') {
        expect(result.value).toBe(null)
        expect(result.literalType).toBe('null')
      }
    })

    test('parses function call (signal)', () => {
      const result = parseExpression('count()')
      expect(result.kind).toBe('call')
      if (result.kind === 'call') {
        expect(result.callee.kind).toBe('identifier')
        expect(result.args).toHaveLength(0)
      }
    })

    test('parses member access', () => {
      const result = parseExpression('user.name')
      expect(result.kind).toBe('member')
      if (result.kind === 'member') {
        expect(result.property).toBe('name')
      }
    })

    test('parses .length access', () => {
      const result = parseExpression('items().length')
      expect(result.kind).toBe('member')
      if (result.kind === 'member') {
        expect(result.property).toBe('length')
        expect(result.object.kind).toBe('call')
      }
    })

    test('parses comparison operators', () => {
      const cases = [
        { expr: 'a === b', op: '===' },
        { expr: 'a == b', op: '==' },
        { expr: 'a !== b', op: '!==' },
        { expr: 'a != b', op: '!=' },
        { expr: 'a > b', op: '>' },
        { expr: 'a < b', op: '<' },
        { expr: 'a >= b', op: '>=' },
        { expr: 'a <= b', op: '<=' },
      ]

      for (const { expr, op } of cases) {
        const result = parseExpression(expr)
        expect(result.kind).toBe('binary')
        if (result.kind === 'binary') {
          expect(result.op).toBe(op)
        }
      }
    })

    test('parses arithmetic operators', () => {
      const cases = [
        { expr: 'a + b', op: '+' },
        { expr: 'a - b', op: '-' },
        { expr: 'a * b', op: '*' },
        { expr: 'a / b', op: '/' },
        { expr: 'a % b', op: '%' },
      ]

      for (const { expr, op } of cases) {
        const result = parseExpression(expr)
        expect(result.kind).toBe('binary')
        if (result.kind === 'binary') {
          expect(result.op).toBe(op)
        }
      }
    })

    test('parses logical operators', () => {
      const andResult = parseExpression('a && b')
      expect(andResult.kind).toBe('logical')
      if (andResult.kind === 'logical') {
        expect(andResult.op).toBe('&&')
      }

      const orResult = parseExpression('a || b')
      expect(orResult.kind).toBe('logical')
      if (orResult.kind === 'logical') {
        expect(orResult.op).toBe('||')
      }
    })

    test('parses nullish coalescing operator', () => {
      const result = parseExpression('a ?? b')
      expect(result.kind).toBe('logical')
      if (result.kind === 'logical') {
        expect(result.op).toBe('??')
        expect(result.left.kind).toBe('identifier')
        expect(result.right.kind).toBe('identifier')
      }
    })

    test('parses nullish coalescing with member access and literal', () => {
      const result = parseExpression("props.label ?? 'Default'")
      expect(result.kind).toBe('logical')
      if (result.kind === 'logical') {
        expect(result.op).toBe('??')
        expect(result.left.kind).toBe('member')
        expect(result.right.kind).toBe('literal')
      }
    })

    test('parses unary negation', () => {
      const result = parseExpression('!isLoading')
      expect(result.kind).toBe('unary')
      if (result.kind === 'unary') {
        expect(result.op).toBe('!')
      }
    })

    test('parses ternary expression', () => {
      const result = parseExpression("a ? 'yes' : 'no'")
      expect(result.kind).toBe('conditional')
      if (result.kind === 'conditional') {
        expect(result.test.kind).toBe('identifier')
        expect(result.consequent.kind).toBe('literal')
        expect(result.alternate.kind).toBe('literal')
      }
    })

    test('parses arrow function with single param and expression body', () => {
      const result = parseExpression('x => x + 1')
      expect(result.kind).toBe('arrow-fn')
      if (result.kind === 'arrow-fn') {
        expect(result.params).toEqual(['x'])
        expect(result.body.kind).toBe('binary')
      }
    })

    test('parses filter() call into higher-order kind', () => {
      const result = parseExpression('todos().filter(t => !t.done)')
      expect(result.kind).toBe('higher-order')
      if (result.kind === 'higher-order') {
        expect(result.method).toBe('filter')
        expect(result.param).toBe('t')
        expect(result.predicate.kind).toBe('unary')
      }
    })

    test('parses every() call into higher-order kind', () => {
      const result = parseExpression('todos().every(t => t.done)')
      expect(result.kind).toBe('higher-order')
      if (result.kind === 'higher-order') {
        expect(result.method).toBe('every')
        expect(result.param).toBe('t')
      }
    })

    test('parses some() call into higher-order kind', () => {
      const result = parseExpression('todos().some(t => t.important)')
      expect(result.kind).toBe('higher-order')
      if (result.kind === 'higher-order') {
        expect(result.method).toBe('some')
        expect(result.param).toBe('t')
      }
    })

    test('parses find() call into higher-order kind', () => {
      const result = parseExpression('users().find(u => u.id === selectedId())')
      expect(result.kind).toBe('higher-order')
      if (result.kind === 'higher-order') {
        expect(result.method).toBe('find')
        expect(result.param).toBe('u')
        expect(result.predicate.kind).toBe('binary')
      }
    })

    test('parses findIndex() call into higher-order kind', () => {
      const result = parseExpression('items().findIndex(t => t.done)')
      expect(result.kind).toBe('higher-order')
      if (result.kind === 'higher-order') {
        expect(result.method).toBe('findIndex')
        expect(result.param).toBe('t')
      }
    })

    test('parses find().property into member kind with higher-order object', () => {
      const result = parseExpression('users().find(u => u.id === selectedId()).name')
      expect(result.kind).toBe('member')
      if (result.kind === 'member') {
        expect(result.property).toBe('name')
        expect(result.object.kind).toBe('higher-order')
        if (result.object.kind === 'higher-order') {
          expect(result.object.method).toBe('find')
        }
      }
    })

    test('parses filter().length into member kind with higher-order object', () => {
      const result = parseExpression('todos().filter(t => !t.done).length')
      expect(result.kind).toBe('member')
      if (result.kind === 'member') {
        expect(result.property).toBe('length')
        expect(result.object.kind).toBe('higher-order')
        if (result.object.kind === 'higher-order') {
          expect(result.object.method).toBe('filter')
          expect(result.object.param).toBe('t')
        }
      }
    })

    // #1443: `.filter(Boolean)` is the registry Slot's class-merge
    // pattern. It's a non-arrow callable that pre-#1443 fell through
    // to the unsupported-method gate. We synthesise the equivalent
    // truthy-identity arrow so adapters can lower it with their
    // existing higher-order paths.
    test('parses .filter(Boolean) into higher-order kind with synthetic identity predicate (#1443)', () => {
      const result = parseExpression('arr.filter(Boolean)')
      expect(result.kind).toBe('higher-order')
      if (result.kind === 'higher-order') {
        expect(result.method).toBe('filter')
        // The synthetic param is just an identifier-matching marker;
        // adapters substitute it into their loop variable. Whichever
        // name we pick must equal `predicate.name` so the substitution
        // round-trips into a truthy check.
        expect(result.predicate.kind).toBe('identifier')
        if (result.predicate.kind === 'identifier') {
          expect(result.predicate.name).toBe(result.param)
        }
      }
    })

    // The Boolean-callable shortcut is filter-specific because the
    // truthy-identity rewrite only matches `filter`'s semantics. For
    // `.every(Boolean)` / `.some(Boolean)` etc. the rewrite would
    // produce different JS semantics — leave them on the unsupported
    // path until each gets its own deliberate lowering.
    test('does NOT lower .every(Boolean) or .some(Boolean) — filter-specific shortcut (#1443)', () => {
      expect(parseExpression('arr.every(Boolean)').kind).not.toBe('higher-order')
      expect(parseExpression('arr.some(Boolean)').kind).not.toBe('higher-order')
    })

    // Array literals show up in the registry Slot's
    // `[a, b].filter(Boolean).join(' ')` shape (#1443). Pre-#1443
    // `[a, b]` parsed as `unsupported` and dragged the whole chain
    // into the unsupported / regex-pipeline path that #1421 had to
    // guard against. Now it's a first-class IR node.
    test('parses array literal into array-literal kind (#1443)', () => {
      const result = parseExpression('[a, b, 1, "x"]')
      expect(result.kind).toBe('array-literal')
      if (result.kind === 'array-literal') {
        expect(result.elements.map(e => e.kind)).toEqual([
          'identifier', 'identifier', 'literal', 'literal',
        ])
      }
    })

    // Object literal → `object-literal` kind (Roadmap A-1). Carried so
    // adapters can lower an object value structurally instead of
    // re-parsing the source with `ts.createSourceFile`. Object literals
    // reach the parser parenthesised — `() => ({ … })`, a prop value —
    // because a leading `{` at statement position is a block, not an
    // expression (covered below).
    test('parses object literal into object-literal kind', () => {
      const result = parseExpression('({ a: 1, b: x, "c-d": foo() })')
      expect(result.kind).toBe('object-literal')
      if (result.kind === 'object-literal') {
        expect(result.properties.map(p => p.key)).toEqual(['a', 'b', 'c-d'])
        expect(result.properties.map(p => p.value.kind)).toEqual([
          'literal', 'identifier', 'call',
        ])
        expect(result.properties.every(p => !p.shorthand)).toBe(true)
        // `raw` preserves the original string for byte-identical fallback.
        expect(result.raw).toBe('({ a: 1, b: x, "c-d": foo() })')
      }
    })

    test('records the key kind so numeric and string keys are distinguishable', () => {
      const result = parseExpression('({ a: 1, "1": 2, 3: 4 })')
      expect(result.kind).toBe('object-literal')
      if (result.kind === 'object-literal') {
        // `key` normalises all three to a string ('a' / '1' / '3'), but
        // `keyKind` keeps `{ '1': … }` (string) distinct from `{ 3: … }`
        // (numeric) — a consumer that rejects numeric keys needs this.
        expect(result.properties.map(p => p.key)).toEqual(['a', '1', '3'])
        expect(result.properties.map(p => p.keyKind)).toEqual(['identifier', 'string', 'numeric'])
      }
    })

    test('parses shorthand object literal, expanding `{ a }` to `a: a`', () => {
      const result = parseExpression('({ a, b: 2 })')
      expect(result.kind).toBe('object-literal')
      if (result.kind === 'object-literal') {
        expect(result.properties[0]).toMatchObject({
          key: 'a', shorthand: true, value: { kind: 'identifier', name: 'a' },
        })
        expect(result.properties[1]).toMatchObject({ key: 'b', shorthand: false })
      }
    })

    test('carries the raw numeric token (= ts NumericLiteral.text) (Roadmap A-3)', () => {
      // `raw` is the TS `NumericLiteral.text` — the exact token the adapter's
      // `tsLiteralToGo` already emits — so a structured lowering matches it
      // byte-for-byte. TS normalises separators / radix / exponent in `.text`
      // (`1_000`/`0x10`/`1e3` → decimal), which is precisely why carrying the
      // token beats the lossy `parseFloat` `value` (e.g. `parseFloat('1_000')`
      // is 1, not 1000).
      for (const [src, value, raw] of [
        ['1', 1, '1'],
        ['3.14', 3.14, '3.14'],
        ['0x10', 16, '16'],
        ['1e3', 1000, '1000'],
        ['1_000', 1000, '1000'],
      ] as const) {
        const r = parseExpression(src)
        expect(r).toMatchObject({ kind: 'literal', literalType: 'number', value, raw })
      }
      // Non-numeric literals don't carry `raw` (their `value` is canonical).
      expect((parseExpression("'x'") as { raw?: string }).raw).toBeUndefined()
      expect((parseExpression('true') as { raw?: string }).raw).toBeUndefined()
    })

    test('falls through to unsupported for spread / computed-key object literals', () => {
      // A spread member is not a plain map property — preserves the
      // pre-A-1 `unsupported` behaviour (byte-identical).
      expect(parseExpression('({ ...rest, a: 1 })').kind).toBe('unsupported')
      // Computed key `[k]: v` can't resolve to a static name.
      expect(parseExpression('({ [k]: 1 })').kind).toBe('unsupported')
    })

    test('a bare `{ … }` at statement position is a block, not an object literal', () => {
      // TS parses a leading `{` as a block statement, so a non-parenthesised
      // object literal string is `unsupported` (`Not an expression
      // statement`). Real call sites always supply the parenthesised form.
      expect(parseExpression('{ a: 1 }').kind).toBe('unsupported')
    })

    // Destructured filter param (#1443). The parser rewrites the
    // shorthand binding `({done})` into the equivalent dotted-access
    // form on a synthetic param (`_t.done`), so adapters can reuse
    // their existing higher-order paths instead of a separate
    // residual-object-accessor pipeline (#1384 territory).
    test('lowers .filter(({done}) => done) to higher-order with synthetic param (#1443)', () => {
      const result = parseExpression('todos().filter(({done}) => done)')
      expect(result.kind).toBe('higher-order')
      if (result.kind === 'higher-order') {
        expect(result.method).toBe('filter')
        // Synthetic param won't collide with `done` (the destructured
        // local) or any name in the body.
        expect(result.param).not.toBe('done')
        // Predicate is rewritten to `<synthetic>.done`
        expect(result.predicate.kind).toBe('member')
        if (result.predicate.kind === 'member') {
          expect(result.predicate.property).toBe('done')
          expect(result.predicate.object.kind).toBe('identifier')
          if (result.predicate.object.kind === 'identifier') {
            expect(result.predicate.object.name).toBe(result.param)
          }
        }
      }
    })

    // Renamed destructure: `{ done: isDone }` — the LOCAL name is
    // `isDone`, the FIELD on the loop var is `done`. The rewrite
    // substitutes `isDone` (the body reference) with `_t.done` (the
    // original field name).
    test('lowers .filter(({done: isDone}) => isDone) to higher-order with renamed destructure (#1443)', () => {
      const result = parseExpression('todos().filter(({done: isDone}) => isDone)')
      expect(result.kind).toBe('higher-order')
      if (result.kind === 'higher-order') {
        expect(result.predicate.kind).toBe('member')
        if (result.predicate.kind === 'member') {
          expect(result.predicate.property).toBe('done') // original field, not the local rename
        }
      }
    })

    // Defaults inside destructure (#1531). The parser folds the
    // default into the rewritten body as `(_t.field ?? <default>)`
    // so adapters reuse the standard logical-`??` lowering instead
    // of a residual-undefined accessor pipeline. Rest stays
    // unsupported. Nested + default combined is also out of scope
    // (covered separately).
    test('lowers .filter(({done = false}) => done) to higher-order with `??` default (#1531)', () => {
      const result = parseExpression('todos().filter(({done = false}) => done)')
      expect(result.kind).toBe('higher-order')
      if (result.kind === 'higher-order') {
        expect(result.method).toBe('filter')
        expect(result.param).not.toBe('done')
        // Predicate is `<synthetic>.done ?? false`.
        expect(result.predicate.kind).toBe('logical')
        if (result.predicate.kind === 'logical') {
          expect(result.predicate.op).toBe('??')
          expect(result.predicate.left.kind).toBe('member')
          if (result.predicate.left.kind === 'member') {
            expect(result.predicate.left.property).toBe('done')
            expect(result.predicate.left.object.kind).toBe('identifier')
            if (result.predicate.left.object.kind === 'identifier') {
              expect(result.predicate.left.object.name).toBe(result.param)
            }
          }
          expect(result.predicate.right.kind).toBe('literal')
          if (result.predicate.right.kind === 'literal') {
            expect(result.predicate.right.value).toBe(false)
            expect(result.predicate.right.literalType).toBe('boolean')
          }
        }
      }
    })

    test('lowers .filter(({count = 0}) => count > 5) — numeric default (#1531)', () => {
      const result = parseExpression('items().filter(({count = 0}) => count > 5)')
      expect(result.kind).toBe('higher-order')
      if (result.kind === 'higher-order') {
        // Predicate: `(_t.count ?? 0) > 5`.
        expect(result.predicate.kind).toBe('binary')
        if (result.predicate.kind === 'binary') {
          expect(result.predicate.op).toBe('>')
          expect(result.predicate.left.kind).toBe('logical')
          if (result.predicate.left.kind === 'logical') {
            expect(result.predicate.left.op).toBe('??')
            expect(result.predicate.left.left.kind).toBe('member')
            expect(result.predicate.left.right.kind).toBe('literal')
            if (result.predicate.left.right.kind === 'literal') {
              expect(result.predicate.left.right.value).toBe(0)
            }
          }
        }
      }
    })

    test("lowers .filter(({name = 'anon'}) => name.startsWith('a')) — string default (#1531)", () => {
      const result = parseExpression("items().filter(({name = 'anon'}) => name.startsWith('a'))")
      expect(result.kind).toBe('higher-order')
      if (result.kind === 'higher-order') {
        // Predicate: `(_t.name ?? 'anon').startsWith('a')`. Since #1448
        // Tier B, `.startsWith` lowers to an `array-method` node (it was
        // a generic `call` before), so the receiver is on `.object`.
        expect(result.predicate.kind).toBe('array-method')
        if (result.predicate.kind === 'array-method') {
          expect(result.predicate.method).toBe('startsWith')
          expect(result.predicate.object.kind).toBe('logical')
          if (result.predicate.object.kind === 'logical') {
            expect(result.predicate.object.op).toBe('??')
            expect(result.predicate.object.right.kind).toBe('literal')
            if (result.predicate.object.right.kind === 'literal') {
              expect(result.predicate.object.right.value).toBe('anon')
            }
          }
        }
      }
    })

    test('lowers .startsWith(search, position) — full arity (#1448 Tier B)', () => {
      const result = parseExpression(`name().startsWith("world", 6)`)
      expect(result.kind).toBe('array-method')
      if (result.kind === 'array-method') {
        expect(result.method).toBe('startsWith')
        // Both the search string and the position survive as args so the
        // adapter can emit the re-anchored test.
        expect(result.args.length).toBe(2)
      }
    })

    test('refuses .startsWith() with no search string (#1448 Tier B)', () => {
      // JS coerces the missing argument to the string "undefined" — a
      // degenerate result not worth lowering (mirrors `.includes()`).
      const result = parseExpression(`name().startsWith()`)
      expect(result.kind).toBe('unsupported')
    })

    test('lowers .replace(pattern, replacement, extra) — ignores 3rd+ arg (#1448 Tier B)', () => {
      const result = parseExpression(`name().replace("o", "0", "extra")`)
      expect(result.kind).toBe('array-method')
      if (result.kind === 'array-method') {
        expect(result.method).toBe('replace')
      }
    })

    test('refuses .replace(pattern) with no replacement (#1448 Tier B)', () => {
      // JS coerces the missing replacement to the string "undefined".
      const result = parseExpression(`name().replace("o")`)
      expect(result.kind).toBe('unsupported')
    })

    test('refuses .replace() with no arguments (#1448 Tier B)', () => {
      // The zero-arg form is degenerate too (both pattern and
      // replacement coerce to "undefined") — pin it alongside the
      // one-arg case so neither regresses.
      const result = parseExpression(`name().replace()`)
      expect(result.kind).toBe('unsupported')
    })

    test('.replace with a non-regex unsupported arg surfaces its own reason (#1448 Tier B)', () => {
      // An object-literal replacement must NOT be mislabelled as the
      // deferred regex form — the guard only special-cases a
      // regex-literal pattern.
      const result = parseExpression(`name().replace("a", {x: 1})`)
      expect(result.kind).toBe('unsupported')
      if (result.kind === 'unsupported') {
        expect(result.reason).not.toContain('regex form is deferred')
      }
    })

    test('.replace(/re/, repl) refuses the regex form with the deferred reason (#1448 Tier B)', () => {
      const result = parseExpression(`name().replace(/a/g, "b")`)
      expect(result.kind).toBe('unsupported')
      if (result.kind === 'unsupported') {
        expect(result.reason).toContain('regex form is deferred')
      }
    })

    test('lowers .repeat() and .repeat(n, extra) — full arity (#1448 Tier B)', () => {
      // `.repeat()` is `repeat(0)` → "" in JS (not a RangeError); a
      // second+ argument is ignored. Both stay on the lowering path.
      for (const expr of [`name().repeat()`, `name().repeat(3, 4)`]) {
        const result = parseExpression(expr)
        expect(result.kind).toBe('array-method')
        if (result.kind === 'array-method') {
          expect(result.method).toBe('repeat')
        }
      }
    })

    test('lowers .padStart() / .padEnd(t, p, extra) — full arity (#1448 Tier B)', () => {
      // `.padStart()` is `padStart(0)` → the receiver unchanged; a
      // third+ argument is ignored. Both stay on the lowering path.
      for (const expr of [`name().padStart()`, `name().padEnd(5, "0", "x")`]) {
        const result = parseExpression(expr)
        expect(result.kind).toBe('array-method')
      }
    })

    test('lowers .filter(({label = `untitled-${suffix}`}) => label) — template-literal default (#1531)', () => {
      const result = parseExpression('items().filter(({label = `untitled-${suffix}`}) => label)')
      expect(result.kind).toBe('higher-order')
      if (result.kind === 'higher-order') {
        // Predicate: `_t.label ?? \`untitled-${suffix}\``.
        expect(result.predicate.kind).toBe('logical')
        if (result.predicate.kind === 'logical') {
          expect(result.predicate.op).toBe('??')
          expect(result.predicate.right.kind).toBe('template-literal')
        }
      }
    })

    test('lowers .every(({done = true}) => done) — defaults work on .every (#1531)', () => {
      const result = parseExpression('items().every(({done = true}) => done)')
      expect(result.kind).toBe('higher-order')
      if (result.kind === 'higher-order') {
        expect(result.method).toBe('every')
        expect(result.predicate.kind).toBe('logical')
      }
    })

    test('lowers .find(({active = false}) => active) — defaults work on .find (#1531)', () => {
      const result = parseExpression('items().find(({active = false}) => active)')
      expect(result.kind).toBe('higher-order')
      if (result.kind === 'higher-order') {
        expect(result.method).toBe('find')
        expect(result.predicate.kind).toBe('logical')
      }
    })

    // Semantic note (#1531): JS destructure defaults trigger only on
    // `undefined`, while `??` triggers on `undefined` OR `null`. The
    // rewrite uses `??` for simplicity, so `null` ALSO produces the
    // default in lowered code — a one-bit gap from native JS semantics.
    // Pin the choice with a test that the IR is `logical` `??` (not
    // a conditional `!== undefined ? … : …`), so a future change to
    // sentinel-based lowering would be a deliberate decision rather
    // than a silent semantic shift.
    test('uses `??` (not sentinel undefined check) — pins the null-triggers-default gap (#1531)', () => {
      const result = parseExpression('items().filter(({done = false}) => done)')
      expect(result.kind).toBe('higher-order')
      if (result.kind === 'higher-order') {
        // `??` => `null` ALSO triggers the default; this is the
        // documented gap from JS destructure-default semantics, which
        // only trigger on `undefined`. If this assertion fails, the
        // rewrite shape changed — re-document the semantic difference.
        expect(result.predicate.kind).toBe('logical')
        if (result.predicate.kind === 'logical') {
          expect(result.predicate.op).toBe('??')
        }
      }
    })

    // The default-with-renamed-field combination: `{ done: isDone = false }`.
    // Local name is `isDone`, field on the source is `done`, default is
    // `false`. Body references `isDone`, which rewrites to
    // `(_t.done ?? false)`.
    test('lowers .filter(({done: isDone = false}) => isDone) — renamed + default (#1531)', () => {
      const result = parseExpression('todos().filter(({done: isDone = false}) => isDone)')
      expect(result.kind).toBe('higher-order')
      if (result.kind === 'higher-order') {
        expect(result.predicate.kind).toBe('logical')
        if (result.predicate.kind === 'logical') {
          expect(result.predicate.op).toBe('??')
          expect(result.predicate.left.kind).toBe('member')
          if (result.predicate.left.kind === 'member') {
            expect(result.predicate.left.property).toBe('done') // field, not the rename
          }
        }
      }
    })

    // Rest pattern with no body reference (#1532): the binding is
    // present but never read, so the rewrite is identical to the
    // non-rest shape — Mode A trivially holds (zero rest references
    // to validate).
    test('lowers .filter(({a, ...rest}) => a) — unused rest is harmless (#1532)', () => {
      const result = parseExpression('items().filter(({a, ...rest}) => a)')
      expect(result.kind).toBe('higher-order')
      if (result.kind === 'higher-order') {
        expect(result.predicate.kind).toBe('member')
        if (result.predicate.kind === 'member') {
          expect(result.predicate.property).toBe('a')
        }
      }
    })

    // Mode A (#1532): `restName.X` member access rewrites to
    // `_t.X`. The residual object only omits explicitly-bound keys,
    // so `_t.priority` returns the same value as `rest.priority`
    // would whenever `priority !== 'done'`.
    test('lowers .filter(({done, ...rest}) => done && rest.priority > 0) — rest member access (#1532)', () => {
      const result = parseExpression('items().filter(({done, ...rest}) => done && rest.priority > 0)')
      expect(result.kind).toBe('higher-order')
      if (result.kind === 'higher-order') {
        expect(result.method).toBe('filter')
        // Predicate: `_t.done && _t.priority > 0`.
        expect(result.predicate.kind).toBe('logical')
        if (result.predicate.kind === 'logical') {
          expect(result.predicate.op).toBe('&&')
          const left = result.predicate.left
          expect(left.kind).toBe('member')
          if (left.kind === 'member') {
            expect(left.property).toBe('done')
            if (left.object.kind === 'identifier') {
              expect(left.object.name).toBe(result.param)
            }
          }
          const right = result.predicate.right
          expect(right.kind).toBe('binary')
          if (right.kind === 'binary') {
            const lhs = right.left
            expect(lhs.kind).toBe('member')
            if (lhs.kind === 'member') {
              expect(lhs.property).toBe('priority')
              if (lhs.object.kind === 'identifier') {
                expect(lhs.object.name).toBe(result.param)
              }
            }
          }
        }
      }
    })

    test('lowers .filter(({a, ...r}) => r.x && r.y) — multiple rest accesses share the synthetic param (#1532)', () => {
      const result = parseExpression('items().filter(({a, ...r}) => r.x && r.y)')
      expect(result.kind).toBe('higher-order')
      if (result.kind === 'higher-order') {
        // Predicate: `_t.x && _t.y`.
        expect(result.predicate.kind).toBe('logical')
        if (result.predicate.kind === 'logical') {
          const left = result.predicate.left
          expect(left.kind).toBe('member')
          if (left.kind === 'member') {
            expect(left.property).toBe('x')
            if (left.object.kind === 'identifier') {
              expect(left.object.name).toBe(result.param)
            }
          }
          const right = result.predicate.right
          expect(right.kind).toBe('member')
          if (right.kind === 'member') {
            expect(right.property).toBe('y')
            if (right.object.kind === 'identifier') {
              expect(right.object.name).toBe(result.param)
            }
          }
        }
      }
    })

    test('lowers .every(({a, ...rest}) => rest.x) — rest rewrite applies across higher-order methods (#1532)', () => {
      const result = parseExpression('items().every(({a, ...rest}) => rest.x)')
      expect(result.kind).toBe('higher-order')
      if (result.kind === 'higher-order') {
        expect(result.method).toBe('every')
        expect(result.predicate.kind).toBe('member')
        if (result.predicate.kind === 'member') {
          expect(result.predicate.property).toBe('x')
        }
      }
    })

    // Mode A typed error (#1532): `rest.X` where `X` is also a
    // declared field. JS spec excludes named keys from the residual
    // object, so `rest.done` is statically `undefined`. Refuse so
    // the user fixes the bug rather than silently get rewritten to
    // `_t.done` (which would return the value, masking the mistake).
    test('rejects .filter(({done, ...rest}) => rest.done) — rest key collides with declared field (#1532)', () => {
      const result = parseExpression('items().filter(({done, ...rest}) => rest.done)')
      // Falls back to plain `call` — adapter surfaces BF021.
      expect(result.kind).toBe('call')
    })

    // Mode A typed error via RENAMED key (#1532 review). The rest
    // exclusion runs against source-object keys, not local binding
    // names — `done` is consumed even though it's locally named `d`.
    // Pre-review the check used `fieldMap.has('done')` which keys
    // on local rename `d` and silently rewrote to `_t.done`.
    test('rejects .filter(({done: d, ...rest}) => rest.done) — renamed key collision (#1532 review)', () => {
      const result = parseExpression('items().filter(({done: d, ...rest}) => rest.done)')
      expect(result.kind).toBe('call')
    })

    // Mode A typed error via NESTED-PATTERN slot (#1532 review).
    // The outer `user` key is consumed by the nested pattern even
    // though no top-level local binding for `user` exists. Same
    // miss as the renamed-key case — the pre-review check on
    // `fieldMap` would only see `name` and silently rewrite
    // `rest.user` to `_t.user`.
    test('rejects .filter(({user: {name}, ...rest}) => rest.user) — nested-pattern outer key collision (#1532 review)', () => {
      const result = parseExpression('items().filter(({user: {name}, ...rest}) => rest.user)')
      expect(result.kind).toBe('call')
    })

    // Inner-arrow parameter shadowing (#1532 review). The outer
    // destructure declares `rest`; the inner `.map((rest) => rest.y)`
    // declares its OWN `rest` parameter that shadows the outer. The
    // inner `rest` identifier is bound to the inner param, not the
    // outer rest binding. Without shadow tracking the walker would
    // walk into the inner body, see `identifier rest`, and emit a
    // spurious BF021. With shadowing the inner scope is skipped, and
    // the outer predicate lowers cleanly because the only outer
    // reference is `rest.x` (Mode A member access).
    test('lowers .filter(({a, ...rest}) => rest.x.map((rest) => rest.y).length > 0) — inner-arrow param shadows outer rest (#1532 review)', () => {
      const result = parseExpression('items().filter(({a, ...rest}) => rest.x.map((rest) => rest.y).length > 0)')
      expect(result.kind).toBe('higher-order')
      if (result.kind === 'higher-order') {
        expect(result.method).toBe('filter')
        // Predicate is the outer body rewritten — confirms validation
        // didn't refuse on the inner-scope `rest` reference.
        expect(result.predicate.kind).toBe('binary')
      }
    })

    // Mode B (#1532): rest used as a call argument can't be lowered
    // — the residual object isn't a runtime value in the template
    // pipeline. Refuse with BF021 + `/* @client */` hint.
    test('rejects .filter(({a, ...rest}) => Object.keys(rest).length > 0) — rest passed to call (#1532)', () => {
      const result = parseExpression('items().filter(({a, ...rest}) => Object.keys(rest).length > 0)')
      expect(result.kind).toBe('call')
    })

    test('rejects .filter(({a, ...rest}) => fn(rest)) — rest passed as bare arg (#1532)', () => {
      const result = parseExpression('items().filter(({a, ...rest}) => fn(rest))')
      expect(result.kind).toBe('call')
    })

    // Mode B (#1532): bare `rest` as the arrow's return value. No
    // member access — `rest` is the value position, which can't
    // lower to a template-compiled predicate.
    test('rejects .filter(({a, ...rest}) => rest) — rest as bare return value (#1532)', () => {
      const result = parseExpression('items().filter(({a, ...rest}) => rest)')
      expect(result.kind).toBe('call')
    })

    // Function-expression form with a destructured param (#1532).
    // The function-keyword path refuses destructured params upstream
    // at the call site in `convertNode` (only single-identifier params
    // are normalised into the arrow-fn IR shape) — locks in that the
    // upstream refusal stays in place so the #1532 rest path isn't
    // accidentally widened to function expressions without explicit work.
    test('rejects .filter(function ({a, ...rest}) { return rest }) — function-expression form refused upstream (#1532)', () => {
      const result = parseExpression('items().filter(function ({a, ...rest}) { return rest })')
      expect(result.kind).toBe('call')
    })

    // Method call on rest (#1532 review). `rest.foo()` would lower
    // to `_t.foo()`, but JS evaluates the call with `this` bound to
    // the member receiver — `rest` (residual object) and `_t` (the
    // original item) are different bindings, and rest also excludes
    // consumed keys. Both changes are observable, so refuse the
    // shape rather than silently rewrite.
    test('rejects .filter(({a, ...rest}) => rest.foo()) — method call on rest (#1532 review)', () => {
      const result = parseExpression('items().filter(({a, ...rest}) => rest.foo())')
      expect(result.kind).toBe('call')
    })

    // Same for method-call-with-args — confirms the dedicated branch
    // catches it regardless of argument shape.
    test('rejects .filter(({a, ...rest}) => rest.hasOwnProperty("k")) — method call on rest with args (#1532 review)', () => {
      const result = parseExpression('items().filter(({a, ...rest}) => rest.hasOwnProperty("k"))')
      expect(result.kind).toBe('call')
    })

    // Computed rest access with a literal key still refuses (#1532):
    // the residual-object accessor doesn't exist in template syntax,
    // and rewriting `rest[0]` to `_t[0]` would silently include the
    // declared keys' positions in the result. Mode B.
    test('rejects .filter(({a, ...rest}) => rest[0]) — computed rest access with literal key (#1532)', () => {
      const result = parseExpression('items().filter(({a, ...rest}) => rest[0])')
      expect(result.kind).toBe('call')
    })

    // Rest at a nested destructure level (#1532 out-of-scope) — we
    // have no "residual object at nested key" template accessor, so
    // refuse explicitly rather than walk past the outer level.
    test('rejects .filter(({user: {name, ...rest}}) => rest.email) — nested rest (#1532)', () => {
      const result = parseExpression('items().filter(({user: {name, ...rest}}) => rest.email)')
      expect(result.kind).toBe('call')
    })

    // Default value + rest composition (#1532 review). #1531's leaf
    // default fold (`_t.done ?? false`) and #1532's rest rewrite must
    // coexist in the same destructure. Pin the lowering so a future
    // refactor of either feature can't silently break the cross.
    test('lowers .filter(({done = false, ...rest}) => done && rest.priority > 0) — default + rest compose (#1532 review)', () => {
      const result = parseExpression('items().filter(({done = false, ...rest}) => done && rest.priority > 0)')
      expect(result.kind).toBe('higher-order')
      if (result.kind === 'higher-order') {
        // Predicate: `(_t.done ?? false) && _t.priority > 0`.
        expect(result.predicate.kind).toBe('logical')
        if (result.predicate.kind === 'logical') {
          // Left: `_t.done ?? false`.
          expect(result.predicate.left.kind).toBe('logical')
          if (result.predicate.left.kind === 'logical') {
            expect(result.predicate.left.op).toBe('??')
            expect(result.predicate.left.left.kind).toBe('member')
            if (result.predicate.left.left.kind === 'member') {
              expect(result.predicate.left.left.property).toBe('done')
            }
          }
          // Right: `_t.priority > 0` — confirms the rest rewrite ran.
          expect(result.predicate.right.kind).toBe('binary')
          if (result.predicate.right.kind === 'binary') {
            expect(result.predicate.right.left.kind).toBe('member')
            if (result.predicate.right.left.kind === 'member') {
              expect(result.predicate.right.left.property).toBe('priority')
            }
          }
        }
      }
    })

    // Renamed leaf + Mode A rest member access (#1532 review). The
    // collision negative case (`rest.done` after `done: d`) is
    // covered above; this is the positive cross — the renamed leaf
    // uses its local name (`d`) and the rest path uses a different
    // source key (`priority`). Lowers cleanly.
    test('lowers .filter(({done: d, ...rest}) => d && rest.priority > 0) — renamed leaf + Mode A (#1532 review)', () => {
      const result = parseExpression('items().filter(({done: d, ...rest}) => d && rest.priority > 0)')
      expect(result.kind).toBe('higher-order')
      if (result.kind === 'higher-order') {
        expect(result.predicate.kind).toBe('logical')
        if (result.predicate.kind === 'logical') {
          // Left: `_t.done` (rename rewrites to the SOURCE key).
          const left = result.predicate.left
          expect(left.kind).toBe('member')
          if (left.kind === 'member') {
            expect(left.property).toBe('done')
            if (left.object.kind === 'identifier') {
              expect(left.object.name).toBe(result.param)
            }
          }
          // Right: `_t.priority > 0` — rest member access.
          expect(result.predicate.right.kind).toBe('binary')
        }
      }
    })

    // Mixed Mode A + Mode B in the same predicate (#1532 review).
    // `rest.x` is a legal member access; `fn(rest)` passes rest as
    // a value. The walker must catch the value-use even when other
    // references are valid — verifies the early-return ordering
    // doesn't accept the predicate just because Mode A reached the
    // member walker first.
    test('rejects .filter(({a, ...rest}) => rest.x === fn(rest)) — Mode A + Mode B mixed (#1532 review)', () => {
      const result = parseExpression('items().filter(({a, ...rest}) => rest.x === fn(rest))')
      expect(result.kind).toBe('call')
    })

    // Synthetic param collision with closure-captured `_t` (#1532
    // review, parallels the #1530 collision test). The body
    // references a free `_t` AND uses rest member access. The
    // synthetic param picker must avoid `_t` so the rewrite doesn't
    // silently shadow the closure capture.
    test('picks a non-colliding synthetic param when rest body references `_t` (#1532 review)', () => {
      const result = parseExpression('items().filter(({a, ...rest}) => rest.x === _t)')
      expect(result.kind).toBe('higher-order')
      if (result.kind === 'higher-order') {
        expect(result.param).not.toBe('_t')
        expect(result.param).toMatch(/^_t_+$/)
      }
    })

    // Cross-method coverage for the rest rewrite (#1532). The arrow
    // handler is generic, but pin each higher-order method so a
    // future narrowing in the call-site dispatch can't silently
    // drop one. `.every` is covered above; this group adds the
    // remaining three.
    test('lowers .some(({a, ...rest}) => rest.x) — cross-method (#1532 review)', () => {
      const result = parseExpression('items().some(({a, ...rest}) => rest.x)')
      expect(result.kind).toBe('higher-order')
      if (result.kind === 'higher-order') expect(result.method).toBe('some')
    })

    test('lowers .find(({a, ...rest}) => rest.x) — cross-method (#1532 review)', () => {
      const result = parseExpression('items().find(({a, ...rest}) => rest.x)')
      expect(result.kind).toBe('higher-order')
      if (result.kind === 'higher-order') expect(result.method).toBe('find')
    })

    test('lowers .findIndex(({a, ...rest}) => rest.x) — cross-method (#1532 review)', () => {
      const result = parseExpression('items().findIndex(({a, ...rest}) => rest.x)')
      expect(result.kind).toBe('higher-order')
      if (result.kind === 'higher-order') expect(result.method).toBe('findIndex')
    })

    // Nested destructure with a default on an INNER LEAF composes
    // the two rewrites naturally — the inner leaf is reached through
    // the threaded property path, and the leaf default wraps the
    // accessor in `??` like any other leaf-level default. The #1531
    // issue lists this shape as "out of scope" only because no
    // special design was needed: the existing nested + leaf-default
    // mechanics produce a correct lowering for free.
    test('lowers .filter(({user: {name = "anon"}}) => name) — inner-leaf default composes (#1531)', () => {
      const result = parseExpression('items().filter(({user: {name = "anon"}}) => name)')
      expect(result.kind).toBe('higher-order')
      if (result.kind === 'higher-order') {
        // Predicate: `_t.user.name ?? "anon"`.
        expect(result.predicate.kind).toBe('logical')
        if (result.predicate.kind === 'logical') {
          expect(result.predicate.op).toBe('??')
          // Walk: `_t.user.name`.
          const lhs = result.predicate.left
          expect(lhs.kind).toBe('member')
          if (lhs.kind === 'member') {
            expect(lhs.property).toBe('name')
            expect(lhs.object.kind).toBe('member')
            if (lhs.object.kind === 'member') {
              expect(lhs.object.property).toBe('user')
            }
          }
          if (result.predicate.right.kind === 'literal') {
            expect(result.predicate.right.value).toBe('anon')
          }
        }
      }
    })

    // Default ON the nested-pattern slot itself (`({ user: { name } = {} })`)
    // — different from a leaf-level default. The outer slot's default
    // says "if user is undefined, use {} before destructuring name",
    // which needs an extra outer-level `??` paired with the inner
    // walk. Stays refused; out of scope for #1531.
    test('rejects .filter(({user: {name} = {}}) => name) — default on nested-pattern slot (#1531)', () => {
      const result = parseExpression('items().filter(({user: {name} = {}}) => name)')
      expect(result.kind).toBe('call')
    })

    // Cross-binding default reference (`{ a, b = a }`) — JS resolves
    // `a` to the destructured field, but our rewrite would emit
    // `_t.b ?? a` and resolve `a` against the outer scope. To avoid
    // the silent semantic mismatch, refuse the shape and let users
    // fold the default inline (#1536 review).
    test('rejects .filter(({a, b = a}) => b) — default refs another destructured binding (#1536)', () => {
      const result = parseExpression('items().filter(({a, b = a}) => b)')
      expect(result.kind).toBe('call')
    })

    // Side-effecting default (`{ x = getX() }`) — the rewrite duplicates
    // the default at every reference site, so `x + x` would fire `getX()`
    // twice. JS evaluates the default at most once per call. Refuse to
    // avoid the silent multi-eval (#1536 review). Workaround: bind to a
    // closure var.
    test('rejects .filter(({x = getX()}) => x + x) — default contains a call (#1536)', () => {
      const result = parseExpression('items().filter(({x = getX()}) => x + x)')
      expect(result.kind).toBe('call')
    })

    test('rejects .filter(({xs = arr.slice()}) => xs) — default contains array-method (#1536)', () => {
      const result = parseExpression('items().filter(({xs = arr.slice()}) => xs)')
      expect(result.kind).toBe('call')
    })

    // Pure shapes that DO compose with the inline rewrite — these
    // pin the "still works" side of the side-effect restriction.
    test('lowers .filter(({x = fallback}) => x) — identifier default is pure (#1536)', () => {
      // `fallback` resolves to outer scope; that's fine — duplicating
      // a bare identifier read has no semantic cost.
      const result = parseExpression('items().filter(({x = fallback}) => x)')
      expect(result.kind).toBe('higher-order')
      if (result.kind === 'higher-order') {
        expect(result.predicate.kind).toBe('logical')
        if (result.predicate.kind === 'logical') {
          expect(result.predicate.op).toBe('??')
          expect(result.predicate.right.kind).toBe('identifier')
        }
      }
    })

    test('lowers .filter(({x = config.fallback}) => x) — member-access default is pure (#1536)', () => {
      // `config.fallback` is a property read — assumed pure (no getter
      // side effects); duplicating across reference sites is harmless
      // for the common case.
      const result = parseExpression('items().filter(({x = config.fallback}) => x)')
      expect(result.kind).toBe('higher-order')
      if (result.kind === 'higher-order') {
        expect(result.predicate.kind).toBe('logical')
        if (result.predicate.kind === 'logical') {
          expect(result.predicate.right.kind).toBe('member')
        }
      }
    })

    // Nested destructure (#1530). The parser recurses into the inner
    // object pattern and threads the property path, so
    // `({user: {name}}) => name === 'alice'` rewrites to
    // `(_t) => _t.user.name === 'alice'`. Adapters reuse the
    // higher-order path with no extra work — the IR is identical to
    // what the user could have written by hand.
    test('lowers .filter(({user: {name}}) => …) with nested destructure (#1530)', () => {
      const result = parseExpression("items().filter(({user: {name}}) => name === 'alice')")
      expect(result.kind).toBe('higher-order')
      if (result.kind === 'higher-order') {
        expect(result.method).toBe('filter')
        expect(result.param).not.toBe('name')
        // Predicate: <_t>.user.name === 'alice'
        expect(result.predicate.kind).toBe('binary')
        if (result.predicate.kind === 'binary') {
          expect(result.predicate.op).toBe('===')
          // Walk the left-leaning chain: `_t.user.name`.
          const lhs = result.predicate.left
          expect(lhs.kind).toBe('member')
          if (lhs.kind === 'member') {
            expect(lhs.property).toBe('name')
            expect(lhs.object.kind).toBe('member')
            if (lhs.object.kind === 'member') {
              expect(lhs.object.property).toBe('user')
              expect(lhs.object.object.kind).toBe('identifier')
              if (lhs.object.object.kind === 'identifier') {
                expect(lhs.object.object.name).toBe(result.param)
              }
            }
          }
        }
      }
    })

    test('lowers .filter(({a: {b: {c}}}) => c) with doubly-nested destructure (#1530)', () => {
      const result = parseExpression('items().filter(({a: {b: {c}}}) => c)')
      expect(result.kind).toBe('higher-order')
      if (result.kind === 'higher-order') {
        // Predicate: `_t.a.b.c`.
        let node = result.predicate
        const expected = ['c', 'b', 'a']
        for (const property of expected) {
          expect(node.kind).toBe('member')
          if (node.kind !== 'member') return
          expect(node.property).toBe(property)
          node = node.object
        }
        expect(node.kind).toBe('identifier')
        if (node.kind === 'identifier') {
          expect(node.name).toBe(result.param)
        }
      }
    })

    test('lowers .filter(({user: {name: n}}) => n) with renamed inner field (#1530)', () => {
      // `name: n` — `name` is the field, `n` is the LOCAL. Rewrite
      // substitutes `n` (body reference) with `_t.user.name` (original
      // field path).
      const result = parseExpression('items().filter(({user: {name: n}}) => n)')
      expect(result.kind).toBe('higher-order')
      if (result.kind === 'higher-order') {
        expect(result.param).not.toBe('n')
        expect(result.predicate.kind).toBe('member')
        if (result.predicate.kind === 'member') {
          expect(result.predicate.property).toBe('name') // field, not the rename
          expect(result.predicate.object.kind).toBe('member')
          if (result.predicate.object.kind === 'member') {
            expect(result.predicate.object.property).toBe('user')
          }
        }
      }
    })

    // Array binding inside an object destructure (`{a: [x]}`) stays
    // refused — different shape (numeric indices). Lock in the
    // refusal here so a future change doesn't accidentally start
    // lowering it via the object-destructure path (#1530).
    test('rejects .filter(({a: [x]}) => x) — array binding inside object destructure (#1530)', () => {
      const result = parseExpression('items().filter(({a: [x]}) => x)')
      // Falls through to plain `call` — adapter surfaces BF101.
      expect(result.kind).toBe('call')
    })

    // Non-identifier property names (`{ 'x': y }`, `{ 0: y }`) used to
    // silently fall back to the local name, which would rewrite `y`
    // to `<synthetic>.y` instead of the correct `<synthetic>['x']`.
    // Refuse explicitly until we can carry computed segments through
    // the path representation (#1530).
    test('rejects .filter(({ "x": y }) => y) — string-literal key in destructure (#1530)', () => {
      const result = parseExpression("items().filter(({ 'x': y }) => y)")
      expect(result.kind).toBe('call')
    })

    test('rejects .filter(({ 0: y }) => y) — numeric-literal key in destructure (#1530)', () => {
      const result = parseExpression('items().filter(({ 0: y }) => y)')
      expect(result.kind).toBe('call')
    })

    // Synthetic param collision — body references a free `_t` AND the
    // destructure also introduces `_t` as a leaf binding. Both must be
    // avoided when picking the synthetic name (#1530 acceptance).
    test('picks a non-colliding synthetic param when body references `_t` (#1530)', () => {
      // `_t` here is a free identifier in the body (closure capture);
      // the synthetic param must NOT be `_t`, otherwise the rewrite
      // would silently shadow it.
      const result = parseExpression('items().filter(({user: {name}}) => name === _t)')
      expect(result.kind).toBe('higher-order')
      if (result.kind === 'higher-order') {
        expect(result.param).not.toBe('_t')
        expect(result.param).toMatch(/^_t_+$/)
      }
    })

    // Function-keyword filter callback (#1443): `function (x) { return
    // x.done }`. Normalised into the arrow-fn IR shape so the
    // higher-order detector at the call site recognises it alongside
    // `(x) => x.done`.
    test('lowers .filter(function(x) { return x.done }) to higher-order (#1443)', () => {
      const result = parseExpression('todos().filter(function (x) { return x.done })')
      expect(result.kind).toBe('higher-order')
      if (result.kind === 'higher-order') {
        expect(result.param).toBe('x')
        expect(result.predicate.kind).toBe('member')
      }
    })

    test('rejects function-keyword filter with multiple statements (#1443)', () => {
      const result = parseExpression('todos().filter(function (x) { const y = x; return y.done })')
      expect(result.kind).toBe('call')
    })
  })

  describe('isSupported', () => {
    test('L1: simple identifier is supported', () => {
      const expr = parseExpression('count')
      const result = isSupported(expr)
      expect(result.supported).toBe(true)
      expect(result.level).toBe('L1')
    })

    test('L1: signal call is supported', () => {
      const expr = parseExpression('count()')
      const result = isSupported(expr)
      expect(result.supported).toBe(true)
      expect(result.level).toBe('L1')
    })

    test('L2: member access is supported', () => {
      const expr = parseExpression('user.name')
      const result = isSupported(expr)
      expect(result.supported).toBe(true)
      expect(result.level).toBe('L2')
    })

    test('L2: variable element access (`arr[index]`) is supported (#1897)', () => {
      const expr = parseExpression('selected()[index]')
      expect(expr.kind).toBe('index-access')
      const result = isSupported(expr)
      expect(result.supported).toBe(true)
      expect(result.level).toBe('L2')
    })

    test('arithmetic index (`arr[i + 1]`) is supported', () => {
      const expr = parseExpression('arr[i + 1]')
      expect(expr.kind).toBe('index-access')
      expect(isSupported(expr).supported).toBe(true)
    })

    test('element access with an unsupported (arrow) index is refused', () => {
      const expr = parseExpression('rows[() => x]')
      expect(isSupported(expr).supported).toBe(false)
    })

    test('L2: .length is supported', () => {
      const expr = parseExpression('items().length')
      const result = isSupported(expr)
      expect(result.supported).toBe(true)
      expect(result.level).toBe('L2')
    })

    test('L3: comparison is supported', () => {
      const expr = parseExpression('count() > 0')
      const result = isSupported(expr)
      expect(result.supported).toBe(true)
      expect(result.level).toBe('L3')
    })

    test('L3: string literal comparison is supported', () => {
      const expr = parseExpression("filter() === 'all'")
      const result = isSupported(expr)
      expect(result.supported).toBe(true)
      expect(result.level).toBe('L3')
    })

    test('L4: logical operators are supported', () => {
      const expr = parseExpression('a && b')
      const result = isSupported(expr)
      expect(result.supported).toBe(true)
      expect(result.level).toBe('L4')
    })

    test('L4: nullish coalescing is supported', () => {
      const expr = parseExpression("props.label ?? 'Default'")
      const result = isSupported(expr)
      expect(result.supported).toBe(true)
      expect(result.level).toBe('L4')
    })

    test('L4: negation is supported', () => {
      const expr = parseExpression('!isLoading()')
      const result = isSupported(expr)
      expect(result.supported).toBe(true)
      expect(result.level).toBe('L4')
    })

    test('L5: filter() with simple predicate IS supported', () => {
      const expr = parseExpression('items().filter(x => x.done)')
      const result = isSupported(expr)
      expect(result.supported).toBe(true)
      expect(result.level).toBe('L5')
    })

    test('L5: every() with simple predicate IS supported', () => {
      const expr = parseExpression('items().every(x => x.done)')
      const result = isSupported(expr)
      expect(result.supported).toBe(true)
      expect(result.level).toBe('L5')
    })

    test('L5: some() with simple predicate IS supported', () => {
      const expr = parseExpression('items().some(x => !x.done)')
      const result = isSupported(expr)
      expect(result.supported).toBe(true)
      expect(result.level).toBe('L5')
    })

    test('L5: every() with complex predicate IS supported', () => {
      const expr = parseExpression('items().every(t => t.price > 100)')
      const result = isSupported(expr)
      expect(result.supported).toBe(true)
      expect(result.level).toBe('L5')
    })

    test('L5: some() with complex predicate IS supported', () => {
      const expr = parseExpression('items().some(t => t.price > 100 && t.active)')
      const result = isSupported(expr)
      expect(result.supported).toBe(true)
      expect(result.level).toBe('L5')
    })

    test('L5: find() with simple predicate IS supported', () => {
      const expr = parseExpression('users().find(u => u.id === selectedId())')
      const result = isSupported(expr)
      expect(result.supported).toBe(true)
      expect(result.level).toBe('L5')
    })

    test('L5: findIndex() with simple predicate IS supported', () => {
      const expr = parseExpression('items().findIndex(t => t.done)')
      const result = isSupported(expr)
      expect(result.supported).toBe(true)
      expect(result.level).toBe('L5')
    })

    test('filter().length IS supported (as member with higher-order object)', () => {
      const expr = parseExpression('items().filter(x => !x.done).length')
      const result = isSupported(expr)
      expect(result.supported).toBe(true)
      // Returns L2 because it's parsed as member access; the higher-order
      // object is handled during rendering by go-template-adapter
      expect(result.level).toBe('L2')
    })

    test('L5: map() is NOT supported', () => {
      const expr = parseExpression('items().map(x => x.name)')
      const result = isSupported(expr)
      expect(result.supported).toBe(false)
      expect(result.level).toBe('L5_UNSUPPORTED')
      expect(result.reason).toContain('map')
    })

    test('standalone arrow functions are NOT supported', () => {
      const expr = parseExpression('x => x + 1')
      const result = isSupported(expr)
      expect(result.supported).toBe(false)
      expect(result.reason).toContain('Standalone arrow functions')
    })

    test('nested higher-order methods are NOT supported', () => {
      // This would be: items().filter(x => x.items.filter(y => y.done).length > 0)
      // For now, test a simpler case that triggers nested detection
      const expr = parseExpression('items().filter(x => x.items().filter(y => y.done).length > 0)')
      const result = isSupported(expr)
      expect(result.supported).toBe(false)
      expect(result.level).toBe('L5_UNSUPPORTED')
    })
  })

  describe('exprToString', () => {
    test('converts identifier to string', () => {
      const expr = parseExpression('count')
      expect(exprToString(expr)).toBe('count')
    })

    test('converts call to string', () => {
      const expr = parseExpression('count()')
      expect(exprToString(expr)).toBe('count()')
    })

    test('converts binary to string', () => {
      const expr = parseExpression('a > b')
      expect(exprToString(expr)).toBe('a > b')
    })

    test('converts member access to string', () => {
      const expr = parseExpression('user.name')
      expect(exprToString(expr)).toBe('user.name')
    })

    test('converts nullish coalescing to string', () => {
      const expr = parseExpression("a ?? 'fallback'")
      expect(exprToString(expr)).toBe('a ?? "fallback"')
    })

    test('converts arrow function to string', () => {
      const expr = parseExpression('x => x + 1')
      expect(exprToString(expr)).toBe('x => x + 1')
    })

    test('converts higher-order to string', () => {
      const expr = parseExpression('todos().filter(t => !t.done)')
      expect(exprToString(expr)).toBe('todos().filter(t => !t.done)')
    })

    test('converts find() to string', () => {
      const expr = parseExpression('users().find(u => u.id === selectedId())')
      expect(exprToString(expr)).toBe('users().find(u => u.id === selectedId())')
    })

    test('converts findIndex() to string', () => {
      const expr = parseExpression('items().findIndex(t => t.done)')
      expect(exprToString(expr)).toBe('items().findIndex(t => t.done)')
    })

    test('converts filter-length to string', () => {
      const expr = parseExpression('todos().filter(t => !t.done).length')
      expect(exprToString(expr)).toBe('todos().filter(t => !t.done).length')
    })
  })

  describe('parseBlockBody', () => {
    function parseBlock(code: string) {
      const sourceFile = ts.createSourceFile(
        'test.ts',
        `(t => ${code})`,
        ts.ScriptTarget.Latest,
        true,
        ts.ScriptKind.TSX
      )
      const ranges = collectAllTypeRanges(sourceFile)
      const getJS = (node: ts.Node) => reconstructWithoutTypes(node, sourceFile, ranges)
      const exprStmt = sourceFile.statements[0] as ts.ExpressionStatement
      const paren = exprStmt.expression as ts.ParenthesizedExpression
      const arrow = paren.expression as ts.ArrowFunction
      const block = arrow.body as ts.Block
      return parseBlockBody(block, sourceFile, getJS)
    }

    test('parses simple return statement', () => {
      const result = parseBlock('{ return true }')
      expect(result).not.toBeNull()
      expect(result!.length).toBe(1)
      expect(result![0].kind).toBe('return')
      if (result![0].kind === 'return') {
        expect(result![0].value.kind).toBe('literal')
      }
    })

    test('parses variable declaration with signal call', () => {
      const result = parseBlock('{ const f = filter(); return f }')
      expect(result).not.toBeNull()
      expect(result!.length).toBe(2)
      expect(result![0].kind).toBe('var-decl')
      if (result![0].kind === 'var-decl') {
        expect(result![0].name).toBe('f')
        expect(result![0].init.kind).toBe('call')
      }
    })

    test('parses if statement without else', () => {
      const result = parseBlock('{ if (f === "active") return !t.done; return true }')
      expect(result).not.toBeNull()
      expect(result!.length).toBe(2)
      expect(result![0].kind).toBe('if')
      if (result![0].kind === 'if') {
        expect(result![0].condition.kind).toBe('binary')
        expect(result![0].consequent.length).toBe(1)
        expect(result![0].alternate).toBeUndefined()
      }
    })

    test('parses if-else statement', () => {
      const result = parseBlock('{ if (f === "active") return !t.done; else return true }')
      expect(result).not.toBeNull()
      expect(result!.length).toBe(1)
      expect(result![0].kind).toBe('if')
      if (result![0].kind === 'if') {
        expect(result![0].consequent.length).toBe(1)
        expect(result![0].alternate).toBeDefined()
        expect(result![0].alternate!.length).toBe(1)
      }
    })

    test('parses if-else if-else chain', () => {
      const result = parseBlock(`{
        if (f === "active") return !t.done
        else if (f === "completed") return t.done
        else return true
      }`)
      expect(result).not.toBeNull()
      expect(result!.length).toBe(1)
      expect(result![0].kind).toBe('if')
      if (result![0].kind === 'if') {
        // First if condition
        expect(result![0].condition.kind).toBe('binary')
        // else if is represented as alternate containing another if
        expect(result![0].alternate).toBeDefined()
        expect(result![0].alternate!.length).toBe(1)
        expect(result![0].alternate![0].kind).toBe('if')
      }
    })

    test('parses nested if statements', () => {
      const result = parseBlock(`{
        if (showCompleted) {
          if (t.done) return true
          return false
        }
        return true
      }`)
      expect(result).not.toBeNull()
      expect(result!.length).toBe(2)
      expect(result![0].kind).toBe('if')
      if (result![0].kind === 'if') {
        expect(result![0].consequent.length).toBe(2)
      }
    })

    test('parses TodoApp filter pattern', () => {
      const result = parseBlock(`{
        const f = filter()
        if (f === 'active') return !t.done
        if (f === 'completed') return t.done
        return true
      }`)
      expect(result).not.toBeNull()
      expect(result!.length).toBe(4)
      expect(result![0].kind).toBe('var-decl')
      expect(result![1].kind).toBe('if')
      expect(result![2].kind).toBe('if')
      expect(result![3].kind).toBe('return')
    })

    test('returns null for unsupported statements (for loop)', () => {
      const result = parseBlock('{ for (let i = 0; i < 10; i++) {} return true }')
      expect(result).toBeNull()
    })

    test('returns null for unsupported statements (while loop)', () => {
      const result = parseBlock('{ while (true) {} return true }')
      expect(result).toBeNull()
    })
  })
})

// =============================================================================
// Full-arity lowering for the array / string methods (#1448)
// =============================================================================
//
// These methods lower at their full JS arity: zero-arg defaults
// (`.join()` → `,`, `.slice()` → full copy) and JS-ignored trailing
// arguments (`.trim(1)`, `.at(i, extra)`, `.slice(s, e, extra)`) are all
// accepted. The only forms still refused are the ones whose EXTRA
// argument changes the result and isn't lowered yet — the `fromIndex` of
// `.includes`/`.indexOf`/`.lastIndexOf` and the variadic `.concat(a, b)`
// — because silently dropping those would make SSR differ from the
// client (worse than a build error).
describe('expression-parser — array-method full-arity lowering (#1448)', () => {
  const supported: Array<[string, string]> = [
    // base forms
    ['join(sep)', 'arr.join("-")'],
    ['includes(x)', 'arr.includes(x)'],
    ['indexOf(x)', 'arr.indexOf(x)'],
    ['at(i)', 'arr.at(1)'],
    ['concat(other)', 'arr.concat(b)'],
    ['slice(start)', 'arr.slice(1)'],
    ['slice(start, end)', 'arr.slice(1, 2)'],
    ['trim()', 's.trim()'],
    ['toFixed(digits)', 'n.toFixed(2)'],
    ['toFixed() → default 0', 'n.toFixed()'],
    // zero-arg defaults (every one of these escaping both its arm AND
    // the guard is the footgun the relaxation must NOT reintroduce)
    ['join() → default ","', 'arr.join()'],
    ['slice() → full copy', 'arr.slice()'],
    ['at() → at(0)', 'arr.at()'],
    ['concat() → shallow copy', 'arr.concat()'],
    ['reverse() base', 'arr.reverse()'],
    ['toReversed() base', 'arr.toReversed()'],
    ['toLowerCase() base', 's.toLowerCase()'],
    ['toUpperCase() base', 's.toUpperCase()'],
    ['lastIndexOf(x) base', 'arr.lastIndexOf(x)'],
    // JS-ignored trailing arguments
    ['slice(s, e, extra)', 'arr.slice(1, 2, 3)'],
    ['at(i, extra)', 'arr.at(1, 2)'],
    ['reverse(extra)', 'arr.reverse(1)'],
    ['toReversed(extra)', 'arr.toReversed(1)'],
    ['toLowerCase(extra)', 's.toLowerCase("x")'],
    ['toUpperCase(extra)', 's.toUpperCase("x")'],
    ['trim(extra)', 's.trim(1)'],
  ]
  for (const [label, expr] of supported) {
    test(`${label} — lowers to array-method`, () => {
      expect(parseExpression(expr).kind).toBe('array-method')
    })
  }

  // Still refused (the extra argument is meaningful and not yet
  // lowered), plus the degenerate zero-arg search forms (`includes()`
  // searches for `undefined` — refused rather than guessed).
  const refused: Array<[string, string]> = [
    ['includes(x, fromIndex)', 'arr.includes(x, 1)'],
    ['indexOf(x, fromIndex)', 'arr.indexOf(x, 1)'],
    ['lastIndexOf(x, fromIndex)', 'arr.lastIndexOf(x, 1)'],
    ['concat(a, b) variadic', 'arr.concat(a, b)'],
    ['includes() zero-arg', 'arr.includes()'],
    ['indexOf() zero-arg', 'arr.indexOf()'],
  ]
  for (const [label, expr] of refused) {
    test(`${label} — refuses (meaningful extra arg, not yet lowered)`, () => {
      const result = parseExpression(expr)
      expect(result.kind).toBe('unsupported')
      if (result.kind === 'unsupported') {
        // Must NOT push `@client` (wrong remedy; doesn't work in
        // attribute / condition position), and must explain it's a
        // not-yet-lowered argument.
        expect(result.reason).not.toContain('@client')
        expect(result.reason).toContain('not yet lowered')
      }
    })
  }
})

describe('expression-parser — .flat(depth?) lowering (#1448 Tier C)', () => {
  // Depth literals normalise into a structured `flatDepth` at parse time.
  const depths: Array<[string, string, number | 'infinity']> = [
    ['.flat() → depth 1', 'arr.flat()', 1],
    ['.flat(2) → depth 2', 'arr.flat(2)', 2],
    ['.flat(Infinity) → "infinity"', 'arr.flat(Infinity)', 'infinity'],
    ['.flat(0) → depth 0 (shallow copy)', 'arr.flat(0)', 0],
    ['.flat(-1) → normalised to 0 (JS clamps)', 'arr.flat(-1)', 0],
    ['.flat(1.9) → truncated to 1', 'arr.flat(1.9)', 1],
  ]
  for (const [label, expr, expected] of depths) {
    test(label, () => {
      const result = parseExpression(expr)
      expect(result.kind).toBe('array-method')
      if (result.kind === 'array-method' && result.method === 'flat') {
        expect(result.flatDepth).toBe(expected)
      } else {
        throw new Error(`expected a flat array-method, got ${result.kind}`)
      }
    })
  }

  test('non-literal depth refuses (must be resolvable at template time)', () => {
    const result = parseExpression('arr.flat(n)')
    expect(result.kind).toBe('unsupported')
    if (result.kind === 'unsupported') {
      // Wrong remedy `@client` must not be suggested (doesn't work in
      // attribute / condition position).
      expect(result.reason).not.toContain('@client')
      expect(result.reason).toContain('literal')
    }
  })

  // exprToString (diagnostics / debug output) must preserve the normalised
  // depth, not collapse every form to `.flat()`.
  test('exprToString round-trips the normalised depth', () => {
    expect(exprToString(parseExpression('arr.flat()'))).toBe('arr.flat()')
    expect(exprToString(parseExpression('arr.flat(2)'))).toBe('arr.flat(2)')
    expect(exprToString(parseExpression('arr.flat(Infinity)'))).toBe('arr.flat(Infinity)')
    expect(exprToString(parseExpression('arr.flat(0)'))).toBe('arr.flat(0)')
  })
})

describe('expression-parser — .flatMap(fn) projection (#1448 Tier C)', () => {
  // Accepted catalogue: self, single field, and array-literal tuples of
  // self / field leaves.
  type Proj = { kind: 'self' } | { kind: 'field'; field: string } | { kind: 'tuple'; elements: unknown[] }
  const accepted: Array<[string, string, Proj]> = [
    ['self (i => i)', 'arr.flatMap(i => i)', { kind: 'self' }],
    ['field (i => i.tags)', 'arr.flatMap(i => i.tags)', { kind: 'field', field: 'tags' }],
    ['single-return block body', 'arr.flatMap(i => { return i.tags })', { kind: 'field', field: 'tags' }],
    ['tuple of fields', 'arr.flatMap(i => [i.a, i.b])', { kind: 'tuple', elements: [{ kind: 'field', field: 'a' }, { kind: 'field', field: 'b' }] }],
    ['tuple self + field', 'arr.flatMap(i => [i, i.tags])', { kind: 'tuple', elements: [{ kind: 'self' }, { kind: 'field', field: 'tags' }] }],
  ]
  for (const [label, expr, projection] of accepted) {
    test(`${label} — lowers to a flatMap array-method`, () => {
      const result = parseExpression(expr)
      expect(result.kind).toBe('array-method')
      if (result.kind === 'array-method' && result.method === 'flatMap') {
        expect(result.flatMapOp.projection).toEqual(projection)
      } else {
        throw new Error(`expected a flatMap array-method, got ${result.kind}`)
      }
    })
  }

  // Out of catalogue → refused (BF101 + @client hint).
  const refused = [
    ['deep field access', 'arr.flatMap(i => i.a.b)'],
    ['index/array callback params', 'arr.flatMap((i, idx) => i.tags)'],
    // Tuple with a non-leaf element (arithmetic / literal / deep access).
    ['tuple with arithmetic element', 'arr.flatMap(i => [i.a, i.b + 1])'],
    ['tuple with literal element', 'arr.flatMap(i => [i.a, "x"])'],
    ['tuple with deep access', 'arr.flatMap(i => [i.a, i.b.c])'],
    ['tuple with spread', 'arr.flatMap(i => [...i.a])'],
    // Empty tuple is a degenerate no-op — refused so emitters never
    // produce a zero-arg `flat_map_tuple` call.
    ['empty tuple', 'arr.flatMap(i => [])'],
    // Wrong-arity forms are intercepted by the same arm (not the generic
    // "flatMap has no template lowering" gate) so the reason stays tailored.
    ['2-arg flatMap(fn, thisArg)', 'arr.flatMap(i => i.tags, ctx)'],
  ]
  for (const [label, expr] of refused) {
    test(`${label} — refuses`, () => {
      const result = parseExpression(expr)
      expect(result.kind).toBe('unsupported')
      if (result.kind === 'unsupported') {
        expect(result.reason).toContain('flatMap shape not supported')
      }
    })
  }

  test('exprToString / stringify round-trip the callback', () => {
    // Scalar projections, plus the array-literal tuple — the round-trip
    // relies on the callback `raw`, so a regression in raw capture would
    // surface here for every projection shape.
    for (const src of [
      'arr.flatMap(i => i.tags)',
      'arr.flatMap(t => t)',
      'arr.flatMap(i => [i.a, i.b])',
      'arr.flatMap(i => [i, i.tags])',
    ]) {
      expect(exprToString(parseExpression(src))).toBe(src)
      expect(stringifyParsedExpr(parseExpression(src))).toBe(src)
    }
  })
})

describe('extractArrowBodyExpression', () => {
  test('extracts the body of a no-arg arrow (the createMemo shape)', () => {
    expect(extractArrowBodyExpression('() => props.value * 10')).toBe('props.value * 10')
  })

  test('returns null for a block-bodied arrow', () => {
    expect(extractArrowBodyExpression('() => { return props.value * 10 }')).toBeNull()
  })

  test('returns null for a non-arrow source', () => {
    expect(extractArrowBodyExpression('props.value * 10')).toBeNull()
  })

  test('handles params with parens/defaults the old regex would mis-split', () => {
    // `\([^)]*\)` stops at the first `)`, so a default value containing a
    // call (`f()`) or a nested arrow desyncs the regex; the AST does not.
    expect(extractArrowBodyExpression('(a = f()) => a + 1')).toBe('a + 1')
    expect(extractArrowBodyExpression('() => xs.map(x => x + 1)')).toBe('xs.map(x => x + 1)')
  })

  test('unwraps redundant parentheses around the arrow', () => {
    expect(extractArrowBodyExpression('(() => props.value)')).toBe('props.value')
  })

  test('returns null when the source is more than one statement', () => {
    expect(extractArrowBodyExpression('() => 1; sideEffect()')).toBeNull()
  })
})

describe('parseProviderObjectLiteral', () => {
  test('classifies the composed-corpus provider shape (accordion/dialog)', () => {
    const members = parseProviderObjectLiteral(
      `{ open: () => props.open ?? false, onOpenChange: props.onOpenChange ?? (() => {}) }`,
    )
    expect(members).toEqual([
      { name: 'open', kind: 'getter', body: 'props.open ?? false' },
      { name: 'onOpenChange', kind: 'function' },
    ])
  })

  test('shorthand members lower as identifier expressions (command)', () => {
    const members = parseProviderObjectLiteral(
      `{ search, onSearchChange: setSearch, filter: filterFn() }`,
    )
    expect(members).toEqual([
      { name: 'search', kind: 'expression', expr: 'search' },
      { name: 'onSearchChange', kind: 'expression', expr: 'setSearch' },
      { name: 'filter', kind: 'expression', expr: 'filterFn()' },
    ])
  })

  test('parameterised and block-bodied arrows are functions, not getters', () => {
    const members = parseProviderObjectLiteral(
      `{ registerItem: (el) => items.add(el), onSelect: (value) => { setValue(value) }, value: () => { return v } }`,
    )
    expect(members).toEqual([
      { name: 'registerItem', kind: 'function' },
      { name: 'onSelect', kind: 'function' },
      { name: 'value', kind: 'function' },
    ])
  })

  test('?? / || fallback chains with a function operand are functions', () => {
    const members = parseProviderObjectLiteral(`{ a: f ?? (() => {}), b: g || fallbackFn }`)
    expect(members).toEqual([
      { name: 'a', kind: 'function' },
      // `g || fallbackFn` — neither side is a function literal, so it
      // stays an expression (the parser can't see identifier types).
      { name: 'b', kind: 'expression', expr: 'g || fallbackFn' },
    ])
  })

  test('string-literal keys keep their text', () => {
    expect(parseProviderObjectLiteral(`{ 'data-x': 1 }`)).toEqual([
      { name: 'data-x', kind: 'expression', expr: '1' },
    ])
  })

  test('method members classify as functions, like block-bodied arrows', () => {
    expect(parseProviderObjectLiteral(`{ open() { return v }, count: 1 }`)).toEqual([
      { name: 'open', kind: 'function' },
      { name: 'count', kind: 'expression', expr: '1' },
    ])
  })

  test('returns null for spread entries, computed keys, and non-objects', () => {
    expect(parseProviderObjectLiteral(`{ ...rest }`)).toBeNull()
    expect(parseProviderObjectLiteral(`{ [key]: 1 }`)).toBeNull()
    expect(parseProviderObjectLiteral(`someValue`)).toBeNull()
    expect(parseProviderObjectLiteral(`[1, 2]`)).toBeNull()
  })

  test('unwraps parentheses around the literal and member values', () => {
    expect(parseProviderObjectLiteral(`({ v: (() => (x)) })`)).toEqual([
      { name: 'v', kind: 'getter', body: '(x)' },
    ])
  })
})

describe('parseStyleObjectEntries', () => {
  test('kebab-cases keys and splits literal vs expression values', () => {
    expect(parseStyleObjectEntries("{ backgroundColor: color, padding: '8px' }")).toEqual([
      { cssKey: 'background-color', kind: 'expr', expr: 'color' },
      { cssKey: 'padding', kind: 'literal', value: '8px' },
    ])
  })

  test('handles signal-getter call values as expressions', () => {
    expect(parseStyleObjectEntries('{ background: bg(), color: fg() }')).toEqual([
      { cssKey: 'background', kind: 'expr', expr: 'bg()' },
      { cssKey: 'color', kind: 'expr', expr: 'fg()' },
    ])
  })

  test('quoted keys are honoured', () => {
    expect(parseStyleObjectEntries("{ 'z-index': '1' }")).toEqual([
      { cssKey: 'z-index', kind: 'literal', value: '1' },
    ])
  })

  test('vendor-prefixed keys keep the leading dash', () => {
    expect(parseStyleObjectEntries("{ WebkitTransform: 'none' }")).toEqual([
      { cssKey: '-webkit-transform', kind: 'literal', value: 'none' },
    ])
    // The `ms` prefix is lowercase in React style keys but the CSS property
    // carries a leading dash (`-ms-transform`), unlike `Webkit`/`Moz`.
    expect(parseStyleObjectEntries("{ msTransform: 'none' }")).toEqual([
      { cssKey: '-ms-transform', kind: 'literal', value: 'none' },
    ])
  })

  test('returns null for unsupported shapes (spread / shorthand / computed)', () => {
    expect(parseStyleObjectEntries('{ ...rest }')).toBeNull()
    expect(parseStyleObjectEntries('{ color }')).toBeNull()
    expect(parseStyleObjectEntries('{ [k]: v }')).toBeNull()
  })

  test('returns null for a non-object source', () => {
    expect(parseStyleObjectEntries('color')).toBeNull()
  })
})
