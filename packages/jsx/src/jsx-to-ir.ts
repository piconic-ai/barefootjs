/**
 * BarefootJS Compiler - JSX to Pure IR Transformer
 *
 * Transforms TypeScript JSX AST to Pure IR (JSX-independent JSON structure).
 */

import ts from 'typescript'
import {
  type IRNode,
  type IRElement,
  type IRText,
  type IRExpression,
  type IRConditional,
  type IRLoop,
  type IRLoopChildComponent,
  type IRComponent,
  type IRFragment,
  type IRIfStatement,
  type IRProvider,
  type IRAttribute,
  type IREvent,
  type IRProp,
  type IRTemplateLiteral,
  type IRTemplatePart,
  type SourceLocation,
  type TypeInfo,
  pickAttrMeta,
} from './types'
import { type AnalyzerContext, getSourceLocation } from './analyzer-context'
import { parseExpression, isSupported, parseBlockBody, type ParsedExpr, type ParsedStatement } from './expression-parser'
import { createError, ErrorCodes } from './errors'
import { containsReactiveExpression } from './reactivity-checker'
import { rewriteBarePropRefs as rewriteBarePropRefsCore } from './prop-rewrite'

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
  /** getJS + rewrite destructured prop refs for client JS templates (#807) */
  getTemplateJS(node: ts.Node): string
  /** Cached set of reactive getter names (signal getters + memo names) for O(1) lookup */
  _reactiveGetterNames?: Set<string>
  /** Cached set of destructured prop names for AST-based rewriting */
  _destructuredPropNames?: Set<string> | null
  /** Active loop parameter names for slotId assignment to loop-param-dependent expressions */
  loopParams: Set<string>
  /** Counter for async boundary IDs (a0, a1, ...) */
  asyncIdCounter: number
}

/**
 * Walk an expression AST to check if it calls any known signal getter or memo.
 * Uses a pre-built Set for O(1) lookup per call expression.
 */
function exprCallsReactiveGetters(expr: ts.Expression, ctx: TransformContext): boolean {
  // Build reactive name set once per component (cached on ctx)
  if (!ctx._reactiveGetterNames) {
    ctx._reactiveGetterNames = new Set<string>()
    for (const s of ctx.analyzer.signals) ctx._reactiveGetterNames.add(s.getter)
    for (const m of ctx.analyzer.memos) ctx._reactiveGetterNames.add(m.name)
  }
  const names = ctx._reactiveGetterNames

  let found = false
  function visit(n: ts.Node) {
    if (found) return
    if (ts.isCallExpression(n) && ts.isIdentifier(n.expression)) {
      if (names.has(n.expression.text)) { found = true; return }
    }
    ts.forEachChild(n, visit)
  }
  visit(expr)
  return found
}

/**
 * Walk an expression AST to check if it contains any CallExpression.
 * Catches all call patterns: identifier(), obj.method(), fn?.(), IIFEs, etc.
 * Used by canGenerateStaticTemplate() to detect expressions unsafe for static rendering.
 */
function exprHasFunctionCalls(expr: ts.Expression): boolean {
  let found = false
  function visit(n: ts.Node) {
    if (found) return
    if (ts.isCallExpression(n)) { found = true; return }
    ts.forEachChild(n, visit)
  }
  visit(expr)
  return found
}

/**
 * Rewrite bare destructured prop references in expression text.
 * Thin wrapper that caches prop names on ctx and delegates to the shared core.
 * Returns undefined if no rewriting is needed (SolidJS-style or no props).
 */
function rewriteBarePropRefs(text: string, expr: ts.Node, ctx: TransformContext): string | undefined {
  // Build and cache destructured prop names
  if (ctx._destructuredPropNames === undefined) {
    if (ctx.analyzer.propsObjectName) {
      ctx._destructuredPropNames = null  // SolidJS-style, no rewriting needed
    } else {
      const names = ctx.analyzer.propsParams.map(p => p.name)
      ctx._destructuredPropNames = names.length > 0 ? new Set(names) : null
    }
  }
  if (!ctx._destructuredPropNames) return undefined
  return rewriteBarePropRefsCore(text, expr, ctx._destructuredPropNames)
}

