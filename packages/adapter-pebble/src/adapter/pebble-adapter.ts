/**
 * BarefootJS Pebble Template Adapter (#2101) — Phase 2, adapter core.
 *
 * Generates Pebble template files (.peb) from BarefootJS IR, targeting the
 * JVM (Spring Boot, Ktor, plain Servlet apps) via the
 * [Pebble](https://pebbletemplates.io/) templating engine.
 *
 * Near-mechanical port of the Jinja2 adapter
 * (packages/adapter-jinja/src/adapter/jinja-adapter.ts) — itself a
 * near-mechanical port of the Text::Xslate (Kolon) adapter — to Pebble
 * syntax, PRIMARILY comparing against the Twig adapter
 * (packages/adapter-twig/src/adapter/twig-adapter.ts) wherever Pebble's own
 * confirmed grammar answers a syntax question the same way Twig does rather
 * than Jinja — which, in practice, is most of them: Pebble is explicitly a
 * Twig-inspired engine (its own docs describe it that way), and nearly every
 * operator/tag spelling this port had to pin down landed on Twig's answer,
 * not Jinja's Python-flavored one. Every point below where this port
 * deliberately took Twig's answer over Jinja's is marked **(follows Twig)**;
 * every point that is genuinely Pebble-specific (matching NEITHER sibling)
 * is marked **(Pebble-specific)**.
 *
 * The Java runtime this adapter's output assumes does not exist yet (that is
 * Phase 3, a separate follow-up PR per the #2101 stack) — so nothing below
 * has been executed against a real Pebble engine. Every syntax claim is
 * either (a) independently confirmed against Pebble's own documentation and
 * GitHub issue tracker during this port, or (b) explicitly flagged as an
 * ASSUMPTION / Phase 3-4 watchpoint. This file's job is the TEMPLATE
 * EMISSION shape (the `.peb` text and the `bf.*` calls it contains)
 * structurally matching the sibling DSL adapters' call shape — not proof
 * the output runs, which Phase 3/4 provide.
 *
 * ## Confirmed Pebble syntax table
 *
 *   Jinja/Twig `{{ EXPR }}`                → Pebble `{{ EXPR }}`                 (same; HTML-escaped, confirmed)
 *   Jinja `{{ EXPR | safe }}` / Twig `| raw` → Pebble `{{ EXPR | raw }}`          (confirmed: Pebble's filter list includes `raw`)
 *   `bf.method(args)`                       → Pebble `bf.method(args)`           (same dot-method convention; Pebble resolves `foo.bar(...)` as a method call directly, same as Twig/Jinja)
 *   Jinja `{% if C %}A{% elif D %}B{% else %}E{% endif %}` → Pebble `{% if C %}A{% elseif D %}B{% else %}E{% endif %}` **(follows Twig)** — confirmed via Pebble's own `if` tag docs, which use `elseif` (Twig's spelling), never Jinja's `elif`.
 *   Jinja `{% for item in arr %}…{% endfor %}` → Pebble (same; confirmed)
 *   Jinja `{% for k, v in map.items() %}` / Twig `{% for k, v in map %}` → Pebble has NO two-variable `for` form at all **(Pebble-specific — REFUTED during Phase 3 research, was previously listed as "follows Twig")** — `ForTokenParser.parse()` calls `parseNewVariableName()` exactly ONCE for the loop variable; `{% for k, v in map %}` fails to parse (`expect "in"` after the first name). Pebble's own documented single-variable map-iteration form binds the loop variable to a `Map.Entry` (`{{ entry.key }}`/`{{ entry.value }}`) — a third shape, neither Jinja's nor Twig's. Zero code impact: see divergence 8 below, which already avoids depending on any native map-iteration shape.
 *   Jinja `loop.index0` (0-based) / Twig `loop.index0` (0-based), `loop.index` (1-based) → Pebble `loop.index` is ITSELF 0-based **(Pebble-specific — matches NEITHER sibling's naming)**. Confirmed via search: Pebble's for-loop `loop` variable documents `loop.index` as "a zero-based index that increments with every iteration" — there is no `loop.index0` in Pebble at all. Every `loop.index0` reference in the Jinja/Twig ports becomes plain `loop.index` here. `loop.first`/`loop.last`/`loop.length`/`loop.revindex` are confirmed present too.
 *   Jinja `{'k': v}` dict literal / Twig `{'k': v}` hash literal → Pebble `{'k': v}` map literal (ALWAYS quoted key — see `lib/pebble-naming.ts`; confirmed via a GitHub issue showing `{'test': 'test1', ...}` passed as a Pebble map literal)
 *   Jinja `~` concat / Twig `~` concat → Pebble `~` concat **(ASSUMPTION — not independently confirmed; Pebble's own arithmetic `+` behavior on non-numeric operands is likewise unconfirmed, so this adapter defensively assumes `~` exists and routes every string-typed `+` operand through it, exactly like Twig does for PHP's numeric-only `+`. Phase 3/4 watchpoint.)**
 *   Jinja `(a if t else b)` ternary / Twig `(t ? a : b)` → Pebble `(t ? a : b)` **(follows Twig)** — confirmed: Pebble's own docs example a ternary as `{{ foo == null ? bar : baz }}`, the symbolic C-style form, never Jinja's word-based one.
 *   Jinja `(l if (l is defined and l is not none) else r)` (`??`) / Twig `(l ?? r)` → Pebble `bf.coalesce(l, r)` **(Pebble-specific — REFUTED during Phase 3 research, was previously listed as "follows Twig")** — Pebble has NO `??` operator at all: `{{ a ?? b }}` is a template PARSE ERROR on real Pebble, not a subtly-wrong runtime value, confirmed via Pebble's own source and a live `ParserException`. Routed through the Java runtime's `bf.coalesce(l, r)` helper instead — see divergence 3.
 *   Jinja `==`/`!=` (native, for `===`/`!==`) / Twig `bf.eq`/`bf.neq` → Pebble `bf.eq`/`bf.neq` **(follows Twig)** — Pebble's own `==` / `is same as` cross-type-numeric behavior is UNCONFIRMED (no Java runtime to check `1 == 1.0`-shaped cases against), so this adapter takes Twig's defensive stance rather than Jinja's "the native operator already matches JS" one. See divergence 4.
 *   Jinja macro children capture / Twig `{% set NAME %}…{% endset %}` set-block → Pebble `{% set NAME %}…{% endset %}` **(Pebble-specific — a REQUIRED custom extension, not stock syntax)** — see divergence 6, the most consequential Pebble-specific finding of this port: stock Pebble's `set` tag is expression-only (`{% set x = expr %}`), with NO block-capture form; a 2018 upstream issue requesting exactly this feature shows it was not part of Pebble's design. This adapter emits the Jinja/Twig-shaped syntax anyway, as a DELIBERATE, documented requirement that the Phase 3 Java runtime register a custom `TokenParser` extension implementing it (Pebble's Java `Extension` API is confirmed to support custom tags) — not a claim that stock Pebble already has this tag.
 *
 * ## Numbered divergences (uniform, not per-fixture)
 *
 *   1. **JS truthiness** (`@barefootjs/jsx`'s `adapters/boolean-result.ts`, `expr/emitters.ts`'s
 *      `truthyTest`, this file's `convertConditionToPebble`) — same shape as
 *      Jinja/Twig: Pebble's `{% if %}` truthiness follows the same
 *      empty-container/empty-string-is-falsy convention as Python/PHP,
 *      diverging from JS (`[]`/`{}` are JS-truthy). Perl doesn't have this
 *      problem, which is why Xslate never needed a truthy-routing layer.
 *      Every condition-TEST position routes through `bf.truthy(...)` unless
 *      structurally already boolean-shaped. **(ASSUMPTION — Pebble's exact
 *      truthiness for empty collections/strings is a Phase 3/4 verification
 *      point; this routing is conservatively applied regardless, since
 *      wrapping a genuinely-boolean value in `bf.truthy` is a no-op.)**
 *   2. **Stringification** (`bf.string`, applied at every text/attribute
 *      interpolation position) — same shape as Jinja/Twig: Java's own
 *      `String.valueOf`/`Object.toString()` diverges from JS `String(x)`
 *      (float formatting, `null`, collection `toString()` shapes all
 *      differ), and Pebble's `~` concatenation operator very likely calls
 *      Java's own string coercion internally the same way Jinja's/Twig's do
 *      — so EVERY text/attribute-position value (not already
 *      boolean-routed) is routed through `bf.string(...)` before it reaches
 *      Pebble's own escaping/concat machinery, exactly like the Jinja/Twig
 *      ports.
 *   3. **`??` is NOT Pebble-native — REFUTED during Phase 3 research.**
 *      Confirmed via Pebble's own source, its Twig-compatibility table, and
 *      a live `ParserException` on `{{ a ?? b }}`: Pebble has no `??`
 *      operator at all, so the previous "follows Twig" assumption in this
 *      file's syntax table was wrong — this is a template PARSE failure,
 *      not a subtly-wrong runtime value, and would have broken every
 *      component using JS `??`. Fixed by routing through the Java runtime's
 *      `bf.coalesce(l, r)` helper (`expr/emitters.ts`'s `logical`, both
 *      implementations) instead of emitting a native operator — the same
 *      defensive pattern as divergence 4's `bf.eq`/`bf.neq` and divergence
 *      6's `bf.get`. `bf.coalesce` still needs to decide the
 *      null-vs-undefined collapse question (JS `??` catches both) fully
 *      inside the Java runtime, where it belongs — no template-side
 *      strict-variables assumption required anymore.
 *   4. **`===`/`!==` route through `bf.eq`/`bf.neq`, never a native Pebble
 *      equality operator** (follows Twig, not Jinja — see the syntax table
 *      above). `bf.eq`/`bf.neq` is the ONE shared JS-strict-equality
 *      implementation (mirrored by every sibling adapter's Evaluator), used
 *      unconditionally rather than trusting an unverified native operator's
 *      cross-type-numeric behavior.
 *   5. **No Pebble lambda for the predicate-callback fallback**
 *      (`expr/emitters.ts` header, divergence 5 there). Same as Jinja/Twig:
 *      this adapter uses ONE mechanism for every higher-order callback (the
 *      evaluator-JSON `*_eval` payload); an unserializable predicate
 *      surfaces `BF101`. `.sort`'s non-lambda STRUCTURED fallback (`bf.sort`
 *      with a `{keys: […]}` descriptor) is unaffected and ports unchanged.
 *   6. **Children/named-slot/async-fallback capture via `{% set %}...{%
 *      endset %}`, REQUIRING A CUSTOM PEBBLE EXTENSION** (Pebble-specific —
 *      the single most important finding of this port). Every set-block
 *      capture site this adapter ports from Jinja/Twig (`renderComponent`'s
 *      children/named-slot forward, `renderAsync`'s fallback) is invoked
 *      immediately, in place, with zero arguments — never reused elsewhere
 *      or invoked lazily with different arguments, exactly like the
 *      Jinja/Twig ports. Jinja's and Twig's `{% set NAME %}…{% endset %}`
 *      set-block is CONFIRMED, native syntax on those engines. Pebble's is
 *      NOT: stock Pebble's `set` tag is expression-only (`{% set x = expr
 *      %}`); a 2018 upstream GitHub issue explicitly requesting Twig's
 *      block-capture `set` form for Pebble shows this was never part of the
 *      design. Rather than invent a DIFFERENT capture mechanism that Phase 3
 *      would then have to reconcile with the sibling adapters' call shape
 *      (macros don't solve this either — a Pebble macro's body is authored
 *      once at DEFINITION time, not supplied per-call the way a `{% call
 *      %}`/set-block captures arbitrary caller-side markup), this adapter
 *      emits the Jinja/Twig-shaped `{% set NAME %}...{% endset %}` syntax
 *      AS A DELIBERATE REQUIREMENT: the Phase 3 Java runtime registers a
 *      custom `TokenParser` (+ matching AST node) implementing exactly this
 *      tag via Pebble's own `Extension` API (confirmed to support custom
 *      tags/filters/functions/tests — this is a first-class, documented
 *      Pebble extension point, not a hack). This keeps every sibling
 *      adapter's call shape identical at the TS layer (satisfying this PR's
 *      "structurally correct, matching the same call shape" charter).
 *      **Landed in Phase 3b**: `packages/adapter-pebble/java/src/main/java/
 *      dev/barefootjs/pebble/ext/` (`SetBlockExtension`/
 *      `SetBlockTokenParser`/`SetBlockNode`) — see that package's README
 *      for the design and the decompiled-bytecode research backing it.
 *   7. **Reserved-word identifier mangling** (`lib/pebble-naming.ts`). Every
 *      bare Pebble variable reference / `{% set %}` target is passed through
 *      `pebbleIdent()`; the Java runtime must apply the IDENTICAL mangling
 *      when it builds the per-render `Map<String, Object>` context (so a
 *      prop literally named e.g. `class` is threaded through as context key
 *      `'class_'` on both sides). Unlike the Jinja/Twig ports (which mangle
 *      only their OWN language's reserved words), this adapter mangles BOTH
 *      Pebble's own confirmed grammar keywords AND the full Java keyword
 *      list — see `lib/pebble-naming.ts`'s file header for why the Java
 *      list matters even though Pebble's own template grammar wouldn't
 *      reject those names (the JavaBean-introspection `getClass()`-as-
 *      property-`class` hazard on the `Map<String, Object>` context is a
 *      genuine, if narrow, risk this mangling defends against). Map-LITERAL
 *      keys are a separate, unconditional concern — see `pebbleHashKey`'s
 *      docstring for why they are always quoted.
 *   8. **Object-entries/keys/values iteration routes through `bf.entries`/
 *      `bf.keys`/`bf.values`, not any native Pebble `for` map-iteration
 *      form** (follows Twig's defensive choice, not a bare assumption that
 *      Jinja's `.items()`-free native iteration transfers). Pebble's `for`
 *      tag has NO two-variable `key, value in <map>` form at all — REFUTED
 *      during Phase 3 research, see the syntax table above — and its
 *      single-variable map form binds to a `Map.Entry`, neither Jinja's nor
 *      Twig's KEYS-or-VALUES answer. This adapter's `keys`-only /
 *      `values`-only `.map()` shapes need a SPECIFIC, unambiguous one of
 *      those two either way. Routing all three shapes
 *      (`entries`/`keys`/`values`) through dedicated `bf.*` runtime helpers
 *      — which the Java runtime controls completely (Phase 3) — sidesteps
 *      the ambiguity entirely, at the cost of one extra runtime call per
 *      object-iteration loop compared to Pebble's own native form.
 *   9. **In-template signal/memo self-reference seeding is NOT skipped**
 *      (`memo/seed.ts`'s file header) — assumed, not confirmed: Pebble's
 *      `{% set x = x + 1 %}` is assumed to resolve the right-hand `x` from
 *      the enclosing scope the same way Jinja's and Twig's confirmed-
 *      identical behavior does (unlike Kolon's `my`-shadowing hazard), so a
 *      same-name prop-derived signal/memo IS seeded in-template here. Verify
 *      once the Java runtime exists — same Phase 3/4 watchpoint tier as
 *      divergence 3 and divergence 6's custom-tag requirement.
 *
 * ## Member/index access (a genuinely new decision, not drawn from either sibling)
 *
 * Neither Jinja's uniform bracket notation (`obj['key']`) nor Twig's
 * dot-vs-`attribute()` split was adopted verbatim — see `expr/emitters.ts`'s
 * file header, divergence 6, and `lib/pebble-naming.ts`'s file header for
 * the loop-binding-accessor's parallel decision: a static `.prop` access
 * (always a source-level JS identifier) uses Pebble's confirmed dot
 * accessor against the runtime's `Map<String, Object>` representation; a
 * DYNAMIC/computed index (`obj[expr]`) routes through this adapter's own
 * `bf.get(receiver, key)` helper rather than depending on an unconfirmed
 * Pebble bracket/`attribute()`-equivalent builtin.
 *
 * ## Pebble variable/null handling — the issue's own flagged spike
 *
 * Pebble ships a "strict variables" configuration (throws `AttributeNotFoundException`
 * on an undefined reference) alongside a lenient, non-strict default. This
 * adapter's entire nullish/undefined story (divergence 3 above, the
 * `nullableOptionalProps` attribute-omission guard below, `??`) assumes the
 * LENIENT config — mirroring the Jinja/Twig ports' own assumed lenient
 * environments (`undefined=ChainableUndefined`, `strict_variables: false`
 * respectively) — but this has NOT been verified against a real Pebble
 * engine, since the Java runtime doesn't exist yet. This is precisely the
 * spike the #2101 tracking issue itself calls out as needed; resolving it
 * beyond this documented assumption is explicitly OUT OF SCOPE for this PR
 * (Phase 2, adapter core) and belongs to Phase 3 (Java runtime) or Phase 4
 * (conformance loop).
 */

