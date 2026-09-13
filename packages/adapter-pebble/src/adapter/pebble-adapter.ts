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
 *   1. **JS truthiness** (`boolean-result.ts`, `expr/emitters.ts`'s
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
  isBooleanAttr,
  parseExpression,
  stringifyParsedExpr,
  exprToString,
  parseProviderObjectLiteral,
  parseStyleObjectEntries,
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
  searchParamsLocalNames,
  prepareLoweringMatchers,
  sortComparatorFromArrow,
  isDangerousInnerHtmlAttr,
  resolveDangerousInnerHtml,
  dangerousInnerHtmlMetacharViolation,
  dangerousInnerHtmlDiagnostic,
  resolveStaticLoopSource,
  derivesScopeFromSlot,
  BindingScope,
  buildImportAliasMap,
} from '@barefootjs/jsx'
import { isAriaBooleanAttr, isBooleanResultExpr, isExplicitStringCall } from './boolean-result.ts'
import type { ParsedExpr, LoweringMatcher } from '@barefootjs/jsx'
import { BF_SLOT, BF_COND, BF_REGION, escapeHtml, resolveJsxChildrenProp } from '@barefootjs/shared'

import type { PebbleRenderCtx } from './lib/types.ts'
import { PEBBLE_PRIMITIVE_EMIT_MAP } from './lib/constants.ts'
import {
  pebbleHashKey,
  pebbleIdent,
  escapePebbleSingleQuoted,
  pebbleAccessorFromSegments,
} from './lib/pebble-naming.ts'
import { renderSortMethod, renderSortEval } from './expr/array-method.ts'
import { staticValueToPebble } from './lib/static-value.ts'
import { PebbleFilterEmitter, PebbleTopLevelEmitter, truthyTest } from './expr/emitters.ts'
import type { PebbleEmitContext, PebbleSpreadContext, PebbleMemoContext } from './emit-context.ts'
import {
  hasClientInteractivity,
  collectImportedLoopChildComponentErrors,
} from './analysis/component-tree.ts'
import {
  conditionalSpreadToPebble,
  objectLiteralExprToPebbleDict,
} from './spread/spread-codegen.ts'
import {
  generateContextConsumerSeed,
  generateDerivedMemoSeed,
} from './memo/seed.ts'
import {
  collectBooleanTypedProps,
  collectNullableOptionalProps,
  collectStringValueNames,
} from './props/prop-classes.ts'

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
  /**
   * SolidJS-style props identifier (`function(props: P)`) and the
   * analyzer-extracted prop names. Stashed at `generate()` entry so the
   * per-attribute `emitSpread` callback can build a propsObject spread bag as
   * an inline Pebble map literal without re-walking the IR.
   */
  private propsObjectName: string | null = null
  private propsParams: { name: string }[] = []
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

  /**
   * Local + module constants from the IR, used by the conditional-spread and
   * `Record<staticKeys, scalar>[propKey]` lowering paths (#textarea / #checkbox).
   * Stashed at `generate()` entry so `emitSpread` can resolve a bare local
   * const (`const sizeAttrs = size ? {…} : {}`) to its initializer text.
   */
  private localConstants: IRMetadata['localConstants'] = []

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

  /**
   * Local alias -> declared/exported name for imported components (#2822,
   * the SSR-side counterpart of #2777's client-JS registry-key fix). A
   * child referenced under an import alias (`import { Foo as Bar }`,
   * `<Bar/>`) must build its cross-template `render_child` call against
   * the child's own declared name (`Foo`, what `foo.tsx` registers its
   * Pebble partial as) — never the caller-local binding. Built once per
   * compile from `ir.metadata.imports` via the shared `buildImportAliasMap`
   * (`@barefootjs/jsx`) and read by `toTemplateName`.
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
    // (#checkbox) Enumerate the props-object pattern's inherited attribute
    // accesses (`props.className`/`id`/`disabled`) into propsParams via the
    // shared helper, before deriving `nullableOptionalProps` below.
    augmentInheritedPropAccesses(ir)
    this.propsParams = ir.metadata.propsParams.map(p => ({ name: p.name }))
    // Props whose declared TS type is boolean — a bare binding of one
    // (`data-active={props.isActive}`) must stringify as JS
    // `String(boolean)` ("true"/"false"), routed explicitly through
    // `bf.bool_str` (#1897, pagination's data-active — see
    // `boolean-result.ts`'s file header).
    this.booleanTypedProps = collectBooleanTypedProps(ir)
    this.localConstants = ir.metadata.localConstants ?? []
    this.scope = BindingScope.EMPTY
    this.nullableOptionalProps = collectNullableOptionalProps(ir)
    this.stringValueNames = collectStringValueNames(ir)
    this.moduleStringConsts = collectModuleStringConsts(ir.metadata.localConstants)
    this._searchParamsLocals = searchParamsLocalNames(ir.metadata)
    this._loweringMatchers = prepareLoweringMatchers(ir.metadata)
    this.importAliases = buildImportAliasMap(ir.metadata.imports ?? [])
    this.errors = []
    this.childrenCaptureCounter = 0

    // Mirror of the Jinja/Twig adapters' BF103 check: a child component
    // referenced inside a loop body that is imported from a sibling .tsx
    // emits a cross-template `bf.render_child(...)` call that resolves only
    // if the sibling template is registered alongside the parent at render
    // time. Surface it loudly here. Suppressed when the caller guarantees
    // that all sibling templates are registered on the same instance at
    // render time.
    if (!options?.siblingTemplatesRegistered) {
      this.errors.push(...collectImportedLoopChildComponentErrors(ir, this.componentName))
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
    return this.renderComponent(node)
  }

  emitFragment(node: IRFragment, _ctx: PebbleRenderCtx, _emit: EmitIRNode<PebbleRenderCtx>): string {
    return this.renderFragment(node)
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
    const tag = element.tag
    const attrs = this.renderAttributes(element)
    const dangerousHtml = this.renderDangerousInnerHtml(element)
    const children = dangerousHtml !== null ? dangerousHtml : this.renderChildren(element.children)

    let hydrationAttrs = ''
    if (element.needsScope) {
      hydrationAttrs += ` ${this.renderScopeMarker('')}`
    }
    // #2753: `element.keyAttr` is the ONE IR-resolved decision for this
    // element's row-key attribute — replacing both the `carriesDataKey`
    // boolean and this adapter's own `rootScopeNodes`/`needsScope` check
    // (mechanism 2: a render-root relay, including the #2732 fragment-root
    // case) and the separate `currentLoopKeyDepth`-driven rewrite of a
    // literal `key` attribute this adapter used to do in `renderAttributes`
    // (mechanism 1: a `.map()` row root compiled inline here).
    if (element.keyAttr) {
      if (element.keyAttr.value !== undefined) {
        const lowered = emitAttrValue(
          { kind: 'expression', expr: element.keyAttr.value },
          this.elementAttrEmitter,
          element.keyAttr.name,
        )
        if (lowered) hydrationAttrs += ` ${lowered}`
      } else {
        // Relay: this element is one of THIS component's own render roots,
        // carrying whatever key its OWN caller supplies at runtime (the `bf`
        // instance's `data_key` field) when this component is itself
        // invoked as a caller's keyed loop row. Mirrors Hono stamping
        // data-key on each loop item's root, including early-return
        // (if-statement) roots (#1297), and #2732's fragment-root case.
        hydrationAttrs += ` {{ bf.data_key_attr() | raw }}`
      }
    }
    if (element.slotId) {
      hydrationAttrs += ` ${this.renderSlotMarker(element.slotId)}`
    }
    // Page-lifecycle boundary lowered from `<Region>` (spec/router.md). The id
    // is a deterministic static string (`<file scope>:<index>`), so it emits as
    // a plain literal attribute — no Pebble template tag.
    if (element.regionId) {
      hydrationAttrs += ` ${BF_REGION}="${element.regionId}"`
    }

    const voidElements = [
      'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input',
      'link', 'meta', 'param', 'source', 'track', 'wbr',
    ]

    if (voidElements.includes(tag.toLowerCase())) {
      return `<${tag}${attrs}${hydrationAttrs}>`
    }

    return `<${tag}${attrs}${hydrationAttrs}>${children}</${tag}>`
  }

  /**
   * `dangerouslySetInnerHTML={{ __html: '...' }}` (#2207) — see the Blade
   * adapter's identical helper for the full rationale. `null` means the
   * attribute is absent (caller falls through to normal `renderChildren`);
   * a non-`null` string (possibly `''`) replaces the children outright.
   */
  private renderDangerousInnerHtml(element: IRElement): string | null {
    const resolution = resolveDangerousInnerHtml(element)
    if (!resolution) return null
    if (resolution.kind === 'unlowerable') {
      this.errors.push(dangerousInnerHtmlDiagnostic(resolution.expr, resolution.loc))
      return ''
    }
    if (resolution.kind === 'dynamic') {
      // Lower the `__html` expression and emit it through Pebble's `| raw`
      // filter, which suppresses the environment's autoescape for this one
      // value (confirmed filter — see this file's header syntax table). The
      // runtime evaluates the expression, so no template-metachar guard
      // applies; the element already carries its hydration slot marker.
      // #2319.
      return `{{ ${this.convertExpressionToPebble(resolution.valueExpr, resolution.valueParsed)} | raw }}`
    }
    const violation = dangerousInnerHtmlMetacharViolation(resolution.html, this.name)
    if (violation) {
      const attr = element.attrs.find(isDangerousInnerHtmlAttr)!
      this.errors.push(dangerousInnerHtmlDiagnostic(`{ __html: ${JSON.stringify(resolution.html)} }`, attr.loc, violation))
      return ''
    }
    return resolution.html
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

    const condition = this.convertConditionToPebble(cond.condition)
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

    let result: string
    if (useCommentMarkers) {
      // Fragment branches: use comment markers
      const inner = whenFalse
        ? `\n{% if ${condition} %}\n${whenTrue}\n{% else %}\n${whenFalse}\n{% endif %}\n`
        : `\n{% if ${condition} %}\n${whenTrue}\n{% endif %}\n`
      result = `{{ bf.comment("cond-start:${cond.slotId}") | raw }}${inner}{{ bf.comment("cond-end:${cond.slotId}") | raw }}`
    } else if (markedFalse) {
      result = `\n{% if ${condition} %}\n${markedTrue}\n{% else %}\n${markedFalse}\n{% endif %}\n`
    } else if (cond.slotId) {
      // Conditional with no else: wrap with comment markers for client hydration
      result = `{{ bf.comment("cond-start:${cond.slotId}") | raw }}\n{% if ${condition} %}\n${whenTrue}\n{% endif %}\n{{ bf.comment("cond-end:${cond.slotId}") | raw }}`
    } else {
      result = `\n{% if ${condition} %}\n${whenTrue}\n{% endif %}\n`
    }

    return result
  }

  private renderNodeOrNull(node: IRNode): string | null {
    if (node.type === 'expression' && (node.expr === 'null' || node.expr === 'undefined')) {
      return null
    }
    return this.renderNode(node)
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
    const destructure = !!(loop.paramBindings && loop.paramBindings.length > 0)
    const supportableDestructure = destructure && isLowerableLoopDestructure(loop)
    if (destructure && !supportableDestructure) {
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
    const staticItems = resolveStaticLoopSource(loop.arrayParsed, this.localConstants, {
      isNameShadowed: this.scope.asShadowPredicate(),
    })
    const staticArray = staticItems !== null ? staticValueToPebble(staticItems) : null

    const arrayName = loop.array.trim()
    if (staticArray === null && /^[A-Za-z_$][\w$]*$/.test(arrayName)) {
      const arrayConst = (this.localConstants ?? []).find(c => c.name === arrayName)
      if (arrayConst && this._resolveLiteralConst(arrayName) === null) {
        this.errors.push({
          code: 'BF101',
          severity: 'error',
          message: `Loop array \`${arrayName}\` is a const (module- or function-scope) computed value (\`${arrayConst.value}\`) that the Pebble adapter cannot bind as a template variable — only numeric/string-literal locals inline at their use site.`,
          loc: loop.loc ?? { file: this.componentName + '.tsx', start: { line: 1, column: 0 }, end: { line: 1, column: 0 } },
          suggestion: {
            message:
              'Pre-compute the array server-side and pass it as a prop, or mark the loop position as @client-only so it runs in JS on the client.',
            escape: [{ kind: 'prop-precompute' }, { kind: 'client-directive' }],
          },
        })
      }
    }

    const rawArray = staticArray ?? this.convertExpressionToPebble(loop.array)
    // Apply sort if present: wrap the loop array in the shared `bf.sort`
    // helper, binding the sorted result to a per-iteration local so the
    // helper runs once.
    let array = rawArray
    if (loop.sortComparator) {
      // Evaluator-first: serialize the comparator arrow body + emit
      // `bf.sort_eval`; fall back to the structured `bf.sort` for a
      // comparator the evaluator can't model (e.g. `localeCompare`). The
      // comparator now arrives as an `IRLoopSort` carrying the generic
      // `arrow` + its params.
      const sort = loop.sortComparator
      const sortEmit = (e: ParsedExpr) => this.convertExpressionToPebble('', e)
      const arrow = sort.arrow
      const params =
        arrow.kind === 'arrow' ? arrow.params : [sort.paramA, sort.paramB]
      const structured = sortComparatorFromArrow(arrow)
      array =
        renderSortEval(rawArray, arrow.kind === 'arrow' ? arrow.body : arrow, params, sortEmit) ??
        (structured !== null ? renderSortMethod(rawArray, structured) : rawArray)
    }
    const param = loop.param
    // Pebble's `{% for item in array %}` binds the item directly. The
    // index, when needed (`.keys().map(k => ...)` or an explicit `index`
    // param), comes from Pebble's own loop object — `loop.index`, which is
    // ITSELF 0-based on Pebble (see this file's header syntax table: this
    // is Pebble-specific, matching neither Jinja's `loop.index0` nor
    // Twig's).
    const renderedChildren = this.renderChildren(loop.children)

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
    // Re-render children now that inLoop is set (so nested components use the
    // loop-child naming convention). renderedChildren above was computed with
    // the previous flag; recompute under the loop flag.

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
    void renderedChildren

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

    const lines: string[] = []
    // Scoped per-call-site marker so sibling `.map()`s under the same parent
    // each get their own reconciliation range.
    lines.push(`{{ bf.comment("loop:${loop.markerId}") | raw }}`)
    // `objectIteration` (#2168 object-entries-map): routed through the
    // runtime's `bf.entries`/`bf.keys`/`bf.values` rather than any native
    // Pebble `for` map-iteration form — see the file header, divergence 8:
    // Pebble has no two-variable `key, value in map` form at all (confirmed
    // during Phase 3 research), and its single-variable form binds to a
    // Map.Entry, not a bare key or value.
    const forHeader = loop.objectIteration === 'entries'
      ? `{% for ${pebbleIdent(loop.index ?? param)}, ${pebbleIdent(param)} in bf.entries(${array}) %}`
      : loop.objectIteration === 'keys'
        ? `{% for ${pebbleIdent(param)} in bf.keys(${array}) %}`
        : loop.objectIteration === 'values'
          ? `{% for ${pebbleIdent(param)} in bf.values(${array}) %}`
          : `{% for ${pebbleIdent(loopVar)} in ${array} %}`
    lines.push(forHeader)
    for (const il of indexLocalLines) lines.push(il)

    // Handle filter().map() pattern by wrapping children in if-condition
    if (loop.filterPredicate) {
      let filterCond: string
      if (loop.filterPredicate.predicate) {
        filterCond = this.renderPebbleFilterExpr(
          loop.filterPredicate.predicate,
          loop.filterPredicate.param
        )
        // See the file header, divergence 1: the loop-hoist filter test is a
        // condition position too.
        filterCond = truthyTest(loop.filterPredicate.predicate, filterCond)
      } else {
        filterCond = 'true'
      }
      // Map filter param to loop param (e.g., t → todo). Word-boundary
      // rename over the RENDERED text — same mechanism Kolon/Jinja/Twig
      // use (there scoped to `$`-sigiled tokens for Kolon; here scoped by
      // plain word boundaries, since Pebble identifiers have no sigil).
      // Bounded, pre-existing risk: see `lib/ir-scope.ts`'s file header for
      // the general sigil-less text-scan caveat.
      if (loop.filterPredicate.param !== param) {
        filterCond = filterCond.replace(
          new RegExp(`\\b${loop.filterPredicate.param}\\b`, 'g'),
          pebbleIdent(param)
        )
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
   * A `renderComponent` props map, built as an ORDERED sequence of
   * segments so `{...before, ...spread, after: 1}` JSX spread semantics
   * (later entries win) survive the trip through Pebble. Each `'entries'`
   * segment is a literal Pebble map `{'k': v, ...}`; each `'spread'`
   * segment is an arbitrary expression lowered from a `{...expr}` prop.
   * `combineComponentPropSegments` folds the sequence into ONE expression
   * via nested `bf.merge(base, top)` calls (later segment wins on key
   * conflict, matching `Object.assign`/JSX order) — see
   * `combineComponentPropSegments`'s own docstring for why `bf.merge` was
   * chosen over Jinja's `dict(base, **top)` or Twig's `|merge` filter.
   */
  private componentPropSegmentEntries(
    segments: Array<{ kind: 'entries'; parts: string[] } | { kind: 'spread'; expr: string }>,
  ): string[] {
    const last = segments[segments.length - 1]
    if (last && last.kind === 'entries') return last.parts
    const seg = { kind: 'entries' as const, parts: [] as string[] }
    segments.push(seg)
    return seg.parts
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
        acc = acc === null ? text : `bf.merge(${acc}, ${text})`
      } else {
        acc = acc === null ? seg.expr : `bf.merge(${acc}, ${seg.expr})`
      }
    }
    return acc ?? '{}'
  }

  renderComponent(comp: IRComponent): string {
    type Segment = { kind: 'entries'; parts: string[] } | { kind: 'spread'; expr: string }
    const segments: Segment[] = [{ kind: 'entries', parts: [] }]
    const currentEntries = () => this.componentPropSegmentEntries(segments)
    // Named JSX-valued props OTHER than the reserved `children`
    // (`header={<strong>Title</strong>}`, #2168 jsx-element-prop) each get
    // their own `{% set %}` capture, prepended to the final returned
    // string below — same mechanism as the reserved children capture,
    // just keyed by the prop's own name instead of `children`. See the
    // file header, divergence 6 — this capture form requires the Phase 3
    // custom Pebble extension.
    const namedSlotSetBlocks: string[] = []

    for (const p of comp.props) {
      // Skip callback props (onXxx) and `ref` — both are client-only for
      // SSR (Hono renders neither; the client JS wires them at hydration).
      if ((p.name.match(/^on[A-Z]/) || p.name === 'ref') && p.value.kind === 'expression') continue
      if (p.value.kind === 'jsx-children' && p.name !== 'children') {
        const slotBody = this.renderChildren(p.value.children)
        // Purely counter-based — NOT derived from `p.name` or `comp.slotId`.
        // A JSX prop name can contain characters (`data-slot`) that aren't a
        // valid Pebble `{% set %}` target, and `comp.slotId` alone would
        // collide across two named-slot props on the same component
        // invocation (unlike the reserved children slot, there's only ever
        // one of those per invocation).
        const captureName = `bf_prop_${this.childrenCaptureCounter++}`
        namedSlotSetBlocks.push(`{% set ${captureName} %}${slotBody}{% endset %}`)
        currentEntries().push(`${pebbleHashKey(p.name)}: ${captureName}`)
        continue
      }
      if (p.value.kind === 'spread') {
        const trimmed = p.value.expr.trim()
        // SolidJS-style props identifier (`function(props: P)`) has no
        // matching runtime map in Pebble scope — props arrive as a flat
        // set of top-level template vars, so enumerate the
        // analyzer-extracted props params into map entries instead of
        // treating it as a runtime spread expression.
        if (this.propsObjectName && this.propsObjectName === trimmed) {
          for (const pp of this.propsParams) {
            currentEntries().push(`${pebbleHashKey(pp.name)}: ${pebbleIdent(pp.name)}`)
          }
          continue
        }
        // Every other spread shape (a destructure rest-bag `props`, a
        // member-access bag like `children.props`, an intrinsic-element
        // spread helper's own operand, …) — Pebble map literals can't
        // splat a runtime map into named entries at a call site, but a
        // nested `bf.merge(base, top)` call can fold it into the
        // accumulated map at the right ordinal position. No compile-time
        // filtering of onXxx/ref keys out of the runtime bag (the render
        // contract tolerates them, same as the other spread-lowering
        // adapters).
        segments.push({ kind: 'spread', expr: this.convertExpressionToPebble(p.value.expr) })
        continue
      }
      const lowered = emitAttrValue(p.value, this.componentPropEmitter, p.name)
      if (lowered) currentEntries().push(lowered)
    }
    // Pass slot ID so the child renderer can set correct scope ID for
    // hydration. Skipped for a loop item root — it uses ComponentName_random
    // instead (#2444). Appended to whatever the trailing entries segment is
    // so a spread's own `_bf_slot`/`children` keys (if any) never win over
    // these compiler-controlled entries.
    if (derivesScopeFromSlot(comp)) {
      currentEntries().push(`${pebbleHashKey('_bf_slot')}: '${comp.slotId}'`)
    }
    const tplName = this.toTemplateName(comp.name)

    // Resolve the effective children: a nested `<Box>…</Box>` populates
    // `comp.children`; an attribute-form `<Box children={<jsx/>} />` lands in
    // a `jsx-children` AttrValue on the corresponding prop.
    const effectiveChildren: IRNode[] = comp.children.length > 0
      ? comp.children
      : resolveJsxChildrenProp(comp.props)

    if (effectiveChildren.length > 0) {
      // Forward JSX children via a Pebble set-block (see the file header,
      // divergence 6 — this requires the Phase 3 custom extension). The
      // block body is evaluated in the parent's template scope (signals,
      // conditionals) and produces the children HTML as a captured string;
      // the captured name is passed as the `children` entry of the
      // render_child map. `render_child` materializes it through the
      // backend before handing it to the child.
      const childrenBody = this.renderChildren(effectiveChildren)
      const captureName = `bf_children_${comp.slotId ?? 'c' + this.childrenCaptureCounter++}`
      currentEntries().push(`${pebbleHashKey('children')}: ${captureName}`)
      const dict = this.combineComponentPropSegments(segments)
      return `${namedSlotSetBlocks.join('')}{% set ${captureName} %}${childrenBody}{% endset %}{{ bf.render_child('${tplName}', ${dict}) | raw }}`
    }

    const isEmpty = segments.every(s => s.kind === 'entries' && s.parts.length === 0)
    const dictEntries = isEmpty ? '' : `, ${this.combineComponentPropSegments(segments)}`
    return `${namedSlotSetBlocks.join('')}{{ bf.render_child('${tplName}'${dictEntries}) | raw }}`
  }

  private childrenCaptureCounter = 0

  /** Uniquifies the `presenceOrUndefined` temp binding (`bf_puN`) so two
   *  presence-folded attrs in one template don't collide. */
  private presenceVarCounter = 0

  private toTemplateName(componentName: string): string {
    // Resolve an import alias (`import { Foo as Bar }`, `<Bar/>`) back to
    // the child's own declared name BEFORE snake-casing (#2822) — `Bar`
    // has no `foo.tsx`-registered partial; only `Foo` does.
    const declaredName = this.importAliases.get(componentName) ?? componentName
    // Convert PascalCase to snake_case for template naming.
    return declaredName
      .replace(/([A-Z])/g, '_$1')
      .toLowerCase()
      .replace(/^_/, '')
  }

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

  private renderFragment(fragment: IRFragment): string {
    const children = this.renderChildren(fragment.children)
    if (fragment.needsScopeComment) {
      // End marker bounds the scope's sibling range -- without it, queries
      // from the fragment scope leak onto later siblings owned by the
      // parent (#2289).
      return `{{ bf.scope_comment() | raw }}${children}{{ bf.scope_comment_end() | raw }}`
    }
    return children
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
    emitExpression: (value, name) => {
      // `style={{ … }}` object literal → a CSS string with dynamic values
      // interpolated, instead of refusing the bare object with BF101 (#1322).
      if (name === 'style') {
        const css = this.tryLowerStyleObject(value.expr)
        if (css !== null) return `style="${css}"`
      }
      // Refuse shapes that the lowering pipeline can't represent in Pebble —
      // tagged-template-literal call expressions (`cn\`base \${tone()}\``).
      // Same gate as the Jinja/Twig adapters.
      if (this.refuseUnsupportedAttrExpression(value.expr, name)) {
        return ''
      }
      // Hono-style nullish omission: a bare reference to an optional,
      // no-default prop (`nullableOptionalProps`) is guarded so the
      // attribute drops instead of rendering `attr=""`. Narrowly scoped to
      // bare identifiers — member exprs, calls, and concrete/defaulted
      // props are unaffected.
      const bareId = value.expr.trim()
      // Normalize a props-object access (`props.id`) to its bare prop name
      // (`id`) so the nullable-optional set — keyed by bare name — matches the
      // SolidJS props-object pattern, not just destructured params.
      const normalizedBareId =
        this.propsObjectName && bareId.startsWith(`${this.propsObjectName}.`)
          ? bareId.slice(this.propsObjectName.length + 1)
          : bareId
      if (
        !isBooleanAttr(name) &&
        !value.presenceOrUndefined &&
        /^[A-Za-z_$][\w$]*$/.test(normalizedBareId) &&
        this.nullableOptionalProps.has(normalizedBareId) &&
        // Inside a `.map()` callback, a param that shadows a nullable
        // optional prop's name is the row binding, not the prop — skip the
        // spurious `!= null` guard (#2488).
        !this.isLoopBoundName(normalizedBareId)
      ) {
        const pebble = this.convertExpressionToPebble(value.expr)
        const body = this.shouldBoolStr(value.expr, name)
            ? `${name}="{{ bf.bool_str(${pebble}) }}"`
            : `${name}="{{ bf.string(${pebble}) }}"`
        // `pebble` is a bare identifier reference for this narrowly-gated
        // shape, so it doubles as both the guard test and the display
        // value. Simpler than the Jinja port's `is defined and is not
        // none` pair — this adapter assumes a missing context var already
        // normalizes to `null` under a non-strict-variables config (see
        // this file's header, "Pebble variable/null handling"), so a
        // single `!= null` test covers both "never bound" and "explicitly
        // null".
        return `\n{% if ${pebble} != null %}\n${body}\n{% endif %}\n`
      }
      if (isBooleanAttr(name)) {
        // Boolean attributes: render conditionally (present or absent).
        // Pebble's symbolic ternary (see the file header syntax table) —
        // `(test ? a : b)`, not Jinja's word-based `(a if test else b)`.
        const pebble = this.convertExpressionToPebble(value.expr)
        return `{{ (${this.wrapConditionExpr(value.expr, pebble)} ? '${name}' : '') }}`
      }
      if (value.presenceOrUndefined) {
        // `attr={expr || undefined}` on a NON-boolean attribute: Hono
        // renders the attr with its stringified value when truthy and
        // omits it otherwise (`aria-disabled={isDisabled() || undefined}`
        // → `aria-disabled="true"`), so bare presence would diverge.
        // Route through `bool_str` when the name/shape witnesses a
        // boolean value, same as the unconditional path below (#1897).
        // Bind to a temp first so the expression evaluates once, not in
        // both the guard and the value.
        const pebble = this.convertExpressionToPebble(value.expr)
        const tmp = `bf_pu${this.presenceVarCounter++}`
        const body = this.shouldBoolStr(value.expr, name)
            ? `${name}="{{ bf.bool_str(${tmp}) }}"`
            : `${name}="{{ bf.string(${tmp}) }}"`
        return `\n{% set ${tmp} = ${pebble} %}\n{% if ${this.wrapConditionExpr(value.expr, tmp)} %}\n${body}\n{% endif %}\n`
      }
      // `attr={cond ? value : undefined}` OMITS the attribute on the
      // falsy branch (Hono drops undefined-valued attributes) — wrap the
      // whole attribute in the condition instead of rendering `attr=""`
      // (#1897, pagination's `aria-current={props.isActive ? 'page' :
      // undefined}`). Same parity rule the Go adapter applies.
      {
        const m = this.parseUndefinedAlternateTernary(value.expr)
        if (m) {
          // Pass the PARSED sub-trees through as `preParsed` (#2843 review)
          // rather than re-parsing `m.condition`/`m.consequent` — those are
          // `exprToString` debug text, which renders any nested
          // `object-literal` (e.g. a registered call's params, `queryHref`'s
          // `{ tag }`) as a non-reparseable `[UNSUPPORTED: …]` placeholder.
          const cond = this.convertConditionToPebble(m.condition, m.testParsed)
          const val = this.convertExpressionToPebble(m.consequent, m.consequentParsed)
          return `\n{% if ${cond} %}\n${name}="{{ bf.string(${val}) }}"\n{% endif %}\n`
        }
      }
      // Boolean-result handling: route boolean-shaped values through
      // `bf.bool_str` so the wire bytes match JS `String(boolean)`. Every
      // other value is a text-position interpolation — route through
      // `bf.string` (see the file header, divergence 2).
      const pebble = this.convertExpressionToPebble(value.expr)
      if (this.shouldBoolStr(value.expr, name)) {
        return `${name}="{{ bf.bool_str(${pebble}) }}"`
      }
      return `${name}="{{ bf.string(${pebble}) }}"`
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
      // SolidJS-style props identifier (`(props: P) { <el {...props}/> }`) has
      // no matching context map in Pebble scope — props arrive as a flat set
      // of top-level context vars. Emit an inline map literal enumerating
      // the analyzer-extracted props params.
      const trimmed = value.expr.trim()
      if (this.propsObjectName && this.propsObjectName === trimmed) {
        const entries = this.propsParams.map(p =>
          `${pebbleHashKey(p.name)}: ${pebbleIdent(p.name)}`,
        )
        return `{{ bf.spread_attrs({${entries.join(', ')}}) | raw }}`
      }
      // Conditional inline-object spread (#textarea):
      //   `{...(COND ? { 'aria-describedby': describedBy } : {})}`
      // Emit a Pebble inline ternary of maps — the falsy `{}` branch OMITS
      // the key (`spread_attrs` does NOT emit empty-map entries).
      // Read the spread's IR-carried `ParsedExpr` tree (#2018) instead of
      // re-parsing `trimmed`.
      const ternaryDict = conditionalSpreadToPebble(this.spreadCtx, value.parsed)
      if (ternaryDict !== null) {
        return `{{ bf.spread_attrs(${ternaryDict}) | raw }}`
      }
      // Function-scope local const holding a conditional inline-object
      //   `const sizeAttrs = size ? {…} : {}` then `{...sizeAttrs}`
      // (#checkbox / icon). Resolve the bare identifier to its initializer text
      // and route through the same conditional-spread lowering. Only
      // function-scope (`!isModule`) consts whose value is NOT itself a bare
      // identifier (loop guard) are considered.
      //
      // `this.scope` shadow guard (#2489): an enclosing `.map()` callback's
      // own param can shadow this outer const's name (`.map((attrs) => <p
      // {...attrs} />)`) — without the guard this forwarded the OUTER
      // const's value at every iteration instead of the per-item value.
      // Must be the threaded, position-accurate scope — the same name
      // spread at ROOT (no enclosing loop) must still resolve the const.
      if (/^[A-Za-z_$][\w$]*$/.test(trimmed) && !this.scope.isBound(trimmed)) {
        const localConst = (this.localConstants ?? []).find(
          c => c.name === trimmed && !c.isModule,
        )
        if (localConst?.value !== undefined) {
          const initTrimmed = localConst.value.trim()
          if (!/^[A-Za-z_$][\w$]*$/.test(initTrimmed)) {
            // The local const's initializer text isn't carried as a structured
            // tree on the spread attr, so parse it once via the shared
            // `parseExpression` (the analyzer's own entry) — not
            // `ts.createSourceFile` — mirroring go-template's same local-const
            // resolution path.
            const resolved = conditionalSpreadToPebble(
              this.spreadCtx,
              parseExpression(initTrimmed),
            )
            if (resolved !== null) {
              return `{{ bf.spread_attrs(${resolved}) | raw }}`
            }
          }
        }
      }
      const pebbleExpr = this.convertExpressionToPebble(value.expr)
      return `{{ bf.spread_attrs(${pebbleExpr}) | raw }}`
    },
    // Neither variant is legal on intrinsic elements.
    emitBooleanShorthand: () => '',
    emitJsxChildren: () => '',
  }

  /**
   * Lower a `style={{ … }}` object literal to a `bf.style_object(...)` call,
   * e.g. `{ backgroundColor: color }` → `{{ bf.style_object("background-color",
   * color) }}`. `style_object` is the single oracle-matching sanitizer (ported
   * from Hono's `hasUnsafeStyleValue`): it drops any key:value pair whose
   * value could break out of a CSS declaration and HTML-escapes the rest,
   * returning a value the Java runtime marks safe so Pebble's autoescape
   * doesn't double-escape it (#2261). Returns null when the shape is
   * unsupported or any value can't be lowered (caller falls through to
   * BF101). (#1322)
   */
  private tryLowerStyleObject(expr: string): string | null {
    const entries = parseStyleObjectEntries(expr)
    if (!entries) return null
    for (const e of entries) {
      if (e.kind === 'expr' && !isSupported(parseExpression(e.expr)).supported) return null
    }
    const args = entries.flatMap(e => [
      JSON.stringify(e.cssKey),
      e.kind === 'literal' ? JSON.stringify(e.value) : this.convertExpressionToPebble(e.expr),
    ])
    return `{{ bf.style_object(${args.join(', ')}) }}`
  }

  private renderAttributes(element: IRElement): string {
    const parts: string[] = []

    for (const attr of element.attrs) {
      // `/* @client */` attribute bindings are deferred to hydrate: the
      // client runtime sets/patches the attribute in a mount effect (the
      // CSR template omits it; ir-to-client-js emits the setAttribute
      // effect). Skip SSR emission so the server omits the attribute and
      // the unsupported-expression lowering is never reached for a deferred
      // predicate (no BF101 / BF102). #1966
      if (attr.clientOnly) continue
      // `dangerouslySetInnerHTML` never renders as an HTML attribute — it's
      // handled by `renderDangerousInnerHtml` instead, which replaces the
      // element's children. Skip it here so its `{ __html: ... }` object
      // literal never reaches the generic object-literal BF101 refusal
      // (which would double-report alongside the purpose-built one).
      if (isDangerousInnerHtmlAttr(attr)) continue
      // `key` never renders as a literal HTML attribute — #2753 resolves it
      // onto `element.keyAttr` (name AND value) at IR-build time, emitted
      // separately in `renderElement`. A stray `key` that jsx-to-ir.ts did
      // NOT recognize as a loop row root (so `keyAttr` was never set) has no
      // defined rendering outside a `.map()` anyway; drop it rather than
      // leak an invalid `key="..."` HTML attribute.
      if (attr.name === 'key') continue
      // Rewrite JSX special-prop names to their HTML-attribute counterparts.
      const attrName = attr.name === 'className' ? 'class' : attr.name
      const lowered = emitAttrValue(attr.value, this.elementAttrEmitter, attrName)
      if (lowered) parts.push(lowered)
    }

    return parts.length > 0 ? ' ' + parts.join(' ') : ''
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
        // map literal with an immediate bracket lookup, coalesced with
        // `bf.coalesce` (see this file's header, divergence 3 — Pebble has
        // no native `??`) and the syntax table's point on `Record[key]`
        // lookup: unlike Jinja's dict `.get(key, default)`, neither Twig
        // hashes nor Pebble maps expose a `.get` method, so `bf.coalesce`
        // supplies the same "empty when no case matches" default.
        const keyExpr = this.convertExpressionToPebble(part.key)
        const entries = Object.entries(part.cases)
          .map(([k, v]) => `${pebbleHashKey(k)}: '${escapePebbleSingleQuoted(v)}'`)
          .join(', ')
        parts.push(`bf.string(bf.coalesce({${entries}}[${keyExpr}], ''))`)
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
    let probe = expr.trim()
    while (probe.startsWith('(')) probe = probe.slice(1).trimStart()
    const startsAsObjectLiteral = probe.startsWith('{')
    const hasTaggedTemplate = /[A-Za-z_$][\w$]*\s*`/.test(probe)
    if (!startsAsObjectLiteral && !hasTaggedTemplate) return false
    const parsed = parseExpression(expr.trim())
    const support = isSupported(parsed, { loweringMatchers: this._loweringMatchers })
    if (parsed.kind !== 'unsupported' && support.supported) return false
    const reason = support.reason ?? (parsed.kind === 'unsupported' ? parsed.reason : undefined)
    const reasonLine = reason ? `\n${reason}` : ''
    this.errors.push({
      code: 'BF101',
      severity: 'error',
      message: `Expression not supported on attribute '${attrName}': ${expr.trim()}${reasonLine}`,
      loc: { file: this.componentName + '.tsx', start: { line: 1, column: 0 }, end: { line: 1, column: 0 } },
      suggestion: {
        message: 'The Pebble adapter cannot lower JS object literals or tagged-template-literal expressions into Pebble. Move the expression into a `\'use client\'` component (so hydration computes it), or expand it into discrete attributes whose values are values the adapter can lower.',
      },
    })
    return true
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
      _loweringMatchers: this._loweringMatchers,
      _resolveModuleStringConst: (name) => this._resolveModuleStringConst(name),
      _resolveLiteralConst: (name) => this._resolveLiteralConst(name),
      _resolveStaticRecordLiteral: (o, k) => this._resolveStaticRecordLiteral(o, k),
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
   */
  parseUndefinedAlternateTernary(
    expr: string,
  ): { condition: string; consequent: string; testParsed: ParsedExpr; consequentParsed: ParsedExpr } | null {
    const parsed = parseExpression(expr.trim())
    if (parsed?.kind !== 'conditional') return null
    const alt = parsed.alternate
    const isUndef =
      (alt.kind === 'identifier' && (alt.name === 'undefined' || alt.name === 'null')) ||
      (alt.kind === 'literal' && (alt.value === null || alt.value === undefined))
    if (!isUndef) return null
    // Serialise the parsed sub-expressions back to JS source rather than
    // slicing `expr` text — `indexOf('?')` / `lastIndexOf(':')` would
    // mis-split when the consequent itself contains `?` / `:` inside a
    // string or nested ternary (`cond ? 'a:b' : undefined`).
    return {
      condition: exprToString(parsed.test),
      consequent: exprToString(parsed.consequent),
      testParsed: parsed.test,
      consequentParsed: parsed.consequent,
    }
  }

  isBooleanTypedPropRef(expr: string): boolean {
    let bare = expr.trim()
    if (this.propsObjectName && bare.startsWith(`${this.propsObjectName}.`)) {
      bare = bare.slice(this.propsObjectName.length + 1)
    }
    if (!/^[A-Za-z_$][\w$]*$/.test(bare)) return false
    // Inside a `.map()` callback, a param that shares a boolean prop's name
    // is the ROW binding, not the prop — route it through plain string
    // emission instead of `bf.bool_str` (#2488).
    if (this.isLoopBoundName(bare)) return false
    return this.booleanTypedProps.has(bare)
  }

  /** Position-accurate loop-bound-name check — see `this.scope`'s docstring. */
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
   * `isExplicitStringCall`'s docstring in `boolean-result.ts` for the full
   * double-wrap failure mode this guards against.
   */
  private shouldBoolStr(expr: string, name: string): boolean {
    if (isExplicitStringCall(expr)) return false
    return isBooleanResultExpr(expr) || isAriaBooleanAttr(name) || this.isBooleanTypedPropRef(expr)
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
    if (this.scope.isBound(name)) return null
    const c = (this.localConstants ?? []).find(lc => lc.name === name)
    if (c?.value === undefined) return null
    const v = c.value.trim()
    if (/^-?\d+(\.\d+)?$/.test(v)) return v
    const strLit = /^'([^'\\]*)'$/.exec(v) ?? /^"([^"\\]*)"$/.exec(v)
    if (strLit) return `'${escapePebbleSingleQuoted(strLit[1])}'`
    return null
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
