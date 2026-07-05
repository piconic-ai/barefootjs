/**
 * Template-inlinability classifier for local constants and local
 * functions.
 *
 * Answers two boundary questions the template emitter asks per name:
 *
 *   (a) Can this constant be inlined verbatim into the generated
 *       template HTML? — e.g. `const cls = 'layer-x:p-2'` can;
 *       `const f = () => 0` cannot (arrow literal, runtime value).
 *   (b) Is this name unsafe to reference by its bare identifier inside
 *       a template expression? — module-scope functions that do NOT
 *       reference component-scope names are safe; anything else is not.
 *
 * Pre-Stage E.4 this was a 110-line cascade inside
 * `buildInlinableConstants` mixing three independent sub-decisions
 * (emission scope, template safety, scope visibility) without named
 * outcomes. Now each sub-decision returns a tagged status so the
 * cascade reads as a flat list of rules. The legacy `{
 * inlinableConstants, unsafeLocalNames }` shape is reconstructed at
 * the boundary — downstream consumers (static/CSR template
 * generation, chained-ref resolution) are byte-identical.
 *
 * Stage E.4 of issue #1021.
 */

import type { ConstantInfo, IRNode, ReferencesGraph } from '../types.ts'
import type { ClientJsContext } from './types.ts'
import { graphFunctionReferences } from './build-references.ts'
import { extractIdentifiers, extractTemplateIdentifiers } from './identifiers.ts'
import { isInlinableInTemplate, buildRelocateEnvFromIR } from '../relocate.ts'
import type { RelocateEnv, RelocateDecision } from '../relocate.ts'
import { createError, ErrorCodes } from '../errors.ts'
import { attrValueToString } from './utils.ts'
import { walkIR, type IRVisitor } from './walker.ts'
import { buildSignalMemoEnv, csrSubstitute, type CsrEnv, type CsrSubstitution } from './csr-substitute.ts'

/**
 * Build a `RelocateEnv` from a live `ClientJsContext`. The IR-keyed env
 * builder (`buildRelocateEnvFromIR`) takes the same shape as `IRMetadata`,
 * so the post-collect-elements ctx can fill that shape with empty stubs
 * for the metadata fields that don't influence relocate decisions.
 *
 * Adapter capabilities (`templatePrimitives` / `acceptsTemplateCall`) are
 * threaded through so a registered call escapes the bridged-arg / zero-arg
 * inline-safety rejections (#1187 phase 3). The two call sites in this
 * package — `computeInlinability` (Stage 1 + Stage 2 `populateCsrInlinable`)
 * and `hasInitScopeOnlyConstant` — share this helper to stay byte-identical.
 */
export function buildEnvFromCtx(ctx: ClientJsContext): RelocateEnv {
  return buildRelocateEnvFromIR(
    {
      componentName: ctx.componentName,
      hasDefaultExport: false,
      isExported: false,
      isClientComponent: true,
      typeDefinitions: [],
      propsType: null,
      propsParams: ctx.propsParams,
      propsObjectName: ctx.propsObjectName,
      restPropsName: ctx.restPropsName,
      restPropsExpandedKeys: [],
      signals: ctx.signals,
      memos: ctx.memos,
      effects: ctx.effects,
      onMounts: ctx.onMounts,
      initStatements: ctx.initStatements,
      // Real component imports (#2069) — `buildRelocateEnvFromIR` calls
      // `prepareLoweringMatchers(metadata)` on this reconstructed object,
      // and plugin `prepare()` resolves local import names from
      // `metadata.imports`. `[]` here would silently disable every
      // import-aware LoweringPlugin for the client-JS inline-safety gate.
      imports: ctx.imports,
      templateImports: [],
      namedExports: [],
      localFunctions: ctx.localFunctions,
      localConstants: ctx.localConstants,
    },
    {
      templatePrimitives: ctx.templatePrimitives,
      acceptsTemplateCall: ctx.acceptsTemplateCall,
    },
  )
}

/**
 * Why a local constant was or was not chosen for template inlining.
 * Order of evaluation mirrors the pre-Stage E.4 cascade so the
 * decision set is byte-identical.
 */