import type {
  ComponentIR,
  IRNode,
  IRElement,
  IRText,
  IRExpression,
  IRConditional,
  IRLoop,
  IRComponent,
  IRFragment,
  IRSlot,
  IRIfStatement,
  IRProvider,
  IRAsync,
  IRProp,
  IRTemplatePart,
  CompilerError,
  TypeInfo,
  TemplatePrimitiveRegistry,
  IRMetadata,
} from '@barefootjs/jsx'
import {
  BaseAdapter,
  type AdapterOutput,
  type AdapterGenerateOptions,
  type TemplateSections,
  type IRNodeEmitter,
  type EmitIRNode,
  type AttrValueEmitter,
  parseExpression,
  stringifyParsedExpr,
  exprToString,
  parseProviderObjectLiteral,
  planStyleObject,
  type ExpressionAttr,
  isSupported,
  isSupportedValue,
  emitParsedExpr,
  emitIRNode,
  emitAttrValue,
  augmentInheritedPropAccesses,
  parseRecordIndexAccess,
  collectModuleStringConsts,
  extractArrowBodyExpression,
  collectContextConsumers,
  isLowerableLoopDestructure,
  type ContextConsumer,
  lookupStaticRecordLiteral,
  lookupLiteralConst,
  searchParamsLocalNames,
  prepareLoweringMatchers,
  childTemplateName,
  isEmptyComponentProps,
  isBooleanTypedPropRef,
  planAttrExpression,
  planLoop,
  planSpreadAttr,
  planComponentProps,
  spellComponentProps,
  templateNameCollisionErrors,
  renameFreeIdentifiers,
  BindingScope,
  rootPropAliasNames,
  rootPropAliasesForLoop,
  rootPropReadName,
  buildImportAliasMap,
  collectNullableSignalGetters,
  attrValueMayBeNullish,
  collectNullishAttrContext,
  type NullishAttrContext,
  isAriaBooleanAttr,
  isBooleanResultExpr,
  isExplicitStringCall,
  hasClientInteractivity,
  collectImportedLoopChildComponentErrors,
  collectBooleanTypedProps,
  collectNullableOptionalProps,
  emitCallbackEval,
  arithmeticOperandCoercion,
  renderElementShell,
  renderFragmentScope,
  renderDangerousInnerHtml,
  unsupportedAttrExpressionError,
  type ElementShellSpelling,
  computedConstContext,
  inlineComputedConstAttr,
  inlineComputedConsts,
  type ComputedConstContext,
  missingFilterPredicateRefusal,
} from '@barefootjs/jsx'
import type { ParsedExpr, LoweringMatcher } from '@barefootjs/jsx'
import { isOpaqueLocalAccessorName } from '@barefootjs/jsx'
import { BF_SLOT, BF_COND, escapeHtml } from '@barefootjs/shared'

import type { PebbleRenderCtx } from './lib/types.ts'
import { PEBBLE_PRIMITIVE_EMIT_MAP } from './lib/constants.ts'
import {
  pebbleHashKey,
  pebbleIdent,
  escapePebbleSingleQuoted,
  pebbleAccessorFromSegments,
} from './lib/pebble-naming.ts'
import { renderSortMethod, EVAL_SPELLING } from './expr/array-method.ts'
import { staticValueToPebble } from './lib/static-value.ts'
import { PebbleFilterEmitter, PebbleTopLevelEmitter, truthyTest, CALLBACK_LOWERING } from './expr/emitters.ts'
import type { PebbleEmitContext, PebbleSpreadContext, PebbleMemoContext } from './emit-context.ts'
import {
  conditionalSpreadToPebble,
  objectLiteralExprToPebbleDict,
} from './spread/spread-codegen.ts'
import {
  generateContextConsumerSeed,
  generateDerivedMemoSeed,
} from './memo/seed.ts'
import { collectStringValueNames } from './props/prop-classes.ts'

export type { PebbleAdapterOptions } from './lib/types.ts'
import type { PebbleAdapterOptions } from './lib/types.ts'

export class PebbleAdapter extends BaseAdapter implements IRNodeEmitter<PebbleRenderCtx> {
  name = 'pebble'
  extension = '.peb'
  templatesPerComponent = true

  /**
   * Identifier-path callees the Pebble runtime can render in template scope.
   * The relocate pass consults this map to mark matching calls as
   * template-safe; the SSR template emitter substitutes the JS call with the
   * registered `bf.NAME(...)` helper invocation.
   */
  templatePrimitives: TemplatePrimitiveRegistry = PEBBLE_PRIMITIVE_EMIT_MAP

  private componentName: string = ''
  private options: Required<PebbleAdapterOptions>
  private errors: CompilerError[] = []
  private inLoop: boolean = false
  /** Names bound at template level (signals, memos, props, local constants):
   * a loop that binds one with `{% set %}` saves and restores it (#3386). */
  private templateLevelNames: Set<string> = new Set()
  /**
   * SolidJS-style props identifier (`function(props: P)`) and the
   * analyzer-extracted prop names. Stashed at `generate()` entry so the
   * per-attribute `emitSpread` callback can build a propsObject spread bag as
   * an inline Pebble map literal without re-walking the IR.
   */
  private propsObjectName: string | null = null
  /**
   * Name of the destructured `...rest` binding (`function X({ ...rest })`),
   * if any. A closed-type rest-expanded attribute's expression is
   * `${restPropsName}.${key}` (`expandSpreadAttribute`, #3057) — stripping
   * this prefix the same way `propsObjectName.` is stripped below lets the
   * nullable-optional-props guard recognise it as a bare optional
   * reference instead of falling through to unconditional emission.
   */
  private restPropsName: string | null = null
  private propsParams: { name: string; optional: boolean }[] = []
  private booleanTypedProps: Set<string> = new Set()
  /**
   * Names (signal getters + props + local consts) whose value is a string.
   * Consumed by `isStringConcatBinary` (via `_isStringValueName` on the
   * `PebbleEmitContext` seam) to route a JS `+` with a string-typed operand
   * through Pebble's `~` concat operator instead of an unverified numeric
   * `+` — see this file's header, divergence tied to `expr/emitters.ts`'s
   * divergence 7 (the same defensive gate Twig uses for PHP's numeric-only
   * `+`; unlike Jinja, which never needed this gate).
   */
  private stringValueNames: Set<string> = new Set()

  /**
   * Module-scope pure-string consts (`const x = 'literal'`), keyed by name →
   * unescaped value. A className template literal that references such a const
   * (`className={`${x} ${className}`}`) must inline the literal: the const is
   * module-scope, so it never reaches the per-render context, and a bare
   * reference to `x` would resolve to Undefined.
   */
  private moduleStringConsts: Map<string, string> = new Map()

  /**
   * (#1922) Local binding names the request-scoped `searchParams()` env signal
   * is imported under (handles `import { searchParams as sp }`). When non-empty
   * the emitter lowers a `<binding>().get(k)` call to a real method call on the
   * per-request `searchParams` reader (`searchParams.get('sort')`) instead of
   * the generic dot deref. Set at `generate()` entry from `ir.metadata.imports`;
   * read by the top-level ParsedExpr emitter.
   */
  private _searchParamsLocals: Set<string> = new Set()

  /**
   * Call-lowering matchers active for this component (#2057). Bound at
   * `generate()` entry via `prepareLoweringMatchers` and read by the top-level
   * emitter. Covers both userland plugins and the compiler's built-in plugins
   * (e.g. `queryHref` → `bf.query`, #2042) — one uniform path, no per-API branch.
   */
  private _loweringMatchers: LoweringMatcher[] = []
  /** The component's computed consts, inlined where a template reads them (#3494). */
  private computedConsts: ComputedConstContext | null = null

  /**
   * Local + module constants from the IR, used by the conditional-spread and
   * `Record<staticKeys, scalar>[propKey]` lowering paths (#textarea / #checkbox).
   * Stashed at `generate()` entry so `emitSpread` can resolve a bare local
   * const (`const sizeAttrs = size ? {…} : {}`) to its initializer text.
   */
  private localConstants: IRMetadata['localConstants'] = []
  /** Each prop's collision-free root alias (#3314), decided once per component. */
  private rootPropAliases: ReadonlyMap<string, string> = new Map()

  /**
   * The one canonical, position-accurate "names bound by an enclosing loop
   * callback" service (#2482 Stage 2) — see the Jinja/Twig adapters' identical
   * field docstring for the full rationale (six independent ad-hoc devices
   * collapsed onto this one shared, immutable `BindingScope`). Every
   * shadow-guard site here reads this ONE threaded, immutable scope:
   * `enterLoopRow`/pop-by-reference around `renderChildren(loop.children)`
   * in `renderLoop`.
   */
  private scope: BindingScope = BindingScope.EMPTY