function createTransformContext(analyzer: AnalyzerContext): TransformContext {
  return {
    analyzer,
    sourceFile: analyzer.sourceFile,
    filePath: analyzer.filePath,
    slotIdCounter: 0,
    asyncIdCounter: 0,
    isRoot: true,
    insideComponentChildren: false,
    loopParams: new Set(),
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
    getTemplateJS(node: ts.Node): string {
      const text = analyzer.getJS(node)
      return rewriteBarePropRefs(text, node, this) ?? text
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

  // Detect Async streaming boundary: <Async fallback={...}>
  if (tagName === 'Async') {
    return transformAsyncElement(node, ctx)
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

  // Detect Async streaming boundary: <Async ... />
  if (tagName === 'Async') {
    return transformSelfClosingAsyncElement(node, ctx)
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
// Async Streaming Boundary Transformation
// =============================================================================

function transformAsyncElement(
  node: ts.JsxElement,
  ctx: TransformContext
): IRNode {
  const props = processComponentProps(node.openingElement.attributes, ctx)
  const fallbackProp = props.find(p => p.name === 'fallback')

  if (!fallbackProp) {
    throw new Error('<Async> requires a \'fallback\' prop')
  }

  // Parse the fallback JSX expression into an IR node
  const fallbackNode = parseFallbackProp(fallbackProp, ctx, node)

  const children = transformChildren(node.children, ctx)
  const id = `a${ctx.asyncIdCounter++}`

  return {
    type: 'async',
    id,
    fallback: fallbackNode,
    children,
    loc: getSourceLocation(node, ctx.sourceFile, ctx.filePath),
  }
}

/**
 * Parse the fallback prop's JSX expression into an IR node.
 * The fallback is typically a JSX element: fallback={<Skeleton />}
 */
function parseFallbackProp(
  prop: IRProp,
  ctx: TransformContext,
  parentNode: ts.Node
): IRNode {
  // Walk the parent node's attributes to find the actual AST node for fallback
  const openingEl = (parentNode as ts.JsxElement).openingElement
  for (const attr of openingEl.attributes.properties) {
    if (ts.isJsxAttribute(attr) && attr.name.getText(ctx.sourceFile) === 'fallback') {
      const initializer = attr.initializer
      if (initializer && ts.isJsxExpression(initializer) && initializer.expression) {
        const expr = initializer.expression
        // If it's a JSX element, transform it
        if (ts.isJsxElement(expr) || ts.isJsxSelfClosingElement(expr) || ts.isJsxFragment(expr)) {
          const result = transformNode(expr, ctx)
          if (result) return result
        }
      }
    }
  }

  // Fallback to a text node with the prop value
  return {
    type: 'text',
    value: prop.value,
    loc: getSourceLocation(parentNode, ctx.sourceFile, ctx.filePath),
  }
}

function transformSelfClosingAsyncElement(
  node: ts.JsxSelfClosingElement,
  ctx: TransformContext
): IRNode {
  const props = processComponentProps(node.attributes, ctx)
  const fallbackProp = props.find(p => p.name === 'fallback')

  if (!fallbackProp) {
    throw new Error('<Async /> requires a \'fallback\' prop')
  }

  // Parse fallback from the self-closing element's attributes
  let fallbackNode: IRNode | null = null
  for (const attr of node.attributes.properties) {
    if (ts.isJsxAttribute(attr) && attr.name.getText(ctx.sourceFile) === 'fallback') {
      const initializer = attr.initializer
      if (initializer && ts.isJsxExpression(initializer) && initializer.expression) {
        const expr = initializer.expression
        if (ts.isJsxElement(expr) || ts.isJsxSelfClosingElement(expr) || ts.isJsxFragment(expr)) {
          fallbackNode = transformNode(expr, ctx)
        }
      }
    }
  }

  if (!fallbackNode) {
    fallbackNode = {
      type: 'text',
      value: fallbackProp.value,
      loc: getSourceLocation(node, ctx.sourceFile, ctx.filePath),
    }
  }

  const id = `a${ctx.asyncIdCounter++}`

  return {
    type: 'async',
    id,
    fallback: fallbackNode,
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

  // Nullish coalescing / logical OR with JSX: {children ?? <Icon />}, {label || <Fallback />}
  if (
    ts.isBinaryExpression(expr) &&
    (expr.operatorToken.kind === ts.SyntaxKind.QuestionQuestionToken ||
      expr.operatorToken.kind === ts.SyntaxKind.BarBarToken) &&
    containsJsxInExpression(expr.right)
  ) {
    const result = transformNullishCoalescing(expr, ctx)
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
    const mapResult = transformMapCall(expr, ctx, isClientOnly)
    if (mapResult) {
      return mapResult
    }
    // Callback body is not JSX (e.g., function call). Fall through to expression handling.
  }

  // Inline JSX constants at the IR level (#547)
  if (ts.isIdentifier(expr)) {
    const jsxNode = ctx.analyzer.jsxConstants.get(expr.text)
    if (jsxNode) {
      return transformNode(jsxNode, ctx)
    }
  }

  // Inline JSX function calls at the IR level (#569)
  if (ts.isCallExpression(expr)) {
    const callee = expr.expression
    if (ts.isIdentifier(callee)) {
      const jsxFunc = ctx.analyzer.jsxFunctions.get(callee.text)
      if (jsxFunc) {
        return transformJsxFunctionCall(expr, jsxFunc, ctx, isClientOnly)
      }
    }
  }

  // Regular expression
  const exprText = ctx.getJS(expr)
  const reactive = isReactiveExpression(exprText, ctx, expr)
  // @client expressions always need slotId and are treated as reactive for client-side evaluation
  // Expressions inside loops that reference the loop parameter need slotId
  // so fine-grained effects can target them for per-item signal updates
  const refsLoopParam = ctx.loopParams.size > 0
    && Array.from(ctx.loopParams).some(p => new RegExp(`\\b${p}\\b`).test(exprText))

  // Compute AST-derived flags. `callsReactive` recognises signal-getter / memo
  // calls even inside deeper expressions (e.g., `format(count())`); `hasCalls`
  // is broader — any identifier() pattern. Both serve as Solid-style
  // wrap-by-default hints (#937): if the analyzer can't prove the expression
  // non-reactive but it contains calls, we allocate a slotId so the client JS
  // path can wrap the read in createEffect as a safe fallback.
  const callsReactive = exprCallsReactiveGetters(expr, ctx)
  const hasCalls = exprHasFunctionCalls(expr)

  const needsSlot = reactive || isClientOnly || refsLoopParam || callsReactive || hasCalls
  const slotId = needsSlot ? generateSlotId(ctx) : null

  const templateExpr = rewriteBarePropRefs(exprText, expr, ctx)
  return {
    type: 'expression',
    expr: exprText,
    templateExpr,
    typeInfo: inferExpressionType(expr, ctx),
    reactive,
    slotId,
    clientOnly: isClientOnly || undefined,
    callsReactiveGetters: callsReactive || undefined,
    hasFunctionCalls: hasCalls || undefined,
    loc: getSourceLocation(node, ctx.sourceFile, ctx.filePath),
  }
}

// =============================================================================
// Conditional Transformation
// =============================================================================

/**
 * Inline a JSX-returning function call at the IR level (#569).
 *
 * Substitutes function parameters with call arguments in getJS output,
 * then transforms the function's JSX AST — producing proper IR nodes
 * (loops, conditionals, etc.) with unique scope IDs for each call site.
 */
function transformJsxFunctionCall(
  callExpr: ts.CallExpression,
  jsxFunc: { jsxReturn: ts.JsxElement | ts.JsxSelfClosingElement | ts.JsxFragment; params: string[] },
  ctx: TransformContext,
  _isClientOnly: boolean
): IRNode {
  // Build substitution map: paramName → argument expression text
  const substitutions = new Map<string, string>()
  for (let i = 0; i < jsxFunc.params.length; i++) {
    const paramName = jsxFunc.params[i]
    const arg = callExpr.arguments[i]
    if (arg) {
      substitutions.set(paramName, ctx.getJS(arg))
    }
  }

  // Temporarily override getJS to apply parameter substitutions.
  // Capture analyzer.getJS (the base implementation) to avoid circular references.
  const baseGetJS = ctx.analyzer.getJS.bind(ctx.analyzer)
  const originalCtxGetJS = ctx.getJS
  const originalAnalyzerGetJS = ctx.analyzer.getJS

  const substitutedGetJS = (node: ts.Node) => {
    let text = baseGetJS(node)
    for (const [paramName, argExpr] of substitutions) {
      text = text.replace(new RegExp(`\\b${paramName}\\b`, 'g'), argExpr)
    }
    return text
  }

  ctx.getJS = substitutedGetJS
  ctx.analyzer.getJS = substitutedGetJS

  try {
    const result = transformNode(jsxFunc.jsxReturn, ctx)
    return result ?? {
      type: 'expression' as const,
      expr: 'null',
      typeInfo: null,
      reactive: false,
      slotId: null,
      loc: getSourceLocation(callExpr, ctx.sourceFile, ctx.filePath),
    }
  } finally {
    ctx.getJS = originalCtxGetJS
    ctx.analyzer.getJS = originalAnalyzerGetJS
  }
}

function transformConditional(
  node: ts.ConditionalExpression,
  ctx: TransformContext
): IRConditional {
  const condition = ctx.getJS(node.condition)
  const reactive = isReactiveExpression(condition, ctx, node.condition)
  const loopParamReactive = !reactive && referencesLoopParam(condition, ctx)
  // Solid-style wrap-by-default fallback (#941, follow-up to #937/#939).
  // A condition the analyzer can't prove reactive but that contains a
  // function call is likely a silent-drop waiting to happen — allocate
  // a slotId so the collector can wrap it. See `case 'conditional'` in
  // collect-elements.ts for the matching gate.
  const callsReactive = exprCallsReactiveGetters(node.condition, ctx)
  const hasCalls = exprHasFunctionCalls(node.condition)
  const needsSlot = reactive || loopParamReactive || callsReactive || hasCalls
  const slotId = needsSlot ? generateSlotId(ctx) : null

  // Transform both branches
  const whenTrue = transformConditionalBranch(node.whenTrue, ctx)
  const whenFalse = transformConditionalBranch(node.whenFalse, ctx)

  return {
    type: 'conditional',
    condition,
    templateCondition: rewriteBarePropRefs(condition, node.condition, ctx),
    conditionType: null,
    reactive,
    whenTrue,
    whenFalse,
    slotId,
    callsReactiveGetters: callsReactive || undefined,
    hasFunctionCalls: hasCalls || undefined,
    loc: getSourceLocation(node, ctx.sourceFile, ctx.filePath),
  }
}

function transformLogicalAnd(
  node: ts.BinaryExpression,
  ctx: TransformContext
): IRConditional {
  const condition = ctx.getJS(node.left)
  const reactive = isReactiveExpression(condition, ctx, node.left)
  const loopParamReactive = !reactive && referencesLoopParam(condition, ctx)
  // Wrap-by-default fallback (#941) — see transformConditional.
  const callsReactive = exprCallsReactiveGetters(node.left, ctx)
  const hasCalls = exprHasFunctionCalls(node.left)
  const needsSlot = reactive || loopParamReactive || callsReactive || hasCalls
  const slotId = needsSlot ? generateSlotId(ctx) : null

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
    templateCondition: rewriteBarePropRefs(condition, node.left, ctx),
    conditionType: null,
    reactive,
    whenTrue,
    whenFalse,
    slotId,
    callsReactiveGetters: callsReactive || undefined,
    hasFunctionCalls: hasCalls || undefined,
    loc: getSourceLocation(node, ctx.sourceFile, ctx.filePath),
  }
}

/**
 * Check if an expression contains JSX elements anywhere in its subtree.
 */
function containsJsxInExpression(node: ts.Node): boolean {
  if (
    ts.isJsxElement(node) ||
    ts.isJsxSelfClosingElement(node) ||
    ts.isJsxFragment(node)
  ) {
    return true
  }
  return ts.forEachChild(node, containsJsxInExpression) ?? false
}

/**
 * Transform nullish coalescing (??) and logical OR (||) with JSX fallback.
 *
 * - `a ?? b` → condition=`a != null`, whenTrue=`a`, whenFalse=`b`
 * - `a || b` → condition=`a`, whenTrue=`a`, whenFalse=`b`
 */
function transformNullishCoalescing(
  node: ts.BinaryExpression,
  ctx: TransformContext
): IRConditional {
  const leftText = ctx.getJS(node.left)
  const isNullish = node.operatorToken.kind === ts.SyntaxKind.QuestionQuestionToken
  const condition = isNullish ? `${leftText} != null` : leftText
  const reactive = isReactiveExpression(leftText, ctx, node.left)
  const loopParamReactive = !reactive && referencesLoopParam(leftText, ctx)
  // Wrap-by-default fallback (#941) — see transformConditional. The call
  // flags are computed from node.left (the operand that stands in for the
  // condition). Hoisted here so both the IRConditional slotId decision and
  // the whenTrue IRExpression can share the same values.
  const callsReactive = exprCallsReactiveGetters(node.left, ctx)
  const hasCalls = exprHasFunctionCalls(node.left)
  const needsSlot = reactive || loopParamReactive || callsReactive || hasCalls
  const slotId = needsSlot ? generateSlotId(ctx) : null

  // whenTrue: the left-hand value itself
  const templateLeftText = rewriteBarePropRefs(leftText, node.left, ctx)
  const whenTrue: IRExpression = {
    type: 'expression',
    expr: leftText,
    templateExpr: templateLeftText,
    typeInfo: inferExpressionType(node.left, ctx),
    reactive,
    slotId: null,
    callsReactiveGetters: callsReactive || undefined,
    hasFunctionCalls: hasCalls || undefined,
    loc: getSourceLocation(node.left, ctx.sourceFile, ctx.filePath),
  }

  // whenFalse: recursively transform the right-hand side (may contain JSX)
  const whenFalse = transformConditionalBranch(node.right, ctx)

  const templateCondition = templateLeftText
    ? (isNullish ? `${templateLeftText} != null` : templateLeftText)
    : undefined

  return {
    type: 'conditional',
    condition,
    templateCondition,
    conditionType: null,
    reactive,
    whenTrue,
    whenFalse,
    slotId,
    callsReactiveGetters: callsReactive || undefined,
    hasFunctionCalls: hasCalls || undefined,
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

  // Nullish coalescing / logical OR with JSX in branch
  if (
    ts.isBinaryExpression(node) &&
    (node.operatorToken.kind === ts.SyntaxKind.QuestionQuestionToken ||
      node.operatorToken.kind === ts.SyntaxKind.BarBarToken) &&
    containsJsxInExpression(node.right)
  ) {
    return transformNullishCoalescing(node, ctx)
  }

  // Inline JSX function calls in conditional branches (#569)
  if (ts.isCallExpression(node)) {
    const callee = node.expression
    if (ts.isIdentifier(callee)) {
      const jsxFunc = ctx.analyzer.jsxFunctions.get(callee.text)
      if (jsxFunc) {
        return transformJsxFunctionCall(node, jsxFunc, ctx, false)
      }
    }
  }

  // Map call returning JSX in conditional branch (#783)
  if (ts.isCallExpression(node) && isMapCall(node)) {
    const mapResult = transformMapCall(node, ctx)
    if (mapResult) {
      return mapResult
    }
  }

  // Regular expression (including null)
  const exprText = ctx.getJS(node)
  return {
    type: 'expression',
    expr: exprText,
    templateExpr: rewriteBarePropRefs(exprText, node, ctx),
    typeInfo: inferExpressionType(node, ctx),
    reactive: isReactiveExpression(exprText, ctx, node),
    slotId: null,
    callsReactiveGetters: exprCallsReactiveGetters(node, ctx) || undefined,
    hasFunctionCalls: exprHasFunctionCalls(node) || undefined,
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
): IRLoop | null {
  const propAccess = node.expression as ts.PropertyAccessExpression
  const mapSource = propAccess.expression

  // Detect chaining patterns on .map()'s source expression:
  // 1. sort().map() or toSorted().map()
  // 2. filter().map()
  // 3. filter().sort().map()  (outermost = sort, inner = filter)
  // 4. sort().filter().map()  (outermost = filter, inner = sort)

  let array: string = ''
  let templateArray: string | undefined
  // Track the AST node that corresponds to `array` so the isStaticArray
  // decision below can run `exprHasFunctionCalls` on it. Updated every
  // time `array` is assigned; initial value is the full mapSource, which
  // matches the fallback path at the bottom of this if/else chain.
  let arrayExpr: ts.Expression = mapSource
  let filterPredicate: FilterPredicateResult | undefined
  let sortComparator: SortComparatorResult | undefined
  let chainOrder: 'filter-sort' | 'sort-filter' | undefined
  let mapPreamble: string | undefined
  let templateMapPreamble: string | undefined
  let typedMapPreamble: string | undefined

  // Helper to set both array and templateArray
  const setArray = (node: ts.Expression) => {
    array = ctx.getJS(node)
    templateArray = rewriteBarePropRefs(array, node, ctx)
    arrayExpr = node
  }

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
      setArray(mapSource)
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
          setArray(mapSource)
          sortComparator = undefined
          chainOrder = undefined
        } else {
          setArray(innerFilter.array)
          filterPredicate = filterExtraction.result
        }
      } else {
        // Simple sort().map()
        setArray(sortInfo.array)
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
      setArray(mapSource)
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
          setArray(filterInfo.array)
        } else {
          sortComparator = sortExtraction.result
          setArray(innerSort.array)
        }
      } else {
        // Simple filter().map()
        array = ctx.getJS(filterInfo.array)
        arrayExpr = filterInfo.array
      }
    }
  } else {
    array = ctx.getJS(mapSource)
    arrayExpr = mapSource
  }

  // Get callback function
  const callback = node.arguments[0]
  let param = 'item'
  let paramType: string | undefined
  let index: string | null = null
  let indexType: string | undefined
  let children: IRNode[] = []

  if (ts.isArrowFunction(callback)) {
    // Extract parameter names and type annotations
    if (callback.parameters.length > 0) {
      const firstParam = callback.parameters[0]
      param = firstParam.name.getText(ctx.sourceFile)
      if (firstParam.type) {
        paramType = firstParam.type.getText(ctx.sourceFile)
      }
    }
    if (callback.parameters.length > 1) {
      const secondParam = callback.parameters[1]
      index = secondParam.name.getText(ctx.sourceFile)
      if (secondParam.type) {
        indexType = secondParam.type.getText(ctx.sourceFile)
      }
    }

    // Register loop params so expressions referencing them get slotId
    ctx.loopParams.add(param)
    if (index) ctx.loopParams.add(index)

    // Transform callback body
    const body = callback.body
    if (ts.isJsxElement(body) || ts.isJsxSelfClosingElement(body) || ts.isJsxFragment(body)) {
      const transformed = transformNode(body, ctx)
      if (transformed) {
        children = [transformed]
      }
    } else if (ts.isConditionalExpression(body)) {
      // Ternary directly in callback: items.map(item => cond ? <A/> : <B/>)
      children = [transformConditional(body, ctx)]
    } else if (ts.isParenthesizedExpression(body)) {
      let inner = body.expression
      while (ts.isParenthesizedExpression(inner)) {
        inner = inner.expression
      }
      if (ts.isJsxElement(inner) || ts.isJsxSelfClosingElement(inner) || ts.isJsxFragment(inner)) {
        const transformed = transformNode(inner, ctx)
        if (transformed) {
          children = [transformed]
        }
      } else if (ts.isConditionalExpression(inner)) {
        // Parenthesized ternary: items.map(item => (cond ? <A/> : <B/>))
        children = [transformConditional(inner, ctx)]
      }
    } else if (ts.isBlock(body)) {
      // Block body: (item) => { const label = ...; return <div>{label}</div> }
      const returnStmt = body.statements.find(
        (s): s is ts.ReturnStatement => ts.isReturnStatement(s) && s.expression != null
      )
      if (returnStmt && returnStmt.expression) {
        let returnExpr = returnStmt.expression
        while (ts.isParenthesizedExpression(returnExpr)) {
          returnExpr = returnExpr.expression
        }
        if (ts.isJsxElement(returnExpr) || ts.isJsxSelfClosingElement(returnExpr) || ts.isJsxFragment(returnExpr)) {
          const transformed = transformNode(returnExpr, ctx)
          if (transformed) {
            children = [transformed]
          }
        }
        const preambleStmts: string[] = []
        const templatePreambleStmts: string[] = []
        const typedPreambleStmts: string[] = []
        let hasTypeDiff = false
        let hasTemplateDiff = false
        for (const stmt of body.statements) {
          if (stmt === returnStmt) break
          const js = ctx.getJS(stmt)
          const tjs = ctx.getTemplateJS(stmt)
          const ts = stmt.getText(ctx.sourceFile)
          preambleStmts.push(js.endsWith(';') ? js : js + ';')
          templatePreambleStmts.push(tjs.endsWith(';') ? tjs : tjs + ';')
          typedPreambleStmts.push(ts.endsWith(';') ? ts : ts + ';')
          if (js !== ts) hasTypeDiff = true
          if (js !== tjs) hasTemplateDiff = true
        }
        if (preambleStmts.length > 0) {
          mapPreamble = preambleStmts.join(' ')
          if (hasTemplateDiff) {
            templateMapPreamble = templatePreambleStmts.join(' ')
          }
          if (hasTypeDiff) {
            typedMapPreamble = typedPreambleStmts.join(' ')
          }
        }
      }
    }

    // Unregister loop params
    ctx.loopParams.delete(param)
    if (index) ctx.loopParams.delete(index)
  }

  // If no JSX children were found (e.g., callback returns a function call),
  // fall back to treating the entire .map() expression as an IRExpression.
  if (children.length === 0) {
    return null
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

  // Determine if array is static (prop) or dynamic (signal/memo).
  // Static arrays don't need reconcileList — SSR elements are hydrated
  // directly. Signal / memo arrays need reconcileList for dynamic DOM
  // updates.
  //
  // Solid-style wrap-by-default fallback (#943, follow-up to
  // #937/#939/#940/#941/#942): if the array expression AST contains a
  // function call but the analyzer can't recognise the callee as a
  // signal / memo, we still force reconciliation. `getItems().map(...)`
  // where `getItems` is an imported helper previously silent-dropped
  // into the static-render path, freezing the SSR-time list on the
  // client. Over-reconciling an array that happens to contain a pure
  // call costs one extra `reconcileList` per loop; under-reconciling
  // is the silent-drop bug this closes.
  const isStaticArray =
    !isSignalOrMemoArray(array, ctx) && !exprHasFunctionCalls(arrayExpr)

  // Collect nested components for both static and dynamic arrays.
  // Static arrays: needed for initChild hydration.
  // Dynamic arrays with native root + component descendants: enables reconcileElements
  // with composite rendering (placeholder + createComponent replacement).
  const nestedComponents = collectNestedComponents(children).filter(c => c.name !== childComponent?.name)

  return {
    type: 'loop',
    array,
    templateArray,
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
    mapPreamble,
    templateMapPreamble,
    paramType,
    indexType,
    typedMapPreamble,
    loc: getSourceLocation(node, ctx.sourceFile, ctx.filePath),
  }
}

/**
 * Recursively collect all components nested within loop children.
 * Tracks loop nesting depth so composite element reconciliation knows
 * which components are inside inner loops (loopDepth > 0).
 */
function collectNestedComponents(nodes: IRNode[]): IRLoopChildComponent[] {
  const result: IRLoopChildComponent[] = []

  function traverse(node: IRNode, loopDepth: number, innerLoopArray?: string): void {
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
        loopDepth,
        innerLoopArray,
      })
      // Also traverse component children to find deeply nested components
      if (node.children) {
        node.children.forEach(c => traverse(c, loopDepth, innerLoopArray))
      }
    }
    if (node.type === 'element' && node.children) {
      node.children.forEach(c => traverse(c, loopDepth, innerLoopArray))
    }
    if (node.type === 'fragment' && node.children) {
      node.children.forEach(c => traverse(c, loopDepth, innerLoopArray))
    }
    if (node.type === 'loop' && node.children) {
      // Entering an inner loop — increment depth, record array expression
      node.children.forEach(c => traverse(c, loopDepth + 1, node.array))
    }
    if (node.type === 'conditional') {
      traverse(node.whenTrue, loopDepth, innerLoopArray)
      traverse(node.whenFalse, loopDepth, innerLoopArray)
    }
  }

  nodes.forEach(n => traverse(n, 0))
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
          templateValue: ctx.getTemplateJS(attr.expression),
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
          originalAttr: name,
          handler: ctx.getJS(attr.initializer.expression),
          loc: getSourceLocation(attr, ctx.sourceFile, ctx.filePath),
        })
      }
      continue
    }

    // Regular attribute
    const attrResult = getAttributeValue(attr, ctx)
    const { value, dynamic, isLiteral } = attrResult
    // Compute templateValue for dynamic string attributes
    let templateValue: string | undefined
    if (dynamic && typeof value === 'string' && attr.initializer && ts.isJsxExpression(attr.initializer) && attr.initializer.expression) {
      templateValue = rewriteBarePropRefs(value, attr.initializer.expression, ctx)
    }
    attrs.push({
      name,
      value,
      templateValue,
      dynamic,
      isLiteral,
      loc: getSourceLocation(attr, ctx.sourceFile, ctx.filePath),
      ...pickAttrMeta(attrResult),
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

    // Static style object: style={{ key: 'value', ... }} → CSS string at compile time
    if (attr.name.getText(ctx.sourceFile) === 'style' && ts.isObjectLiteralExpression(expr)) {
      const cssString = tryStaticStyleObjectToCss(expr)
      if (cssString !== null) {
        return { value: cssString, dynamic: false, isLiteral: true }
      }
    }

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
 * Convert a static style object literal to a CSS string at compile time.
 * Returns null if any property value is non-static (dynamic expression, template literal, etc.).
 *
 * @example
 * // { background: 'red', fontSize: '16px' } → "background:red;font-size:16px"
 */
function tryStaticStyleObjectToCss(expr: ts.ObjectLiteralExpression): string | null {
  const parts: string[] = []
  for (const prop of expr.properties) {
    if (!ts.isPropertyAssignment(prop)) return null
    if (!ts.isIdentifier(prop.name) && !ts.isStringLiteral(prop.name)) return null
    if (!ts.isStringLiteral(prop.initializer)) return null
    const key = prop.name.text.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`)
    parts.push(`${key}:${prop.initializer.text}`)
  }
  return parts.join(';')
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
        const val = ctx.getJS(span.expression)
        const tVal = rewriteBarePropRefs(val, span.expression, ctx)
        parts.push({ type: 'string', value: `\${${val}}`, templateValue: tVal ? `\${${tVal}}` : undefined })
      }
    } else {
      // Non-ternary expression: keep as ${expr}
      const val = ctx.getJS(span.expression)
      const tVal = rewriteBarePropRefs(val, span.expression, ctx)
      parts.push({ type: 'string', value: `\${${val}}`, templateValue: tVal ? `\${${tVal}}` : undefined })
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
    const condition = ctx.getJS(expr.condition)
    return {
      type: 'ternary',
      condition,
      templateCondition: rewriteBarePropRefs(condition, expr.condition, ctx),
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
          templateValue: ctx.getTemplateJS(attr.expression),
          dynamic: true,
          isLiteral: false,
          loc: getSourceLocation(attr, ctx.sourceFile, ctx.filePath),
        })
      }
      continue
    }

    if (!ts.isJsxAttribute(attr)) continue

    const name = attr.name.getText(ctx.sourceFile)

    // Detect JSX element/fragment as prop value: controls={<select ... />}
    // Also handle parenthesized JSX: controls={(<div>...</div>)}
    if (attr.initializer && ts.isJsxExpression(attr.initializer) && attr.initializer.expression) {
      let jsxExpr = attr.initializer.expression
      // Unwrap parenthesized expression: controls={(<div>...</div>)}
      while (ts.isParenthesizedExpression(jsxExpr)) {
        jsxExpr = jsxExpr.expression
      }
      if (ts.isJsxElement(jsxExpr) || ts.isJsxSelfClosingElement(jsxExpr) || ts.isJsxFragment(jsxExpr)) {
        const prevInsideComponentChildren = ctx.insideComponentChildren
        ctx.insideComponentChildren = true
        const irNode = transformNode(jsxExpr, ctx)
        ctx.insideComponentChildren = prevInsideComponentChildren
        if (irNode) {
          props.push({
            name,
            value: '__jsx_prop',
            dynamic: true,
            isLiteral: false,
            loc: getSourceLocation(attr, ctx.sourceFile, ctx.filePath),
            jsxChildren: [irNode],
          })
          continue
        }
      }
    }

    const attrResult = getAttributeValue(attr, ctx)
    const { value, dynamic, isLiteral } = attrResult

    // For component props, convert IRTemplateLiteral back to string expression
    // since props are passed to components as-is
    const propValue = templateLiteralToString(value) ?? 'true'

    // Compute templateValue for dynamic string props
    let propTemplateValue: string | undefined
    if (dynamic && typeof value === 'string' && attr.initializer && ts.isJsxExpression(attr.initializer) && attr.initializer.expression) {
      propTemplateValue = rewriteBarePropRefs(propValue, attr.initializer.expression, ctx)
    }

    props.push({
      name,
      value: propValue,
      templateValue: propTemplateValue,
      dynamic,
      isLiteral,
      loc: getSourceLocation(attr, ctx.sourceFile, ctx.filePath),
      ...pickAttrMeta(attrResult),
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
 * Phase 1 reactivity detection: determines the `reactive: boolean` flag on IR nodes
 * during JSX → IR transformation.
 *
 * This operates on TypeScript AST nodes and source text, using the TypeChecker when
 * available for precise Reactive<T> branded-type detection, with regex fallbacks.
 *
 * Unlike Phase 2's `needsEffectWrapper` (in ir-to-client-js/reactivity.ts), this function:
 * - Has access to the TypeChecker and full AST for type-level analysis
 * - Follows local constant references transitively (e.g., `const x = count()`)
 * - Does NOT need a `children` skip because children are processed as child JSX nodes
 *   in the AST, not as named props — they never appear as `props.children` expressions here
 *
 * Detection strategy:
 * 1. TypeChecker: walk AST to find Reactive<T> branded types (signals, memos, FieldReturn, etc.)
 * 2. Signal/memo regex: fallback for when TypeChecker cannot resolve types (e.g., virtual file paths)
 * 3. Props regex: props are always potentially reactive (parent passes getters) but aren't
 *    branded with Reactive<T> since users define props interfaces directly.
 *    Regex is the right tool here — props detection is name-based by design.
 */
/**
 * Check if an expression references a loop parameter.
 * Used by conditional transforms to assign slotId for per-item signal reactivity.
 * NOT added to isReactiveExpression to avoid promoting text expressions
 * like {item.name} to reactive (they use a separate slotId path).
 */
function referencesLoopParam(expr: string, ctx: TransformContext): boolean {
  if (ctx.loopParams.size === 0) return false
  for (const p of ctx.loopParams) {
    if (new RegExp(`\\b${p}\\b`).test(expr)) return true
  }
  return false
}

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
    // Skip key — it's used for loop reconciliation, not rendered to DOM
    if (attr.name === 'key') continue
    if (attr.dynamic && attr.value) {
      const valueToCheck = getAttributeValueAsString(attr.value)
      if (!valueToCheck) continue

      if (isSignalOrMemoReference(valueToCheck, ctx) || isPropsReference(valueToCheck, ctx)) {
        return true
      }
      // Check if attribute references any active loop parameters —
      // loop root elements need a slotId so className can be updated reactively.
      if (ctx.loopParams.size > 0) {
        for (const p of ctx.loopParams) {
          if (new RegExp(`\\b${p}\\b`).test(valueToCheck)) return true
        }
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
    } else if (child.type === 'conditional') {
      // Recurse into conditional branches so loops inside fragment branches
      // (which lack an enclosing element) inherit the ancestor element's slotId.
      // Stops at element boundaries — inner elements set their own slotId first.
      propagateSlotIdToLoops([child.whenTrue], slotId)
      propagateSlotIdToLoops([child.whenFalse], slotId)
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
    const templateCondition = rewriteBarePropRefs(condition, condReturn.condition, ctx)

    // Transform the JSX return in the then branch
    // Reset isRoot so each branch gets needsScope=true
    ctx.isRoot = true
    const consequent = transformNode(condReturn.jsxReturn, ctx)
    if (!consequent) {
      continue
    }

    // Collect scope variables with their initializers
    const scopeVariables: Array<{ name: string; initializer: string; templateInitializer?: string }> = []
    for (const decl of condReturn.scopeVariables) {
      if (ts.isIdentifier(decl.name) && decl.initializer) {
        const init = ctx.getJS(decl.initializer)
        scopeVariables.push({
          name: decl.name.text,
          initializer: init,
          templateInitializer: rewriteBarePropRefs(init, decl.initializer, ctx),
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
      templateCondition,
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
