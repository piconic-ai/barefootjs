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
  type AttrValue,
  type IRTemplatePart,
  type LoopParamBinding,
  type LoopBindingPathSegment,
  type RestExcludeKey,
  type FlatMapCallback,
  type FlatMapJsxFragment,
  type SourceLocation,
  type TypeInfo,
  type OriginInfo,
  type IRMetadata,
  isReactiveOrigin,
  AttrValueOf,
} from './types.ts'
import { type AnalyzerContext, type MultiReturnJsxInfo, getSourceLocation, collectReactiveGetterNames } from './analyzer-context.ts'
import { parseExpression, isSupported, parseBlockBody, foldBlockToExpr, predicateTernaryToLogical, tsNodeToParsedExpr, sortComparatorFromArrow, stringifyParsedExpr, cssKebabCase, CALLBACK_METHODS, type ParsedExpr } from './expression-parser.ts'
import type { IRLoopSort, FunctionInfo } from './types.ts'
import { formatParamWithType } from './module-exports.ts'
import { createError, ErrorCodes, internalInvariant } from './errors.ts'
import { CLIENT_BUILTIN_SOURCE, isClientBuiltinName, type ClientBuiltinTag } from './builtins.ts'
import { containsReactiveExpression } from './reactivity-checker.ts'
import {
  rewriteBarePropRefs as rewriteBarePropRefsCore,
  collectAstPropRefs,
} from './prop-rewrite.ts'
import { resolveFreeRefs, isNameBound as isNameBoundInEnv, type BindingEnvironment } from './free-refs.ts'
import { computeFileScope } from './ir-to-client-js/component-scope.ts'
import { createTemplateAwareStringProtector } from './ir-to-client-js/html-template.ts'
import { datePlugin, DATE_METHODS } from './date-lowering.ts'
import { toLocaleDatePlugin, foldedArgToClientJs } from './to-locale-date-lowering.ts'
import type { LoweringMatcher } from './lowering-registry.ts'
import { extractFreeIdentifiersFromNode, initializerShapeContainsJsx } from './analyzer.ts'
import { iterateJsTokens, replaceInExprContexts } from './scanner/js-scanner.ts'
import { toHTMLAttrName, decodeEntities } from '@barefootjs/shared'

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
  /** Cached set of module-scope @client signal/memo names. */
  _moduleClientSignalNames?: Set<string>
  /** Cached set of destructured prop names for AST-based rewriting */
  _destructuredPropNames?: Set<string> | null
  /** Active loop parameter names for slotId assignment to loop-param-dependent expressions */
  loopParams: Set<string>
  /**
   * Count of enclosing `.map()` loops (0 = outermost), incremented/
   * decremented in lockstep with entering/leaving `transformMapCall`.
   * Unlike `loopParams` (a name Set that can gain several entries for
   * ONE loop level via destructuring), this is a plain per-level
   * counter — the single source of truth `IRLoop.depth` is stamped
   * from, so every adapter's `data-key`/`data-key-N` suffix derives
   * from one IR-computed value instead of each adapter re-deriving
   * nesting depth its own way (#2168 nested-loop-outer-binding).
   */
  loopDepth: number
  /** Counter for async boundary IDs (a0, a1, ...) */
  asyncIdCounter: number
  /** Counter for <Region> structural index (0, 1, ...) within a file. */
  regionIdCounter: number
  /** Counter for loop marker IDs (l0, l1, ...) — separate from slot IDs so element bf="sN" numbering stays stable across versions (#1087). */
  loopMarkerCounter: number
  /**
   * Counter for JSX spread bag slot IDs (`Spread_0`, `Spread_1`, ...).
   * Separate namespace from element slot IDs (`s0`, `s1`, ...) so
   * adapters that need to plumb the spread bag through a structured
   * data path (Go template's `.Spread_N`) don't collide with element
   * scope IDs (#1407). Component-scoped, allocated only when the
   * spread falls through to the bag-emitting branch.
   */
  spreadIdCounter: number
  /**
   * Memoized free-refs binding environment. Built lazily by
   * `makeBindingEnv` and reused across every `resolveFreeRefs` call as
   * long as `loopParams` content is unchanged. Invalidated by serializing
   * `loopParams` into `_bindingEnvLoopKey` and comparing on read.
   */
  _bindingEnv?: BindingEnvironment
  _bindingEnvLoopKey?: string
  /**
   * Lazily computed map of `Pkg.Comp` → `Comp` resolutions for
   * member-expression JSX tags (#1319). A `const Pkg = { Comp }` (or
   * `{ Comp: ComponentName }`) in module scope lets the CSR template
   * emit `renderChild('Comp', ...)` instead of the literal
   * `renderChild('Pkg.Comp', ...)` which fails the registry lookup.
   */
  _componentNamespaces?: Map<string, Map<string, string>>
  /**
   * Per-branch overlay of `const X = expr` declared inside an early-
   * return `if`-block, populated by `buildIfStatementChain` before
   * transforming the consequent JSX (#1409). When a JSX expression
   * references one of these names, `transformExpression` inlines the
   * initializer at the use site — the same way module-scope JSX
   * constants are inlined via `analyzer.jsxConstants` (#547) — instead
   * of leaving the identifier to leak into the emitted client JS at
   * outer init scope where the binding doesn't exist. Saved/restored
   * around each `transformNode(condReturn.jsxReturn, ctx)` call so
   * sibling branches do not see each other's locals.
   */
  _branchScopeVars?: Map<string, ts.Expression>
  /**
   * Subset of `_branchScopeVars` names whose initializer carries JSX
   * (so text substitution into raw-captured callback bodies is unsafe
   * — TS JSX in JS syntax is invalid). `processAttributes` consults
   * this set when extracting ref / event-handler bodies and emits
   * BF047 if any of these names appears as a free identifier in the
   * callback body. See #1414 cell 5.
   */
  _jsxBranchLocalNames?: Set<string>
  /**
   * Set of destructured prop names each branch-local transitively
   * references in its initializer (directly or via inner-branch-local
   * substitution). Populated alongside `_branchScopeVars`; consumed
   * by `rewriteBarePropRefs` so prop refs introduced via text-level
   * branch-local substitution still get bridged to `_p.X` in CSR
   * template scope even though the use-site AST doesn't carry them.
   * See #1425.
   */
  _branchScopePropDeps?: Map<string, Set<string>>
  /**
   * Lazily computed map of local JSX tag name → compile-away built-in
   * (`Async` / `Region`), derived from `@barefootjs/client` imports (#1915).
   * Recognition is import-scoped (not a bare tag-name match) so a user's own
   * `<Async>` / `<Region>` component doesn't collide with the built-in, and an
   * aliased `import { Async as Boundary }` maps `<Boundary>` to the built-in.
   */
  _clientBuiltinTags?: Map<string, ClientBuiltinTag>
  /**
   * Cached `datePlugin` matcher (#2292), bound once to this component's
   * metadata. `undefined` = not yet computed; `null` = computed and
   * inactive (this component's props never reach a `Date`, `datePlugin`'s
   * own `prepare` gate). See `getDateLoweringMatcher`.
   */
  _dateLoweringMatcher?: LoweringMatcher | null
  /**
   * Cached `toLocaleDatePlugin` matcher (#2324 slice 2), same lifecycle as
   * `_dateLoweringMatcher`. See `getToLocaleDateLoweringMatcher`.
   */
  _toLocaleDateLoweringMatcher?: LoweringMatcher | null
}

/**
 * Detect a leading `/* @client *​/` directive on the given expression
 * node. Scans only the leading trivia (the slice between `pos` and
 * `getStart`, which excludes the expression's own text) and requires
 * the comment interior to match the directive shape exactly, so:
 *
 *   - `@client` as a substring inside a string literal in the
 *     expression itself doesn't false-positive
 *   - a trailing `/* @client *​/` after the expression doesn't trigger
 *   - an unrelated block comment like `/* @client-flag *​/` doesn't
 *     trigger
 *
 * Used at three sites for consistency across positions:
 *
 *   - JSX child: `<div>{/* @client *​/ x}</div>`
 *   - Element attribute initializer: `<div data-x={/* @client *​/ x}>`
 *   - Component prop initializer: `<MyComp prop={/* @client *​/ x}>`
 *
 * Note: `ts.getLeadingCommentRanges` doesn't return comments inside
 * a JsxExpression's curly braces (TypeScript handles JSX trivia
 * specially), so we read the trivia text directly and parse block
 * comments out of it.
 */
const CLIENT_DIRECTIVE_INTERIOR_RE = /^\s*@client\s*$/
const BLOCK_COMMENT_RE = /\/\*([\s\S]*?)\*\//g
function hasLeadingClientDirective(expr: ts.Expression, sourceFile: ts.SourceFile): boolean {
  const trivia = sourceFile.text.slice(expr.pos, expr.getStart(sourceFile))
  BLOCK_COMMENT_RE.lastIndex = 0
  let m: RegExpExecArray | null
  while ((m = BLOCK_COMMENT_RE.exec(trivia)) !== null) {
    if (CLIENT_DIRECTIVE_INTERIOR_RE.test(m[1])) return true
  }
  return false
}

/**
 * The set of known reactive getter names (signal accessors + memo names) for the
 * component, built once and cached on `ctx`. These reads are idempotent within a
 * render, so consumers can treat `getter()` as a pure value (e.g. the block-fold
 * purity oracle in {@link extractFilterPredicate}).
 */
function getReactiveGetterNames(ctx: TransformContext): Set<string> {
  if (!ctx._reactiveGetterNames) {
    ctx._reactiveGetterNames = collectReactiveGetterNames(ctx.analyzer.signals, ctx.analyzer.memos)
  }
  return ctx._reactiveGetterNames
}

/**
 * Walk an expression AST to check if it calls any known signal getter or memo.
 * Uses a pre-built Set for O(1) lookup per call expression.
 */