export type ConstantInlinability =
  | { kind: 'inlinable'; value: string }
  /** JSX literal — already inlined at IR level (#547); not part of
   *  the constants emission at all. */
  | { kind: 'jsx-inline' }
  /** System unique-identity construct (`createContext()`, `new WeakMap()`).
   *  Not a template value and not unsafe either — emitted at module
   *  scope, queried by name at runtime. */
  | { kind: 'system-construct' }
  /** `let x;` with no initializer, or analysis is missing a value we
   *  need to inline. Safe to emit, unsafe to inline. */
  | { kind: 'placeholder-let' }
  /** Initializer contains an arrow or function expression (AST flag).
   *  The function identity is per-instance; inlining a function
   *  literal into a template would close over the wrong scope. */
  | { kind: 'arrow-literal' }
  /** Initializer reads a signal/memo. Template inlining would freeze
   *  the reactive value at SSR time. */
  | { kind: 'reactive-read' }
  /** Free identifiers include names outside `graph.declaredNames` —
   *  e.g. a file-scope helper or an import. Not visible at template
   *  module scope. */
  | { kind: 'external-name' }
  /** After chained-ref resolution, the inlined value still mentions
   *  a name classified unsafe above. Transitive demotion. */
  | { kind: 'depends-on-unsafe' }

export type FunctionInlinability =
  /** Module-scope function that does NOT touch component internals —
   *  the template can reference it by bare name because the emitted
   *  client JS puts it at module scope too. */
  | { kind: 'module-scope-safe' }
  /** Module-scope function that DOES touch component internals, OR
   *  any per-instance (isModule !== true) function. Its identity is
   *  per-instance or its closure pulls component-local names the
   *  template cannot see — either way, unsafe for template inlining. */
  | { kind: 'references-component-scope' }

export interface InlinabilityAnalysis {
  constants: Map<string, ConstantInlinability>
  functions: Map<string, FunctionInlinability>
  /**
   * Per-const relocate decisions captured during initial classification.
   * Used by `toLegacyInlinability` to emit BF060/BF061 only for constants
   * that remain unsafe after chain resolution — emitting at classification
   * time would produce false positives for chains that resolve cleanly
   * (e.g. `classes = 'tag-' + color` where `color` itself resolves to a
   * prop-based expression downstream).
   */
  decisionsByName: Map<string, RelocateDecision[]>
  /**
   * Names referenced from a template position where the relocate
   * fallback (`UNSAFE_TEMPLATE_EXPR = 'undefined'`) would surface as
   * a user-visible SSR defect. The defect varies by position — the
   * common thread is that the SSR HTML doesn't match the intended
   * output and there's no slot for hydrate to recover from:
   *
   *   - Element attribute values → `templateAttrExpr` drops the
   *     attribute when the value is `undefined` (one carve-out:
   *     `data-key`, but loops fall back to `[]` so no items render
   *     anyway). The SSR markup is missing the attribute; hydrate
   *     re-adds it, producing a flash and breaking pre-hydrate reads.
   *   - Slotless JSX expressions → emit `''` at SSR with no slot
   *     marker, so the text is permanently empty for the lifetime of
   *     the component.
   *   - Conditional / if-statement conditions → `undefined` is falsey,
   *     so the wrong branch renders at SSR until hydrate corrects.
   *   - Loop arrays → substituted to `[]`, SSR has zero items;
   *     hydrate reconciles to N — visible item-count flash.
   *
   * Excluded (safe-fallback positions where the pipeline already
   * recovers at hydrate without a visible artefact, so a BF060/BF061
   * diagnostic would be a false positive):
   *
   *   - Component props → stripped on UNSAFE; `initChild` getter
   *     binding fills the prop once init runs
   *   - JSX expressions WITH a slotId → emit `<!--bf:s1-->${''}<!--/-->`,
   *     hydrate's reactive binding fills the slot
   *   - Expressions wrapped in `/* @client *\/` → routed through
   *     `clientOnlyElements`, never reach the regular template
   *
   * `toLegacyInlinability` gates BF060/BF061 emission on this set so
   * patterns like `<Component prop={field.value()}>` (the form-library
   * shape) don't false-positive. Their relocate decision is "fallback",
   * but the actual SSR emission is safe (stripped prop) — surfacing the
   * diagnostic would mislead the user into restructuring code that's
   * already correct.
   */
  templateRiskyNames: Set<string>
}

