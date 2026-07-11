/**
 * BarefootJS Blade (PHP) Template Adapter
 *
 * Generates Laravel Blade template files (.blade.php) from BarefootJS IR.
 *
 * Near-mechanical port of the Twig (PHP) adapter
 * (packages/adapter-twig/src/adapter/twig-adapter.ts) — itself a
 * near-mechanical port of the Jinja2 adapter — from Twig syntax to Blade
 * syntax. Both Twig and Blade render through PHP, so most of the JS/PHP
 * semantic divergences documented in the Twig port CARRY OVER unchanged
 * (truthiness, stringification, `bf`→`$bf->`-method-call routing, evaluator-
 * JSON callbacks, `===`/`!==` via `eq`/`neq`, reserved-word mangling,
 * in-template self-reference seeding). What's DIFFERENT is the surrounding
 * template syntax — Blade compiles straight to raw PHP rather than its own
 * expression language, so there is no `strict_variables: false` engine-wide
 * forgiveness, no polymorphic `.`/`[]`, and every variable carries PHP's `$`
 * sigil:
 *
 *   Twig `{{ EXPR }}` (escaped)            → Blade `{!! e(EXPR) !!}` — NOT bare `{{ EXPR }}` (see divergence 0 below: Blade's OWN `{{ }}` would be the natural mapping and DOES compile to `echo e(EXPR)`, but its compiler's regex-based tag matching breaks on evaluator-JSON payload text, so every escaped interpolation in THIS adapter's output explicitly spells out the same `e(...)` call under the `{!! !!}` delimiter instead)
 *   Twig `{{ EXPR | raw }}`                → Blade `{!! EXPR !!}`
 *   Twig `bf.method(args)`                 → Blade `$bf->method(args)`
 *   Twig bare var `name`                   → Blade `$name` (mangled via `bladeIdent`/`bladeVar` — see divergence 1)
 *   Twig `{% if C %}…{% elseif %}…{% else %}…{% endif %}` → Blade `@if(C)…@elseif(…)…@else…@endif`
 *   Twig `{% for x in arr %}…{% endfor %}` → Blade `@foreach((arr ?? []) as $x)…@endforeach` (see divergence 2: raw PHP `foreach` over `null` warns, Twig's `strict_variables: false` didn't)
 *   Twig `{% set x = e %}`                 → Blade `@php($x = e)`
 *   Twig `{'k': v}` hash                    → Blade `['k' => v]` PHP array literal (still ALWAYS-quoted keys — see `lib/blade-naming.ts`)
 *   Twig `~` concat                        → Blade `.` concat (same `$bf->string(...)` routing policy)
 *   Twig `(t ? a : b)` ternary             → Blade same (PHP ternary, unchanged syntax)
 *   Twig `l ?? r`                          → Blade same (PHP `??` also silences undefined-variable/index — see divergence 3)
 *   Twig `bf.eq`/`bf.neq` for `===`/`!==`  → Blade `$bf->eq`/`$bf->neq` — NEVER PHP `==` (loose) nor `===` (`1 === 1.0` is `false` in PHP)
 *   Twig `bf.truthy` in test positions     → Blade `$bf->truthy(...)` — same policy (PHP falsiness diverges from JS)
 *   Twig `{% set NAME %}…{% endset %}` capture → Blade output buffering: `@php(ob_start())` … content … `@php($NAME = $bf->backend->mark_raw(preg_replace('/\n\z/', '', ob_get_clean(), 1)))` (see divergence 4)
 *   Twig `.twig` files, `<snake_case>.twig` → Blade `.blade.php` files, `<snake_case>.blade.php` (`extension = '.blade.php'`)
 *   Twig `a.b` / `a[i]` member/index access → Blade `data_get($a, 'b')` / `data_get($a, $i)` (see divergence 5 — the one place Twig's polymorphic `.` has no raw-PHP equivalent)
 *   Twig evaluator-JSON `*_eval` payloads for callbacks → UNCHANGED — same mechanism, same shared `Barefoot\Evaluator`
 *
 * The render harness this adapter's output assumes: a Blade `Factory` wired
 * from illuminate/view standalone (`Filesystem`, event `Dispatcher`,
 * `EngineResolver` registering a `blade` engine over a `BladeCompiler`, a
 * `FileViewFinder`, tied together by the `Factory`) — see
 * `php/src/BladeBackend.php`'s constructor and file header for the exact
 * wiring and the `Illuminate\Support\e()`/`Htmlable` escaping contract.
 * Templates are named `<snake_case_component>.blade.php` (same convention as
 * Twig's `.twig` files).
 *
 * **Whitespace policy.** Blade directives compile to raw `<?php … ?>` tags
 * spliced into the surrounding template text — e.g. `@if(C)` compiles to
 * `<?php if(C): ?>`. PHP itself has a well-known parser quirk: a `?>`
 * closing tag immediately followed by exactly one newline has that ONE
 * newline SWALLOWED (never emitted), independent of Blade. Verified
 * empirically (`packages/adapter-blade/php`, standalone illuminate/view):
 * rendering a template with `@if`/`@elseif`/`@else`/`@endif`,
 * `@foreach`/`@endforeach`, and `@php(...)` lines EACH on their own source
 * line at column 0 produces NO leaked blank lines around the directives —
 * byte-identical in shape to Twig's `trim_blocks` behavior, but achieved for
 * free via PHP's own tag-adjacent-newline rule rather than a Blade-specific
 * feature. This gives the exact same uniform policy the Twig port already
 * follows: **emit every directive at column 0 of its own source line, never
 * introduce leading indentation before `@`.** No Blade-specific whitespace-
 * control syntax is needed anywhere in this adapter.
 *
 * Divergences beyond the syntax table above (all uniform, not per-fixture —
 * see the individual definition sites for the full rationale):
 *
 *   0. **CRITICAL — every escaped interpolation uses `{!! e(EXPR) !!}`, NEVER
 *      Blade's own `{{ EXPR }}`.** Discovered empirically while porting the
 *      evaluator-JSON callback fixtures (`.reduce`/`.sort`/`.filter` etc. —
 *      divergence 8 below): `Illuminate\View\Compilers\Concerns\
 *      CompilesEchos::compileRegularEchos` finds a `{{ … }}` pair with the
 *      regex `/\{\{\s*(.+?)\s*\}\}(\r?\n)?/s` — a NON-GREEDY match against
 *      the RAW TEMPLATE TEXT, with NO awareness of PHP string-literal
 *      quoting. A serialized-`ParsedExpr` JSON payload for a NESTED
 *      expression (e.g. `x => acc * x.qty`'s AST) routinely contains a
 *      literal `}}` substring where one JSON object closes immediately
 *      inside another (`...,"property":"qty"}}`) — even though that `}}` is
 *      safely inside a single-quoted PHP string literal, Blade's regex does
 *      not know that and terminates the `{{ … }}` tag AT THE FIRST `}}` IT
 *      SEES, truncating the compiled PHP expression mid-string and producing
 *      a syntax error (verified empirically — `BladeCompiler::compileString`
 *      on `{{ $bf->string($bf->reduce_eval($items, '{"kind":"binary",
 *      ...,"property":"qty"}}', ...)) }}` compiles to an unclosed-paren
 *      fragment ending right after the first `}}`, confirmed via
 *      `php -l` on the compiled output). Blade's raw-echo delimiter
 *      (`{!! … !!}`) uses `!!}` as its closer, which this adapter's payload
 *      text never produces (JSON output only ever contains `{`/`}`/quotes/
 *      alphanumerics/punctuation, never `!`), so it is IMMUNE to this
 *      failure mode. This adapter therefore NEVER emits Blade's own
 *      escaped-echo delimiter — every position that needs HTML-escaped
 *      output calls PHP's global `e()` helper (the SAME function `{{ }}`
 *      would have called internally, imported for free via
 *      `illuminate/support`'s composer "files" autoload — see
 *      `BladeBackend.php`'s header for the `Htmlable` pass-through
 *      contract, identical either way) explicitly under `{!! !!}` instead.
 *      This is NOT a narrow, evaluator-only special case — it is applied
 *      UNIFORMLY at every interpolation site in this file (text
 *      expressions, attribute values, boolean-attribute ternaries, style
 *      object values, the scope-id marker, template-literal attrs, provider
 *      value propagation), because any one of them could in principle carry
 *      an evaluator-JSON payload transitively, and a single missed
 *      `{{ }}` site would silently reintroduce this failure mode for
 *      whatever future fixture happens to nest two callback bodies deep
 *      enough to trigger it.
 *   1. **`$` sigil on every variable reference.** Twig identifiers have no
 *      sigil; Blade compiles to raw PHP, where every variable — read OR
 *      `@php(...)` assignment target — is `$name`. `bladeIdent(name)`
 *      (`lib/blade-naming.ts`) mirrors `twigIdent`'s mangling-only role
 *      (bare name, no `$`); `bladeVar(name)` is the NEW wrapper used at
 *      every actual variable-reference emission site. See
 *      `expr/emitters.ts`'s file header for the full rundown of every
 *      emitter call site this affects.
 *   2. **`@foreach` needs an explicit null/undefined guard Twig didn't.**
 *      Twig's `{% for %}` over `strict_variables: false` tolerated an
 *      unbound/`null` array (zero iterations, no error). Raw PHP's
 *      `foreach (null as $x)` raises a `TypeError` (PHP 8) /
 *      `Warning: Invalid argument` (older PHP) — verified empirically. This
 *      adapter therefore ALWAYS wraps the loop array in `(EXPR ?? [])`,
 *      matching Twig's tolerance uniformly rather than per-fixture.
 *   3. **`??` is PHP-native and REPLACES Twig's `strict_variables: false`
 *      forgiveness with a per-use-site policy.** PHP's `??` silences BOTH
 *      an undefined-variable/-array-index notice AND a real `null` in ONE
 *      operator (verified empirically: `$missing ?? 'fb'` and `$x ?? 'fb'`
 *      with `$x = null` both yield `'fb'`, no warning) — same coverage
 *      Twig's native `??` gave (this adapter's divergence 3 in the Twig
 *      port), but Blade has no engine-wide switch equivalent to
 *      `strict_variables: false`; every place a possibly-unbound var is
 *      read (nullable-optional-prop guards, the `Record[key]` lookup
 *      fallback) uses `??`/`isset()` explicitly at that site instead — see
 *      divergence 6 below for the SEPARATE "omit the attribute entirely"
 *      case `??` alone doesn't cover.
 *   4. **Children/fallback capture via output buffering, not a set-block —
 *      and NEVER Blade's bare `@php … @endphp` block form.** Blade has no
 *      Twig-set-block equivalent that captures arbitrary rendered TEMPLATE
 *      OUTPUT (as opposed to a single PHP expression's value) into a
 *      variable. This adapter uses ONE uniform mechanism instead — PHP's
 *      own output buffering: `@php(ob_start())` … the captured body,
 *      rendered normally (so any interpolation inside is escaped exactly as
 *      if it rendered inline) …
 *      `@php($NAME = $bf->backend->mark_raw(preg_replace('/\n\z/', '', ob_get_clean(), 1)))`.
 *      Two things beyond the ob_start/ob_get_clean shape itself:
 *        (a) the trailing `preg_replace('/\n\z/', '', …, 1)` strips exactly
 *            the ONE newline this adapter's own template-string builder
 *            inserts between the captured body and the closing `@php(...)`
 *            line (needed so the directive is preceded by a non-word
 *            character — Blade's directive regex is `\B@word`, which
 *            requires the '@' NOT be glued directly onto a preceding word
 *            character) — without this trim, that synthetic newline is
 *            itself part of the captured buffer and leaks into the
 *            rendered HTML as extra whitespace right before the next
 *            sibling/closing tag (caught by the adapter-conformance suite:
 *            `<h2>Create New Task</h2>` rendering as `...Task </h2>` — a
 *            newline that `normalizeHTML` collapses to a visible trailing
 *            space). The trim is bounded to exactly one synthetic
 *            newline, not `rtrim`-style — content the caller genuinely
 *            renders with real trailing newlines keeps them.
 *        (b) this adapter uses ONLY the single-expression `@php(EXPR)`
 *            directive form, NEVER the bare `@php` / `@endphp` BLOCK form,
 *            anywhere in its emitted templates — verified empirically that
 *            `BladeCompiler::compileString` mishandles a `@php(EXPR)`
 *            occurrence EARLIER in the same template when a bare
 *            `@php ... @endphp` block appears LATER in it (the directive-
 *            matching regex's paren-balancing recovery walk gets confused
 *            by the later bare `@php` token, leaving `@php(EXPR)` OR its
 *            inner expression malformed/uncompiled). Since this adapter
 *            cannot control what OTHER templates its output might be
 *            concatenated/co-rendered alongside, every capture site stays
 *            on the single-expression form exclusively, sidestepping the
 *            whole class of mixed-form parsing quirks.
 *      `mark_raw` wraps the captured string in an `HtmlString`, so a later
 *      plain `{{ $NAME }}` echo does NOT re-escape it (verified empirically
 *      — same "capture once, emit raw once" contract Twig's set-block gave,
 *      see `BladeBackend.php`'s header for why `Illuminate\Support\e()`
 *      makes this work). Every set-block capture site in the Twig port
 *      (`renderComponent`'s children forward, `renderAsync`'s fallback)
 *      maps onto this ONE mechanism here too — always invoked immediately,
 *      in place, with zero arguments, never reused/invoked lazily.
 *   5. **Member/index access lowers to `data_get(...)`, not `.`/`[]`.**
 *      Twig's `.`/`[]` are polymorphic over {stdClass, array, null} under
 *      `strict_variables: false`; raw PHP has NO single operator with that
 *      property (`$x->prop` fatals on a non-object, `$x['key']` warns on
 *      `null`/scalar). This adapter uses Laravel's `data_get($target, $key)`
 *      (from `illuminate/support`, already a transitive dependency of
 *      `illuminate/view` — no NEW runtime dependency, no change to
 *      `packages/adapter-php`) uniformly for both member access (`a.b` →
 *      `data_get($a, 'b')`) and index access (`a[i]` → `data_get($a, $i)`)
 *      — verified null-safe over the SAME {stdClass, array, null} value
 *      shapes Twig's dot/bracket cover (see `lib/blade-naming.ts`'s
 *      `bladeMemberAccess`/`bladeIndexAccess` docstrings for the verification
 *      transcript). This is the ONE place this port required a genuinely new
 *      lowering strategy rather than a mechanical syntax substitution.
 *   6. **Nullable-optional-prop attribute omission uses `isset($x)`, a
 *      SINGLE check — simpler than Twig's TWO-part `is defined and is not
 *      null`.** Twig needed both tests because `is defined` and `is not
 *      none` are separate concerns under `strict_variables: false`. PHP's
 *      `isset($x)` already returns `false` for BOTH "never extracted into
 *      scope" AND "extracted as `null`" in one call (verified empirically —
 *      `isset($rows)` is `false` whether `$rows` was omitted from the
 *      render-vars array entirely or passed as `null`; `true` only when
 *      bound to a non-null value) — so this adapter's `elementAttrEmitter`
 *      guards with `@if(isset($x)) … @endif` instead of a two-part test.
 *   7. **`===`/`!==` route through `$bf->eq`/`$bf->neq`, NEVER PHP's own
 *      `==`/`!=`/`===`/`!==`.** Unchanged from the Twig port's divergence 4
 *      — PHP's `==` is loose (`'1' == 1` is `true`), and PHP's OWN `===` is
 *      wrong the OTHER direction (`1 === 1.0` is `false` in PHP; JS has one
 *      number type, so `1 === 1.0` is `true`). See `expr/emitters.ts`'s file
 *      header for the full rationale.
 *   8. **No Blade lambda** (`expr/emitters.ts` header, divergence 9).
 *      Unchanged from Twig — every higher-order callback routes through the
 *      evaluator-JSON `*_eval` payload; an unserializable predicate surfaces
 *      `BF101`. `.sort`'s non-lambda STRUCTURED fallback (`$bf->sort` with a
 *      `['keys' => […]]` descriptor) is unaffected and ports unchanged.
 *   9. **Reserved-word mangling set is COMPLETELY DIFFERENT from Twig's, for
 *      a different reason** (`lib/blade-naming.ts`). Twig keywords (`for`,
 *      `filter`, `if`, …) collide with TWIG'S OWN grammar — irrelevant here,
 *      since Blade template vars are real PHP variables bound via
 *      `extract()` (`$for`, `$filter` are perfectly legal). What collides
 *      instead is the Blade/illuminate RENDER-TIME PHP SCOPE: `bf` (the
 *      runtime binding), `this` (PHP forbids `$this` reassignment),
 *      `__env`/`__data`/`__path` (illuminate/view internals), `app`
 *      (conventional container binding), `loop` (Blade's own `@foreach`
 *      `$loop`). `blade_ident()` in PHP (`php/src/naming.php`);
 *      `BladeBackend::ident()` delegates to it. Mirrored exactly by
 *      `bladeIdent`/`RESERVED_WORDS` on the TS side, with a parity test on
 *      each side (port of the Twig adapter's parity test).
 *  10. **Blade's own `$loop->index`, not `loop.index0`.** Both engines
 *      expose a 0-based per-iteration index via a builtin loop object —
 *      verified empirically Blade's is `$loop->index` (property, not a
 *      method), coincidentally same 0-based numbering as Twig's
 *      `loop.index0`, just a different property name and `->` access.
 *  11. **`array_merge(...)`, not a chained `|merge` filter, for ordered
 *      component-prop segments.** Twig has no hash-splat syntax, so the
 *      Twig port folds `{...before, ...spread, after: 1}` JSX spread
 *      semantics through repeated `{a}|merge({b})|merge({c})` filter calls.
 *      PHP's `array_merge` is natively variadic AND already resolves later-
 *      argument-wins on string-key conflict (verified empirically — same
 *      semantics `Object.assign`/JSX spread order needs), so this adapter
 *      folds the segment list into ONE `array_merge($seg1, $seg2, …)` call
 *      instead of a chain — simpler, not just a syntax reshuffle.
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
  queryHrefArgs,
  sortComparatorFromArrow,
  isValidHelperId,
  isDangerousInnerHtmlAttr,
  resolveDangerousInnerHtml,
  dangerousInnerHtmlMetacharViolation,
  dangerousInnerHtmlDiagnostic,
} from '@barefootjs/jsx'
import { isAriaBooleanAttr, isBooleanResultExpr, isExplicitStringCall } from './boolean-result.ts'
import type { ParsedExpr, LoweringMatcher } from '@barefootjs/jsx'
import { BF_SLOT, BF_COND, BF_REGION, escapeHtml } from '@barefootjs/shared'

import type { BladeRenderCtx } from './lib/types.ts'
import { BLADE_PRIMITIVE_EMIT_MAP } from './lib/constants.ts'
import {
  bladeHashKey,
  bladeIdent,
  bladeVar,
  escapeBladeSingleQuoted,
  bladeLoopBindingAccessor,
} from './lib/blade-naming.ts'
import {
  resolveJsxChildrenProp,
  collectRootScopeNodes,
} from './lib/ir-scope.ts'
import { renderSortMethod, renderSortEval } from './expr/array-method.ts'
import { BladeFilterEmitter, BladeTopLevelEmitter, truthyTest } from './expr/emitters.ts'
import type { BladeEmitContext, BladeSpreadContext, BladeMemoContext } from './emit-context.ts'
import {
  hasClientInteractivity,
  collectImportedLoopChildComponentErrors,
} from './analysis/component-tree.ts'
import {
  conditionalSpreadToBlade,
  objectLiteralExprToBladeDict,
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

export type { BladeAdapterOptions } from './lib/types.ts'
import type { BladeAdapterOptions } from './lib/types.ts'

export class BladeAdapter extends BaseAdapter implements IRNodeEmitter<BladeRenderCtx> {
  name = 'blade'
  extension = '.blade.php'
  templatesPerComponent = true
  // Template-string target with no component layer: `bf build` emits a static
  // import-map HTML snippet to include into the page <head>.
  importMapInjection = 'html-snippet' as const

  /**
   * Identifier-path callees the Blade runtime can render in template scope.
   * The relocate pass consults this map to mark matching calls as
   * template-safe; the SSR template emitter substitutes the JS call with the
   * registered `$bf->NAME(...)` helper invocation.
   */
  templatePrimitives: TemplatePrimitiveRegistry = BLADE_PRIMITIVE_EMIT_MAP

  private componentName: string = ''
  /** Component root scope element(s) — each carries `data-key` for a keyed loop
   *  item (set by the child renderer from the JSX `key` prop). A plain element
   *  root is one node; an `if-statement` (early-return) root contributes the
   *  top element of every branch. */
  private rootScopeNodes: Set<IRNode> = new Set()
  private options: Required<BladeAdapterOptions>
  private errors: CompilerError[] = []
  private inLoop: boolean = false
  /**
   * `IRLoop.depth` of the loop currently being rendered (save/restore
   * around `renderChildren(loop.children)`, mirroring `inLoop` above).
   * `renderAttributes` reads this to derive the `key` → `data-key`/
   * `data-key-N` suffix — the depth is IR-computed (jsx-to-ir.ts), not
   * re-derived here (#2168 nested-loop-outer-binding).
   */
  private currentLoopKeyDepth = 0
  /**
   * SolidJS-style props identifier (`function(props: P)`) and the
   * analyzer-extracted prop names. Stashed at `generate()` entry so the
   * per-attribute `emitSpread` callback can build a propsObject spread bag as
   * an inline PHP array literal without re-walking the IR.
   */
  private propsObjectName: string | null = null
  private propsParams: { name: string }[] = []
  private booleanTypedProps: Set<string> = new Set()
  /**
   * Names (signal getters + props) whose value is a string. Carried for
   * parity with the Perl-family adapters (Mojo needs it for `eq`/`ne`
   * selection); the Blade emitters don't consume it — `===`/`!==` always
   * routes through `$bf->eq`/`$bf->neq` regardless of operand type (see
   * `blade-adapter.ts`'s file header, divergence 7).
   */
  private stringValueNames: Set<string> = new Set()

  /**
   * Module-scope pure-string consts (`const x = 'literal'`), keyed by name →
   * unescaped value. A className template literal that references such a const
   * (`className={`${x} ${className}`}`) must inline the literal: the const is
   * module-scope, so it never reaches the per-render context, and a bare
   * reference to `x` would resolve to an undefined variable.
   */
  private moduleStringConsts: Map<string, string> = new Map()

  /**
   * (#1922) Local binding names the request-scoped `searchParams()` env signal
   * is imported under (handles `import { searchParams as sp }`). When non-empty
   * the emitter lowers a `<binding>().get(k)` call to a real method call on the
   * per-request `searchParams` reader (`$searchParams->get('sort')`) instead of
   * the generic `data_get` deref. Set at `generate()` entry from
   * `ir.metadata.imports`; read by the top-level ParsedExpr emitter.
   */
  private _searchParamsLocals: Set<string> = new Set()

  /**
   * Call-lowering matchers active for this component (#2057). Bound at
   * `generate()` entry via `prepareLoweringMatchers` and read by the top-level
   * emitter. Covers both userland plugins and the compiler's built-in plugins
   * (e.g. `queryHref` → `$bf->query`, #2042) — one uniform path, no per-API branch.
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
   * Optional, no-default props that are `None` when the caller omits them.
   * Their bare-reference attribute emission is guarded with a Blade
   * `isset($x)` test so the attribute DROPS rather than rendering `attr=""`
   * (Hono-style nullish omission, e.g. textarea's `rows`; see this file's
   * header, divergence 6). The filter excludes destructure-defaulted, rest,
   * and concrete-primitive props.
   */
  private nullableOptionalProps: Set<string> = new Set()

  constructor(options: BladeAdapterOptions = {}) {
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
    // `String(boolean)` ("true"/"false"), not PHP's `(string) bool`
    // ("1"/"") (#1897, pagination's data-active).
    this.booleanTypedProps = collectBooleanTypedProps(ir)
    this.localConstants = ir.metadata.localConstants ?? []
    this.nullableOptionalProps = collectNullableOptionalProps(ir)
    this.stringValueNames = collectStringValueNames(ir)
    this.moduleStringConsts = collectModuleStringConsts(ir.metadata.localConstants)
    this._searchParamsLocals = searchParamsLocalNames(ir.metadata)
    this._loweringMatchers = prepareLoweringMatchers(ir.metadata)
    this.errors = []
    this.childrenCaptureCounter = 0

    // Mirror of the Twig adapter's BF103 check: a child component referenced
    // inside a loop body that is imported from a sibling .tsx emits a
    // cross-template `$bf->render_child(...)` call that resolves only if the
    // sibling template is registered alongside the parent at render time.
    // Surface it loudly here. Suppressed when the caller guarantees that all
    // sibling templates are registered on the same instance at render time.
    if (!options?.siblingTemplatesRegistered) {
      this.errors.push(...collectImportedLoopChildComponentErrors(ir, this.componentName))
    }

    this.rootScopeNodes = collectRootScopeNodes(ir.root)
    const templateBody = ir.root.type === 'if-statement'
      ? this.renderIfStatement(ir.root as IRIfStatement)
      : this.renderNode(ir.root)

    // Generate script registration
    const scriptReg = options?.skipScriptRegistration
      ? ''
      : this.generateScriptRegistrations(ir, options?.scriptBaseName)

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

    // Blade templates have no JS-style imports / types / default-export
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

  private generateScriptRegistrations(ir: ComponentIR, scriptBaseName?: string): string {
    const hasInteractivity = hasClientInteractivity(ir)
    if (!hasInteractivity) return ''

    const name = scriptBaseName ?? ir.metadata.componentName
    const runtimePath = this.options.barefootJsPath
    const clientJsPath = `${this.options.clientJsBasePath}${name}.client.js`

    // `register_script` returns `void` and `@php(...)` is a bare statement
    // directive (never an echo), so — unlike Kolon's `:` line marker, which
    // PRINTS a bare statement's value and forces a throwaway `my` bind — no
    // assignment/bind trick is needed here at all.
    const lines: string[] = []
    lines.push(`@php($bf->register_script('${runtimePath}'))`)
    lines.push(`@php($bf->register_script('${clientJsPath}'))`)
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
    return emitIRNode<BladeRenderCtx>(node, this, {} as BladeRenderCtx)
  }

  // ===========================================================================
  // IRNodeEmitter implementation (Blade)
  // ===========================================================================

  emitElement(node: IRElement, _ctx: BladeRenderCtx, _emit: EmitIRNode<BladeRenderCtx>): string {
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

  emitConditional(node: IRConditional, _ctx: BladeRenderCtx, _emit: EmitIRNode<BladeRenderCtx>): string {
    return this.renderConditional(node)
  }

  emitLoop(node: IRLoop, _ctx: BladeRenderCtx, _emit: EmitIRNode<BladeRenderCtx>): string {
    return this.renderLoop(node)
  }

  emitComponent(node: IRComponent, _ctx: BladeRenderCtx, _emit: EmitIRNode<BladeRenderCtx>): string {
    return this.renderComponent(node)
  }

  emitFragment(node: IRFragment, _ctx: BladeRenderCtx, _emit: EmitIRNode<BladeRenderCtx>): string {
    return this.renderFragment(node)
  }

  emitSlot(node: IRSlot): string {
    return this.renderSlot(node)
  }

  emitIfStatement(node: IRIfStatement, _ctx: BladeRenderCtx, _emit: EmitIRNode<BladeRenderCtx>): string {
    return this.renderIfStatement(node)
  }

  emitProvider(node: IRProvider, _ctx: BladeRenderCtx, _emit: EmitIRNode<BladeRenderCtx>): string {
    // SSR context propagation (#1297): bracket the children with a
    // provide/revoke pair on the shared controller-stash context stack so a
    // descendant `useContext` consumer reads the value during the same
    // render. Both helpers return '' (empty), so the inline `{{ … }}`
    // expression form discards their output cleanly — no extra whitespace,
    // no line-statement needed inside the element body.
    const value = this.providerValueBlade(node.valueProp)
    const children = this.renderChildren(node.children)
    const name = node.contextName
    return (
      `{!! e($bf->provide_context('${name}', ${value})) !!}` +
      children +
      `{!! e($bf->revoke_context('${name}')) !!}`
    )
  }

  /** Lower a `<Ctx.Provider value>` value prop to a Blade expression. */
  private providerValueBlade(valueProp: IRProvider['valueProp']): string {
    const v = valueProp.value
    if (v.kind === 'literal') {
      if (typeof v.value === 'string') {
        return `'${escapeBladeSingleQuoted(v.value)}'`
      }
      if (typeof v.value === 'boolean') return v.value ? 'true' : 'false'
      return String(v.value)
    }
    if (v.kind === 'expression') {
      const dict = this.providerObjectLiteralBlade(v.expr)
      if (dict !== null) return dict
      return this.convertExpressionToBlade(v.expr)
    }
    if (v.kind === 'template') return this.convertTemplateLiteralPartsToBlade(v.parts)
    // Out-of-shape value (spread / jsx-children) — null; consumer defaults.
    return 'null'
  }

  /**
   * Lower an object-literal provider value (`value={{ open: () => props.open
   * ?? false, onOpenChange: … }}`) to a PHP array literal (#1897). The
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
   * maps onto the same array key. Returns `null` when the expression is not a
   * plain object literal (spread / computed key) — the caller falls back to
   * the whole-expression path, which refuses those shapes with BF101.
   */
  private providerObjectLiteralBlade(expr: string): string | null {
    const members = parseProviderObjectLiteral(expr.trim())
    if (members === null) return null
    const entries = members.map(m => {
      const key = bladeHashKey(m.name)
      if (m.kind === 'function' || /^on[A-Z]/.test(m.name)) return `${key} => null`
      const src = m.kind === 'getter' ? m.body : m.expr
      return `${key} => ${this.convertExpressionToBlade(src)}`
    })
    return `[${entries.join(', ')}]`
  }

  emitAsync(node: IRAsync, _ctx: BladeRenderCtx, _emit: EmitIRNode<BladeRenderCtx>): string {
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
    // A root scope element carries `data-key` for a keyed loop item (set on the
    // bf instance by the child renderer from the JSX `key` prop); non-keyed
    // renders add nothing. Mirrors Hono stamping data-key on each loop item's
    // root, including early-return (if-statement) roots. (#1297)
    if (this.rootScopeNodes.has(element) && element.needsScope) {
      hydrationAttrs += ` {!! $bf->data_key_attr() !!}`
    }
    if (element.slotId) {
      hydrationAttrs += ` ${this.renderSlotMarker(element.slotId)}`
    }
    // Page-lifecycle boundary lowered from `<Region>` (spec/router.md). The id
    // is a deterministic static string (`<file scope>:<index>`), so it emits as
    // a plain literal attribute — no Blade directive.
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
   * `dangerouslySetInnerHTML={{ __html: '...' }}` (#2207) — replaces the
   * element's normal children with a compile-time-literal raw-HTML string,
   * spliced directly as template text (never through a `{!! !!}`-style
   * runtime raw-output primitive: the value is already fully known at
   * compile time, so no runtime escape hatch is needed, and using one would
   * reopen a template-source injection surface for no benefit). Returns
   * `null` when the attribute is absent (caller falls through to normal
   * `renderChildren`); a non-`null` string (possibly `''`) means the caller
   * must use it as-is instead — including the dynamic/guard-violation
   * refusal cases, where the empty string is safe filler for a compile that
   * fails anyway.
   */
  private renderDangerousInnerHtml(element: IRElement): string | null {
    const resolution = resolveDangerousInnerHtml(element)
    if (!resolution) return null
    if (resolution.kind === 'dynamic') {
      this.errors.push(dangerousInnerHtmlDiagnostic(resolution.expr, resolution.loc))
      return ''
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
    if (expr.clientOnly) {
      if (expr.slotId) {
        return `{!! $bf->comment("client:${expr.slotId}") !!}`
      }
      return ''
    }

    // Text-position interpolation of a possibly-non-string value — see the
    // file header, "Stringification" (carried unchanged from Twig). Thread
    // the IR-carried `.parsed` tree through (mirrors go-template's
    // `convertExpressionToGo(expr.expr, classify, expr.parsed)`) so a
    // resolved bare-identifier `.map`/`.filter`/… callback
    // (`resolveCallbackMethodFunctionReferences`, #2206) isn't lost to a
    // fresh, unresolved re-parse of the raw string.
    const bladeExpr = `$bf->string(${this.convertExpressionToBlade(expr.expr, expr.parsed)})`

    if (expr.slotId) {
      return `{!! $bf->text_start("${expr.slotId}") !!}{!! e(${bladeExpr}) !!}{!! $bf->text_end() !!}`
    }

    return `{!! e(${bladeExpr}) !!}`
  }

  // ===========================================================================
  // Conditional Rendering
  // ===========================================================================

  renderConditional(cond: IRConditional): string {
    if (cond.clientOnly && cond.slotId) {
      return `{!! $bf->comment("cond-start:${cond.slotId}") !!}{!! $bf->comment("cond-end:${cond.slotId}") !!}`
    }

    const condition = this.convertConditionToBlade(cond.condition)
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
        ? `\n@if(${condition})\n${whenTrue}\n@else\n${whenFalse}\n@endif\n`
        : `\n@if(${condition})\n${whenTrue}\n@endif\n`
      result = `{!! $bf->comment("cond-start:${cond.slotId}") !!}${inner}{!! $bf->comment("cond-end:${cond.slotId}") !!}`
    } else if (markedFalse) {
      result = `\n@if(${condition})\n${markedTrue}\n@else\n${markedFalse}\n@endif\n`
    } else if (cond.slotId) {
      // Conditional with no else: wrap with comment markers for client hydration
      result = `{!! $bf->comment("cond-start:${cond.slotId}") !!}\n@if(${condition})\n${whenTrue}\n@endif\n{!! $bf->comment("cond-end:${cond.slotId}") !!}`
    } else {
      result = `\n@if(${condition})\n${whenTrue}\n@endif\n`
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
    return `{!! $bf->comment("cond-start:${condId}") !!}${content}{!! $bf->comment("cond-end:${condId}") !!}`
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
      return `{!! $bf->comment("loop:${loop.markerId}") !!}{!! $bf->comment("/loop:${loop.markerId}") !!}`
    }

    // A `.map()` destructure loop param (`([k, v]) => ...` / `({ id, title,
    // ...rest }) => ...`) lowers to a Blade `@php(...)` local per binding, off
    // a structured accessor built from `LoopParamBinding.segments` (#2087) —
    // see `bladeLoopBindingAccessor`. `isLowerableLoopDestructure` (#2087
    // Phase A) admits: fixed bindings at any field/index depth (`.field`,
    // `[k, v]`, and nested combinations), array-rest (`[first, ...tail]` →
    // `$bf->slice`), and object-rest (`{ id, ...rest }` → `$bf->omit`) whose
    // every use is a member read (`rest.flag`) or a `{...rest}` spread onto
    // an intrinsic element. Still refused (→ BF104): any OTHER object-rest
    // use (needs the actual residual value some other way, e.g.
    // `String(rest)` or `{...fn(rest)}`), a `.filter().map(destructure)`
    // chain (needs the filter-param rewrite to retarget the synthetic
    // per-item var), and a binding name in the reserved `__bf_` namespace
    // (would collide with the synthetic per-item loop var). (#1310, #2087)
    const destructure = !!(loop.paramBindings && loop.paramBindings.length > 0)
    const supportableDestructure = destructure && isLowerableLoopDestructure(loop)
    if (destructure && !supportableDestructure) {
      this.errors.push({
        code: 'BF104',
        severity: 'error',
        message: `Loop callback uses a destructure pattern (\`${loop.param}\`) that the Blade adapter cannot lower — e.g. an object-rest binding used as a bare value, a \`.filter().map(destructure)\` chain, or a reserved \`__bf_\`-prefixed binding name.`,
        loc: loop.loc ?? { file: this.componentName + '.tsx', start: { line: 1, column: 0 }, end: { line: 1, column: 0 } },
        suggestion: {
          message:
            `Options:\n` +
            `  1. Read the rest binding via member access (\`rest.flag\`) or spread it onto the element (\`{...rest}\`) instead of using it as a bare value.\n` +
            `  2. Mark the loop position as @client-only so the destructure runs in JS on the client.\n` +
            `  3. Move the loop into a primitive that the adapter registers explicitly.`,
        },
      })
    }

    // A `.map()` loop whose array is a bare identifier bound to a
    // FUNCTION-scope local const with a non-statically-evaluable initializer
    // that reads props/signals (e.g. `const entries =
    // Object.entries(props.x ?? {}).filter(...)`) can't render correctly.
    // Module-scope consts (`isModule`, e.g. `const payments = [...]` at the
    // top of the file) are a DIFFERENT, already-working case — the shared
    // `ssr-defaults.ts` statically evaluates those and seeds them straight
    // into the render context, so a bare `payments` reference resolves for
    // free (data-table demo). Function-scope locals get no such seeding
    // (`ssr-defaults.ts`: "component-scope locals can depend on
    // signals/props and are evaluated lazily elsewhere") — and this
    // adapter's only "elsewhere" is inlining a const's value at its use
    // site (`_resolveLiteralConst`'s numeric/single-quoted-string fast
    // path, or a static-record-literal lookup), never binding one as a
    // `@php(...)` template local. Left unchecked, `@foreach($entries as
    // $item)` over an unbound name would raise a PHP undefined-variable
    // warning (this file header's divergence 2 — no `strict_variables:
    // false` forgiveness here) instead of failing loudly at COMPILE time.
    // Pre-existing, general limitation, orthogonal to #2087's
    // destructure-binding work — newly reachable in this adapter's test
    // corpus only because the widened destructure gate (#2087 Phase A/B)
    // no longer refuses this fixture's `([emoji, users]) => ...` param
    // first. Same policy and shape as the Jinja / ERB adapters' check.
    const arrayName = loop.array.trim()
    if (/^[A-Za-z_$][\w$]*$/.test(arrayName)) {
      const arrayConst = (this.localConstants ?? []).find(c => c.name === arrayName)
      if (arrayConst && !arrayConst.isModule && this._resolveLiteralConst(arrayName) === null) {
        this.errors.push({
          code: 'BF101',
          severity: 'error',
          message: `Loop array \`${arrayName}\` is a local computed value (\`${arrayConst.value}\`) that the Blade adapter cannot bind as a template variable — only numeric/string-literal locals inline at their use site.`,
          loc: loop.loc ?? { file: this.componentName + '.tsx', start: { line: 1, column: 0 }, end: { line: 1, column: 0 } },
          suggestion: {
            message:
              'Pre-compute the array server-side and pass it as a prop, or mark the loop position as @client-only so it runs in JS on the client.',
          },
        })
      }
    }

    const rawArray = this.convertExpressionToBlade(loop.array)
    // Apply sort if present: wrap the loop array in the shared `$bf->sort`
    // helper, binding the sorted result to a per-iteration local so the
    // helper runs once.
    let array = rawArray
    if (loop.sortComparator) {
      // Evaluator-first (#2018 P3): serialize the comparator arrow body + emit
      // `$bf->sort_eval`; fall back to the structured `$bf->sort` for a
      // comparator the evaluator can't model (e.g. `localeCompare`). The
      // comparator now arrives as an `IRLoopSort` carrying the generic
      // `arrow` + its params.
      const sort = loop.sortComparator
      const sortEmit = (e: ParsedExpr) => this.convertExpressionToBlade('', e)
      const arrow = sort.arrow
      const params =
        arrow.kind === 'arrow' ? arrow.params : [sort.paramA, sort.paramB]
      const structured = sortComparatorFromArrow(arrow)
      array =
        renderSortEval(rawArray, arrow.kind === 'arrow' ? arrow.body : arrow, params, sortEmit) ??
        (structured !== null ? renderSortMethod(rawArray, structured) : rawArray)
    }
    const param = loop.param
    // Blade's `@foreach(array as item)` binds the item directly (with the
    // divergence-2 null/undefined guard applied at the call site below). The
    // index, when needed (`.keys().map(k => ...)` or an explicit `index`
    // param), comes from Blade's own loop object (`$loop->index`, 0-based —
    // see this file's header, divergence 10) — no Kolon-style `$~loopvar.index`
    // indirection needed.
    const renderedChildren = this.renderChildren(loop.children)

    // For `keys`-shape iterations the callback param IS the index. We iterate
    // the array but bind the loop var to a throwaway and expose the index as
    // the param name via Blade's built-in `$loop->index`.
    const loopVar = loop.iterationShape === 'keys'
      ? '__bf_item'
      : supportableDestructure ? '__bf_item' : param

    // Index alias: when an explicit `index` param is present (`.map((x, i) =>
    // ...)`) or the iteration is `keys`-shaped, expose it via a `@php(...)`
    // local bound to Blade's `$loop->index`. A supported destructure param adds
    // one `@php(...)` local per binding, built from the binding's structured
    // `segments` path (never `b.path` verbatim — see `bladeLoopBindingAccessor`
    // for why a naive JS-accessor splice mis-lowers on Blade/stdClass):
    //   - fixed binding: the full accessor off the per-item var.
    //   - array-rest (`[first, ...tail]`): `$bf->slice(parent, from, null)` —
    //     `parent` is the accessor for `segments` (the rest token's PARENT
    //     prefix, empty at the loop root), `from` is the rest's start index.
    //   - object-rest (`{ id, ...rest }`): `$bf->omit(parent, [excludeKeys])` —
    //     a TRUE residual hash (not an alias of the whole item), so a use
    //     other than member-access / spread (already refused by the gate)
    //     can't observe a sibling field the pattern destructured explicitly.
    const indexLocalLines: string[] = []
    if (loop.objectIteration) {
      // `key`/`value` bind directly in the `@foreach` header (see below)
      // via `$bf->entries`/`$bf->keys`/`$bf->values` — no derived
      // `$loop->index` local needed, unlike the array `iterationShape` cases.
    } else if (loop.iterationShape === 'keys') {
      indexLocalLines.push(`@php(${bladeVar(param)} = $loop->index)`)
    } else if (loop.index) {
      indexLocalLines.push(`@php(${bladeVar(loop.index)} = $loop->index)`)
    }
    if (supportableDestructure) {
      const loopVarRef = bladeVar(loopVar)
      for (const b of loop.paramBindings ?? []) {
        const parentAccessor = bladeLoopBindingAccessor(loopVarRef, b.segments ?? [])
        if (b.rest?.kind === 'array') {
          indexLocalLines.push(
            `@php(${bladeVar(b.name)} = $bf->slice(${parentAccessor}, ${b.rest.from}, null))`,
          )
        } else if (b.rest?.kind === 'object') {
          const excludeList = b.rest.exclude
            .map(k => `'${escapeBladeSingleQuoted(k.key)}'`)
            .join(', ')
          indexLocalLines.push(
            `@php(${bladeVar(b.name)} = $bf->omit(${parentAccessor}, [${excludeList}]))`,
          )
        } else {
          indexLocalLines.push(`@php(${bladeVar(b.name)} = ${parentAccessor})`)
        }
      }
    }

    const prevInLoop = this.inLoop
    this.inLoop = true
    const prevLoopKeyDepth = this.currentLoopKeyDepth
    this.currentLoopKeyDepth = loop.depth
    // Re-render children now that inLoop is set (so nested components use the
    // loop-child naming convention). renderedChildren above was computed with
    // the previous flag; recompute under the loop flag.
    const childrenUnderLoop = this.renderChildren(loop.children)
    this.currentLoopKeyDepth = prevLoopKeyDepth
    this.inLoop = prevInLoop
    void renderedChildren

    // Whole-item conditional: prepend an always-present `<!--bf-loop-i:KEY-->`
    // anchor before each item's (possibly empty) conditional content so the
    // client's `mapArrayAnchored` can hydrate every SSR-rendered item by its
    // anchor.
    const bodyChildren =
      loop.bodyIsItemConditional && loop.key
        ? `{!! $bf->comment('loop-i:' . $bf->string(${this.convertExpressionToBlade(loop.key)})) !!}\n${childrenUnderLoop}`
        : childrenUnderLoop

    const lines: string[] = []
    // Scoped per-call-site marker so sibling `.map()`s under the same parent
    // each get their own reconciliation range.
    lines.push(`{!! $bf->comment("loop:${loop.markerId}") !!}`)
    // See this file's header, divergence 2: raw PHP `foreach` over a
    // null/undefined array raises, unlike Twig's `strict_variables: false`
    // tolerance — the `?? []` guard restores that same tolerance uniformly.
    //
    // `objectIteration` (#2168 object-entries-map): PHP's native `foreach`
    // CAN iterate a `stdClass` object's public properties directly (unlike
    // Twig's `for` tag, which needs `Traversable`) — but this still routes
    // through `$bf->entries`/`$bf->keys`/`$bf->values` for the same
    // defensive non-object guard Twig needs and for a single source of
    // truth on "is this a JS object" (`isJsObject`, `BarefootJS.php`); the
    // `(array)` cast those methods do preserves the object's own insertion
    // order either way.
    const forHeader = loop.objectIteration === 'entries'
      ? `@foreach($bf->entries(${array} ?? []) as ${bladeVar(loop.index ?? param)} => ${bladeVar(param)})`
      : loop.objectIteration === 'keys'
        ? `@foreach($bf->keys(${array} ?? []) as ${bladeVar(param)})`
        : loop.objectIteration === 'values'
          ? `@foreach($bf->values(${array} ?? []) as ${bladeVar(param)})`
          : `@foreach((${array} ?? []) as ${bladeVar(loopVar)})`
    lines.push(forHeader)
    for (const il of indexLocalLines) lines.push(il)

    // Handle filter().map() pattern by wrapping children in if-condition
    if (loop.filterPredicate) {
      let filterCond: string
      if (loop.filterPredicate.predicate) {
        filterCond = this.renderBladeFilterExpr(
          loop.filterPredicate.predicate,
          loop.filterPredicate.param
        )
        // See the file header, divergence tied to `expr/emitters.ts`'s
        // divergence 4: the loop-hoist filter test is a condition position too.
        filterCond = truthyTest(loop.filterPredicate.predicate, filterCond)
      } else {
        filterCond = 'true'
      }
      // Map filter param to loop param (e.g., t → todo). Word-boundary
      // rename over the RENDERED text, scoped to the `$`-sigiled token so a
      // substring match inside an unrelated identifier (or this adapter's
      // own `$bf`/`$loop`) can't misfire — the SAME mechanism Kolon uses,
      // made trivially safe here by Blade's `$` sigil (see `lib/ir-scope.ts`'s
      // file header for the analogous point about `extractTopLevelIdentifiers`).
      if (loop.filterPredicate.param !== param) {
        filterCond = filterCond.replace(
          new RegExp(`\\$${loop.filterPredicate.param}\\b`, 'g'),
          bladeVar(param)
        )
      }
      lines.push(`@if(${filterCond})`)
      lines.push(bodyChildren)
      lines.push(`@endif`)
    } else {
      lines.push(bodyChildren)
    }

    lines.push(`@endforeach`)
    lines.push(`{!! $bf->comment("/loop:${loop.markerId}") !!}`)

    return lines.join('\n')
  }

  // ===========================================================================
  // Component Rendering
  // ===========================================================================

  /**
   * AttrValue lowering for component invocation props (Blade array-entry
   * form). Blade/PHP CANNOT splat an array into positional args, so every
   * prop is emitted as a `'key' => value` entry that the caller collects
   * into ONE array literal passed to `$bf->render_child(name, [ ... ])`.
   *
   * `jsx-children` returns empty — children are captured via the output-
   * buffering mechanism below, not threaded through the entry list.
   */
  private readonly componentPropEmitter: AttrValueEmitter = {
    emitLiteral: (value, name) => `${bladeHashKey(name)} => '${escapeBladeSingleQuoted(value.value)}'`,
    emitExpression: (value, name) => {
      if (value.parts) {
        return `${bladeHashKey(name)} => ${this.convertTemplateLiteralPartsToBlade(value.parts)}`
      }
      // Inline object-literal child prop (carousel's `opts={{ align: 'start' }}`):
      // lower to a PHP array so the child can serialize it (`data-opts`),
      // instead of refusing the bare object with BF101. (#1971) Read the
      // IR-carried structured `ParsedExpr` tree (#2018) instead of
      // re-parsing `value.expr`; the lowering returns null for any
      // non-object-literal shape, so the common non-object case falls
      // straight through to the bare-expression path below.
      if (value.parsed) {
        const dict = objectLiteralExprToBladeDict(this.spreadCtx, value.parsed)
        if (dict !== null) return `${bladeHashKey(name)} => ${dict}`
      }
      return `${bladeHashKey(name)} => ${this.convertExpressionToBlade(value.expr)}`
    },
    emitSpread: (value) => {
      // PHP array literals can't be splatted into the entry list the way
      // `**` flattens Ruby/Python kwargs into a call literal. `renderComponent`
      // handles EVERY spread shape itself (both the enumerated propsObject
      // case and the general `array_merge(...)` fold — see its own docstring),
      // so this callback is never reached for `kind: 'spread'` props; it
      // only exists to satisfy the `AttrValueEmitter` interface.
      return this.convertExpressionToBlade(value.expr)
    },
    emitTemplate: (value, name) =>
      `${bladeHashKey(name)} => ${this.convertTemplateLiteralPartsToBlade(value.parts)}`,
    emitBooleanAttr: (_value, name) => `${bladeHashKey(name)} => true`,
    emitBooleanShorthand: (_value, name) => `${bladeHashKey(name)} => true`,
    // JSX children flow through the output-buffering capture below; they're
    // not part of the entry list.
    emitJsxChildren: () => '',
  }

  /**
   * A `renderComponent` props array, built as an ORDERED sequence of
   * segments so `{...before, ...spread, after: 1}` JSX spread semantics
   * (later entries win) survive the trip through Blade/PHP, which has no
   * array-splat call syntax. Each `'entries'` segment is a literal PHP
   * array `[k => v, ...]`; each `'spread'` segment is an arbitrary
   * expression lowered from a `{...expr}` prop. `combineComponentPropSegments`
   * folds the sequence into ONE expression via `array_merge(...)` (later
   * segment wins on key conflict, matching `Object.assign`/JSX order — see
   * this file's header, divergence 11).
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
   * Fold ordered prop segments into a single PHP expression via ONE
   * variadic `array_merge(...)` call — later argument wins on string-key
   * conflict, exactly like `{...a, ...b}` (verified empirically). Empty
   * `'entries'` segments are dropped so a leading/trailing spread doesn't
   * drag in a needless `[]` argument. Returns `'[]'` when every segment is
   * empty (no props at all); returns the lone segment directly (no
   * `array_merge` wrapper) when there is exactly one.
   */
  private combineComponentPropSegments(
    segments: ReadonlyArray<{ kind: 'entries'; parts: string[] } | { kind: 'spread'; expr: string }>,
  ): string {
    const parts: string[] = []
    for (const seg of segments) {
      const text = seg.kind === 'entries'
        ? (seg.parts.length > 0 ? `[${seg.parts.join(', ')}]` : null)
        : seg.expr
      if (text !== null) parts.push(text)
    }
    if (parts.length === 0) return '[]'
    if (parts.length === 1) return parts[0]
    return `array_merge(${parts.join(', ')})`
  }

  renderComponent(comp: IRComponent): string {
    type Segment = { kind: 'entries'; parts: string[] } | { kind: 'spread'; expr: string }
    const segments: Segment[] = [{ kind: 'entries', parts: [] }]
    const currentEntries = () => this.componentPropSegmentEntries(segments)
    // Named JSX-valued props OTHER than the reserved `children`
    // (`header={<strong>Title</strong>}`, #2168 jsx-element-prop) each get
    // their own output-buffering capture, prepended to the final returned
    // string below — same mechanism as the reserved children capture,
    // just keyed by the prop's own name instead of `children`.
    const namedSlotCaptures: string[] = []

    for (const p of comp.props) {
      // Skip callback props (onXxx) and `ref` — both are client-only for
      // SSR (Hono renders neither; the client JS wires them at hydration).
      if ((p.name.match(/^on[A-Z]/) || p.name === 'ref') && p.value.kind === 'expression') continue
      if (p.value.kind === 'jsx-children' && p.name !== 'children') {
        const prevInLoop = this.inLoop
        this.inLoop = false
        const slotBody = this.renderChildren(p.value.children)
        this.inLoop = prevInLoop
        // Purely counter-based — NOT derived from `p.name` or `comp.slotId`.
        // A JSX prop name can contain characters (`data-slot`) `bladeIdent`
        // doesn't sanitize (it only guards reserved words), producing an
        // invalid PHP variable name; `comp.slotId` alone would also collide
        // across two named-slot props on the same component invocation
        // (unlike the reserved children slot, there's only ever one of
        // those per invocation).
        const captureVar = bladeVar(`bf_prop_${this.childrenCaptureCounter++}`)
        namedSlotCaptures.push(
          `@php(ob_start())\n${slotBody}\n` +
          `@php(${captureVar} = $bf->backend->mark_raw(preg_replace('/\\n\\z/', '', ob_get_clean(), 1)))`,
        )
        currentEntries().push(`${bladeHashKey(p.name)} => ${captureVar}`)
        continue
      }
      if (p.value.kind === 'spread') {
        const trimmed = p.value.expr.trim()
        // SolidJS-style props identifier (`function(props: P)`) has no
        // matching runtime array in Blade scope — props arrive as a flat
        // set of top-level template vars, so enumerate the
        // analyzer-extracted props params into array entries instead of
        // treating it as a runtime spread expression.
        if (this.propsObjectName && this.propsObjectName === trimmed) {
          for (const pp of this.propsParams) {
            currentEntries().push(`${bladeHashKey(pp.name)} => ${bladeVar(pp.name)}`)
          }
          continue
        }
        // Every other spread shape (a destructure rest-bag `props`, a
        // member-access bag like `children.props`, an intrinsic-element
        // spread helper's own operand, …) — PHP array literals can't
        // splat a runtime array into named entries at a call site, but
        // `array_merge` can fold it into the accumulated array at the
        // right ordinal position, mirroring ERB's `**hash` / Mojolicious's
        // `%{$props}` blind splat: no compile-time filtering of onXxx/ref
        // keys out of the runtime bag (the render contract tolerates
        // them, same as the other two adapters). The operand is routed
        // through `$bf->omit(expr, [])` (the #2087 object-rest residual
        // helper, called with an empty exclude list) rather than a bare
        // `?? []` guard: a request-scoped bag round-trips through
        // `json_decode` as a `stdClass`, and PHP's `array_merge` raises a
        // `TypeError` on anything that isn't an array (verified
        // empirically — `stdClass` is rejected even though `data_get`
        // accepts it). `$bf->omit` already normalises BOTH shapes
        // (`stdClass` → assoc array, `null`/non-object → `[]`) into a
        // plain PHP array `array_merge` accepts, exactly like the
        // `$bf->spread_attrs(...)` runtime helper the intrinsic-element
        // spread path uses (that one tolerates any bag shape itself,
        // since it's a plain function call rather than a language-level
        // array operator).
        const spreadExpr = this.convertExpressionToBlade(p.value.expr)
        segments.push({ kind: 'spread', expr: `$bf->omit(${spreadExpr}, [])` })
        continue
      }
      const lowered = emitAttrValue(p.value, this.componentPropEmitter, p.name)
      if (lowered) currentEntries().push(lowered)
    }
    // Pass slot ID so the child renderer can set correct scope ID for
    // hydration. Skip for loop children — they use ComponentName_random.
    // Appended to whatever the trailing entries segment is so a spread's
    // own `_bf_slot`/`children` keys (if any) never win over these
    // compiler-controlled entries.
    if (comp.slotId && !this.inLoop) {
      currentEntries().push(`${bladeHashKey('_bf_slot')} => '${comp.slotId}'`)
    }
    const tplName = this.toTemplateName(comp.name)

    // Resolve the effective children: a nested `<Box>…</Box>` populates
    // `comp.children`; an attribute-form `<Box children={<jsx/>} />` lands in
    // a `jsx-children` AttrValue on the corresponding prop.
    const effectiveChildren: IRNode[] = comp.children.length > 0
      ? comp.children
      : resolveJsxChildrenProp(comp.props)

    if (effectiveChildren.length > 0) {
      // Forward JSX children via the output-buffering capture (this file's
      // header, divergence 4). The block body is evaluated in the parent's
      // template scope (signals, conditionals) and produces the children
      // HTML as a captured `HtmlString`; the captured var is passed as the
      // `children` entry of the render_child array. `render_child`
      // materializes it through the backend before handing it to the child.
      const prevInLoop = this.inLoop
      this.inLoop = false
      const childrenBody = this.renderChildren(effectiveChildren)
      this.inLoop = prevInLoop
      const captureVar = bladeVar(`bf_children_${comp.slotId ?? 'c' + this.childrenCaptureCounter++}`)
      currentEntries().push(`${bladeHashKey('children')} => ${captureVar}`)
      const dict = this.combineComponentPropSegments(segments)
      return (
        namedSlotCaptures.join('') +
        `@php(ob_start())\n${childrenBody}\n` +
        `@php(${captureVar} = $bf->backend->mark_raw(preg_replace('/\\n\\z/', '', ob_get_clean(), 1)))` +
        `{!! $bf->render_child('${tplName}', ${dict}) !!}`
      )
    }

    const isEmpty = segments.every(s => s.kind === 'entries' && s.parts.length === 0)
    const dictEntries = isEmpty ? '' : `, ${this.combineComponentPropSegments(segments)}`
    return `${namedSlotCaptures.join('')}{!! $bf->render_child('${tplName}'${dictEntries}) !!}`
  }

  private childrenCaptureCounter = 0

  /** Uniquifies the `presenceOrUndefined` temp binding (`bf_puN`) so two
   *  presence-folded attrs in one template don't collide. */
  private presenceVarCounter = 0

  private toTemplateName(componentName: string): string {
    // Convert PascalCase to snake_case for template naming.
    return componentName
      .replace(/([A-Z])/g, '_$1')
      .toLowerCase()
      .replace(/^_/, '')
  }

  // ===========================================================================
  // If-Statement (Conditional Return) Rendering
  // ===========================================================================

  private renderIfStatement(ifStmt: IRIfStatement): string {
    const condition = this.convertConditionToBlade(ifStmt.condition)
    const consequent = ifStmt.consequent.type === 'if-statement'
      ? this.renderIfStatement(ifStmt.consequent as IRIfStatement)
      : this.renderNode(ifStmt.consequent)
    let result = `@if(${condition})\n${consequent}\n`

    if (ifStmt.alternate) {
      if (ifStmt.alternate.type === 'if-statement') {
        const altResult = this.renderIfStatement(ifStmt.alternate as IRIfStatement)
        // Replace leading "@if(" with "@elseif(".
        result += altResult.replace(/^@if\(/, '@elseif(')
      } else {
        const alternate = this.renderNode(ifStmt.alternate)
        result += `@else\n${alternate}\n`
      }
    }

    result += `@endif`
    return result
  }

  // ===========================================================================
  // Fragment & Slot Rendering
  // ===========================================================================

  private renderFragment(fragment: IRFragment): string {
    const children = this.renderChildren(fragment.children)
    if (fragment.needsScopeComment) {
      return `{!! $bf->scope_comment() !!}${children}`
    }
    return children
  }

  private renderSlot(_slot: IRSlot): string {
    // Captured children arrive under the `children` context key (see
    // renderComponent's output-buffering capture + render_child call), so
    // the var is `$children`. The content is already-rendered markup, so
    // emit it as-is via `{!! !!}` — otherwise Blade's `e()` escaping would
    // entity-escape the child tags. (The IR producer doesn't currently emit
    // `slot` nodes — `{children}` lowers to an expression whose captured
    // value is already raw — so this is defensive correctness for if/when a
    // slot node is produced.)
    return `{!! ${bladeVar('children')} !!}`
  }

  override renderAsync(node: IRAsync): string {
    const fallback = this.renderNode(node.fallback)
    const children = this.renderChildren(node.children)
    // Capture the fallback via the output-buffering mechanism (this file's
    // header, divergence 4) and pass its rendered HTML to
    // `$bf->async_boundary`, which wraps it in a `<div bf-async="aX">`
    // placeholder. Same shape as `renderComponent`'s children capture.
    const captureVar = bladeVar(`bf_async_fallback_${node.id}`)
    return (
      `@php(ob_start())\n${fallback}\n` +
      `@php(${captureVar} = $bf->backend->mark_raw(preg_replace('/\\n\\z/', '', ob_get_clean(), 1)))` +
      `{!! $bf->async_boundary('${node.id}', ${captureVar}) !!}\n${children}`
    )
  }

  // ===========================================================================
  // Attribute Rendering
  // ===========================================================================

  /**
   * AttrValue lowering for intrinsic-element attributes (Blade).
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
      // Refuse shapes that the lowering pipeline can't represent in Blade —
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
        this.nullableOptionalProps.has(normalizedBareId)
      ) {
        const blade = this.convertExpressionToBlade(value.expr)
        const body = this.shouldBoolStr(value.expr, name)
            ? `${name}="{!! e($bf->bool_str(${blade})) !!}"`
            : `${name}="{!! e($bf->string(${blade})) !!}"`
        // `blade` is a bare `$name` variable reference for this narrowly-
        // gated shape, so it doubles as both the `isset()` guard test and
        // the display value — a SINGLE check that covers both "never
        // extracted into scope" and "extracted as null" (this file's
        // header, divergence 6 — simpler than Twig's two-part `is defined
        // and is not null`).
        return `\n@if(isset(${blade}))\n${body}\n@endif\n`
      }
      if (isBooleanAttr(name)) {
        // Boolean attributes: render conditionally (present or absent).
        const blade = this.convertExpressionToBlade(value.expr)
        return `{!! e((${this.wrapConditionExpr(value.expr, blade)} ? '${name}' : '')) !!}`
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
        const blade = this.convertExpressionToBlade(value.expr)
        const tmpName = `bf_pu${this.presenceVarCounter++}`
        const tmp = bladeVar(tmpName)
        const body = this.shouldBoolStr(value.expr, name)
            ? `${name}="{!! e($bf->bool_str(${tmp})) !!}"`
            : `${name}="{!! e($bf->string(${tmp})) !!}"`
        return `\n@php(${tmp} = ${blade})\n@if(${this.wrapConditionExpr(value.expr, tmp)})\n${body}\n@endif\n`
      }
      // `attr={cond ? value : undefined}` OMITS the attribute on the
      // falsy branch (Hono drops undefined-valued attributes) — wrap the
      // whole attribute in the condition instead of rendering `attr=""`
      // (#1897, pagination's `aria-current={props.isActive ? 'page' :
      // undefined}`). Same parity rule the Go adapter applies.
      {
        const m = this.parseUndefinedAlternateTernary(value.expr)
        if (m) {
          const cond = this.convertConditionToBlade(m.condition)
          const val = this.convertExpressionToBlade(m.consequent)
          return `\n@if(${cond})\n${name}="{!! e($bf->string(${val})) !!}"\n@endif\n`
        }
      }
      // Boolean-result handling: route boolean-shaped values through
      // `$bf->bool_str` so the wire bytes match JS `String(boolean)`. Every
      // other value is a text-position interpolation — route through
      // `$bf->string` (see the file header, "Stringification").
      const blade = this.convertExpressionToBlade(value.expr)
      if (this.shouldBoolStr(value.expr, name)) {
        return `${name}="{!! e($bf->bool_str(${blade})) !!}"`
      }
      return `${name}="{!! e($bf->string(${blade})) !!}"`
    },
    emitBooleanAttr: (_value, name) => name,
    emitTemplate: (value, name) =>
      `${name}="{!! e(${this.convertTemplateLiteralPartsToBlade(value.parts)}) !!}"`,
    // Spread attributes (`<div {...attrs()} />`) lower through the
    // `$bf->spread_attrs` runtime helper, mirroring the Jinja/Twig adapters.
    emitSpread: (value) => {
      if (this.refuseUnsupportedAttrExpression(value.expr, '...')) {
        return ''
      }
      // SolidJS-style props identifier (`(props: P) { <el {...props}/> }`) has
      // no matching context array in Blade scope — props arrive as a flat set
      // of top-level template vars. Emit an inline array literal enumerating
      // the analyzer-extracted props params.
      const trimmed = value.expr.trim()
      if (this.propsObjectName && this.propsObjectName === trimmed) {
        const entries = this.propsParams.map(p =>
          `${bladeHashKey(p.name)} => ${bladeVar(p.name)}`,
        )
        return `{!! $bf->spread_attrs([${entries.join(', ')}]) !!}`
      }
      // Conditional inline-object spread (#textarea):
      //   `{...(COND ? { 'aria-describedby': describedBy } : {})}`
      // Emit a PHP inline ternary of arrays — the falsy `[]` branch OMITS
      // the key (`spread_attrs` does NOT emit empty-array entries).
      // Read the spread's IR-carried `ParsedExpr` tree (#2018) instead of
      // re-parsing `trimmed`.
      const ternaryDict = conditionalSpreadToBlade(this.spreadCtx, value.parsed)
      if (ternaryDict !== null) {
        return `{!! $bf->spread_attrs(${ternaryDict}) !!}`
      }
      // Function-scope local const holding a conditional inline-object
      //   `const sizeAttrs = size ? {…} : {}` then `{...sizeAttrs}`
      // (#checkbox / icon). Resolve the bare identifier to its initializer text
      // and route through the same conditional-spread lowering. Only
      // function-scope (`!isModule`) consts whose value is NOT itself a bare
      // identifier (loop guard) are considered.
      if (/^[A-Za-z_$][\w$]*$/.test(trimmed)) {
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
            const resolved = conditionalSpreadToBlade(
              this.spreadCtx,
              parseExpression(initTrimmed),
            )
            if (resolved !== null) {
              return `{!! $bf->spread_attrs(${resolved}) !!}`
            }
          }
        }
      }
      const bladeExpr = this.convertExpressionToBlade(value.expr)
      return `{!! $bf->spread_attrs(${bladeExpr}) !!}`
    },
    // Neither variant is legal on intrinsic elements.
    emitBooleanShorthand: () => '',
    emitJsxChildren: () => '',
  }

  /**
   * Lower a `style={{ … }}` object literal to a CSS string with dynamic values
   * interpolated as Blade expressions, e.g. `{ backgroundColor: color }` →
   * `background-color:{{ $bf->string($color) }}`. Returns null when the shape
   * is unsupported or any value can't be lowered (caller falls through to
   * BF101). (#1322)
   */
  private tryLowerStyleObject(expr: string): string | null {
    const entries = parseStyleObjectEntries(expr)
    if (!entries) return null
    for (const e of entries) {
      if (e.kind === 'expr' && !isSupported(parseExpression(e.expr)).supported) return null
    }
    // The static CSS key + literal value are inlined into a double-quoted
    // `style="..."` attribute as raw template text, so HTML-attr escape them
    // (a value like `'"'` would otherwise break the attribute / inject
    // markup). The dynamic arm's `{{ … }}` is HTML-escaped by `e()`.
    return entries
      .map(e =>
        e.kind === 'literal'
          ? `${this.escapeAttrText(e.cssKey)}:${this.escapeAttrText(e.value)}`
          : `${this.escapeAttrText(e.cssKey)}:{!! e($bf->string(${this.convertExpressionToBlade(e.expr)})) !!}`,
      )
      .join(';')
  }

  /** HTML-attribute escape for static text inlined into a `"..."` attribute. */
  private escapeAttrText(s: string): string {
    return s
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
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
      // literal never reaches `refuseUnsupportedAttrExpression`'s generic
      // BF101 (which would double-report alongside the purpose-built one).
      if (isDangerousInnerHtmlAttr(attr)) continue
      // Rewrite JSX special-prop names to their HTML-attribute counterparts.
      let attrName: string
      if (attr.name === 'className') attrName = 'class'
      else if (attr.name === 'key') {
        const depth = this.currentLoopKeyDepth
        attrName = depth > 0 ? `data-key-${depth}` : 'data-key'
      }
      else attrName = attr.name
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
    return `bf-s="{!! e($bf->scope_attr()) !!}" {!! $bf->hydration_attrs() !!} {!! $bf->props_attr() !!}`
  }

  renderSlotMarker(slotId: string): string {
    return `${BF_SLOT}="${slotId}"`
  }

  renderCondMarker(condId: string): string {
    return `${BF_COND}="${condId}"`
  }

  // ===========================================================================
  // Filter Predicate Rendering (ParsedExpr → Blade)
  // ===========================================================================

  /**
   * Convert a ParsedExpr AST to a Blade expression string for filter
   * predicates. Wraps the shared ParsedExpr dispatcher with a
   * `BladeFilterEmitter` carrying the predicate's loop param and any
   * block-body local var aliases.
   */
  private renderBladeFilterExpr(
    expr: ParsedExpr,
    param: string,
    localVarMap: Map<string, string> = new Map(),
  ): string {
    return emitParsedExpr(
      expr,
      new BladeFilterEmitter(
        param,
        localVarMap,
        n => this._isStringValueName(n),
        // A nested callback method inside the predicate has no Blade scalar
        // form — surface BF101 (#2038) instead of silently degrading it to
        // its receiver.
        (message, reason) => this._recordExprBF101(message, reason),
      ),
    )
  }

  // ===========================================================================
  // Expression Conversion: JS → Blade
  // ===========================================================================

  private convertTemplateLiteralPartsToBlade(literalParts: IRTemplatePart[]): string {
    const parts: string[] = []
    for (const part of literalParts) {
      if (part.type === 'string') {
        parts.push(this.substituteJsInterpolationsToBlade(part.value))
      } else if (part.type === 'ternary') {
        const cond = this.convertConditionToBlade(part.condition)
        // Symbolic PHP ternary (same syntax as Twig's own — see this file's
        // header syntax table) — `(test ? a : b)`.
        parts.push(
          `(${cond} ? '${escapeBladeSingleQuoted(part.whenTrue)}' : '${escapeBladeSingleQuoted(part.whenFalse)}')`,
        )
      } else if (part.type === 'lookup') {
        // `${MAP[KEY]}` against a Record<T, string> literal — emit a PHP
        // array literal with an immediate bracket lookup, coalesced with
        // PHP's native `??` (this file's header, divergence 3): a missing
        // key raises no warning under `??`, verified empirically (`(['a' =>
        // 1]['missing']) ?? 'fallback'` → `'fallback'`, no notice) — same
        // "empty when no case matches" default the Twig port's own
        // divergence 9 (`.get(key, default)` has no Twig-hash equivalent
        // either) needed `??` for.
        const keyExpr = this.convertExpressionToBlade(part.key)
        const entries = Object.entries(part.cases)
          .map(([k, v]) => `${bladeHashKey(k)} => '${escapeBladeSingleQuoted(v)}'`)
          .join(', ')
        parts.push(`$bf->string(([${entries}][${keyExpr}]) ?? '')`)
      }
    }
    // Join with PHP string concatenation (`.`). Every term is already a
    // string (literal or `$bf->string(...)`-wrapped), so `.`'s own coercion
    // is a no-op here.
    return parts.length === 1 ? parts[0] : parts.join(' . ')
  }

  /**
   * Translate `${EXPR}` interpolations in a static template-part string into
   * Blade variable references and concatenate them with the surrounding
   * literal text. Each interpolated (non-literal) segment routes through
   * `$bf->string(...)` — see the file header, "Stringification".
   */
  private substituteJsInterpolationsToBlade(s: string): string {
    const segments: string[] = []
    const re = /\$\{([^}]+)\}/g
    let lastIndex = 0
    let m: RegExpExecArray | null
    while ((m = re.exec(s)) !== null) {
      if (m.index > lastIndex) {
        segments.push(`'${escapeBladeSingleQuoted(s.slice(lastIndex, m.index))}'`)
      }
      segments.push(`$bf->string(${this.convertExpressionToBlade(m[1].trim())})`)
      lastIndex = re.lastIndex
    }
    if (lastIndex < s.length) {
      segments.push(`'${escapeBladeSingleQuoted(s.slice(lastIndex))}'`)
    }
    if (segments.length === 0) return `''`
    return segments.length === 1 ? segments[0] : `(${segments.join(' . ')})`
  }

  /**
   * Refuse JS expression shapes that have no idiomatic Blade representation:
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
    const support = isSupported(parsed)
    if (parsed.kind !== 'unsupported' && support.supported) return false
    const reason = support.reason ?? (parsed.kind === 'unsupported' ? parsed.reason : undefined)
    const reasonLine = reason ? `\n${reason}` : ''
    this.errors.push({
      code: 'BF101',
      severity: 'error',
      message: `Expression not supported on attribute '${attrName}': ${expr.trim()}${reasonLine}`,
      loc: { file: this.componentName + '.tsx', start: { line: 1, column: 0 }, end: { line: 1, column: 0 } },
      suggestion: {
        message: 'The Blade adapter cannot lower JS object literals or tagged-template-literal expressions into Blade. Move the expression into a `\'use client\'` component (so hydration computes it), or expand it into discrete attributes whose values are values the adapter can lower.',
      },
    })
    return true
  }

  /**
   * Build the EmitContext seam the top-level `ParsedExpr` emitter depends on.
   * Built as a private object (the adapter does NOT `implements BladeEmitContext`)
   * so the wrapped bookkeeping — `_searchParamsLocals`, the const/record
   * resolvers, BF101 recording, the filter-predicate entry — stays private and
   * off the exported adapter's public type, matching the Go adapter's
   * `emitCtx` and the `spreadCtx` / `memoCtx` seams below.
   */
  private get emitCtx(): BladeEmitContext {
    return {
      _searchParamsLocals: this._searchParamsLocals,
      _resolveModuleStringConst: (name) => this._resolveModuleStringConst(name),
      _resolveLiteralConst: (name) => this._resolveLiteralConst(name),
      _resolveStaticRecordLiteral: (o, k) => this._resolveStaticRecordLiteral(o, k),
      _isStringValueName: (name) => this._isStringValueName(name),
      _recordExprBF101: (message, reason) => this._recordExprBF101(message, reason),
      _renderBladeFilterExprPublic: (e, p) => this._renderBladeFilterExprPublic(e, p),
    }
  }

  /**
   * Build the narrow context the extracted spread lowering depends on. Passing
   * a purpose-built object (rather than `this`) keeps the adapter's bookkeeping
   * members private — they stay internal implementation detail, not part of the
   * exported class's public surface.
   */
  private get spreadCtx(): BladeSpreadContext {
    return {
      componentName: this.componentName,
      errors: this.errors,
      localConstants: this.localConstants,
      propsParams: this.propsParams,
      convertExpressionToBlade: (e, preParsed) => this.convertExpressionToBlade(e, preParsed),
      convertConditionToBlade: (e, preParsed) => this.convertConditionToBlade(e, preParsed),
    }
  }

  /** Build the narrow context the extracted memo seeding depends on. */
  private get memoCtx(): BladeMemoContext {
    return {
      convertExpressionToBlade: (e, preParsed) => this.convertExpressionToBlade(e, preParsed),
      errors: this.errors,
    }
  }

  private convertExpressionToBlade(expr: string, preParsed?: ParsedExpr): string {
    // Parse-first lowering — parity with the Jinja/Twig adapters'
    // `convertExpressionTo*`. Parse the JS expression once, gate it on the
    // shared `isSupported`, and render every supported shape through the AST
    // emitter. Unsupported shapes surface as BF101.
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

    // Registered call lowerings (#2057) — including the built-in `queryHref`
    // plugin (#2042), which lowers `queryHref(base, { … })` to a neutral
    // `guard-list` on the `query` helper → `$bf->query(base, <triples>)`.
    // Recognised before the support gate because the object-literal arg is
    // otherwise `unsupported` (BF101). The `query` helper includes a pair iff its
    // guard is truthy AND its value is a non-empty string (the client's
    // `if (value)`): a plain `key: v` passes guard `true`, a conditional
    // `key: cond ? v : undefined` passes the lowered cond. Only the `query`
    // helper renders to `$bf->query`; another guard-list helper must not be
    // silently mis-rendered as a query.
    if (parsed.kind === 'call') {
      for (const matcher of this._loweringMatchers) {
        const node = matcher(parsed.callee, parsed.args)
        if (node?.kind === 'guard-list' && node.helper === 'query') {
          const qArgs = queryHrefArgs(node, n => this.renderParsedExprToBlade(n))
          return `$bf->query(${qArgs.join(', ')})`
        }
        // Generic `helper-call` (#2069) — the neutral vocabulary's escape
        // hatch for a userland `LoweringPlugin` that lowers to a single
        // runtime-helper invocation. `$bf->helper(args…)` mirrors the
        // `query` helper's own naming convention exactly: the framework
        // renders the call, the plugin author registers `<helper>` as a
        // method on their own runtime — same contract as `$bf->query`
        // itself, just not built in.
        if (node?.kind === 'helper-call' && isValidHelperId(node.helper)) {
          const argsX = node.args.map(a => this.renderParsedExprToBlade(a))
          return `$bf->${node.helper}(${argsX.join(', ')})`
        }
      }
    }

    const support = isSupported(parsed)
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
      // Safe PHP empty-string literal — valid in every context the result
      // might land in.
      return "''"
    }

    return this.renderParsedExprToBlade(parsed)
  }

  /**
   * Convert a JS condition (an `if` / ternary / loop-filter test) to a Blade
   * boolean expression, routing through `$bf->truthy(...)` unless the
   * expression is structurally already boolean-shaped. See the file header,
   * "JS truthiness".
   */
  private convertConditionToBlade(expr: string, preParsed?: ParsedExpr): string {
    const blade = this.convertExpressionToBlade(expr, preParsed)
    return this.wrapConditionExpr(expr, blade, preParsed)
  }

  /**
   * Shared helper: given the ORIGINAL JS expression (or its already-parsed
   * tree) and its ALREADY-RENDERED Blade text, wrap the rendered text with
   * `$bf->truthy(...)` unless the expression is structurally boolean-shaped.
   * Split from `convertConditionToBlade` so a caller that already lowered the
   * expression for another purpose (e.g. the `presenceOrUndefined` temp bind)
   * doesn't lower it twice.
   */
  private wrapConditionExpr(expr: string, blade: string, preParsed?: ParsedExpr): string {
    const isBoolean = preParsed
      ? isBooleanResultExpr(stringifyParsedExpr(preParsed))
      : isBooleanResultExpr(expr)
    return isBoolean ? blade : `$bf->truthy(${blade})`
  }

  /**
   * Render a full ParsedExpr tree to Blade for top-level (non-filter)
   * expressions where identifiers are signals / template vars.
   */
  private renderParsedExprToBlade(expr: ParsedExpr): string {
    return emitParsedExpr(expr, new BladeTopLevelEmitter(this.emitCtx))
  }

  /** Whether `name` (a signal getter or prop) holds a string value. Carried
   *  for parity with the Perl-family adapters; the Blade emitters don't
   *  consume it (`===`/`!==` always routes through `$bf->eq`/`$bf->neq`
   *  regardless of operand type). */
  private _isStringValueName(name: string): boolean {
    return this.stringValueNames.has(name)
  }

  /**
   * Parse `cond ? value : undefined` (or `: null`), returning the
   * condition/consequent source spans, else `null`. Used for the
   * attribute-omission rule (#1897).
   */
  parseUndefinedAlternateTernary(
    expr: string,
  ): { condition: string; consequent: string } | null {
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
    }
  }

  isBooleanTypedPropRef(expr: string): boolean {
    let bare = expr.trim()
    if (this.propsObjectName && bare.startsWith(`${this.propsObjectName}.`)) {
      bare = bare.slice(this.propsObjectName.length + 1)
    }
    if (!/^[A-Za-z_$][\w$]*$/.test(bare)) return false
    return this.booleanTypedProps.has(bare)
  }

  /**
   * Whether an attribute-value expression should route through
   * `$bf->bool_str` (vs. plain `$bf->string`) at its interpolation site.
   * `isExplicitStringCall` is checked FIRST and short-circuits the other
   * three: an explicit `String(x)` call already lowers to `$bf->string(x)`,
   * which correctly stringifies a real boolean on its own (see the PHP
   * runtime's `string()` helper's bool branch), so layering `$bf->bool_str`
   * on top would run PHP truthiness over the ALREADY-STRINGIFIED text
   * instead of the original boolean. See `isExplicitStringCall`'s docstring
   * in `boolean-result.ts` for the full double-wrap failure mode this
   * guards against.
   */
  private shouldBoolStr(expr: string, name: string): boolean {
    if (isExplicitStringCall(expr)) return false
    return isBooleanResultExpr(expr) || isAriaBooleanAttr(name) || this.isBooleanTypedPropRef(expr)
  }

  /**
   * Inline a const (any scope) whose initializer is a pure numeric or
   * single-quoted string literal (`const totalPages = 5`, #1897
   * pagination) — function-scope consts never reach the per-render
   * context, so a bare reference would resolve to an undefined variable.
   */
  private _resolveLiteralConst(name: string): string | null {
    const c = (this.localConstants ?? []).find(lc => lc.name === name)
    if (c?.value === undefined) return null
    const v = c.value.trim()
    if (/^-?\d+(\.\d+)?$/.test(v)) return v
    const strLit = /^'([^'\\]*)'$/.exec(v) ?? /^"([^"\\]*)"$/.exec(v)
    if (strLit) return `'${escapeBladeSingleQuoted(strLit[1])}'`
    return null
  }

  private _resolveStaticRecordLiteral(objectName: string, key: string): string | null {
    const hit = lookupStaticRecordLiteral(objectName, key, this.localConstants)
    if (!hit) return null
    return hit.kind === 'number'
      ? hit.text
      : `'${escapeBladeSingleQuoted(hit.text)}'`
  }

  private _resolveModuleStringConst(name: string): string | null {
    // A loop body may bind a `@php(...)` local that shadows a module const of
    // the same name; never inline inside one (conservative — drop to the
    // bare identifier).
    if (this.inLoop) return null
    const value = this.moduleStringConsts.get(name)
    if (value === undefined) return null
    return `'${escapeBladeSingleQuoted(value)}'`
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
  private _renderBladeFilterExprPublic(expr: ParsedExpr, param: string): string {
    return this.renderBladeFilterExpr(expr, param)
  }
}

export const bladeAdapter = new BladeAdapter()
