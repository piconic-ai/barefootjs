/**
 * BarefootJS Compiler - JSX to Pure IR Transformer
 *
 * Transforms TypeScript JSX AST to Pure IR (JSX-independent JSON structure).
 */

import ts from 'typescript'
import type {
  IRNode,
  IRElement,
  IRText,
  IRExpression,
  IRConditional,
  IRLoop,
  IRLoopChildComponent,
  IRComponent,
  IRFragment,
  IRIfStatement,
  IRProvider,
  IRAttribute,
  IREvent,
  IRProp,
  IRTemplateLiteral,
  IRTemplatePart,
  SourceLocation,
  TypeInfo,
} from './types'
import { type AnalyzerContext, getSourceLocation } from './analyzer-context'
import { parseExpression, isSupported, parseBlockBody, type ParsedExpr, type ParsedStatement } from './expression-parser'
import { createError, ErrorCodes } from './errors'
import { containsReactiveExpression } from './reactivity-checker'

// =============================================================================
// Transform Context
// =============================================================================

/** Pre-compiled regex patterns for reactivity detection */
interface ReactivityPatterns {
  signals: { getter: string; pattern: RegExp }[]
  memos: { name: string; pattern: RegExp }[]
  props: { name: string; pattern: RegExp }[]
  constants: { name: string; value: string | undefined; pattern: RegExp }[]
}

interface TransformContext {
  analyzer: AnalyzerContext
  sourceFile: ts.SourceFile
  filePath: string
  slotIdCounter: number
  isRoot: boolean
  insideComponentChildren: boolean
  patterns: ReactivityPatterns
  /** Shortcut for analyzer.getJS(node) */
  getJS(node: ts.Node): string
}

function createTransformContext(analyzer: AnalyzerContext): TransformContext {
  return {
    analyzer,
    sourceFile: analyzer.sourceFile,
    filePath: analyzer.filePath,
    slotIdCounter: 0,
    isRoot: true,
    insideComponentChildren: false,
    patterns: {
      signals: analyzer.signals.map(s => ({
        getter: s.getter,
        pattern: new RegExp(`\\b${s.getter}\\s*\\(`),
      })),
      memos: analyzer.memos.map(m => ({
        name: m.name,
        pattern: new RegExp(`\\b${m.name}\\s*\\(`),
      })),
      props: analyzer.propsParams
        .filter(p => p.name !== 'children')
        .map(p => ({ name: p.name, pattern: new RegExp(`\\b${p.name}\\b`) })),
      constants: analyzer.localConstants.map(c => ({
        name: c.name,
        value: c.value,
        pattern: new RegExp(`\\b${c.name}\\b`),
      })),
    },
    getJS(node: ts.Node): string {
      return analyzer.getJS(node)
    },
  }
}

function generateSlotId(ctx: TransformContext, forComponent: boolean = false): string {
  const id = `s${ctx.slotIdCounter++}`
  // Component elements' own slot IDs never get ^ prefix.
  // The ^ prefix is only for native HTML elements and expressions
  // passed as children into a child component's scope.
  if (forComponent) return id
  return ctx.insideComponentChildren ? `^${id}` : id
}

// =============================================================================
// Main Entry Point
// =============================================================================

export function jsxToIR(analyzer: AnalyzerContext): IRNode | null {
  // If there are conditional returns (if statements with JSX returns),
  // build an if-statement chain instead of a single node
  if (analyzer.conditionalReturns.length > 0) {
    const ctx = createTransformContext(analyzer)
    return buildIfStatementChain(analyzer, ctx)
  }

  if (!analyzer.jsxReturn) return null

  const ctx = createTransformContext(analyzer)
  const ir = transformNode(analyzer.jsxReturn, ctx)

  // Auto-generate scope wrapper for provider-only roots that lack a scope element.
  // When a component returns only a Provider wrapping children (no native HTML element),
  // findScope() would return null during hydration. Wrapping in a synthetic
  // <div style="display:contents"> provides the necessary bf-s anchor.
  if (ir && needsScopeWrapper(ir)) {
    return wrapInScopeElement(ir)
  }

  return ir
}

// =============================================================================
// Auto Scope Wrapper
// =============================================================================

/**
 * Check if the IR root needs a synthetic scope wrapper.
 * Returns true when the root contains a provider with children but has no scope element,
 * meaning hydration would fail because findScope() returns null.
 * Providers without children (self-closing) don't need wrapping since there are
 * no child components to consume the context.
 */
function needsScopeWrapper(ir: IRNode): boolean {
  return hasProviderWithChildren(ir) && !hasRootScopeElement(ir)
}

/**
 * Check if the IR tree contains a provider with children at or near the root.
 */
function hasProviderWithChildren(ir: IRNode): boolean {
  if (ir.type === 'provider') return ir.children.length > 0
  if (ir.type === 'fragment') {
    return ir.children.some(c => hasProviderWithChildren(c))
  }
  return false
}

/**
 * Check if the IR tree already has a scope element at its root level.
 * Walks through providers since they are transparent wrappers.
 */
function hasRootScopeElement(ir: IRNode): boolean {
  switch (ir.type) {
    case 'element':
      return ir.needsScope
    case 'fragment':
      // Comment-based scope marker counts as having a scope
      if (ir.needsScopeComment) return true
      return ir.children.some(c => c.type === 'element' && (c as IRElement).needsScope)
    case 'provider':
      return ir.children.some(c => hasRootScopeElement(c))
    default:
      return false
  }
}

/**
 * Wrap an IR node in a synthetic <div style="display:contents"> scope element.
 * Used when a component has no native HTML element at its root (e.g., provider-only).
 */
function wrapInScopeElement(node: IRNode): IRElement {
  return {
    type: 'element',
    tag: 'div',
    attrs: [{
      name: 'style',
      value: 'display:contents',
      dynamic: false,
      isLiteral: true,
      loc: node.loc,
    }],
    events: [],
    ref: null,
    children: [node],
    slotId: null,
    needsScope: true,
    loc: node.loc,
  }
}

// =============================================================================
// Node Transformation
// =============================================================================

function transformNode(node: ts.Node, ctx: TransformContext): IRNode | null {
  // JSX Element: <div>...</div>
  if (ts.isJsxElement(node)) {
    return transformJsxElement(node, ctx)
  }

  // Self-closing element: <br />
  if (ts.isJsxSelfClosingElement(node)) {
    return transformSelfClosingElement(node, ctx)
  }

  // Fragment: <>...</>
  if (ts.isJsxFragment(node)) {
    return transformFragment(node, ctx)
  }

  // Text content
  if (ts.isJsxText(node)) {
    return transformText(node, ctx)
  }

  // Expression: {expr}
  if (ts.isJsxExpression(node)) {
    return transformExpression(node, ctx)
  }

  return null
}

// =============================================================================
// JSX Element Transformation
// =============================================================================