// JavaScript built-in identifiers that are always available at any scope.
// Names in this set never mark a constant `external-name`.
const JS_BUILTINS = new Set([
  'true', 'false', 'null', 'undefined', 'NaN', 'Infinity',
  'typeof', 'instanceof', 'void', 'delete', 'new', 'in', 'of',
  'this', 'super', 'return', 'throw', 'if', 'else',
  'for', 'while', 'do', 'switch', 'case', 'break', 'continue',
  'try', 'catch', 'finally', 'yield', 'await', 'async',
  'let', 'const', 'var', 'function', 'class',
  'Math', 'JSON', 'Object', 'Array', 'String', 'Number', 'Boolean',
  'Date', 'RegExp', 'Map', 'Set', 'WeakMap', 'WeakSet', 'Promise',
  'Error', 'TypeError', 'RangeError', 'SyntaxError',
  'console', 'window', 'document', 'globalThis', 'navigator',
  'parseInt', 'parseFloat', 'isNaN', 'isFinite',
  'encodeURIComponent', 'decodeURIComponent', 'encodeURI', 'decodeURI',
  'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval',
  'requestAnimationFrame', 'cancelAnimationFrame',
  'Symbol', 'Proxy', 'Reflect', 'BigInt',
])

/**
 * Classify each local constant and local function according to the
 * tagged-union statuses above. Pure function: no IR mutation.
 *
 * Two-stage classification:
 *
 *  1. **Graph-level eligibility**: the legacy "all free refs are
 *     either JS_BUILTINS or names declared in this component" check.
 *     Constants that depend transitively on locals stay candidates;
 *     downstream chain resolution substitutes them later.
 *
 *  2. **Stage-level safety** via `isInlinableInTemplate`: rejects
 *     values that — even after lift to `_p.X` — would leak unsafe
 *     evaluation semantics into template scope. Specifically catches
 *     calls to module-imports whose arguments depend on props
 *     (`useYjs(_p.X)`) — duplicating these into the template lambda
 *     runs the helper with the wrong identity on every render and
 *     drops the import entirely (#1138). `useContext(SomeContext)`
 *     (no bridged args) stays safe and preserves #1100.
 */
export function computeInlinability(
  ctx: ClientJsContext,
  graph: ReferencesGraph,
  irRoot: IRNode,
): InlinabilityAnalysis {
  const constants = new Map<string, ConstantInlinability>()
  const functions = new Map<string, FunctionInlinability>()

  // --- Functions ---
  for (const fn of ctx.localFunctions) {
    functions.set(fn.name, fn.isModule && !functionReferencesDeclaredName(graph, fn.name)
      ? { kind: 'module-scope-safe' }
      : { kind: 'references-component-scope' })
  }

  // --- Constants (initial classification) ---
  const signalGetters = new Set(ctx.signals.map(s => s.getter))
  const signalSetters = new Set(ctx.signals.filter(s => s.setter).map(s => s.setter!))
  const memoNames = new Set(ctx.memos.map(m => m.name))

  // RelocateEnv is built once per component from the live ClientJsContext.
  // The adapter capabilities (`templatePrimitives` / `acceptsTemplateCall`)
  // flow through so a registered call escapes the bridged-arg / zero-arg
  // rejections during classification.
  const env = buildEnvFromCtx(ctx)

  const decisionsByName = new Map<string, RelocateDecision[]>()
  for (const c of ctx.localConstants) {
    const { status, decisions } = classifyConstantInitial(
      c,
      graph.declaredNames,
      signalGetters,
      signalSetters,
      memoNames,
      env,
    )
    constants.set(c.name, status)
    decisionsByName.set(c.name, decisions)
  }

  const templateRiskyNames = collectTemplateRiskyNames(irRoot)

  // Populate `ctx.csrInlinable` for every constant via AST substitution
  // (#1277). This bakes the CSR-form (with signals, memos, and chained
  // const refs expanded) into a CSR-internal side map on the context so
  // the template emitter can read it directly with no further string
  // transformation. The map lives on `ClientJsContext` — not on the
  // cross-adapter `ConstantInfo` IR — so SSR adapters don't see CSR
  // substitution semantics they have no use for.
  populateCsrInlinable(ctx, env)

  return { constants, functions, decisionsByName, templateRiskyNames }
}

/**
 * Compute the CSR-substituted form for every `ctx.localConstants` entry
 * via AST substitution. Constants form a DAG by name reference; we
 * iterate to a fixed point so chained inlines (`const A = B; const B = ...`)
 * close transitively. Each round substitutes only the consts already
 * finalised in a previous round.
 *
 * Results land in `ctx.csrInlinable` (a CSR-internal Map on the client
 * context), NOT on `ConstantInfo` — the substitution semantics are
 * specific to the CSR client-JS adapter, so leaking them into the
 * cross-adapter IR would violate the open-closed principle (#1277).
 *
 * A const ends with `ctx.csrInlinable.get(name) === null` when:
 *   - it has no `value` (placeholder-let)
 *   - the value contains an arrow / function expression (identity per render)
 *   - it's a system construct (`createContext`, `new WeakMap`)
 *   - it's a JSX literal (handled by jsx-inline routing)
 *   - the substituted form fails `isInlinableInTemplate` (would re-execute
 *     a non-pure call at template-eval time — #1138)
 */
