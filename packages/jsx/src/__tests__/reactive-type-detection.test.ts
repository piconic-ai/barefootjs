/**
 * Type-Based Reactivity Detection Tests
 *
 * Tests that the compiler correctly detects reactive expressions
 * using the Reactive<T> brand type via TypeChecker.
 */

import { describe, test, expect } from 'bun:test'
import ts from 'typescript'
import path from 'path'
import { isReactiveType, containsReactiveExpression, analyzeReactivity } from '../reactivity-checker'
import { analyzeComponent } from '../analyzer'
import { jsxToIR } from '../jsx-to-ir'
import type { IRExpression, IRConditional } from '../types'

// =============================================================================
// Helpers
// =============================================================================

const REACTIVE_TYPES_CONTENT = `
  export type Reactive<T> = T & { readonly __reactive: true };
  export type Signal<T> = [Reactive<() => T>, (v: T | ((prev: T) => T)) => void];
  export type Memo<T> = Reactive<() => T>;
  export declare function createSignal<T>(initial: T): Signal<T>;
  export declare function createMemo<T>(fn: () => T): Memo<T>;

  export interface FieldReturn<V> {
    value: Reactive<() => V>;
    error: Reactive<() => string>;
    touched: Reactive<() => boolean>;
    dirty: Reactive<() => boolean>;
    setValue: (value: V) => void;
    handleInput: (e: Event) => void;
    handleBlur: () => void;
  }

  export interface FormReturn {
    isSubmitting: Reactive<() => boolean>;
    isDirty: Memo<boolean>;
    isValid: Memo<boolean>;
    field: (name: string) => FieldReturn<string>;
  }

  export declare function createForm(): FormReturn;
  export declare function useField(name: string): FieldReturn<string>;
`

/**
 * Create a TypeScript program from source with Reactive<T> brand type definition.
 * Uses the real CompilerHost for lib files with virtual overrides for test files.
 */
function createTestProgram(source: string) {
  const baseDir = path.resolve(__dirname)
  const testFilePath = path.join(baseDir, '_test-virtual.ts')
  const defsFilePath = path.join(baseDir, '_reactive-defs.ts')

  // Prepend import of reactive defs to the source
  const fullSource = `import { createSignal, createMemo, createForm, useField, type FieldReturn, type FormReturn, type Reactive, type Signal, type Memo } from './_reactive-defs';\n${source}`

  const virtualFiles = new Map<string, string>()
  virtualFiles.set(testFilePath, fullSource)
  virtualFiles.set(defsFilePath, REACTIVE_TYPES_CONTENT)

  const compilerOptions: ts.CompilerOptions = {
    target: ts.ScriptTarget.Latest,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    strict: true,
    noEmit: true,
    skipLibCheck: true,
  }

  const defaultHost = ts.createCompilerHost(compilerOptions)

  const host: ts.CompilerHost = {
    ...defaultHost,
    getSourceFile(fileName, languageVersion) {
      const resolved = path.resolve(fileName)
      const content = virtualFiles.get(resolved)
      if (content !== undefined) {
        return ts.createSourceFile(fileName, content, languageVersion, true)
      }
      return defaultHost.getSourceFile(fileName, languageVersion)
    },
    fileExists(fileName) {
      const resolved = path.resolve(fileName)
      if (virtualFiles.has(resolved)) return true
      return defaultHost.fileExists(fileName)
    },
    readFile(fileName) {
      const resolved = path.resolve(fileName)
      const content = virtualFiles.get(resolved)
      if (content !== undefined) return content
      return defaultHost.readFile(fileName)
    },
  }

  const program = ts.createProgram([testFilePath], compilerOptions, host)
  const sourceFile = program.getSourceFile(testFilePath)!
  const checker = program.getTypeChecker()

  return { program, sourceFile, checker }
}

/**
 * Find the first expression node matching a predicate in the AST.
 */
function findNode(root: ts.Node, predicate: (node: ts.Node) => boolean): ts.Node | undefined {
  if (predicate(root)) return root
  return ts.forEachChild(root, child => findNode(child, predicate))
}

/**
 * Compile source and return the IR, checking for reactive flags.
 */
function compileToIR(source: string) {
  const ctx = analyzeComponent(source, 'Test.tsx')
  const ir = jsxToIR(ctx)
  return { ctx, ir, errors: ctx.errors }
}

/**
 * Walk IR tree to find all expression nodes.
 */
function findIRExpressions(node: any): IRExpression[] {
  const results: IRExpression[] = []
  if (!node) return results

  if (node.type === 'expression') {
    results.push(node)
  }
  if (node.type === 'conditional') {
    results.push(...findIRExpressions(node.whenTrue))
    results.push(...findIRExpressions(node.whenFalse))
  }
  if (node.children) {
    for (const child of node.children) {
      results.push(...findIRExpressions(child))
    }
  }
  return results
}

