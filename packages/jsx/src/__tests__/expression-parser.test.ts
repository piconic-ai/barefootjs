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
