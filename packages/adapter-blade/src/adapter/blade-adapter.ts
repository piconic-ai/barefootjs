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
  TypeInfo,
  TemplatePrimitiveRegistry,
} from '@barefootjs/jsx'
import {
  DslTemplateAdapter,
  type IRNodeEmitter,
  type EmitIRNode,
  type AttrValueEmitter,
  parseExpression,
  stringifyParsedExpr,
  parseProviderObjectLiteral,
  planStyleObject,
  type ExpressionAttr,
  isSupported,
  isSupportedValue,
  emitParsedExpr,
  emitIRNode,
  emitAttrValue,
  parseRecordIndexAccess,
  extractArrowBodyExpression,
  collectContextConsumers,
  isLowerableLoopDestructure,
  type ContextConsumer,
  lookupStaticRecordLiteral,
  lookupLiteralConst,
  childTemplateName,
  isEmptyComponentProps,
  isBooleanTypedPropRef,
  planAttrExpression,
  savedLoopBindings,
  spellDestructureLocals,
  spellFilteredRow,
  spellSortedSource,
  type DestructureSpelling,
  type LoopRefusalSpelling,
  planSpreadAttr,
  planComponentProps,
  spellComponentProps,
  rootPropReadName,
  isRootPropsObject,
  attrValueMayBeNullish,
  isAriaBooleanAttr,
  isBooleanResultExpr,
  isExplicitStringCall,
  hasClientInteractivity,
  renderElementShell,
  renderFragmentScope,
  renderDangerousInnerHtml,
  type ElementShellSpelling,
  inlineComputedConstAttr,
  inlineComputedConsts,
} from '@barefootjs/jsx'
import type { ParsedExpr } from '@barefootjs/jsx'
import { isOpaqueLocalAccessorName } from '@barefootjs/jsx'
import { BF_SLOT, BF_COND, escapeHtml } from '@barefootjs/shared'

import type { BladeRenderCtx } from './lib/types.ts'
import { BLADE_PRIMITIVE_EMIT_MAP } from './lib/constants.ts'
import {
  bladeHashKey,
  bladeIdent,
  bladeVar,
  escapeBladeSingleQuoted,
  bladeLoopBindingAccessor,
} from './lib/blade-naming.ts'
import { renderSortMethod, EVAL_SPELLING } from './expr/array-method.ts'
import { staticValueToBlade } from './lib/static-value.ts'
import { BladeFilterEmitter, BladeTopLevelEmitter, truthyTest, CALLBACK_LOWERING } from './expr/emitters.ts'
import type { BladeEmitContext, BladeSpreadContext, BladeMemoContext } from './emit-context.ts'
import {
  conditionalSpreadToBlade,
  objectLiteralExprToBladeDict,
} from './spread/spread-codegen.ts'
import {
  generateContextConsumerSeed,
  generateDerivedMemoSeed,
} from './memo/seed.ts'
import { collectStringValueNames } from './props/prop-classes.ts'

export type { BladeAdapterOptions } from './lib/types.ts'
import type { BladeAdapterOptions } from './lib/types.ts'

/** How a lowered loop destructure binding reads off the row item. */
const DESTRUCTURE_SPELLING: DestructureSpelling = {
  accessor: bladeLoopBindingAccessor,
  slice: (parent, from) => `$bf->slice(${parent}, ${from}, null)`,
  omit: (parent, keys) => `$bf->omit(${parent}, [${keys.map((k) => `'${escapeBladeSingleQuoted(k)}'`).join(', ')}])`,
}

/** The wording of the loop refusals the plan decides (BF104 / BF101). */
const LOOP_REFUSALS: LoopRefusalSpelling = {
  destructureMessage: (param) =>
    `Loop callback uses a destructure pattern (\`${param}\`) that the Blade adapter cannot lower — e.g. an object-rest binding used as a bare value, a \`.filter().map(destructure)\` chain, or a reserved \`__bf_\`-prefixed binding name.`,
  destructureSuggestion:
    `Options:\n` +
    `  1. Read the rest binding via member access (\`rest.flag\`) or spread it onto the element (\`{...rest}\`) instead of using it as a bare value.\n` +
    `  2. Mark the loop position as @client-only so the destructure runs in JS on the client.\n` +
    `  3. Move the loop into a primitive that the adapter registers explicitly.`,
  unresolvableConst: 'Blade',
}