function populateCsrInlinable(ctx: ClientJsContext, relocateEnv: RelocateEnv): void {
  if (ctx.localConstants.length === 0) return

  // Base env: signal getters + memo calls in raw (props.X) form. We
  // keep the substitution map raw so the post-substitution
  // `isInlinableInTemplate` check sees bridged prop references (the
  // form `useYjs(props.X)`) and rejects them via
  // `hasCallWithBridgedArg` (#1138). The final `_p.X` rewrite happens
  // when the template emitter calls `csrSubstitute` on the IR text —
  // by then it's safe because we already know the form is inline-safe.
  const baseEnv = buildSignalMemoEnv(ctx.signals, ctx.memos, ctx.propsObjectName)
  const constSubs = new Map<string, CsrSubstitution>()
  const finalised = new Set<string>()

  const buildEnvWithConsts = (): CsrEnv => ({
    substitutions: new Map([...baseEnv.substitutions, ...constSubs]),
    propsObjectName: baseEnv.propsObjectName,
  })

  // Pre-mark consts that are structurally ineligible — they record
  // `null` in `ctx.csrInlinable`. Mirrors `classifyConstantInitial`
  // for the kinds that have no value to substitute.
  for (const c of ctx.localConstants) {
    if (c.isJsx || !c.value || c.containsArrow || c.systemConstructKind) {
      ctx.csrInlinable.set(c.name, null)
      finalised.add(c.name)
    }
  }

  // Fixed-point loop: each iteration resolves any const whose
  // substitution succeeds. Bounded by `localConstants.length + 1` —
  // longest possible chain.
  //
  // The env (constSubs merged into baseEnv) is rebuilt for EACH const
  // inside the iter, not once per iter. When two consts in the same
  // source order chain (`const a = props.x; const b = a.y < 1`), the
  // dependent (`b`) must observe `a`'s substitution before its own
  // `csrSubstitute` runs — otherwise `a` stays a bare identifier in
  // `b`'s value, the post-substitution `isInlinableInTemplate` re-runs
  // relocate on the un-substituted text and falls `a` back to
  // `undefined` (init-local without inlinable form), and `b`'s
  // `csrInlinable` entry freezes that fallback into `(undefined < 1)`.
  // The user-visible defect is BF061-shape templates emitting
  // `(undefined < N)` for `if`-statement conditions built from chained
  // init-locals (#1404). Rebuilding env inside the loop costs an extra
  // Map merge per const but keeps the substitution table monotonic
  // within an iter.
  const maxIter = ctx.localConstants.length + 1
  for (let iter = 0; iter < maxIter; iter++) {
    let progressed = false
    for (const c of ctx.localConstants) {
      if (finalised.has(c.name)) continue
      const env = buildEnvWithConsts()
      // Use raw `value` (not `templateValue`) so the relocate gate
      // sees `props.X` and can detect bridged-arg calls. The final
      // emit-time substitution applies the bare-prop rewrite.
      const source = c.value!.trim()
      const { rewritten, freeIdentifiers } = csrSubstitute(source, env)

      // If the rewrite still references any unresolved local constant
      // by name, defer to a later iteration — its substitution may
      // become available then.
      let pendingDependency = false
      for (const id of freeIdentifiers) {
        if (id === c.name) continue // self-reference: not deferrable
        const dep = ctx.localConstants.find(o => o.name === id)
        if (dep && !finalised.has(dep.name)) {
          pendingDependency = true
          break
        }
      }
      if (pendingDependency) continue

      // Final stage-safety check on the substituted form. The relocate
      // gate catches the case where the post-substitution value still
      // calls a non-pure helper with bridged args (#1138) — those must
      // stay out of the template lambda. The relocate output
      // (`rewrittenValue`) is the bridged form (bare destructured prop
      // refs lifted to `_p.X`); we store that so the emit-time
      // `applyPropsRewrite` doesn't need to redo the AST work. The
      // free identifiers are re-extracted from the bridged form so
      // the post-substitution unsafe-name check stays exact.
      const inlineResult = isInlinableInTemplate(rewritten, relocateEnv)
      if (!inlineResult.ok) {
        ctx.csrInlinable.set(c.name, null)
      } else {
        const bridgedRewritten = inlineResult.rewrittenValue
        const bridgedFreeIdentifiers = recomputeFreeIdentifiers(bridgedRewritten, freeIdentifiers)
        ctx.csrInlinable.set(c.name, { rewrittenValue: bridgedRewritten, freeIdentifiers: bridgedFreeIdentifiers })
        constSubs.set(c.name, {
          kind: 'identifier',
          replacement: bridgedRewritten,
          freeIdentifiers: bridgedFreeIdentifiers,
        })
      }
      finalised.add(c.name)
      progressed = true
    }
    if (!progressed) break
  }

  // Any consts left unfinalised are part of an unresolvable cycle — mark
  // them null so the map is total. In practice this is unreachable
  // (a cycle in const-on-const refs would be a TDZ violation in source).
  for (const c of ctx.localConstants) {
    if (!finalised.has(c.name)) ctx.csrInlinable.set(c.name, null)
  }
}

