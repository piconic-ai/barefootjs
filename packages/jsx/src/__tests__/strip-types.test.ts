import { describe, test, expect } from 'bun:test'
import ts from 'typescript'
import { collectAllTypeRanges, reconstructWithoutTypes } from '../strip-types'

/**
 * Helper: parse a TypeScript expression and return it with types stripped.
 */
function strip(code: string): string {
  const sourceFile = ts.createSourceFile('test.ts', code, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  const ranges = collectAllTypeRanges(sourceFile)
  return reconstructWithoutTypes(sourceFile, sourceFile, ranges).trim()
}

/**
 * Helper: parse a TypeScript snippet, find the first expression statement,
 * and print it without types. Useful for testing single expressions.
 */
function stripExpr(code: string): string {
  const sourceFile = ts.createSourceFile('test.ts', code, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  const ranges = collectAllTypeRanges(sourceFile)
  const stmt = sourceFile.statements[0]
  if (ts.isExpressionStatement(stmt)) {
    return reconstructWithoutTypes(stmt.expression, sourceFile, ranges)
  }
  // For variable declarations
  if (ts.isVariableStatement(stmt)) {
    return reconstructWithoutTypes(stmt, sourceFile, ranges)
  }
  return reconstructWithoutTypes(stmt, sourceFile, ranges)
}

describe('strip-types', () => {
  describe('parameter type annotations', () => {
    test('strips type from arrow function parameter', () => {
      expect(stripExpr('(newValue: string) => { setVal(newValue) }')).toBe(
        '(newValue) => { setVal(newValue) }'
      )
    })

    test('strips multiple parameter types', () => {
      expect(stripExpr('(e: Event, idx: number) => { handle(e, idx) }')).toBe(
        '(e, idx) => { handle(e, idx) }'
      )
    })

    test('strips union type from parameter', () => {
      expect(stripExpr('(id: number | undefined) => { use(id) }')).toBe(
        '(id) => { use(id) }'
      )
    })

    test('issue #496: strips string literal union type from parameter', () => {
      expect(stripExpr("(key: 'amount' | 'status') => items()[0][key]")).toBe(
        "(key) => items()[0][key]"
      )
    })

    test('strips complex generic type from parameter', () => {
      expect(stripExpr('(items: Array<{id: number}>) => items.length')).toBe(
        '(items) => items.length'
      )
    })

    test('strips optional parameter type annotation (issue #544)', () => {
      expect(stripExpr('(x?: string) => x')).toBe('(x) => x')
    })

    test('strips optional parameter with union type', () => {
      expect(stripExpr('(x?: string | undefined) => x')).toBe('(x) => x')
    })

    test('strips mixed required and optional parameters', () => {
      expect(stripExpr('(a: number, b?: string) => a')).toBe('(a, b) => a')
    })

    test('strips optional parameter with return type', () => {
      expect(stripExpr('(x?: number): string => String(x)')).toBe(
        '(x) => String(x)'
      )
    })
  })

  describe('type assertions (as)', () => {
    test('strips simple type assertion', () => {
      expect(stripExpr('e.target as HTMLElement')).toBe('e.target')
    })

    test('strips union type assertion', () => {
      expect(stripExpr('document.activeElement as HTMLElement | null')).toBe(
        'document.activeElement'
      )
    })

    test('strips 3+ union type assertion', () => {
      expect(stripExpr('value as string | number | null')).toBe('value')
    })

    test('strips generic + union type assertion', () => {
      expect(stripExpr('value as Set<string> | null')).toBe('value')
    })

    test('strips type assertion in method call (issue #308)', () => {
      expect(
        stripExpr('someElement.closest(\'[data-slot="trigger"]\') as HTMLElement | null')
      ).toBe('someElement.closest(\'[data-slot="trigger"]\')')
    })

    test('strips string literal type assertion', () => {
      expect(
        stripExpr("handleOrientationClasses[groupDir as 'horizontal' | 'vertical']")
      ).toBe('handleOrientationClasses[groupDir]')
    })

    test('strips single string literal type assertion', () => {
      expect(stripExpr("value as 'active'")).toBe('value')
    })
  })

  describe('non-null assertions', () => {
    test('strips non-null assertion', () => {
      expect(stripExpr('element!')).toBe('element')
    })

    test('strips chained non-null assertion', () => {
      expect(stripExpr('obj!.method()!.value')).toBe('obj.method().value')
    })

    test('does not strip !== operator', () => {
      expect(stripExpr('x !== y')).toBe('x !== y')
    })

    test('does not strip != operator', () => {
      expect(stripExpr('x != y')).toBe('x != y')
    })
  })

  describe('arrow function return types', () => {
    test('strips return type from arrow function', () => {
      expect(stripExpr('(x: number): number => x * 2')).toBe('(x) => x * 2')
    })

    test('strips void return type', () => {
      expect(stripExpr('(): void => { doSomething() }')).toBe('() => { doSomething() }')
    })
  })

  describe('generic type arguments', () => {
    test('strips generic from new expression', () => {
      expect(stripExpr('new Set<string>()')).toBe('new Set()')
    })

    test('strips generic from call expression', () => {
      expect(stripExpr('createSignal<number>(0)')).toBe('createSignal(0)')
    })

    test('strips multi-param generic', () => {
      expect(stripExpr('new Map<string, number>()')).toBe('new Map()')
    })
  })

  describe('variable declarations', () => {
    test('strips type annotation with initializer', () => {
      expect(strip("let x: string = ''")).toBe("let x = ''")
    })

    test('strips const type annotation with initializer', () => {
      expect(strip('const count: number = 0')).toBe('const count = 0')
    })

    test('strips type annotation without initializer', () => {
      expect(strip('let enterExitClass: string')).toBe('let enterExitClass')
    })

    test('strips union type without initializer', () => {
      expect(strip('let x: number | null')).toBe('let x')
    })

    test('strips complex generic type without initializer', () => {
      expect(strip('let timer: ReturnType<typeof setTimeout> | null')).toBe('let timer')
    })
  })

  describe('satisfies expression', () => {
    test('strips satisfies', () => {
      expect(stripExpr('value satisfies Record<string, unknown>')).toBe('value')
    })
  })

  describe('angle-bracket type assertion', () => {
    test('strips angle-bracket assertion (non-TSX)', () => {
      // Angle-bracket assertions are only valid in .ts files, not .tsx
      const code = '<HTMLElement>element'
      const sourceFile = ts.createSourceFile('test.ts', code, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)
      const ranges = collectAllTypeRanges(sourceFile)
      const stmt = sourceFile.statements[0]
      if (ts.isExpressionStatement(stmt)) {
        expect(reconstructWithoutTypes(stmt.expression, sourceFile, ranges)).toBe('element')
      }
    })
  })

  describe('object properties are not stripped', () => {
    test('does not strip identifier values in object properties', () => {
      expect(
        stripExpr('({ onCheckedChange: setAccepted, class: "mt-px" })')
      ).toBe('({ onCheckedChange: setAccepted, class: "mt-px" })')
    })

    test('does not strip callback values in object properties', () => {
      expect(
        stripExpr('({ get open() { return open() }, onOpenChange: setOpen, duration: 10000 })')
      ).toBe('({ get open() { return open() }, onOpenChange: setOpen, duration: 10000 })')
    })
  })

  describe('combined constructs', () => {
    test('strips parameter types and return type together', () => {
      expect(stripExpr('(a: number, b: string): boolean => a > 0')).toBe(
        '(a, b) => a > 0'
      )
    })

    test('strips nested type assertions', () => {
      expect(stripExpr('(e.target as HTMLInputElement).value as string')).toBe(
        '(e.target).value'
      )
    })

    test('strips types in complex callback with object properties', () => {
      expect(
        stripExpr("{ onValueChange: (newValue: string) => { setVal(newValue) } }")
      ).toBe('{ onValueChange: (newValue) => { setVal(newValue) } }')
    })
  })
})
