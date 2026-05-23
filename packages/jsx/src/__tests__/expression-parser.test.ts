import { describe, test, expect } from 'bun:test'
import ts from 'typescript'
import { parseExpression, isSupported, exprToString, parseBlockBody } from '../expression-parser'
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
        expect(result.param).toBe('x')
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
        // Predicate: `(_t.name ?? 'anon').startsWith('a')`.
        expect(result.predicate.kind).toBe('call')
        if (result.predicate.kind === 'call') {
          expect(result.predicate.callee.kind).toBe('member')
          if (result.predicate.callee.kind === 'member') {
            expect(result.predicate.callee.property).toBe('startsWith')
            expect(result.predicate.callee.object.kind).toBe('logical')
            if (result.predicate.callee.object.kind === 'logical') {
              expect(result.predicate.callee.object.op).toBe('??')
              expect(result.predicate.callee.object.right.kind).toBe('literal')
              if (result.predicate.callee.object.right.kind === 'literal') {
                expect(result.predicate.callee.object.right.value).toBe('anon')
              }
            }
          }
        }
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