/**
 * Recompute free identifiers after `relocate` has rewritten bare prop
 * refs to `_p.X`. The pre-rewrite free-id set may still mention the
 * destructured prop names (which are now property tails under `_p`)
 * or the source-level props object name; both stop being free
 * identifiers in the bridged form. We re-parse the bridged text via
 * `csrSubstitute` with an empty env to recover the post-rewrite set.
 */
function recomputeFreeIdentifiers(bridged: string, fallback: ReadonlySet<string>): ReadonlySet<string> {
  const probe = csrSubstitute(bridged, { substitutions: new Map(), propsObjectName: null })
  if (probe.rewritten === bridged) return probe.freeIdentifiers
  return fallback
}

/**
 * Walk the IR collecting every identifier that appears in a position
 * where the relocate fallback (`UNSAFE_TEMPLATE_EXPR = 'undefined'`)
 * would produce a user-visible SSR defect — a missing attribute, a
 * permanent empty text node, or a wrong conditional branch. Mirrors
 * the per-node-kind branches in `html-template.ts`: positions that
 * route through a slot, drop the prop, or substitute a recoverable
 * empty literal (`[]`, `''` inside `<!--bf:s1-->`) are intentionally
 * excluded, so BF060/BF061 doesn't fire on already-handled shapes.
 */