function transformJsxElement(
  node: ts.JsxElement,
  ctx: TransformContext
): IRNode {
  const tagName = node.openingElement.tagName.getText(ctx.sourceFile)

  // Detect Context.Provider pattern: X.Provider
  if (tagName.endsWith('.Provider') && /^[A-Z]/.test(tagName)) {
    return transformProviderElement(node, ctx, tagName)
  }

  const isComponent = /^[A-Z]/.test(tagName)

  if (isComponent) {
    return transformComponentElement(node, ctx, tagName)
  }

  return transformHtmlElement(node, ctx, tagName)
}

function transformHtmlElement(
  node: ts.JsxElement,
  ctx: TransformContext,
  tagName: string
): IRElement {
  const { attrs, events, ref } = processAttributes(
    node.openingElement.attributes,
    ctx
  )

  // Save isRoot BEFORE processing children (children will set it to false)
  const needsScope = ctx.isRoot
  ctx.isRoot = false

  const children = transformChildren(node.children, ctx)

  // Determine if this element needs a slot ID
  // Elements need slotIds if they have: events, dynamic children, reactive attributes, or refs
  const needsSlot = events.length > 0 || hasDynamicContent(children) || hasReactiveAttributes(attrs, ctx) || ref !== null
  const slotId = needsSlot ? generateSlotId(ctx) : null

  // Propagate slotId to loop children (they need to use parent's marker)
  // This includes loops nested in fragments
  if (slotId) {
    propagateSlotIdToLoops(children, slotId)
  }

  return {
    type: 'element',
    tag: tagName,
    attrs,
    events,
    ref,
    children,
    slotId,
    needsScope,
    loc: getSourceLocation(node, ctx.sourceFile, ctx.filePath),
  }
}

function transformSelfClosingElement(
  node: ts.JsxSelfClosingElement,
  ctx: TransformContext
): IRNode {
  const tagName = node.tagName.getText(ctx.sourceFile)

  // Detect Context.Provider pattern: <X.Provider ... />
  if (tagName.endsWith('.Provider') && /^[A-Z]/.test(tagName)) {
    return transformSelfClosingProviderElement(node, ctx, tagName)
  }

  const isComponent = /^[A-Z]/.test(tagName)

  if (isComponent) {
    return transformSelfClosingComponent(node, ctx, tagName)
  }

  const { attrs, events, ref } = processAttributes(node.attributes, ctx)

  // Elements need slotIds if they have events, reactive attributes, or refs
  const needsSlot = events.length > 0 || hasReactiveAttributes(attrs, ctx) || ref !== null
  const slotId = needsSlot ? generateSlotId(ctx) : null

  const needsScope = ctx.isRoot
  ctx.isRoot = false

  return {
    type: 'element',
    tag: tagName,
    attrs,
    events,
    ref,
    children: [],
    slotId,
    needsScope,
    loc: getSourceLocation(node, ctx.sourceFile, ctx.filePath),
  }
}

// =============================================================================
// Provider Transformation
// =============================================================================

function transformProviderElement(
  node: ts.JsxElement,
  ctx: TransformContext,
  tagName: string
): IRProvider {
  const contextName = tagName.slice(0, -'.Provider'.length)
  const props = processComponentProps(node.openingElement.attributes, ctx)
  const valueProp = props.find(p => p.name === 'value')

  if (!valueProp) {
    throw new Error(`<${tagName}> requires a 'value' prop`)
  }

  const children = transformChildren(node.children, ctx)

  return {
    type: 'provider',
    contextName,
    valueProp,
    children,
    loc: getSourceLocation(node, ctx.sourceFile, ctx.filePath),
  }
}

function transformSelfClosingProviderElement(
  node: ts.JsxSelfClosingElement,
  ctx: TransformContext,
  tagName: string
): IRProvider {
  const contextName = tagName.slice(0, -'.Provider'.length)
  const props = processComponentProps(node.attributes, ctx)
  const valueProp = props.find(p => p.name === 'value')

  if (!valueProp) {
    throw new Error(`<${tagName}> requires a 'value' prop`)
  }

  return {
    type: 'provider',
    contextName,
    valueProp,
    children: [],
    loc: getSourceLocation(node, ctx.sourceFile, ctx.filePath),
  }
}

// =============================================================================
// Component Transformation
// =============================================================================

function transformComponentElement(
  node: ts.JsxElement,
  ctx: TransformContext,
  name: string
): IRComponent {
  const props = processComponentProps(node.openingElement.attributes, ctx)

  // Consume isRoot so it doesn't leak into slot children.
  // Components don't have needsScope; the adapter handles scope placement
  // for root components via isRootOfClientComponent / __instanceId.
  ctx.isRoot = false

  // Mark children as parent-owned so their slot IDs get the ^ prefix.
  // Elements passed as children to a component are owned by the parent scope,
  // not the child component's scope. The ^ prefix tells the runtime to search
  // all descendants (ignoring scope boundaries) when looking up these elements.
  const prevInsideComponentChildren = ctx.insideComponentChildren
  ctx.insideComponentChildren = true
  const children = transformChildren(node.children, ctx)
  ctx.insideComponentChildren = prevInsideComponentChildren

  // Always assign slotId to child components.
  // Even if no reactive props are passed from parent, the child may have internal state
  // (createSignal, createMemo) that requires hydration via findScope().
  // Component slot IDs never get ^ prefix (forComponent=true).
  // ^ is reserved for native elements owned by the parent but rendered in child scope.
  const slotId = generateSlotId(ctx, true)

  // Propagate slotId to loop children so they use the parent's marker
  propagateSlotIdToLoops(children, slotId)

  return {
    type: 'component',
    name,
    props,
    propsType: null, // Will be resolved later
    children,
    template: name.toLowerCase(),
    slotId,
    loc: getSourceLocation(node, ctx.sourceFile, ctx.filePath),
  }
}

function transformSelfClosingComponent(
  node: ts.JsxSelfClosingElement,
  ctx: TransformContext,
  name: string
): IRComponent {
  const props = processComponentProps(node.attributes, ctx)

  // Consume isRoot so it doesn't leak to subsequent siblings.
  // See transformComponentElement for details.
  ctx.isRoot = false

  // Always assign slotId to child components.
  // Even if no reactive props are passed from parent, the child may have internal state
  // (createSignal, createMemo) that requires hydration via findScope().
  // Component slot IDs never get ^ prefix (forComponent=true).
  const slotId = generateSlotId(ctx, true)

  return {
    type: 'component',
    name,
    props,
    propsType: null,
    children: [],
    template: name.toLowerCase(),
    slotId,
    loc: getSourceLocation(node, ctx.sourceFile, ctx.filePath),
  }
}

// =============================================================================
// Fragment Transformation
// =============================================================================

/**
 * Check if a fragment is "transparent" (just passes through children).
 * Pattern: <>{children}</> or <>{props.children}</>
 * Transparent fragments don't need scope markers on their children.
 */