  /**
   * Optional, no-default props that are `null` when the caller omits them.
   * Their bare-reference attribute emission is guarded with a Pebble
   * `!= null` test so the attribute DROPS rather than rendering `attr=""`
   * (Hono-style nullish omission, e.g. textarea's `rows`) — simpler than the
   * Jinja port's `is defined and is not none` dance, since this adapter
   * assumes a non-strict-variables config under which a missing context var
   * already normalizes to `null` (see this file's header, "Pebble
   * variable/null handling"). The filter excludes destructure-defaulted,
   * rest, and concrete-primitive props.
   */
  private nullableOptionalProps: Set<string> = new Set()
  /** Getters of nullable signals (`collectNullableSignalGetters`, #3304). */
  private nullableSignalGetters: Set<string> = new Set()
  /** Signals and memos `attrValueMayBeNullish` reads (#3322). */
  private nullishAttrCtx: NullishAttrContext = { nullableSignals: new Set(), memos: new Map() }

  /**
   * Local alias -> declared/exported name for imported components (#2822,
   * the SSR-side counterpart of #2777's client-JS registry-key fix). A
   * child referenced under an import alias (`import { Foo as Bar }`,
   * `<Bar/>`) must build its cross-template `render_child` call against
   * the child's own declared name (`Foo`, what `foo.tsx` registers its
   * Pebble partial as) — never the caller-local binding. Built once per
   * compile from `ir.metadata.imports` via the shared `buildImportAliasMap`
   * (`@barefootjs/jsx`) and read by `childTemplateName`.
   */
  private importAliases: Map<string, string> = new Map()

  constructor(options: PebbleAdapterOptions = {}) {
    super()
    this.options = {
      clientJsBasePath: options.clientJsBasePath ?? '/static/components/',
      barefootJsPath: options.barefootJsPath ?? '/static/components/barefoot.js',
    }
  }

  generate(ir: ComponentIR, options?: AdapterGenerateOptions): AdapterOutput {
    this.componentName = ir.metadata.componentName
    this.propsObjectName = ir.metadata.propsObjectName ?? null
    this.restPropsName = ir.metadata.restPropsName ?? null
    // (#checkbox) Enumerate the props-object pattern's inherited attribute
    // accesses (`props.className`/`id`/`disabled`) into propsParams via the
    // shared helper, before deriving `nullableOptionalProps` below.
    augmentInheritedPropAccesses(ir)
    this.propsParams = ir.metadata.propsParams.map(p => ({ name: p.name, optional: p.optional }))
    // Props whose declared TS type is boolean — a bare binding of one
    // (`data-active={props.isActive}`) must stringify as JS
    // `String(boolean)` ("true"/"false"), routed explicitly through
    // `bf.bool_str` (#1897, pagination's data-active — see
    // `@barefootjs/jsx`'s `adapters/boolean-result.ts`'s file header).
    this.booleanTypedProps = collectBooleanTypedProps(ir)
    this.localConstants = ir.metadata.localConstants ?? []
    this.templateLevelNames = new Set([
      ...ir.metadata.signals.map(sig => sig.getter),
      ...ir.metadata.memos.map(m => m.name),
      ...ir.metadata.propsParams.map(p => p.name),
      ...(ir.metadata.localConstants ?? []).map(c => c.name),
    ])
    this.rootPropAliases = rootPropAliasNames(ir, this.propsParams.map(p => p.name))
    this.scope = BindingScope.EMPTY
    this.nullableOptionalProps = collectNullableOptionalProps(ir)
    this.nullableSignalGetters = collectNullableSignalGetters(ir)
    this.nullishAttrCtx = collectNullishAttrContext(ir)
    this.stringValueNames = collectStringValueNames(ir)
    this.moduleStringConsts = collectModuleStringConsts(ir.metadata.localConstants)
    this._searchParamsLocals = searchParamsLocalNames(ir.metadata)
    this._loweringMatchers = prepareLoweringMatchers(ir.metadata)
    this.computedConsts = computedConstContext(ir.metadata, name => this.scope.isBound(name))
    this.importAliases = buildImportAliasMap(ir.metadata.imports ?? [])
    this.errors = []
    // Two source names that Pebble's renaming of reserved names turns into one
    // template variable would read the same value (#3404).
    this.errors.push(...templateNameCollisionErrors(ir, this.propsParams.map(p => p.name), pebbleIdent, 'Pebble', this.componentName))
    this.childrenCaptureCounter = 0

    // Mirror of the Jinja/Twig adapters' BF103 check: a child component
    // referenced inside a loop body that is imported from a sibling .tsx
    // emits a cross-template `bf.render_child(...)` call that resolves only
    // if the sibling template is registered alongside the parent at render
    // time. Surface it loudly here. Suppressed when the caller guarantees
    // that all sibling templates are registered on the same instance at
    // render time.
    if (!options?.siblingTemplatesRegistered) {
      this.errors.push(...collectImportedLoopChildComponentErrors(ir, this.componentName, 'Pebble'))
    }

    const templateBody = ir.root.type === 'if-statement'
      ? this.renderIfStatement(ir.root as IRIfStatement)
      : this.renderNode(ir.root)

    // Generate script registration
    const scriptReg = options?.skipScriptRegistration
      ? ''
      : this.generateScriptRegistrations(ir, options?.scriptBaseName, options?.scriptAssets, options?.preloadAssets)

    // SSR context consumers (`const x = useContext(Ctx)`): seed each local
    // from the active provider value (or the `createContext` default). The
    // provider side pushes the value via `emitProvider`. (#1297)
    const ctxSeed = generateContextConsumerSeed(ir)

    // Prop/signal-derived memos with a `null` static SSR default (e.g.
    // `createMemo(() => props.value * 10)`) are computed in-template from the
    // already-seeded prop/signal vars — mirroring Go's generated child
    // constructor. (#1297)
    const memoSeed = generateDerivedMemoSeed(this.memoCtx, ir)

    const template = `${scriptReg}${ctxSeed}${memoSeed}${templateBody}\n`

    // Merge collected errors into IR errors
    if (this.errors.length > 0) {
      ir.errors.push(...this.errors)
    }

    // Pebble templates have no JS-style imports / types / default-export
    // sections. The `templatesPerComponent` mode emits one file per component
    // using the raw `template` value; sections are populated for contract
    // uniformity so the compiler never has to string-parse the template.
    const sections: TemplateSections = {
      imports: '',
      types: '',
      component: template,
      defaultExport: '',
    }

    return {
      template,
      sections,
      extension: this.extension,
    }
  }

  // ===========================================================================
  // Script Registration
  // ===========================================================================

  private generateScriptRegistrations(ir: ComponentIR, scriptBaseName?: string, scriptAssets?: string[], preloadAssets?: string[]): string {
    // `scriptAssets`, when present (including `[]`), fully supersedes the
    // adapter-computed `barefootJsPath` / `clientJsBasePath` pair — see
    // `AdapterGenerateOptions.scriptAssets`. The caller (e.g. the Vite
    // plugin) has already decided the exact ordered URL list, including
    // whether any script is needed at all.
    if (scriptAssets) {
      if (scriptAssets.length === 0) return ''
      const lines: string[] = []
      // `preloadAssets` is only meaningful alongside a non-empty
      // `scriptAssets` (see `AdapterGenerateOptions.preloadAssets`) — this
      // branch is only reached when that already holds. Emitted BEFORE the
      // script registrations: every preload hint must precede the script
      // tags it describes, or the hint is useless.
      if (preloadAssets && preloadAssets.length > 0) {
        preloadAssets.forEach((url, i) => {
          lines.push(`{% set _bf_pre${i} = bf.register_preload('${url}') %}`)
        })
      }
      scriptAssets.forEach((url, i) => {
        lines.push(`{% set _bf_reg${i} = bf.register_script('${url}') %}`)
      })
      lines.push('')
      return lines.join('\n')
    }

    const hasInteractivity = hasClientInteractivity(ir)
    if (!hasInteractivity) return ''

    const name = scriptBaseName ?? ir.metadata.componentName
    const runtimePath = this.options.barefootJsPath
    const clientJsPath = `${this.options.clientJsBasePath}${name}.client.js`

    // Pebble's `{% set %}` EXPRESSION statement (confirmed stock syntax,
    // unlike the block-capture form used elsewhere in this file — see the
    // file header, divergence 6) never prints anything regardless of its
    // value, so no throwaway-bind trick is needed here. Distinct names are
    // kept anyway for direct traceability with the Kolon/Jinja/Twig ports.
    const lines: string[] = []
    lines.push(`{% set _bf_reg0 = bf.register_script('${runtimePath}') %}`)
    lines.push(`{% set _bf_reg1 = bf.register_script('${clientJsPath}') %}`)
    lines.push('')
    return lines.join('\n')
  }

  // ===========================================================================
  // Node Rendering
  // ===========================================================================

  /**
   * Public entry point for node rendering. Delegates to the shared
   * `IRNodeEmitter` dispatcher; per-kind logic lives in the `IRNodeEmitter`
   * methods below.
   */
  renderNode(node: IRNode): string {
    return emitIRNode<PebbleRenderCtx>(node, this, {} as PebbleRenderCtx)
  }

  // ===========================================================================
  // IRNodeEmitter implementation (Pebble)
  // ===========================================================================

  emitElement(node: IRElement, _ctx: PebbleRenderCtx, _emit: EmitIRNode<PebbleRenderCtx>): string {
    return this.renderElement(node)
  }

  emitText(node: IRText): string {
    // IRText carries the entity-DECODED value (Phase 1 decodes JSX
    // character references); re-escape for direct HTML emission.
    return escapeHtml(node.value)
  }

  emitExpression(node: IRExpression): string {
    return this.renderExpression(node)
  }

  emitConditional(node: IRConditional, _ctx: PebbleRenderCtx, _emit: EmitIRNode<PebbleRenderCtx>): string {
    return this.renderConditional(node)
  }

  emitLoop(node: IRLoop, _ctx: PebbleRenderCtx, _emit: EmitIRNode<PebbleRenderCtx>): string {
    return this.renderLoop(node)
  }

  emitComponent(node: IRComponent, _ctx: PebbleRenderCtx, _emit: EmitIRNode<PebbleRenderCtx>): string {
    const rendered = this.renderComponent(node)
    // #3141: see `wrapComponentRootScopeComment`'s docstring.
    return node.needsScopeComment ? this.wrapComponentRootScopeComment(rendered) : rendered
  }

  emitFragment(node: IRFragment, _ctx: PebbleRenderCtx, _emit: EmitIRNode<PebbleRenderCtx>): string {
    return renderFragmentScope(node, children => this.renderChildren(children), rendered => this.wrapComponentRootScopeComment(rendered))
  }

  emitSlot(node: IRSlot): string {
    return this.renderSlot(node)
  }

  emitIfStatement(node: IRIfStatement, _ctx: PebbleRenderCtx, _emit: EmitIRNode<PebbleRenderCtx>): string {
    return this.renderIfStatement(node)
  }

  emitProvider(node: IRProvider, _ctx: PebbleRenderCtx, _emit: EmitIRNode<PebbleRenderCtx>): string {
    // SSR context propagation (#1297): bracket the children with a
    // provide/revoke pair on the shared controller-stash context stack so a
    // descendant `useContext` consumer reads the value during the same
    // render. Both helpers return '' (empty), so the inline `{{ … }}`
    // expression form discards their output cleanly — no extra whitespace,
    // no line-statement needed inside the element body.
    const value = this.providerValuePebble(node.valueProp)
    const children = this.renderChildren(node.children)
    const name = node.contextName
    return (
      `{{ bf.provide_context('${name}', ${value}) }}` +
      children +
      `{{ bf.revoke_context('${name}') }}`
    )
  }

  /** Lower a `<Ctx.Provider value>` value prop to a Pebble expression. */
  private providerValuePebble(valueProp: IRProvider['valueProp']): string {
    const v = valueProp.value
    if (v.kind === 'literal') {
      if (typeof v.value === 'string') {
        return `'${escapePebbleSingleQuoted(v.value)}'`
      }
      if (typeof v.value === 'boolean') return v.value ? 'true' : 'false'
      return String(v.value)
    }
    if (v.kind === 'expression') {
      const dict = this.providerObjectLiteralPebble(v.expr)
      if (dict !== null) return dict
      return this.convertExpressionToPebble(v.expr)
    }
    if (v.kind === 'template') return this.convertTemplateLiteralPartsToPebble(v.parts)
    // Out-of-shape value (spread / jsx-children) — null; consumer defaults.
    return 'null'
  }