function collectTemplateRiskyNames(irRoot: IRNode): Set<string> {
  const risky = new Set<string>()

  // Mirror the emitter's input source for each template position
  // (`transformExpr` in html-template.ts uses `templateExpr ?? expr`).
  // The `template*` rewrites — bare prop refs to `_p.X`, plus
  // `IRTemplateLiteral` parts' `templateValue`/`templateCondition`/
  // `templateKey` — are what `transformExpr` actually substitutes
  // through, so the diagnostic gate needs to look at the same string.
  // Reading the raw form would drift from emission and could miss /
  // spuriously add identifiers (e.g. a name that's only present
  // post-rewrite, or a destructured-prop name that's been rewritten
  // away).
  const addExprIdents = (text: string): void => {
    if (text.startsWith('`') && text.endsWith('`')) {
      // Backtick-quoted template literal — only `${...}` substitutions
      // are real identifier references. The static segments carry CSS
      // / class words that would false-positive a same-named const.
      extractTemplateIdentifiers(text, risky)
    } else {
      extractIdentifiers(text, risky)
    }
  }

  const visitor: IRVisitor<null> = {
    element: ({ node: el, descend }) => {
      // Element attribute values are substituted into `templateAttrExpr`,
      // whose generic path emits `${val != null ? \`attr="\${val}"\` : ''}`
      // — when `val` resolves to `undefined`, the attribute is dropped
      // from the SSR HTML entirely (boolean / style attrs share this
      // fallback; `data-key*` is the one carve-out that does keep
      // a literal "undefined", but loop arrays already fall back to
      // `[]` so loop items don't render in that case anyway).
      // Either way, the SSR shape doesn't match the intended output:
      // hydrate adds the attribute, producing a flash, and any code
      // that reads the attribute pre-hydrate sees nothing. Real bug.
      for (const attr of el.attrs) {
        // `/* @client */` attrs are stripped from the SSR template
        // (see html-template.ts) and applied by init's `createEffect`,
        // so their identifiers never reach a risky template
        // position. Same carve-out the build-references walker uses.
        if (attr.clientOnly) continue
        // Literal / boolean / jsx-children variants carry no template-time
        // identifiers worth probing.
        if (attr.value.kind !== 'expression' && attr.value.kind !== 'template' && attr.value.kind !== 'spread') continue
        const text = attrValueToString(attr.value, { useTemplate: true }) ?? ''
        if (text) addExprIdents(text)
      }
      // Event handlers run in init-body context, not template. Skip.
      descend()
    },
    component: ({ descend, descendJsxChildren }) => {
      // Component props are stripped from `renderChild` when
      // `transformExpr` returns UNSAFE_TEMPLATE_EXPR (see
      // html-template.ts). `initChild`'s getter binding then fills
      // the prop once init runs. No diagnostic needed.
      descend()
      descendJsxChildren()
    },
    expression: ({ node: ex }) => {
      if (ex.clientOnly) return
      // Slotted expressions emit `<!--bf:s1-->${''}<!--/-->` on
      // UNSAFE — hydrate's reactive binding fills the slot. Safe.
      if (ex.slotId) return
      // Slotless `${expr}` substitution. The CSR emit path
      // substitutes `''` for UNSAFE so no literal "undefined" leaks,
      // but there's no slot for hydrate to update either — the text
      // stays empty for the lifetime of the component. Permanent
      // visible defect.
      addExprIdents(ex.templateExpr ?? ex.expr)
    },
    conditional: ({ node: c, descend }) => {
      // `${cond} ? a : b` — UNSAFE evaluates as undefined (falsey),
      // so the wrong branch renders at SSR. Hydrate corrects, but
      // SSR HTML is silently wrong.
      //
      // `/* @client */` opts the condition (and its branches) out of
      // SSR entirely — the template emits a `<!--bf-c-->` marker and
      // `insert()` swaps in the branch at hydrate. Identifiers
      // referenced only from here therefore never reach a risky
      // template position, so they shouldn't trigger BF060/BF061.
      // Same carve-out the `expression` visitor uses for slotted
      // `/* @client */` reads.
      if (c.clientOnly) return
      addExprIdents(c.templateCondition ?? c.condition)
      descend()
    },
    ifStatement: ({ node: i, descend }) => {
      // `IRIfStatement` has no `clientOnly` field today — `/* @client */`
      // never reaches this IR node from `jsx-to-ir.ts`, so there's
      // nothing to carve out here yet. When `if`-statement support
      // gains a clientOnly path, add the same `if (i.clientOnly) return`
      // the `conditional` / `loop` visitors above use.
      addExprIdents(i.templateCondition ?? i.condition)
      descend()
    },
    loop: ({ node: l, descend }) => {
      // `safeArrayExpr` substitutes `[]` on UNSAFE — SSR has zero
      // items, hydrate reconciles to N. Hydration mismatch in DOM
      // shape, worth surfacing. `/* @client */` loops emit no SSR
      // items either, but the directive's contract says hydrate
      // owns the visible state — so the identifier check is moot.
      if (l.clientOnly) return
      addExprIdents(l.templateArray ?? l.array)
      descend()
    },
    provider: ({ descend }) => {
      // Provider valueProp is component-prop-shaped (passed via
      // initChild-style binding). Same safe fallback. Skip.
      descend()
    },
  }

  walkIR(irRoot, null, visitor)
  return risky
}

/**
 * Emit errors for stage-violation decisions surfaced during inline
 * classification. Only called by `toLegacyInlinability` for consts
 * the `templateRiskyNames` gate has already classified as
 * actually-broken — so by the time this runs, the SSR output is
 * known to be wrong (missing attribute, permanently empty text,
 * wrong conditional branch, or zero-item loop). Hydrate may or may
 * not recover depending on the position; either way the SSR
 * artefact is visible to the user (or to crawlers / cached HTML
 * consumers).
 *
 *  - BF060: signal/memo getter referenced from template scope. The
 *    template lambda has no reactive context, so relocate
 *    falls back at the offending site.
 *  - BF061: init-scope local referenced from template scope. Same
 *    fallback shape, different binding kind.
 *
 * BF062 (cross-stage await) is emitted at the Phase 1 dispatcher
 * (jsx-to-ir.ts) for both child and attribute positions; not here.
 *
 * Promoted from warning to error in #1187 phase 6 — the
 * `templateRiskyNames` gate in `toLegacyInlinability` ensures only
 * actually-broken positions reach this function, so a hard error
 * here is no longer a false-positive risk for code that uses safe
 * shapes (form-field accessors, slotted reactive children, etc.).
 */
