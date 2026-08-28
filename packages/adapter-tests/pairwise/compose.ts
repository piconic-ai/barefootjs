/**
 * Pairwise case synthesis (#2481 step 5, "Pairwise generator (t=2 floor)").
 *
 * Turns one `AxisCombo` (a value per axis in `axes.ts`) into a compilable
 * BarefootJS TSX component. Per-axis logic is a typed builder function that
 * takes already-built AST nodes as arguments and returns AST nodes via
 * `ts.factory` — composition is function application, not hole-filling
 * (CLAUDE.md's "never carry mixed content through the compiler as
 * sentinel-bearing strings" rule, applied to a tool that GENERATES source
 * instead of one that reads it).
 *
 * The one place a textual template earns its keep is the `structure` axis:
 * a keyed/nested/fragment loop shape is far more legible as a literal TSX
 * snippet than as nested `ts.factory.createJsx*` calls. Each snippet is a
 * FIXED, hand-authored constant (never built by concatenating or
 * interpolating variable text — that would be exactly the string-sentinel
 * anti-pattern this file exists to avoid) containing marker IDENTIFIERS
 * (`__source`, `__rowContent`, `__eventAttrs`, `__condition`), parsed once
 * with `ts.createSourceFile`, then substituted at the AST node level by
 * `substituteMarkers`. A marker referenced by a template but not supplied
 * throws immediately; `assertNoMarkers` is a second, whole-file backstop
 * run once composition finishes, so a marker that leaks through some path
 * `substituteMarkers` doesn't recognize fails loudly instead of silently
 * generating a case that tests nothing.
 */

import ts from 'typescript'
import type { InteractionStep } from '../src/types'
import type { AxisCombo, BindingValue, CallbackValue, EventValue, StateValue, StructureValue } from './axes'
import { isLoopStructure } from './axes'

const factory = ts.factory

// =============================================================================
// Marker identifiers — see the module docstring. Each is consumed by
// `substituteMarkers` at a specific, recognized AST shape; anything else is
// a bug in a template, not a case to silently emit.
// =============================================================================

const MARKER_SOURCE = '__source'
const MARKER_ROW_CONTENT = '__rowContent'
const MARKER_EVENT_ATTRS = '__eventAttrs'
const MARKER_CONDITION = '__condition'
const MARKERS: readonly string[] = [MARKER_SOURCE, MARKER_ROW_CONTENT, MARKER_EVENT_ATTRS, MARKER_CONDITION]

interface MarkerSubs {
  source?: ts.Expression
  rowContent?: ts.JsxElement | ts.JsxSelfClosingElement
  eventAttrs?: ts.JsxAttribute[]
  condition?: ts.Expression
}

/**
 * Substitute marker identifiers in `root` for real AST nodes. Two shapes
 * are recognized structurally (not by blind identifier replacement):
 *
 *   - `{...__eventAttrs}` (a `JsxSpreadAttribute` whose expression is the
 *     marker) expands to the supplied attribute LIST in place — returning
 *     an array from visiting one `JsxSpreadAttribute` node relies on
 *     `ts.visitEachChild`'s splicing behavior for `NodeArray`-typed fields
 *     (`JsxAttributes.properties`), verified against the installed
 *     TypeScript version by `pairwise-covering-array.test.ts`.
 *   - a bare `__source` / `__rowContent` / `__condition` identifier
 *     substitutes to a single node wherever it appears (an expression
 *     operand, or the sole child of a `{}` JSX expression container —
 *     which is why `__rowContent` is deliberately wrapped as
 *     `{__rowContent}` in every template: replacing the identifier leaves
 *     a syntactically valid `{<jsx-node>}` container, never bare JSX
 *     spliced where an expression is expected).
 *
 * A marker used by a template but not present in `subs` throws rather than
 * leaving the identifier in place — see the module docstring.
 */
function substituteMarkers(root: ts.Node, subs: MarkerSubs): ts.Node {
  const visit: ts.Visitor = node => {
    if (ts.isJsxSpreadAttribute(node) && ts.isIdentifier(node.expression) && node.expression.text === MARKER_EVENT_ATTRS) {
      if (!subs.eventAttrs) throw new Error(`pairwise compose: template uses ${MARKER_EVENT_ATTRS} but no substitute was supplied`)
      return subs.eventAttrs as unknown as ts.Node
    }
    if (ts.isIdentifier(node)) {
      if (node.text === MARKER_SOURCE) {
        if (!subs.source) throw new Error(`pairwise compose: template uses ${MARKER_SOURCE} but no substitute was supplied`)
        return subs.source
      }
      if (node.text === MARKER_ROW_CONTENT) {
        if (!subs.rowContent) throw new Error(`pairwise compose: template uses ${MARKER_ROW_CONTENT} but no substitute was supplied`)
        return subs.rowContent
      }
      if (node.text === MARKER_CONDITION) {
        if (!subs.condition) throw new Error(`pairwise compose: template uses ${MARKER_CONDITION} but no substitute was supplied`)
        return subs.condition
      }
      // Rebuild non-marker identifiers too, for the same stale-position
      // reason documented below — an identifier is a leaf like any other.
      return factory.createIdentifier(node.text)
    }
    // Rebuild leaf literals via the factory rather than letting
    // `ts.visitEachChild`'s "nothing changed, return the original node"
    // fast path pass them through untouched. An untouched leaf keeps the
    // real `pos`/`end` it had in ITS OWN parsed snippet's source text;
    // once spliced into the hand-assembled `ts.SourceFile` this module
    // prints, the printer's JSX-attribute/literal fast path re-slices
    // raw text using the FINAL file's (unrelated, and shorter) text at
    // those stale offsets — silently emitting an empty string (observed
    // as `className=` losing its value entirely). Rebuilding forces a
    // fresh synthesized (`pos: -1`) node, which the printer always
    // serializes from `.text`, and forces every ancestor up the chain to
    // rebuild too (defeating the same identity fast path there).
    if (ts.isStringLiteral(node)) return factory.createStringLiteral(node.text)
    if (ts.isNumericLiteral(node)) return factory.createNumericLiteral(node.text)
    if (ts.isJsxText(node)) return factory.createJsxText(node.text, node.containsOnlyTriviaWhiteSpaces)
    if (ts.isNoSubstitutionTemplateLiteral(node)) return factory.createNoSubstitutionTemplateLiteral(node.text)
    return ts.visitEachChild(node, visit, ts.nullTransformationContext)
  }
  return visit(root) as ts.Node
}