function isTransparentFragment(
  node: ts.JsxFragment,
  ctx: TransformContext
): boolean {
  // Filter out whitespace-only text nodes
  const children = node.children.filter(child => {
    if (ts.isJsxText(child)) {
      return child.text.trim() !== ''
    }
    return true
  })

  // Must have exactly one child
  if (children.length !== 1) return false

  const child = children[0]

  // Child must be a JSX expression
  if (!ts.isJsxExpression(child)) return false
  if (!child.expression) return false

  const exprText = child.expression.getText(ctx.sourceFile)

  // Check for children patterns
  if (exprText === 'children') return true
  if (exprText === 'props.children') return true

  // Check for custom props object name (e.g., p.children)
  const propsName = ctx.analyzer.propsObjectName
  if (propsName && exprText === `${propsName}.children`) {
    return true
  }

  return false
}

function transformFragment(
  node: ts.JsxFragment,
  ctx: TransformContext
): IRFragment {
  // For fragment roots, we need to mark ALL direct element children with needsScope
  // This is because fragments don't render a DOM element, so each child needs the scope marker
  // to enable proper hydration queries across siblings
  const isFragmentRoot = ctx.isRoot

  // Detect transparent fragment (Context Provider pattern)
  const isTransparent = isFragmentRoot && isTransparentFragment(node, ctx)

  // When using comment-based scope, children should NOT get needsScope from ctx.isRoot
  if (isFragmentRoot && !isTransparent) {
    ctx.isRoot = false
  }

  const children = transformChildren(node.children, ctx)

  // Fragment root gets a comment-based scope marker instead of element attributes
  const needsScopeComment = (isFragmentRoot && !isTransparent) || undefined

  return {
    type: 'fragment',
    children,
    transparent: isTransparent || undefined,
    needsScopeComment,
    loc: getSourceLocation(node, ctx.sourceFile, ctx.filePath),
  }
}

// =============================================================================
// Children Transformation
// =============================================================================

function transformChildren(
  children: ts.NodeArray<ts.JsxChild>,
  ctx: TransformContext
): IRNode[] {
  const result: IRNode[] = []

  for (let i = 0; i < children.length; i++) {
    const child = children[i]

    // Skip empty JSX expressions (comments only, no expression content)
    // Note: @client directive is now detected in prefix style within transformExpression()
    if (ts.isJsxExpression(child) && !child.expression) {
      continue
    }

    const transformed = transformNode(child, ctx)
    if (transformed) {
      // Skip empty text nodes
      if (transformed.type === 'text' && transformed.value.trim() === '') {
        continue
      }

      result.push(transformed)
    }
  }

  return result
}

// =============================================================================
// Text Transformation
// =============================================================================

function transformText(node: ts.JsxText, ctx: TransformContext): IRText | null {
  // Normalize whitespace (React-like behavior)
  const text = node.text.replace(/\s+/g, ' ')

  if (text.trim() === '') {
    return null
  }

  return {
    type: 'text',
    value: text,
    loc: getSourceLocation(node, ctx.sourceFile, ctx.filePath),
  }
}

// =============================================================================
// Expression Transformation
// =============================================================================

function transformExpression(
  node: ts.JsxExpression,
  ctx: TransformContext
): IRNode | null {
  if (!node.expression) return null

  const expr = node.expression

  // Check for bare signal/memo identifier (BF044)
  checkBareSignalOrMemoIdentifier(expr, ctx)

  // Check for @client directive in prefix style: {/* @client */ expr}
  // getFullText() includes leading trivia (comments, whitespace)
  const fullText = node.getFullText(ctx.sourceFile)
  const isClientOnly = fullText.includes('@client')

  // Ternary expression: {cond ? a : b}
  if (ts.isConditionalExpression(expr)) {
    const result = transformConditional(expr, ctx)
    if (isClientOnly) {
      result.clientOnly = true
      // Ensure slotId is assigned for client-only expressions
      if (!result.slotId) {
        result.slotId = generateSlotId(ctx)
      }
    }
    return result
  }

  // Logical AND: {cond && <Component />}
  if (ts.isBinaryExpression(expr) && expr.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken) {
    const result = transformLogicalAnd(expr, ctx)
    if (isClientOnly) {
      result.clientOnly = true
      if (!result.slotId) {
        result.slotId = generateSlotId(ctx)
      }
    }
    return result
  }

  // Array map: {items.map(item => <li>{item}</li>)}
  if (ts.isCallExpression(expr) && isMapCall(expr)) {
    return transformMapCall(expr, ctx, isClientOnly)
  }

  // Regular expression
  const exprText = ctx.getJS(expr)
  const reactive = isReactiveExpression(exprText, ctx, expr)
  // @client expressions always need slotId and are treated as reactive for client-side evaluation
  const needsSlot = reactive || isClientOnly
  const slotId = needsSlot ? generateSlotId(ctx) : null

  return {
    type: 'expression',
    expr: exprText,
    typeInfo: inferExpressionType(expr, ctx),
    reactive,
    slotId,
    clientOnly: isClientOnly || undefined,
    loc: getSourceLocation(node, ctx.sourceFile, ctx.filePath),
  }
}

// =============================================================================
// Conditional Transformation
// =============================================================================

function transformConditional(
  node: ts.ConditionalExpression,
  ctx: TransformContext
): IRConditional {
  const condition = ctx.getJS(node.condition)
  const reactive = isReactiveExpression(condition, ctx, node.condition)
  const slotId = reactive ? generateSlotId(ctx) : null

  // Transform both branches
  const whenTrue = transformConditionalBranch(node.whenTrue, ctx)
  const whenFalse = transformConditionalBranch(node.whenFalse, ctx)

  return {
    type: 'conditional',
    condition,
    conditionType: null,
    reactive,
    whenTrue,
    whenFalse,
    slotId,
    loc: getSourceLocation(node, ctx.sourceFile, ctx.filePath),
  }
}

function transformLogicalAnd(
  node: ts.BinaryExpression,
  ctx: TransformContext
): IRConditional {
  const condition = ctx.getJS(node.left)
  const reactive = isReactiveExpression(condition, ctx, node.left)
  const slotId = reactive ? generateSlotId(ctx) : null

  const whenTrue = transformConditionalBranch(node.right, ctx)
  const whenFalse: IRExpression = {
    type: 'expression',
    expr: 'null',
    typeInfo: { kind: 'primitive', raw: 'null', primitive: 'null' },
    reactive: false,
    slotId: null,
    loc: getSourceLocation(node, ctx.sourceFile, ctx.filePath),
  }

  return {
    type: 'conditional',
    condition,
    conditionType: null,
    reactive,
    whenTrue,
    whenFalse,
    slotId,
    loc: getSourceLocation(node, ctx.sourceFile, ctx.filePath),
  }
}

function transformConditionalBranch(
  node: ts.Expression,
  ctx: TransformContext
): IRNode {
  // JSX element
  if (ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node) || ts.isJsxFragment(node)) {
    return transformNode(node, ctx)!
  }

  // Parenthesized expression
  if (ts.isParenthesizedExpression(node)) {
    return transformConditionalBranch(node.expression, ctx)
  }

  // Nested ternary: cond1 ? <A/> : cond2 ? <B/> : <C/>
  if (ts.isConditionalExpression(node)) {
    return transformConditional(node, ctx)
  }

  // Logical AND in branch: cond1 ? <A/> : (cond2 && <B/>)
  if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken) {
    return transformLogicalAnd(node, ctx)
  }

  // Regular expression (including null)
  const exprText = ctx.getJS(node)
  return {
    type: 'expression',
    expr: exprText,
    typeInfo: inferExpressionType(node, ctx),
    reactive: isReactiveExpression(exprText, ctx, node),
    slotId: null,
    loc: getSourceLocation(node, ctx.sourceFile, ctx.filePath),
  }
}