export function recordStageDiagnostics(
  c: ConstantInfo,
  decisions: RelocateDecision[],
  errors: ReturnType<typeof createError>[],
): void {
  // De-dup per-name so a value with multiple references to the same
  // unsafe binding emits one diagnostic, not many.
  const seen = new Set<string>()
  for (const d of decisions) {
    if (seen.has(d.name)) continue
    seen.add(d.name)
    if (d.kind === 'signal-getter' || d.kind === 'signal-setter' || d.kind === 'memo-getter') {
      errors.push(createError(ErrorCodes.STAGE_REACTIVE_IN_TEMPLATE, c.loc, {
        message: `Reactive binding '${d.name}' referenced from template scope (via const '${c.name}'). The template lambda runs at module scope and cannot reach reactive bindings; the value falls back at SSR (missing attribute / empty text / wrong branch depending on the JSX position) and stays that way unless hydrate happens to re-render the position. Wrap the JSX expression in /* @client */ to defer evaluation, or restructure so the template uses a prop or static value.`,
      }))
    } else if (d.kind === 'init-local' || d.kind === 'sub-init-local') {
      errors.push(createError(ErrorCodes.STAGE_INIT_LOCAL_IN_TEMPLATE, c.loc, {
        message: `Init-scope local '${d.name}' referenced from template scope (via const '${c.name}'). The template lambda runs at module scope and cannot reach init-body locals; the value falls back at SSR (missing attribute / empty text / wrong branch depending on the JSX position) and stays that way unless hydrate happens to re-render the position. Wrap the JSX expression in /* @client */ to defer evaluation, or lift the value to a prop or module-scope const.`,
      }))
    }
  }
}

function classifyConstantInitial(
  c: ConstantInfo,
  declaredNames: Set<string>,
  signalGetters: Set<string>,
  signalSetters: Set<string>,
  memoNames: Set<string>,
  env: RelocateEnv,
): { status: ConstantInlinability; decisions: RelocateDecision[] } {
  if (c.isJsx) return { status: { kind: 'jsx-inline' }, decisions: [] }
  if (!c.value) return { status: { kind: 'placeholder-let' }, decisions: [] }
  if (c.containsArrow) return { status: { kind: 'arrow-literal' }, decisions: [] }
  if (c.systemConstructKind) return { status: { kind: 'system-construct' }, decisions: [] }

  const freeIds = c.freeIdentifiers
  if (freeIds) {
    for (const id of freeIds) {
      if (signalGetters.has(id) || signalSetters.has(id) || memoNames.has(id)) {
        return { status: { kind: 'reactive-read' }, decisions: [] }
      }
    }
    // Stage-1 graph eligibility — legacy gate. Kept because chain
    // resolution downstream may turn a transitively-local-dependent
    // const into a fully resolved expression. Removing this gate
    // would over-reject the chained-inlining test (#366).
    for (const id of freeIds) {
      if (JS_BUILTINS.has(id) || declaredNames.has(id)) continue
      return { status: { kind: 'external-name' }, decisions: [] }
    }
  }

  // Stage-2 stage-safety: even if the graph thinks it's eligible, the
  // value may still be unsafe to duplicate into template scope when
  // the form involves a call to a non-pure helper with prop-bridged
  // args. relocate's `isInlinableInTemplate` is the canonical check;
  // the legacy regex-based gates (`hasBareProps`, `\b\w+\(\)`)
  // distributed across emit-registration are the failure mode #1138
  // was filed against.
  //
  // The check uses relocate's `ok` flag only — the inline value
  // emitted is the analyzer-supplied templateValue or raw value, so
  // chain-resolution downstream can still substitute through the
  // const dependency graph (#366). Using `rewrittenValue` here would
  // freeze init-local refs into `undefined` fallbacks before the
  // chain resolver gets a chance to replace them.
  //
  // `decisions` is returned alongside so the caller can surface the
  // staged-IR diagnostics (BF060/BF061) the relocate pass observed —
  // including the `ok: true` cases where a fallback rewrite happened
  // but didn't disqualify inlining.
  const { ok, decisions } = isInlinableInTemplate(c.value, env)
  if (!ok) return { status: { kind: 'external-name' }, decisions }

  return {
    status: {
      kind: 'inlinable',
      value: c.templateValue?.trim() ?? c.value.trim(),
    },
    decisions,
  }
}

