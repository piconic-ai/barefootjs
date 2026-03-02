/**
 * BarefootJS Compiler - Analyzer Context
 *
 * Context object for single-pass AST analysis.
 */

import ts from 'typescript'
import type {
  SignalInfo,
  MemoInfo,
  EffectInfo,
  OnMountInfo,
  ImportInfo,
  FunctionInfo,
  ConstantInfo,
  TypeDefinition,
  TypeInfo,
  CompilerError,
  SourceLocation,
  ParamInfo,
} from './types'
import { type ExcludeRange, collectAllTypeRanges, reconstructWithoutTypes } from './strip-types'

/**
 * Deferred info for BF043 (props destructuring warning).
 * Recorded during extractProps(), emitted only for stateful components in validateContext().
 */
export interface PropsDestructuringInfo {
  loc: SourceLocation
  hasIgnoreDirective: boolean
}

/**
 * Represents an if statement with a JSX return in a component function.
 */
export interface ConditionalReturn {
  /** The condition expression node */
  condition: ts.Expression
  /** The JSX return statement found in the if block */
  jsxReturn: ts.JsxElement | ts.JsxFragment | ts.JsxSelfClosingElement
  /** Variables declared in the if block scope */
  scopeVariables: ts.VariableDeclaration[]
  /** The original if statement node */
  ifStatement: ts.IfStatement
}

export interface AnalyzerContext {
  sourceFile: ts.SourceFile
  filePath: string

  // Component info
  componentName: string | null
  componentNode: ts.FunctionDeclaration | ts.ArrowFunction | null
  hasDefaultExport: boolean

  // Collected data
  signals: SignalInfo[]
  memos: MemoInfo[]
  effects: EffectInfo[]
  onMounts: OnMountInfo[]
  imports: ImportInfo[]
  localFunctions: FunctionInfo[]
  localConstants: ConstantInfo[]
  typeDefinitions: TypeDefinition[]

  // Props
  propsType: TypeInfo | null
  propsParams: ParamInfo[]
  propsObjectName: string | null
  restPropsName: string | null
  /** Keys that can be statically expanded from rest props (closed type) */
  restPropsExpandedKeys: string[]
  /** Deferred BF043 info; emitted only for stateful components in validateContext() */
  propsDestructuring: PropsDestructuringInfo | null

  // JSX return
  jsxReturn: ts.JsxElement | ts.JsxFragment | ts.JsxSelfClosingElement | null

  // Conditional returns (if statements with JSX returns)
  conditionalReturns: ConditionalReturn[]

  // Errors
  errors: CompilerError[]

  // Directive
  hasUseClientDirective: boolean

  // Pre-computed type ranges for type stripping
  typeExcludeRanges: ExcludeRange[]

  /** TypeScript type checker for type-based reactivity detection (null = regex fallback) */
  checker: ts.TypeChecker | null

  /** Return node text with TypeScript type syntax removed. */
  getJS(node: ts.Node): string
}

export function createAnalyzerContext(
  sourceFile: ts.SourceFile,
  filePath: string
): AnalyzerContext {
  return {
    sourceFile,
    filePath,

    componentName: null,
    componentNode: null,
    hasDefaultExport: false,

    signals: [],
    memos: [],
    effects: [],
    onMounts: [],
    imports: [],
    localFunctions: [],
    localConstants: [],
    typeDefinitions: [],

    propsType: null,
    propsParams: [],
    propsObjectName: null,
    restPropsName: null,
    restPropsExpandedKeys: [],
    propsDestructuring: null,

    jsxReturn: null,
    conditionalReturns: [],

    errors: [],

    hasUseClientDirective: false,

    typeExcludeRanges: collectAllTypeRanges(sourceFile),
    checker: null,
    getJS(node: ts.Node): string {
      return reconstructWithoutTypes(node, sourceFile, this.typeExcludeRanges)
    },
  }
}

// =============================================================================
// Source Location Helper
// =============================================================================