/**
 * Find IR conditionals in tree.
 */
function findIRConditionals(node: any): IRConditional[] {
  const results: IRConditional[] = []
  if (!node) return results

  if (node.type === 'conditional') {
    results.push(node)
    results.push(...findIRConditionals(node.whenTrue))
    results.push(...findIRConditionals(node.whenFalse))
  }
  if (node.children) {
    for (const child of node.children) {
      results.push(...findIRConditionals(child))
    }
  }
  return results
}

// =============================================================================
// Unit Tests: isReactiveType
// =============================================================================

describe('isReactiveType', () => {
  test('detects Reactive<() => T> branded type', () => {
    const { sourceFile, checker } = createTestProgram(`
      const [count, setCount] = createSignal(0);
      const x = count;
    `)

    // Find the 'count' identifier in 'const x = count'
    const xDecl = findNode(sourceFile, node =>
      ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.name.text === 'x'
    ) as ts.VariableDeclaration | undefined

    expect(xDecl).toBeDefined()
    const initExpr = xDecl!.initializer!
    const type = checker.getTypeAtLocation(initExpr)
    expect(isReactiveType(type)).toBe(true)
  })

  test('does not detect plain function type', () => {
    const { sourceFile, checker } = createTestProgram(`
      function plainFn(): number { return 42; }
      const x = plainFn;
    `)

    const xDecl = findNode(sourceFile, node =>
      ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.name.text === 'x'
    ) as ts.VariableDeclaration | undefined

    expect(xDecl).toBeDefined()
    const type = checker.getTypeAtLocation(xDecl!.initializer!)
    expect(isReactiveType(type)).toBe(false)
  })
})

// =============================================================================
// Unit Tests: containsReactiveExpression
// =============================================================================

describe('containsReactiveExpression', () => {
  test('signal getter call — count() is reactive', () => {
    const { sourceFile, checker } = createTestProgram(`
      const [count, setCount] = createSignal(0);
      const result = count();
    `)

    const resultDecl = findNode(sourceFile, node =>
      ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.name.text === 'result'
    ) as ts.VariableDeclaration | undefined

    expect(resultDecl).toBeDefined()
    expect(containsReactiveExpression(resultDecl!.initializer!, checker)).toBe(true)
  })

  test('memo call — doubled() is reactive', () => {
    const { sourceFile, checker } = createTestProgram(`
      const [count, setCount] = createSignal(0);
      const doubled = createMemo(() => count() * 2);
      const result = doubled();
    `)

    const resultDecl = findNode(sourceFile, node =>
      ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.name.text === 'result'
    ) as ts.VariableDeclaration | undefined

    expect(resultDecl).toBeDefined()
    expect(containsReactiveExpression(resultDecl!.initializer!, checker)).toBe(true)
  })

  test('method on branded object — username.error() is reactive', () => {
    const { sourceFile, checker } = createTestProgram(`
      const username = useField('username');
      const result = username.error();
    `)

    const resultDecl = findNode(sourceFile, node =>
      ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.name.text === 'result'
    ) as ts.VariableDeclaration | undefined

    expect(resultDecl).toBeDefined()
    expect(containsReactiveExpression(resultDecl!.initializer!, checker)).toBe(true)
  })

  test('method on form — form.isSubmitting() is reactive', () => {
    const { sourceFile, checker } = createTestProgram(`
      const form = createForm();
      const result = form.isSubmitting();
    `)

    const resultDecl = findNode(sourceFile, node =>
      ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.name.text === 'result'
    ) as ts.VariableDeclaration | undefined

    expect(resultDecl).toBeDefined()
    expect(containsReactiveExpression(resultDecl!.initializer!, checker)).toBe(true)
  })

  test('form.field().value() — nested reactive access', () => {
    const { sourceFile, checker } = createTestProgram(`
      const form = createForm();
      const field = form.field('email');
      const result = field.value();
    `)

    const resultDecl = findNode(sourceFile, node =>
      ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.name.text === 'result'
    ) as ts.VariableDeclaration | undefined

    expect(resultDecl).toBeDefined()
    expect(containsReactiveExpression(resultDecl!.initializer!, checker)).toBe(true)
  })

  test('string literal — not reactive', () => {
    const { sourceFile, checker } = createTestProgram(`
      const result = "hello";
    `)

    const resultDecl = findNode(sourceFile, node =>
      ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.name.text === 'result'
    ) as ts.VariableDeclaration | undefined

    expect(resultDecl).toBeDefined()
    expect(containsReactiveExpression(resultDecl!.initializer!, checker)).toBe(false)
  })

  test('static function call — formatDate(today) is not reactive', () => {
    const { sourceFile, checker } = createTestProgram(`
      function formatDate(d: string): string { return d; }
      const today = "2024-01-01";
      const result = formatDate(today);
    `)

    const resultDecl = findNode(sourceFile, node =>
      ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.name.text === 'result'
    ) as ts.VariableDeclaration | undefined

    expect(resultDecl).toBeDefined()
    expect(containsReactiveExpression(resultDecl!.initializer!, checker)).toBe(false)
  })

  test('signal reference (not called) — count itself is reactive', () => {
    const { sourceFile, checker } = createTestProgram(`
      const [count, setCount] = createSignal(0);
      const ref = count;
    `)

    const refDecl = findNode(sourceFile, node =>
      ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.name.text === 'ref'
    ) as ts.VariableDeclaration | undefined

    expect(refDecl).toBeDefined()
    expect(containsReactiveExpression(refDecl!.initializer!, checker)).toBe(true)
  })

  test('binary expression with reactive — count() > 0 is reactive', () => {
    const { sourceFile, checker } = createTestProgram(`
      const [count, setCount] = createSignal(0);
      const result = count() > 0;
    `)

    const resultDecl = findNode(sourceFile, node =>
      ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.name.text === 'result'
    ) as ts.VariableDeclaration | undefined

    expect(resultDecl).toBeDefined()
    expect(containsReactiveExpression(resultDecl!.initializer!, checker)).toBe(true)
  })

  test('setter function — setCount is not reactive', () => {
    const { sourceFile, checker } = createTestProgram(`
      const [count, setCount] = createSignal(0);
      const ref = setCount;
    `)

    const refDecl = findNode(sourceFile, node =>
      ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.name.text === 'ref'
    ) as ts.VariableDeclaration | undefined

    expect(refDecl).toBeDefined()
    expect(containsReactiveExpression(refDecl!.initializer!, checker)).toBe(false)
  })
})

