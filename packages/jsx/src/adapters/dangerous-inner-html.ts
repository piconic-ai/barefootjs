/**
 * Shared `dangerouslySetInnerHTML={{ __html: expr }}` recognition + policy
 * (#2207, dynamic lowering #2319). Single place every template adapter calls
 * from `renderElement`, so the injection-safety-relevant policy lives in
 * exactly one reviewable spot instead of being re-derived independently in
 * 8 adapters. `resolveDangerousInnerHtml` classifies the `__html` value into
 * three cases the adapter then renders uniformly:
 *
 * - `static` — a compile-time string literal. Spliced directly into the
 *   adapter's OWN template source as trusted text (same trust domain as
 *   hand-writing the HTML into the template), guarded per-adapter against
 *   that language's template metacharacters (`dangerousInnerHtmlMetachar
 *   Violation`). NOT routed through a runtime raw-output primitive — the
 *   value is fully known at compile time, so a runtime sink would reopen a
 *   template-source injection surface for no benefit.
 *
 * - `dynamic` — a prop-/signal-derived value (a signal read, prop, template
 *   literal WITH a substitution, local const, `??`-fallback, anything
 *   non-literal). The adapter serializes the `__html` expression via its own
 *   `convertExpressionTo<Lang>` and wraps the result in its runtime
 *   raw-output sink (Blade `{!! !!}`, ERB bare `<%= %>`, Go `template.HTML`,
 *   Jinja/MiniJinja `|safe`, Twig `|raw`, Mojolicious `<%== %>`, Xslate
 *   `mark_raw`). The runtime evaluates the expression at request time — the
 *   VALUE is never spliced into template source, so no metachar guard
 *   applies. This matches React's contract ("dangerously" = the caller owns
 *   the value's safety) and the Hono/CSR path, which already drives a
 *   `createEffect`-based `el.innerHTML = …` assignment (see
 *   `ir-to-client-js/emit-reactive.ts`).
 *
 * - `unlowerable` — the value is not a `{ __html: <expr> }` object literal
 *   at all (bare boolean/spread, or a variable holding the object). No
 *   `__html` expression to lower, so the adapter refuses with `BF101`.
 */

import type { CompilerError, IRAttribute, IRElement, SourceLocation } from '../types.ts'
import { parseExpression, stringifyParsedExpr, type ParsedExpr } from '../expression-parser.ts'

const DANGEROUS_INNER_HTML_ATTR = 'dangerouslySetInnerHTML'

export function isDangerousInnerHtmlAttr(attr: IRAttribute): boolean {
  return attr.name === DANGEROUS_INNER_HTML_ATTR
}

export type DangerousInnerHtmlResolution =
  // A compile-time string literal — spliced directly into the adapter's own
  // template source as trusted text (guarded per-adapter against that
  // language's template metacharacters). #2207.
  | { kind: 'static'; html: string }
  // A dynamic (prop-/signal-derived) `__html` value. `valueParsed` is the
  // inner expression's IR-parsed tree and `valueExpr` its re-stringified
  // source — both accepted by every adapter's `convertExpressionTo<Lang>`,
  // which serializes the expression so the adapter can wrap the result in
  // its own runtime raw-output sink (Blade `{!! !!}`, ERB bare `<%= %>`,
  // Go `template.HTML`, Jinja/MiniJinja `|safe`, Twig `|raw`, Mojolicious
  // `<%== %>`, Xslate `mark_raw`). NO template-metacharacter guard applies:
  // the value is evaluated at request time by the target runtime, never
  // spliced into template source, so it cannot forge a template construct.
  // This matches React semantics ("dangerously" = the caller owns the
  // safety of the value) and the Hono/CSR path, which already drives a
  // signal-reactive `el.innerHTML = …`. #2319 (successor to #2215).
  | { kind: 'dynamic'; valueExpr: string; valueParsed: ParsedExpr; loc: SourceLocation }
  // The attribute value is not a `{ __html: <expr> }` object literal at all
  // (a bare boolean/spread, or a variable holding the object) — there is no
  // `__html` expression to lower, so the adapter refuses with BF101. `expr`
  // is the raw source for the diagnostic.
  | { kind: 'unlowerable'; expr: string; loc: SourceLocation }