  /**
   * Lower an object-literal provider value (`value={{ open: () => props.open
   * ?? false, onOpenChange: … }}`) to a Pebble map literal (#1897). The
   * SSR lowering is a per-member snapshot of what a consumer would READ
   * during the same render:
   *
   * - zero-param expression-body arrows are getters — lower the body (the
   *   value is fixed for the render, so the call-time indirection drops out)
   * - `on[A-Z]`-named members and function-shaped values are client-only
   *   behavior SSR never invokes — lower to `null`
   * - anything else lowers through the normal expression pipeline (so an
   *   unsupported getter body still refuses loudly with BF101)
   *
   * Keys keep their JS names verbatim so a consumer-side `ctx.open` access
   * maps onto the same map key. Returns `null` when the expression is not a
   * plain object literal (spread / computed key) — the caller falls back to
   * the whole-expression path, which refuses those shapes with BF101.
   */
  private providerObjectLiteralPebble(expr: string): string | null {
    const members = parseProviderObjectLiteral(expr.trim())
    if (members === null) return null
    const entries = members.map(m => {
      const key = pebbleHashKey(m.name)
      if (m.kind === 'function' || /^on[A-Z]/.test(m.name)) return `${key}: null`
      const src = m.kind === 'getter' ? m.body : m.expr
      return `${key}: ${this.convertExpressionToPebble(src)}`
    })
    return `{${entries.join(', ')}}`
  }

  emitAsync(node: IRAsync, _ctx: PebbleRenderCtx, _emit: EmitIRNode<PebbleRenderCtx>): string {
    return this.renderAsync(node)
  }

  // ===========================================================================
  // Element Rendering
  // ===========================================================================

  renderElement(element: IRElement): string {
    return renderElementShell(element, this.elementShell)
  }

  /**
   * Route an `ssrPortalOwnerScope`-flagged element's ALREADY-RENDERED
   * markup (the `bf-po` attribute already stamped on its own tag) into
   * `bf.register_portal_element` instead of leaving it at its source
   * position (#3119).
   *
   * Reuses this adapter's own custom `{% set NAME %}…{% endset %}`
   * set-block extension (`SetBlockExtension`/`SetBlockTokenParser`/
   * `SetBlockNode`, `java/…/pebble/ext/`) — the SAME mechanism
   * `renderComponent` already uses to forward JSX children (see this
   * file's divergence-6 header notes): the element renders inline as
   * normal Pebble (its own `{{ }}` interpolations evaluate exactly as
   * they would anywhere else), the set-block captures the fully-evaluated
   * result into a local, and a SEPARATE `{% set _ = … %}` expression
   * statement (never `{{ }}`, so nothing prints at the source position)
   * hands that string to the portal collector — mirroring how
   * `register_script` calls are already threaded through `{% set %}`
   * purely for their side effect (`generateScriptRegistrations` above).
   */
  private wrapSsrPortalElement(rendered: string): string {
    const captureName = `bf_po_${this.childrenCaptureCounter++}`
    const sinkName = `bf_po_sink_${this.childrenCaptureCounter++}`
    return `{% set ${captureName} %}${rendered}{% endset %}{% set ${sinkName} = bf.register_portal_element(${captureName}) %}`
  }

  // ===========================================================================
  // Expression Rendering
  // ===========================================================================

  renderExpression(expr: IRExpression): string {
    // @client: an ordinary claimed 'text' slot pair (slot unification A3,
    // spec/slot-unification.md §5-A3), empty at SSR since the expression
    // can't be evaluated server-side — the client's claim creates the
    // missing Text node on first write (A2's create-if-absent semantics).
    // Replaces the old unpaired `client:sN` comment, which nothing adopted.
    if (expr.clientOnly) {
      // Slot unification Step B: `client-only-elision.ts` already proved
      // `elidedPath` alone is enough for the claim plan — drop the marker.
      if (expr.markerless) return ''
      if (expr.slotId) {
        return `{{ bf.text_start("${expr.slotId}") | raw }}{{ bf.text_end() | raw }}`
      }
      return ''
    }

    // Text-position interpolation of a possibly-non-string value — see the
    // file header, divergence 2. Thread the IR-carried `.parsed` tree
    // through (mirrors go-template's `convertExpressionToGo(expr.expr,
    // classify, expr.parsed)`) so a resolved bare-identifier
    // `.map`/`.filter`/… callback (`resolveCallbackMethodFunctionReferences`,
    // #2206) isn't lost to a fresh, unresolved re-parse of the raw string.
    const pebbleExpr = `bf.string(${this.convertExpressionToPebble(expr.expr, expr.parsed)})`

    if (expr.slotId) {
      return `{{ bf.text_start("${expr.slotId}") | raw }}{{ ${pebbleExpr} }}{{ bf.text_end() | raw }}`
    }

    return `{{ ${pebbleExpr} }}`
  }

  // ===========================================================================
  // Conditional Rendering
  // ===========================================================================

  renderConditional(cond: IRConditional): string {
    if (cond.clientOnly && cond.slotId) {
      return `{{ bf.comment("cond-start:${cond.slotId}") | raw }}{{ bf.comment("cond-end:${cond.slotId}") | raw }}`
    }

    // #3166: thread `cond.parsedCondition` through — a recognised
    // `<action>.isPending()` / `.error()` read has already been substituted
    // with its seed literal there; re-parsing `cond.condition` fresh here
    // would lose that and fall into the generic member-access lowering
    // (undefined at render time).
    const condition = this.convertConditionToPebble(cond.condition, cond.parsedCondition)
    const whenTrue = this.renderNode(cond.whenTrue)
    const whenFalse = this.renderNodeOrNull(cond.whenFalse)

    // When slotId is present, add bf-c marker.
    // Use comment markers for fragments (multiple sibling elements), attribute
    // for single elements.
    const isFragmentBranch = cond.whenTrue.type === 'fragment' || cond.whenFalse.type === 'fragment'
    const useCommentMarkers = cond.slotId && isFragmentBranch

    let markedTrue = whenTrue
    let markedFalse = whenFalse
    if (cond.slotId && !useCommentMarkers) {
      markedTrue = this.addCondMarkerToFirstElement(whenTrue, cond.slotId)
      markedFalse = whenFalse ? this.addCondMarkerToFirstElement(whenFalse, cond.slotId) : whenFalse
    }

    // Inline, with no newline of our own around the tags (#3321): a newline
    // before `{% if %}` or ending a branch rendered as whitespace between the
    // conditional and adjacent text (`x: off` for `x:{c ? 'on' : 'off'}`).
    let result: string
    if (useCommentMarkers) {
      // Fragment branches: use comment markers
      const inner = whenFalse
        ? `{% if ${condition} %}${whenTrue}{% else %}${whenFalse}{% endif %}`
        : `{% if ${condition} %}${whenTrue}{% endif %}`
      result = `{{ bf.comment("cond-start:${cond.slotId}") | raw }}${inner}{{ bf.comment("cond-end:${cond.slotId}") | raw }}`
    } else if (markedFalse) {
      result = `{% if ${condition} %}${markedTrue}{% else %}${markedFalse}{% endif %}`
    } else if (cond.slotId) {
      // Conditional with no else: wrap with comment markers for client hydration
      result = `{{ bf.comment("cond-start:${cond.slotId}") | raw }}{% if ${condition} %}${whenTrue}{% endif %}{{ bf.comment("cond-end:${cond.slotId}") | raw }}`
    } else {
      result = `{% if ${condition} %}${whenTrue}{% endif %}`
    }

    return result
  }

  /**
   * Add bf-c attribute to the first HTML element in a branch.
   * If no element found, wrap with comment markers.
   */
  private addCondMarkerToFirstElement(content: string, condId: string): string {
    // Match first HTML open tag
    const match = content.match(/^(<\w+)([\s>])/)
    if (match) {
      return content.replace(/^(<\w+)([\s>])/, `$1 ${BF_COND}="${condId}"$2`)
    }
    // Fall back to comment markers for non-element content
    return `{{ bf.comment("cond-start:${condId}") | raw }}${content}{{ bf.comment("cond-end:${condId}") | raw }}`
  }

  // ===========================================================================
  // Loop Rendering
  // ===========================================================================