// =============================================================================
// Map Call (Loop) Transformation
// =============================================================================

function isMapCall(node: ts.CallExpression): boolean {
  if (!ts.isPropertyAccessExpression(node.expression)) return false
  return node.expression.name.text === 'map'
}

/**
 * Check if a node is a filter() call.
 * Returns the filter's array expression and callback if it's a filter call.
 */
function isFilterCall(node: ts.Expression): { array: ts.Expression; callback: ts.Expression } | null {
  if (!ts.isCallExpression(node)) return null
  if (!ts.isPropertyAccessExpression(node.expression)) return null
  if (node.expression.name.text !== 'filter') return null
  if (node.arguments.length !== 1) return null

  return {
    array: node.expression.expression,
    callback: node.arguments[0],
  }
}

/**
 * Check if a node is a sort() or toSorted() call.
 * Returns the sort's array expression, callback, and method name.
 */
function isSortCall(node: ts.Expression): { array: ts.Expression; callback: ts.Expression; method: 'sort' | 'toSorted' } | null {
  if (!ts.isCallExpression(node)) return null
  if (!ts.isPropertyAccessExpression(node.expression)) return null
  const methodName = node.expression.name.text
  if (methodName !== 'sort' && methodName !== 'toSorted') return null
  if (node.arguments.length !== 1) return null

  return {
    array: node.expression.expression,
    callback: node.arguments[0],
    method: methodName,
  }
}

/**
 * Sort comparator extraction result.
 */
type SortComparatorResult = {
  paramA: string
  paramB: string
  field: string
  direction: 'asc' | 'desc'
  raw: string
  method: 'sort' | 'toSorted'
}

type SortExtractionResult = {
  result: SortComparatorResult | null
  unsupportedReason?: string
}

/**
 * Extract sort comparator info from an arrow function.
 * Supports simple subtraction patterns:
 *   (a, b) => a.field - b.field  → asc
 *   (a, b) => b.field - a.field  → desc
 */
function extractSortComparator(
  callback: ts.Expression,
  method: 'sort' | 'toSorted',
  ctx: TransformContext
): SortExtractionResult {
  if (!ts.isArrowFunction(callback)) {
    return { result: null, unsupportedReason: 'Sort comparator must be an arrow function' }
  }
  if (callback.parameters.length !== 2) {
    return { result: null, unsupportedReason: 'Sort comparator must have exactly 2 parameters' }
  }

  const paramA = callback.parameters[0].name.getText(ctx.sourceFile)
  const paramB = callback.parameters[1].name.getText(ctx.sourceFile)

  // Must be expression body (not block body)
  if (ts.isBlock(callback.body)) {
    return { result: null, unsupportedReason: 'Block body sort comparators are not supported for server-side rendering' }
  }

  const raw = ctx.getJS(callback.body)

  // Must be a subtraction: a.field - b.field or b.field - a.field
  if (!ts.isBinaryExpression(callback.body) || callback.body.operatorToken.kind !== ts.SyntaxKind.MinusToken) {
    return { result: null, unsupportedReason: `Sort comparator '${raw}' is not a simple subtraction pattern (a.field - b.field)` }
  }

  const left = callback.body.left
  const right = callback.body.right

  // Both sides must be property accesses
  if (!ts.isPropertyAccessExpression(left) || !ts.isPropertyAccessExpression(right)) {
    return { result: null, unsupportedReason: `Sort comparator '${raw}' is not a simple field access pattern` }
  }

  const leftObj = ctx.getJS(left.expression)
  const rightObj = ctx.getJS(right.expression)
  const leftField = left.name.text
  const rightField = right.name.text

  // Fields must match
  if (leftField !== rightField) {
    return { result: null, unsupportedReason: `Sort comparator compares different fields: '${leftField}' vs '${rightField}'` }
  }

  // Determine direction
  let direction: 'asc' | 'desc'
  if (leftObj === paramA && rightObj === paramB) {
    direction = 'asc'
  } else if (leftObj === paramB && rightObj === paramA) {
    direction = 'desc'
  } else {
    return { result: null, unsupportedReason: `Sort comparator '${raw}' does not use the expected parameter pattern` }
  }

  return {
    result: {
      paramA,
      paramB,
      field: leftField,
      direction,
      raw,
      method,
    },
  }
}

/**
 * Result type for extractFilterPredicate.
 * Either has an expression body (predicate) or block body (blockBody).
 */
type FilterPredicateResult = {
  param: string
  predicate?: ParsedExpr        // Expression body
  blockBody?: ParsedStatement[] // Block body
  raw: string
}

/**
 * Extraction result that carries an optional unsupported reason.
 * When unsupportedReason is set, the predicate cannot be compiled to marked template.
 */
type FilterExtractionResult = {
  result: FilterPredicateResult | null
  unsupportedReason?: string
}

/**
 * Extract filter predicate info from an arrow function.
 * Performs early parsing to get ParsedExpr AST (expression body)
 * or ParsedStatement[] (block body).
 *
 * Returns FilterExtractionResult with unsupportedReason when the predicate
 * cannot be compiled to a marked template.
 */
function extractFilterPredicate(
  callback: ts.Expression,
  ctx: TransformContext
): FilterExtractionResult {
  if (!ts.isArrowFunction(callback)) return { result: null }
  if (callback.parameters.length < 1) return { result: null }

  const firstParam = callback.parameters[0]
  if (!ts.isIdentifier(firstParam.name)) return { result: null }

  const param = firstParam.name.getText(ctx.sourceFile)

  // Block body arrow functions: filter(t => { const f = filter(); ... })
  if (ts.isBlock(callback.body)) {
    const raw = ctx.getJS(callback.body)
    const statements = parseBlockBody(callback.body, ctx.sourceFile, (n) => ctx.getJS(n))
    if (!statements) {
      return { result: null, unsupportedReason: 'Block body filter predicate cannot be parsed for server-side rendering' }
    }
    // TODO: Check if all statements are supported for SSR
    // For now, if parseBlockBody succeeds, we assume it's supported
    return { result: { param, blockBody: statements, raw } }
  }

  // Expression body: filter(t => !t.done)
  const raw = ctx.getJS(callback.body)
  const predicate = parseExpression(raw)

  // Check if predicate is supported for SSR
  const support = isSupported(predicate)
  if (!support.supported) {
    return { result: null, unsupportedReason: support.reason }
  }

  return { result: { param, predicate, raw } }
}