/**
 * Resolve `element`'s `dangerouslySetInnerHTML` attribute, if present.
 * Returns `null` when the attribute is absent (the overwhelmingly common
 * case — callers should treat `null` as "render this element normally") —
 * or when it carries `/* @client *\/` (Fable review, #2217): a `clientOnly`
 * attr is already deferred to hydrate by every adapter's `renderAttributes`
 * (`if (attr.clientOnly) continue`, unrelated to this module), which is
 * itself a working escape hatch for a dynamic `__html` — the client's
 * `createEffect`-driven `el.innerHTML = …` assignment (`emit-reactive.ts`)
 * runs regardless of what SSR does. Treating `clientOnly` as "render this
 * element normally" here (rather than refusing with BF101) preserves that
 * escape hatch instead of regressing it.
 * A present-but-non-`expression` value (e.g. a bare boolean/spread — not a
 * shape `{ __html }` can ever legitimately take) is treated as `dynamic`
 * so it refuses rather than silently doing nothing.
 */
export function resolveDangerousInnerHtml(element: IRElement): DangerousInnerHtmlResolution | null {
  const attr = element.attrs.find(isDangerousInnerHtmlAttr)
  if (!attr) return null
  if (attr.clientOnly) return null
  if (attr.value.kind !== 'expression') {
    return { kind: 'unlowerable', expr: '', loc: attr.loc }
  }
  const parsed = attr.value.parsed ?? parseExpression(attr.value.expr.trim())
  const value = htmlPropValue(parsed)
  // Not a `{ __html: <expr> }` object literal — nothing to lower.
  if (value === null) return { kind: 'unlowerable', expr: attr.value.expr, loc: attr.loc }
  // A compile-time string literal (a quoted string or a no-substitution
  // template literal, which the parser normalises to the same
  // `{kind:'literal', literalType:'string'}` shape) is spliced as trusted
  // template text; everything else is a dynamic value the adapter lowers
  // through its raw-output sink.
  if (value.kind === 'literal' && value.literalType === 'string') {
    return { kind: 'static', html: value.value as string }
  }
  return {
    kind: 'dynamic',
    valueExpr: stringifyParsedExpr(value),
    valueParsed: value,
    loc: attr.loc,
  }
}

/**
 * The `__html` value expression of a `{ __html: <expr> }` object literal, or
 * `null` when the parsed value is not that shape. Exactly one property, key
 * `__html` (identifier or string form — `{ __html: … }` and `{ '__html': … }`
 * are equivalent JS). Shorthand `{ __html }` reads a variable of that name;
 * it is a valid dynamic value (its `value` is the identifier `__html`), so it
 * is admitted the same as `{ __html: __html }` — the caller then classifies
 * literal-vs-dynamic. Spreads, computed keys, and multi-property objects fall
 * through to `null` (the caller refuses them).
 */
function htmlPropValue(parsed: ParsedExpr): ParsedExpr | null {
  if (parsed.kind !== 'object-literal') return null
  if (parsed.properties.length !== 1) return null
  const [prop] = parsed.properties
  if (prop.key !== '__html') return null
  return prop.value
}

/**
 * Per-adapter template-metacharacter guard for the STATIC-literal path.
 * The literal is spliced into the adapter's own template source as plain
 * text — safe against HTML injection (it's the developer's own compile-time
 * string, same trust boundary as writing the HTML by hand), but NOT
 * automatically safe against TEMPLATE-source injection: a literal
 * containing `{{ … }}` (Go/Jinja/minijinja/Twig), `<% … %>` (ERB/
 * Mojolicious), `{!! !!}`/`@directive`/`<?php`/`<x-…>` (Blade — the last is
 * Laravel's component-tag syntax, on by default; see below), or `<: … :>`
 * (Xslate) would be interpreted as a live template construct instead of
 * inert text once spliced in. Mojolicious and Xslate also support
 * whole-line "line code" (a line starting with `%`/`:`, possibly indented —
 * `\s` covers the same whitespace class Mojo::Template/Xslate strip),
 * checked with `m`. Refuses (via {@link dangerousInnerHtmlDiagnostic})
 * rather than escaping — escaping a supposedly-raw-HTML literal would
 * silently corrupt the developer's own markup, which is worse than a loud
 * compile-time refusal.
 *
 * Blade's `<x-…>`/`</x-…>`: this project's `BladeBackend` constructs a
 * plain `Illuminate\View\Compilers\BladeCompiler`, whose component-tag
 * compiler (`$compilesComponentTags = true` by default) resolves and
 * renders a live Blade component for `<x-foo>` — NOT template-substitution,
 * full component-class/view resolution (Fable review, #2217). This is the
 * single sharpest case of "not inert text once spliced" in the whole guard
 * table, sharper than a bare `{{ }}` interpolation.
 *
 * Go's `html/template` context-aware escaper is a DOCUMENTED caveat, not a
 * guarded case: it parses the spliced literal to pick escaping contexts for
 * SUBSEQUENT `{{ }}` actions in the same template, so malformed markup (an
 * unclosed `<script>`/`<style>`) can produce a template `Parse` error or
 * mis-contexted escaping of later actions — output corruption, never
 * injection, and no different from hand-writing the same malformed HTML
 * into the template (this module's stated trust domain). The `{{` guard
 * below still catches the actual injection vector (a literal containing a
 * live action).
 */