  renderLoop(loop: IRLoop): string {
    // clientOnly loops must not render items at SSR time, but must still emit
    // the `loop:`/`/loop:` boundary marker pair (Hono and Go parity) so the
    // client runtime's mapArray() can locate the insertion anchor when
    // hydrating the array. Without the markers, mapArray() resolves
    // anchor = null and appends after sibling markers (#872). The marker id
    // disambiguates sibling `.map()` calls under the same parent (#1087).
    if (loop.clientOnly) {
      return `{{ bf.comment("loop:${loop.markerId}") | raw }}{{ bf.comment("/loop:${loop.markerId}") | raw }}`
    }

    // Pebble's `{% for item in list %}` binds a single loop variable — it
    // can't natively unpack a tuple the way a Python `for` statement can, so
    // a `.map()` destructure param never lowers to a bare Pebble for-target.
    // Instead, `isLowerableLoopDestructure` (#2087) admits any shape whose
    // bindings resolve to a per-adapter accessor without needing the JS/CSR
    // runtime: fixed bindings at any field/index depth (`{ id }`, `[k, v]`,
    // `{ user: { name } }`), array-rest (`[first, ...tail]`), and
    // object-rest whose every use is a member read (`rest.flag`) or a
    // `{...rest}` spread onto an intrinsic element. Each admitted binding
    // becomes a `{% set %}` local off the per-item var (a native accessor
    // for fixed bindings, `bf.slice`/`bf.omit` for rest), so the body's
    // `id` / `v` / `name` / `rest.flag` all resolve. Still refused (BF104):
    // a bare-value rest use (`String(rest)`, `{rest}` as text, `{...fn(rest)}`),
    // a rest spread onto a component/provider, `.filter().map(destructure)`,
    // and `__bf_`-prefixed binding names (would collide with the synthetic
    // per-item var).
    const loopPlan = planLoop(loop, {
      scope: this.scope,
      localConstants: this.localConstants ?? [],
      resolveLiteralConst: (name) => this._resolveLiteralConst(name),
      callbackLowering: CALLBACK_LOWERING,
      spellStatic: staticValueToPebble,
    })
    const supportableDestructure = loopPlan.destructure === 'lowerable'
    if (loopPlan.destructure === 'unlowerable') {
      this.errors.push({
        code: 'BF104',
        severity: 'error',
        message: `Loop callback uses a destructure pattern (\`${loop.param}\`) that the Pebble adapter cannot lower to a native accessor — Pebble \`for item in list\` binds a single loop variable and this shape needs the actual residual value materialized (e.g. a bare object-rest use, or a rest spread onto a component).`,
        loc: loop.loc ?? { file: this.componentName + '.tsx', start: { line: 1, column: 0 }, end: { line: 1, column: 0 } },
        suggestion: {
          message:
            `Options:\n` +
            `  1. Rename the parameter to a single name and access tuple/object elements directly in the body (e.g. \`entry => entry[0]\` instead of \`([k, v]) => ...\`).\n` +
            `  2. If using object rest, only read individual fields off it (\`rest.flag\`) or spread it onto an intrinsic element (\`{...rest}\`) — not as a bare value.\n` +
            `  3. Mark the loop position as @client-only so the destructure runs in JS on the client.\n` +
            `  4. Move the loop into a primitive that the adapter registers explicitly.`,
        },
      })
    }

    // A `.map()` loop whose array is a bare identifier bound to a local
    // const (module- or function-scope, #2946) with a non-statically-
    // evaluable initializer that reads props/signals/a function call (e.g.
    // `const entries = Object.entries(props.x ?? {}).filter(...)`) can't
    // render correctly. Left unchecked, `{% for item in entries %}` over an
    // unbound name would silently iterate zero times (assuming Pebble's own
    // lenient-config member/variable resolution normalizes a missing name
    // to an empty/null value rather than raising — see this file's header,
    // "Pebble variable/null handling") instead of failing loudly.
    // Pre-existing, general limitation, orthogonal to #2087's
    // destructure-binding work — ported from the Jinja/Twig adapters'
    // identical check.
    // #2208/#2946: a loop source that is a fully-static array literal —
    // either inline (`[{ label: 'Alpha' }, ...].map(...)`) or a bare
    // identifier bound to a local const (module- or function-scope) whose
    // initializer has no prop/signal/function-call dependency — inlines as
    // a native Pebble list/map literal below. A runtime-computed local
    // (#2069, e.g. `Object.entries(props.tags).filter(...)`) still refuses
    // below, whichever scope it's declared in. `isNameShadowed` guards a
    // DIFFERENT, enclosing loop's own callback param shadowing this
    // identifier — never resolve the static const in that case. `rawArray`
    // then falls through to the bare identifier expression below, same as
    // before #2208 — which still trips the pre-existing BF101 gate for an
    // unresolvable local const reference (a loud, conservative refusal, not
    // a silent wrong value). Canonical, position-accurate predicate (#2482
    // Stage 2) — the enclosing loop scope's own membership, not a coarse
    // whole-component union.
    const staticArray = loopPlan.staticSource

    const arrayConst = loopPlan.unresolvableConst
    if (arrayConst) {
      this.errors.push({
        code: 'BF101',
        severity: 'error',
        message: `Loop array \`${arrayConst.name}\` is a const (module- or function-scope) computed value (\`${arrayConst.value}\`) that the Pebble adapter cannot bind as a template variable — only numeric/string-literal locals inline at their use site.`,
        loc: loop.loc ?? { file: this.componentName + '.tsx', start: { line: 1, column: 0 }, end: { line: 1, column: 0 } },
        suggestion: {
          message:
            'Pre-compute the array server-side and pass it as a prop, or mark the loop position as @client-only so it runs in JS on the client.',
          escape: [{ kind: 'prop-precompute' }, { kind: 'client-directive' }],
        },
      })
    }

    const rawArray = staticArray ?? this.convertExpressionToPebble(loop.array)
    // Apply sort if present: wrap the loop array in the shared `bf.sort`
    // helper, binding the sorted result to a per-iteration local so the
    // helper runs once.
    let array = rawArray
    if (loop.sortComparator) {
      // The shared chain (`@barefootjs/jsx`'s `adapters/callback-method.ts`),
      // the same as `.sort(cmp)` at an expression position: the evaluator,
      // then the structured `{keys: …}` descriptor. jsx-to-ir only lifts a
      // comparator the descriptor models, so the refusal arm is defensive; it
      // keeps the array unsorted so the template stays valid.
      const sortEmit = (e: ParsedExpr) => this.convertExpressionToPebble('', e)
      const plan = loopPlan.sort!
      if (plan.kind === 'eval') array = emitCallbackEval(plan, rawArray, sortEmit, EVAL_SPELLING)
      else if (plan.kind === 'structured-sort') array = renderSortMethod(rawArray, plan.comparator)
      else if (plan.kind === 'refuse') this._recordExprBF101(plan.message, plan.suggestion)
    }
    const param = loop.param
    // Pebble's `{% for item in array %}` binds the item directly. The
    // index, when needed (`.keys().map(k => ...)` or an explicit `index`
    // param), comes from Pebble's own loop object — `loop.index`, which is
    // ITSELF 0-based on Pebble (see this file's header syntax table: this
    // is Pebble-specific, matching neither Jinja's `loop.index0` nor
    // Twig's).

    // For `keys`-shape iterations the callback param IS the index. We iterate
    // the array but bind the loop var to a throwaway and expose the index as
    // the param name via Pebble's built-in `loop.index`.
    const loopVar = loop.iterationShape === 'keys'
      ? '__bf_item'
      : supportableDestructure ? '__bf_item' : param

    // Index alias: when an explicit `index` param is present (`.map((x, i) =>
    // ...)`) or the iteration is `keys`-shaped, expose it via a `{% set %}`
    // local bound to Pebble's `loop.index`. A supported destructure param
    // adds one `{% set %}` local per binding, built from the binding's
    // structured `segments` path (#2087 Phase B — never string-parse
    // `b.path`):
    //
    //   - fixed binding: a native accessor walking `segments` off the
    //     per-item var (`.field` / `[index]`, any depth — see
    //     `lib/pebble-naming.ts`'s `pebbleAccessorFromSegments`).
    //   - array-rest binding: `bf.slice(<parent accessor>, from, null)` —
    //     the exact JS slice, so every read of the binding (including
    //     `.length` via the shared member emitter's `bf.length` routing)
    //     matches JS semantics with no adapter-side special-casing.
    //   - object-rest binding: `bf.omit(<parent accessor>, [<excluded
    //     sibling keys>])` — a TRUE residual map (not an alias to the
    //     whole item), so `rest.flag` member reads and the existing
    //     `{...rest}` → `bf.spread_attrs(rest)` emit path both see only the
    //     keys NOT already destructured.
    const indexLocalLines: string[] = []
    if (loop.objectIteration) {
      // `key`/`value` bind via the `bf.entries`/`bf.keys`/`bf.values`
      // for-header below (see the file header, divergence 8) — no derived
      // `loop.index` local needed, unlike the array `iterationShape` cases.
    } else if (loop.iterationShape === 'keys') {
      indexLocalLines.push(`{% set ${pebbleIdent(param)} = loop.index %}`)
    } else if (loop.index) {
      indexLocalLines.push(`{% set ${pebbleIdent(loop.index)} = loop.index %}`)
    }
    if (supportableDestructure) {
      for (const b of loop.paramBindings ?? []) {
        const parentAccessor = pebbleAccessorFromSegments(pebbleIdent(loopVar), b.segments ?? [])
        if (!b.rest) {
          indexLocalLines.push(`{% set ${pebbleIdent(b.name)} = ${parentAccessor} %}`)
        } else if (b.rest.kind === 'array') {
          indexLocalLines.push(
            `{% set ${pebbleIdent(b.name)} = bf.slice(${parentAccessor}, ${b.rest.from}, null) %}`,
          )
        } else {
          const excludeKeys = b.rest.exclude.map(k => pebbleHashKey(k.key)).join(', ')
          indexLocalLines.push(
            `{% set ${pebbleIdent(b.name)} = bf.omit(${parentAccessor}, [${excludeKeys}]) %}`,
          )
        }
      }
    }

    const prevInLoop = this.inLoop
    this.inLoop = true
    // The children render once, under the loop flag (so nested components use
    // the loop-child naming convention) and the row scope below.

    // This loop's row scope, for the position-accurate shadow guard
    // (#2488/#2489, canonicalized on `BindingScope` in #2482 Stage 2).
    // `IRLoop` already structurally satisfies `LoopBindingSource`
    // (`param`/`index`/`paramBindings`/`preamble`) — `enterLoopRow(loop)`
    // binds exactly the for-header target(s), each destructure binding,
    // the index (when present), and the `.map()` preamble's declared
    // locals, mirroring what THIS renderLoop's for-header + `indexLocalLines`
    // actually introduce. Restored by reference (immutable — no ref-count
    // bookkeeping) so nested loops compose for free. Entered BEFORE
    // `preambleLines`/`bodyChildren` are converted and popped AFTER, not
    // just around `renderChildren` — a `.map()` preamble local's own
    // initializer (`d.raw`, below) and the whole-item-conditional `loop-i:`
    // key anchor (`loop.key`, in `bodyChildren` below) both genuinely
    // evaluate PER ROW and must see the row's own bindings.
    // `loop.filterPredicate` deliberately stays OUTSIDE this window
    // (further down, after the pop) — per the Stage 0 design a
    // filter/sort callback's own param is a separate `callback` frame,
    // never folded into the `.map()` row.
    const prevScope = this.scope
    this.scope = prevScope.enterLoopRow(loop)
    // Props this row's bindings newly shadow, aliased before the loop header
    // so an explicit `props.X` inside still reads the root value (#3314).
    const rootAliases = rootPropAliasesForLoop(prevScope, this.scope, this.rootPropAliases)

    // Per-row locals for a `.map()` callback preamble (#2447), in source
    // order so a later initializer sees an earlier local — same as the
    // source block. Phase 1 refuses the loop outright when the preamble
    // isn't fully declarable, so there is no partial-lowering case: either
    // every statement is lowered here, or the build already failed.
    const preambleLines = (loop.preamble?.declarations ?? []).map(
      d => `{% set ${pebbleIdent(d.name)} = ${this.convertExpressionToPebble(d.raw, d.valueParsed)} %}`,
    )
    const childrenUnderLoop = this.renderChildren(loop.children)
    this.inLoop = prevInLoop

    // Whole-item conditional: prepend an always-present `<!--bf-loop-i:KEY-->`
    // anchor before each item's (possibly empty) conditional content so the
    // client's `mapArrayAnchored` can hydrate every SSR-rendered item by its
    // anchor. Still under the row scope (see above) — `loop.key` is a
    // per-row expression.
    // `bf.escape_comment_key` both stringifies the key and neutralizes `-`
    // so it can't spell `-->` and close the comment early.
    const bodyChildren =
      loop.bodyIsItemConditional && loop.key
        ? `{{ bf.comment("loop-i:" ~ bf.escape_comment_key(${this.convertExpressionToPebble(loop.key)})) | raw }}\n${childrenUnderLoop}`
        : childrenUnderLoop
    this.scope = prevScope

    // A name the filter predicate captures from an enclosing row that this
    // loop's own row binds again would read the row's item inside the loop;
    // keep the enclosing value under a loop-scoped alias (#3402).
    const captureAliases = loopPlan.captureAliases
    const captureRenames = new Map(captureAliases.map(({ name, alias }) => [name, alias]))
    const lines: string[] = []
    // Scoped per-call-site marker so sibling `.map()`s under the same parent
    // each get their own reconciliation range.
    for (const { name, alias } of rootAliases) lines.push(`{% set ${pebbleIdent(alias)} = ${pebbleIdent(name)} %}`)
    for (const { name, alias } of captureAliases) lines.push(`{% set ${pebbleIdent(alias)} = ${pebbleIdent(name)} %}`)
    lines.push(`{{ bf.comment("loop:${loop.markerId}") | raw }}`)
    // `objectIteration` (#2168 object-entries-map): routed through the
    // runtime's `bf.entries`/`bf.keys`/`bf.values` rather than any native
    // Pebble `for` map-iteration form — see the file header, divergence 8:
    // Pebble has no two-variable `key, value in map` form at all (confirmed
    // during Phase 3 research — a real `io.pebbletemplates.pebble.error.
    // ParserException` on exactly that shape, `ForTokenParser.parse()`
    // calls `parseNewVariableName()` exactly once), and its single-variable
    // form binds to a Map.Entry, not a bare key or value. The `entries`
    // case therefore binds ONE loop variable to each `[key, value]` PAIR
    // `bf.entries` produces, then destructures it into the key/value
    // locals via two `{% set %}` statements (the same numeric-index
    // accessor `pebbleAccessorFromSegments`'s `{kind:'index'}` case emits
    // for a `.map()` destructure binding) — never the two-variable `for`
    // header a mechanical Jinja/Twig port might suggest.
    const entryPairVar = `bf_entry_${loop.markerId}`
    const forHeader = loop.objectIteration === 'entries'
      ? `{% for ${entryPairVar} in bf.entries(${array}) %}`
      : loop.objectIteration === 'keys'
        ? `{% for ${pebbleIdent(param)} in bf.keys(${array}) %}`
        : loop.objectIteration === 'values'
          ? `{% for ${pebbleIdent(param)} in bf.values(${array}) %}`
          : `{% for ${pebbleIdent(loopVar)} in ${array} %}`
    // Pebble's `{% set %}` inside a `for` body is not loop-scoped: an index,
    // destructure, entry or preamble local named like a template-level
    // signal, memo or prop (#3386), or like an enclosing row's binding
    // (#3391), overwrites it past the loop (JS scopes the callback param to
    // the row). Save each such name before the loop and restore it after.
    // The for-header's own variable is loop-scoped already.
    const setBoundNames = new Set<string>()
    if (loop.objectIteration === 'entries') {
      setBoundNames.add(loop.index ?? param)
      setBoundNames.add(param)
    } else if (!loop.objectIteration) {
      if (loop.iterationShape === 'keys') setBoundNames.add(param)
      else if (loop.index) setBoundNames.add(loop.index)
    }
    if (supportableDestructure) for (const b of loop.paramBindings ?? []) setBoundNames.add(b.name)
    for (const d of loop.preamble?.declarations ?? []) setBoundNames.add(d.name)
    const savedNames = [...setBoundNames]
      .filter(name => this.templateLevelNames.has(name) || prevScope.isBound(name))
      .map(name => {
        let saved = `bf_outer_${loop.markerId}_${pebbleIdent(name)}`
        while (this.scope.isBound(saved) || setBoundNames.has(saved) || this.templateLevelNames.has(saved)) saved += '_'
        return { local: pebbleIdent(name), saved }
      })
    for (const { local, saved } of savedNames) lines.push(`{% set ${saved} = ${local} %}`)
    lines.push(forHeader)
    if (loop.objectIteration === 'entries') {
      lines.push(`{% set ${pebbleIdent(loop.index ?? param)} = ${entryPairVar}[0] %}`)
      lines.push(`{% set ${pebbleIdent(param)} = ${entryPairVar}[1] %}`)
    }
    for (const il of indexLocalLines) lines.push(il)

    // Handle filter().map() pattern by wrapping children in if-condition
    if (loop.filterPredicate) {
      let filterCond: string
      if (loop.filterPredicate.predicate) {
        // The filter param reads the row item, so rename its references in
        // the parsed predicate to the loop param. Renaming the AST, not the
        // rendered text, leaves a string literal with the same spelling and
        // a property key alone (#3404).
        const filterRenames = new Map(captureRenames)
        if (loop.filterPredicate.param !== param) filterRenames.set(loop.filterPredicate.param, param)
        // The aliases render and type like the enclosing names they keep (#3402).
        const scopeBeforeAliases = this.scope
        this.scope = this.scope.enterAliases(new Map(captureAliases.map(({ name, alias }) => [alias, name])))
        try {
          filterCond = this.renderPebbleFilterExpr(
            renameFreeIdentifiers(loop.filterPredicate.predicate, filterRenames),
            param
          )
        } finally {
          this.scope = scopeBeforeAliases
        }
        // See the file header, divergence 1: the loop-hoist filter test is a
        // condition position too.
        filterCond = truthyTest(loop.filterPredicate.predicate, filterCond)
      } else {
        // Phase 1 always attaches the predicate; a missing one is refused,
        // never stood in for by a truthy constant that renders every row (#3534).
        const refusal = missingFilterPredicateRefusal(loop.filterPredicate.raw, CALLBACK_LOWERING.adapterName)
        this._recordExprBF101(refusal.message, refusal.suggestion)
        filterCond = 'true'
      }
      lines.push(`{% if ${filterCond} %}`)
      lines.push(...preambleLines)
      lines.push(bodyChildren)
      lines.push(`{% endif %}`)
    } else {
      lines.push(...preambleLines)
      lines.push(bodyChildren)
    }

    lines.push(`{% endfor %}`)
    for (const { local, saved } of savedNames) lines.push(`{% set ${local} = ${saved} %}`)
    lines.push(`{{ bf.comment("/loop:${loop.markerId}") | raw }}`)

    return lines.join('\n')
  }