function transformMapCall(
  node: ts.CallExpression,
  ctx: TransformContext,
  isClientOnly = false
): IRLoop {
  const propAccess = node.expression as ts.PropertyAccessExpression
  const mapSource = propAccess.expression

  // Detect chaining patterns on .map()'s source expression:
  // 1. sort().map() or toSorted().map()
  // 2. filter().map()
  // 3. filter().sort().map()  (outermost = sort, inner = filter)
  // 4. sort().filter().map()  (outermost = filter, inner = sort)

  let array: string
  let filterPredicate: FilterPredicateResult | undefined
  let sortComparator: SortComparatorResult | undefined
  let chainOrder: 'filter-sort' | 'sort-filter' | undefined

  const filterInfo = isFilterCall(mapSource)
  const sortInfo = isSortCall(mapSource)

  if (sortInfo) {
    // Outermost is sort: could be sort().map() or filter().sort().map()
    const innerFilter = isFilterCall(sortInfo.array)

    // Handle sort comparator extraction
    const sortExtraction = extractSortComparator(sortInfo.callback, sortInfo.method, ctx)
    if (isClientOnly || !sortExtraction.result) {
      if (!isClientOnly && sortExtraction.unsupportedReason) {
        ctx.analyzer.errors.push(
          createError(ErrorCodes.UNSUPPORTED_JSX_PATTERN,
            getSourceLocation(sortInfo.callback, ctx.sourceFile, ctx.filePath),
            {
              message: `Expression cannot be compiled to marked template: ${sortExtraction.unsupportedReason}`,
              suggestion: {
                message: 'Add /* @client */ to evaluate this expression on the client only',
              },
            }
          )
        )
      }
      // Keep sort (and filter if present) in array string for client evaluation
      array = ctx.getJS(mapSource)
    } else {
      sortComparator = sortExtraction.result

      if (innerFilter) {
        // filter().sort().map() pattern
        chainOrder = 'filter-sort'
        const filterExtraction = extractFilterPredicate(innerFilter.callback, ctx)
        if (isClientOnly || !filterExtraction.result) {
          if (!isClientOnly && filterExtraction.unsupportedReason) {
            ctx.analyzer.errors.push(
              createError(ErrorCodes.UNSUPPORTED_JSX_PATTERN,
                getSourceLocation(innerFilter.callback, ctx.sourceFile, ctx.filePath),
                {
                  message: `Expression cannot be compiled to marked template: ${filterExtraction.unsupportedReason}`,
                  suggestion: {
                    message: 'Add /* @client */ to evaluate this expression on the client only',
                  },
                }
              )
            )
          }
          // Keep entire chain in array for client evaluation
          array = ctx.getJS(mapSource)
          sortComparator = undefined
          chainOrder = undefined
        } else {
          array = ctx.getJS(innerFilter.array)
          filterPredicate = filterExtraction.result
        }
      } else {
        // Simple sort().map()
        array = ctx.getJS(sortInfo.array)
      }
    }
  } else if (filterInfo) {
    // Outermost is filter: could be filter().map() or sort().filter().map()
    const innerSort = isSortCall(filterInfo.array)

    // Handle filter predicate extraction
    const filterExtraction = extractFilterPredicate(filterInfo.callback, ctx)

    if (isClientOnly || !filterExtraction.result) {
      if (!isClientOnly && filterExtraction.unsupportedReason) {
        ctx.analyzer.errors.push(
          createError(ErrorCodes.UNSUPPORTED_JSX_PATTERN,
            getSourceLocation(filterInfo.callback, ctx.sourceFile, ctx.filePath),
            {
              message: `Expression cannot be compiled to marked template: ${filterExtraction.unsupportedReason}`,
              suggestion: {
                message: 'Add /* @client */ to evaluate this expression on the client only',
              },
            }
          )
        )
      }
      // Keep filter (and sort if present) in array for client evaluation
      array = ctx.getJS(mapSource)
    } else {
      filterPredicate = filterExtraction.result

      if (innerSort) {
        // sort().filter().map() pattern
        chainOrder = 'sort-filter'
        const sortExtraction = extractSortComparator(innerSort.callback, innerSort.method, ctx)
        if (isClientOnly || !sortExtraction.result) {
          if (!isClientOnly && sortExtraction.unsupportedReason) {
            ctx.analyzer.errors.push(
              createError(ErrorCodes.UNSUPPORTED_JSX_PATTERN,
                getSourceLocation(innerSort.callback, ctx.sourceFile, ctx.filePath),
                {
                  message: `Expression cannot be compiled to marked template: ${sortExtraction.unsupportedReason}`,
                  suggestion: {
                    message: 'Add /* @client */ to evaluate this expression on the client only',
                  },
                }
              )
            )
          }
          // Keep sort in array for client evaluation, but keep filter extracted
          array = ctx.getJS(filterInfo.array)
        } else {
          sortComparator = sortExtraction.result
          array = ctx.getJS(innerSort.array)
        }
      } else {
        // Simple filter().map()
        array = ctx.getJS(filterInfo.array)
      }
    }
  } else {
    array = ctx.getJS(mapSource)
  }

  // Get callback function
  const callback = node.arguments[0]
  let param = 'item'
  let index: string | null = null
  let children: IRNode[] = []

  if (ts.isArrowFunction(callback)) {
    // Extract parameter names
    if (callback.parameters.length > 0) {
      const firstParam = callback.parameters[0]
      param = firstParam.name.getText(ctx.sourceFile)
    }
    if (callback.parameters.length > 1) {
      const secondParam = callback.parameters[1]
      index = secondParam.name.getText(ctx.sourceFile)
    }

    // Transform callback body
    const body = callback.body
    if (ts.isJsxElement(body) || ts.isJsxSelfClosingElement(body) || ts.isJsxFragment(body)) {
      const transformed = transformNode(body, ctx)
      if (transformed) {
        children = [transformed]
      }
    } else if (ts.isParenthesizedExpression(body)) {
      const inner = body.expression
      if (ts.isJsxElement(inner) || ts.isJsxSelfClosingElement(inner) || ts.isJsxFragment(inner)) {
        const transformed = transformNode(inner, ctx)
        if (transformed) {
          children = [transformed]
        }
      }
    }
  }

  // Look for key prop in first child (element or component)
  let key: string | null = null
  if (children.length > 0 && children[0].type === 'element') {
    const keyAttr = children[0].attrs.find((a) => a.name === 'key')
    // Key should be a simple string expression, not a template literal
    if (keyAttr && keyAttr.value && typeof keyAttr.value === 'string') {
      key = keyAttr.value
    }
  } else if (children.length > 0 && children[0].type === 'component') {
    const keyProp = children[0].props.find((p) => p.name === 'key')
    if (keyProp && keyProp.value) {
      key = keyProp.value
    }
  }

  // Extract childComponent info if the loop body is a single component
  // This enables createComponent-based rendering with proper prop passing
  let childComponent: IRLoopChildComponent | undefined
  if (children.length === 1 && children[0].type === 'component') {
    const comp = children[0] as IRComponent
    childComponent = {
      name: comp.name,
      slotId: comp.slotId,
      props: comp.props
        .filter((p) => p.name !== 'key') // key is handled separately
        .map((p) => ({
          name: p.name,
          value: p.value,
          dynamic: p.dynamic,
          isLiteral: p.isLiteral,
          isEventHandler: p.name.startsWith('on') && p.name.length > 2,
        })),
      children: comp.children,
    }
  }

  // Determine if array is static (prop) or dynamic (signal/memo)
  // Static arrays don't need reconcileList - SSR elements are hydrated directly
  // Only signal and memo arrays need reconcileList for dynamic DOM updates
  const isStaticArray = !isSignalOrMemoArray(array, ctx)

  // For static arrays, collect nested components that need hydration.
  // When childComponent exists (e.g., <TableRow>), also collect components nested
  // within it (e.g., <Checkbox> inside <TableCell> inside <TableRow>).
  const nestedComponents = isStaticArray
    ? collectNestedComponents(children).filter(c => c.name !== childComponent?.name)
    : undefined

  return {
    type: 'loop',
    array,
    arrayType: null,
    itemType: null,
    param,
    index,
    key,
    children,
    // Loops don't generate their own slotId; they inherit from parent element
    // The parent element will assign its slotId to the loop after transformation
    slotId: null,
    isStaticArray,
    childComponent,
    nestedComponents,
    filterPredicate,
    sortComparator,
    chainOrder,
    clientOnly: isClientOnly || undefined,
    loc: getSourceLocation(node, ctx.sourceFile, ctx.filePath),
  }
}