/**
 * The `BladeAdapter` template adapter. Pass an instance as the `adapter` option of `@barefootjs/vite`.
 *
 * @since 0.18.0
 * @stability alpha
 */
export class BladeAdapter extends DslTemplateAdapter implements IRNodeEmitter<BladeRenderCtx> {
  name = 'blade'
  extension = '.blade.php'
  templatesPerComponent = true

  /**
   * Identifier-path callees the Blade runtime can render in template scope.
   * The relocate pass consults this map to mark matching calls as
   * template-safe; the SSR template emitter substitutes the JS call with the
   * registered `$bf->NAME(...)` helper invocation.
   */
  templatePrimitives: TemplatePrimitiveRegistry = BLADE_PRIMITIVE_EMIT_MAP

  private options: Required<BladeAdapterOptions>
  /** Names bound at template level (signals, memos, props, local constants):
   * a loop whose row binds one saves and restores it (#3391). */
  private templateLevelNames: Set<string> = new Set()

  constructor(options: BladeAdapterOptions = {}) {
    super()
    this.options = {
      clientJsBasePath: options.clientJsBasePath ?? '/static/components/',
      barefootJsPath: options.barefootJsPath ?? '/static/components/barefoot.js',
    }
  }

  protected readonly loopChildDiagnosticName = 'Blade'
  // Two source names that Blade's renaming of reserved names turns into one
  // template variable would read the same value (#3408).
  protected override readonly templateIdentifierSpelling = { ident: bladeIdent, label: 'Blade' }

  /**
   * Names (signal getters + props) whose value is a string. Carried for
   * parity with the Perl-family adapters (Mojo needs it for `eq`/`ne`
   * selection); the Blade emitters don't consume it — `===`/`!==` always
   * routes through `$bf->eq`/`$bf->neq` regardless of operand type (see
   * `blade-adapter.ts`'s file header, divergence 7).
   */
  protected stringValueNamesFor(ir: ComponentIR): Set<string> {
    return collectStringValueNames(ir)
  }

  protected override resetAdapterState(ir: ComponentIR): void {
    this.templateLevelNames = new Set([
      ...ir.metadata.signals.map(sig => sig.getter),
      ...ir.metadata.memos.map(m => m.name),
      ...ir.metadata.propsParams.map(p => p.name),
      ...(ir.metadata.localConstants ?? []).map(c => c.name),
    ])
  }

  protected contextConsumerSeed(ir: ComponentIR): string {
    return generateContextConsumerSeed(ir)
  }

  protected derivedMemoSeed(ir: ComponentIR): string {
    return generateDerivedMemoSeed(this.memoCtx, ir)
  }

  // ===========================================================================
  // Script Registration
  // ===========================================================================