/**
 * Whole-tree backstop: throws if any marker identifier survived to the
 * final assembled AST. Under correct operation this never fires —
 * `substituteMarkers` throws eagerly the moment it recognizes a marker
 * with nothing to substitute — but it is the loud fallback for a marker
 * appearing in a shape `substituteMarkers` doesn't structurally recognize
 * (e.g. a template author's typo placing `__eventAttrs` somewhere other
 * than a spread attribute). Exported so the contract test can exercise it
 * directly against a deliberately-unsubstituted tree.
 */
export function assertNoMarkers(root: ts.Node): void {
  const walk = (node: ts.Node): void => {
    if (ts.isIdentifier(node) && MARKERS.includes(node.text)) {
      throw new Error(`pairwise compose: marker identifier '${node.text}' survived to the final AST — a case would silently test nothing`)
    }
    ts.forEachChild(node, walk)
  }
  walk(root)
}

// =============================================================================
// Snippet parsing helpers. Every snippet below is a FIXED literal string —
// never built from concatenation or interpolation of case-specific data.
// =============================================================================

function unwrapParen(expr: ts.Expression): ts.Expression {
  let e = expr
  while (ts.isParenthesizedExpression(e)) e = e.expression
  return e
}

/** Parses a bare JSX/ternary snippet (an EXPRESSION, wrapped here in a throwaway `return (...)`) and returns it unwrapped. */
function parseTemplateExpression(snippet: string): ts.Expression {
  const wrapped = `function __pairwiseTemplate() {\n  return (\n${snippet}\n  )\n}\n`
  const sf = ts.createSourceFile('pairwise-template.tsx', wrapped, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  const fn = sf.statements[0] as ts.FunctionDeclaration
  const ret = (fn.body!.statements[0] as ts.ReturnStatement).expression!
  return unwrapParen(ret)
}

/** Parses a snippet as a complete top-level statement (a function declaration). */
function parseTopLevelStatement(snippet: string): ts.Statement {
  const sf = ts.createSourceFile('pairwise-decl.tsx', snippet, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  return sf.statements[0]
}

/** Parses the `early-return` shape: a two-statement function body (`if (...) return <A/>` then a fallback `return <B/>`). */
function parseIfAndFallback(snippet: string): { ifStatement: ts.IfStatement; fallback: ts.Expression } {
  const wrapped = `function __pairwiseTemplate() {\n${snippet}\n}\n`
  const sf = ts.createSourceFile('pairwise-early-return.tsx', wrapped, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  const fn = sf.statements[0] as ts.FunctionDeclaration
  const [ifStatement, fallbackReturn] = fn.body!.statements as unknown as [ts.IfStatement, ts.ReturnStatement]
  // The fallback carries no markers, but it still goes through
  // `substituteMarkers` for the LEAF-REBUILD side effect every other parsed
  // subtree in this file gets. TypeScript's printer splices a literal's raw
  // text from its ORIGINAL source positions (`canUseOriginalText` checks only
  // `nodeIsSynthesized` + `node.parent`, never whether the file matches), so
  // an unrebuilt `StringLiteral` spliced into the assembled file prints from
  // the wrong offsets. Today's fallback is bare `JsxText`, which resolves its
  // own file through `.parent` and survives — but that is luck, not a design.
  // Verified: giving this fallback a `className` without the rebuild prints
  // `<div className=>fallback</div>`, the attribute value silently dropped.
  return { ifStatement, fallback: substituteMarkers(unwrapParen(fallbackReturn.expression!), {}) as ts.Expression }
}

// =============================================================================
// Small ts.factory shortcuts
// =============================================================================

const id = (name: string): ts.Identifier => factory.createIdentifier(name)
const strLit = (s: string): ts.StringLiteral => factory.createStringLiteral(s)
const numLit = (n: number): ts.NumericLiteral => factory.createNumericLiteral(n)
const call = (expr: ts.Expression, args: ts.Expression[] = []): ts.CallExpression => factory.createCallExpression(expr, undefined, args)
const prop = (expr: ts.Expression, name: string): ts.PropertyAccessExpression => factory.createPropertyAccessExpression(expr, name)
const exprStmt = (expr: ts.Expression): ts.ExpressionStatement => factory.createExpressionStatement(expr)
const block = (stmts: ts.Statement[]): ts.Block => factory.createBlock(stmts, true)
const paren = (expr: ts.Expression): ts.ParenthesizedExpression => factory.createParenthesizedExpression(expr)
const boolCall = (expr: ts.Expression): ts.CallExpression => call(id('Boolean'), [expr])

function constStatement(name: string, init: ts.Expression): ts.VariableStatement {
  return factory.createVariableStatement(
    undefined,
    factory.createVariableDeclarationList([factory.createVariableDeclaration(id(name), undefined, undefined, init)], ts.NodeFlags.Const),
  )
}

function constArrayDestructure(first: string, second: string, init: ts.Expression): ts.VariableStatement {
  return factory.createVariableStatement(
    undefined,
    factory.createVariableDeclarationList(
      [
        factory.createVariableDeclaration(
          factory.createArrayBindingPattern([
            factory.createBindingElement(undefined, undefined, first, undefined),
            factory.createBindingElement(undefined, undefined, second, undefined),
          ]),
          undefined,
          undefined,
          init,
        ),
      ],
      ts.NodeFlags.Const,
    ),
  )
}

function jsxAttrExpr(name: string, value: ts.Expression): ts.JsxAttribute {
  return factory.createJsxAttribute(id(name), factory.createJsxExpression(undefined, value))
}
function jsxAttrStr(name: string, value: string): ts.JsxAttribute {
  return factory.createJsxAttribute(id(name), strLit(value))
}
function jsxSelfClosing(tag: string, attrs: ts.JsxAttribute[]): ts.JsxSelfClosingElement {
  return factory.createJsxSelfClosingElement(id(tag), undefined, factory.createJsxAttributes(attrs))
}
function jsxElement(tag: string, attrs: ts.JsxAttribute[], children: ts.JsxChild[]): ts.JsxElement {
  return factory.createJsxElement(
    factory.createJsxOpeningElement(id(tag), undefined, factory.createJsxAttributes(attrs)),
    children,
    factory.createJsxClosingElement(id(tag)),
  )
}
function jsxExprChild(expr: ts.Expression): ts.JsxExpression {
  return factory.createJsxExpression(undefined, expr)
}
function templateStyleString(expr: ts.Expression): ts.TemplateExpression {
  return factory.createTemplateExpression(factory.createTemplateHead('--n: '), [factory.createTemplateSpan(expr, factory.createTemplateTail(''))])
}

// =============================================================================
// State axis
// =============================================================================

interface StateBuild {
  usesProps: boolean
  sampleProps: Record<string, unknown>
  declarations: ts.Statement[]
  usesCreateSignal: boolean
  usesCreateMemo: boolean
  /** Display/read expression handed to the `binding` axis. Intentionally UNCALLED for `getter-elided-signal` (see BF044) — every other value calls its getter properly. */
  valueExpr: ts.Expression
  /** Always a properly-called read, safe to use inside handler logic regardless of `valueExpr`'s shape. */
  readExpr: ts.Expression
  setterCall: ((newValue: ts.Expression) => ts.Expression) | null
}

/**
 * Whether `buildState(value)`'s condition read (`Boolean(<initial value>)`)
 * is true on first render, BEFORE any interaction — hardcoded against the
 * literal seeds below (`0` for every reactive/getter-elided state, the `7`
 * sample for `prop`/`prop-shadowing-signal`) rather than evaluating the
 * built AST, since those seeds are themselves small, fixed, hand-authored
 * constants a reviewer can read directly against this switch.
 *
 * Consumed by `pairwise-covering-array.test.ts`'s branch-selection
 * exemption table: `conditional-ternary`/`early-return` each have a branch
 * WITHOUT the row (by design — see their templates below), and which
 * branch SSR renders depends entirely on this, not on the `event` axis.
 */
export function stateInitialValueIsTruthy(value: StateValue): boolean {
  switch (value) {
    case 'signal':
    case 'memo':
    case 'getter-elided-signal':
      return false
    case 'prop':
    case 'prop-shadowing-signal':
      return true
  }
}

/**
 * Every state value shares the binding name `val`/`setVal` (or the `val`
 * prop key) so `binding`/`event` builders never need to know which state
 * value produced their input — only its `readExpr`/`valueExpr`/`setterCall`.
 */
function buildState(value: StateValue): StateBuild {
  switch (value) {
    case 'signal': {
      const decl = constArrayDestructure('val', 'setVal', call(id('createSignal'), [numLit(0)]))
      return {
        usesProps: false,
        sampleProps: {},
        declarations: [decl],
        usesCreateSignal: true,
        usesCreateMemo: false,
        valueExpr: call(id('val')),
        readExpr: call(id('val')),
        setterCall: v => call(id('setVal'), [v]),
      }
    }
    case 'memo': {
      const signalDecl = constArrayDestructure('val', 'setVal', call(id('createSignal'), [numLit(0)]))
      const memoDecl = constStatement(
        'doubled',
        call(id('createMemo'), [factory.createArrowFunction(undefined, undefined, [], undefined, undefined, factory.createBinaryExpression(call(id('val')), ts.SyntaxKind.AsteriskToken, numLit(2)))]),
      )
      return {
        usesProps: false,
        sampleProps: {},
        declarations: [signalDecl, memoDecl],
        usesCreateSignal: true,
        usesCreateMemo: true,
        valueExpr: call(id('doubled')),
        readExpr: call(id('doubled')),
        setterCall: v => call(id('setVal'), [v]),
      }
    }
    case 'prop': {
      const expr = prop(id('props'), 'val')
      return {
        usesProps: true,
        sampleProps: { val: 7 },
        declarations: [],
        usesCreateSignal: false,
        usesCreateMemo: false,
        valueExpr: expr,
        readExpr: expr,
        setterCall: null,
      }
    }
    case 'prop-shadowing-signal': {
      // The local `val` binding SHADOWS the `val` prop key for the rest
      // of the function body — the #2468-class scope-leak target.
      const decl = constArrayDestructure('val', 'setVal', call(id('createSignal'), [prop(id('props'), 'val')]))
      return {
        usesProps: true,
        sampleProps: { val: 7 },
        declarations: [decl],
        usesCreateSignal: true,
        usesCreateMemo: false,
        valueExpr: call(id('val')),
        readExpr: call(id('val')),
        setterCall: v => call(id('setVal'), [v]),
      }
    }
    case 'getter-elided-signal': {
      const decl = constArrayDestructure('val', 'setVal', call(id('createSignal'), [numLit(0)]))
      return {
        usesProps: false,
        sampleProps: {},
        declarations: [decl],
        usesCreateSignal: true,
        usesCreateMemo: false,
        // Deliberately uncalled — exercises the BF044 "getter not called"
        // refusal surface across every structure/binding combo it's paired
        // with. A `refused` sweep status here is the designed PASS.
        valueExpr: id('val'),
        readExpr: call(id('val')),
        setterCall: v => call(id('setVal'), [v]),
      }
    }
  }
}

// =============================================================================
// Loop array-source axis (driven by `structure`, not a separate axis value)
// =============================================================================

interface RowType {
  id: number
  label: string
  n: number
  active: boolean
}
const SAMPLE_ROWS: RowType[] = [
  { id: 1, label: 'Alpha', n: 3, active: true },
  { id: 2, label: 'Beta', n: 1, active: false },
  { id: 3, label: 'Gamma', n: 2, active: true },
]

function rowsLiteral(): ts.ArrayLiteralExpression {
  return factory.createArrayLiteralExpression(
    SAMPLE_ROWS.map(row =>
      factory.createObjectLiteralExpression(
        [
          factory.createPropertyAssignment('id', numLit(row.id)),
          factory.createPropertyAssignment('label', strLit(row.label)),
          factory.createPropertyAssignment('n', numLit(row.n)),
          factory.createPropertyAssignment('active', row.active ? factory.createTrue() : factory.createFalse()),
          factory.createPropertyAssignment(
            'children',
            factory.createArrayLiteralExpression([
              factory.createObjectLiteralExpression([factory.createPropertyAssignment('id', numLit(row.id * 10)), factory.createPropertyAssignment('label', strLit(`${row.label}-child`))]),
            ]),
          ),
        ],
        true,
      ),
    ),
    true,
  )
}

interface ArraySourceBuild {
  declarations: ts.Statement[]
  usesCreateSignal: boolean
  baseExpr: ts.Expression
}

function buildArraySource(structure: StructureValue): ArraySourceBuild {
  if (structure === 'static-array-loop') {
    return { declarations: [constStatement('items', rowsLiteral())], usesCreateSignal: false, baseExpr: id('items') }
  }
  return {
    declarations: [constArrayDestructure('items', 'setItems', call(id('createSignal'), [rowsLiteral()]))],
    usesCreateSignal: true,
    baseExpr: call(id('items')),
  }
}

// =============================================================================
// Callback axis — array-source decoration + generic handler shaping
// =============================================================================

interface CallbackDecoration {
  declarations: ts.Statement[]
  sourceExpr: ts.Expression
}

/**
 * Only `sort-comparator` / `filter-predicate` / `flatmap-callback` decorate
 * the array source (constrained to loop structures in `covering-array.ts`).
 * `inline-arrow` / `function-reference` leave the source undecorated —
 * they instead shape the row/handler CALLBACK itself, via `shapeCallback`.
 */
function decorateSource(value: CallbackValue, base: ts.Expression): CallbackDecoration {
  switch (value) {
    case 'sort-comparator': {
      const comparator = factory.createArrowFunction(
        undefined,
        undefined,
        [factory.createParameterDeclaration(undefined, undefined, 'a'), factory.createParameterDeclaration(undefined, undefined, 'b')],
        undefined,
        undefined,
        factory.createBinaryExpression(prop(id('a'), 'n'), ts.SyntaxKind.MinusToken, prop(id('b'), 'n')),
      )
      return { declarations: [constStatement('byN', comparator)], sourceExpr: call(prop(base, 'sort'), [id('byN')]) }
    }
    case 'filter-predicate': {
      const predicate = factory.createArrowFunction(
        undefined,
        undefined,
        [factory.createParameterDeclaration(undefined, undefined, 'row')],
        undefined,
        undefined,
        prop(id('row'), 'active'),
      )
      return { declarations: [constStatement('isActive', predicate)], sourceExpr: call(prop(base, 'filter'), [id('isActive')]) }
    }
    case 'flatmap-callback': {
      const projector = factory.createArrowFunction(
        undefined,
        undefined,
        [factory.createParameterDeclaration(undefined, undefined, 'row')],
        undefined,
        undefined,
        factory.createArrayLiteralExpression([id('row')]),
      )
      return { declarations: [constStatement('expandRow', projector)], sourceExpr: call(prop(base, 'flatMap'), [id('expandRow')]) }
    }
    case 'inline-arrow':
    case 'function-reference':
      return { declarations: [], sourceExpr: base }
  }
}

/**
 * Shapes a handler/ref callback per the `callback` axis: `function-reference`
 * hoists it to a named `const` and passes the identifier by reference;
 * every other value (including the three array-decoration values, which
 * have already spent their "shape" on the source above) inlines it.
 */
function shapeCallback(
  value: CallbackValue,
  name: string,
  params: ts.ParameterDeclaration[],
  body: ts.Block,
): { decl: ts.Statement | null; ref: ts.Expression } {
  const arrow = factory.createArrowFunction(undefined, undefined, params, undefined, factory.createToken(ts.SyntaxKind.EqualsGreaterThanToken), body)
  if (value !== 'function-reference') return { decl: null, ref: arrow }
  return { decl: constStatement(name, arrow), ref: id(name) }
}

// =============================================================================
// Binding axis — produces the row content a structure repeats/places
// =============================================================================

function buildBinding(value: BindingValue, state: StateBuild): ts.JsxElement | ts.JsxSelfClosingElement {
  switch (value) {
    case 'text':
      return jsxElement('span', [], [jsxExprChild(state.valueExpr)])
    case 'attr':
      return jsxElement('span', [jsxAttrExpr('data-count', state.valueExpr)], [])
    case 'class':
      return jsxElement('span', [jsxAttrExpr('className', factory.createConditionalExpression(boolCall(state.valueExpr), undefined, strLit('on'), undefined, strLit('off')))], [])
    case 'style':
      return jsxElement('span', [jsxAttrExpr('style', templateStyleString(state.valueExpr))], [])
    case 'controlled-input': {
      const setter = requireSetter(state, 'controlled-input')
      const onInput = factory.createArrowFunction(
        undefined,
        undefined,
        [factory.createParameterDeclaration(undefined, undefined, 'e')],
        undefined,
        undefined,
        setter(call(id('Number'), [prop(prop(id('e'), 'target'), 'value')])),
      )
      return jsxSelfClosing('input', [jsxAttrExpr('value', call(id('String'), [state.valueExpr])), jsxAttrExpr('onInput', onInput)])
    }
    case 'controlled-select': {
      const setter = requireSetter(state, 'controlled-select')
      const onChange = factory.createArrowFunction(
        undefined,
        undefined,
        [factory.createParameterDeclaration(undefined, undefined, 'e')],
        undefined,
        undefined,
        setter(call(id('Number'), [prop(prop(id('e'), 'target'), 'value')])),
      )
      return jsxElement(
        'select',
        [jsxAttrExpr('value', call(id('String'), [state.valueExpr])), jsxAttrExpr('onChange', onChange)],
        [jsxElement('option', [jsxAttrStr('value', '0')], [factory.createJsxText('Zero', false)]), jsxElement('option', [jsxAttrStr('value', '1')], [factory.createJsxText('One', false)])],
      )
    }
    case 'controlled-textarea': {
      const setter = requireSetter(state, 'controlled-textarea')
      const onInput = factory.createArrowFunction(
        undefined,
        undefined,
        [factory.createParameterDeclaration(undefined, undefined, 'e')],
        undefined,
        undefined,
        setter(call(id('Number'), [prop(prop(id('e'), 'target'), 'value')])),
      )
      return jsxSelfClosing('textarea', [jsxAttrExpr('value', call(id('String'), [state.valueExpr])), jsxAttrExpr('onInput', onInput)])
    }
    case 'boolean-attr':
      return jsxSelfClosing('input', [jsxAttrStr('type', 'checkbox'), jsxAttrExpr('disabled', factory.createPrefixUnaryExpression(ts.SyntaxKind.ExclamationToken, boolCall(state.valueExpr)))])
  }
}

function requireSetter(state: StateBuild, binding: BindingValue): (v: ts.Expression) => ts.Expression {
  if (!state.setterCall) {
    throw new Error(`pairwise compose: binding '${binding}' requires a settable state value, but the chosen state has none (covering-array constraint violated)`)
  }
  return state.setterCall
}

// =============================================================================
// Event axis — produces attributes attached to the row/root element
// =============================================================================

interface EventCtx {
  state: StateBuild
  callback: CallbackValue
}

interface EventBuild {
  attrs: ts.JsxAttribute[]
  /** Safe to hoist to the component body — reads only outer/component-level state. */
  declarations: ts.Statement[]
  /**
   * Must be declared INSIDE the per-row loop callback, not the component
   * body — its body reads `row`/`idx`, which only exist in that scope. See
   * `handler-reading-loop-param` below for the one case that populates this.
   */
  rowScopedDeclarations: ts.Statement[]
}

function buildEvent(value: EventValue, ctx: EventCtx): EventBuild {
  const { state, callback } = ctx
  switch (value) {
    case 'direct-handler':
    case 'delegated-handler-in-row': {
      const body = state.setterCall
        ? [exprStmt(state.setterCall(factory.createBinaryExpression(state.readExpr, ts.SyntaxKind.PlusToken, numLit(1))))]
        : [exprStmt(call(prop(id('console'), 'log'), [state.readExpr]))]
      const { decl, ref } = shapeCallback(callback, 'handleClick', [], block(body))
      return { attrs: [jsxAttrExpr('onClick', ref)], declarations: decl ? [decl] : [], rowScopedDeclarations: [] }
    }
    case 'handler-reading-loop-param': {
      // `row`/`idx` are the fixed loop-param names every loop `structure`
      // template declares (see `LOOP_ROW_PARAM`/`LOOP_INDEX_PARAM` below) —
      // resolved by lexical scope once this attribute lands inside the
      // `.map((row, idx) => ...)` callback, not by any marker plumbing.
      // For `function-reference`, `shapeCallback` produces a NAMED `const`
      // — that const must be declared INSIDE the map callback (via
      // `rowScopedDeclarations`, injected by `injectRowScopedDeclarations`
      // below), never hoisted to the component body: the component body is
      // a different closure that never sees `row`/`idx`, so a hoisted
      // version reads them as free variables and throws `ReferenceError` at
      // render — caught as a real `ok`-sweep finding, not hypothetical.
      const body = [exprStmt(call(prop(id('console'), 'log'), [prop(id(LOOP_ROW_PARAM), 'id'), id(LOOP_INDEX_PARAM)]))]
      const { decl, ref } = shapeCallback(callback, 'handleRowClick', [], block(body))
      return { attrs: [jsxAttrExpr('onClick', ref)], declarations: [], rowScopedDeclarations: decl ? [decl] : [] }
    }
    case 'handler-reading-outer-signal': {
      const body = [exprStmt(call(prop(id('console'), 'log'), [strLit('outer'), state.readExpr]))]
      const { decl, ref } = shapeCallback(callback, 'handleOuterClick', [], block(body))
      return { attrs: [jsxAttrExpr('onClick', ref)], declarations: decl ? [decl] : [], rowScopedDeclarations: [] }
    }
    case 'ref-callback': {
      const elParam = factory.createParameterDeclaration(undefined, undefined, 'el')
      const body = [exprStmt(call(prop(id('el'), 'setAttribute'), [strLit('data-mounted'), call(id('String'), [state.readExpr])]))]
      const { decl, ref } = shapeCallback(callback, 'handleMount', [elParam], block(body))
      return { attrs: [jsxAttrExpr('ref', ref)], declarations: decl ? [decl] : [], rowScopedDeclarations: [] }
    }
  }
}

// =============================================================================
// Structure axis — see the module docstring for the marker-template design.
// =============================================================================

const LOOP_ROW_PARAM = 'row'
const LOOP_INDEX_PARAM = 'idx'

interface StructureInputs {
  /** The (possibly callback-decorated) array-source expression. Present only when `isLoopStructure(structure)`. */
  source?: ts.Expression
  rowContent: ts.JsxElement | ts.JsxSelfClosingElement
  eventAttrs: ts.JsxAttribute[]
  /** `Boolean(<state read>)` — present for every case; only `conditional-ternary`/`early-return` templates reference it. */
  condition: ts.Expression
  /** Statements that must land INSIDE the loop's `.map()` callback body — see `EventBuild.rowScopedDeclarations`. Empty for every structure but the loop ones, enforced by `assertEventRequiresLoop` upstream. */
  rowScopedDeclarations: ts.Statement[]
}

/**
 * Injects `statements` at the top of the OUTERMOST `.map(...)` callback's
 * body found in `expr` — converting an expression-bodied arrow
 * (`(row, idx) => (<jsx/>)`) to a block first if needed — the one scope
 * `row`/`idx` are bound in for every loop `structure` template. Targeting
 * the OUTER `.map()` (rather than hunting for the exact element
 * `eventAttrs` landed on) also covers `nested-loop-depth-2` for free: a
 * `const` declared in the outer callback's block is still visible from the
 * inner `.map()` callback's closure. A no-op when `statements` is empty, so
 * every case but `handler-reading-loop-param` × `function-reference` pays
 * nothing.
 */
function injectRowScopedDeclarations(expr: ts.Expression, statements: ts.Statement[]): ts.Expression {
  if (statements.length === 0) return expr
  let injected = false
  const visit = (node: ts.Node): ts.Node => {
    if (!injected && ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression) && node.expression.name.text === 'map' && node.arguments.length === 1 && ts.isArrowFunction(node.arguments[0])) {
      injected = true
      const arrow = node.arguments[0]
      const newBody = ts.isBlock(arrow.body) ? factory.updateBlock(arrow.body, [...statements, ...arrow.body.statements]) : block([...statements, factory.createReturnStatement(unwrapParen(arrow.body))])
      const newArrow = factory.updateArrowFunction(arrow, arrow.modifiers, arrow.typeParameters, arrow.parameters, arrow.type, arrow.equalsGreaterThanToken, newBody)
      return factory.updateCallExpression(node, node.expression, node.typeArguments, [newArrow])
    }
    return ts.visitEachChild(node, visit, ts.nullTransformationContext)
  }
  const result = visit(expr) as ts.Expression
  if (!injected) {
    throw new Error('pairwise compose: rowScopedDeclarations supplied but no .map() callback was found to host them (covering-array constraint violated)')
  }
  return result
}

interface StructureOutput {
  /** Statements inserted into the function body before the final `return` (e.g. an early-return `if`). */
  preStatements: ts.Statement[]
  returnExpr: ts.Expression
  /** Sibling top-level declarations this structure needs (a child component). */
  extraTopLevelDecls: ts.Statement[]
}

const ROW_LOOP_TEMPLATE_KEYED = `
    <ul>
      {__source.map((row, idx) => (
        <li key={row.id} {...__eventAttrs}>{__rowContent}</li>
      ))}
    </ul>
`

const ROW_LOOP_TEMPLATE_UNKEYED = `
    <ul>
      {__source.map((row, idx) => (
        <li {...__eventAttrs}>{__rowContent}</li>
      ))}
    </ul>
`

const NESTED_LOOP_TEMPLATE = `
    <ul>
      {__source.map((row, idx) => (
        <li key={row.id}>
          {row.children.map((child, cidx) => (
            <span key={child.id} {...__eventAttrs}>{__rowContent}</span>
          ))}
        </li>
      ))}
    </ul>
`

const COMPONENT_ROW_ROOT_TEMPLATE = `
    <div>
      {__source.map((row, idx) => (
        <PairwiseRow key={row.id} label={row.label} {...__eventAttrs}>{__rowContent}</PairwiseRow>
      ))}
    </div>
`

/**
 * Forwards via a rest spread (`{ label, children, ...rest }`), the same
 * open-ended-props-object shape `rest-spread-child-attrs` fixture pins for
 * #2131 — NOT `{...props}` including `label`/`children` themselves, which
 * would re-render `label` as a stray DOM attribute and double-render
 * `children`. Without this the div root never carries the event
 * attrs/handlers spread onto `<PairwiseRow>` at the call site, so
 * `data-pw-event` (and the click handler) silently reach nothing real.
 */
const COMPONENT_ROW_ROOT_CHILD_DECL = `
function PairwiseRow({ label, children, ...rest }: { label: string; children?: unknown; [key: string]: unknown }) {
  return <div className="row" {...rest}>{children}</div>
}
`

const FRAGMENT_ROW_LOOP_TEMPLATE = `
    <div>
      {__source.map((row, idx) => (
        <>
          <span {...__eventAttrs}>{__rowContent}</span>
        </>
      ))}
    </div>
`

const PREAMBLE_BUILDER_TEMPLATE = `
    <ul>
      {__source.map((row, idx) => {
        const label = row.label.toUpperCase()
        return (
          <li key={row.id} {...__eventAttrs}>{__rowContent}</li>
        )
      })}
    </ul>
`

const CONDITIONAL_TERNARY_TEMPLATE = `
    __condition ? (
      <div {...__eventAttrs}>{__rowContent}</div>
    ) : (
      <div>empty</div>
    )
`

const EARLY_RETURN_BODY = `
  if (__condition) {
    return (
      <div {...__eventAttrs}>{__rowContent}</div>
    )
  }
  return <div>fallback</div>
`

/**
 * No markers — deliberately. A top-level sibling function is a SEPARATE
 * JS closure from \`PairwiseCase\`'s body: content that reads \`val\`/\`row\`
 * (built assuming direct lexical access to \`PairwiseCase\`'s locals, per
 * every other structure's inline placement) would throw \`ReferenceError\`
 * at render time if spliced into this declaration's OWN body instead of
 * passed in as props at the call site — caught the hard way once, as a
 * \`broken\` sweep finding, before this docstring existed. \`__eventAttrs\`/
 * \`__rowContent\` are substituted onto the CALL SITE below
 * (\`CHILD_COMPONENT_CALL_TEMPLATE\`), which sits inside \`PairwiseCase\`'s
 * own return and therefore inside its actual scope.
 */
const CHILD_COMPONENT_CHILD_DECL = `
function PairwiseRow({ children, ...rest }: { children?: unknown; [key: string]: unknown }) {
  return <div className="child" {...rest}>{children}</div>
}
`

const CHILD_COMPONENT_CALL_TEMPLATE = `
    <PairwiseRow {...__eventAttrs}>{__rowContent}</PairwiseRow>
`

const FRAGMENT_TEMPLATE = `
    <>
      {__rowContent}
      <button {...__eventAttrs}>go</button>
    </>
`

function buildStructure(structure: StructureValue, inputs: StructureInputs): StructureOutput {
  if (inputs.rowScopedDeclarations.length > 0 && !isLoopStructure(structure)) {
    throw new Error(`pairwise compose: rowScopedDeclarations supplied for non-loop structure '${structure}' (covering-array constraint violated)`)
  }
  const subs: MarkerSubs = { source: inputs.source, rowContent: inputs.rowContent, eventAttrs: inputs.eventAttrs, condition: inputs.condition }

  const loopTemplate = (snippet: string): StructureOutput => ({
    preStatements: [],
    returnExpr: injectRowScopedDeclarations(substituteMarkers(parseTemplateExpression(snippet), subs) as ts.Expression, inputs.rowScopedDeclarations),
    extraTopLevelDecls: [],
  })

  switch (structure) {
    case 'keyed-loop':
    case 'static-array-loop':
    case 'signal-array-loop':
      return loopTemplate(ROW_LOOP_TEMPLATE_KEYED)
    case 'unkeyed-loop':
      return loopTemplate(ROW_LOOP_TEMPLATE_UNKEYED)
    case 'nested-loop-depth-2':
      return loopTemplate(NESTED_LOOP_TEMPLATE)
    case 'fragment-row-loop':
      return loopTemplate(FRAGMENT_ROW_LOOP_TEMPLATE)
    case 'preamble-builder-body':
      return loopTemplate(PREAMBLE_BUILDER_TEMPLATE)
    case 'component-row-root-loop': {
      const childDecl = substituteMarkers(parseTopLevelStatement(COMPONENT_ROW_ROOT_CHILD_DECL), {}) as ts.Statement
      return {
        preStatements: [],
        returnExpr: injectRowScopedDeclarations(substituteMarkers(parseTemplateExpression(COMPONENT_ROW_ROOT_TEMPLATE), subs) as ts.Expression, inputs.rowScopedDeclarations),
        extraTopLevelDecls: [childDecl],
      }
    }
    case 'conditional-ternary':
      return { preStatements: [], returnExpr: substituteMarkers(parseTemplateExpression(CONDITIONAL_TERNARY_TEMPLATE), subs) as ts.Expression, extraTopLevelDecls: [] }
    case 'early-return': {
      const { ifStatement, fallback } = parseIfAndFallback(EARLY_RETURN_BODY)
      return {
        preStatements: [substituteMarkers(ifStatement, subs) as ts.Statement],
        returnExpr: fallback,
        extraTopLevelDecls: [],
      }
    }
    case 'child-component': {
      // `CHILD_COMPONENT_CHILD_DECL` has no MARKERS of its own (see its
      // docstring), but every parsed node — marker-bearing or not — still
      // needs the leaf-rebuild pass `substituteMarkers` performs as it
      // walks: an untouched parsed leaf (e.g. `className="row"`'s string
      // literal) keeps stale `pos`/`end` offsets into ITS OWN snippet's
      // source text, which the printer misreads once spliced into this
      // module's hand-assembled final `ts.SourceFile` (see that pass's
      // docstring for the full mechanism) — passing `{}` runs the walk
      // with nothing TO substitute.
      const childDecl = substituteMarkers(parseTopLevelStatement(CHILD_COMPONENT_CHILD_DECL), {}) as ts.Statement
      return {
        preStatements: [],
        returnExpr: substituteMarkers(parseTemplateExpression(CHILD_COMPONENT_CALL_TEMPLATE), subs) as ts.Expression,
        extraTopLevelDecls: [childDecl],
      }
    }
    case 'fragment':
      return { preStatements: [], returnExpr: substituteMarkers(parseTemplateExpression(FRAGMENT_TEMPLATE), subs) as ts.Expression, extraTopLevelDecls: [] }
  }
}

// =============================================================================
// Orchestration
// =============================================================================

export interface ComposedCase {
  source: string
  componentName: string
  props: Record<string, unknown>
  interactions: InteractionStep[]
}

const COMPONENT_NAME = 'PairwiseCase'

/**
 * Turns one axis combination into a compilable TSX source. Throws if the
 * combination violates a constraint `covering-array.ts` is supposed to
 * have already enforced (a controlled binding paired with an unsettable
 * state, an event/callback value requiring a loop paired with a non-loop
 * structure) — a defensive check independent of the covering array's own
 * correctness, and independent of the marker-leak checks above.
 */
export function composeCase(combo: AxisCombo): ComposedCase {
  const state = buildState(combo.state)
  const bodyStatements: ts.Statement[] = [...state.declarations]

  let sourceExpr: ts.Expression | undefined
  let usesCreateSignal = state.usesCreateSignal
  const loop = isLoopStructure(combo.structure)

  if (loop) {
    const arraySrc = buildArraySource(combo.structure)
    usesCreateSignal = usesCreateSignal || arraySrc.usesCreateSignal
    bodyStatements.push(...arraySrc.declarations)
    const decoration = decorateSource(combo.callback, arraySrc.baseExpr)
    bodyStatements.push(...decoration.declarations)
    sourceExpr = decoration.sourceExpr
  } else {
    assertNotLoopOnly(combo.callback, combo.structure)
  }
  assertEventRequiresLoop(combo.event, loop)

  const rowContent = buildBinding(combo.binding, state)
  const eventBuild = buildEvent(combo.event, { state, callback: combo.callback })
  bodyStatements.push(...eventBuild.declarations)
  const eventAttrs = [...eventBuild.attrs, jsxAttrStr('data-pw-event', '1')]

  const structureOut = buildStructure(combo.structure, {
    source: sourceExpr,
    rowContent,
    eventAttrs,
    condition: boolCall(state.readExpr),
    rowScopedDeclarations: eventBuild.rowScopedDeclarations,
  })
  bodyStatements.push(...structureOut.preStatements)
  bodyStatements.push(factory.createReturnStatement(paren(structureOut.returnExpr)))

  const propsParam = state.usesProps
    ? [
        factory.createParameterDeclaration(
          undefined,
          undefined,
          'props',
          undefined,
          factory.createTypeLiteralNode([factory.createPropertySignature(undefined, 'val', undefined, factory.createKeywordTypeNode(ts.SyntaxKind.NumberKeyword))]),
        ),
      ]
    : []

  const componentFn = factory.createFunctionDeclaration(
    [factory.createModifier(ts.SyntaxKind.ExportKeyword)],
    undefined,
    COMPONENT_NAME,
    undefined,
    propsParam,
    undefined,
    block(bodyStatements),
  )

  const clientImports: string[] = []
  if (usesCreateSignal) clientImports.push('createSignal')
  if (state.usesCreateMemo) clientImports.push('createMemo')

  const statements: ts.Statement[] = [exprStmt(strLit('use client'))]
  if (clientImports.length > 0) {
    statements.push(
      factory.createImportDeclaration(
        undefined,
        factory.createImportClause(false, undefined, factory.createNamedImports(clientImports.map(n => factory.createImportSpecifier(false, undefined, id(n))))),
        strLit('@barefootjs/client'),
      ),
    )
  }
  statements.push(...structureOut.extraTopLevelDecls)
  statements.push(componentFn)

  const sourceFile = factory.createSourceFile(statements, factory.createToken(ts.SyntaxKind.EndOfFileToken), ts.NodeFlags.None)
  assertNoMarkers(sourceFile)

  const printer = ts.createPrinter({ newLine: ts.NewLineKind.LineFeed })
  return {
    source: printer.printFile(sourceFile),
    componentName: COMPONENT_NAME,
    props: state.sampleProps,
    interactions: combo.event === 'ref-callback' ? [] : [{ type: 'click', selector: '[data-pw-event]' }],
  }
}

function assertNotLoopOnly(callback: CallbackValue, structure: StructureValue): void {
  if (callback === 'sort-comparator' || callback === 'filter-predicate' || callback === 'flatmap-callback') {
    throw new Error(`pairwise compose: callback '${callback}' requires a loop structure, got '${structure}' (covering-array constraint violated)`)
  }
}

function assertEventRequiresLoop(event: EventValue, loop: boolean): void {
  if (!loop && (event === 'handler-reading-loop-param' || event === 'delegated-handler-in-row')) {
    throw new Error(`pairwise compose: event '${event}' requires a loop structure (covering-array constraint violated)`)
  }
}