/**
 * Recursively collect all components nested within loop children.
 * Used for static array hydration when components are wrapped in elements.
 */
function collectNestedComponents(nodes: IRNode[]): IRLoopChildComponent[] {
  const result: IRLoopChildComponent[] = []

  function traverse(node: IRNode): void {
    if (node.type === 'component') {
      result.push({
        name: node.name,
        slotId: node.slotId,
        props: node.props
          .filter(p => p.name !== 'key')
          .map(p => ({
            name: p.name,
            value: p.value,
            dynamic: p.dynamic,
            isLiteral: p.isLiteral,
            isEventHandler: p.name.startsWith('on') && p.name.length > 2,
          })),
        children: node.children,
      })
      // Also traverse component children to find deeply nested components
      // (e.g., Checkbox inside TableCell inside TableRow)
      if (node.children) {
        node.children.forEach(traverse)
      }
    }
    if (node.type === 'element' && node.children) {
      node.children.forEach(traverse)
    }
    if (node.type === 'fragment' && node.children) {
      node.children.forEach(traverse)
    }
  }

  nodes.forEach(traverse)
  return result
}

// =============================================================================
// Attribute Processing
// =============================================================================

interface ProcessedAttributes {
  attrs: IRAttribute[]
  events: IREvent[]
  ref: string | null
}

function processAttributes(
  attributes: ts.JsxAttributes,
  ctx: TransformContext
): ProcessedAttributes {
  const attrs: IRAttribute[] = []
  const events: IREvent[] = []
  let ref: string | null = null

  for (const attr of attributes.properties) {
    // Spread attribute: {...props}
    if (ts.isJsxSpreadAttribute(attr)) {
      const spreadExpr = ctx.getJS(attr.expression)
      const expandedKeys = ctx.analyzer.restPropsExpandedKeys
      const restName = ctx.analyzer.restPropsName

      // Expand spread if keys are statically known (closed type)
      if (expandedKeys.length > 0 && restName && spreadExpr === restName) {
        const loc = getSourceLocation(attr, ctx.sourceFile, ctx.filePath)
        for (const key of expandedKeys) {
          attrs.push({
            name: key,
            value: `${restName}.${key}`,
            dynamic: true,
            isLiteral: false,
            loc,
          })
        }
      } else {
        attrs.push({
          name: '...',
          value: spreadExpr,
          dynamic: true,
          isLiteral: false,
          loc: getSourceLocation(attr, ctx.sourceFile, ctx.filePath),
        })
      }
      continue
    }

    if (!ts.isJsxAttribute(attr)) continue

    const name = attr.name.getText(ctx.sourceFile)

    // Ref attribute
    if (name === 'ref') {
      if (attr.initializer && ts.isJsxExpression(attr.initializer) && attr.initializer.expression) {
        ref = ctx.getJS(attr.initializer.expression)
      }
      continue
    }

    // Event handler: onClick, onChange, etc.
    if (/^on[A-Z]/.test(name)) {
      if (attr.initializer && ts.isJsxExpression(attr.initializer) && attr.initializer.expression) {
        const eventName = name.slice(2).toLowerCase()
        events.push({
          name: eventName,
          handler: ctx.getJS(attr.initializer.expression),
          loc: getSourceLocation(attr, ctx.sourceFile, ctx.filePath),
        })
      }
      continue
    }

    // Regular attribute
    const { value, dynamic, isLiteral, presenceOrUndefined } = getAttributeValue(attr, ctx)
    attrs.push({
      name,
      value,
      dynamic,
      isLiteral,
      loc: getSourceLocation(attr, ctx.sourceFile, ctx.filePath),
      presenceOrUndefined,
    })
  }

  return { attrs, events, ref }
}

function getAttributeValue(
  attr: ts.JsxAttribute,
  ctx: TransformContext
): { value: string | IRTemplateLiteral | null; dynamic: boolean; isLiteral: boolean; presenceOrUndefined?: boolean } {
  // Boolean attribute: <button disabled />
  if (!attr.initializer) {
    return { value: null, dynamic: false, isLiteral: false }
  }

  // String literal: <div id="main" />
  if (ts.isStringLiteral(attr.initializer)) {
    return { value: attr.initializer.text, dynamic: false, isLiteral: true }
  }

  // Expression: <div class={className} />
  // JSX expressions are always dynamic - they should be rendered as {expr} not "expr"
  // The distinction between "dynamic" (JSX expression) and "reactive" (needs client updates)
  // is handled separately in client JS generation
  if (ts.isJsxExpression(attr.initializer) && attr.initializer.expression) {
    const expr = attr.initializer.expression

    // Check for bare signal/memo identifier (BF044)
    checkBareSignalOrMemoIdentifier(expr, ctx)

    // Template literal with ternaries: `...${cond ? 'a' : 'b'}...`
    if (ts.isTemplateExpression(expr)) {
      const parts = parseTemplateLiteral(expr, ctx)
      if (parts.some(p => p.type === 'ternary')) {
        return {
          value: { type: 'template-literal', parts },
          dynamic: true,
          isLiteral: false,
        }
      }
    }

    // Simple ternary: cond ? 'a' : 'b'
    if (ts.isConditionalExpression(expr)) {
      const ternary = parseTernary(expr, ctx)
      if (ternary) {
        return {
          value: { type: 'template-literal', parts: [ternary] },
          dynamic: true,
          isLiteral: false,
        }
      }
    }

    // Detect `expr || undefined` pattern → boolean presence attribute
    if (ts.isBinaryExpression(expr) && expr.operatorToken.kind === ts.SyntaxKind.BarBarToken) {
      if (ts.isIdentifier(expr.right) && expr.right.text === 'undefined') {
        const baseExpr = ctx.getJS(expr.left)
        return { value: baseExpr, dynamic: true, isLiteral: false, presenceOrUndefined: true }
      }
    }

    const exprText = ctx.getJS(expr)
    return { value: exprText, dynamic: true, isLiteral: false }
  }

  return { value: null, dynamic: false, isLiteral: false }
}

