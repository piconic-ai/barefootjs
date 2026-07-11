/**
 * Shared `dangerouslySetInnerHTML={{ __html: expr }}` recognition + policy
 * (#2207). Single place every template adapter calls from `renderElement`,
 * so the injection-safety-relevant policy — "only a compile-time string
 * literal is lowered; anything else refuses loudly" — lives in exactly one
 * reviewable spot instead of being re-derived independently in 8 adapters.
 *
 * Scope, deliberately narrow for v1 (see #2207 / #2215 for the follow-up):
 * a static literal is spliced directly into the adapter's OWN template
 * source as trusted text (same trust domain as hand-writing the HTML into
 * the template) — never routed through a `|safe`/`|raw`/`{!! !!}`-style
 * runtime raw-output primitive, which would reopen a template-source
 * injection surface for no benefit (the value is already fully known at
 * compile time). A DYNAMIC value (signal, prop, template literal, local
 * const, anything non-literal) is refused with `BF101`: Hono/CSR already
 * support it (the client drives a `createEffect`-based `el.innerHTML = …`
 * assignment — see `ir-to-client-js/emit-reactive.ts`), so this is a
 * template-adapter-only gap, tracked separately (#2215) rather than folded
 * into this literal-only cut.
 */

import type { CompilerError, IRAttribute, IRElement, SourceLocation } from '../types.ts'
import { parseExpression, type ParsedExpr } from '../expression-parser.ts'

const DANGEROUS_INNER_HTML_ATTR = 'dangerouslySetInnerHTML'

export function isDangerousInnerHtmlAttr(attr: IRAttribute): boolean {
  return attr.name === DANGEROUS_INNER_HTML_ATTR
}

export type DangerousInnerHtmlResolution =
  | { kind: 'static'; html: string }
  | { kind: 'dynamic'; expr: string; loc: SourceLocation }

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
    return { kind: 'dynamic', expr: '', loc: attr.loc }
  }
  const parsed = attr.value.parsed ?? parseExpression(attr.value.expr.trim())
  const html = staticHtmlLiteral(parsed)
  if (html !== null) return { kind: 'static', html }
  return { kind: 'dynamic', expr: attr.value.expr, loc: attr.loc }
}

/**
 * `{ __html: '<b>bold</b>' }` → the literal string, nothing else. Exactly
 * one property, key `__html` (identifier or string form — `{ __html: … }`
 * and `{ '__html': … }` are equivalent JS), non-shorthand (`{ __html }`
 * would read a variable, not a literal), value a plain string literal.
 * A template literal (even one with no `${}` substitutions), a local
 * `const`, string concatenation, or any other shape all fall through to
 * `null` — no const-folding, no partial evaluation. Widening this is a
 * single-place change here, deliberately not attempted in v1 (#2207).
 */
function staticHtmlLiteral(parsed: ParsedExpr): string | null {
  if (parsed.kind !== 'object-literal') return null
  if (parsed.properties.length !== 1) return null
  const [prop] = parsed.properties
  if (prop.shorthand) return null
  if (prop.key !== '__html') return null
  if (prop.value.kind !== 'literal' || prop.value.literalType !== 'string') return null
  return prop.value.value as string
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
 * can't lower — either genuinely dynamic (not a literal) or a static
 * literal that fails the metachar guard above. Named `reason` so both
 * refusal paths funnel through the same message shape rather than growing
 * two near-identical adapter-side error strings.
 */
export function dangerousInnerHtmlDiagnostic(
  expr: string,
  loc: SourceLocation,
  reason?: string,
): CompilerError {
  const detail = reason ? ` — ${reason}.` : ''
  return {
    code: 'BF101',
    severity: 'error',
    message: `dangerouslySetInnerHTML requires an inline { __html: '...' } string literal on template adapters${expr ? `: ${expr.trim()}` : ''}${detail}`,
    loc,
    suggestion: {
      message:
        'Dynamic or signal-derived HTML for dangerouslySetInnerHTML is only supported on Hono/CSR today (tracked separately: https://github.com/piconic-ai/barefootjs/issues/2215). Use an inline string literal, or defer it to the client with /* @client */ (e.g. dangerouslySetInnerHTML={/* @client */ { __html: expr }}) so hydration sets it instead of SSR.',
    },
  }
}