function exprCallsReactiveGetters(expr: ts.Expression, ctx: TransformContext): boolean {
  const names = getReactiveGetterNames(ctx)

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
 * Walk an expression to check if it calls a module-scope `@client` signal
 * getter or memo. Only call-expression identifiers are matched (not bare
 * identifier references) — this avoids false-positives when a local
 * variable shadows a module-signal name. Setters are excluded because
 * they only appear inside event-handler callbacks which are already
 * client-only by construction.
 */
function exprReferencesModuleClientSignal(expr: ts.Expression, ctx: TransformContext): boolean {
  if (!ctx._moduleClientSignalNames) {
    ctx._moduleClientSignalNames = new Set<string>()
    for (const s of ctx.analyzer.signals) {
      if (s.isModule) ctx._moduleClientSignalNames.add(s.getter)
    }
    for (const m of ctx.analyzer.memos) {
      if (m.isModule) ctx._moduleClientSignalNames.add(m.name)
    }
    for (const name of ctx.analyzer.importedClientSignalNames) {
      ctx._moduleClientSignalNames.add(name)
    }
  }
  if (ctx._moduleClientSignalNames.size === 0) return false
  const names = ctx._moduleClientSignalNames
  let found = false
  function visit(n: ts.Node) {
    if (found) return
    if (ts.isCallExpression(n) && ts.isIdentifier(n.expression) && names.has(n.expression.text)) {
      found = true
      return
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
 * Bind (and cache on `ctx`) `datePlugin`'s matcher (#2292) for this
 * component. Reuses the SAME `LoweringPlugin` the SSR adapters bind via
 * `prepareLoweringMatchers` — not a re-implementation of its receiver-type
 * resolution — so a call lowers on the client iff `datePlugin` would lower
 * it on the SSR path (parity is mandatory per #2292).
 *
 * `datePlugin.prepare` only reads `propsType` / `propsObjectName` /
 * `propsParams` / `typeDefinitions` off its `IRMetadata` parameter (see
 * `rich-type-evidence.ts`'s `EvidenceMetadata` — the `Pick` of exactly
 * those four fields). `ctx.analyzer` carries live, fully-populated values
 * for all four by the time any expression is transformed (analysis runs
 * to completion before `jsxToIR`'s AST walk begins), so a slice of just
 * those fields is sufficient — the cast bridges that narrower shape to
 * the wider `IRMetadata` parameter type every lowering plugin declares.
 */
function getDateLoweringMatcher(ctx: TransformContext): LoweringMatcher | null {
  if (ctx._dateLoweringMatcher === undefined) {
    const a = ctx.analyzer
    const metadataSlice: Pick<IRMetadata, 'propsType' | 'propsObjectName' | 'propsParams' | 'typeDefinitions'> = {
      propsType: a.propsType,
      propsObjectName: a.propsObjectName,
      propsParams: a.propsParams,
      typeDefinitions: a.typeDefinitions,
    }
    ctx._dateLoweringMatcher = datePlugin.prepare(metadataSlice as unknown as IRMetadata)
  }
  return ctx._dateLoweringMatcher
}

/** `getDateLoweringMatcher`'s twin for `toLocaleDatePlugin` (#2324 slice 2) — same metadata slice, same cache lifecycle. */
function getToLocaleDateLoweringMatcher(ctx: TransformContext): LoweringMatcher | null {
  if (ctx._toLocaleDateLoweringMatcher === undefined) {
    const a = ctx.analyzer
    const metadataSlice: Pick<IRMetadata, 'propsType' | 'propsObjectName' | 'propsParams' | 'typeDefinitions'> = {
      propsType: a.propsType,
      propsObjectName: a.propsObjectName,
      propsParams: a.propsParams,
      typeDefinitions: a.typeDefinitions,
    }
    ctx._toLocaleDateLoweringMatcher = toLocaleDatePlugin.prepare(metadataSlice as unknown as IRMetadata)
  }
  return ctx._toLocaleDateLoweringMatcher
}

/**
 * Client-side counterpart to `datePlugin` (#2274 was SSR-only; #2292
 * closes the gap). The client emitter (`ir-to-client-js/`) emits raw,
 * prop-rewritten source strings and never consults the lowering registry
 * (its module doc) — so left alone, a Date-typed prop's catalogued
 * accessor call leaks through as `_p.createdAt.toISOString()`, which
 * throws at hydration: props are JSON round-tripped with no type-aware
 * revival (`hydrate.ts`'s `parseProps`), so the prop arrives as its ISO
 * string, not a `Date` instance.
 *
 * Walks `expr`'s AST for zero-arg calls to a `DATE_METHODS` name (a cheap
 * syntactic pre-filter) and confirms each candidate against the SAME
 * `datePlugin` matcher the SSR adapters use, via `tsNodeToParsedExpr` —
 * the identical receiver-type resolution, not a re-implementation, so a
 * call lowers here iff it would lower on the SSR path. A match splices
 * `date(<receiver>, "<op>")` in place of the raw call; `imports.ts`'s
 * `detectUsedImports` regex-scans the emitted `date(` call against
 * `RUNTIME_IMPORT_CANDIDATES` to auto-import the runtime helper.
 *
 * The splice is a plain (non-global) text `.replace` per candidate, run
 * in AST (left-to-right, source) order — not a JS-parsing regex, since
 * every candidate span comes from walking `expr`'s real AST first. This
 * is safe specifically because any call the matcher accepts has, by
 * construction, no TS-only syntax anywhere in its own span: the matcher
 * only resolves evidence through a bare identifier or a non-computed
 * member chain (`resolveReceiverType`'s two supported `ParsedExpr`
 * shapes), and the call itself takes zero arguments. So `ctx.getJS` of
 * that one sub-node — which strips only type syntax — is guaranteed
 * byte-identical to its raw source slice, and thus guaranteed to appear
 * verbatim as a contiguous substring of `text` regardless of unrelated
 * type-stripping elsewhere in the enclosing expression. String spans in
 * `text` are protected first (`createTemplateAwareStringProtector` — both
 * quoted strings AND template-literal *static* segments, leaving `${…}`
 * interpolations exposed) so a coincidentally-identical string constant —
 * e.g. a backtick `` `createdAt.toISOString()` `` sitting before the real
 * call — can never be mistaken for a call site by the non-global
 * `.replace`.
 */
function lowerDateCalls(text: string, expr: ts.Node, ctx: TransformContext): string {
  const matcher = getDateLoweringMatcher(ctx)
  if (!matcher) return text

  const candidates: ts.CallExpression[] = []
  function visit(n: ts.Node) {
    if (
      ts.isCallExpression(n) &&
      n.arguments.length === 0 &&
      ts.isPropertyAccessExpression(n.expression) &&
      !n.expression.questionDotToken &&
      DATE_METHODS.has(n.expression.name.text)
    ) {
      candidates.push(n)
    }
    ts.forEachChild(n, visit)
  }
  visit(expr)
  if (candidates.length === 0) return text

  const { protect, restore } = createTemplateAwareStringProtector()
  let result = protect(text)
  for (const call of candidates) {
    const propAccess = call.expression as ts.PropertyAccessExpression
    const node = matcher(tsNodeToParsedExpr(propAccess), [])
    if (!node || node.kind !== 'helper-call' || node.helper !== 'date') continue
    const op = propAccess.name.text
    const receiverText = ctx.getJS(propAccess.expression)
    const matchText = ctx.getJS(call)
    // Replacer-function form: a `$` sequence in `receiverText` (a prop named
    // `$1`, say) would otherwise be reinterpreted as a `String.replace`
    // pattern token and corrupt the output (repo precedent, #2285).
    result = result.replace(matchText, () => `date(${receiverText}, "${op}")`)
  }
  return restore(result)
}

/**
 * `lowerDateCalls`' twin for the literal-locale `toLocaleDateString` sugar
 * (#2324 slice 2). A call the SAME `toLocaleDatePlugin` matcher claims (so
 * client and SSR lower under identical evidence, mandatory per #2292)
 * rewrites to `formatDate(recv, "<pattern>", "<tz>")` — the pattern and tz
 * literals come off the matched helper-call node, so the client renders the
 * exact build-time-frozen pattern the templates render, and the ISO-string
 * prop value the client actually holds post-hydration (no type-aware JSON
 * revival) flows through `formatDate`'s string-receiver normalization
 * instead of throwing on a raw `.toLocaleDateString()` string call.
 */
function lowerToLocaleDateCalls(text: string, expr: ts.Node, ctx: TransformContext): string {
  const matcher = getToLocaleDateLoweringMatcher(ctx)
  if (!matcher) return text

  const candidates: ts.CallExpression[] = []
  function visit(n: ts.Node) {
    if (
      ts.isCallExpression(n) &&
      n.arguments.length === 2 &&
      ts.isPropertyAccessExpression(n.expression) &&
      !n.expression.questionDotToken &&
      n.expression.name.text === 'toLocaleDateString'
    ) {
      candidates.push(n)
    }
    ts.forEachChild(n, visit)
  }
  visit(expr)
  if (candidates.length === 0) return text

  const { protect, restore, replaceProtectedCall } = createTemplateAwareStringProtector()
  let result = protect(text)
  for (const call of candidates) {
    const propAccess = call.expression as ts.PropertyAccessExpression
    const node = matcher(
      tsNodeToParsedExpr(propAccess),
      call.arguments.map((a) => tsNodeToParsedExpr(a)),
    )
    if (!node || node.kind !== 'helper-call' || node.helper !== 'format_date') continue
    const [, patternArg, tzArg, namesArg] = node.args
    if (!patternArg || tzArg?.kind !== 'literal') continue
    const localeText = ctx.getJS(call.arguments[0])
    const patternJs = foldedArgToClientJs(patternArg, localeText)
    if (patternJs === null) continue
    // The names table (#2334) — omitted from the client call when empty
    // (the client function defaults to []).
    let namesJs: string | null = null
    if (namesArg && !(namesArg.kind === 'array-literal' && namesArg.elements.length === 0)) {
      namesJs = foldedArgToClientJs(namesArg, localeText)
      if (namesJs === null) continue
    }
    const receiverText = ctx.getJS(propAccess.expression)
    const matchText = ctx.getJS(call)
    // Unlike `lowerDateCalls`' zero-arg needle, this call text CONTAINS
    // string literals, which the protected haystack holds as placeholders —
    // so the replacement must go through the protector's stash-verified
    // matcher rather than a plain `.replace`.
    result = replaceProtectedCall(
      result,
      matchText,
      () =>
        `formatDate(${receiverText}, ${patternJs}, ${JSON.stringify(tzArg.value)}${namesJs !== null ? `, ${namesJs}` : ''})`,
    )
  }
  return restore(result)
}

/**
 * Rewrite bare destructured prop references in expression text.
 * Thin wrapper that caches prop names on ctx and delegates to the shared core.
 * Returns undefined if no rewriting is needed (SolidJS-style or no props).
 */
function rewriteBarePropRefs(text: string, expr: ts.Node, ctx: TransformContext): string | undefined {
  // #2292: lower a Date-typed prop's catalogued accessor call BEFORE the
  // bare-prop-name rewrite below, so the receiver identifier still picks
  // up the usual `_p.` prefix (destructured mode) or falls through to the
  // CSR template emitter's separate `props.` → `_p.` rewrite
  // (`html-template.ts`'s `transformExpr`, props-object mode). Runs
  // unconditionally — ahead of the `propNames` gate — because Date
  // evidence comes from `ctx.analyzer.propsType`, independent of whether
  // this component destructures its props.
  const dateLowered = lowerToLocaleDateCalls(lowerDateCalls(text, expr, ctx), expr, ctx)
  let propNames = getDestructuredPropNames(ctx)
  if (!propNames) return dateLowered === text ? undefined : dateLowered
  // #2222: a name bound as an enclosing loop callback's item/index param
  // refers to the loop binding, not the prop, at THIS transform position —
  // `ctx.loopParams` is the live loop-param set (destructured binding
  // names and the index included), maintained by `transformMapCall` as it
  // enters/leaves each callback, so this guard is scope-accurate rather
  // than the coarse whole-component exclusion the SSR adapters use
  // (#2221). Filter into a fresh set — `getDestructuredPropNames` caches
  // its set on ctx and must not be mutated.
  if (ctx.loopParams.size > 0) {
    const filtered = new Set([...propNames].filter(n => !ctx.loopParams.has(n)))
    if (filtered.size === 0) return dateLowered === text ? undefined : dateLowered
    propNames = filtered
  }
  // #1425: union any prop refs that `expr` reaches via branch-local
  // text substitution. The AST walk in `rewriteBarePropRefsCore`
  // sees only `expr`'s original AST, so a prop ref introduced via
  // `ctx.getJS` substituting an earlier `if`-block local would slip
  // through and land bare in the emitted template (which lives in
  // module scope where only `_p` exists). The substitution machinery
  // pre-computes each branch local's transitive prop-ref set into
  // `_branchScopePropDeps` at branch entry; here we just walk `expr`
  // for references to those locals and union the matching dep sets.
  const extraPropRefs = collectBranchLocalPropRefsViaSubstitution(expr, ctx)
  return rewriteBarePropRefsCore(dateLowered, expr, propNames, extraPropRefs)
}

/**
 * #1425: For each branch-local identifier referenced inside `node`,
 * union the transitive prop-ref set recorded for it at branch entry.
 * Returns `undefined` if no branch-scope substitution machinery is
 * active or no contributing identifiers are found, so the call site
 * stays a no-op outside the affected path.
 */
function collectBranchLocalPropRefsViaSubstitution(
  node: ts.Node,
  ctx: TransformContext,
): Set<string> | undefined {
  const propDepsMap = ctx._branchScopePropDeps
  const branchVars = ctx._branchScopeVars
  if (!propDepsMap || !branchVars || propDepsMap.size === 0) return undefined
  let acc: Set<string> | undefined
  function visit(n: ts.Node, parent?: ts.Node) {
    if (ts.isIdentifier(n) && propDepsMap!.has(n.text)) {
      // Same skip rules as `collectAstPropRefs` — only value
      // positions count, not object keys / property-access names.
      const isObjectKey = parent && ts.isPropertyAssignment(parent) && parent.name === n
      const isShorthand = parent && ts.isShorthandPropertyAssignment(parent) && parent.name === n
      const isAccessName = parent && ts.isPropertyAccessExpression(parent) && parent.name === n
      if (!isObjectKey && !isShorthand && !isAccessName) {
        const deps = propDepsMap!.get(n.text)
        if (deps && deps.size > 0) {
          if (!acc) acc = new Set()
          for (const d of deps) acc.add(d)
        }
      }
    }
    ts.forEachChild(n, child => visit(child, n))
  }
  visit(node)
  return acc
}

/**
 * Compute (and memoize on `ctx`) the set of destructured prop names
 * eligible for `props.X → _p.X` rewriting on template-emit paths.
 *
 * - Uses `propsParams` names regardless of whether `propsObjectName`
 *   is set — a component may declare its arg as `(props)` AND
 *   destructure inside the body (`const { org } = props`); bare
 *   `org` references inside JSX still need rewriting to `_p.org`
 *   for the generated client template's standalone scope.
 * - SolidJS-style `(props: Type)` with no destructured local of the
 *   same name is unaffected: `rewriteBarePropRefsCore` skips
 *   identifiers on the right side of property access, so
 *   `props.org` stays intact even when `org` is in propNames.
 * - Shadow guard: a SolidJS-style component may declare a signal /
 *   memo / local const with the SAME name as a prop (e.g.
 *   `(props: { label?: string })` + `const [label, setLabel] =
 *   createSignal(props.label ?? '...')`). Those bare refs target the
 *   local binding, not the prop — exclude them from the rewrite set
 *   so the signal getter isn't turned into `_p.label`. Destructured-
 *   from-props locals (`const { org } = props`) are kept in the
 *   rewrite set since the JSX bare-name reference must still reach
 *   `_p.org` in the template's standalone scope.
 *
 * Returns `null` (cached) when no destructured props are in scope —
 * the wrapper can short-circuit before touching the regex.
 */
function getDestructuredPropNames(ctx: TransformContext): Set<string> | null {
  if (ctx._destructuredPropNames === undefined) {
    const shadowed = new Set<string>()
    if (ctx.analyzer.propsObjectName) {
      for (const s of ctx.analyzer.signals) {
        shadowed.add(s.getter)
        if (s.setter) shadowed.add(s.setter)
      }
      for (const m of ctx.analyzer.memos) shadowed.add(m.name)
      for (const c of ctx.analyzer.localConstants) {
        const isDestructureFromProps =
          typeof c.value === 'string' &&
          (c.value === `${ctx.analyzer.propsObjectName}.${c.name}` ||
            c.value.startsWith(`${ctx.analyzer.propsObjectName}.${c.name} ??`))
        if (!isDestructureFromProps) shadowed.add(c.name)
      }
    }
    const names = ctx.analyzer.propsParams
      .map(p => p.name)
      .filter(n => !shadowed.has(n))
    ctx._destructuredPropNames = names.length > 0 ? new Set(names) : null
  }
  return ctx._destructuredPropNames ?? null
}

function createTransformContext(analyzer: AnalyzerContext): TransformContext {
  return {
    analyzer,
    sourceFile: analyzer.sourceFile,
    filePath: analyzer.filePath,
    slotIdCounter: 0,
    asyncIdCounter: 0,
    regionIdCounter: 0,
    loopMarkerCounter: 0,
    spreadIdCounter: 0,
    isRoot: true,
    insideComponentChildren: false,
    loopParams: new Set(),
    loopDepth: 0,
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

/**
 * Build the `Pkg.Comp` → `Comp` resolution map by scanning the source
 * for `const Pkg = { ... }` declarations whose initializer is an
 * object literal mapping member names to component identifiers.
 *
 * Shorthand (`{ Comp }`) and explicit-identifier
 * (`{ Trigger: Button }`) properties both resolve. Spreads, getters,
 * methods, and non-identifier values are skipped — they don't have a
 * unique component name to resolve to.
 */
function buildComponentNamespaces(ctx: TransformContext): Map<string, Map<string, string>> {
  const result = new Map<string, Map<string, string>>()

  // Scan only module-level VariableStatements. A namespace shadowed
  // inside a function body would still be visible to a nested JSX
  // tag via the binding lookup, but distinguishing the two scopes
  // here would require the analyzer's binding environment; the
  // shadowing case is rare enough in practice that limiting the
  // scan to module scope is a safer default than overwriting a
  // module-scope mapping with a function-local one keyed by the
  // same identifier.
  for (const stmt of ctx.sourceFile.statements) {
    if (!ts.isVariableStatement(stmt)) continue
    for (const decl of stmt.declarationList.declarations) {
      if (!decl.initializer || !ts.isIdentifier(decl.name)) continue
      let init: ts.Expression = decl.initializer
      while (ts.isParenthesizedExpression(init)) init = init.expression
      if (!ts.isObjectLiteralExpression(init)) continue

      const members = new Map<string, string>()
      for (const prop of init.properties) {
        if (ts.isShorthandPropertyAssignment(prop)) {
          // `{ Comp }` — shorthand resolves to the identifier
          // bearing its own name.
          members.set(prop.name.text, prop.name.text)
        } else if (
          ts.isPropertyAssignment(prop) &&
          (ts.isIdentifier(prop.name) || ts.isStringLiteral(prop.name)) &&
          ts.isIdentifier(prop.initializer)
        ) {
          // `{ Trigger: ButtonImpl }` — explicit identifier value.
          members.set(prop.name.text, prop.initializer.text)
        }
      }
      if (members.size > 0) {
        result.set(decl.name.text, members)
      }
    }
  }

  return result
}

/**
 * Resolve a member-expression JSX tag (`<Pkg.Comp />`) to the
 * underlying component identifier. Returns `null` for non-member
 * tags or tags that don't resolve via `buildComponentNamespaces`.
 *
 * The unresolved form (`'Pkg.Comp'`) survives the CSR template emit
 * but breaks the runtime registry lookup: only `Comp` (or its hashed
 * file-scoped key) is ever registered. Resolving at IR time means the
 * emitted client JS calls `renderChild('Comp', ...)` and the lookup
 * succeeds. SSR is unaffected — the same `Comp` identifier is in
 * scope wherever `Pkg` is.
 */
function resolveMemberExpressionTag(
  tagNode: ts.JsxTagNameExpression,
  ctx: TransformContext,
): string | null {
  if (!ts.isPropertyAccessExpression(tagNode)) return null
  if (!ts.isIdentifier(tagNode.expression)) return null
  if (!ts.isIdentifier(tagNode.name)) return null
  if (!ctx._componentNamespaces) {
    ctx._componentNamespaces = buildComponentNamespaces(ctx)
  }
  return ctx._componentNamespaces.get(tagNode.expression.text)?.get(tagNode.name.text) ?? null
}

function generateSlotId(ctx: TransformContext, forComponent: boolean = false): string {
  const id = `s${ctx.slotIdCounter++}`
  // Component elements' own slot IDs never get ^ prefix.
  // The ^ prefix is only for native HTML elements and expressions
  // passed as children into a child component's scope.
  if (forComponent) return id
  return ctx.insideComponentChildren ? `^${id}` : id
}

/**
 * Allocate a component-scoped slot ID for a JSX spread bag (#1407).
 * Separate namespace from element slot IDs so Go's `Spread_N` field
 * names never collide with element `bf="sN"` scope IDs.
 */
function generateSpreadSlotId(ctx: TransformContext): string {
  return `Spread_${ctx.spreadIdCounter++}`
}

/**
 * Build the binding environment for `resolveFreeRefs` from the current
 * transform context. The analyzer's collected bindings (signals, memos,
 * props, locals, imports) plus the active loop params form the resolution
 * frame; the TypeChecker, when available, is forwarded so library getters
 * carrying the Reactive<T> brand are recognised.
 *
 * Memoized on `ctx`: the returned env is identity-stable as long as
 * `loopParams` content is unchanged, which keeps the `WeakMap`-keyed
 * binding-table cache in `free-refs.ts` warm across every expression in
 * the same loop scope. `loopParams` is `.add`/`.delete`-mutated as the
 * visitor enters / leaves `.map()` callbacks, so we serialize its
 * contents into a key rather than relying on Set identity.
 */
function makeBindingEnv(ctx: TransformContext): BindingEnvironment {
  const loopKey = ctx.loopParams.size === 0
    ? ''
    : Array.from(ctx.loopParams).sort().join('\0')
  if (ctx._bindingEnv && ctx._bindingEnvLoopKey === loopKey) {
    return ctx._bindingEnv
  }
  const a = ctx.analyzer
  const env: BindingEnvironment = {
    signals: a.signals,
    memos: a.memos,
    propsParams: a.propsParams,
    propsObjectName: a.propsObjectName,
    restPropsName: a.restPropsName,
    localConstants: a.localConstants,
    localFunctions: a.localFunctions,
    imports: a.imports,
    ambientGlobals: a.ambientGlobals,
    // Snapshot — the env must observe a stable view even if `ctx.loopParams`
    // is later mutated by an enclosing visitor frame.
    loopParams: new Set(ctx.loopParams),
    checker: a.checker,
  }
  ctx._bindingEnv = env
  ctx._bindingEnvLoopKey = loopKey
  return env
}

// =============================================================================
// Main Entry Point
// =============================================================================

/**
 * Parse an attribute / prop / provider value expression. An inline object
 * literal (`opts={{ align: 'start' }}`, `style={{ … }}`) parses as a block
 * statement unless parenthesized, so a bare `{ … }` would land as `unsupported`
 * instead of `object-literal` — the adapters that lower an inline object value
 * (Go `objectLiteralToGoMap`, Perl `objectLiteralExprToPerlHashref`) then refuse
 * it (BF101). Wrap a `{`-leading value in parens so it parses as the
 * `object-literal` they expect; every other expression is unaffected (redundant
 * parens are stripped on parse).
 */
function parseValueExpr(trimmed: string): ParsedExpr {
  return parseExpression(trimmed.startsWith('{') ? `(${trimmed})` : trimmed)
}

/** Shared empty-set default for `attachParsedExpressions`/`resolveCallbackMethodFunctionReferences`'s `bound` param — avoids a fresh allocation per call when nothing is shadowed. */
const EMPTY_BOUND: ReadonlySet<string> = new Set()

/**
 * Attach `parsed` (`parseExpression(expr.trim())`) to every `expression` node
 * in the tree, so SSR adapters emit from the structured tree instead of each
 * re-parsing the string at emit time. Best-effort: a node this walk misses (or
 * an empty `expr`) simply has no `parsed`, and the adapter falls back to
 * parsing — so under-coverage is safe, never a behavioural change.
 *
 * Every parse is run through {@link resolveCallbackMethodFunctionReferences}
 * (#2206) so a bare-identifier `.map`/`.filter`/… callback (`tags.map(format)`)
 * resolves to its declaration wherever it can appear — text/attr/prop/provider
 * expressions and the loop-array expression alike — not just one hardcoded
 * spot. `bound` carries the enclosing loop(s)' `param`/`index` names down
 * into that resolution (Fable review, #2214) so a loop item variable that
 * happens to share a name with a module-scope const/function shadows it,
 * same as real JS scoping — resolution stays off within that loop's body.
 */
function attachParsedExpressions(node: IRNode, analyzer: AnalyzerContext, bound: ReadonlySet<string> = EMPTY_BOUND): void {
  const parse = (trimmed: string) => resolveCallbackMethodFunctionReferences(parseExpression(trimmed), analyzer, bound)
  const parseValue = (trimmed: string) => resolveCallbackMethodFunctionReferences(parseValueExpr(trimmed), analyzer, bound)
  if (node.type === 'expression') {
    const trimmed = node.expr.trim()
    if (trimmed) node.parsed = parse(trimmed)
  } else if (node.type === 'conditional' || node.type === 'if-statement') {
    const trimmed = node.condition.trim()
    if (trimmed) node.parsedCondition = parse(trimmed)
  }
  // Attach `parsed` to every expression-valued attribute / prop so adapters can
  // lower from the tree instead of re-parsing the string. Element attrs,
  // component props (e.g. `opts={{ … }}` → Go map), and a provider's `value`
  // prop all carry it; only `expression` values do (a `spread` / `template`
  // value can't be the inline object literal the consumers read).
  if (node.type === 'element') {
    for (const attr of node.attrs) {
      if (attr.value.kind === 'expression') {
        const trimmed = attr.value.expr.trim()
        if (trimmed) attr.value.parsed = parseValue(trimmed)
      } else if (attr.value.kind === 'spread') {
        const trimmed = attr.value.expr.trim()
        if (trimmed) attr.value.parsed = parse(trimmed)
      }
    }
  } else if (node.type === 'component') {
    for (const prop of node.props) {
      if (prop.value.kind === 'expression') {
        const trimmed = prop.value.expr.trim()
        if (trimmed) prop.value.parsed = parseValue(trimmed)
      }
    }
  } else if (node.type === 'provider') {
    if (node.valueProp.value.kind === 'expression') {
      const trimmed = node.valueProp.value.expr.trim()
      if (trimmed) node.valueProp.value.parsed = parseValue(trimmed)
    }
  }
  switch (node.type) {
    case 'element':
    case 'component':
    case 'fragment':
    case 'provider':
      for (const child of node.children) attachParsedExpressions(child, analyzer, bound)
      break
    case 'async':
      attachParsedExpressions(node.fallback, analyzer, bound)
      for (const child of node.children) attachParsedExpressions(child, analyzer, bound)
      break
    case 'loop': {
      // Attach the parse of the SAME `array` string the adapters consume
      // (the Go adapter's scalar-literal loop typing reads `loop.array` /
      // `nested.loopArray`, which is exactly `loop.array`), so it can read
      // the tree instead of re-parsing with `ts.createSourceFile`. The array
      // expression itself is evaluated in the OUTER scope (before the loop's
      // own `param`/`index` exist), so it parses against the unextended `bound`.
      const trimmedArray = node.array.trim()
      if (trimmedArray) node.arrayParsed = parse(trimmedArray)
      // The loop's item/index variables shadow any same-named module-scope
      // const/function for everything inside the loop body (Fable review,
      // #2214) — mirrors an arrow's own params in `resolveCallbackMethodFunctionReferences`.
      const loopBound = new Set(bound)
      loopBound.add(node.param)
      if (node.index) loopBound.add(node.index)
      for (const child of node.children) attachParsedExpressions(child, analyzer, loopBound)
      // Loops also hold expression nodes off the main `children` array.
      if (node.childComponent) {
        for (const child of node.childComponent.children) attachParsedExpressions(child, analyzer, loopBound)
      }
      for (const nested of node.nestedComponents ?? []) {
        for (const child of nested.children) attachParsedExpressions(child, analyzer, loopBound)
      }
      for (const frag of node.flatMapCallback?.fragments ?? []) {
        attachParsedExpressions(frag.ir, analyzer, loopBound)
      }
      break
    }
    case 'conditional':
      attachParsedExpressions(node.whenTrue, analyzer, bound)
      attachParsedExpressions(node.whenFalse, analyzer, bound)
      break
    case 'if-statement':
      attachParsedExpressions(node.consequent, analyzer, bound)
      if (node.alternate) attachParsedExpressions(node.alternate, analyzer, bound)
      break
  }
}

export function jsxToIR(analyzer: AnalyzerContext): IRNode | null {
  const root = buildIRRoot(analyzer)
  if (root) attachParsedExpressions(root, analyzer)
  return root
}

function buildIRRoot(analyzer: AnalyzerContext): IRNode | null {
  // If there are conditional returns (if statements with JSX returns),
  // build an if-statement chain instead of a single node
  if (analyzer.conditionalReturns.length > 0) {
    const ctx = createTransformContext(analyzer)
    return buildIfStatementChain(analyzer, ctx)
  }

  if (!analyzer.jsxReturn) return null

  const ctx = createTransformContext(analyzer)
  const jsxReturn = analyzer.jsxReturn

  // Direct JSX return — the IR root is an `IRElement` / `IRFragment` that
  // already carries its own scope anchor (unless it's a Provider-only root,
  // which needs the synthetic-wrapper fallback below).
  if (
    ts.isJsxElement(jsxReturn) ||
    ts.isJsxSelfClosingElement(jsxReturn) ||
    ts.isJsxFragment(jsxReturn)
  ) {
    const ir = transformNode(jsxReturn, ctx)

    // Auto-generate scope wrapper for provider-only roots that lack a scope
    // element. When a component returns only a Provider wrapping children
    // (no native HTML element), `findScope()` would return null during
    // hydration. Wrapping in a synthetic `<div style="display:contents">`
    // provides the necessary bf-s anchor.
    if (ir && needsScopeWrapper(ir)) {
      return wrapInScopeElement(ir)
    }

    return ir
  }

  // Non-JSX-direct return — delegate to the `transformJsxExpression` core
  // (#971) and wrap in a synthetic scope element. This single path covers
  // `ConditionalExpression` (#968 — `return cond ? <A/> : <B/>`),
  // `BinaryExpression` with JSX right (`return cond && <A/>`,
  // `return a ?? <A/>`, `return a || <A/>`), and `CallExpression` for
  // `.map` / inline JSX helper (`return items.map(n => <li/>)`). If the
  // dispatcher returns `null` (scalar or forbidden kind), the component
  // produces no IR — same as the pre-refactor "return 42" path.
  //
  // `ctx.isRoot` is cleared because the synthetic wrapper carries the
  // scope; the inner IR must not double-mark a nested element as root.
  ctx.isRoot = false
  const ir = transformJsxExpression(jsxReturn, ctx)
  if (ir === null) return null
  return wrapInScopeElement(ir)
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
      value: AttrValueOf.literal('display:contents'),
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

  // Top-level ternary return: `return cond ? <A/> : <B/>` (#968).
  // Used when reached via `transformNode(analyzer.jsxReturn, ...)` from
  // buildIfStatementChain. jsxToIR's main path handles the scope wrapper
  // and calls transformConditional directly.
  if (ts.isConditionalExpression(node)) {
    return transformConditional(node, ctx)
  }

  return null
}

// =============================================================================
// JSX Element Transformation
// =============================================================================

/**
 * Map a local JSX tag name to its compile-away built-in (`Async` / `Region`)
 * if it was imported from `@barefootjs/client` (#1915). Recognition is
 * import-scoped — keyed off `imports` metadata, never a bare tag-name match —
 * so a user's own `<Async>` / `<Region>` component does not collide with the
 * built-in, and `import { Async as Boundary }` maps `<Boundary>` to it.
 * Memoized on `ctx`; the import list is fixed for the compile.
 */
function clientBuiltinTags(ctx: TransformContext): Map<string, ClientBuiltinTag> {
  if (ctx._clientBuiltinTags) return ctx._clientBuiltinTags
  const map = new Map<string, ClientBuiltinTag>()
  for (const imp of ctx.analyzer.imports) {
    // Require a *value* import: the tag is used as a JSX value, and the design
    // is import-value-required. `import type { Async }` brings no value binding
    // into scope (and is never a runtime import), so it does not scope the
    // built-in — `<Async>` then falls through to BF054 (#1915 review).
    if (imp.source !== CLIENT_BUILTIN_SOURCE || imp.isTypeOnly) continue
    for (const spec of imp.specifiers) {
      // Skip per-specifier `import { type Async }` — no value binding.
      if (spec.isDefault || spec.isNamespace || spec.isTypeOnly) continue
      if (isClientBuiltinName(spec.name)) {
        map.set(spec.alias ?? spec.name, spec.name)
      }
    }
  }
  ctx._clientBuiltinTags = map
  return map
}

/**
 * Whether `name` resolves to any in-scope value binding — an import (by its
 * local name), a local function / constant, or an ambient `declare`. Used to
 * keep the BF054 "import the built-in" diagnostic from firing when the author
 * legitimately has their own `<Async>` / `<Region>` binding.
 */
function isNameBound(ctx: TransformContext, name: string): boolean {
  const a = ctx.analyzer
  if (a.ambientGlobals.has(name)) return true
  if (a.localFunctions.some(f => f.name === name)) return true
  if (a.localConstants.some(c => c.name === name)) return true
  for (const imp of a.imports) {
    // Type-only imports create a type binding, not a value one — they can't
    // back a JSX value tag, so they must not suppress BF054. Applies to both
    // `import type { ... }` and per-specifier `import { type X }` (#1915 review).
    if (imp.isTypeOnly) continue
    for (const spec of imp.specifiers) {
      if (spec.isTypeOnly) continue
      if ((spec.alias ?? spec.name) === name) return true
    }
  }
  return false
}

function reportBuiltinNotImported(
  ctx: TransformContext,
  node: ts.Node,
  tagName: ClientBuiltinTag,
): void {
  ctx.analyzer.errors.push(
    createError(
      ErrorCodes.BUILTIN_REQUIRES_IMPORT,
      getSourceLocation(node, ctx.sourceFile, ctx.filePath),
      {
        severity: 'error',
        message: `<${tagName}> must be imported from '${CLIENT_BUILTIN_SOURCE}' to be recognised as a compiler built-in.`,
        suggestion: {
          message: `Add: import { ${tagName} } from '${CLIENT_BUILTIN_SOURCE}'`,
        },
      },
    ),
  )
}

/**
 * Dispatch a built-in JSX tag (`Async` / `Region`) when import-scoped
 * recognition matches, or emit BF054 when the bare built-in name is used
 * without the import and without any other in-scope binding. Returns the
 * lowered IR node, or `null` to fall through to normal component handling.
 */
function dispatchClientBuiltin(
  tagName: string,
  ctx: TransformContext,
  diagNode: ts.Node,
  transformAsync: () => IRNode,
  transformRegion: () => IRNode,
): IRNode | null {
  const builtin = clientBuiltinTags(ctx).get(tagName)
  if (builtin === 'Async') return transformAsync()
  if (builtin === 'Region') return transformRegion()
  if (isClientBuiltinName(tagName) && !isNameBound(ctx, tagName)) {
    reportBuiltinNotImported(ctx, diagNode, tagName)
  }
  return null
}

function transformJsxElement(
  node: ts.JsxElement,
  ctx: TransformContext
): IRNode {
  const tagName = node.openingElement.tagName.getText(ctx.sourceFile)

  // Detect Context.Provider pattern: X.Provider
  if (tagName.endsWith('.Provider') && /^[A-Z]/.test(tagName)) {
    return transformProviderElement(node, ctx, tagName)
  }

  // Detect compile-away built-ins (`<Async>` / `<Region>`), recognised by
  // their `@barefootjs/client` import rather than by tag name (#1915).
  const builtin = dispatchClientBuiltin(
    tagName,
    ctx,
    node.openingElement,
    () => transformAsyncElement(node, ctx),
    () => transformRegionElement(node, ctx),
  )
  if (builtin) return builtin

  const isComponent = /^[A-Z]/.test(tagName)

  if (isComponent) {
    const resolved = resolveMemberExpressionTag(node.openingElement.tagName, ctx)
    return transformComponentElement(node, ctx, resolved ?? tagName)
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

  // Detect compile-away built-ins (`<Async />` / `<Region />`), recognised by
  // their `@barefootjs/client` import rather than by tag name (#1915).
  const builtin = dispatchClientBuiltin(
    tagName,
    ctx,
    node,
    () => transformSelfClosingAsyncElement(node, ctx),
    () => transformSelfClosingRegionElement(node, ctx),
  )
  if (builtin) return builtin

  const isComponent = /^[A-Z]/.test(tagName)

  if (isComponent) {
    const resolved = resolveMemberExpressionTag(node.tagName, ctx)
    return transformSelfClosingComponent(node, ctx, resolved ?? tagName)
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

function reportMissingRequiredProp(
  ctx: TransformContext,
  node: ts.Node,
  tagName: string,
  propName: string,
): void {
  ctx.analyzer.errors.push(
    createError(
      ErrorCodes.COMPONENT_REQUIRED_PROP_MISSING,
      getSourceLocation(node, ctx.sourceFile, ctx.filePath),
      { message: `<${tagName}> requires a '${propName}' prop` },
    ),
  )
}

// Stub returned in place of an invalid built-in (Provider/Async). compileJSX
// still emits files when the IR root is non-null, so the BF046 diagnostic in
// `analyzer.errors` is the source of truth — consumers must check
// `result.errors` and fail on `severity:'error'`.
//
// Children are computed lazily so we can clear `ctx.isRoot` before the walk:
// otherwise `isRoot` would leak into only the first child, leaving the
// fragment without `needsScopeComment` and the rest of the children
// unscoped.
//
// `needsScopeComment` is suppressed for an empty stub (e.g. self-closing
// `<Async />`) — a bare bf-scope comment with no element sibling makes the
// runtime fall back to `comment.parentElement` as the proxy scope, hydrating
// the broken component against its parent container.
function stubFragment(
  ctx: TransformContext,
  node: ts.Node,
  computeChildren: () => IRNode[],
): IRFragment {
  const isFragmentRoot = ctx.isRoot
  ctx.isRoot = false
  const children = computeChildren()
  return {
    type: 'fragment',
    children,
    needsScopeComment: (isFragmentRoot && children.length > 0) || undefined,
    loc: getSourceLocation(node, ctx.sourceFile, ctx.filePath),
  }
}

function transformProviderElement(
  node: ts.JsxElement,
  ctx: TransformContext,
  tagName: string
): IRProvider | IRFragment {
  const contextName = tagName.slice(0, -'.Provider'.length)
  const props = processComponentProps(node.openingElement.attributes, ctx)
  const valueProp = props.find(p => p.name === 'value')

  if (!valueProp) {
    reportMissingRequiredProp(ctx, node.openingElement, tagName, 'value')
    return stubFragment(ctx, node, () => transformChildren(node.children, ctx))
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
): IRProvider | IRFragment {
  const contextName = tagName.slice(0, -'.Provider'.length)
  const props = processComponentProps(node.attributes, ctx)
  const valueProp = props.find(p => p.name === 'value')

  if (!valueProp) {
    reportMissingRequiredProp(ctx, node, tagName, 'value')
    return stubFragment(ctx, node, () => [])
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
    reportMissingRequiredProp(ctx, node.openingElement, 'Async', 'fallback')
    return stubFragment(ctx, node, () => transformChildren(node.children, ctx))
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
  // The JSX-as-prop case is now structurally captured by processComponentProps
  // as a `jsx-children` AttrValue variant — pluck the IR node directly.
  if (prop.value.kind === 'jsx-children' && prop.value.children.length > 0) {
    return prop.value.children[0]
  }

  // Fallback to a text node with the prop value's string form
  return {
    type: 'text',
    value: prop.value.kind === 'literal' ? prop.value.value : prop.value.kind === 'expression' ? prop.value.expr : '',
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
    reportMissingRequiredProp(ctx, node, 'Async', 'fallback')
    return stubFragment(ctx, node, () => [])
  }

  // The JSX-as-prop case is structurally captured by processComponentProps
  // as a `jsx-children` AttrValue variant — pluck the IR node directly.
  let fallbackNode: IRNode
  if (fallbackProp.value.kind === 'jsx-children' && fallbackProp.value.children.length > 0) {
    fallbackNode = fallbackProp.value.children[0]
  } else {
    fallbackNode = {
      type: 'text',
      value: fallbackProp.value.kind === 'literal'
        ? fallbackProp.value.value
        : fallbackProp.value.kind === 'expression'
          ? fallbackProp.value.expr
          : '',
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

/**
 * Lower `<Region>{children}</Region>` to a plain wrapper element carrying the
 * `bf-region` marker (spec/router.md "Regions"). The id is deterministic —
 * `<file scope>:<index>` — so a layout that compiles to one shared partial
 * emits the *same* id across every page that composes it, which is what the
 * client router matches on. `<Region>` is recognised by its `@barefootjs/client`
 * import (import-scoped, not a bare tag-name match — #1915).
 */
function regionId(ctx: TransformContext): string {
  return `${computeFileScope(ctx.filePath)}:${ctx.regionIdCounter++}`
}

function transformRegionElement(
  node: ts.JsxElement,
  ctx: TransformContext
): IRElement {
  const id = regionId(ctx)

  // Mirror transformHtmlElement's isRoot bookkeeping so the region's children
  // are not mistaken for component roots.
  const needsScope = ctx.isRoot
  ctx.isRoot = false

  const children = transformChildren(node.children, ctx)

  return {
    type: 'element',
    tag: 'div',
    attrs: [],
    events: [],
    ref: null,
    children,
    slotId: null,
    needsScope,
    regionId: id,
    loc: getSourceLocation(node, ctx.sourceFile, ctx.filePath),
  }
}

function transformSelfClosingRegionElement(
  node: ts.JsxSelfClosingElement,
  ctx: TransformContext
): IRElement {
  const id = regionId(ctx)
  const needsScope = ctx.isRoot
  ctx.isRoot = false

  return {
    type: 'element',
    tag: 'div',
    attrs: [],
    events: [],
    ref: null,
    children: [],
    slotId: null,
    needsScope,
    regionId: id,
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
    ...(isDynamicTagLocal(name, ctx) ? { dynamicTag: true } : {}),
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
    ...(isDynamicTagLocal(name, ctx) ? { dynamicTag: true } : {}),
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

// #1335: a fragment-wrapped jsx-children prop value lands as
// `IRFragment{ needsScopeComment: true, children: [IRElement{ needsScope: false }] }`
// because `transformFragment` runs while `ctx.isRoot` is still true at the
// processComponentProps call site. The comment-based scope marker is
// meaningful only at the component-render root; for a hoisted-children
// prop the inner element must instead participate in #1320's
// `bf-s="__BF_PARENT_SCOPE__"` placeholder path. Unwrap the single-element
// case here so the IR shape mirrors the bare-element form. Multi-element
// fragments stay unchanged (out of scope per #1335) — the comment-marker
// approach in direction 2 is the follow-up.
function unwrapHoistedFragment(node: IRNode): IRNode {
  if (
    node.type !== 'fragment' ||
    !node.needsScopeComment ||
    node.children.length !== 1
  ) {
    return node
  }
  const only = node.children[0]
  if (only.type !== 'element') return node
  return { ...only, needsScope: true }
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

/**
 * True for the literals that render NOTHING in JSX child position per
 * JSX semantics: `null`, `undefined`, `true`, `false` — including
 * transparently wrapped spellings (`{(null)}`, `{null as any}`,
 * `{undefined!}`). Deliberately narrow: `0`, `NaN`, and `''` are NOT
 * here (`0` renders "0"; `''` renders empty by stringification), and a
 * dynamic expression that EVALUATES to null is a runtime concern the
 * client runtime / adapters own, not a compile-time fold.
 *
 * `undefined` is an Identifier, not a keyword, and CAN be legally
 * shadowed (`const undefined = 1` — lint-hostile but valid JS); the
 * shadowed binding's VALUE must render, so the identifier only folds
 * when nothing in the binding environment (imports, locals, props,
 * signals, memos, active loop params) binds the name.
 */
function isRenderNothingLiteral(expr: ts.Expression, ctx: TransformContext): boolean {
  let e = expr
  while (
    ts.isParenthesizedExpression(e) ||
    ts.isAsExpression(e) ||
    ts.isSatisfiesExpression(e) ||
    ts.isNonNullExpression(e)
  ) {
    e = e.expression
  }
  return (
    e.kind === ts.SyntaxKind.NullKeyword ||
    e.kind === ts.SyntaxKind.TrueKeyword ||
    e.kind === ts.SyntaxKind.FalseKeyword ||
    (ts.isIdentifier(e) &&
      e.text === 'undefined' &&
      !isNameBoundInEnv('undefined', makeBindingEnv(ctx)))
  )
}

function transformText(node: ts.JsxText, ctx: TransformContext): IRText | null {
  // Normalize whitespace (React-like behavior)
  const text = node.text.replace(/\s+/g, ' ')

  if (text.trim() === '') {
    return null
  }

  return {
    type: 'text',
    // JSX decodes character references at parse time (`&copy;` IS the
    // text `©`), so the IR carries the DECODED value — the semantics —
    // and each adapter re-escapes for its own emission context.
    // Decode AFTER whitespace normalization: `&nbsp;` yields U+00A0,
    // which `\s+` would otherwise collapse into a plain space.
    value: decodeEntities(text),
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

  // Check for @client directive in prefix style: {/* @client */ expr}.
  // Detection is centralised in `hasLeadingClientDirective` so JSX-child,
  // attribute, and component-prop positions agree — a substring match on
  // `getFullText()` would false-positive on string literals or trailing
  // comments containing "@client".
  const isClientOnly = hasLeadingClientDirective(expr, ctx.sourceFile)
    || exprReferencesModuleClientSignal(expr, ctx)

  return transformExpressionInner(expr, ctx, node, isClientOnly)
}

/**
 * Inner dispatch for JSX-child expressions. Separated so a substituted
 * expression (e.g. inlining a branch scope variable's initializer at
 * the use site, #1409) can re-enter the dispatch chain with a
 * different `expr` than the original `node.expression`. The `node`
 * argument is preserved as the original JsxExpression so source
 * locations on the produced IR still point at the use site, not at
 * the substitution target.
 */
function transformExpressionInner(
  expr: ts.Expression,
  ctx: TransformContext,
  node: ts.JsxExpression,
  isClientOnly: boolean,
): IRNode | null {
  // #2092: `{cn\`base ${tone()}\`}` in JSX-child position — same desugar
  // as the attribute path (`getAttributeValue`), applied first so every
  // check below (JSX-constant inlining, the shared dispatcher, the
  // scalar fallback's `ctx.getJS`) sees the untagged template literal.
  expr = tryDesugarInterleaveTaggedTemplate(expr, ctx)

  // JSX render-nothing literals (#2171): `{null}` / `{undefined}` /
  // `{true}` / `{false}` in child position render NOTHING per JSX
  // semantics (`{0}` and `{''}` still render their stringification).
  // Folding here — Phase 1, before any adapter sees the node — is what
  // makes every backend agree: previously the literal fell through to
  // the scalar IRExpression fallback and each adapter stringified it
  // its own way (the Hono reference emitted the text "null" for
  // `{null}`, template adapters emitted "false" for `{false}`). The
  // conditional-branch path (`cond ? <a/> : null`) is NOT routed
  // through here and keeps its own null-branch handling.
  if (isRenderNothingLiteral(expr, ctx)) {
    return null
  }

  // Check for bare signal/memo identifier (BF044)
  checkBareSignalOrMemoIdentifier(expr, ctx)

  // #547: Inline a JSX constant referenced by identifier. Unique to JSX-child
  // position — conditional branches and return position don't resolve
  // Identifier to JSX. Keep outside the core so the core's Identifier case
  // stays classified as Scalar leaf per spec Appendix A.
  if (ts.isIdentifier(expr)) {
    const jsxNode = ctx.analyzer.jsxConstants.get(expr.text)
    if (jsxNode) {
      return transformNode(jsxNode, ctx)
    }

    // #1409: Same inlining for `const X = …` declared inside an
    // early-return `if`-block. The scope variable's initializer takes
    // the identifier's place — handles `<jsx/>` (JsxElement), dynamic
    // shapes (`cond ? <jsx/> : null`, `&&`, `??`), and scalar leaves
    // alike. Without this, a reference like `{/* @client */ aLocal}`
    // leaves the identifier in the emitted client JS at outer init
    // scope where `aLocal` doesn't exist — runtime
    // `ReferenceError: aLocal is not defined`.
    const branchInit = ctx._branchScopeVars?.get(expr.text)
    if (branchInit) {
      return transformExpressionInner(branchInit, ctx, node, isClientOnly)
    }

    // #1409 follow-up: same inlining for outer-scope consts whose
    // initializer holds JSX at a non-root position
    // (`cond ? <jsx/> : null`, `flag && <jsx/>`, `value ?? <jsx/>`).
    // The pure-JSX-literal case is handled by `jsxConstants` above;
    // these are picked up by the analyzer into `inlineableJsxConsts`
    // and routed through the same `transformExpressionInner` re-entry
    // so the dispatcher lowers the ternary / binary to IRConditional
    // with `clientOnly` propagated.
    const inlineableInit = ctx.analyzer.inlineableJsxConsts.get(expr.text)
    if (inlineableInit) {
      return transformExpressionInner(inlineableInit, ctx, node, isClientOnly)
    }
  }

  // Delegate all other JSX-structural dispatch to the shared core (#971).
  // The core handles ConditionalExpression / BinaryExpression (`&&`, `||`,
  // `??` with JSX right) / CallExpression (`.map`, inline JSX helper), plus
  // Transparent unwrapping and Scalar-leaf → null.
  const ir = transformJsxExpression(expr, ctx, isClientOnly)
  if (ir !== null) {
    // The pre-refactor behaviour only applied clientOnly/slotId post-processing
    // to IRConditional results (from the ternary / `&&` / `||` / `??` paths).
    // IRLoop handles `isClientOnly` internally via `transformMapCall`; other
    // shapes (IRElement / IRFragment / IRLoop / IRComponent from inline JSX
    // helpers) are unchanged. Mirror that exactly here.
    // A reactive brand-package condition (e.g. `form.field('x').error() &&
    // …`) can't be SSR-evaluated, so defer the whole conditional rather
    // than raising BF061 — same routing as a manual `/* @client */` (#1638).
    if ((isClientOnly || shouldAutoDeferReactiveBrand(expr, ctx)) && ir.type === 'conditional') {
      ir.clientOnly = true
      if (!ir.slotId) {
        ir.slotId = generateSlotId(ctx)
      }
    }
    return ir
  }

  // Scalar fallback — unchanged from pre-refactor.
  // BF062: catch nested await inside scalar expressions (e.g. {foo(await bar)})
  if (containsAwaitExpression(expr)) {
    ctx.analyzer.errors.push(
      createError(
        ErrorCodes.STAGE_AWAIT_IN_TEMPLATE,
        getSourceLocation(expr, ctx.sourceFile, ctx.filePath),
      ),
    )
    return {
      type: 'expression' as const,
      expr: 'undefined',
      typeInfo: null,
      reactive: false,
      slotId: null,
      loc: getSourceLocation(node, ctx.sourceFile, ctx.filePath),
      origin: { phase: 'tick', scope: 'template', effect: 'pure', freeRefs: [] },
    } satisfies IRExpression
  }
  const exprText = ctx.getJS(expr)
  const freeRefs = resolveFreeRefs(expr, makeBindingEnv(ctx))
  const origin: OriginInfo = {
    phase: 'tick',
    scope: 'template',
    effect: 'pure',
    freeRefs,
  }
  // Combine the legacy regex/checker classifier with the new origin-based
  // result so memo-as-value (Case 2) and renamed-prop (Case 3) cases —
  // which the regex path misses — light up the reactive flag during the
  // migration period.
  const reactive = isReactiveExpression(exprText, ctx, expr) || isReactiveOrigin(origin)
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
    origin,
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
      origin: {
        phase: 'tick',
        scope: 'template',
        effect: 'pure',
        freeRefs: [],
      },
    }
  } finally {
    ctx.getJS = originalCtxGetJS
    ctx.analyzer.getJS = originalAnalyzerGetJS
  }
}

function transformMultiReturnJsxFunctionCall(
  callExpr: ts.CallExpression,
  info: MultiReturnJsxInfo,
  ctx: TransformContext,
): IRNode {
  // Build substitution map: paramName → argument expression text
  const substitutions = new Map<string, string>()
  for (let i = 0; i < info.params.length; i++) {
    const paramName = info.params[i]
    const arg = callExpr.arguments[i]
    if (arg) {
      substitutions.set(paramName, ctx.getJS(arg))
    }
  }

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
    const loc = getSourceLocation(callExpr, ctx.sourceFile, ctx.filePath)
    const nullExpr: IRExpression = {
      type: 'expression',
      expr: 'null',
      typeInfo: { kind: 'primitive', raw: 'null', primitive: 'null' },
      reactive: false,
      slotId: null,
      loc,
      origin: { phase: 'tick', scope: 'template', effect: 'pure', freeRefs: [] },
    }

    // Build the conditional chain from bottom up (last branch → first branch)
    let result: IRNode = info.fallback
      ? (transformNode(info.fallback, ctx) ?? nullExpr)
      : nullExpr

    for (let i = info.branches.length - 1; i >= 0; i--) {
      const branch = info.branches[i]

      // Build condition text with param substitution
      let conditionText: string
      if (info.switchDiscriminant) {
        const discText = substitutedGetJS(info.switchDiscriminant)
        const caseText = substitutedGetJS(branch.condition)
        conditionText = `${discText} === ${caseText}`
      } else {
        conditionText = substitutedGetJS(branch.condition)
      }

      // For switch-sourced conditions, merge freeRefs/reactivity from
      // both the discriminant and case expression so prop rewrites and
      // reactivity detection cover the full `disc === case` condition.
      const env = makeBindingEnv(ctx)
      const caseFreeRefs = resolveFreeRefs(branch.condition, env)
      const discFreeRefs = info.switchDiscriminant
        ? resolveFreeRefs(info.switchDiscriminant, env)
        : []
      const conditionOrigin: OriginInfo = {
        phase: 'tick',
        scope: 'template',
        effect: 'pure',
        freeRefs: [...discFreeRefs, ...caseFreeRefs],
      }
      const reactive = isReactiveExpression(conditionText, ctx, branch.condition)
        || isReactiveOrigin(conditionOrigin)
      const loopParamReactive = !reactive && referencesLoopParam(conditionText, ctx)
      const callsReactive = exprCallsReactiveGetters(branch.condition, ctx)
        || (info.switchDiscriminant ? exprCallsReactiveGetters(info.switchDiscriminant, ctx) : false)
      const hasCalls = exprHasFunctionCalls(branch.condition)
        || (info.switchDiscriminant ? exprHasFunctionCalls(info.switchDiscriminant) : false)
      const needsSlot = reactive || loopParamReactive || callsReactive || hasCalls
      const slotId = needsSlot ? generateSlotId(ctx) : null

      const whenTrue = branch.jsxReturn
        ? (transformNode(branch.jsxReturn, ctx) ?? nullExpr)
        : nullExpr

      // For switch conditions, build templateCondition from both parts
      let templateCondition: string | undefined
      if (info.switchDiscriminant) {
        const discRewritten = rewriteBarePropRefs(
          substitutedGetJS(info.switchDiscriminant), info.switchDiscriminant, ctx
        )
        const caseRewritten = rewriteBarePropRefs(
          substitutedGetJS(branch.condition), branch.condition, ctx
        )
        const discPart = discRewritten ?? substitutedGetJS(info.switchDiscriminant)
        const casePart = caseRewritten ?? substitutedGetJS(branch.condition)
        templateCondition = `${discPart} === ${casePart}`
      } else {
        templateCondition = rewriteBarePropRefs(conditionText, branch.condition, ctx)
      }

      const conditional: IRConditional = {
        type: 'conditional',
        condition: conditionText,
        templateCondition,
        conditionType: null,
        reactive,
        whenTrue,
        whenFalse: result,
        slotId,
        callsReactiveGetters: callsReactive || undefined,
        hasFunctionCalls: hasCalls || undefined,
        loc,
        origin: conditionOrigin,
      }
      result = conditional
    }

    return result
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
  const conditionOrigin: OriginInfo = {
    phase: 'tick',
    scope: 'template',
    effect: 'pure',
    freeRefs: resolveFreeRefs(node.condition, makeBindingEnv(ctx)),
  }
  const reactive = isReactiveExpression(condition, ctx, node.condition) || isReactiveOrigin(conditionOrigin)
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
    origin: conditionOrigin,
  }
}

function transformLogicalAnd(
  node: ts.BinaryExpression,
  ctx: TransformContext
): IRConditional {
  const condition = ctx.getJS(node.left)
  const leftOrigin: OriginInfo = {
    phase: 'tick',
    scope: 'template',
    effect: 'pure',
    freeRefs: resolveFreeRefs(node.left, makeBindingEnv(ctx)),
  }
  const reactive = isReactiveExpression(condition, ctx, node.left) || isReactiveOrigin(leftOrigin)
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
    origin: {
      phase: 'tick',
      scope: 'template',
      effect: 'pure',
      freeRefs: [],
    },
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
    origin: leftOrigin,
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
 * Check if an expression calls a module/local JSX-returning helper (one
 * tracked in `jsxFunctions` / `jsxMultiReturnFunctions` for IR-level
 * inlining). Used alongside `containsJsxInExpression` so a map callback
 * body like `cond && themeLogo(t.id)` is recognised as renderable JSX
 * control flow even though it has no inline JSX literal (#1665).
 */
function callsJsxHelper(node: ts.Node, ctx: TransformContext): boolean {
  let found = false
  const visit = (n: ts.Node): void => {
    if (found) return
    if (ts.isCallExpression(n) && ts.isIdentifier(n.expression)) {
      const name = n.expression.text
      if (
        ctx.analyzer.jsxFunctions.has(name) ||
        ctx.analyzer.jsxMultiReturnFunctions.has(name)
      ) {
        found = true
        return
      }
    }
    ts.forEachChild(n, visit)
  }
  visit(node)
  return found
}

function containsAwaitExpression(node: ts.Node): boolean {
  if (ts.isAwaitExpression(node)) return true
  if (ts.isFunctionDeclaration(node) || ts.isFunctionExpression(node) || ts.isArrowFunction(node)) return false
  return ts.forEachChild(node, containsAwaitExpression) ?? false
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
  const leftOrigin: OriginInfo = {
    phase: 'tick',
    scope: 'template',
    effect: 'pure',
    freeRefs: resolveFreeRefs(node.left, makeBindingEnv(ctx)),
  }
  const reactive = isReactiveExpression(leftText, ctx, node.left) || isReactiveOrigin(leftOrigin)
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
    origin: leftOrigin,
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
    origin: leftOrigin,
  }
}

/**
 * JSX-embeddable expression dispatcher core (#971).
 *
 * Exhaustive `switch (expr.kind)` over every `ts.SyntaxKind` that
 * `ts.Expression` can hold, classified per the spec appendix
 * `spec/compiler.md` > Appendix A. Returns an `IRNode` for JSX-structural
 * kinds (element/fragment/conditional/binary-with-JSX/map/inline-JSX-helper),
 * unwraps and recurses for Transparent kinds, and returns `null` for
 * Scalar-leaf / Forbidden / Unreachable kinds so callers can apply their
 * own wrapper logic (scalar fallback, `@client` directive, scope wrapping).
 *
 * The `default` branch calls `assertNever` on a fully-narrowed union,
 * which makes a missing `case` a TypeScript compile-time error — not a
 * silent runtime drop. PR 6 of the #971 series adds a dedicated
 * regression test for this guarantee.
 */
type JsxEmbeddableExpression =
  // Transparent
  | ts.ParenthesizedExpression
  | ts.AsExpression
  | ts.SatisfiesExpression
  | ts.NonNullExpression
  | ts.TypeAssertion
  | ts.PartiallyEmittedExpression
  // JSX-structural
  | ts.JsxElement
  | ts.JsxFragment
  | ts.JsxSelfClosingElement
  | ts.ConditionalExpression
  | ts.BinaryExpression
  | ts.CallExpression
  // Scalar leaf
  | ts.Identifier
  | ts.StringLiteral
  | ts.NumericLiteral
  | ts.BigIntLiteral
  | ts.RegularExpressionLiteral
  | ts.NoSubstitutionTemplateLiteral
  | ts.TemplateExpression
  | ts.TaggedTemplateExpression
  | ts.TrueLiteral
  | ts.FalseLiteral
  | ts.NullLiteral
  | ts.ThisExpression
  | ts.SuperExpression
  | ts.ImportExpression
  | ts.PropertyAccessExpression
  | ts.ElementAccessExpression
  | ts.PrefixUnaryExpression
  | ts.PostfixUnaryExpression
  | ts.TypeOfExpression
  | ts.VoidExpression
  | ts.DeleteExpression
  | ts.NewExpression
  | ts.ObjectLiteralExpression
  | ts.ArrowFunction
  | ts.FunctionExpression
  | ts.ClassExpression
  | ts.MetaProperty
  | ts.ExpressionWithTypeArguments
  | ts.CommaListExpression
  | ts.SyntheticExpression
  | ts.ArrayLiteralExpression
  // Forbidden in render position (errors promoted in PR 5)
  | ts.AwaitExpression
  | ts.YieldExpression
  // Unreachable at render position (parser prevents reaching here in well-formed sources)
  | ts.SpreadElement
  | ts.OmittedExpression
  | ts.JsxExpression
  | ts.JsxOpeningElement
  | ts.JsxOpeningFragment
  | ts.JsxClosingFragment
  | ts.JsxAttributes
  | ts.MissingDeclaration

function assertNever(expr: never): never {
  const kind = (expr as { kind?: number } | null)?.kind
  throw new Error(
    `transformJsxExpression: unhandled ts.SyntaxKind ${kind !== undefined ? ts.SyntaxKind[kind] : 'unknown'} ` +
      `(kind=${kind}). Update spec/compiler.md Appendix A and the switch in jsx-to-ir.ts.`,
  )
}

function transformJsxExpression(
  expr: ts.Expression,
  ctx: TransformContext,
  isClientOnly = false,
): IRNode | null {
  const node: JsxEmbeddableExpression = expr as JsxEmbeddableExpression
  switch (node.kind) {
    // --- Transparent: unwrap and recurse ---
    case ts.SyntaxKind.ParenthesizedExpression:
    case ts.SyntaxKind.AsExpression:
    case ts.SyntaxKind.SatisfiesExpression:
    case ts.SyntaxKind.NonNullExpression:
    case ts.SyntaxKind.TypeAssertionExpression:
    case ts.SyntaxKind.PartiallyEmittedExpression:
      return transformJsxExpression(node.expression, ctx, isClientOnly)

    // --- JSX-structural: delegate to shape transformer ---
    case ts.SyntaxKind.JsxElement:
      return transformJsxElement(node, ctx)
    case ts.SyntaxKind.JsxFragment:
      return transformFragment(node, ctx)
    case ts.SyntaxKind.JsxSelfClosingElement:
      return transformSelfClosingElement(node, ctx)
    case ts.SyntaxKind.ConditionalExpression:
      return transformConditional(node, ctx)
    case ts.SyntaxKind.BinaryExpression: {
      if (node.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken) {
        return transformLogicalAnd(node, ctx)
      }
      if (
        (node.operatorToken.kind === ts.SyntaxKind.QuestionQuestionToken ||
          node.operatorToken.kind === ts.SyntaxKind.BarBarToken) &&
        (containsJsxInExpression(node.right) || callsJsxHelper(node.right, ctx))
      ) {
        return transformNullishCoalescing(node, ctx)
      }
      // Any other binary operator (`+`, `===`, assignments, comma, …) or
      // `||`/`??` with a non-JSX right operand is a scalar — caller handles.
      return null
    }
    case ts.SyntaxKind.CallExpression: {
      const mapMethod = getMapLikeMethod(node)
      if (mapMethod) {
        // `isClientOnly` gates sort/filter extraction inside transformMapCall
        // (client-only loops keep the map callback verbatim). Thread through
        // so JSX-child position preserves pre-refactor behaviour.
        const mapResult = transformMapCall(node, ctx, isClientOnly, mapMethod)
        if (mapResult) return mapResult
      }
      const callee = node.expression
      if (ts.isIdentifier(callee)) {
        const jsxFunc = ctx.analyzer.jsxFunctions.get(callee.text)
        if (jsxFunc) {
          return transformJsxFunctionCall(node, jsxFunc, ctx, isClientOnly)
        }
        const multiJsxFunc = ctx.analyzer.jsxMultiReturnFunctions.get(callee.text)
        if (multiJsxFunc) {
          return transformMultiReturnJsxFunctionCall(node, multiJsxFunc, ctx)
        }
      }
      return null
    }

    // --- Scalar leaf: caller emits IRExpression ---
    case ts.SyntaxKind.Identifier:
    case ts.SyntaxKind.StringLiteral:
    case ts.SyntaxKind.NumericLiteral:
    case ts.SyntaxKind.BigIntLiteral:
    case ts.SyntaxKind.RegularExpressionLiteral:
    case ts.SyntaxKind.NoSubstitutionTemplateLiteral:
    case ts.SyntaxKind.TemplateExpression:
    case ts.SyntaxKind.TaggedTemplateExpression:
    case ts.SyntaxKind.TrueKeyword:
    case ts.SyntaxKind.FalseKeyword:
    case ts.SyntaxKind.NullKeyword:
    case ts.SyntaxKind.ThisKeyword:
    case ts.SyntaxKind.SuperKeyword:
    case ts.SyntaxKind.ImportKeyword:
    case ts.SyntaxKind.PropertyAccessExpression:
    case ts.SyntaxKind.ElementAccessExpression:
    case ts.SyntaxKind.PrefixUnaryExpression:
    case ts.SyntaxKind.PostfixUnaryExpression:
    case ts.SyntaxKind.TypeOfExpression:
    case ts.SyntaxKind.VoidExpression:
    case ts.SyntaxKind.DeleteExpression:
    case ts.SyntaxKind.NewExpression:
    case ts.SyntaxKind.ObjectLiteralExpression:
    case ts.SyntaxKind.ArrowFunction:
    case ts.SyntaxKind.FunctionExpression:
    case ts.SyntaxKind.ClassExpression:
    case ts.SyntaxKind.MetaProperty:
    case ts.SyntaxKind.ExpressionWithTypeArguments:
    case ts.SyntaxKind.CommaListExpression:
    case ts.SyntaxKind.SyntheticExpression:
    case ts.SyntaxKind.ArrayLiteralExpression:
      return null

    // --- Forbidden in render position ---
    case ts.SyntaxKind.AwaitExpression:
      ctx.analyzer.errors.push(
        createError(
          ErrorCodes.STAGE_AWAIT_IN_TEMPLATE,
          getSourceLocation(node, ctx.sourceFile, ctx.filePath),
        ),
      )
      return {
        type: 'expression' as const,
        expr: 'undefined',
        typeInfo: null,
        reactive: false,
        slotId: null,
        loc: getSourceLocation(node, ctx.sourceFile, ctx.filePath),
        origin: { phase: 'tick', scope: 'template', effect: 'pure', freeRefs: [] },
      } satisfies IRExpression
    case ts.SyntaxKind.YieldExpression:
      return null

    // --- Unreachable at render position ---
    // Parser prevents these in well-formed sources; listed for exhaustiveness
    // so an upstream TypeScript change that repurposes one of these kinds
    // surfaces as a compile error here instead of silently drifting.
    case ts.SyntaxKind.SpreadElement:
    case ts.SyntaxKind.OmittedExpression:
    case ts.SyntaxKind.JsxExpression:
    case ts.SyntaxKind.JsxOpeningElement:
    case ts.SyntaxKind.JsxOpeningFragment:
    case ts.SyntaxKind.JsxClosingFragment:
    case ts.SyntaxKind.JsxAttributes:
    case ts.SyntaxKind.MissingDeclaration:
      return null

    default:
      return assertNever(node)
  }
}

function transformConditionalBranch(
  node: ts.Expression,
  ctx: TransformContext,
): IRNode {
  const ir = transformJsxExpression(node, ctx)
  if (ir !== null) return ir

  // Scalar / null / forbidden / unreachable kinds fall through to branch-level
  // IRExpression. This preserves the pre-refactor behaviour where a
  // non-JSX-structural expression in a conditional branch renders as its JS
  // value. `null` specifically renders as empty via the adapter's scalar
  // pathway.
  const exprText = ctx.getJS(node)
  const branchOrigin: OriginInfo = {
    phase: 'tick',
    scope: 'template',
    effect: 'pure',
    freeRefs: resolveFreeRefs(node, makeBindingEnv(ctx)),
  }
  const callsReactive = exprCallsReactiveGetters(node, ctx)
  const hasCalls = exprHasFunctionCalls(node)
  const reactive = isReactiveExpression(exprText, ctx, node) || isReactiveOrigin(branchOrigin)
  const needsSlot = reactive || callsReactive
  const slotId = needsSlot ? generateSlotId(ctx) : null
  return {
    type: 'expression',
    expr: exprText,
    templateExpr: rewriteBarePropRefs(exprText, node, ctx),
    typeInfo: inferExpressionType(node, ctx),
    reactive,
    slotId,
    callsReactiveGetters: callsReactive || undefined,
    hasFunctionCalls: hasCalls || undefined,
    loc: getSourceLocation(node, ctx.sourceFile, ctx.filePath),
    origin: branchOrigin,
  }
}

// =============================================================================
// Map Call (Loop) Transformation
// =============================================================================

function isMapCall(node: ts.CallExpression): boolean {
  return getMapLikeMethod(node) === 'map'
}

function getMapLikeMethod(node: ts.CallExpression): 'map' | 'flatMap' | null {
  if (!ts.isPropertyAccessExpression(node.expression)) return null
  const name = node.expression.name.text
  if (name === 'map') return 'map'
  if (name === 'flatMap') return 'flatMap'
  return null
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
 * Check if a node is an `.entries()`, `.keys()`, or `.values()` call
 * (zero-arg, property-access form). Returns the underlying array expression
 * and the iteration shape so `transformMapCall` can strip the iterator
 * method and record it on the IRLoop.
 */
function isIteratorShapeCall(
  node: ts.Expression,
): { array: ts.LeftHandSideExpression; shape: 'entries' | 'keys' | 'values' } | null {
  if (!ts.isCallExpression(node)) return null
  if (!ts.isPropertyAccessExpression(node.expression)) return null
  if (node.arguments.length !== 0) return null
  const name = node.expression.name.text
  if (name !== 'entries' && name !== 'keys' && name !== 'values') return null
  return { array: node.expression.expression, shape: name }
}

/**
 * Check if a node is the STATIC `Object.entries(x)` / `Object.keys(x)` /
 * `Object.values(x)` call form (#2168 object-entries-map) — the
 * one-argument form where `x` is a plain object/Record being iterated,
 * as opposed to {@link isIteratorShapeCall}'s zero-arg instance-method
 * form (`arr.entries()`) on an actual array. Returns the object
 * expression (any expression — `props.x`, `x ?? {}`, not just a bare
 * identifier) and the iteration shape so `transformMapCall` can strip
 * the `Object.<method>(...)` wrapper and record it on the IRLoop as
 * `objectIteration` (see that field's docstring in `types.ts` for why
 * this is a distinct field from `iterationShape`, not a shared one).
 */
function isObjectIteratorCall(
  node: ts.Expression,
): { object: ts.Expression; shape: 'entries' | 'keys' | 'values' } | null {
  if (!ts.isCallExpression(node)) return null
  if (!ts.isPropertyAccessExpression(node.expression)) return null
  if (!ts.isIdentifier(node.expression.expression)) return null
  if (node.expression.expression.text !== 'Object') return null
  if (node.arguments.length !== 1) return null
  const name = node.expression.name.text
  if (name !== 'entries' && name !== 'keys' && name !== 'values') return null
  return { object: node.arguments[0], shape: name }
}

type SortExtractionResult = {
  result: IRLoopSort | null
  unsupportedReason?: string
}

/**
 * Extract sort comparator info from a `.sort(cmp)` / `.toSorted(cmp)`
 * callback at the chained `.sort().map()` detection site (#2018 P5). Parses the
 * callback into a generic `arrow` (params + body) and gates the loop-hoist on
 * the same finite catalogue `sortComparatorFromArrow` recognises (so a
 * comparator the localeCompare fallback can't model stays client-side, exactly
 * as before). The carried {@link IRLoopSort} feeds the SSR adapter's evaluator
 * (eval-first) and the client's JS round-trip. Accepted catalogue: subtraction
 * (`a.f - b.f`, `a - b`, reverse for desc), `.localeCompare`, and the
 * relational-ternary sign forms; any of them `||`-chained for multi-key.
 *
 * A bare identifier callback (`.sort(byPrice)`, #2090) is resolved one hop
 * through {@link resolveSortComparatorIdentifier} — a module- or
 * component-scope `const byPrice = (a, b) => …` or `function byPrice(a, b)
 * {…}` — before falling into the same arrow + catalogue gate below, so a
 * resolved reference is byte-for-byte equivalent to inlining it. Alias
 * chains (`const c2 = c1`) and imported/prop identifiers are NOT followed —
 * they surface a distinct "could not be resolved" BF021.
 */
function extractSortComparator(
  callback: ts.Expression,
  _method: 'sort' | 'toSorted',
  ctx: TransformContext
): SortExtractionResult {
  // Surface the OUTER callback source — users see the string they wrote
  // (for an identifier callback, `ctx.getJS` returns just the bare name).
  const outerRaw = ctx.getJS(callback)
  const unsupported = (): SortExtractionResult => ({
    result: null,
    unsupportedReason:
      `Sort comparator '${outerRaw}' is not a supported shape. Accepted:\n` +
      `  (a, b) => a - b\n` +
      `  (a, b) => a.field - b.field\n` +
      `  (a, b) => a.localeCompare(b)\n` +
      `  (a, b) => a.field.localeCompare(b.field)\n` +
      `  (a, b) => a.field > b.field ? 1 : a.field < b.field ? -1 : 0\n` +
      `  any of the above '||'-chained for multi-key tie-breaks\n` +
      `(reverse the operands for descending order).`,
  })

  let resolvedNode: ts.Expression = callback
  if (ts.isIdentifier(callback)) {
    const resolved = resolveSortComparatorIdentifier(callback.text, ctx)
    if (!resolved) {
      return {
        result: null,
        unsupportedReason:
          `Sort comparator '${outerRaw}' could not be resolved to a local function — ` +
          `declare it in the same file or inline it.`,
      }
    }
    resolvedNode = resolved
  }

  if (!ts.isArrowFunction(resolvedNode) && !ts.isFunctionExpression(resolvedNode)) {
    return {
      result: null,
      unsupportedReason: 'Sort comparator must be an arrow function or function expression',
    }
  }
  const arrow = tsNodeToParsedExpr(resolvedNode)
  if (arrow.kind !== 'arrow' || arrow.params.length !== 2) return unsupported()
  // Gate on the same catalogue the localeCompare fallback recovers, so the
  // hoist decision (and thus the SSR/client split) is byte-for-byte unchanged.
  if (sortComparatorFromArrow(arrow) === null) return unsupported()
  return {
    result: {
      arrow,
      paramA: arrow.params[0],
      paramB: arrow.params[1],
      raw: stringifyParsedExpr(arrow.body),
    },
  }
}

/**
 * Resolve a bare-identifier sort comparator callback (`.sort(byPrice)`,
 * #2090) to its underlying arrow / function-expression node, ONE HOP only
 * — no alias chains (`const c2 = c1` is not followed; `c2` resolves to the
 * identifier `c1`, not a function, and is left unresolved).
 *
 * A name bound BOTH as a const and as a `function` declaration is refused
 * outright. In valid JS that collision only occurs across scopes (a
 * same-scope redeclaration is a syntax error), and `FunctionInfo` does not
 * carry the source scope — component-body `function` declarations are
 * hoisted to module scope for client emission, so its `isModule` reflects
 * EMISSION placement, not lexical position. Picking either binding would
 * risk compiling the comparator the call site can't actually see (Copilot
 * review on #2091), so the ambiguity resolves to the loud unresolved
 * BF021 instead of a guess. Within a single kind, the existing
 * shadowing-aware lookups apply (`findLocalConst` / `findLocalFunction`:
 * component scope beats module scope, last in source order); a binding
 * that isn't an arrow / function expression fails resolution without any
 * cross-kind fallback.
 *
 * Returns null when the name doesn't resolve to a local arrow /
 * function-expression — covers the cross-kind ambiguity, a non-function
 * const, an import, a prop, or a name with no local binding at all. The
 * caller surfaces BF021 either way; the specific message (off-catalogue
 * vs. unresolved) is decided by the caller, not here.
 */
function resolveSortComparatorIdentifier(name: string, ctx: TransformContext): ts.Expression | null {
  const constInfo = findLocalConst(name, ctx.analyzer)
  const fnInfo = findLocalFunction(name, ctx.analyzer)
  if (constInfo && fnInfo) return null
  if (constInfo) {
    const ast = parseConstInitializer(constInfo)
    return ast && (ts.isArrowFunction(ast) || ts.isFunctionExpression(ast)) ? ast : null
  }
  if (fnInfo) {
    const ast = parseFunctionInfoAsExpr(fnInfo)
    return ast && (ts.isArrowFunction(ast) || ts.isFunctionExpression(ast)) ? ast : null
  }
  return null
}

/**
 * Resolve a bare-identifier callback passed to a value-position higher-order
 * array method (`tags.map(format)`, `.filter`, `.sort`, … — any name in
 * {@link CALLBACK_METHODS}, #2206) to its underlying arrow / function-
 * expression node — the SAME one-hop, ambiguity-refuses lookup #2090
 * established for `.sort(fnref)` comparators (`resolveSortComparatorIdentifier`
 * above). Kept as its own small function (mirroring the existing
 * `resolveInterleaveTagIdentifier` precedent below) rather than sharing code
 * with the sort resolver, so each call site's refusal semantics stay
 * independently reviewable.
 *
 * Only needs `AnalyzerContext` (not a full `TransformContext`) because its
 * caller, {@link resolveCallbackMethodFunctionReferences}, runs as a
 * post-parse pass over an already-built `ParsedExpr` tree — no live
 * `ts.Node`/source-file binding is available or needed, since
 * `parseConstInitializer` / `parseFunctionInfoAsExpr` re-parse the
 * analyzer's stored declaration TEXT into a fresh, isolated source file.
 */
function resolveCallbackMethodFunctionReferenceIdentifier(name: string, analyzer: AnalyzerContext): ts.Expression | null {
  const constInfo = findLocalConst(name, analyzer)
  const fnInfo = findLocalFunction(name, analyzer)
  if (constInfo && fnInfo) return null
  if (constInfo) {
    const ast = parseConstInitializer(constInfo)
    return ast && (ts.isArrowFunction(ast) || ts.isFunctionExpression(ast)) ? ast : null
  }
  if (fnInfo) {
    const ast = parseFunctionInfoAsExpr(fnInfo)
    return ast && (ts.isArrowFunction(ast) || ts.isFunctionExpression(ast)) ? ast : null
  }
  return null
}

/**
 * Post-parse pass (#2206): walk a `ParsedExpr` tree and resolve every
 * `<recv>.<CALLBACK_METHODS method>(<bare identifier>, …rest)` call's
 * callback argument to its declaration, so `tags.map(format).join(' ')`
 * compiles exactly as if `format`'s body had been written inline
 * (`tags.map(t => '#' + t).join(' ')`) — the shape `asCallbackMethodCall`
 * (expression-parser.ts) already recognizes and every adapter's `map_eval`
 * (#2073) already lowers.
 *
 * Runs AFTER `parseExpression`, not threaded into it, because the
 * value-returning `.map(cb)` form is recognized generically downstream of
 * parsing (`asCallbackMethodCall`'s `arrow.kind !== 'arrow'` check), not
 * during it — `convertNode` already happily produces a generic `call` node
 * with an `identifier` arg for `tags.map(format)` with no special-casing
 * needed there. An unresolvable reference (import, non-function const,
 * alias chain, cross-kind ambiguity — see
 * {@link resolveCallbackMethodFunctionReferenceIdentifier}) or a resolved
 * body that can't fold to a single expression is left untouched: the
 * `identifier` arg passes through as-is, and `asCallbackMethodCall`'s
 * existing arrow-kind check still refuses it with the current BF101,
 * unchanged.
 *
 * A spliced-in resolved arrow's OWN body is not re-walked (`visit` returns
 * it as-is rather than recursing) — a bare-identifier callback declared
 * INSIDE another resolved declaration (`const outer = xs => xs.map(inner).join(',')`
 * used as `rows.map(outer)`) stays unresolved and BF101-refuses, same as
 * before #2206. This is a deliberate one-hop limit, not an oversight: naively
 * recursing risks an infinite loop on a self-referential declaration
 * (`const f = xs => xs.map(f)`), which would need a resolution stack to
 * detect — out of scope here. Fails safe (refuses loudly rather than
 * mis-rendering); see the pinned-refusal test in map-function-reference.test.ts.
 *

 * `bound` tracks names that are lexically shadowed at the current walk
 * position — an enclosing arrow's own params (`rows.map(fn => fn.tags.map(fn)…)`
 * — so a bare identifier that refers to a PARAMETER rather than a same-file
 * const/function is never resolved against the const/function tables
 * (Fable review, #2214): it grows exactly like {@link freeVarsInBody}'s own
 * `bound` set, at the SAME `arrow` case. The initial call from
 * `attachParsedExpressions` seeds it with the enclosing loop's `param`/
 * `index` too (a loop's item variable shadows a same-named module const the
 * same way a callback arrow's param does — `origin.freeRefs` already tags
 * such a name `kind: 'render-item'`, this walk now honors it).
 */
function resolveCallbackMethodFunctionReferences(
  expr: ParsedExpr,
  analyzer: AnalyzerContext,
  bound: ReadonlySet<string> = EMPTY_BOUND,
): ParsedExpr {
  function visit(e: ParsedExpr, bound: ReadonlySet<string>): ParsedExpr {
    switch (e.kind) {
      case 'literal':
      case 'identifier':
      case 'regex':
      case 'unsupported':
        return e
      case 'call': {
        const callee = visit(e.callee, bound)
        const args = e.args.map(a => visit(a, bound))
        if (
          callee.kind === 'member' && !callee.computed &&
          CALLBACK_METHODS.has(callee.property) &&
          args[0]?.kind === 'identifier' &&
          !bound.has(args[0].name)
        ) {
          const resolved = resolveCallbackMethodFunctionReferenceIdentifier(args[0].name, analyzer)
          const arrow = resolved ? tsNodeToParsedExpr(resolved) : null
          if (arrow && arrow.kind === 'arrow') args[0] = arrow
        }
        return { ...e, callee, args }
      }
      case 'member':
        return { ...e, object: visit(e.object, bound) }
      case 'index-access':
        return { ...e, object: visit(e.object, bound), index: visit(e.index, bound) }
      case 'binary':
      case 'logical':
        return { ...e, left: visit(e.left, bound), right: visit(e.right, bound) }
      case 'unary':
        return { ...e, argument: visit(e.argument, bound) }
      case 'conditional':
        return { ...e, test: visit(e.test, bound), consequent: visit(e.consequent, bound), alternate: visit(e.alternate, bound) }
      case 'template-literal':
        return { ...e, parts: e.parts.map(p => (p.type === 'expression' ? { ...p, expr: visit(p.expr, bound) } : p)) }
      case 'array-literal':
        return { ...e, elements: e.elements.map(el => visit(el, bound)) }
      case 'array-method':
        // `e.args` is a fixed-length tuple for some `method` variants (e.g.
        // `flat`'s `args: []`) — `.map(visit)` preserves length/order (a
        // callback resolution never adds/removes args), so this is a
        // same-shape cast, not a structural change. TS can't verify the
        // per-`method` tuple-length invariant across a `.map`, hence the
        // whole-object cast rather than a narrower one.
        return {
          ...e,
          object: visit(e.object, bound),
          args: e.args.map(a => visit(a, bound)),
          ...(e.method === 'flat' && e.depthExpr ? { depthExpr: visit(e.depthExpr, bound) } : {}),
        } as ParsedExpr
      case 'object-literal':
        return { ...e, properties: e.properties.map(p => ({ ...p, value: visit(p.value, bound) })) }
      case 'arrow': {
        const inner = e.params.length === 0 ? bound : new Set([...bound, ...e.params])
        return { ...e, body: visit(e.body, inner) }
      }
    }
  }
  return visit(expr, bound)
}

/**
 * Result type for extractFilterPredicate. The predicate is always an expression:
 * a block body is normalized to one via `foldBlockToExpr` +
 * `predicateTernaryToLogical` (#2040).
 */
type FilterPredicateResult = {
  param: string
  predicate?: ParsedExpr
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

  // Destructured filter param (#1443, #1530, #1531, #1532).
  // `extractFilterPredicate` itself doesn't carry destructure rewrites
  // — those run inside the adapter's `parseExpression` pass over the
  // raw array text (the surrounding `setArray(mapSource)` keeps the
  // whole `items().filter(({a, ...rest}) => …)` chain in the array
  // string, and the adapter's higher-order path lowers it the same
  // way it would for a hand-written `(_t) => _t.a` shape).
  //
  // Validate-only here so refusal reasons from the parser — including
  // the #1532 Mode B "rest as value" path and the rest/declared-key
  // collision — surface as `unsupportedReason`. The caller turns that
  // into BF021 (with the `@client` workaround); for shapes the parser
  // accepts, leaving `result: null` with no reason preserves the
  // existing adapter raw-text lowering path.
  if (!ts.isIdentifier(firstParam.name)) {
    // Block body + destructured param: `parseBlockBody` doesn't carry
    // the destructure rewrite and `parseExpression` only handles
    // expression-body arrows. Surface BF021 so the user gets a
    // deterministic pointer at the predicate + `/* @client */` escape
    // instead of letting it slip through to a later BF101 (#1532 review).
    if (ts.isBlock(callback.body)) {
      return {
        result: null,
        unsupportedReason:
          'Block body in a destructured filter param is not supported. Workaround: use an expression-body arrow, or add /* @client */.',
      }
    }
    const raw = ctx.getJS(callback)
    const parsed = parseExpression(raw)
    if (parsed.kind === 'unsupported') {
      return { result: null, unsupportedReason: parsed.reason }
    }
    if (parsed.kind === 'arrow') {
      const support = isSupported(parsed.body)
      if (!support.supported) {
        return { result: null, unsupportedReason: support.reason }
      }
    }
    return { result: null }
  }

  const param = firstParam.name.getText(ctx.sourceFile)

  // Block body arrow functions: filter(t => { const f = filter(); ... }).
  // Normalize the value-producing block into a single boolean predicate
  // expression (#2040): let-inline + early-return/`if` → ternary, then the
  // boolean-context ternary → `&&`/`||` so it flows through the same expression
  // predicate path as `filter(t => !t.done)` — no per-adapter block-condition
  // renderer. Idempotent reactive getter reads (`const f = filter()`) are
  // treated as pure so a signal read on several branches still folds.
  if (ts.isBlock(callback.body)) {
    const raw = ctx.getJS(callback.body)
    const statements = parseBlockBody(callback.body, ctx.sourceFile, (n) => ctx.getJS(n))
    if (!statements) {
      return { result: null, unsupportedReason: 'Block body filter predicate cannot be parsed for server-side rendering' }
    }
    const folded = foldBlockToExpr(statements, { pureCallNames: getReactiveGetterNames(ctx) })
    if (!folded.ok) {
      return { result: null, unsupportedReason: folded.reason }
    }
    const predicate = predicateTernaryToLogical(folded.expr)
    const support = isSupported(predicate)
    if (!support.supported) {
      return { result: null, unsupportedReason: support.reason }
    }
    return { result: { param, predicate, raw } }
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

/**
 * Build the list of destructured bindings for a `.map()` callback parameter.
 *
 * Returns:
 * - `null` when the parameter is a plain identifier (no destructuring).
 * - `{ unsupported: true }` when the pattern contains a non-literal computed
 *   property key — that shape can't be expressed as a fixed accessor path
 *   and is surfaced as `BF025`.
 * - An array of `LoopParamBinding` otherwise.
 *
 * Fixed bindings carry a JS accessor suffix in `path`; rest bindings carry
 * the parent prefix plus a `rest` descriptor that the emitter expands to a
 * runtime residual expression. See the `LoopParamBinding` jsdoc.
 */
function extractLoopParamBindings(
  pattern: ts.BindingName,
): LoopParamBinding[] | { unsupported: true } | null {
  if (ts.isIdentifier(pattern)) return null

  const bindings: LoopParamBinding[] = []
  let unsupported = false

  // Authoritative IdentifierName classification, built on TS's own
  // `isIdentifierStart` / `isIdentifierPart` primitives so the rule is
  // Unicode-aware and stays aligned with whatever spelling TS itself
  // considers a legal identifier. Single source of truth for both the
  // `.foo` vs `["foo"]` accessor decision (below) AND the residual-object
  // destructure-pattern quoting consumed downstream by the emitter, which
  // reads `RestExcludeKey.isIdent` rather than re-running its own
  // identifier regex (#1244 patterns D and F).
  const isIdent = (key: string): boolean => {
    if (key.length === 0) return false
    for (let i = 0; i < key.length; ) {
      const cp = key.codePointAt(i)!
      const ok = i === 0
        ? ts.isIdentifierStart(cp, ts.ScriptTarget.Latest)
        : ts.isIdentifierPart(cp, ts.ScriptTarget.Latest)
      if (!ok) return false
      i += cp > 0xFFFF ? 2 : 1
    }
    return true
  }

  const appendDotAccess = (prefix: string, key: string): string => {
    return isIdent(key)
      ? `${prefix}.${key}`
      : `${prefix}[${JSON.stringify(key)}]`
  }

  const walk = (
    p: ts.ArrayBindingPattern | ts.ObjectBindingPattern,
    prefix: string,
    segments: readonly LoopBindingPathSegment[],
  ): void => {
    if (unsupported) return
    if (ts.isArrayBindingPattern(p)) {
      const elements = p.elements
      for (let index = 0; index < elements.length; index++) {
        if (unsupported) return
        const el = elements[index]
        if (ts.isOmittedExpression(el)) continue
        if (el.dotDotDotToken) {
          // TS already rejects rest tokens in non-final slots and rest targets
          // that are not plain identifiers at parse time; reaching either
          // branch here means an upstream tool produced a malformed AST. Throw
          // instead of falling through to BF025 so the stack points at the
          // broken caller. See #1311.
          internalInvariant(
            index === elements.length - 1,
            'extractLoopParamBindings: array rest token in non-final position (parser should reject)',
          )
          internalInvariant(
            ts.isIdentifier(el.name),
            'extractLoopParamBindings: array rest target is not an identifier (parser should reject)',
          )
          bindings.push({
            name: el.name.text,
            path: prefix,
            rest: { kind: 'array', from: index },
            segments,
          })
          return
        }
        const path = `${prefix}[${index}]`
        const nextSegments = [...segments, { kind: 'index', index } as const]
        if (ts.isIdentifier(el.name)) {
          bindings.push({ name: el.name.text, path, segments: nextSegments })
        } else {
          walk(el.name, path, nextSegments)
        }
      }
      return
    }
    // ObjectBindingPattern
    const collectedKeys: RestExcludeKey[] = []
    const elements = p.elements
    for (let i = 0; i < elements.length; i++) {
      if (unsupported) return
      const el = elements[i]
      if (el.dotDotDotToken) {
        // Same parser-enforced shape constraint as array rest: must be last,
        // must be a plain identifier. `exclude` is the list of sibling keys
        // destructured at this level so the emitter can subtract them at
        // runtime — each entry already carries its `isIdent` classification so
        // no further regex runs downstream.
        internalInvariant(
          i === elements.length - 1,
          'extractLoopParamBindings: object rest token in non-final position (parser should reject)',
        )
        internalInvariant(
          ts.isIdentifier(el.name),
          'extractLoopParamBindings: object rest target is not an identifier (parser should reject)',
        )
        bindings.push({
          name: el.name.text,
          path: prefix,
          rest: { kind: 'object', exclude: collectedKeys },
          segments,
        })
        return
      }
      let keyText: string | null = null
      if (el.propertyName) {
        const pn = el.propertyName
        if (ts.isIdentifier(pn)) keyText = pn.text
        else if (ts.isStringLiteral(pn)) keyText = pn.text
        else if (ts.isNumericLiteral(pn)) keyText = pn.text
        else { unsupported = true; return }
      } else if (ts.isIdentifier(el.name)) {
        keyText = el.name.text
      } else {
        unsupported = true
        return
      }
      const keyIsIdent = isIdent(keyText)
      collectedKeys.push({ key: keyText, isIdent: keyIsIdent })
      const path = appendDotAccess(prefix, keyText)
      const nextSegments = [...segments, { kind: 'field', key: keyText, isIdent: keyIsIdent } as const]
      if (ts.isIdentifier(el.name)) {
        bindings.push({ name: el.name.text, path, segments: nextSegments })
      } else {
        walk(el.name, path, nextSegments)
      }
    }
  }

  if (ts.isArrayBindingPattern(pattern) || ts.isObjectBindingPattern(pattern)) {
    walk(pattern, '', [])
    if (unsupported) return { unsupported: true }
    return bindings
  }
  return null
}

// =============================================================================
// Loop key helpers (BF023 / BF024)
// =============================================================================

/** Find the `key` JsxAttribute on an opening element, or undefined if absent. */
function findKeyJsxAttribute(
  opening: ts.JsxOpeningElement | ts.JsxSelfClosingElement,
): ts.JsxAttribute | undefined {
  for (const prop of opening.attributes.properties) {
    if (ts.isJsxAttribute(prop) && prop.name.getText() === 'key') {
      return prop
    }
  }
  return undefined
}

/**
 * Recover the loop's `keyFn` source expression from the first child of a
 * `.map(...)` body.
 *
 * Direct cases (`element`, `component`) read the `key` attribute / prop
 * directly. Conditional bodies (`<cond ? <a key={X}/> : <b key={X}/>>`,
 * #1098) recurse into both branches: if every branch resolves to the same
 * key expression — compared after stripping insignificant whitespace —
 * that expression is lifted to mapArray's keyFn argument. Heterogeneous
 * keys, missing branches, or a non-string key value bail to `null` and
 * mapArray falls back to index-based reconciliation as before.
 *
 * The string-equality check is intentionally conservative: a reactive
 * conditional whose branches read `it.key` only one branch would silently
 * pick the wrong reconciliation strategy if we tried to unify them, so we
 * accept identical text and reject everything else.
 */
function extractLoopKey(node: IRNode): string | null {
  if (node.type === 'element') {
    const keyAttr = node.attrs.find((a) => a.name === 'key')
    if (!keyAttr) return null
    return keyAttrValueToExpr(keyAttr.value)
  }
  if (node.type === 'component') {
    const keyProp = node.props.find((p) => p.name === 'key')
    if (!keyProp) return null
    return keyAttrValueToExpr(keyProp.value)
  }
  if (node.type === 'conditional') {
    const a = extractLoopKey(node.whenTrue)
    if (a === null) return null
    const b = extractLoopKey(node.whenFalse)
    if (b === null) return null
    return normalizeKeyExpr(a) === normalizeKeyExpr(b) ? a : null
  }
  return null
}

/**
 * Project the `key={...}` AttrValue into the raw expression string used
 * by `loopKeyFn` for `mapArray`'s key callback. Only `expression`,
 * `literal`, and `template` make sense as key sources at runtime.
 */
function keyAttrValueToExpr(v: AttrValue): string | null {
  switch (v.kind) {
    case 'expression': return v.expr
    case 'literal': return JSON.stringify(v.value)
    case 'template': return null
    default: return null
  }
}

/**
 * Collapse insignificant whitespace so equivalent expressions written
 * with different formatting (`it.key` vs `it .key`) compare equal.
 * Whitespace inside string literals, regex literals, comments, and the
 * literal-string portions of template literals is preserved.
 *
 * Drives the per-branch key comparison in `extractLoopKey` — two
 * keys count as equal when their normalized forms match, so the
 * collapse just has to be *consistent* across branches, not faithful
 * to the original spelling.
 */
function normalizeKeyExpr(expr: string): string {
  let out = ''
  for (const tok of iterateJsTokens(expr)) {
    // Whitespace and newlines in expression context are insignificant.
    // Comments, strings, regex, and template-literal bodies are emitted
    // as their own single tokens by `iterateJsTokens`, so this skip
    // does not touch the whitespace inside them.
    if (tok.kind === ts.SyntaxKind.WhitespaceTrivia
        || tok.kind === ts.SyntaxKind.NewLineTrivia) {
      continue
    }
    out += expr.slice(tok.pos, tok.end)
  }
  return out
}

type KeyProblem = 'missing' | 'nullable-type'

/**
 * True when at least one branch of `cond` (or its nested conditionals)
 * is an explicit `null` / `undefined` literal — the shape the catalog
 * "key={0}, key={false}, key={null}" item carves out as user-opted-in.
 *
 * Used by `classifyKeyProblem` to gate the conditional bypass of the
 * type-based nullable check. Without this narrowing, a ternary like
 * `key={cond ? item.id : item.fallback}` (where `fallback?: string`)
 * would also skip the check and silently drop a legitimate
 * inferred-nullability diagnostic.
 */
function conditionalHasExplicitNullishBranch(cond: ts.ConditionalExpression): boolean {
  return branchHasExplicitNullish(cond.whenTrue) || branchHasExplicitNullish(cond.whenFalse)
}

function branchHasExplicitNullish(branch: ts.Expression): boolean {
  let b: ts.Expression = branch
  while (ts.isParenthesizedExpression(b)) b = b.expression
  if (b.kind === ts.SyntaxKind.NullKeyword) return true
  if (ts.isIdentifier(b) && b.text === 'undefined') return true
  if (ts.isConditionalExpression(b)) return conditionalHasExplicitNullishBranch(b)
  return false
}

/**
 * Classify a key expression as problematic or fine.
 * Returns a KeyProblem string when the key is missing or has a
 * type-system-derived nullable type, or null when the key looks valid.
 *
 * Explicit literal `null` / `undefined` (`key={null}`, `key={undefined}`),
 * and ternary chains whose branches reach those literals, are intentionally
 * NOT flagged: the user wrote the value verbatim, mapArray's `String()`
 * coercion produces a deterministic per-item key (`"null"`, `"undefined"`,
 * `"0"`, `"false"`), and React's own behaviour for those values is a
 * runtime warning rather than a hard compile error. Surfacing them as
 * BF023 ("Missing key") was misleading both as a code (the key IS present)
 * and as a category (a single-item ternary that resolves to `null` for
 * one branch is perfectly fine reconciliation-wise). The type-based
 * `nullable-type` check is preserved for INFERRED nullability
 * (`item.id` where `id?: string`) — those are surface bugs the user
 * didn't make a deliberate choice about. (#1244 catalog "key={0},
 * key={false}, key={null}".)
 */
function classifyKeyProblem(
  keyAttr: ts.JsxAttribute | undefined,
  checker: ts.TypeChecker | null,
): KeyProblem | null {
  if (!keyAttr) return 'missing'

  // `key` without an initializer is a JSX boolean shorthand → no value.
  if (!keyAttr.initializer) return 'missing'

  // `key={}` — empty expression (syntax oddity, treat as missing).
  if (ts.isJsxExpression(keyAttr.initializer) && !keyAttr.initializer.expression) {
    return 'missing'
  }

  let expr: ts.Expression | undefined
  if (ts.isStringLiteral(keyAttr.initializer)) {
    // `key="..."` — always safe
    return null
  } else if (ts.isJsxExpression(keyAttr.initializer)) {
    expr = keyAttr.initializer.expression
  }

  if (!expr) return null

  // Explicit `key={null}` / `key={undefined}` — user-written value;
  // accepted as a runtime-coerced string key.
  if (expr.kind === ts.SyntaxKind.NullKeyword) return null
  if (ts.isIdentifier(expr) && expr.text === 'undefined') return null

  // Conditional expressions that include an explicit `null` / `undefined`
  // literal in any branch (possibly nested) are the user opting into a
  // per-item differentiated key with a falsy branch
  // (`key={i === 0 ? 0 : i === 1 ? false : null}`). The type-based
  // check below would see the branch union (`T | null`) and
  // false-positive — bypass for the deliberate-opt-in case only. A
  // ternary with NO explicit literal branch (`key={cond ? item.id :
  // item.fallback}` where `fallback?: string`) still runs the type
  // check, so inferred nullability is still surfaced.
  if (ts.isConditionalExpression(expr) && conditionalHasExplicitNullishBranch(expr)) return null

  // Type-based nullable check for INFERRED nullability (e.g. `item.id`
  // where `id?: string`). The user didn't explicitly opt into a null
  // key here; the type system caught a missing field at the source.
  if (checker) {
    const type = checker.getTypeAtLocation(expr)
    const isNullable = type.isUnion()
      ? type.types.some(
          (t) =>
            (t.flags & (ts.TypeFlags.Null | ts.TypeFlags.Undefined | ts.TypeFlags.Void)) !== 0,
        )
      : (type.flags & (ts.TypeFlags.Null | ts.TypeFlags.Undefined | ts.TypeFlags.Void)) !== 0
    if (isNullable) return 'nullable-type'
  }

  return null
}

/** Build the suggestion message for a BF023/BF024 key error. */
function keyErrorSuggestion(problem: KeyProblem): string {
  if (problem === 'nullable-type') {
    return "The key prop's type may be null or undefined. Narrow it with a non-null assertion (e.g. `item.id!`) or change the source type to be required."
  }
  return 'Add a key prop, e.g. `<li key={item.id}>...</li>`. Use the second arrow parameter `(item, i) => ... key={i}` as a fallback for static lists.'
}

/**
 * Emit BF023 / BF024 if the root JSX element of a .map() callback is missing
 * a valid key attribute. Handles direct and ternary callback bodies.
 */
function checkLoopKey(
  callback: ts.ArrowFunction,
  ctx: TransformContext,
  isNested: boolean,
): void {
  const errorCode = isNested ? ErrorCodes.MISSING_KEY_IN_NESTED_LIST : ErrorCodes.MISSING_KEY_IN_LIST
  const checker = ctx.analyzer.checker

  // Walk a single JSX body shape and emit if needed. Returns true if inspectable.
  function checkOpening(
    opening: ts.JsxOpeningElement | ts.JsxSelfClosingElement | null,
  ): void {
    if (!opening) return
    const keyAttr = findKeyJsxAttribute(opening)
    const problem = classifyKeyProblem(keyAttr, checker)
    if (!problem) return
    const locNode = keyAttr ?? opening
    ctx.analyzer.errors.push(
      createError(
        errorCode,
        getSourceLocation(locNode, ctx.sourceFile, ctx.filePath),
        { suggestion: { message: keyErrorSuggestion(problem) } },
      ),
    )
  }

  let body: ts.Node = callback.body
  if (ts.isBlock(body)) {
    const ret = body.statements.find(
      (s): s is ts.ReturnStatement => ts.isReturnStatement(s) && s.expression != null,
    )
    if (!ret?.expression) return
    body = ret.expression
  }
  while (ts.isParenthesizedExpression(body)) body = body.expression

  // Check a JSX operand (unwrapping parentheses) if it is an element.
  function checkJsxOperand(node: ts.Node): void {
    let n = node
    while (ts.isParenthesizedExpression(n)) n = n.expression
    if (ts.isJsxElement(n)) checkOpening(n.openingElement)
    else if (ts.isJsxSelfClosingElement(n)) checkOpening(n)
  }

  if (ts.isConditionalExpression(body)) {
    // Check both branches independently
    checkJsxOperand(body.whenTrue)
    checkJsxOperand(body.whenFalse)
    return
  }

  // Logical `cond && <jsx>` / `cond || <jsx>` / `a ?? <jsx>` whole-item
  // conditionals (#1665). The JSX operand renders 0-or-1 element per
  // iteration and still needs a key for correct reconciliation, exactly
  // like a ternary branch. Without this case the binary-expression body
  // silently skipped key validation.
  if (
    ts.isBinaryExpression(body) &&
    (body.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken ||
      body.operatorToken.kind === ts.SyntaxKind.BarBarToken ||
      body.operatorToken.kind === ts.SyntaxKind.QuestionQuestionToken)
  ) {
    checkJsxOperand(body.left)
    checkJsxOperand(body.right)
    return
  }

  if (ts.isJsxElement(body)) { checkOpening(body.openingElement); return }
  if (ts.isJsxSelfClosingElement(body)) { checkOpening(body); return }
}

/**
 * True when a loop body's top-level shape resolves to two or more sibling
 * elements — either directly or through a top-level Fragment that flattens
 * to multiple roots. mapArray's per-key DOM tracking assumes one root per
 * item; multi-root bodies (e.g. `<><path/><path/></>`) need per-item
 * boundary markers and multi-root template cloning (#1212).
 */
function loopBodyIsMultiRoot(children: IRNode[]): boolean {
  const real = children.filter(
    (c) => !(c.type === 'text' && typeof c.value === 'string' && !c.value.trim())
  )
  if (real.length === 0) return false
  if (real.length > 1) return true
  const only = real[0]
  if (only.type !== 'fragment') return false
  return loopBodyIsMultiRoot(only.children)
}

/**
 * True when a conditional branch does NOT render exactly one root element —
 * the element-less side of a whole-item conditional. Covers the empty branch
 * of `cond && <li/>` (`null`) and `cond ? <li/> : null`, and the scalar side
 * of `expr || <li/>` / `expr ?? <li/>` (the left operand renders as text or
 * nothing, never a tracked element). Any such branch makes the loop item
 * render 0-or-1 element across states, which the element-tracking `mapArray`
 * cannot represent — the loop must use anchored emission instead.
 *
 * Element / component branches return `false`; a fragment is element-like
 * only when it flattens to exactly one element child.
 */
function branchHasNoElement(node: IRNode): boolean {
  if (node.type === 'element' || node.type === 'component') return false
  if (node.type === 'conditional') {
    return branchHasNoElement(node.whenTrue) || branchHasNoElement(node.whenFalse)
  }
  if (node.type === 'fragment') {
    const real = node.children.filter(
      (c) => !(c.type === 'text' && typeof c.value === 'string' && !c.value.trim())
    )
    return real.length !== 1 || branchHasNoElement(real[0])
  }
  // expression, text, and everything else: not a single tracked element.
  return true
}

/**
 * When the loop body is a single whole-item conditional with an element-less
 * branch (the #1665 shapes: `&&`, `|| <jsx>`, `?? <jsx>`, `? <jsx> : null`),
 * return that conditional so the caller can route the loop through anchored
 * emission. Returns `null` for single-element bodies and for both-branch-
 * element ternaries (which always render exactly one element and stay on the
 * legacy `mapArray` path).
 */
function loopBodyItemConditional(children: IRNode[]): IRConditional | null {
  const real = children.filter(
    (c) => !(c.type === 'text' && typeof c.value === 'string' && !c.value.trim())
  )
  if (real.length !== 1) return null
  const only = real[0]
  if (only.type !== 'conditional') return null
  if (branchHasNoElement(only.whenTrue) || branchHasNoElement(only.whenFalse)) {
    return only
  }
  return null
}

/**
 * Hoist a key expression out of a whole-item conditional for `mapArray`'s
 * keyFn. Ignores element-less branches (they carry no element and thus no
 * key) and requires the rendering branch(es) to agree on the key expression.
 * Returns `null` when no key can be determined.
 */
function extractItemConditionalKey(cond: IRConditional): string | null {
  const a = branchHasNoElement(cond.whenTrue) ? null : extractLoopKey(cond.whenTrue)
  const b = branchHasNoElement(cond.whenFalse) ? null : extractLoopKey(cond.whenFalse)
  if (a !== null && b !== null) {
    return normalizeKeyExpr(a) === normalizeKeyExpr(b) ? a : null
  }
  return a ?? b
}

function transformMapCall(
  node: ts.CallExpression,
  ctx: TransformContext,
  isClientOnly = false,
  method: 'map' | 'flatMap' = 'map'
): IRLoop | null {
  // Capture nesting depth before we register this map's own params.
  // ctx.loopParams is populated by the *outer* map; if non-empty we are inside one.
  const isNested = ctx.loopParams.size > 0
  // This loop's own depth (0 = outermost) is however many enclosing
  // loops are already active, captured before `ctx.loopDepth` below is
  // bumped for THIS loop's own descendants.
  const depth = ctx.loopDepth

  const propAccess = node.expression as ts.PropertyAccessExpression
  const mapSource = propAccess.expression

  // Detect chaining patterns on .map()'s source expression:
  // 1. sort().map() or toSorted().map()
  // 2. filter().map()
  // 3. filter().sort().map()  (outermost = sort, inner = filter)
  // 4. sort().filter().map()  (outermost = filter, inner = sort)
  // 5. entries().map() / keys().map() / values().map()

  let array: string = ''
  let templateArray: string | undefined
  // Track the AST node that corresponds to `array` so the isStaticArray
  // decision below can run `exprHasFunctionCalls` on it. Updated every
  // time `array` is assigned; initial value is the full mapSource, which
  // matches the fallback path at the bottom of this if/else chain.
  let arrayExpr: ts.Expression = mapSource
  let filterPredicate: FilterPredicateResult | undefined
  let sortComparator: IRLoopSort | undefined
  let chainOrder: 'filter-sort' | 'sort-filter' | undefined
  let mapPreamble: string | undefined
  let templateMapPreamble: string | undefined
  let typedMapPreamble: string | undefined
  let iterationShape: 'entries' | 'keys' | undefined
  let objectIteration: 'entries' | 'keys' | 'values' | undefined

  // Helper to set both array and templateArray
  const setArray = (node: ts.Expression) => {
    array = ctx.getJS(node)
    templateArray = rewriteBarePropRefs(array, node, ctx)
    arrayExpr = node
  }

  // Detect `.entries()`, `.keys()`, `.values()` as the outermost wrapper
  // on the map source. Strip the iterator method and record the shape so
  // adapters emit the right loop variable bindings. `.values()` is a
  // no-op (same as plain `.map()`) so it's stripped but not recorded.
  // The inner expression (after stripping) feeds into the standard
  // filter/sort chain detection below. Widened to `ts.Expression` (not
  // narrowed to `mapSource`'s own `LeftHandSideExpression` type) since
  // `isObjectIteratorCall`'s stripped argument can be any expression
  // (`x ?? {}`, not just a `LeftHandSideExpression`).
  let chainSource: ts.Expression = mapSource
  const iteratorInfo = isIteratorShapeCall(mapSource)
  if (iteratorInfo) {
    chainSource = iteratorInfo.array
    if (iteratorInfo.shape === 'entries') {
      iterationShape = 'entries'
    } else if (iteratorInfo.shape === 'keys') {
      iterationShape = 'keys'
    }
    // 'values' is a no-op — same as plain .map()
  } else {
    // Detect the STATIC `Object.entries(x)` / `.keys(x)` / `.values(x)`
    // form (#2168 object-entries-map) — see `isObjectIteratorCall`'s and
    // `IRLoop.objectIteration`'s docstrings for why this is a SEPARATE
    // shape from the array-instance-method case above, not a shared one.
    // Unlike that case, `'values'` DOES need recording here (it isn't a
    // no-op: `x` itself isn't iterable as a plain object).
    const objectIteratorInfo = isObjectIteratorCall(mapSource)
    if (objectIteratorInfo) {
      chainSource = objectIteratorInfo.object
      objectIteration = objectIteratorInfo.shape
    }
  }

  const filterInfo = isFilterCall(chainSource)
  const sortInfo = isSortCall(chainSource)

  if (sortInfo) {
    // Outermost is sort: could be sort().map() or filter().sort().map()
    const innerFilter = isFilterCall(sortInfo.array)

    // Handle sort comparator extraction
    const sortExtraction = extractSortComparator(sortInfo.callback, sortInfo.method, ctx)
    if (isClientOnly || !sortExtraction.result) {
      // Off-subset comparator: keep it in the array string for client / SSR
      // evaluation. Only raise the diagnostic when the target adapter's runtime
      // can't run the comparator body verbatim (DSL); a JS-runtime adapter runs
      // it, so rejecting it would be a universal error for a DSL-only limit.
      // See spec/callback-fidelity.md.
      if (!isClientOnly && sortExtraction.unsupportedReason && !(ctx.analyzer.acceptsCallbackBody?.('sort') ?? false)) {
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
          // Off-subset predicate: keep it in the array string for client / SSR
      // evaluation. Only raise the diagnostic when the target adapter's runtime
      // can't run the predicate body verbatim (DSL); a JS-runtime adapter runs
      // it. See spec/callback-fidelity.md.
      if (!isClientOnly && filterExtraction.unsupportedReason && !(ctx.analyzer.acceptsCallbackBody?.('filter') ?? false)) {
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
      // Off-subset predicate: keep it in the array string for client / SSR
      // evaluation. Only raise the diagnostic when the target adapter's runtime
      // can't run the predicate body verbatim (DSL); a JS-runtime adapter runs
      // it. See spec/callback-fidelity.md.
      if (!isClientOnly && filterExtraction.unsupportedReason && !(ctx.analyzer.acceptsCallbackBody?.('filter') ?? false)) {
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
          // Off-subset comparator: keep it in the array string for client / SSR
      // evaluation. Only raise the diagnostic when the target adapter's runtime
      // can't run the comparator body verbatim (DSL); a JS-runtime adapter runs
      // it, so rejecting it would be a universal error for a DSL-only limit.
      // See spec/callback-fidelity.md.
      if (!isClientOnly && sortExtraction.unsupportedReason && !(ctx.analyzer.acceptsCallbackBody?.('sort') ?? false)) {
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
        // Simple filter().map(). `setArray` (not a bare `array =`
        // assignment) so `templateArray` carries the `_p.`-rewritten form —
        // the module-scope `template:` lambda can't see init's destructured
        // prop locals, and a bare destructured name there threw
        // `ReferenceError` at runtime (#2222).
        setArray(filterInfo.array)
      }
    }
  } else {
    // Plain `.map()` fallback — same `setArray` requirement as above
    // (#2222): this is the most common loop shape and was the primary
    // repro for the bare-destructured-name ReferenceError.
    setArray(chainSource)
  }

  // Get callback function
  const callback = node.arguments[0]
  let param = 'item'
  let paramType: string | undefined
  let index: string | null = null
  let indexType: string | undefined
  let children: IRNode[] = []
  let paramBindings: LoopParamBinding[] | undefined
  let flatMapCallback: FlatMapCallback | undefined

  if (ts.isArrowFunction(callback)) {
    // Extract parameter names and type annotations
    if (callback.parameters.length > 0) {
      const firstParam = callback.parameters[0]
      param = firstParam.name.getText(ctx.sourceFile)
      if (firstParam.type) {
        paramType = firstParam.type.getText(ctx.sourceFile)
      }
      // Destructured param (`([, cfg]) => ...`, `({ x, y }) => ...`): walk
      // the binding pattern into per-binding accessor paths so the client
      // JS emitter can rewrite references to `__bfItem().path` (#951).
      // Rest elements (`{ a, ...rest }`, `[first, ...tail]`) lower into a
      // residual-object / `.slice(n)` accessor at each reference. Only
      // computed property keys remain unsupported — those raise `BF025`
      // and the emitter falls back to the #950 body-entry unwrap.
      // `.entries()` synthesises `[index, value]` — when the callback
      // destructures exactly two array elements, extract the names into
      // `index` and `param` so the loop renders with proper bindings and
      // the BF104 destructure-param refusal doesn't fire. `Object.entries(x)`
      // (`objectIteration === 'entries'`) synthesises the SAME `[key,
      // value]` 2-tuple shape — `index` just holds a string key instead
      // of a numeric position — so it reuses this exact extraction.
      const isEntriesShape = iterationShape === 'entries' || objectIteration === 'entries'
      if (isEntriesShape && ts.isArrayBindingPattern(firstParam.name)) {
        const elements = firstParam.name.elements.filter(
          el => !ts.isOmittedExpression(el),
        )
        if (elements.length === 2 &&
            ts.isBindingElement(elements[0]) && ts.isIdentifier(elements[0].name) &&
            ts.isBindingElement(elements[1]) && ts.isIdentifier(elements[1].name)) {
          index = elements[0].name.text
          param = elements[1].name.text
          // Don't populate paramBindings — the destructure is fully
          // resolved into index + param by the iteration shape.
        } else {
          // Non-2-element destructure with .entries() — fall through to
          // standard destructure handling (will trigger BF104 on
          // template adapters).
          const bindingResult = extractLoopParamBindings(firstParam.name)
          if (bindingResult && !Array.isArray(bindingResult)) {
            ctx.analyzer.errors.push(
              createError(ErrorCodes.UNSUPPORTED_DESTRUCTURE_REST,
                getSourceLocation(firstParam, ctx.sourceFile, ctx.filePath),
              )
            )
          } else if (Array.isArray(bindingResult)) {
            paramBindings = bindingResult
          }
        }
      } else {
        const bindingResult = extractLoopParamBindings(firstParam.name)
        if (bindingResult && !Array.isArray(bindingResult)) {
          ctx.analyzer.errors.push(
            createError(ErrorCodes.UNSUPPORTED_DESTRUCTURE_REST,
              getSourceLocation(firstParam, ctx.sourceFile, ctx.filePath),
            )
          )
        } else if (Array.isArray(bindingResult)) {
          paramBindings = bindingResult
        }
      }
    }
    if (callback.parameters.length > 1 && iterationShape !== 'entries' && objectIteration !== 'entries') {
      const secondParam = callback.parameters[1]
      index = secondParam.name.getText(ctx.sourceFile)
      if (secondParam.type) {
        indexType = secondParam.type.getText(ctx.sourceFile)
      }
    }

    // Register loop params so expressions referencing them get slotId.
    // For destructured patterns, register the individual binding names —
    // `\b${param}\b` never matches a bare name like `cfg` when `param` is
    // `[, cfg]`, which would otherwise leave reactive-expression detection
    // silently broken for destructured callbacks.
    if (paramBindings) {
      for (const b of paramBindings) ctx.loopParams.add(b.name)
    } else {
      ctx.loopParams.add(param)
    }
    if (index) ctx.loopParams.add(index)
    ctx.loopDepth++

    // Logical control flow (`cond && <X/>`, `a ?? themeLogo()`) as the map
    // body. This is not a JSX literal, ternary, or block, so without this
    // the dispatch below leaves `children` empty and the whole `.map(...)`
    // falls through to the reactive-text path — emitting the callback
    // verbatim. That left inline JSX uncompiled and module-level JSX
    // helpers undeclared (ReferenceError at hydration, #1665). Route the
    // logical body through the shared JSX expression transformer, which
    // lowers it into an IRConditional and inlines any JSX helper, exactly
    // like the ternary form.
    //
    // Scoped deliberately to logical operators that actually render JSX
    // (inline literal or a tracked helper call): a bare call body
    // (`map(t => renderItem(t))`) stays on the existing reactive-text path
    // that #546 owns, and a scalar logical body (`t.active && t.label`)
    // keeps rendering its value.
    const tryTransformRenderableBody = (expr: ts.Expression): void => {
      if (!ts.isBinaryExpression(expr)) return
      const op = expr.operatorToken.kind
      if (
        op !== ts.SyntaxKind.AmpersandAmpersandToken &&
        op !== ts.SyntaxKind.BarBarToken &&
        op !== ts.SyntaxKind.QuestionQuestionToken
      ) {
        return
      }
      if (!containsJsxInExpression(expr) && !callsJsxHelper(expr, ctx)) return
      const transformed = transformJsxExpression(expr, ctx, isClientOnly)
      if (transformed) children = [transformed]
    }

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
      } else if (method === 'flatMap' && ts.isArrayLiteralExpression(inner)) {
        // flatMap arrow with array literal: items.flatMap(item => ([<A/>, <B/>]))
        children = transformArrayLiteralChildren(inner, ctx)
      } else {
        tryTransformRenderableBody(inner)
      }
    } else if (method === 'flatMap' && ts.isArrayLiteralExpression(body)) {
      // flatMap arrow with array literal: items.flatMap(item => [<A/>, <B/>])
      children = transformArrayLiteralChildren(body, ctx)
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

      // flatMap block body fallback: compile JSX inline when children
      // couldn't be extracted via the standard single-return path.
      if (method === 'flatMap' && children.length === 0) {
        flatMapCallback = buildFlatMapCallback(callback, body, ctx)
      }
    } else {
      tryTransformRenderableBody(body)
    }

    // Unregister loop params
    if (paramBindings) {
      for (const b of paramBindings) ctx.loopParams.delete(b.name)
    } else {
      ctx.loopParams.delete(param)
    }
    if (index) ctx.loopParams.delete(index)
    ctx.loopDepth--
  }

  // If no JSX children were found (e.g., callback returns a function call),
  // fall back to treating the entire expression as an IRExpression — unless
  // flatMap already built a compiled callback (flatMapCallback).
  if (children.length === 0 && !flatMapCallback) {
    return null
  }

  // Emit BF023 / BF024 if the loop root element lacks a valid key attribute.
  // Call whenever children were produced (the callback returned JSX).
  if (ts.isArrowFunction(node.arguments[0]) && children.length > 0) {
    checkLoopKey(node.arguments[0], ctx, isNested)
  }

  // Look for the loop's keyFn source on the first child. `extractLoopKey`
  // handles direct elements, child components, and — crucially — ternary
  // bodies (#1098): when every branch of an `IRConditional` declares the
  // same `key={EXPR}`, that EXPR is lifted out to mapArray's keyFn so a
  // shape change (e.g. `<polygon>` ↔ `<circle>`) replaces the DOM node
  // instead of mutating attributes on the wrong tag.
  // Whole-item conditional bodies (#1665): the loop item is a single
  // conditional whose at-least-one branch renders nothing, so an item shows
  // 0-or-1 element. The key lives inside the rendering branch, so hoist it
  // from there; a flag routes the loop through anchored emission downstream.
  const itemConditional = children.length > 0 ? loopBodyItemConditional(children) : null
  const bodyIsItemConditional = itemConditional !== null
  const key = bodyIsItemConditional
    ? extractItemConditionalKey(itemConditional!)
    : (children.length > 0 ? extractLoopKey(children[0]) : null)

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
          isEventHandler: p.name.startsWith('on') && p.name.length > 2,
        })),
      children: comp.children,
    }
  }

  const bodyIsMultiRoot = loopBodyIsMultiRoot(children)

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
  //
  // Destructured map params (`([, cfg]) => ...`, `({ a, b }) => ...`,
  // typed forms) used to be excluded from the widening to avoid a
  // latent crash in the `mapArray` renderItem emitter — see #949 and
  // the emitter-side `destructureLoopParam` helper, which now unwraps
  // the signal accessor at renderItem body entry. No more skip.
  const callsReactive = exprCallsReactiveGetters(arrayExpr, ctx)
  const hasCalls = exprHasFunctionCalls(arrayExpr)
  const isDirectPropArray = method !== 'flatMap' && isArrayExprDirectPropRef(arrayExpr, ctx)
  const isStaticArray =
    !isSignalOrMemoArray(array, ctx)
    && !isDirectPropArray
    && !hasCalls
    // `objectIteration` (#2168 object-entries-map): `array` here is the
    // STRIPPED object expression (`Object.entries(x)`'s `x`), which can
    // itself be a static module-scope const object literal and would
    // otherwise satisfy every check above — but a plain OBJECT has no
    // `.forEach()`/`.map()` (the static-array client codegen's own
    // methods), unlike an actual array literal. Force the dynamic
    // `mapArray()` path instead, which this shape's client-JS array-expr
    // reconstruction (`applyObjectIterationWrap`, `ir-to-client-js/utils.ts`)
    // already handles correctly.
    && !objectIteration

  // Collect nested components for both static and dynamic arrays.
  // Static arrays: needed for initChild hydration.
  // Dynamic arrays with native root + component descendants: enables reconcileElements
  // with composite rendering (placeholder + createComponent replacement).
  const nestedComponents = collectNestedComponents(children).filter(c => c.name !== childComponent?.name)

  return {
    type: 'loop',
    method: method === 'flatMap' ? 'flatMap' : undefined,
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
    // Generate a unique marker id per loop call site so sibling `.map()`s
    // under the same parent each get their own `<!--bf-loop:<id>-->` /
    // `<!--bf-/loop:<id>-->` pair (#1087). Uses a dedicated counter (`l0`,
    // `l1`, ...) so element bf="sN" numbering stays stable across versions
    // and ssr-hydration-contract assertions don't shift when loops are added.
    markerId: `l${ctx.loopMarkerCounter++}`,
    isStaticArray,
    isPropDerivedArray: isDirectPropArray || undefined,
    callsReactiveGetters: callsReactive || undefined,
    hasFunctionCalls: hasCalls || undefined,
    bodyIsMultiRoot: bodyIsMultiRoot || undefined,
    bodyIsItemConditional: bodyIsItemConditional || undefined,
    childComponent,
    nestedComponents,
    filterPredicate,
    sortComparator,
    chainOrder,
    iterationShape,
    objectIteration,
    depth,
    clientOnly: isClientOnly || undefined,
    mapPreamble,
    templateMapPreamble,
    paramType,
    indexType,
    typedMapPreamble,
    paramBindings,
    arrayFreeIdentifiers: extractFreeIdentifiersFromNode(arrayExpr),
    flatMapCallback,
    loc: getSourceLocation(node, ctx.sourceFile, ctx.filePath),
  }
}

/**
 * Transform elements of an ArrayLiteralExpression into IR children.
 * Used for flatMap arrow bodies like: `items.flatMap(item => [<A/>, <B/>])`
 */
function transformArrayLiteralChildren(
  arrayLiteral: ts.ArrayLiteralExpression,
  ctx: TransformContext
): IRNode[] {
  const children: IRNode[] = []
  for (const element of arrayLiteral.elements) {
    if (ts.isSpreadElement(element)) continue
    let inner: ts.Expression = element
    while (ts.isParenthesizedExpression(inner)) inner = inner.expression
    if (ts.isJsxElement(inner) || ts.isJsxSelfClosingElement(inner) || ts.isJsxFragment(inner)) {
      const transformed = transformNode(inner, ctx)
      if (transformed) children.push(transformed)
    }
  }
  return children
}

function containsJsx(node: ts.Node): boolean {
  if (
    ts.isJsxElement(node) ||
    ts.isJsxSelfClosingElement(node) ||
    ts.isJsxFragment(node)
  ) return true
  let found = false
  node.forEachChild(child => {
    if (!found) found = containsJsx(child)
  })
  return found
}

/**
 * Build a FlatMapCallback for complex flatMap block bodies (conditional
 * returns, variable-assigned JSX, etc.). Walks the callback body AST,
 * transforms each JSX node to IR, replaces it with a `__BF_JSX_N__`
 * placeholder, and returns the compiled callback descriptor.
 */
function buildFlatMapCallback(
  callback: ts.ArrowFunction | ts.FunctionExpression,
  body: ts.Block,
  ctx: TransformContext,
): FlatMapCallback | undefined {
  if (!containsJsx(body)) return undefined

  const fragments: FlatMapJsxFragment[] = []
  const sourceText = ctx.sourceFile.text
  const bodyStart = body.getStart(ctx.sourceFile)
  const bodyEnd = body.getEnd()
  const bodyText = sourceText.slice(bodyStart, bodyEnd)

  // Collect all JSX nodes and their positions, sorted by start position
  const jsxNodes: Array<{ node: ts.Node; start: number; end: number }> = []
  function collectJsx(n: ts.Node): void {
    if (ts.isJsxElement(n) || ts.isJsxSelfClosingElement(n) || ts.isJsxFragment(n)) {
      jsxNodes.push({
        node: n,
        start: n.getStart(ctx.sourceFile) - bodyStart,
        end: n.getEnd() - bodyStart,
      })
      return
    }
    n.forEachChild(collectJsx)
  }
  collectJsx(body)

  if (jsxNodes.length === 0) return undefined

  // Build the body text with JSX replaced by placeholders
  let compiledBody = ''
  let lastEnd = 0
  for (let i = 0; i < jsxNodes.length; i++) {
    const { node, start, end } = jsxNodes[i]
    const placeholder = `__BF_JSX_${i}__`
    compiledBody += bodyText.slice(lastEnd, start) + placeholder
    lastEnd = end

    const ir = transformNode(node as any, ctx)
    fragments.push({
      placeholder,
      ir: ir ?? { type: 'text', value: '', loc: getSourceLocation(node, ctx.sourceFile, ctx.filePath) },
    })
  }
  compiledBody += bodyText.slice(lastEnd)

  // Build the template body (with prop refs rewritten)
  const paramsText = callback.parameters.map(p => p.getText(ctx.sourceFile)).join(', ')

  return {
    params: `(${paramsText})`,
    body: compiledBody,
    templateBody: compiledBody,
    rawBody: bodyText,
    fragments,
  }
}

/**
 * Recursively collect all components nested within loop children.
 * Tracks loop nesting depth so composite element reconciliation knows
 * which components are inside inner loops (loopDepth > 0).
 */
function collectNestedComponents(nodes: IRNode[]): IRLoopChildComponent[] {
  const result: IRLoopChildComponent[] = []

  function traverse(node: IRNode, loopDepth: number, innerLoopArray: string | undefined, insideConditional: boolean): void {
    if (node.type === 'component') {
      result.push({
        name: node.name,
        slotId: node.slotId,
        props: node.props
          .filter(p => p.name !== 'key')
          .map(p => ({
            name: p.name,
            value: p.value,
            isEventHandler: p.name.startsWith('on') && p.name.length > 2,
          })),
        children: node.children,
        loopDepth,
        innerLoopArray,
        insideConditional: insideConditional || undefined,
      })
      // Also traverse component children to find deeply nested components
      if (node.children) {
        node.children.forEach(c => traverse(c, loopDepth, innerLoopArray, insideConditional))
      }
    }
    if (node.type === 'element' && node.children) {
      node.children.forEach(c => traverse(c, loopDepth, innerLoopArray, insideConditional))
    }
    if (node.type === 'fragment' && node.children) {
      node.children.forEach(c => traverse(c, loopDepth, innerLoopArray, insideConditional))
    }
    if (node.type === 'loop' && node.children) {
      // Entering an inner loop — increment depth, record array expression.
      // Reset `insideConditional`: the loop body starts a fresh scope and its
      // own body-level conditionals are tracked by the inner loop's own
      // collection path.
      node.children.forEach(c => traverse(c, loopDepth + 1, node.array, false))
    }
    if (node.type === 'conditional') {
      traverse(node.whenTrue, loopDepth, innerLoopArray, true)
      traverse(node.whenFalse, loopDepth, innerLoopArray, true)
    }
    if (node.type === 'if-statement') {
      traverse(node.consequent, loopDepth, innerLoopArray, true)
      if (node.alternate) {
        traverse(node.alternate, loopDepth, innerLoopArray, true)
      }
    }
  }

  nodes.forEach(n => traverse(n, 0, undefined, false))
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

// Spread expansion: shared between HTML attrs and component props.
//
// When the spread target is the destructured rest-prop and the analyzer
// closed its key set (e.g. `function X({ a, ...rest }: { a: A; b: B; c: C })`),
// we unroll into one entry per known key. Adapters can then emit each as a
// separate slot — this is what lets static keys stay static and dynamic
// keys keep their per-key reactivity. The catch-all `...` entry forces the
// runtime to spread at hydration time, which loses that per-key resolution
// and is reserved for cases where the key set isn't statically known.
//
// The `spreadExpr === restName` check is what restricts unrolling to the
// rest-prop itself: arbitrary `{...someObject}` spreads can't be unrolled
// because we don't have a static key list for them.
//
// The shape returned satisfies both IRAttribute and IRProp.
function expandSpreadAttribute(
  attr: ts.JsxSpreadAttribute,
  ctx: TransformContext,
): Array<{
  name: string
  value: AttrValue
  loc: SourceLocation
  freeIdentifiers?: ReadonlySet<string>
}> {
  const spreadExpr = ctx.getJS(attr.expression)
  const expandedKeys = ctx.analyzer.restPropsExpandedKeys
  const restName = ctx.analyzer.restPropsName
  const loc = getSourceLocation(attr, ctx.sourceFile, ctx.filePath)
  const spreadFreeIdentifiers = extractFreeIdentifiersFromNode(attr.expression)

  if (expandedKeys.length > 0 && restName && spreadExpr === restName) {
    // Expanded per-key attrs reference `${restName}.${key}` — `restName` is
    // the only free identifier (the `.${key}` tail is a member-access name,
    // not an identifier reference).
    const perKeyFreeIds: ReadonlySet<string> = new Set([restName])
    return expandedKeys.map(key => ({
      name: key,
      value: AttrValueOf.expression(`${restName}.${key}`),
      loc,
      freeIdentifiers: perKeyFreeIds,
    }))
  }

  // Allocate a component-scoped slot ID so adapters that need a
  // structured plumbing path (Go's `.Spread_N` struct field) can
  // address this spread without recomputing identity downstream
  // (#1407). Hono / Mojo ignore the field; only the Go adapter consumes
  // it. The closed-type expansion branch above returns before this
  // point, so closed-type rest spreads stay on the per-key fast path.
  const slotId = generateSpreadSlotId(ctx)
  return [{
    name: '...',
    value: AttrValueOf.spread(spreadExpr, ctx.getTemplateJS(attr.expression), slotId),
    loc,
    freeIdentifiers: spreadFreeIdentifiers,
  }]
}

// Extract free identifiers from an attribute's initializer expression
// (#1267). Returns undefined for boolean shorthand / string-literal attrs
// that have no expression. Downstream callers can ask
// `attr.freeIdentifiers?.has(name)` instead of running word-boundary regex
// against the value string.
function attrFreeIdentifiers(attr: ts.JsxAttribute): ReadonlySet<string> | undefined {
  if (
    !attr.initializer
    || !ts.isJsxExpression(attr.initializer)
    || !attr.initializer.expression
  ) {
    return undefined
  }
  return extractFreeIdentifiersFromNode(attr.initializer.expression)
}

// AST-derived reactivity flags for the Solid-style wrap-by-default fallback
// (#940 / #942). Computed from the source JSX expression rather than the
// expanded value string because a regex over the expanded string would
// false-match call-like substrings inside string literals — most notoriously
// CSS like `style={{ color: 'hsl(221 83% 53%)' }}`. Boolean shorthand
// (`<X disabled />`) and string literals have no expression to analyze, so
// they get the empty-flags fallback below; collect-elements.ts then treats
// them as static.
function computeReactivityFlags(
  attr: ts.JsxAttribute,
  ctx: TransformContext,
): { callsReactiveGetters?: boolean; hasFunctionCalls?: boolean } {
  if (
    !attr.initializer
    || !ts.isJsxExpression(attr.initializer)
    || !attr.initializer.expression
  ) {
    return {}
  }
  const expr = attr.initializer.expression
  return {
    callsReactiveGetters: exprCallsReactiveGetters(expr, ctx) || undefined,
    hasFunctionCalls: exprHasFunctionCalls(expr) || undefined,
  }
}

/**
 * Emit BF047 if a ref / event-handler callback body references a
 * JSX-typed branch-local — the multi-return pipeline has no way to
 * keep the JSX live as a runtime value here (substituting the JSX
 * literal into the emitted callback body would produce TS JSX
 * inside a JS string, and leaving the bare identifier produces a
 * runtime ReferenceError at hydrate). See #1414 cell 5.
 */
function reportJsxBranchLocalInCallback(expr: ts.Expression, ctx: TransformContext): void {
  const jsxNames = ctx._jsxBranchLocalNames
  if (!jsxNames || jsxNames.size === 0) return
  const refs = extractFreeIdentifiersFromNode(expr)
  for (const name of refs) {
    if (jsxNames.has(name)) {
      ctx.analyzer.errors.push(
        createError(
          ErrorCodes.JSX_BRANCH_LOCAL_IN_CALLBACK,
          getSourceLocation(expr, ctx.sourceFile, ctx.filePath),
          { message: `JSX-typed branch local '${name}' referenced inside a callback body (ref / event handler). Render it as a child instead: \`<div ref={...}>{${name}}</div>\`.` },
        ),
      )
      return
    }
  }
}

function processAttributes(
  attributes: ts.JsxAttributes,
  ctx: TransformContext
): ProcessedAttributes {
  const attrs: IRAttribute[] = []
  const events: IREvent[] = []
  let ref: string | null = null

  for (const attr of attributes.properties) {
    if (ts.isJsxSpreadAttribute(attr)) {
      attrs.push(...expandSpreadAttribute(attr, ctx))
      continue
    }

    if (!ts.isJsxAttribute(attr)) continue

    const rawName = attr.name.getText(ctx.sourceFile)

    // ref is captured separately (not pushed into `attrs`) because it never
    // appears in the rendered HTML — it's a compile-time binding from the
    // JSX call site to the runtime DOM element, surfaced via the IRElement
    // `ref` field for the client-JS emitter.
    if (rawName === 'ref') {
      if (attr.initializer && ts.isJsxExpression(attr.initializer) && attr.initializer.expression) {
        reportJsxBranchLocalInCallback(attr.initializer.expression, ctx)
        ref = ctx.getJS(attr.initializer.expression)
      }
      continue
    }

    // Event handlers are pulled out of `attrs` for the same reason as ref:
    // they're wired up at hydration time (delegated event registration) and
    // must not leak into rendered HTML. The DOM event name is lowercase
    // (`click`, not `Click`), so strip the `on` prefix and downcase.
    if (/^on[A-Z]/.test(rawName)) {
      if (attr.initializer && ts.isJsxExpression(attr.initializer) && attr.initializer.expression) {
        const eventName = rawName.slice(2).toLowerCase()
        reportJsxBranchLocalInCallback(attr.initializer.expression, ctx)
        events.push({
          name: eventName,
          originalAttr: rawName,
          handler: ctx.getJS(attr.initializer.expression),
          loc: getSourceLocation(attr, ctx.sourceFile, ctx.filePath),
        })
      }
      continue
    }

    // Normalize the JSX prop spelling to the HTML/SVG attribute name ONCE,
    // here in Phase 1, so IRAttribute.name is already the name every
    // adapter emits verbatim (#2172): React-style HTML camelCase aliases
    // lower (`htmlFor` → `for`, `tabIndex` → `tabindex`, `readOnly` →
    // the BOOLEAN_ATTRS member `readonly`), SVG presentation attrs
    // kebab-case (`strokeWidth` → `stroke-width`), case-sensitive SVG XML
    // names (`viewBox`) and everything unknown (`data-*`, custom-element
    // attrs) pass through. Previously each adapter re-derived (at most)
    // `className` → `class` itself and every other alias leaked into the
    // emitted HTML as an unknown attribute the browser ignores. Intrinsic
    // elements only — component props (IRProp) keep the user's API names.
    const name = toHTMLAttrName(rawName)

    let value = getAttributeValue(attr, ctx)
    let clientOnly: boolean | undefined
    if (attr.initializer && ts.isJsxExpression(attr.initializer) && attr.initializer.expression) {
      if (value.kind === 'expression' && value.templateExpr === undefined) {
        const rewritten = rewriteBarePropRefs(value.expr, attr.initializer.expression, ctx)
        if (rewritten !== value.expr) {
          value = { ...value, templateExpr: rewritten }
        }
      }
      // `/* @client */` in attribute initializer position: defer the
      // attribute to hydrate. Detection routed through the shared
      // helper so it agrees with JSX-child / component-prop sites.
      // Downstream routing: collect-elements wires this into
      // `reactiveAttrs` for elements; html-template strips it from
      // the SSR template (and from `renderChild` for components).
      //
      // Reactive brand-package reads (`value={form.field('x').value()}`)
      // are auto-deferred the same way: the SSR lambda can't evaluate the
      // init-scope form state, so defer instead of raising BF061 (#1638).
      if (hasLeadingClientDirective(attr.initializer.expression, ctx.sourceFile)
        || shouldAutoDeferReactiveBrand(attr.initializer.expression, ctx)) {
        clientOnly = true
      }
    }

    const freeIdentifiers = attrFreeIdentifiers(attr)
    attrs.push({
      name,
      value,
      clientOnly,
      loc: getSourceLocation(attr, ctx.sourceFile, ctx.filePath),
      ...computeReactivityFlags(attr, ctx),
      ...(freeIdentifiers !== undefined && { freeIdentifiers }),
    })
  }

  return { attrs, events, ref }
}

function getAttributeValue(attr: ts.JsxAttribute, ctx: TransformContext): AttrValue {
  // Boolean attribute: <button disabled />
  if (!attr.initializer) {
    return AttrValueOf.booleanAttr()
  }

  // String literal: <div id="main" />. JSX decodes character references
  // in quoted attribute values just like in text children, so the IR
  // carries the decoded string (`title="Fish &amp; Chips"` IS the value
  // `Fish & Chips`); adapters re-escape on emit.
  if (ts.isStringLiteral(attr.initializer)) {
    return AttrValueOf.literal(decodeEntities(attr.initializer.text))
  }

  // Expression: <div class={className} />
  // JSX expressions are always dynamic - they should be rendered as {expr} not "expr"
  // The distinction between "dynamic" (JSX expression) and "reactive" (needs client updates)
  // is handled separately in client JS generation
  if (ts.isJsxExpression(attr.initializer) && attr.initializer.expression) {
    let expr = attr.initializer.expression

    // #1414: a bare-identifier attribute value that resolves to a
    // local declared inside the surrounding early-return `if`-block
    // would leak into the emitted template lambda at outer scope
    // (`style={local}` → `${styleToCss(local)}` → ReferenceError at
    // hydrate). Substitute the identifier with the initializer's AST
    // so downstream attribute processing (template-literal /
    // ternary / generic-expression paths below) sees the resolved
    // form. JSX-bearing initializers are skipped — attribute values
    // can't host JSX, so the substitution would produce invalid
    // output; the JSX-child-position fix (#1410) covers those.
    if (ts.isIdentifier(expr)) {
      const branchInit = ctx._branchScopeVars?.get(expr.text)
      if (branchInit && !initializerShapeContainsJsx(branchInit)) {
        expr = branchInit
      }
    }

    // #2092: `className={cn\`base ${tone()}\`}` — a tagged template whose
    // tag resolves to a recognized interleave function desugars to the
    // equivalent untagged template literal, so every check below (static
    // style object, template-literal parts, ternary, generic expression)
    // sees it exactly as if the user had written the untagged form.
    expr = tryDesugarInterleaveTaggedTemplate(expr, ctx)

    // BF062: AwaitExpression in attribute position
    if (ts.isAwaitExpression(expr)) {
      ctx.analyzer.errors.push(
        createError(
          ErrorCodes.STAGE_AWAIT_IN_TEMPLATE,
          getSourceLocation(expr, ctx.sourceFile, ctx.filePath),
        ),
      )
      return AttrValueOf.expression('undefined')
    }

    // Check for bare signal/memo identifier (BF044)
    checkBareSignalOrMemoIdentifier(expr, ctx)

    // Static style object: style={{ key: 'value', ... }} → CSS string at compile time
    if (attr.name.getText(ctx.sourceFile) === 'style' && ts.isObjectLiteralExpression(expr)) {
      const cssString = tryStaticStyleObjectToCss(expr)
      if (cssString !== null) {
        return AttrValueOf.literal(cssString)
      }
    }

    // Template literal: `...${expr}...`. Returned as structured IR
    // when at least one part is structurally meaningful (ternary, or
    // a const reference that resolves to a string literal / Record
    // lookup). Plain `${ident}` interpolations against unknown
    // identifiers still fall through to the bare-expression path.
    if (ts.isTemplateExpression(expr)) {
      const parts = parseTemplateLiteral(expr, ctx)
      if (parts.some(p => p.type === 'ternary' || p.type === 'lookup')) {
        return AttrValueOf.template(parts)
      }
    }

    // Bare `attr={record[key]}` (#2300): an element access whose base is a
    // local const object-literal `Record` indexed by a prop, written directly
    // as ANY string-attribute value rather than inside a template literal
    // (`class={record[key]}` is the motivating class-composition case, but this
    // is attribute-agnostic — it fires for any qualifying attribute). Lift it
    // into the SAME `lookup` part the `${record[key]}` template-literal form
    // produces (`tryResolveTemplateSpanFromConst` handles both), so every
    // adapter renders it through the shared, already-working lookup path
    // instead of a raw index-access that the typed / strict backends (Go,
    // minijinja, ERB, Jinja) mishandle for a function-local const — it is not
    // a prop field, so those emit an unpopulated `.Record`/nil lookup and the
    // value renders empty (or errors). `tryResolveTemplateSpanFromConst`
    // returns null for anything but the `IDENT[KEY]` → all-string-`Record`
    // shape, so any other element access falls through to the bare-expression
    // path unchanged.
    // Only a DYNAMIC key qualifies (a prop reference, the #2300 shape). A
    // static string / numeric literal key (`paths['icon']`) stays on the
    // bare-expression path — the adapters already resolve a constant-key index,
    // and it must remain a plain `expression` attr (jsx-to-ir regression pin),
    // not a single-case `lookup`.
    if (
      ts.isElementAccessExpression(expr) &&
      !ts.isStringLiteralLike(expr.argumentExpression) &&
      !ts.isNumericLiteral(expr.argumentExpression)
    ) {
      const parts = tryResolveTemplateSpanFromConst(expr, ctx)
      if (parts) {
        return AttrValueOf.template(parts)
      }
    }

    // `className={classes}` where `classes` is a local const bound to
    // a template literal — resolve the template literal here and let
    // adapters render the structured form. This is the cva-style
    // pattern (`const classes = `${baseClasses} ${variantClasses[v]}…``).
    if (ts.isIdentifier(expr)) {
      const resolved = tryResolveIdentifierAsTemplateLiteral(expr, ctx)
      if (resolved) {
        return AttrValueOf.template(resolved)
      }
    }

    // Simple ternary: cond ? 'a' : 'b'
    if (ts.isConditionalExpression(expr)) {
      const ternary = parseTernary(expr, ctx)
      if (ternary) {
        return AttrValueOf.template([ternary])
      }
    }

    // Detect `expr || undefined` pattern → boolean presence attribute
    if (ts.isBinaryExpression(expr) && expr.operatorToken.kind === ts.SyntaxKind.BarBarToken) {
      if (ts.isIdentifier(expr.right) && expr.right.text === 'undefined') {
        const baseExpr = ctx.getJS(expr.left)
        return AttrValueOf.expression(baseExpr, { presenceOrUndefined: true })
      }
    }

    const exprText = ctx.getJS(expr)
    return AttrValueOf.expression(exprText)
  }

  return AttrValueOf.booleanAttr()
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
    const key = cssKebabCase(prop.name.text)
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
      // Try to resolve `${IDENT}` against local consts (string literal
      // substitution) or `${IDENT[KEY]}` (Record<T, string> lookup) so
      // adapters that don't run JS at SSR have enough structure to
      // emit the right output.
      const resolved = tryResolveTemplateSpanFromConst(span.expression, ctx)
      if (resolved) {
        parts.push(...resolved)
      } else {
        // Non-ternary expression: keep as ${expr}
        const val = ctx.getJS(span.expression)
        const tVal = rewriteBarePropRefs(val, span.expression, ctx)
        parts.push({ type: 'string', value: `\${${val}}`, templateValue: tVal ? `\${${tVal}}` : undefined })
      }
    }

    // Add the literal part after this span (text after ${} until next ${} or end)
    if (span.literal.text) {
      parts.push({ type: 'string', value: span.literal.text })
    }
  }

  return parts
}

/**
 * Attempt to convert a single template-literal span expression into
 * one or more structured IR parts by resolving local-const references.
 *
 * - `${IDENT}` where IDENT resolves to a string-literal const returns
 *   a `string` part with the substituted value.
 * - `${IDENT[KEY]}` where IDENT resolves to a `Record<T, string>` literal
 *   returns a `lookup` part carrying the resolved cases plus the
 *   key expression.
 *
 * Returns null when the expression doesn't match either pattern (the
 * caller falls back to the bare `${expr}` string part).
 */
function tryResolveTemplateSpanFromConst(
  expr: ts.Expression,
  ctx: TransformContext,
): IRTemplatePart[] | null {
  // ${IDENT}
  if (ts.isIdentifier(expr)) {
    const constInfo = findLocalConst(expr.text, ctx.analyzer)
    if (!constInfo) return null
    const ast = parseConstInitializer(constInfo)
    if (!ast) return null
    if (ts.isStringLiteral(ast) || ts.isNoSubstitutionTemplateLiteral(ast)) {
      return [{ type: 'string', value: ast.text }]
    }
    return null
  }

  // ${IDENT[KEY]}
  if (ts.isElementAccessExpression(expr)) {
    if (!ts.isIdentifier(expr.expression)) return null
    const constInfo = findLocalConst(expr.expression.text, ctx.analyzer)
    if (!constInfo) return null
    const ast = parseConstInitializer(constInfo)
    if (!ast || !ts.isObjectLiteralExpression(ast)) return null
    const cases: Record<string, string> = {}
    for (const prop of ast.properties) {
      // Spreads, methods, getters, computed keys, etc. — these aren't
      // statically lowerable, and partial cases would silently drop
      // branches at SSR. Bail entirely so the caller falls back to the
      // bare-expression path (where the JS runtime can still evaluate).
      if (!ts.isPropertyAssignment(prop)) return null
      const keyName = prop.name && (ts.isStringLiteral(prop.name) || ts.isIdentifier(prop.name))
        ? prop.name.text
        : null
      if (!keyName) return null
      const value = prop.initializer
      // We only support pure string literal cases. Function calls,
      // expressions, nested objects, etc. would need richer codegen
      // than `{{if eq .Key "..."}}<value>{{end}}` — bail on the whole
      // record rather than producing a half-resolved IR.
      if (ts.isStringLiteral(value) || ts.isNoSubstitutionTemplateLiteral(value)) {
        cases[keyName] = value.text
      } else {
        return null
      }
    }
    // The key expression's AST lives in the synthetic source created
    // by `parseConstInitializer` (the const we just resolved was the
    // *outer* template literal, and this elementAccess sits inside
    // it). `ctx.getJS` would index into `ctx.sourceFile` and read
    // the wrong bytes — go through the node's own source file
    // instead. Type annotations don't appear in const initializers
    // for our supported patterns, so plain text extraction is fine.
    const key = astText(expr.argumentExpression)
    // For client-side template rewriting, rewrite bare prop refs
    // (e.g. `size` → `_p.size ?? 'sm'`) using the original AST node
    // identity. `rewriteBarePropRefs` operates on the text plus the
    // node — when the node is from a synthetic source the rewrite
    // skips identifier lookups it can't tie back to props, which is
    // safe (worst case, no rewrite happens and the original text is
    // used).
    const templateKey = rewriteBarePropRefs(key, expr.argumentExpression, ctx)
    return [{ type: 'lookup', cases, key, templateKey: templateKey ?? undefined }]
  }

  return null
}

/**
 * Resolve a const name with shadowing-aware lookup. Function-scope
 * declarations take precedence over module-level declarations of the
 * same name (matching JS scoping); among multiple function-scope
 * consts with the same name we pick the last analyzer entry, which
 * corresponds to the latest binding in source order.
 *
 * Returns undefined when no const matches.
 */
function findLocalConst(name: string, analyzer: AnalyzerContext) {
  const matches = analyzer.localConstants.filter(c => c.name === name)
  if (matches.length === 0) return undefined
  // Prefer the innermost (non-module) binding; fall back to whatever's
  // there if every match is at module scope.
  const fnScoped = matches.filter(c => !c.isModule)
  const pool = fnScoped.length > 0 ? fnScoped : matches
  return pool[pool.length - 1]
}

/**
 * Resolve a `function` declaration name with the same shadowing-aware
 * lookup as {@link findLocalConst} — a component-scope declaration wins
 * over a module-scope one of the same name, and among several
 * component-scope declarations the last in source order wins.
 *
 * Returns undefined when no local function matches.
 */
function findLocalFunction(name: string, analyzer: AnalyzerContext) {
  const matches = analyzer.localFunctions.filter(f => f.name === name)
  if (matches.length === 0) return undefined
  const fnScoped = matches.filter(f => !f.isModule)
  const pool = fnScoped.length > 0 ? fnScoped : matches
  return pool[pool.length - 1]
}

/**
 * Detect a PascalCase JSX tag that is really a *dynamic tag* local
 * (`const Tag = children.tag`) rather than a component reference.
 *
 * Such a "component" has no registrable template — the tag is chosen at
 * runtime. The Go template adapter consumes the resulting `dynamicTag`
 * flag to lower the node to a children passthrough so its dead branch
 * registers cleanly (Hono/CSR/Mojo ignore the flag).
 *
 * A name qualifies only when (a) a `const <name> = <expr>.tag` binding
 * exists somewhere in the source — at any nesting depth, since the
 * canonical pattern lives inside an `if (isValidElement(children)) {…}`
 * block and never reaches the analyzer's `localConstants` (which only
 * collects component-body-level bindings) — AND (b) the name is NOT a
 * JSX-producing local (those are tracked in the analyzer's jsx* /
 * inlineable sets). The `.tag` initializer check already excludes real
 * imported components (their binding is an import, not a `.tag` const)
 * and local component factories like `const Foo = () => <div/>` (an
 * arrow initializer, not a `.tag` access); the jsx* guards are a
 * belt-and-suspenders second line. Each set is guarded defensively in
 * case it is absent on a given analyzer context.
 */
function isDynamicTagLocal(name: string, ctx: TransformContext): boolean {
  if (!hasDynamicTagBinding(name, ctx.sourceFile)) return false
  const a = ctx.analyzer
  if (a.jsxConstants?.has(name)) return false
  if (a.jsxFunctions?.has(name)) return false
  if (a.jsxMultiReturnFunctions?.has(name)) return false
  if (a.inlineableJsxConsts?.has(name)) return false
  return true
}

/**
 * True when the source contains a `const <name> = <expr>.tag` (the
 * dynamic-tag pattern), at any nesting depth. The initializer may be
 * wrapped in an `as`/`satisfies`/parenthesized cast (`children.tag as any`).
 */
function hasDynamicTagBinding(name: string, sourceFile: ts.SourceFile): boolean {
  let found = false
  const visit = (node: ts.Node): void => {
    if (found) return
    if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.name.text === name &&
      node.initializer
    ) {
      let init: ts.Expression = node.initializer
      while (
        ts.isAsExpression(init) ||
        ts.isSatisfiesExpression(init) ||
        ts.isParenthesizedExpression(init) ||
        ts.isNonNullExpression(init)
      ) {
        init = init.expression
      }
      if (ts.isPropertyAccessExpression(init) && init.name.text === 'tag') {
        found = true
        return
      }
    }
    ts.forEachChild(node, visit)
  }
  visit(sourceFile)
  return found
}

/**
 * Resolve a `className={ident}` reference where `ident` is a local
 * const bound to a template literal — typically the cva-style pattern
 * `const classes = `${baseClasses} ${variantClasses[v]} ...``.
 *
 * Each `${...}` span resolves through `tryResolveTemplateSpanFromConst`,
 * so the returned IRTemplateLiteral has structured `string` and
 * `lookup` parts that adapters can render without re-parsing JS.
 *
 * Returns null when the const isn't a template literal or any span
 * fails to resolve cleanly.
 */
function tryResolveIdentifierAsTemplateLiteral(
  ident: ts.Identifier,
  ctx: TransformContext,
): IRTemplatePart[] | null {
  // #2222/#2235: at this transform position the identifier may be an
  // enclosing loop callback's own (shadowing) parameter — folding the
  // outer const's literal into the IR here bakes the same hard-coded
  // value into EVERY adapter's output (e.g. `key={label}` inside
  // `.map((label) => ...)` becoming a constant duplicate key).
  // `ctx.loopParams` is the live loop-param set (destructured binding
  // names and index included), so the guard is scope-accurate.
  if (ctx.loopParams.has(ident.text)) return null
  const constInfo = findLocalConst(ident.text, ctx.analyzer)
  if (!constInfo) return null
  const ast = parseConstInitializer(constInfo)
  if (!ast) return null

  if (ts.isNoSubstitutionTemplateLiteral(ast) || ts.isStringLiteral(ast)) {
    return [{ type: 'string', value: ast.text }]
  }

  if (!ts.isTemplateExpression(ast)) return null

  // We require at least one structurally-meaningful span (a string
  // substitution or a Record lookup) to bother emitting structured
  // IR — otherwise the existing identifier-text path is more
  // efficient. Spans that don't resolve fall through to a bare
  // `${expr}` string part (matching `parseTemplateLiteral`'s default).
  let resolvedAny = false
  const parts: IRTemplatePart[] = []
  if (ast.head.text) parts.push({ type: 'string', value: ast.head.text })

  for (const span of ast.templateSpans) {
    const resolved = tryResolveTemplateSpanFromConst(span.expression, ctx)
    if (resolved) {
      resolvedAny = true
      parts.push(...resolved)
    } else {
      // Unresolved span (e.g. a function param like `className`): keep
      // as a bare ${expr} placeholder so adapters can substitute the
      // matching prop/param at render time.
      const text = astText(span.expression)
      const templateText = rewriteBarePropRefs(text, span.expression, ctx)
      parts.push({
        type: 'string',
        value: `\${${text}}`,
        templateValue: templateText ? `\${${templateText}}` : undefined,
      })
    }
    if (span.literal.text) parts.push({ type: 'string', value: span.literal.text })
  }

  return resolvedAny ? parts : null
}

/**
 * Re-parse a constant's source-text initializer into a TS AST so we
 * can structurally inspect string literals, object literals, and
 * template literals. Returns null when the initializer is missing or
 * doesn't parse cleanly.
 *
 * The returned AST nodes belong to a synthetic SourceFile, NOT
 * `ctx.sourceFile` — callers must use `astText()` (not `ctx.getJS`)
 * for any text extraction from these nodes, since `getJS` resolves
 * positions against the analyzer's source.
 *
 * Results are memoized per `ConstantInfo` (object identity). For a
 * cva-style template like
 * `\`${baseClasses} ${variantClasses[v]} ${sizeClasses[s]}\``, every
 * span hits the same three consts, so caching dodges three redundant
 * `ts.createSourceFile` calls per outer-template resolution. The
 * cache uses the const object's identity (it never mutates after the
 * analyzer hands it to us), and TypeScript reuses these objects
 * across a single compile, so a `WeakMap` keeps the lifetime tied to
 * the analysis without leaking.
 */
const constInitializerCache = new WeakMap<object, ts.Expression | null>()

function parseConstInitializer(c: { value?: string }): ts.Expression | null {
  const cached = constInitializerCache.get(c as object)
  if (cached !== undefined) return cached
  const result = parseConstInitializerImpl(c)
  constInitializerCache.set(c as object, result)
  return result
}

function parseConstInitializerImpl(c: { value?: string }): ts.Expression | null {
  if (!c.value) return null
  const wrapped = `const __bf_resolve__ = (${c.value})`
  const sf = ts.createSourceFile(
    '__bf_resolve.ts',
    wrapped,
    ts.ScriptTarget.Latest,
    /* setParentNodes */ true,
    ts.ScriptKind.TS,
  )
  const stmt = sf.statements[0]
  if (!stmt || !ts.isVariableStatement(stmt)) return null
  const decl = stmt.declarationList.declarations[0]
  if (!decl?.initializer) return null
  // Strip the wrapping parens we added.
  return ts.isParenthesizedExpression(decl.initializer)
    ? decl.initializer.expression
    : decl.initializer
}

/** Get text for a node living in any source file (synthetic or otherwise). */
function astText(node: ts.Node): string {
  return node.getText(node.getSourceFile())
}

/**
 * Re-parse a `FunctionInfo` (a `function foo(...) {...}` declaration
 * collected by the analyzer) into an anonymous `ts.FunctionExpression`, for
 * the same reason `parseConstInitializer` re-parses a const's initializer
 * text — the analyzer stores source text, not a live AST node tied to
 * `ctx.sourceFile`.
 *
 * Wraps as `const __bf_resolve_fn__ = function(params) body` (an
 * EXPRESSION position) rather than reparsing a standalone `function foo() {}`
 * statement, because `convertNode` in expression-parser.ts only recognizes
 * `ts.isArrowFunction` / `ts.isFunctionExpression` — not
 * `ts.isFunctionDeclaration`. The returned node's parameters/body are then
 * structurally identical to a function-expression sort comparator, so it
 * flows through the existing `tsNodeToParsedExpr` → `sortComparatorFromArrow`
 * path unchanged. Uses `typedParams`/`typedBody` when present (verbatim
 * source, may carry type annotations that don't affect `ts.isIdentifier(p.name)`
 * checks downstream) and falls back to reconstructing from `params`/`body`.
 *
 * Returns null when the source doesn't parse cleanly (e.g. no body).
 * Memoized per `FunctionInfo` object identity — mirrors
 * `constInitializerCache`.
 */
const functionInfoExprCache = new WeakMap<object, ts.Expression | null>()

function parseFunctionInfoAsExpr(fn: FunctionInfo): ts.Expression | null {
  const cached = functionInfoExprCache.get(fn as object)
  if (cached !== undefined) return cached
  const result = parseFunctionInfoAsExprImpl(fn)
  functionInfoExprCache.set(fn as object, result)
  return result
}

function parseFunctionInfoAsExprImpl(fn: FunctionInfo): ts.Expression | null {
  if (!fn.body) return null
  const params = fn.typedParams !== undefined
    ? fn.typedParams
    : fn.params.map(formatParamWithType).join(', ')
  const body = fn.typedBody ?? fn.body
  const wrapped = `const __bf_resolve_fn__ = function(${params}) ${body}`
  const sf = ts.createSourceFile(
    '__bf_resolve_fn.ts',
    wrapped,
    ts.ScriptTarget.Latest,
    /* setParentNodes */ true,
    ts.ScriptKind.TS,
  )
  const stmt = sf.statements[0]
  if (!stmt || !ts.isVariableStatement(stmt)) return null
  const decl = stmt.declarationList.declarations[0]
  if (!decl?.initializer) return null
  return decl.initializer
}

// =============================================================================
// Tagged-Template Interleave-Tag Desugaring (#2092, Refs #2069)
// =============================================================================

/**
 * Recognize + desugar the classname-tag idiom:
 *
 *   function cn(parts: TemplateStringsArray, ...args: unknown[]): string {
 *     return parts.reduce<string>((acc, p, i) => acc + p + (args[i] ?? ''), '')
 *   }
 *   className={cn`base ${tone()}`}
 *
 * When `expr` is a top-level `ts.TaggedTemplateExpression` whose tag is an
 * identifier resolving ONE HOP through same-file scope (`findLocalConst` /
 * `findLocalFunction`, same shadowing preference as #2090's sort-comparator
 * resolution) to a function structurally proven to be an "interleave tag"
 * (see {@link isInterleaveTagFunction}), this rewrites the tagged template
 * to the equivalent UNTAGGED template literal — each span wrapped in
 * `(span) ?? ''` — and returns the new node. The entire existing pipeline
 * (dep analysis, template-literal parts, adapter emit, client-JS binding)
 * then processes the rewritten node exactly as if the user had written an
 * untagged template literal directly; no adapter changes, no new IR node.
 *
 * Returns `expr` UNCHANGED when the tag doesn't resolve, resolves to
 * something other than an arrow/function expression, or resolves but its
 * body isn't the exact interleave-reduce shape (imported tags, computed
 * tags like `obj.cn`, non-rest signatures, a tag that joins with `-`,
 * etc.) — today's opaque-leaf behavior (adapter BF101) is preserved
 * byte-for-byte for every other case.
 *
 * Top-level only (#2092 scope): a tagged template nested inside a ternary
 * or map callback is not rewritten by this call — only the two call sites
 * that receive an attribute value / JSX-child expression directly.
 */
function tryDesugarInterleaveTaggedTemplate(
  expr: ts.Expression,
  ctx: TransformContext,
): ts.Expression {
  if (!ts.isTaggedTemplateExpression(expr)) return expr
  if (!ts.isIdentifier(expr.tag)) return expr

  const resolvedTag = resolveInterleaveTagIdentifier(expr.tag.text, ctx)
  if (!resolvedTag) return expr
  if (!isInterleaveTagFunction(resolvedTag)) return expr

  const rewritten = buildUntaggedTemplateLiteral(expr, ctx)
  return rewritten ?? expr
}

/**
 * Resolve a bare-identifier tag reference one hop through same-file scope
 * — a `const cn = (parts, ...args) => …` or `function cn(parts, ...args)
 * {…}` — reusing the exact `findLocalConst` / `findLocalFunction` lookup
 * (and its shadowing preference) that #2090 established for sort
 * comparators. Alias chains and imported/prop identifiers are NOT
 * followed, matching that precedent. Returns null when nothing resolves.
 */
function resolveInterleaveTagIdentifier(name: string, ctx: TransformContext): ts.Expression | null {
  const constInfo = findLocalConst(name, ctx.analyzer)
  const fnInfo = findLocalFunction(name, ctx.analyzer)
  // A name bound BOTH as a const and as a `function` declaration is the
  // same cross-kind ambiguity `resolveSortComparatorIdentifier` refuses:
  // it can only occur across scopes, and `FunctionInfo.isModule` reflects
  // emission placement rather than lexical position, so picking either
  // binding could desugar a tag the call site can't actually see. Refuse —
  // the node stays opaque and keeps today's adapter BF101 (Copilot review
  // on #2093).
  if (constInfo && fnInfo) return null
  if (constInfo) {
    const ast = parseConstInitializer(constInfo)
    return ast && (ts.isArrowFunction(ast) || ts.isFunctionExpression(ast)) ? ast : null
  }
  if (fnInfo) {
    const ast = parseFunctionInfoAsExpr(fnInfo)
    return ast && (ts.isArrowFunction(ast) || ts.isFunctionExpression(ast)) ? ast : null
  }
  return null
}

/**
 * Structural catalogue gate for an "interleave tag" — the classname-cn
 * idiom's tag function. Kept tight per #2092: a resolved tag that doesn't
 * match EXACTLY this shape is left unrecognized (caller leaves the node
 * untouched).
 *
 * Signature: exactly 2 params, first a plain (non-rest) identifier
 * (`parts`), second a REST identifier param (`...args`). Type annotations
 * are irrelevant — only the parsed structure is matched.
 *
 * Body (after the existing block-body → single-`return` folding that
 * `tsNodeToParsedExpr` already performs):
 *
 *   parts.reduce((acc, p, i) => acc + p + (args[i] ?? ''), '')
 *
 * — receiver is the first param; the reduce callback has 3 plain
 * identifier params; the callback body is a left-assoc `+` chain
 * `(acc + p) + X` (any parenthesization — `tsNodeToParsedExpr` already
 * discards parens) with `acc`/`p` the callback's first two params in
 * that order; `X` is `args[i] ?? ''`, optionally wrapped in `String(...)`,
 * with `args` the rest param and `i` the callback's third param; the
 * reduce init arg is the empty string literal.
 */
function isInterleaveTagFunction(fn: ts.Expression): boolean {
  if (!ts.isArrowFunction(fn) && !ts.isFunctionExpression(fn)) return false
  if (fn.parameters.length !== 2) return false
  const [partsParam, argsParam] = fn.parameters
  if (!ts.isIdentifier(partsParam.name) || partsParam.dotDotDotToken) return false
  if (!ts.isIdentifier(argsParam.name) || !argsParam.dotDotDotToken) return false

  const parsed = tsNodeToParsedExpr(fn)
  if (parsed.kind !== 'arrow') return false
  return isInterleaveReduceCall(parsed.body, partsParam.name.text, argsParam.name.text)
}

/** Match `<partsName>.reduce((acc, p, i) => …, '')`. */
function isInterleaveReduceCall(body: ParsedExpr, partsName: string, argsName: string): boolean {
  if (body.kind !== 'call' || body.args.length !== 2) return false
  const { callee, args } = body
  if (callee.kind !== 'member' || callee.computed || callee.property !== 'reduce') return false
  if (callee.object.kind !== 'identifier' || callee.object.name !== partsName) return false

  const [callback, init] = args
  if (init.kind !== 'literal' || init.literalType !== 'string' || init.value !== '') return false
  if (callback.kind !== 'arrow' || callback.params.length !== 3) return false

  const [acc, p, i] = callback.params
  return isInterleaveReduceCallbackBody(callback.body, acc, p, i, argsName)
}

/** Match `(acc + p) + X` where X is the per-span interleave expression. */
function isInterleaveReduceCallbackBody(
  body: ParsedExpr,
  acc: string,
  p: string,
  i: string,
  argsName: string,
): boolean {
  if (body.kind !== 'binary' || body.op !== '+') return false
  const { left, right } = body
  if (left.kind !== 'binary' || left.op !== '+') return false
  if (left.left.kind !== 'identifier' || left.left.name !== acc) return false
  if (left.right.kind !== 'identifier' || left.right.name !== p) return false
  return isInterleaveSpanExpr(right, i, argsName)
}

/** Match `args[i] ?? ''`, optionally wrapped in `String(...)`. */
function isInterleaveSpanExpr(expr: ParsedExpr, i: string, argsName: string): boolean {
  let inner = expr
  if (
    inner.kind === 'call' &&
    inner.args.length === 1 &&
    inner.callee.kind === 'identifier' &&
    inner.callee.name === 'String'
  ) {
    inner = inner.args[0]
  }
  if (inner.kind !== 'logical' || inner.op !== '??') return false
  if (inner.right.kind !== 'literal' || inner.right.literalType !== 'string' || inner.right.value !== '') {
    return false
  }
  const idx = inner.left
  if (idx.kind !== 'index-access') return false
  if (idx.object.kind !== 'identifier' || idx.object.name !== argsName) return false
  if (idx.index.kind !== 'identifier' || idx.index.name !== i) return false
  return true
}

/**
 * Build the untagged template literal equivalent to a recognized
 * interleave-tag call: `cn\`base ${tone()}\`` → `` `base ${(tone()) ?? ''}` ``.
 *
 * Each literal chunk uses its RAW source text (`rawText`, falling back to
 * the cooked `text` only if `rawText` is unexpectedly absent) so escapes
 * (a literal backtick, `${`, or backslash inside a chunk) survive
 * verbatim — pasting the COOKED text back into new template source would
 * mis-parse or silently change meaning. Each span expression uses
 * `ctx.getJS` (type-stripped, matching every other raw-text extraction in
 * this file) wrapped as `${(<expr>) ?? ''}`.
 *
 * The assembled text is re-parsed the same way `parseConstInitializer`
 * re-parses a const initializer (wrapped in `const __bf_… = (…)` so the
 * result lands in expression position). Returns null if the reparse
 * doesn't produce a clean template-literal expression (defensive; should
 * not happen for well-formed input).
 */
function buildUntaggedTemplateLiteral(
  node: ts.TaggedTemplateExpression,
  ctx: TransformContext,
): ts.Expression | null {
  const template = node.template

  let text: string
  if (ts.isNoSubstitutionTemplateLiteral(template)) {
    text = '`' + (template.rawText ?? template.text) + '`'
  } else {
    let body = template.head.rawText ?? template.head.text
    for (const span of template.templateSpans) {
      const spanText = ctx.getJS(span.expression)
      body += '${(' + spanText + ') ?? \'\'}'
      body += span.literal.rawText ?? span.literal.text
    }
    text = '`' + body + '`'
  }

  const wrapped = `const __bf_resolve_tagged__ = (${text})`
  // ScriptKind.TSX (unlike the const/function-resolution re-parses above,
  // which parse comparator/tag FUNCTION BODIES): the span expressions are
  // verbatim attribute-position text from a .tsx component, so they were
  // originally parsed under TSX rules — re-parsing them as plain TS can
  // mis-parse or reject valid TSX span syntax and silently skip the
  // rewrite (Copilot review on #2093).
  const sf = ts.createSourceFile(
    '__bf_resolve_tagged.tsx',
    wrapped,
    ts.ScriptTarget.Latest,
    /* setParentNodes */ true,
    ts.ScriptKind.TSX,
  )
  const stmt = sf.statements[0]
  if (!stmt || !ts.isVariableStatement(stmt)) return null
  const decl = stmt.declarationList.declarations[0]
  if (!decl?.initializer) return null
  const result = ts.isParenthesizedExpression(decl.initializer)
    ? decl.initializer.expression
    : decl.initializer
  if (!ts.isTemplateExpression(result) && !ts.isNoSubstitutionTemplateLiteral(result)) return null
  return result
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
    if (ts.isJsxSpreadAttribute(attr)) {
      props.push(...expandSpreadAttribute(attr, ctx))
      continue
    }

    if (!ts.isJsxAttribute(attr)) continue

    const name = attr.name.getText(ctx.sourceFile)

    // JSX element/fragment as prop value: controls={<select />} or
    // controls={(<div/>)}. Carried as a `jsx-children` AttrValue variant
    // so adapters render the JSX inline rather than passing a string.
    if (attr.initializer && ts.isJsxExpression(attr.initializer) && attr.initializer.expression) {
      let jsxExpr = attr.initializer.expression
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
            value: AttrValueOf.jsxChildren([unwrapHoistedFragment(irNode)]),
            loc: getSourceLocation(attr, ctx.sourceFile, ctx.filePath),
          })
          continue
        }
      }
    }

    let value = getAttributeValue(attr, ctx)
    // Components receive props as runtime values, so collapse a structured
    // template literal back into a JS expression — but keep the parsed
    // parts in `parts` so template-based SSR adapters (Mojo, Go) can still
    // emit structured lookups / ternaries instead of round-tripping a raw
    // JS source through their expression pipelines. JS-runtime adapters
    // (Hono) keep using `expr`. Boolean-attr is also promoted to
    // shorthand (`<X disabled />` → `disabled={true}`).
    if (value.kind === 'template') {
      value = AttrValueOf.expression(templatePartsToJsString(value.parts), {
        parts: value.parts,
      })
    } else if (value.kind === 'boolean-attr') {
      value = AttrValueOf.booleanShorthand()
    }

    let clientOnly: boolean | undefined
    if (attr.initializer && ts.isJsxExpression(attr.initializer) && attr.initializer.expression) {
      if (value.kind === 'expression' && value.templateExpr === undefined) {
        const rewritten = rewriteBarePropRefs(value.expr, attr.initializer.expression, ctx)
        if (rewritten !== value.expr) {
          value = { ...value, templateExpr: rewritten }
        }
      }
      // `/* @client */` in component-prop initializer position: defer
      // to hydrate. Detection routed through the shared helper so it
      // agrees with JSX-child / element-attr sites. Downstream:
      // html-template strips the prop from `renderChild`; `initChild`'s
      // `propsExpr` already runs in init scope so the value reaches
      // the child component once init runs.
      if (hasLeadingClientDirective(attr.initializer.expression, ctx.sourceFile)) {
        clientOnly = true
      }
    }

    const freeIdentifiers = attrFreeIdentifiers(attr)
    props.push({
      name,
      value,
      clientOnly,
      loc: getSourceLocation(attr, ctx.sourceFile, ctx.filePath),
      ...computeReactivityFlags(attr, ctx),
      ...(freeIdentifiers !== undefined && { freeIdentifiers }),
    })
  }

  return props
}

/**
 * Flatten a structured template-literal's parts back into a JS expression
 * string. Used at IR construction time when a structured `template` variant
 * needs to be collapsed into an `expression` for component-prop forwarding —
 * component props are runtime JS values, not HTML attribute bodies.
 */
function templatePartsToJsString(parts: readonly IRTemplatePart[]): string {
  let result = '`'
  for (const part of parts) {
    if (part.type === 'string') {
      result += part.value
    } else if (part.type === 'ternary') {
      result += `\${${part.condition} ? '${part.whenTrue}' : '${part.whenFalse}'}`
    } else if (part.type === 'lookup') {
      const obj = '{' + Object.entries(part.cases).map(
        ([k, v]) => `${JSON.stringify(k)}: ${JSON.stringify(v)}`
      ).join(', ') + '}'
      result += `\${(${obj})[${part.key}]}`
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
 * Structural AST check: is the array expression a direct prop reference?
 *
 * Returns true only when arrayExpr is:
 * (a) An Identifier that is a destructured prop binding (e.g. `toggleItems`)
 * (b) A PropertyAccessExpression rooted at the props object (e.g. `props.items`)
 *
 * Unlike the regex-based `isPropsReference`, this avoids false positives from
 * unrelated identifiers that happen to share a prop name (e.g. `state.items`
 * when `items` is also a prop).
 */
function isArrayExprDirectPropRef(arrayExpr: ts.Expression, ctx: TransformContext): boolean {
  const propNames = new Set(ctx.patterns.props.map(p => p.name))
  const propsObjName = ctx.analyzer.propsObjectName

  if (ts.isIdentifier(arrayExpr)) {
    return propNames.has(arrayExpr.text)
  }

  if (ts.isPropertyAccessExpression(arrayExpr) && propsObjName) {
    const obj = arrayExpr.expression
    if (ts.isIdentifier(obj) && obj.text === propsObjName) {
      return true
    }
  }

  return false
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
 * Decide whether a JSX expression should be auto-deferred to the client
 * (treated as if it carried `/* @client *​/`) because it reads reactive
 * brand-package state the SSR template lambda cannot evaluate (#1638).
 *
 * The motivating case is `@barefootjs/form`: `const form = createForm(...)`
 * is per-instance init-scope state, so `form.field('x').value()` /
 * `form.isSubmitting()` resolve to an init-local with no compiler-derivable
 * SSR value. Referencing them from a template position (element attribute,
 * conditional condition) otherwise raises BF061 and forces a manual
 * `/* @client *​/` on every binding.
 *
 * Gated tightly so it never demotes server-renderable reads:
 *  - Requires the TypeChecker AND a `Reactive<T>` brand on the expression
 *    (`containsReactiveExpression`), so plain values are untouched.
 *  - Excludes native `createSignal` / `createMemo` getters (and their
 *    chained-const aliases): they carry the same brand but DO have a
 *    derivable initial value, so they must keep rendering server-side.
 */
function shouldAutoDeferReactiveBrand(expr: ts.Expression, ctx: TransformContext): boolean {
  const checker = ctx.analyzer.checker
  if (!checker) return false
  if (!containsReactiveExpression(expr, checker)) return false
  // Native signals/memos (incl. chained-const aliases) are SSR-derivable —
  // leave them to the normal template path so their initial value renders.
  if (isSignalOrMemoReference(ctx.getJS(expr), ctx)) return false
  return true
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
    // `/* @client */` always defers via the reactiveAttrs path, so the
    // element MUST have a slotId for runtime lookup — even if the
    // expression itself doesn't trip the signal/memo/prop heuristics.
    if (attr.clientOnly) return true
    const valueToCheck = attrValueReactivityProbe(attr.value)
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
  return false
}

/**
 * Extract a string representation of an `AttrValue` suitable for the
 * reactivity heuristics (regex tests against signal / memo / prop names).
 * Returns null for variants whose body never references runtime values.
 */
function attrValueReactivityProbe(value: AttrValue): string | null {
  switch (value.kind) {
    case 'expression':
      return value.expr
    case 'spread':
      return value.expr
    case 'template':
      return value.parts.map((p: IRTemplatePart) => {
        if (p.type === 'string') return p.value
        if (p.type === 'ternary') return p.condition
        return p.key
      }).join('')
    case 'literal':
    case 'boolean-attr':
    case 'boolean-shorthand':
    case 'jsx-children':
      return null
  }
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
 * Substitute branch-local identifier references in `text` with the
 * value returned by `resolve(name)`. Skips occurrences inside string
 * / regex / template-body / comment tokens via the shared
 * `replaceInExprContexts` scanner, so a string like `'mergedClass'`
 * never gets rewritten into invalid JS. Identifier boundaries use
 * `[\w$]` lookarounds rather than `\b`, since JS regex's word-char
 * class excludes `$` — a bare `\b` would mis-match the `foo` inside
 * `$foo`. Branch-local names are syntactically `[A-Za-z_$][A-Za-z0-9_$]*`
 * (no regex-meta characters), so direct interpolation into the
 * alternation is safe without escaping.
 *
 * Used twice in `buildIfStatementChain`:
 *   1. Pre-resolving nested branch-local refs in `branchSubs` (so a
 *      later entry that pulls this one in carries fully-closed text).
 *   2. The `substitutedGetJS` override that swaps branch-local refs
 *      at every raw-text capture inside the branch.
 */
function replaceBranchLocalRefs(
  text: string,
  branchNames: readonly string[],
  resolve: (name: string) => string,
): string {
  if (branchNames.length === 0) return text
  const pattern = new RegExp(`(?<![\\w$])(${branchNames.join('|')})(?![\\w$])`, 'g')
  return replaceInExprContexts(text, pattern, (_match, name) => resolve(name))
}

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

    // #1409: overlay each branch's `const X = …` declarations onto
    // `ctx._branchScopeVars` so a JSX expression that references one
    // of them inlines the initializer at the use site instead of
    // leaving the bare identifier in the emitted client JS at outer
    // init scope. Saved/restored around `transformNode` so sibling
    // branches and outer scope don't see each other's locals.
    const prevBranchScopeVars = ctx._branchScopeVars
    const prevJsxBranchLocalNames = ctx._jsxBranchLocalNames
    const branchScopeVars = new Map<string, ts.Expression>()
    const jsxBranchLocalNames = new Set<string>()
    if (prevBranchScopeVars) {
      for (const [k, v] of prevBranchScopeVars) branchScopeVars.set(k, v)
    }
    if (prevJsxBranchLocalNames) {
      for (const n of prevJsxBranchLocalNames) jsxBranchLocalNames.add(n)
    }
    for (const decl of condReturn.scopeVariables) {
      if (ts.isIdentifier(decl.name) && decl.initializer) {
        branchScopeVars.set(decl.name.text, decl.initializer)
        if (initializerShapeContainsJsx(decl.initializer)) {
          jsxBranchLocalNames.add(decl.name.text)
        } else {
          // A shadowing non-JSX declaration in a nested branch lifts
          // the parent's JSX flag for this name.
          jsxBranchLocalNames.delete(decl.name.text)
        }
      }
    }
    ctx._branchScopeVars = branchScopeVars
    ctx._jsxBranchLocalNames = jsxBranchLocalNames

    // #1414 cells 5 & 7: branch-local references that don't reach the
    // bare-identifier substitution sites (`transformExpressionInner`
    // for child position, `getAttributeValue` for attribute position)
    // still leak as undeclared names at outer init scope. The shapes
    // that miss the existing routes are:
    //   - `{local()}` — the JSX expression's root is a CallExpression
    //     (not an Identifier), so `transformExpressionInner`'s
    //     identifier check doesn't fire.
    //   - `ref={(el) => use(local)}` — the ref callback's body is
    //     captured verbatim via `ctx.getJS`, so the local appears
    //     unchanged in the emitted init function.
    // Override `ctx.getJS` for the duration of this branch's
    // `transformNode` so every raw-text capture (call args, ref
    // callbacks, event handlers, etc.) substitutes branch locals at
    // the source level. Same trade-off as the JSX-function-inlining
    // path (#569) and `inlineableJsxConsts` (#1412): substituting
    // is text-level, so a local read with side effects gets evaluated
    // at every use site rather than once at declaration. Users who
    // need single-evaluation semantics should still hoist the local
    // to outer init scope themselves.
    const branchNames: string[] = []
    const branchSubs = new Map<string, string>()
    // #1425: per branch-local, the set of destructured prop names it
    // transitively references via its initializer (directly or via
    // inner-substituted branch locals). Used by
    // `rewriteBarePropRefs` so prop refs introduced via the text-
    // level substitution still bridge to `_p.X` in CSR template
    // scope. Kept separate from `branchSubs` so the substitution
    // output stays in raw (source-level) form — SSR JSX emission
    // (via the adapter) evaluates the same text in a scope where
    // `_p` doesn't exist and `className` / `children` are the
    // destructured locals, so the rewrite must NOT happen there.
    const branchPropDeps = new Map<string, Set<string>>()
    const destructuredPropNames = getDestructuredPropNames(ctx)
    const baseGetJS = ctx.analyzer.getJS.bind(ctx.analyzer)
    for (const [name, initExpr] of branchScopeVars) {
      // JSX-bearing initializers are handled by the existing
      // identifier-substitution route in `transformExpressionInner`
      // (#1410). Text substitution into raw-captured JS would emit
      // the JSX as TypeScript syntax inside a JS string — invalid.
      if (initializerShapeContainsJsx(initExpr)) continue
      // #1425: pre-resolve nested branch-local refs in this
      // initializer so a downstream substitution that pulls this
      // entry in doesn't leave an earlier-declared local as a free
      // identifier in the emitted output. `branchScopeVars` records
      // entries in source declaration order, so by the time we
      // reach `name`, every earlier-declared local (the only kind
      // its initializer can reference — TS rejects forward refs)
      // is already resolved in `branchSubs`.
      let text = baseGetJS(initExpr)
      // Collect destructured prop names the initializer references
      // directly (AST walk on initExpr) AND transitively through
      // any earlier branch-local referenced in its text. The first
      // pass is the same walk `rewriteBarePropRefsCore` uses; the
      // second unions in each substituted entry's already-built dep
      // set so the result is closed under substitution.
      const propDeps = new Set<string>()
      if (destructuredPropNames) {
        collectAstPropRefs(initExpr, destructuredPropNames, propDeps)
      }
      if (branchNames.length > 0) {
        text = replaceBranchLocalRefs(text, branchNames, (ref) => {
          const innerDeps = branchPropDeps.get(ref)
          if (innerDeps) for (const d of innerDeps) propDeps.add(d)
          return `(${branchSubs.get(ref)!})`
        })
      }
      branchNames.push(name)
      branchSubs.set(name, text)
      branchPropDeps.set(name, propDeps)
    }
    const prevBranchScopePropDeps = ctx._branchScopePropDeps
    ctx._branchScopePropDeps = branchPropDeps
    const prevCtxGetJS = ctx.getJS
    const prevAnalyzerGetJS = ctx.analyzer.getJS
    if (branchNames.length > 0) {
      const substitutedGetJS = (n: ts.Node): string => {
        const text = baseGetJS(n)
        return replaceBranchLocalRefs(text, branchNames, (name) => `(${branchSubs.get(name)!})`)
      }
      ctx.getJS = substitutedGetJS
      ctx.analyzer.getJS = substitutedGetJS
    }

    // Transform the JSX return in the then branch
    // Reset isRoot so each branch gets needsScope=true
    ctx.isRoot = true
    let consequent: IRNode | null
    try {
      consequent = transformNode(condReturn.jsxReturn, ctx)
    } finally {
      if (branchNames.length > 0) {
        ctx.getJS = prevCtxGetJS
        ctx.analyzer.getJS = prevAnalyzerGetJS
      }
    }

    ctx._branchScopeVars = prevBranchScopeVars
    ctx._jsxBranchLocalNames = prevJsxBranchLocalNames
    ctx._branchScopePropDeps = prevBranchScopePropDeps

    if (!consequent) {
      continue
    }

    // Collect scope variables with their initializers
    const scopeVariables: Array<{
      name: string
      initializer: string
      templateInitializer?: string
      typedInitializer?: string
    }> = []
    for (const decl of condReturn.scopeVariables) {
      if (ts.isIdentifier(decl.name) && decl.initializer) {
        const init = ctx.getJS(decl.initializer)
        // Source-verbatim form keeps `as <T>` casts intact for `.tsx`
        // emit (#1453). `ctx.getJS` strips them, so without this the
        // emitted const loses type information that downstream tsc
        // uses for JSX narrowing (`<Tag/>` requires `Tag` not be
        // `unknown`).
        const typedInit = decl.initializer.getText(ctx.sourceFile)
        scopeVariables.push({
          name: decl.name.text,
          initializer: init,
          templateInitializer: rewriteBarePropRefs(init, decl.initializer, ctx),
          typedInitializer: typedInit !== init ? typedInit : undefined,
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