  // ===========================================================================
  // Component Rendering
  // ===========================================================================

  /**
   * AttrValue lowering for component invocation props (Pebble map-entry
   * form). Pebble CANNOT splat a map into positional args, so every prop is
   * emitted as a `'key': value` entry that the caller collects into ONE map
   * literal passed to `bf.render_child(name, { ... })`.
   *
   * `jsx-children` returns empty — children are captured via a Pebble
   * set-block below (see the file header, divergence 6), not threaded
   * through the map entry list.
   */
  private readonly componentPropEmitter: AttrValueEmitter = {
    emitLiteral: (value, name) => `${pebbleHashKey(name)}: '${escapePebbleSingleQuoted(value.value)}'`,
    emitExpression: (value, name) => {
      if (value.parts) {
        return `${pebbleHashKey(name)}: ${this.convertTemplateLiteralPartsToPebble(value.parts)}`
      }
      // Inline object-literal child prop (carousel's `opts={{ align: 'start' }}`):
      // lower to a Pebble map so the child can serialize it (`data-opts`),
      // instead of refusing the bare object with BF101. (#1971) Read the
      // IR-carried structured `ParsedExpr` tree (#2018) instead of
      // re-parsing `value.expr`; the lowering returns null for any
      // non-object-literal shape, so the common non-object case falls
      // straight through to the bare-expression path below.
      if (value.parsed) {
        const dict = objectLiteralExprToPebbleDict(this.spreadCtx, value.parsed)
        if (dict !== null) return `${pebbleHashKey(name)}: ${dict}`
      }
      return `${pebbleHashKey(name)}: ${this.convertExpressionToPebble(value.expr)}`
    },
    emitSpread: (value) => {
      // Pebble maps can't be splatted into the entry list the way `**`
      // flattens Python kwargs into a call literal, or a `|merge` filter
      // chain flattens Twig hashes. `renderComponent` handles EVERY spread
      // shape itself (both the enumerated propsObject case and the general
      // nested `bf.merge(base, top)` fold — see its own docstring), so this
      // callback is never reached for `kind: 'spread'` props; it only
      // exists to satisfy the `AttrValueEmitter` interface.
      return this.convertExpressionToPebble(value.expr)
    },
    emitTemplate: (value, name) =>
      `${pebbleHashKey(name)}: ${this.convertTemplateLiteralPartsToPebble(value.parts)}`,
    emitBooleanAttr: (_value, name) => `${pebbleHashKey(name)}: true`,
    emitBooleanShorthand: (_value, name) => `${pebbleHashKey(name)}: true`,
    // JSX children flow through the Pebble set-block capture below; they're
    // not part of the map entry list.
    emitJsxChildren: () => '',
  }


  /**
   * Fold ordered prop segments into a single Pebble expression via nested
   * `bf.merge(base, top)` calls, later argument winning on key conflict —
   * exactly like `{...a, ...b}`. Routed through this adapter's own
   * `bf.merge` runtime helper rather than Jinja's `dict(base, **top)`
   * builtin (Pebble has no keyword-splat call syntax) OR Twig's `|merge`
   * filter (Pebble's built-in filter set is not confirmed to include a
   * `merge` filter with the exact shallow, later-wins semantics JS spread
   * needs — see this file's header syntax table). `bf.merge` is also
   * expected to treat a `null`/missing second argument as an empty map
   * internally (Phase 3), so — unlike Jinja's `(EXPR or {})` guard — no
   * extra null-guard wrapping is needed here at the TS emission layer.
   * Empty `'entries'` segments are dropped so a leading/trailing spread
   * doesn't drag in a needless `bf.merge(acc, {})` call. Returns `'{}'`
   * when every segment is empty (no props at all).
   */
  private combineComponentPropSegments(
    segments: ReadonlyArray<{ kind: 'entries'; parts: string[] } | { kind: 'spread'; expr: string }>,
  ): string {
    let acc: string | null = null
    for (const seg of segments) {
      if (seg.kind === 'entries') {
        if (seg.parts.length === 0) continue
        const text = `{${seg.parts.join(', ')}}`
        // `bf.merge([base, top])` — a single Pebble LIST-literal argument,
        // not two trailing variadic args: Pebble's method resolver can't
        // match a Java varargs method call (see `Bf.merge`'s own doc
        // comment for the confirmed `MemberCacheUtils` limitation).
        acc = acc === null ? text : `bf.merge([${acc}, ${text}])`
      } else {
        acc = acc === null ? seg.expr : `bf.merge([${acc}, ${seg.expr}])`
      }
    }
    return acc ?? '{}'
  }

  renderComponent(comp: IRComponent): string {
    // Each named JSX-valued prop (`header={<strong>Title</strong>}`, #2168)
    // and the forwarded children are captured with a set-block, evaluated in
    // the parent's template scope (signals, conditionals), and passed by
    // name; `render_child` materializes the children through the backend
    // before handing them to the child. See the file header, divergence 4,
    // for why a set-block (not a macro) is the uniform mechanism. A named
    // slot's capture name is counter-based: a prop name can contain
    // characters (`data-slot`) that are no valid `{% set %}` target.
    const tplName = childTemplateName(comp.name, this.importAliases)
    const captures: string[] = []
    const capture = (children: IRNode[], name: () => string) => {
      const body = this.renderChildren(children)
      const captured = name()
      captures.push(`{% set ${captured} %}${body}{% endset %}`)
      return captured
    }
    const plan = planComponentProps(comp, { propsObjectName: this.propsObjectName, propsParams: this.propsParams })
    const segments = spellComponentProps(plan, {
      entry: (entry) => {
        switch (entry.kind) {
          case 'value':
            return emitAttrValue(entry.value, this.componentPropEmitter, entry.name)
          case 'named-slot':
            return `${pebbleHashKey(entry.name)}: ${capture(entry.children, () => `bf_prop_${this.childrenCaptureCounter++}`)}`
          case 'props-param':
            return `${pebbleHashKey(entry.name)}: ${pebbleIdent(entry.name)}`
          case 'slot-id':
            return `${pebbleHashKey('_bf_slot')}: '${entry.slotId}'`
          case 'children':
            return `${pebbleHashKey('children')}: ${capture(entry.children, () => `bf_children_${comp.slotId ?? 'c' + this.childrenCaptureCounter++}`)}`
        }
      },
      spread: (value) => this.convertExpressionToPebble(value.expr),
      presentParam: (name) => `(${pebbleIdent(name)} is null ? {} : {${pebbleHashKey(name)}: ${pebbleIdent(name)}})`,
    })
    const dict = isEmptyComponentProps(segments) ? '' : `, ${this.combineComponentPropSegments(segments)}`
    return `${captures.join('')}{{ bf.render_child('${tplName}'${dict}) | raw }}`
  }

  private childrenCaptureCounter = 0

  /** Uniquifies the `presenceOrUndefined` temp binding (`bf_puN`) so two
   *  presence-folded attrs in one template don't collide. */
  private presenceVarCounter = 0
  // ===========================================================================
  // If-Statement (Conditional Return) Rendering
  // ===========================================================================