const TEMPLATE_METACHAR_PATTERNS: Readonly<Record<string, RegExp>> = {
  blade: /\{\{|\{!!|<\?|@\w|<\/?\s*x[-:]/,
  erb: /<%/,
  'go-template': /\{\{/,
  jinja: /\{\{|\{%|\{#/,
  minijinja: /\{\{|\{%|\{#/,
  mojolicious: /<%|^\s*%/m,
  twig: /\{\{|\{%|\{#/,
  xslate: /<:|^\s*:/m,
}

/**
 * `null` when `html` is safe to splice as-is into `adapterId`'s template
 * source; otherwise a human-readable reason naming the offending adapter's
 * metacharacter family (or the missing-guard case below), for the refusal
 * message.
 *
 * FAILS CLOSED for an `adapterId` with no entry in
 * {@link TEMPLATE_METACHAR_PATTERNS} (Fable review, #2217): a 9th template
 * adapter added later — e.g. by following the repo's own `add-adapter`
 * playbook, which will tell it to wire the same
 * `resolveDangerousInnerHtml`/`dangerousInnerHtmlMetacharViolation` calls
 * every existing adapter does — must not silently get an unguarded splice
 * just because nobody remembered to extend this table. Refusing loudly is
 * the safe default; only the 8 adapters actually verified against their
 * own template compiler's syntax get to skip the refusal.
 */
export function dangerousInnerHtmlMetacharViolation(html: string, adapterId: string): string | null {
  const pattern = TEMPLATE_METACHAR_PATTERNS[adapterId]
  if (!pattern) {
    return `no template-metacharacter guard is defined for adapter '${adapterId}' — refusing rather than splicing unguarded`
  }
  if (!pattern.test(html)) return null
  return `the literal HTML contains a sequence ${adapterId}'s own template compiler would interpret (not inert text once spliced into the template)`
}

/**
 * Purpose-built `BF101` for a `dangerouslySetInnerHTML` value this adapter
 * can't lower. Two distinct failure families funnel through here, so the base
 * message is chosen by whether a `reason` is supplied:
 *
 * - WITHOUT a `reason` — the value is not the required SHAPE: it must be an
 *   object literal with exactly one `__html` property (no spreads, extra keys,
 *   or computed keys). The message states that contract so a near-miss like
 *   `{ __html: x, extra: 1 }` (refused as `unlowerable`) doesn't get told it
 *   "expects an { __html: … }" it already appears to have.
 * - WITH a `reason` — the value IS a well-formed `{ __html: … }` object
 *   literal that this adapter still can't lower: a static literal carrying
 *   template metacharacters (`dangerousInnerHtmlMetacharViolation`), or — on
 *   the Go adapter — a template-literal / conditional inner expression with no
 *   single-argument raw form. The `reason` is the real story; the base states
 *   only that the value can't be lowered here, not that the shape is wrong.
 *
 * A genuinely dynamic value with a lowerable inner expression no longer
 * reaches here — it is lowered through the adapter's raw-output sink (#2319).
 */
export function dangerousInnerHtmlDiagnostic(
  expr: string,
  loc: SourceLocation,
  reason?: string,
): CompilerError {
  const base = reason
    ? `dangerouslySetInnerHTML value cannot be lowered on this adapter — ${reason}`
    : 'dangerouslySetInnerHTML requires an object literal with a single `__html` property (e.g. { __html: value }) — spreads, extra keys, and computed keys are not supported'
  return {
    code: 'BF101',
    severity: 'error',
    message: `${base}${expr ? `: ${expr.trim()}` : ''}`,
    loc,
    suggestion: {
      message:
        'Pass an object literal { __html: value } with exactly one `__html` property (a string literal is spliced as trusted template text; a prop/signal value is lowered through the adapter\'s raw-output sink). To force it onto the client instead of SSR, use /* @client */ (e.g. dangerouslySetInnerHTML={/* @client */ { __html: expr }}) so hydration sets it.',
    },
  }
}