function functionReferencesDeclaredName(graph: ReferencesGraph, fnName: string): boolean {
  const refs = graphFunctionReferences(graph, fnName)
  for (const r of refs) {
    if (graph.declaredNames.has(r)) return true
  }
  return false
}

/**
 * Convert the tagged-union analysis back into the legacy shape the
 * rest of the template pipeline expects: a map of inlinable constants
 * keyed by name, plus a Set of names the template must fall back to
 * runtime for. Chained-ref resolution runs here too — a constant whose
 * final resolved value still mentions an unsafe name is downgraded to
 * `depends-on-unsafe`.
 *
 * Any callsite that needs the structured statuses can read
 * `analysis.constants` / `analysis.functions` directly — the adapter
 * below is purely for byte-identical compat with the pre-Stage E.4
 * consumers.
 */
export function toLegacyInlinability(
  analysis: InlinabilityAnalysis,
  resolveChained: (constants: Map<string, string>, freeIdsMap: Map<string, Set<string>>) => void,
  ctx: ClientJsContext,
): {
  inlinableConstants: Map<string, string>
  unsafeLocalNames: Set<string>
} {
  const inlinableConstants = new Map<string, string>()
  const unsafeLocalNames = new Set<string>()

  for (const [name, status] of analysis.constants) {
    if (status.kind === 'inlinable') {
      inlinableConstants.set(name, status.value)
    } else if (status.kind === 'jsx-inline' || status.kind === 'system-construct') {
      // Not inlinable AND not unsafe — they have their own routing.
    } else {
      unsafeLocalNames.add(name)
    }
  }
  for (const [name, status] of analysis.functions) {
    if (status.kind === 'references-component-scope') unsafeLocalNames.add(name)
  }

  // Defensive copies — `resolveChained` mutates these to maintain a
  // transitively-closed view (#1267). The original `ConstantInfo.freeIdentifiers`
  // must stay intact for other consumers.
  const freeIdsMap = new Map<string, Set<string>>()
  for (const c of ctx.localConstants) {
    if (c.freeIdentifiers) freeIdsMap.set(c.name, new Set(c.freeIdentifiers))
  }
  resolveChained(inlinableConstants, freeIdsMap)

  // Demote constants whose value still references an unsafe name.
  // After `resolveChained`, `freeIdsMap.get(name)` is transitively closed,
  // so a single `has(unsafeName)` check is exact — no need to scan the
  // resolved string for identifiers that were inlined from other constants.
  const toRemove: string[] = []
  for (const constName of inlinableConstants.keys()) {
    const constFreeIds = freeIdsMap.get(constName)
    let isUnsafe = false
    if (constFreeIds) {
      for (const unsafeName of unsafeLocalNames) {
        if (constFreeIds.has(unsafeName)) { isUnsafe = true; break }
      }
    }
    if (isUnsafe) {
      toRemove.push(constName)
      analysis.constants.set(constName, { kind: 'depends-on-unsafe' })
    }
  }
  for (const name of toRemove) {
    inlinableConstants.delete(name)
    unsafeLocalNames.add(name)
  }

  // Surface BF060/BF061 for constants that ended up unsafe AFTER chain
  // resolution AND are actually referenced from a template position
  // where the relocate fallback would produce a user-visible defect
  // (`templateRiskyNames`). Two layers of false-positive avoidance:
  //   1. post-chain check — chains that resolve to safe prop-based
  //      expressions don't fire.
  //   2. risky-position check — consts referenced only from safe
  //      fallback positions (component props that get stripped,
  //      slotted JSX expressions, `/* @client */` wrappers) don't fire.
  //      The pipeline already recovers at hydrate without a visible
  //      artefact, so the diagnostic would be misleading.
  //
  // `recordStageDiagnostics` further filters decisions by kind, so it's
  // a no-op for constants whose unsafety came from non-stage causes
  // (arrow-literal, system-construct, function references etc.).
  const constsByName = new Map(ctx.localConstants.map(c => [c.name, c]))
  for (const name of unsafeLocalNames) {
    if (!analysis.templateRiskyNames.has(name)) continue
    const c = constsByName.get(name)
    const decisions = analysis.decisionsByName.get(name)
    if (c && decisions && decisions.length > 0) {
      recordStageDiagnostics(c, decisions, ctx.warnings)
    }
  }

  return { inlinableConstants, unsafeLocalNames }
}