  protected generateScriptRegistrations(ir: ComponentIR, scriptBaseName?: string, scriptAssets?: string[], preloadAssets?: string[]): string {
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
        for (const url of preloadAssets) lines.push(`@php($bf->register_preload('${url}'))`)
      }
      for (const url of scriptAssets) lines.push(`@php($bf->register_script('${url}'))`)
      lines.push('')
      return lines.join('\n')
    }

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
    const rendered = this.renderComponent(node)
    // #3141: a client-interactive component whose entire render root is
    // this single child-component call (no wrapping element) needs the
    // same comment-based scope marker pair a `needsScopeComment` FRAGMENT
    // root gets below — `IRComponent.needsScopeComment` is the shared flag
    // (`packages/jsx/src/component-root-scope-comment.ts`) every adapter
    // reads instead of re-deriving "root is a component" locally.
    return node.needsScopeComment ? this.wrapComponentRootScopeComment(rendered) : rendered
  }

  emitFragment(node: IRFragment, _ctx: BladeRenderCtx, _emit: EmitIRNode<BladeRenderCtx>): string {
    return renderFragmentScope(node, children => this.renderChildren(children), rendered => this.wrapComponentRootScopeComment(rendered))
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
    return renderElementShell(element, this.elementShell)
  }

  /**
   * Route an `ssrPortalOwnerScope`-flagged element's ALREADY-RENDERED
   * markup (the `bf-po` attribute already stamped on its own tag) through
   * `BarefootJS::register_portal_element` instead of returning it for
   * inline placement (#3119), so it renders at the `{{ $bf->portals() }}`
   * outlet an app's own layout places near `</body>` — mirrors the Go
   * adapter's `wrapSsrPortalElement` (`go-template-adapter.ts`).
   *
   * Unlike Go's `html/template` (write-only `{{template}}` actions, hence
   * the string-re-parse-as-template indirection there), Blade compiles
   * directly to interleaved PHP + HTML: wrapping the rendered markup in
   * `ob_start()` / `ob_get_clean()` captures whatever it echoes (including
   * any `{{ }}`/`{!! !!}` interpolations it contains, already evaluated)
   * as a plain string, with NOTHING reaching the page at this position —
   * `register_portal_element` returns `''`, which nothing echoes since
   * `@php(...)` (unlike `{{ }}`) never prints its expression's value.
   */
  private wrapSsrPortalElement(rendered: string): string {
    return `@php(ob_start())\n${rendered}\n@php($bf->register_portal_element(ob_get_clean()))`
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
        return `{!! $bf->text_start("${expr.slotId}") !!}{!! $bf->text_end() !!}`
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

    // #3166: thread `cond.parsedCondition` through — a recognised
    // `<action>.isPending()` / `.error()` read has already been substituted
    // with its seed literal there; re-parsing `cond.condition` fresh here
    // would lose that and fall into the generic member-access lowering
    // (`$fetchPosts['error']`, undefined at render time).
    const condition = this.convertConditionToBlade(cond.condition, cond.parsedCondition)
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

    // Inline, with no newline of our own (#3321): a newline around the
    // directives rendered as whitespace between the conditional and adjacent
    // text (`x: off` for `x:{c ? 'on' : 'off'}`). Raw PHP tags rather than
    // `@if`/`@else`/`@endif`, which Blade misreads when a word follows them
    // directly (`@elseoff`).
    let result: string
    if (useCommentMarkers) {
      // Fragment branches: use comment markers
      const inner = whenFalse
        ? `<?php if (${condition}): ?>${whenTrue}<?php else: ?>${whenFalse}<?php endif; ?>`
        : `<?php if (${condition}): ?>${whenTrue}<?php endif; ?>`
      result = `{!! $bf->comment("cond-start:${cond.slotId}") !!}${inner}{!! $bf->comment("cond-end:${cond.slotId}") !!}`
    } else if (markedFalse) {
      result = `<?php if (${condition}): ?>${markedTrue}<?php else: ?>${markedFalse}<?php endif; ?>`
    } else if (cond.slotId) {
      // Conditional with no else: wrap with comment markers for client hydration
      result = `{!! $bf->comment("cond-start:${cond.slotId}") !!}<?php if (${condition}): ?>${whenTrue}<?php endif; ?>{!! $bf->comment("cond-end:${cond.slotId}") !!}`
    } else {
      result = `<?php if (${condition}): ?>${whenTrue}<?php endif; ?>`
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
    const loopPlan = this.loopPlanFor(loop, {
      resolveLiteralConst: (name) => this._resolveLiteralConst(name),
      callbackLowering: CALLBACK_LOWERING,
      spellStatic: staticValueToBlade,
    })
    this.recordLoopPlanRefusals(loop, loopPlan, LOOP_REFUSALS)

    // A `.map()` loop whose array is a bare identifier bound to a local
    // const (module- or function-scope, #2946) with a non-statically-
    // evaluable initializer that reads props/signals/a function call (e.g.
    // `const entries = Object.entries(props.x ?? {}).filter(...)`) can't
    // render correctly. Locals get no per-render stash slot — this
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
    // #2208/#2946: a loop source that is a fully-static array literal —
    // either inline (`[{ label: 'Alpha' }, ...].map(...)`) or a bare
    // identifier bound to a local const (module- or function-scope) whose
    // initializer has no prop/signal/function-call dependency — inlines as
    // a native PHP array literal below. A runtime-computed local (#2069,
    // e.g. `Object.entries(props.tags).filter(...)`) still refuses below,
    // whichever scope it's declared in. `isNameShadowed` guards a
    // DIFFERENT, enclosing loop's own callback param shadowing this
    // identifier (fable review) — never resolve the static const in that
    // case. `rawArray` then falls through to the bare identifier expression
    // below, same as before #2208 — which still trips the pre-existing
    // BF101 gate for an unresolvable local const reference (a loud,
    // conservative refusal, not a silent wrong value). Canonical,
    // position-accurate predicate (#2482 Stage 2) — the enclosing loop
    // scope's own membership, not a coarse whole-component union.
    const staticArray = loopPlan.staticSource

    const rawArray = staticArray ?? this.convertExpressionToBlade(loop.array)
    // The source sorted by the loop's comparator, when it has one: the
    // plan decides the evaluator, the structured `{keys: …}` descriptor or
    // the refusal, which keeps the source unsorted so the template stays
    // valid (#3473).
    const array = spellSortedSource(loopPlan.sort, rawArray, {
      emit: (e) => this.convertExpressionToBlade('', e),
      eval: EVAL_SPELLING,
      structured: renderSortMethod,
      refuse: (message, suggestion) => this._recordExprBF101(message, suggestion),
    })
    const param = loop.param
    // Blade's `@foreach(array as item)` binds the item directly (with the
    // divergence-2 null/undefined guard applied at the call site below). The
    // index, when needed (`.keys().map(k => ...)` or an explicit `index`
    // param), comes from Blade's own loop object (`$loop->index`, 0-based —
    // see this file's header, divergence 10) — no Kolon-style `$~loopvar.index`
    // indirection needed.

    // A `.keys()` iteration's param is the index and a lowered destructure's
    // bindings read off the item, so either iterates a throwaway item var
    // (`loopPlan.itemVar`). The index local (a `.keys()` param or an explicit
    // index param) reads Blade's `$loop->index`. Each destructure binding is a
    // local off the item var, spelled from its structured `segments` path
    // (#2087 Phase B, never `b.path`): a native accessor for a fixed binding,
    // the runtime's slice / omit for an array / object rest — a true
    // residual, not an alias of the whole item. An object iteration's key and value
    // bind through the for-header below instead.
    const loopVar = loopPlan.itemVar
    const indexLocalLines: string[] = []
    if (loopPlan.indexLocal) indexLocalLines.push(`@php(${bladeVar(loopPlan.indexLocal)} = $loop->index)`)
    for (const { name, value } of spellDestructureLocals(loopPlan, bladeVar(loopVar), DESTRUCTURE_SPELLING)) {
      indexLocalLines.push(`@php(${bladeVar(name)} = ${value})`)
    }

    // The row window (#3473): the row's scope around everything that
    // evaluates per row (the preamble locals' initializers, the children
    // under `inLoop`, the whole-item-conditional key anchor). The filter
    // predicate stays outside it: a filter callback's own param is a
    // separate frame, never folded into the `.map()` row.
    const { outside, row, rootAliases, preamble: preambleLines, body: bodyChildren } = this.renderLoopRow(loop, {
      preamble: (d) => `@php(${bladeVar(d.name)} = ${this.convertExpressionToBlade(d.raw, d.valueParsed)})`,
      keyAnchor: (key) => `{!! $bf->comment('loop-i:' . $bf->escape_comment_key(${this.convertExpressionToBlade(key)})) !!}`,
    })
    const savedBindings = savedLoopBindings(
      { outside, row, templateLevelNames: this.templateLevelNames },
      rootAliases.map(a => a.name),
      (_name, ordinal) => `__bf_saved_${loop.markerId}_${ordinal}`,
    )

    // A name the filter predicate captures from an enclosing row that this
    // loop's own row binds again would read the row's item inside the loop;
    // keep the enclosing value under a loop-scoped alias (#3402).
    const captureAliases = loopPlan.captureAliases
    const lines: string[] = []
    // PHP foreach shares its surrounding variable scope. Preserve bindings
    // shadowed by this callback so the enclosing row continues with its value.
    // A literal constant is inlined and never assigned, so read it with `??`:
    // an undefined variable warns, and Laravel turns the warning into an error.
    for (const { name, temporary } of savedBindings) {
      lines.push(`@php(${bladeVar(temporary)} = ${bladeVar(name)} ?? null)`)
    }
    // Scoped per-call-site marker so sibling `.map()`s under the same parent
    // each get their own reconciliation range.
    for (const { name, alias } of rootAliases) lines.push(`@php(${bladeVar(alias)} = ${bladeVar(name)})`)
    for (const { name, alias } of captureAliases) lines.push(`@php(${bladeVar(alias)} = ${bladeVar(name)})`)
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

    // The row, inside the filter's guard for a filter().map() loop. The plan
    // renames the predicate's shadowed captures to their aliases (#3402) and
    // refuses a filter without a predicate (#3534).
    lines.push(...spellFilteredRow(loopPlan.filter, [...preambleLines, bodyChildren], {
      // See the file header, divergence tied to `expr/emitters.ts`'s
      // divergence 4: the loop-hoist filter test is a condition position too.
      condition: (filter) =>
        truthyTest(
          filter.predicate,
          this.renderInScope(this.scope.enterAliases(filter.aliases), () => this.renderBladeFilterExpr(filter.onRow, param)),
        ),
      refuse: (message, suggestion) => this._recordExprBF101(message, suggestion),
      refused: 'true',
      open: (condition) => `@if(${condition})`,
      close: '@endif',
    }))

    lines.push(`@endforeach`)
    for (const { name, temporary } of savedBindings) {
      lines.push(`@php(${bladeVar(name)} = ${bladeVar(temporary)})`)
    }
    // The same leak would leave a shadowed root prop holding the last row, so
    // a sibling loop's alias (and any later bare read) captured that row.
    for (const { name, alias } of rootAliases) lines.push(`@php(${bladeVar(name)} = ${bladeVar(alias)})`)
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
    // Each named JSX-valued prop (`header={<strong>Title</strong>}`, #2168)
    // and the forwarded children are captured with output buffering (this
    // file's header, divergence 4), evaluated in the parent's template scope
    // (signals, conditionals) into an `HtmlString`, and passed by variable;
    // `render_child` materializes the children through the backend before
    // handing them to the child. A named slot's capture variable is
    // counter-based: a prop name can contain characters (`data-slot`) that
    // are no valid PHP variable name.
    const tplName = childTemplateName(comp.name, this.importAliases)
    const captures: string[] = []
    const capture = (children: IRNode[], name: () => string) => {
      const body = this.renderChildren(children)
      const captured = bladeVar(name())
      captures.push(
        `@php(ob_start())\n${body}\n` +
        `@php(${captured} = $bf->backend->mark_raw(preg_replace('/\\n\\z/', '', ob_get_clean(), 1)))`,
      )
      return captured
    }
    const plan = planComponentProps(comp, {
      propsObjectName: this.propsObjectName,
      propsParams: this.propsParams,
      callerKeys: true,
    })
    const segments = spellComponentProps(plan, {
      entry: (entry) => {
        switch (entry.kind) {
          case 'value':
            return emitAttrValue(entry.value, this.componentPropEmitter, entry.name)
          case 'named-slot':
            return `${bladeHashKey(entry.name)} => ${capture(entry.children, () => `bf_prop_${this.childrenCaptureCounter++}`)}`
          case 'props-param':
            return `${bladeHashKey(entry.name)} => ${bladeVar(entry.name)}`
          case 'slot-id':
            return `${bladeHashKey('_bf_slot')} => '${entry.slotId}'`
          case 'children':
            return `${bladeHashKey('children')} => ${capture(entry.children, () => `bf_children_${comp.slotId ?? 'c' + this.childrenCaptureCounter++}`)}`
        }
      },
      spread: (value) => `$bf->omit(${this.convertExpressionToBlade(value.expr)}, [])`,
      // `isset` is false for an unset variable and for `null` alike, so it
      // is only the fallback for a render that recorded no caller keys.
      presentParam: (name) =>
        `($bf->passed(${bladeHashKey(name)}, isset(${bladeVar(name)})) ? [${bladeHashKey(name)} => ${bladeVar(name)}] : [])`,
    })
    const dict = isEmptyComponentProps(segments) ? '' : `, ${this.combineComponentPropSegments(segments)}`
    return `${captures.join('')}{!! $bf->render_child('${tplName}'${dict}) !!}`
  }

  /** Uniquifies the `presenceOrUndefined` temp binding (`bf_puN`) so two
   *  presence-folded attrs in one template don't collide. */
  private presenceVarCounter = 0
  // ===========================================================================
  // If-Statement (Conditional Return) Rendering
  // ===========================================================================

  protected renderIfStatement(ifStmt: IRIfStatement): string {
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

  /**
   * Wrap already-rendered output in the comment-based scope marker pair.
   * Shared by a `needsScopeComment` fragment root and a `needsScopeComment`
   * component root (#3141) — both are "this scope has no DOM element of its
   * own to carry bf-s/bf-p", so both lean on the same runtime helper pair.
   */
  private wrapComponentRootScopeComment(rendered: string): string {
    return `{!! $bf->scope_comment() !!}${rendered}{!! $bf->scope_comment_end() !!}`
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
    emitExpression: (source, name) => {
      // A computed const reads as its initializer (#3494).
      const value = inlineComputedConstAttr(source, this.computedConsts)
      // `style={{ … }}` object literal → a CSS string with dynamic values
      // interpolated, instead of refusing the bare object with BF101 (#1322).
      if (name === 'style') {
        const css = this.tryLowerStyleObject(value)
        if (css !== null) return `style="${css}"`
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
        boolStr ? `${name}="{!! e($bf->bool_str(${v})) !!}"` : `${name}="{!! e($bf->string(${v})) !!}"`
      // Each kind is documented on `AttrExpressionPlan`.
      switch (plan.kind) {
        case 'omit-nullable': {
          // A bare read here, so it doubles as the guard test and the value.
          // A rest-expanded key lowers to a `data_get($rest, 'tag')` call, and
          // `isset()` on a call result is a PHP fatal error ("Cannot use
          // isset() on the result of an expression"), so it tests `!== null`.
          const v = this.convertExpressionToBlade(value.expr)
          const test = plan.restKey ? `(${v}) !== null` : `isset(${v})`
          return `\n@if(${test})\n${attr(v, plan.boolStr)}\n@endif\n`
        }
        case 'boolean-attr': {
          const v = this.convertExpressionToBlade(value.expr, value.parsed)
          return `{!! e((${this.wrapConditionExpr(value.expr, v)} ? '${name}' : '')) !!}`
        }
        case 'presence': {
          const v = this.convertExpressionToBlade(value.expr)
          const tmp = bladeVar(`bf_pu${this.presenceVarCounter++}`)
          return `\n@php(${tmp} = ${v})\n@if(${this.wrapConditionExpr(value.expr, tmp)})\n${attr(tmp, plan.boolStr)}\n@endif\n`
        }
        case 'undefined-alternate': {
          const m = plan.ternary
          const cond = this.convertConditionToBlade('', m.testParsed)
          const val = this.convertExpressionToBlade('', m.consequentParsed)
          return `\n@if(${cond})\n${name}="{!! e($bf->string(${val})) !!}"\n@endif\n`
        }
        case 'omit-nil': {
          const v = this.convertExpressionToBlade(value.expr, value.parsed)
          const tmp = bladeVar(`bf_pu${this.presenceVarCounter++}`)
          return `\n@php(${tmp} = ${v})\n@if(${tmp} !== null)\n${attr(tmp, plan.boolStr)}\n@endif\n`
        }
        case 'plain':
          return attr(this.convertExpressionToBlade(value.expr, value.parsed), plan.boolStr)
      }
    },
    emitBooleanAttr: (_value, name) => name,
    emitTemplate: (value, name) =>
      `${name}="{!! e(${this.convertTemplateLiteralPartsToBlade(value.parts)}) !!}"`,
    // Spread attributes (`<div {...attrs()} />`) lower through the
    // `$bf->spread_attrs` runtime helper, mirroring the Jinja/Twig adapters.
    emitSpread: (value) => {
      const plan = planSpreadAttr(value, {
        propsObjectName: this.propsObjectName,
        propsParams: this.propsParams,
        localConstants: this.localConstants ?? [],
        isBound: (n) => this.scope.isBound(n),
      })
      // `{...props}`: props arrive as separate template vars, so enumerate them.
      if (plan.kind === 'props-object') {
        const entries = plan.params.map((p) => `${bladeHashKey(p)} => ${bladeVar(p)}`)
        return `{!! $bf->spread_attrs([${entries.join(', ')}]) !!}`
      }
      // A conditional inline-object spread (`{...(cond ? {…} : {})}`) lowers to
      // a ternary of hashes; the falsy `{}` omits the key.
      for (const candidate of plan.candidates) {
        const lowered = conditionalSpreadToBlade(this.spreadCtx, candidate)
        if (lowered !== null) return `{!! $bf->spread_attrs(${lowered}) !!}`
      }
      return `{!! $bf->spread_attrs(${this.convertExpressionToBlade(value.expr)}) !!}`
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
        // Lower the `__html` expression and emit it through Blade's raw echo
        // `{!! !!}` (every escaped text position uses `{!! e(...) !!}`, so
        // dropping the `e()` escape helper renders the value verbatim). The
        // runtime evaluates the expression, so no template-metachar guard
        // applies; the element already carries its hydration slot marker. #2319.
        `{!! ${this.convertExpressionToBlade(expr, parsed)} !!}`,
      ),
    renderChildren: children => this.renderChildren(children),
    renderScopeMarker: instanceIdExpr => this.renderScopeMarker(instanceIdExpr),
    renderSlotMarker: slotId => this.renderSlotMarker(slotId),
    dataKeyRelay: `{!! $bf->data_key_attr() !!}`,
    scopeIdValue: `{!! e($bf->scope_attr()) !!}`,
    wrapSsrPortalElement: rendered => this.wrapSsrPortalElement(rendered),
  }

  /**
   * Lower a `style={{ … }}` object literal to a `$bf->style_object(...)`
   * call, e.g. `{ backgroundColor: color }` → `{!! $bf->style_object(
   * 'background-color', $color) !!}`. `style_object` is the single
   * oracle-matching sanitizer (ported from Hono's `hasUnsafeStyleValue`): it
   * drops any key:value pair whose value could break out of a CSS
   * declaration and HTML-escapes the rest, so the call is wrapped in `{!! !!}`
   * (not `{{ }}`) to avoid Blade's own auto-escaping double-encoding the
   * already-safe result (#2261). Returns null when the shape is unsupported
   * or any value can't be lowered (caller falls through to BF101). (#1322)
   */
  private tryLowerStyleObject(value: ExpressionAttr): string | null {
    const entries = planStyleObject(value)
    if (!entries) return null
    const args = entries.flatMap(e => [
      `'${escapeBladeSingleQuoted(e.cssKey)}'`,
      e.kind === 'literal' ? `'${escapeBladeSingleQuoted(e.value)}'` : this.convertExpressionToBlade(e.expr, e.parsed),
    ])
    return `{!! $bf->style_object(${args.join(', ')}) !!}`
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
    // Arithmetic over a prop whose nil the type cannot classify (#3700).
    this.refuseAmbiguousNilArithmeticIn(expr, [param, ...localVarMap.keys()])
    return emitParsedExpr(
      expr,
      new BladeFilterEmitter(
        param,
        localVarMap,
        (n, property) => this._isStringValueName(n, property),
        // A nested callback method inside the predicate has no Blade scalar
        // form — surface BF101 (#2038) instead of silently degrading it to
        // its receiver.
        (message, reason) => this._recordExprBF101(message, reason),
        n => this.scope.isBound(n),
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
        parts.push(`'${escapeBladeSingleQuoted(part.value)}'`)
      } else if (part.type === 'expression') {
        parts.push(`$bf->string(${this.convertExpressionToBlade(part.expr, part.parsed)})`)
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
      _propsObjectName: this.propsObjectName,
      _isGlobalName: (name: string) => this.computedConsts?.isGlobal(name) ?? false,
      _loweringMatchers: this._loweringMatchers,
      _resolveModuleStringConst: (name) => this._resolveModuleStringConst(name),
      _resolveLiteralConst: (name) => this._resolveLiteralConst(name),
      _rootPropReadName: (name) => rootPropReadName(name, this.scope, this.rootPropAliases),
      _isRootPropsObject: (expr) => isRootPropsObject(expr, n => this.scope.isBound(n)),
      _resolveStaticRecordLiteral: (o, k) => this._resolveStaticRecordLiteral(o, k),
      _isStringValueName: (name, property) => this._isStringValueName(name, property),
      _arithmeticCoercion: (op, operand, other) => this.arithmeticCoercion(op, operand, other, n => this.isLoopBoundName(n)),
      _isOpaqueLocalAccessorCall: (name) => isOpaqueLocalAccessorName(name, this.localConstants),
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
      convertExpressionToBlade: (e, preParsed, pos) => this.convertExpressionToBlade(e, preParsed, pos),
      errors: this.errors,
    }
  }

  private convertExpressionToBlade(
    expr: string,
    preParsed?: ParsedExpr,
    pos: 'rendered' | 'value' = 'rendered',
  ): string {
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
    parsed = inlineComputedConsts(parsed, this.computedConsts)

    // `pos` distinguishes a derived-seed RHS (an assignment, checked via
    // `isSupportedValue`) from every other, genuinely rendered call site —
    // the rendered gate would otherwise re-refuse a tree the seed plan
    // already classified `derived` at value position (#2696 review).
    // Registered call lowerings (#2057) — including the built-in `queryHref`
    // plugin — are consulted by this gate no matter where the call sits in
    // the tree (`BladeTopLevelEmitter`'s `lowering` seam does the actual
    // rendering below, via `emitParsedExpr`'s shared `call` case).
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
  private _isStringValueName(name: string, componentProperty = false): boolean {
    return this.scope.isStringValueName(name, n => this.stringValueNames.has(n), componentProperty)
  }

  /**
   * Parse `cond ? value : undefined` (or `: null`), returning the
   * condition/consequent source spans, else `null`. Used for the
   * attribute-omission rule (#1897).
   */  /** Position-accurate loop-bound-name check — see `this.scope`'s docstring. */
  private isLoopBoundName(name: string): boolean {
    return this.scope.isBound(name)
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
   * in `@barefootjs/jsx`'s `adapters/boolean-result.ts` for the full double-wrap failure mode this
   * guards against.
   */
  private shouldBoolStr(expr: string, name: string): boolean {
    if (isExplicitStringCall(expr)) return false
    return isBooleanResultExpr(expr) || isAriaBooleanAttr(name) || isBooleanTypedPropRef(expr, { propsObjectName: this.propsObjectName, booleanTypedProps: this.booleanTypedProps, isBound: (n) => this.scope.isBound(n) })
  }

  /**
   * Inline a const (any scope) whose initializer is a pure numeric or
   * single-quoted string literal (`const totalPages = 5`, #1897
   * pagination) — function-scope consts never reach the per-render
   * context, so a bare reference would resolve to an undefined variable.
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
    return `'${escapeBladeSingleQuoted(lit.text)}'`
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
   * `data_get($cfg, 'x')` member expression (which a Blade `@foreach`
   * binds correctly at the shadowed occurrence); a same-named const
   * elsewhere, outside any loop that shadows it, still inlines.
   */
  private _resolveStaticRecordLiteral(objectName: string, key: string): string | null {
    const hit = lookupStaticRecordLiteral(objectName, key, this.localConstants, name => this.scope.isBound(name))
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