/**
 * Parse a template literal expression into structured parts.
 * Handles: `prefix${cond ? 'a' : 'b'}suffix`
 */
function parseTemplateLiteral(
  expr: ts.TemplateExpression,
  ctx: TransformContext
): IRTemplatePart[] {
  const parts: IRTemplatePart[] = []

  // Add the head (text before first ${})
  if (expr.head.text) {
    parts.push({ type: 'string', value: expr.head.text })
  }

  for (const span of expr.templateSpans) {
    if (ts.isConditionalExpression(span.expression)) {
      // Ternary expression inside ${}
      const ternary = parseTernary(span.expression, ctx)
      if (ternary) {
        parts.push(ternary)
      } else {
        // Fallback: keep as string expression
        parts.push({ type: 'string', value: `\${${ctx.getJS(span.expression)}}` })
      }
    } else {
      // Non-ternary expression: keep as ${expr}
      parts.push({ type: 'string', value: `\${${ctx.getJS(span.expression)}}` })
    }

    // Add the literal part after this span (text after ${} until next ${} or end)
    if (span.literal.text) {
      parts.push({ type: 'string', value: span.literal.text })
    }
  }

  return parts
}

/**
 * Parse a conditional (ternary) expression into structured form.
 * Only parses simple ternaries with string literal branches.
 */
function parseTernary(
  expr: ts.ConditionalExpression,
  ctx: TransformContext
): IRTemplatePart | null {
  const whenTrueValue = getStringValue(expr.whenTrue)
  const whenFalseValue = getStringValue(expr.whenFalse)

  // Only parse if both branches are string literals
  if (whenTrueValue !== null && whenFalseValue !== null) {
    return {
      type: 'ternary',
      condition: ctx.getJS(expr.condition),
      whenTrue: whenTrueValue,
      whenFalse: whenFalseValue,
    }
  }

  return null
}

/**
 * Extract string value from an expression node.
 * Handles string literals and NoSubstitutionTemplateLiteral.
 */
function getStringValue(node: ts.Expression): string | null {
  if (ts.isStringLiteral(node)) {
    return node.text
  }
  if (ts.isNoSubstitutionTemplateLiteral(node)) {
    return node.text
  }
  return null
}

// =============================================================================
// Component Props Processing
// =============================================================================

function processComponentProps(
  attributes: ts.JsxAttributes,
  ctx: TransformContext
): IRProp[] {
  const props: IRProp[] = []

  for (const attr of attributes.properties) {
    // Spread props: {...props}
    if (ts.isJsxSpreadAttribute(attr)) {
      const spreadExpr = ctx.getJS(attr.expression)
      const expandedKeys = ctx.analyzer.restPropsExpandedKeys
      const restName = ctx.analyzer.restPropsName

      // Expand spread if keys are statically known (closed type)
      if (expandedKeys.length > 0 && restName && spreadExpr === restName) {
        const loc = getSourceLocation(attr, ctx.sourceFile, ctx.filePath)
        for (const key of expandedKeys) {
          props.push({
            name: key,
            value: `${restName}.${key}`,
            dynamic: true,
            isLiteral: false,
            loc,
          })
        }
      } else {
        props.push({
          name: '...',
          value: spreadExpr,
          dynamic: true,
          isLiteral: false,
          loc: getSourceLocation(attr, ctx.sourceFile, ctx.filePath),
        })
      }
      continue
    }

    if (!ts.isJsxAttribute(attr)) continue

    const name = attr.name.getText(ctx.sourceFile)
    const { value, dynamic, isLiteral } = getAttributeValue(attr, ctx)

    // For component props, convert IRTemplateLiteral back to string expression
    // since props are passed to components as-is
    const propValue = templateLiteralToString(value) ?? 'true'

    props.push({
      name,
      value: propValue,
      dynamic,
      isLiteral,
      loc: getSourceLocation(attr, ctx.sourceFile, ctx.filePath),
    })
  }

  return props
}

/**
 * Convert an IRTemplateLiteral back to its JavaScript string representation.
 * Returns the original value if it's already a string.
 */
function templateLiteralToString(value: string | IRTemplateLiteral | null): string | null {
  if (value === null) return null
  if (typeof value === 'string') return value

  // Reconstruct the template literal as a JS expression
  let result = '`'
  for (const part of value.parts) {
    if (part.type === 'string') {
      result += part.value
    } else if (part.type === 'ternary') {
      result += `\${${part.condition} ? '${part.whenTrue}' : '${part.whenFalse}'}`
    }
  }
  result += '`'
  return result
}

// =============================================================================
// Helpers
// =============================================================================

/**
 * Check if a bare identifier is a signal getter or memo name.
 * Emits BF044 error when a signal/memo getter is passed without calling it.
 * e.g., value={count} instead of value={count()}
 */
function checkBareSignalOrMemoIdentifier(
  expr: ts.Expression,
  ctx: TransformContext
): void {
  if (!ts.isIdentifier(expr)) return

  const name = expr.text

  for (const signal of ctx.analyzer.signals) {
    if (signal.getter === name) {
      ctx.analyzer.errors.push(
        createError(ErrorCodes.SIGNAL_GETTER_NOT_CALLED,
          getSourceLocation(expr, ctx.sourceFile, ctx.filePath),
          {
            message: `Signal getter '${name}' passed without calling it`,
            suggestion: {
              message: `Signal getters must be called to read the value. Use \`${name}()\` instead of \`${name}\`.`,
              replacement: `${name}()`,
            },
          }
        )
      )
      return
    }
  }

  for (const memo of ctx.analyzer.memos) {
    if (memo.name === name) {
      ctx.analyzer.errors.push(
        createError(ErrorCodes.SIGNAL_GETTER_NOT_CALLED,
          getSourceLocation(expr, ctx.sourceFile, ctx.filePath),
          {
            message: `Memo getter '${name}' passed without calling it`,
            suggestion: {
              message: `Memo getters must be called to read the value. Use \`${name}()\` instead of \`${name}\`.`,
              replacement: `${name}()`,
            },
          }
        )
      )
      return
    }
  }
}

/**
 * Check if array expression is a signal or memo getter call.
 * Used to determine if a loop needs reconcileList for dynamic DOM updates.
 * Props and local constants are considered static (don't change at runtime).
 */
function isSignalOrMemoArray(array: string, ctx: TransformContext): boolean {
  for (const { pattern } of ctx.patterns.signals) {
    if (pattern.test(array)) return true
  }
  for (const { pattern } of ctx.patterns.memos) {
    if (pattern.test(array)) return true
  }
  return false
}