  private renderIfStatement(ifStmt: IRIfStatement): string {
    const condition = this.convertConditionToPebble(ifStmt.condition)
    const consequent = ifStmt.consequent.type === 'if-statement'
      ? this.renderIfStatement(ifStmt.consequent as IRIfStatement)
      : this.renderNode(ifStmt.consequent)
    let result = `{% if ${condition} %}\n${consequent}\n`

    if (ifStmt.alternate) {
      if (ifStmt.alternate.type === 'if-statement') {
        const altResult = this.renderIfStatement(ifStmt.alternate as IRIfStatement)
        // Replace leading "{% if" with "{% elseif" — Pebble's confirmed
        // spelling (Twig's, not Jinja's `elif`; see the file header syntax
        // table).
        result += altResult.replace(/^\{% if/, '{% elseif')
      } else {
        const alternate = this.renderNode(ifStmt.alternate)
        result += `{% else %}\n${alternate}\n`
      }
    }

    result += `{% endif %}`
    return result
  }

  // ===========================================================================
  // Fragment & Slot Rendering
  // ===========================================================================

  /**
   * Wrap already-rendered output in the comment-based scope marker pair.
   * Shared by a `needsScopeComment` fragment root and a `needsScopeComment`
   * component root (#3141) — both are "this scope has no DOM element of its
   * own to carry bf-s/bf-p", so both lean on the same runtime helper pair.
   */
  private wrapComponentRootScopeComment(rendered: string): string {
    return `{{ bf.scope_comment() | raw }}${rendered}{{ bf.scope_comment_end() | raw }}`
  }

  private renderSlot(_slot: IRSlot): string {
    // Captured children arrive under the `children` context key (see
    // renderComponent's set-block capture + render_child call), so the var
    // is `children`. The content is already-rendered markup, so emit it
    // as-is via `| raw` — otherwise Pebble's autoescape would entity-escape
    // the child tags. (The IR producer doesn't currently emit `slot`
    // nodes — `{children}` lowers to an expression whose captured value is
    // already raw — so this is defensive correctness for if/when a slot
    // node is produced.)
    return `{{ ${pebbleIdent('children')} | raw }}`
  }

  override renderAsync(node: IRAsync): string {
    const fallback = this.renderNode(node.fallback)
    const children = this.renderChildren(node.children)
    // Capture the fallback into a Pebble set-block (see the file header,
    // divergence 6) and pass its rendered HTML to `bf.async_boundary`,
    // which wraps it in a `<div bf-async="aX">` placeholder. Same shape as
    // `renderComponent`'s children capture.
    const captureName = `bf_async_fallback_${node.id}`
    return `{% set ${captureName} %}${fallback}{% endset %}{{ bf.async_boundary('${node.id}', ${captureName}) | raw }}\n${children}`
  }

  // ===========================================================================
  // Attribute Rendering
  // ===========================================================================

  /**
   * AttrValue lowering for intrinsic-element attributes (Pebble).
   */
  private readonly elementAttrEmitter: AttrValueEmitter = {
    emitLiteral: (value, name) => `${name}="${escapeHtml(value.value)}"`,
    emitExpression: (source, name) => {
      // A computed const reads as its initializer (#3494).
      const value = inlineComputedConstAttr(source, this.computedConsts)
      // `style={{ … }}` object literal → a CSS string with dynamic values
      // interpolated, instead of refusing the bare object with BF101 (#1322).
      if (name === 'style') {
        const css = this.tryLowerStyleObject(value)
        if (css !== null) return `style="${css}"`
      }
      // Refuse shapes that the lowering pipeline can't represent in Pebble —
      // tagged-template-literal call expressions (`cn\`base \${tone()}\``).
      // Same gate as the Jinja/Twig adapters.
      if (this.refuseUnsupportedAttrExpression(value.expr, name)) {
        return ''
      }
      const plan = planAttrExpression(value, name, {
        propsObjectName: this.propsObjectName,
        restPropsName: this.restPropsName,
        nullableOptionalProps: this.nullableOptionalProps,
        nullableSignalGetters: this.nullableSignalGetters,
        nullishAttrCtx: this.nullishAttrCtx,
        isLoopBound: (n) => this.isLoopBoundName(n),
        boolStr: (expr, attr) => this.shouldBoolStr(expr, attr),
      })
      const attr = (v: string, boolStr: boolean) =>
        boolStr ? `${name}="{{ bf.bool_str(${v}) }}"` : `${name}="{{ bf.string(${v}) }}"`
      // Each kind is documented on `AttrExpressionPlan`.
      switch (plan.kind) {
        case 'omit-nullable': {
          // A bare read here, so it doubles as the guard test and the value.
          const v = this.convertExpressionToPebble(value.expr)
          return `\n{% if ${v} != null %}\n${attr(v, plan.boolStr)}\n{% endif %}\n`
        }
        case 'boolean-attr': {
          const v = this.convertExpressionToPebble(value.expr, value.parsed)
          return `{{ (${this.wrapConditionExpr(value.expr, v)} ? '${name}' : '') }}`
        }
        case 'presence': {
          const v = this.convertExpressionToPebble(value.expr)
          const tmp = `bf_pu${this.presenceVarCounter++}`
          return `\n{% set ${tmp} = ${v} %}\n{% if ${this.wrapConditionExpr(value.expr, tmp)} %}\n${attr(tmp, plan.boolStr)}\n{% endif %}\n`
        }
        case 'undefined-alternate': {
          // Pass the parsed sub-trees through (#2843 review): the string forms
          // are `exprToString` debug text, which renders a nested object
          // literal as a non-reparseable placeholder.
          const m = plan.ternary
          const cond = this.convertConditionToPebble(m.condition, m.testParsed)
          const val = this.convertExpressionToPebble(m.consequent, m.consequentParsed)
          return `\n{% if ${cond} %}\n${name}="{{ bf.string(${val}) }}"\n{% endif %}\n`
        }
        case 'omit-nil': {
          const v = this.convertExpressionToPebble(value.expr, value.parsed)
          const tmp = `bf_pu${this.presenceVarCounter++}`
          return `\n{% set ${tmp} = ${v} %}\n{% if ${tmp} != null %}\n${attr(tmp, plan.boolStr)}\n{% endif %}\n`
        }
        case 'plain':
          return attr(this.convertExpressionToPebble(value.expr, value.parsed), plan.boolStr)
      }
    },
    emitBooleanAttr: (_value, name) => name,
    emitTemplate: (value, name) =>
      `${name}="{{ ${this.convertTemplateLiteralPartsToPebble(value.parts)} }}"`,
    // Spread attributes (`<div {...attrs()} />`) lower through the
    // `bf.spread_attrs` runtime helper, mirroring the Jinja/Twig adapters.
    emitSpread: (value) => {
      if (this.refuseUnsupportedAttrExpression(value.expr, '...')) {
        return ''
      }
      const plan = planSpreadAttr(value, {
        propsObjectName: this.propsObjectName,
        propsParams: this.propsParams,
        localConstants: this.localConstants ?? [],
        isBound: (n) => this.scope.isBound(n),
      })
      // `{...props}`: props arrive as separate template vars, so enumerate them.
      if (plan.kind === 'props-object') {
        const entries = plan.params.map((p) => `${pebbleHashKey(p)}: ${pebbleIdent(p)}`)
        return `{{ bf.spread_attrs({${entries.join(', ')}}) | raw }}`
      }
      // A conditional inline-object spread (`{...(cond ? {…} : {})}`) lowers to
      // a ternary of hashes; the falsy `{}` omits the key.
      for (const candidate of plan.candidates) {
        const lowered = conditionalSpreadToPebble(this.spreadCtx, candidate)
        if (lowered !== null) return `{{ bf.spread_attrs(${lowered}) | raw }}`
      }
      return `{{ bf.spread_attrs(${this.convertExpressionToPebble(value.expr)}) | raw }}`
    },
    // Neither variant is legal on intrinsic elements.
    emitBooleanShorthand: () => '',
    emitJsxChildren: () => '',
  }

  /** How this adapter spells the parts of an element `renderElementShell` writes. */
  private readonly elementShell: ElementShellSpelling = {
    attrEmitter: this.elementAttrEmitter,
    renderDangerousInnerHtml: element =>
      renderDangerousInnerHtml(element, this.errors, this.name, (expr, parsed) =>
        // Lower the `__html` expression and emit it through Pebble's `| raw`
        // filter, which suppresses the environment's autoescape for this one
        // value (confirmed filter — see this file's header syntax table). The
        // runtime evaluates the expression, so no template-metachar guard
        // applies; the element already carries its hydration slot marker.
        // #2319.
        `{{ ${this.convertExpressionToPebble(expr, parsed)} | raw }}`,
      ),
    renderChildren: children => this.renderChildren(children),
    renderScopeMarker: instanceIdExpr => this.renderScopeMarker(instanceIdExpr),
    renderSlotMarker: slotId => this.renderSlotMarker(slotId),
    dataKeyRelay: `{{ bf.data_key_attr() | raw }}`,
    scopeIdValue: `{{ bf.scope_attr() }}`,
    wrapSsrPortalElement: rendered => this.wrapSsrPortalElement(rendered),
  }

  /**
   * Lower a `style={{ … }}` object literal to a `bf.style_object(...)` call,
   * e.g. `{ backgroundColor: color }` → `{{ bf.style_object(["background-color",
   * color]) }}`. `style_object` is the single oracle-matching sanitizer (ported
   * from Hono's `hasUnsafeStyleValue`): it drops any key:value pair whose
   * value could break out of a CSS declaration and HTML-escapes the rest,
   * returning a value the Java runtime marks safe so Pebble's autoescape
   * doesn't double-escape it (#2261). Returns null when the shape is
   * unsupported or any value can't be lowered (caller falls through to
   * BF101). (#1322)
   */
  private tryLowerStyleObject(value: ExpressionAttr): string | null {
    const entries = planStyleObject(value)
    if (!entries) return null
    const args = entries.flatMap(e => [
      JSON.stringify(e.cssKey),
      e.kind === 'literal' ? JSON.stringify(e.value) : this.convertExpressionToPebble(e.expr, e.parsed),
    ])
    // `bf.style_object([...])` — a single Pebble LIST-literal argument, not
    // trailing variadic args: Pebble's method resolver can't match a Java
    // varargs method call (see `Bf.style_object`'s own doc comment for the
    // confirmed `MemberCacheUtils` limitation).
    return `{{ bf.style_object([${args.join(', ')}]) }}`
  }

  // ===========================================================================
  // Hydration Markers
  // ===========================================================================

  renderScopeMarker(_instanceIdExpr: string): string {
    // bf-s is the addressable scope id. hydration_attrs adds bf-h / bf-m /
    // bf-r conditionally; props_attr adds bf-p when props are present.
    return `bf-s="{{ bf.scope_attr() }}" {{ bf.hydration_attrs() | raw }} {{ bf.props_attr() | raw }}`
  }

  renderSlotMarker(slotId: string): string {
    return `${BF_SLOT}="${slotId}"`
  }

  renderCondMarker(condId: string): string {
    return `${BF_COND}="${condId}"`
  }

  // ===========================================================================
  // Filter Predicate Rendering (ParsedExpr → Pebble)
  // ===========================================================================

  /**
   * Convert a ParsedExpr AST to a Pebble expression string for filter
   * predicates. Wraps the shared ParsedExpr dispatcher with a
   * `PebbleFilterEmitter` carrying the predicate's loop param and any
   * block-body local var aliases.
   */
  private renderPebbleFilterExpr(
    expr: ParsedExpr,
    param: string,
    localVarMap: Map<string, string> = new Map(),
  ): string {
    return emitParsedExpr(
      expr,
      new PebbleFilterEmitter(
        param,
        localVarMap,
        n => this._isStringValueName(n),
        // A nested callback method inside the predicate has no Pebble
        // scalar form — surface BF101 (#2038) instead of silently
        // degrading it to its receiver.
        (message, reason) => this._recordExprBF101(message, reason),
      ),
    )
  }

  // ===========================================================================
  // Expression Conversion: JS → Pebble
  // ===========================================================================

  private convertTemplateLiteralPartsToPebble(literalParts: IRTemplatePart[]): string {
    const parts: string[] = []
    for (const part of literalParts) {
      if (part.type === 'string') {
        parts.push(this.substituteJsInterpolationsToPebble(part.value))
      } else if (part.type === 'ternary') {
        const cond = this.convertConditionToPebble(part.condition)
        // Pebble's symbolic ternary (see the file header syntax table) —
        // `(test ? a : b)`.
        parts.push(
          `(${cond} ? '${escapePebbleSingleQuoted(part.whenTrue)}' : '${escapePebbleSingleQuoted(part.whenFalse)}')`,
        )
      } else if (part.type === 'lookup') {
        // `${MAP[KEY]}` against a Record<T, string> literal — emit a Pebble
        // map literal, looked up via `bf.get(receiver, key)` (NOT a direct
        // bracket subscript on the literal, `{...}[key]` — confirmed via a
        // live `io.pebbletemplates.pebble.error.ParserException` on that
        // exact shape: Pebble's `ExpressionParser` only accepts `[...]`
        // postfix subscript after a POSTFIX expression chain rooted at an
        // identifier/attribute access, not after a bare map-literal
        // expression — a genuinely Pebble-specific parser limitation,
        // absent from Jinja/Twig's grammar, which is why this adapter's
        // port of the shared `lookup` part previously copied their direct
        // `{...}[key]` shape verbatim without re-verifying it against
        // Pebble's own grammar). `bf.get` is this runtime's own dynamic
        // member/index-access helper (already used for the non-identifier
        // loop-binding-accessor case — see `pebbleAccessorFromSegments`),
        // routed through `bf.coalesce` (this file's header, divergence 3 —
        // Pebble has no native `??`) for the same "empty when no case
        // matches" default Jinja's dict `.get(key, default)` gives for
        // free.
        const keyExpr = this.convertExpressionToPebble(part.key)
        const entries = Object.entries(part.cases)
          .map(([k, v]) => `${pebbleHashKey(k)}: '${escapePebbleSingleQuoted(v)}'`)
          .join(', ')
        parts.push(`bf.string(bf.coalesce(bf.get({${entries}}, ${keyExpr}), ''))`)
      }
    }
    // Join with Pebble string concatenation (`~`). Every term is already a
    // string (literal or `bf.string(...)`-wrapped), so `~`'s own coercion
    // is a no-op here.
    return parts.length === 1 ? parts[0] : parts.join(' ~ ')
  }

  /**
   * Translate `${EXPR}` interpolations in a static template-part string into
   * Pebble variable references and concatenate them with the surrounding
   * literal text. Each interpolated (non-literal) segment routes through
   * `bf.string(...)` — see the file header, divergence 2.
   */
  private substituteJsInterpolationsToPebble(s: string): string {
    const segments: string[] = []
    const re = /\$\{([^}]+)\}/g
    let lastIndex = 0
    let m: RegExpExecArray | null
    while ((m = re.exec(s)) !== null) {
      if (m.index > lastIndex) {
        segments.push(`'${escapePebbleSingleQuoted(s.slice(lastIndex, m.index))}'`)
      }
      segments.push(`bf.string(${this.convertExpressionToPebble(m[1].trim())})`)
      lastIndex = re.lastIndex
    }
    if (lastIndex < s.length) {
      segments.push(`'${escapePebbleSingleQuoted(s.slice(lastIndex))}'`)
    }
    if (segments.length === 0) return `''`
    return segments.length === 1 ? segments[0] : `(${segments.join(' ~ ')})`
  }

  /**
   * Refuse JS expression shapes that have no idiomatic Pebble representation:
   * object literals (`style={{...}}`) and tagged-template-literal call
   * expressions (`cn\`base \${tone()}\``). Records `BF101`. Returns `true`
   * when the shape was rejected (caller should drop the attribute).
   */
  private refuseUnsupportedAttrExpression(expr: string, attrName: string): boolean {
    const error = unsupportedAttrExpressionError(expr, attrName, this._loweringMatchers, this.componentName, 'Pebble', 'Pebble')
    if (error) this.errors.push(error)
    return error !== null
  }