// =============================================================================
// Unit Tests: analyzeReactivity (rich reasoning)
// =============================================================================

describe('analyzeReactivity', () => {
  function initializerOf(sourceFile: ts.SourceFile, name: string): ts.Expression {
    const decl = findNode(sourceFile, node =>
      ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.name.text === name
    ) as ts.VariableDeclaration | undefined
    if (!decl?.initializer) throw new Error(`no initializer for ${name}`)
    return decl.initializer
  }

  test('signal call — reason: brand via callee', () => {
    const { sourceFile, checker } = createTestProgram(`
      const [count, setCount] = createSignal(0);
      const result = count();
    `)
    const analysis = analyzeReactivity(initializerOf(sourceFile, 'result'), checker)

    expect(analysis.isReactive).toBe(true)
    expect(analysis.reason.kind).toBe('brand')
    if (analysis.reason.kind === 'brand') {
      expect(analysis.reason.via).toBe('callee')
      expect(analysis.reason.nodeText).toBe('count()')
    }
  })

  test('bare signal reference — reason: brand via identifier', () => {
    const { sourceFile, checker } = createTestProgram(`
      const [count, setCount] = createSignal(0);
      const ref = count;
    `)
    const analysis = analyzeReactivity(initializerOf(sourceFile, 'ref'), checker)

    expect(analysis.isReactive).toBe(true)
    expect(analysis.reason.kind).toBe('brand')
    if (analysis.reason.kind === 'brand') {
      expect(analysis.reason.via).toBe('identifier')
      expect(analysis.reason.nodeText).toBe('count')
    }
  })

  test('method call on branded object — reason: brand via callee', () => {
    const { sourceFile, checker } = createTestProgram(`
      const username = useField('username');
      const result = username.error();
    `)
    const analysis = analyzeReactivity(initializerOf(sourceFile, 'result'), checker)

    expect(analysis.isReactive).toBe(true)
    expect(analysis.reason.kind).toBe('brand')
    if (analysis.reason.kind === 'brand') {
      expect(analysis.reason.via).toBe('callee')
      expect(analysis.reason.nodeText).toBe('username.error()')
    }
  })

  test('reactive inside non-reactive call — reason: child via sub-expression', () => {
    const { sourceFile, checker } = createTestProgram(`
      function formatDate(d: number): string { return String(d); }
      const [count, setCount] = createSignal(0);
      const result = formatDate(count());
    `)
    const analysis = analyzeReactivity(initializerOf(sourceFile, 'result'), checker)

    expect(analysis.isReactive).toBe(true)
    expect(analysis.reason.kind).toBe('child')
    if (analysis.reason.kind === 'child') {
      expect(analysis.reason.via).toBe('sub-expression')
      expect(analysis.reason.childText).toBe('count()')
      expect(analysis.reason.childReason.kind).toBe('brand')
    }
  })

  test('binary expression with reactive operand — reason: child via sub-expression', () => {
    const { sourceFile, checker } = createTestProgram(`
      const [count, setCount] = createSignal(0);
      const result = count() > 0;
    `)
    const analysis = analyzeReactivity(initializerOf(sourceFile, 'result'), checker)

    expect(analysis.isReactive).toBe(true)
    expect(analysis.reason.kind).toBe('child')
    if (analysis.reason.kind === 'child') {
      expect(analysis.reason.childText).toBe('count()')
      expect(analysis.reason.childReason.kind).toBe('brand')
      if (analysis.reason.childReason.kind === 'brand') {
        expect(analysis.reason.childReason.via).toBe('callee')
      }
    }
  })

  test('string literal — reason: not-reactive', () => {
    const { sourceFile, checker } = createTestProgram(`
      const result = "hello";
    `)
    const analysis = analyzeReactivity(initializerOf(sourceFile, 'result'), checker)

    expect(analysis.isReactive).toBe(false)
    expect(analysis.reason.kind).toBe('not-reactive')
  })

  test('setter function — reason: not-reactive', () => {
    const { sourceFile, checker } = createTestProgram(`
      const [count, setCount] = createSignal(0);
      const ref = setCount;
    `)
    const analysis = analyzeReactivity(initializerOf(sourceFile, 'ref'), checker)

    expect(analysis.isReactive).toBe(false)
    expect(analysis.reason.kind).toBe('not-reactive')
  })
})