export function getSourceLocation(
  node: ts.Node,
  sourceFile: ts.SourceFile,
  filePath: string
): SourceLocation {
  const start = sourceFile.getLineAndCharacterOfPosition(node.getStart())
  const end = sourceFile.getLineAndCharacterOfPosition(node.getEnd())

  return {
    file: filePath,
    start: {
      line: start.line + 1, // 1-indexed
      column: start.character,
    },
    end: {
      line: end.line + 1,
      column: end.character,
    },
  }
}

// =============================================================================
// Type Helpers
// =============================================================================

export function typeNodeToTypeInfo(
  typeNode: ts.TypeNode | undefined,
  sourceFile: ts.SourceFile
): TypeInfo | null {
  if (!typeNode) return null

  const raw = typeNode.getText(sourceFile)

  // Primitive types (check by SyntaxKind)
  switch (typeNode.kind) {
    case ts.SyntaxKind.StringKeyword:
      return { kind: 'primitive', raw, primitive: 'string' }
    case ts.SyntaxKind.NumberKeyword:
      return { kind: 'primitive', raw, primitive: 'number' }
    case ts.SyntaxKind.BooleanKeyword:
      return { kind: 'primitive', raw, primitive: 'boolean' }
    case ts.SyntaxKind.NullKeyword:
      return { kind: 'primitive', raw, primitive: 'null' }
    case ts.SyntaxKind.UndefinedKeyword:
      return { kind: 'primitive', raw, primitive: 'undefined' }
  }

  // Array types
  if (ts.isArrayTypeNode(typeNode)) {
    return {
      kind: 'array',
      raw,
      elementType: typeNodeToTypeInfo(typeNode.elementType, sourceFile) ?? {
        kind: 'unknown',
        raw: 'unknown',
      },
    }
  }

  // Union types
  if (ts.isUnionTypeNode(typeNode)) {
    return {
      kind: 'union',
      raw,
      unionTypes: typeNode.types.map(
        (t) =>
          typeNodeToTypeInfo(t, sourceFile) ?? { kind: 'unknown', raw: 'unknown' }
      ),
    }
  }

  // Type literal (object type)
  if (ts.isTypeLiteralNode(typeNode)) {
    return {
      kind: 'object',
      raw,
      properties: typeNode.members
        .filter(ts.isPropertySignature)
        .map((member) => ({
          name: member.name?.getText(sourceFile) ?? '',
          type: typeNodeToTypeInfo(member.type, sourceFile) ?? {
            kind: 'unknown',
            raw: 'unknown',
          },
          optional: !!member.questionToken,
          readonly: !!member.modifiers?.some(
            (m) => m.kind === ts.SyntaxKind.ReadonlyKeyword
          ),
        })),
    }
  }

  // Type reference (named type)
  if (ts.isTypeReferenceNode(typeNode)) {
    return {
      kind: 'interface',
      raw,
    }
  }

  // Function type
  if (ts.isFunctionTypeNode(typeNode)) {
    return {
      kind: 'function',
      raw,
      params: typeNode.parameters.map((p) => ({
        name: p.name.getText(sourceFile),
        type: typeNodeToTypeInfo(p.type, sourceFile) ?? {
          kind: 'unknown',
          raw: 'unknown',
        },
        optional: !!p.questionToken,
        defaultValue: p.initializer?.getText(sourceFile),
      })),
      returnType: typeNodeToTypeInfo(typeNode.type, sourceFile) ?? undefined,
    }
  }

  return { kind: 'unknown', raw }
}

// =============================================================================
// AST Helpers
// =============================================================================

export function isPascalCase(name: string): boolean {
  return /^[A-Z][a-zA-Z0-9]*$/.test(name)
}

export function isComponentFunction(
  node: ts.Node
): node is ts.FunctionDeclaration & { name: ts.Identifier } {
  return (
    ts.isFunctionDeclaration(node) &&
    !!node.name &&
    isPascalCase(node.name.text) &&
    !!node.body
  )
}

export function isArrowComponentFunction(
  node: ts.Node
): node is ts.VariableDeclaration & {
  name: ts.Identifier
  initializer: ts.ArrowFunction
} {
  if (!ts.isVariableDeclaration(node)) return false
  if (!ts.isIdentifier(node.name)) return false
  if (!isPascalCase(node.name.text)) return false
  if (!node.initializer || !ts.isArrowFunction(node.initializer)) return false
  return true
}