  /**
   * Build the EmitContext seam the top-level `ParsedExpr` emitter depends on.
   * Built as a private object (the adapter does NOT `implements PebbleEmitContext`)
   * so the wrapped bookkeeping — `_searchParamsLocals`, the const/record
   * resolvers, BF101 recording, the filter-predicate entry, the
   * `_isStringValueName` witness — stays private and off the exported
   * adapter's public type, matching the Jinja/Twig adapters' `emitCtx` and
   * the `spreadCtx` / `memoCtx` seams below.
   */
  private get emitCtx(): PebbleEmitContext {
    return {
      _searchParamsLocals: this._searchParamsLocals,
      _propsObjectName: this.propsObjectName,
      _isGlobalName: (name: string) => this.computedConsts?.isGlobal(name) ?? false,
      _loweringMatchers: this._loweringMatchers,
      _resolveModuleStringConst: (name) => this._resolveModuleStringConst(name),
      _resolveLiteralConst: (name) => this._resolveLiteralConst(name),
      _rootPropReadName: (name) => rootPropReadName(name, this.scope, this.rootPropAliases),
      _resolveStaticRecordLiteral: (o, k) => this._resolveStaticRecordLiteral(o, k),
      _isOpaqueLocalAccessorCall: (name) => isOpaqueLocalAccessorName(name, this.localConstants),
      _arithmeticCoercion: (op, operand, other) => arithmeticOperandCoercion(op, operand, other, this.nullishAttrCtx, n => this.isLoopBoundName(n)),
      _recordExprBF101: (message, reason) => this._recordExprBF101(message, reason),
      _renderPebbleFilterExprPublic: (e, p) => this._renderPebbleFilterExprPublic(e, p),
      _isStringValueName: (name) => this._isStringValueName(name),
    }
  }

  /**
   * Build the narrow context the extracted spread lowering depends on. Passing
   * a purpose-built object (rather than `this`) keeps the adapter's bookkeeping
   * members private — they stay internal implementation detail, not part of the
   * exported class's public surface.
   */
  private get spreadCtx(): PebbleSpreadContext {
    return {
      componentName: this.componentName,
      errors: this.errors,
      localConstants: this.localConstants,
      propsParams: this.propsParams,
      convertExpressionToPebble: (e, preParsed) => this.convertExpressionToPebble(e, preParsed),
      convertConditionToPebble: (e, preParsed) => this.convertConditionToPebble(e, preParsed),
    }
  }

  /** Build the narrow context the extracted memo seeding depends on. */
  private get memoCtx(): PebbleMemoContext {
    return {
      convertExpressionToPebble: (e, preParsed, pos) => this.convertExpressionToPebble(e, preParsed, pos),
      errors: this.errors,
    }
  }

  private convertExpressionToPebble(expr: string, preParsed?: ParsedExpr, pos: 'rendered' | 'value' = 'rendered'): string {
    // Parse-first lowering — parity with the Jinja/Twig adapters'
    // `convertExpressionToJinja`/`convertExpressionToTwig`. Parse the JS
    // expression once, gate it on the shared `isSupported`, and render
    // every supported shape through the AST emitter. Unsupported shapes
    // surface as BF101.
    //
    // `preParsed` is the IR-carried `ParsedExpr` tree (cf. go-template's
    // `convertExpressionToGo(jsExpr, out?, preParsed?)`); when present it is
    // used directly instead of re-parsing `expr`, so spread condition/value
    // lowering threads the carried tree through without a stringify→re-parse
    // round-trip. The diagnostic text is then derived from the tree
    // (`stringifyParsedExpr`) so callers can pass `''` for `expr`.
    let parsed: ParsedExpr
    if (preParsed) {
      parsed = preParsed
    } else {
      const trimmed = expr.trim()
      if (trimmed === '') return "''"
      parsed = parseExpression(trimmed)
    }
    parsed = inlineComputedConsts(parsed, this.computedConsts)

    // #2843: a registered lowering plugin's call (the built-in `queryHref`,
    // or any userland plugin) is recognised no matter where it sits in the
    // tree — a ternary branch, a template-literal interpolation, … — not
    // only when `parsed.kind === 'call'` directly. That recognition now
    // lives in `PebbleTopLevelEmitter`'s `lowering` seam, consulted by
    // `emitParsedExpr`'s shared `call` dispatch; the support gate below is
    // passed `this._loweringMatchers` so a matched call's params (e.g.
    // `queryHref`'s object literal, otherwise `unsupported` at `rendered`
    // position) are admitted wherever the call is nested.
    //
    // `pos` distinguishes a derived-seed RHS (an assignment, checked via
    // `isSupportedValue`) from every other, genuinely rendered call site —
    // the rendered gate would otherwise re-refuse a tree the seed plan
    // already classified `derived` at value position (#2696 review).
    const supportOpts = { loweringMatchers: this._loweringMatchers }
    const support = pos === 'value' ? isSupportedValue(parsed, supportOpts) : isSupported(parsed, supportOpts)
    if (!support.supported) {
      this.errors.push({
        code: 'BF101',
        severity: 'error',
        message: `Expression not supported: ${preParsed ? stringifyParsedExpr(parsed) : expr.trim()}`,
        loc: { file: this.componentName + '.tsx', start: { line: 1, column: 0 }, end: { line: 1, column: 0 } },
        suggestion: {
          message: support.reason
            ? `${support.reason}\n\nOptions:\n1. Use /* @client */ for client-side evaluation\n2. Pre-compute the value in the backend`
            : 'Options:\n1. Use /* @client */ for client-side evaluation\n2. Pre-compute the value in the backend',
        },
      })
      // Safe Pebble empty-string literal — valid in every context the
      // result might land in.
      return "''"
    }

    return this.renderParsedExprToPebble(parsed)
  }

  /**
   * Convert a JS condition (an `if` / ternary / loop-filter test) to a
   * Pebble boolean expression, routing through `bf.truthy(...)` unless the
   * expression is structurally already boolean-shaped. See the file header,
   * divergence 1.
   */
  private convertConditionToPebble(expr: string, preParsed?: ParsedExpr): string {
    const pebble = this.convertExpressionToPebble(expr, preParsed)
    return this.wrapConditionExpr(expr, pebble, preParsed)
  }

  /**
   * Shared helper: given the ORIGINAL JS expression (or its already-parsed
   * tree) and its ALREADY-RENDERED Pebble text, wrap the rendered text with
   * `bf.truthy(...)` unless the expression is structurally boolean-shaped.
   * Split from `convertConditionToPebble` so a caller that already lowered
   * the expression for another purpose (e.g. the `presenceOrUndefined` temp
   * bind) doesn't lower it twice.
   */
  private wrapConditionExpr(expr: string, pebble: string, preParsed?: ParsedExpr): string {
    const isBoolean = preParsed
      ? isBooleanResultExpr(stringifyParsedExpr(preParsed))
      : isBooleanResultExpr(expr)
    return isBoolean ? pebble : `bf.truthy(${pebble})`
  }

  /**
   * Render a full ParsedExpr tree to Pebble for top-level (non-filter)
   * expressions where identifiers are signals / template vars.
   */
  private renderParsedExprToPebble(expr: ParsedExpr): string {
    return emitParsedExpr(expr, new PebbleTopLevelEmitter(this.emitCtx))
  }

  /** Whether `name` (a signal getter, prop, or same-file local const) holds
   *  a string value — consumed by `isStringConcatBinary` (via
   *  `_isStringValueName` on the `PebbleEmitContext` seam) to pick `~` over
   *  JS `+`'s (unverified) numeric fallback. See this file's header,
   *  divergence tied to `expr/emitters.ts`'s divergence 7. */
  private _isStringValueName(name: string): boolean {
    return this.stringValueNames.has(name)
  }

  /**
   * Parse `cond ? value : undefined` (or `: null`), returning the
   * condition/consequent source spans, else `null`. Used for the
   * attribute-omission rule (#1897).
   *
   * `testParsed`/`consequentParsed` (#2843 review) are the ACTUAL parsed
   * sub-trees, for the caller to pass through as `preParsed` — `condition`/
   * `consequent` are `exprToString` output, a DEBUG formatter that renders
   * any nested `object-literal` (e.g. a registered call's params, `queryHref`'s
   * `{ tag }`) as a non-reparseable `[UNSUPPORTED: …]` placeholder.
   * Re-parsing THAT string for a consequent like `queryHref(base, { tag })`
   * would corrupt the call's args before the lowering registry — now
   * consulted at any nesting depth (#2843) — ever sees them. Kept for any
   * caller that only needs the string form; the parsed trees are the
   * correct input wherever the caller can accept `preParsed`.
   */  /** Position-accurate loop-bound-name check — see `this.scope`'s docstring. */
  private isLoopBoundName(name: string): boolean {
    return this.scope.isBound(name)
  }

  /**
   * Whether an attribute-value expression should route through
   * `bf.bool_str` (vs. plain `bf.string`) at its interpolation site.
   * `isExplicitStringCall` is checked FIRST and short-circuits the other
   * three: an explicit `String(x)` call already lowers to `bf.string(x)`,
   * which correctly stringifies a real boolean on its own, so layering
   * `bf.bool_str` on top would run Pebble truthiness over the
   * ALREADY-STRINGIFIED text instead of the original boolean. See
   * `isExplicitStringCall`'s docstring in `@barefootjs/jsx`'s `adapters/boolean-result.ts` for the full
   * double-wrap failure mode this guards against.
   */
  private shouldBoolStr(expr: string, name: string): boolean {
    if (isExplicitStringCall(expr)) return false
    return isBooleanResultExpr(expr) || isAriaBooleanAttr(name) || isBooleanTypedPropRef(expr, { propsObjectName: this.propsObjectName, booleanTypedProps: this.booleanTypedProps, isBound: (n) => this.scope.isBound(n) })
  }

  /**
   * Inline a const (any scope) whose initializer is a pure numeric or
   * single-quoted string literal (`const totalPages = 5`, #1897
   * pagination) — function-scope consts never reach the per-render
   * context, so a bare reference would resolve to Undefined.
   *
   * The lookup is a flat name match with no notion of AST scope, so a
   * name bound by the CURRENTLY ENCLOSING loop's item/index/destructure/
   * preamble param never inlines (#2221) — the occurrence may be the
   * loop's own (shadowing) binding, and substituting the outer const's
   * value there renders every iteration with the same hard-coded literal.
   * Position-accurate via the threaded `this.scope` (#2482 Stage 2) — a
   * same-named const elsewhere in the component, outside any loop that
   * shadows it, still inlines.
   */
  private _resolveLiteralConst(name: string): string | null {
    const lit = lookupLiteralConst(name, this.localConstants, n => this.scope.isBound(n))
    if (lit === null) return null
    if (lit.kind === 'number') return lit.text
    if (lit.kind === 'boolean') return lit.text === 'true' ? 'true' : 'false'
    if (lit.kind === 'null') return 'null'
    return `'${escapePebbleSingleQuoted(lit.text)}'`
  }

  /**
   * Resolve `IDENT.key` where `IDENT` is a module-scope object-literal const
   * (`variantClasses.ghost`, #1896/#1897) to the looked-up scalar.
   *
   * The lookup is a flat name match on `objectName` with no notion of AST
   * scope, so an enclosing loop callback's own param of the same name
   * (`.map((cfg) => <li>{cfg.x}</li>)` shadowing a module `const cfg = {…}`)
   * still resolved to the OUTER const's member value at every iteration
   * (#2237) — the sibling hazard to #2221's `_resolveLiteralConst`.
   * Position-accurate via the threaded `this.scope` (#2482 Stage 2), passed
   * as `lookupStaticRecordLiteral`'s required guard: a name the CURRENTLY
   * ENCLOSING loop binds never inlines, falling back to the bare
   * `cfg['x']` member expression (which a Pebble for-loop binds correctly
   * at the shadowed occurrence); a same-named const elsewhere, outside any
   * loop that shadows it, still inlines.
   */
  private _resolveStaticRecordLiteral(objectName: string, key: string): string | null {
    const hit = lookupStaticRecordLiteral(objectName, key, this.localConstants, name => this.scope.isBound(name))
    if (!hit) return null
    return hit.kind === 'number'
      ? hit.text
      : `'${escapePebbleSingleQuoted(hit.text)}'`
  }

  private _resolveModuleStringConst(name: string): string | null {
    // A loop body may bind a `{% set %}` local that shadows a module const of
    // the same name; never inline inside one (conservative — drop to the
    // bare identifier).
    if (this.inLoop) return null
    const value = this.moduleStringConsts.get(name)
    if (value === undefined) return null
    return `'${escapePebbleSingleQuoted(value)}'`
  }

  private _recordExprBF101(message: string, reason?: string): void {
    this.errors.push({
      code: 'BF101',
      severity: 'error',
      message,
      loc: { file: this.componentName + '.tsx', start: { line: 1, column: 0 }, end: { line: 1, column: 0 } },
      suggestion: {
        message: reason
          ? `${reason}\n\nOptions:\n1. Use /* @client */ for client-side evaluation\n2. Pre-compute the value in the backend`
          : 'Options:\n1. Use /* @client */ for client-side evaluation\n2. Pre-compute the value in the backend',
      },
    })
  }

  /** Internal hook for higher-order: predicate body re-uses the filter emitter. */
  private _renderPebbleFilterExprPublic(expr: ParsedExpr, param: string): string {
    return this.renderPebbleFilterExpr(expr, param)
  }
}

export const pebbleAdapter = new PebbleAdapter()