// =============================================================================
// Integration Tests: IR reactivity detection through full compilation
// =============================================================================

describe('IR reactivity detection', () => {
  test('signal getter in JSX expression is marked reactive', () => {
    const source = `
      'use client'
      import { createSignal } from '@barefootjs/client-runtime'

      export function Counter() {
        const [count, setCount] = createSignal(0)
        return <div>{count()}</div>
      }
    `

    const { ir } = compileToIR(source)
    expect(ir).toBeDefined()

    const exprs = findIRExpressions(ir!)
    const countExpr = exprs.find(e => e.expr.includes('count()'))
    expect(countExpr).toBeDefined()
    expect(countExpr!.reactive).toBe(true)
  })

  test('memo in JSX expression is marked reactive', () => {
    const source = `
      'use client'
      import { createSignal, createMemo } from '@barefootjs/client-runtime'

      export function Counter() {
        const [count, setCount] = createSignal(0)
        const doubled = createMemo(() => count() * 2)
        return <div>{doubled()}</div>
      }
    `

    const { ir } = compileToIR(source)
    expect(ir).toBeDefined()

    const exprs = findIRExpressions(ir!)
    const memoExpr = exprs.find(e => e.expr.includes('doubled()'))
    expect(memoExpr).toBeDefined()
    expect(memoExpr!.reactive).toBe(true)
  })

  test('static text in JSX is not reactive', () => {
    const source = `
      export function Static() {
        const message = "hello"
        return <div>{message}</div>
      }
    `

    const { ir } = compileToIR(source)
    expect(ir).toBeDefined()

    const exprs = findIRExpressions(ir!)
    const msgExpr = exprs.find(e => e.expr === 'message')
    // Static constants not referencing signals should not be reactive
    expect(msgExpr).toBeDefined()
    expect(msgExpr!.reactive).toBe(false)
  })

  test('ternary with signal condition is marked reactive', () => {
    const source = `
      'use client'
      import { createSignal } from '@barefootjs/client-runtime'

      export function Toggle() {
        const [on, setOn] = createSignal(false)
        return <div>{on() ? "yes" : "no"}</div>
      }
    `

    const { ir } = compileToIR(source)
    expect(ir).toBeDefined()

    const conditionals = findIRConditionals(ir!)
    expect(conditionals.length).toBeGreaterThan(0)
    expect(conditionals[0].reactive).toBe(true)
  })

  test('props reference in JSX is marked reactive', () => {
    const source = `
      'use client'
      import { createSignal } from '@barefootjs/client-runtime'

      export function Display(props: { label: string }) {
        const [count, setCount] = createSignal(0)
        return <div>{props.label}</div>
      }
    `

    const { ir } = compileToIR(source)
    expect(ir).toBeDefined()

    const exprs = findIRExpressions(ir!)
    const propsExpr = exprs.find(e => e.expr.includes('props.label'))
    expect(propsExpr).toBeDefined()
    expect(propsExpr!.reactive).toBe(true)
  })

  test('tainted constant — const derived from signal is reactive', () => {
    const source = `
      'use client'
      import { createSignal } from '@barefootjs/client-runtime'

      export function Counter() {
        const [count, setCount] = createSignal(0)
        const label = count() > 0 ? "positive" : "zero"
        return <div>{label}</div>
      }
    `

    const { ir } = compileToIR(source)
    expect(ir).toBeDefined()

    const exprs = findIRExpressions(ir!)
    const labelExpr = exprs.find(e => e.expr === 'label')
    expect(labelExpr).toBeDefined()
    expect(labelExpr!.reactive).toBe(true)
  })
})