/**
 * Check if an expression is reactive.
 *
 * Detection strategy:
 * 1. TypeChecker: walk AST to find Reactive<T> branded types (signals, memos, FieldReturn, etc.)
 * 2. Signal/memo regex: fallback for when TypeChecker cannot resolve types (e.g., virtual file paths)
 * 3. Props regex: props are always potentially reactive (parent passes getters) but aren't
 *    branded with Reactive<T> since users define props interfaces directly.
 *    Regex is the right tool here — props detection is name-based by design.
 */
function isReactiveExpression(expr: string, ctx: TransformContext, astNode?: ts.Node): boolean {
  // Type-checker path: walk AST to find Reactive<T> branded types
  if (ctx.analyzer.checker && astNode) {
    if (containsReactiveExpression(astNode, ctx.analyzer.checker)) {
      return true
    }
  }

  // Signal/memo regex fallback — needed when TypeChecker cannot resolve imported types
  // (e.g., virtual file paths in tests, missing type declarations)
  if (isSignalOrMemoReference(expr, ctx)) {
    return true
  }

  // Props are always potentially reactive (parent may pass signal getters),
  // but they don't carry Reactive<T> brand since users define props types directly.
  if (isPropsReference(expr, ctx)) {
    return true
  }

  return false
}

/**
 * Regex-based signal/memo detection.
 * Complements TypeChecker for cases where imported types can't be resolved.
 */
function isSignalOrMemoReference(expr: string, ctx: TransformContext, visited?: Set<string>): boolean {
  for (const { pattern } of ctx.patterns.signals) {
    if (pattern.test(expr)) return true
  }
  for (const { pattern } of ctx.patterns.memos) {
    if (pattern.test(expr)) return true
  }

  // Check if expression uses a constant that references signals/memos
  for (const c of ctx.patterns.constants) {
    if (visited?.has(c.name)) continue
    if (c.pattern.test(expr) && c.value) {
      const next = visited ?? new Set<string>()
      next.add(c.name)
      if (isSignalOrMemoReference(c.value, ctx, next)) return true
    }
  }

  return false
}

/**
 * Check if an expression references props (excluding children).
 * Props are always treated as reactive because the parent component
 * may pass signal getters as prop values.
 */
function isPropsReference(expr: string, ctx: TransformContext, visited?: Set<string>): boolean {
  for (const { pattern } of ctx.patterns.props) {
    if (pattern.test(expr)) return true
  }

  // Check if expression uses a local constant derived from props
  for (const c of ctx.patterns.constants) {
    if (visited?.has(c.name)) continue
    if (c.pattern.test(expr) && c.value) {
      const next = visited ?? new Set<string>()
      next.add(c.name)
      if (isPropsReference(c.value, ctx, next)) return true
    }
  }

  return false
}

/**
 * Check if any attributes in the list are reactive (depend on signals/memos).
 * Reactive attributes need a slotId so the client JS can update them.
 */
function hasReactiveAttributes(attrs: IRAttribute[], ctx: TransformContext): boolean {
  for (const attr of attrs) {
    if (attr.dynamic && attr.value) {
      const valueToCheck = getAttributeValueAsString(attr.value)
      if (!valueToCheck) continue

      if (isSignalOrMemoReference(valueToCheck, ctx) || isPropsReference(valueToCheck, ctx)) {
        return true
      }
    }
  }
  return false
}

/**
 * Get the string representation of an attribute value for reactivity checking.
 */
function getAttributeValueAsString(value: string | IRTemplateLiteral | null): string | null {
  if (value === null) return null
  if (typeof value === 'string') return value
  // For template literals, concatenate all parts for reactivity checking
  return value.parts.map(p => {
    if (p.type === 'string') return p.value
    return p.condition // Check the condition for signals/memos
  }).join('')
}

/**
 * Propagate slotId to loop children that need it.
 * Loops need to use their parent element's slotId for reconcileList.
 * This handles loops directly in children or nested in fragments.
 */
function propagateSlotIdToLoops(children: IRNode[], slotId: string): void {
  for (const child of children) {
    if (child.type === 'loop' && child.slotId === null) {
      child.slotId = slotId
    } else if (child.type === 'fragment') {
      // Recurse into fragments (they're transparent containers)
      propagateSlotIdToLoops(child.children, slotId)
    }
    // Don't recurse into elements - they handle their own children
  }
}

function hasDynamicContent(children: IRNode[]): boolean {
  for (const child of children) {
    if (child.type === 'expression' && child.reactive) {
      return true
    }
    if (child.type === 'conditional' && child.reactive) {
      return true
    }
    if (child.type === 'loop') {
      return true
    }
    // Don't recurse into child elements — they handle their own dynamic content
    // with their own slotIds. Propagating up would cause unnecessary bf markers
    // on ancestor elements, risking ID collisions when those ancestors are passed
    // as props.children into a child component scope.
    if (child.type === 'fragment' && hasDynamicContent(child.children)) {
      return true
    }
  }
  return false
}

function inferExpressionType(
  _node: ts.Expression,
  _ctx: TransformContext
): TypeInfo | null {
  // TODO: Implement type inference from expression
  return null
}

// =============================================================================
// If Statement Chain Building
// =============================================================================

/**
 * Build a chain of IRIfStatement nodes from conditional returns.
 * The chain is built in reverse order, starting with the final return
 * and working backwards through the if statements.
 */
function buildIfStatementChain(
  analyzer: AnalyzerContext,
  ctx: TransformContext
): IRIfStatement {
  const conditionalReturns = analyzer.conditionalReturns

  // Start with the final return (else case) if it exists
  let alternate: IRNode | null = null
  if (analyzer.jsxReturn) {
    ctx.isRoot = true
    alternate = transformNode(analyzer.jsxReturn, ctx)
  }

  // Build the if-else chain from the last conditional to the first
  for (let i = conditionalReturns.length - 1; i >= 0; i--) {
    const condReturn = conditionalReturns[i]

    // Get the condition text
    const condition = ctx.getJS(condReturn.condition)

    // Transform the JSX return in the then branch
    // Reset isRoot so each branch gets needsScope=true
    ctx.isRoot = true
    const consequent = transformNode(condReturn.jsxReturn, ctx)
    if (!consequent) {
      continue
    }

    // Collect scope variables with their initializers
    const scopeVariables: Array<{ name: string; initializer: string }> = []
    for (const decl of condReturn.scopeVariables) {
      if (ts.isIdentifier(decl.name) && decl.initializer) {
        scopeVariables.push({
          name: decl.name.text,
          initializer: ctx.getJS(decl.initializer),
        })
      }
    }

    // Get source location
    const loc = getSourceLocation(
      condReturn.ifStatement,
      analyzer.sourceFile,
      analyzer.filePath
    )

    // Create the if statement node
    const ifStmt: IRIfStatement = {
      type: 'if-statement',
      condition,
      consequent,
      alternate,
      scopeVariables,
      loc,
    }

    // This becomes the alternate for the next iteration (earlier if statement)
    alternate = ifStmt
  }

  // The final result should be an IRIfStatement (the first if in the chain)
  return alternate as IRIfStatement
}
