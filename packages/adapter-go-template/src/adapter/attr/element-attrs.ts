/**
 * Intrinsic-element attribute emission (#3425): how one attribute value of an
 * HTML element becomes Go-template markup — the `style={{ … }}` object
 * lowering, the boolean/presence `{{if}}` form, the ternary arms (including
 * the `cond ? v : undefined` omission), the template-literal and
 * registered-call (`bf_attr`) routes, the nil-guarded omission paths
 * (`{{if ne X nil}}name="{{X}}"{{end}}`) and the `{...spread}` lowering.
 *
 * The adapter's `elementAttrEmitter` (the `AttrValueEmitter` the shared
 * `renderElementAttributes` dispatches through) stays the entry point and
 * calls these free functions over an {@link ElementAttrHost}. Its
 * `emitExpression` keeps the reads of the attribute's source text (the
 * fallback parse and the bare `props.x` / `rest.x` checks) and hands the
 * results in as {@link BareAttrRead}, so the emit-parse ratchet keeps
 * counting them where they were.
 */

import {
  attrValueMayBeNullish,
  isBooleanAttr,
  nullableSignalAttrGetter,
  planStyleObject,
  stringifyParsedExpr,
  type ExpressionAttr,
  type IRTemplatePart,
  type JsSourceText,
  type ParsedExpr,
  type SourceLocation,
  type SpreadAttr,
  type TemplateAttr,
} from '@barefootjs/jsx'

import type { GoEmitContext } from '../emit-context.ts'
import { lowerRegisteredAttrCall } from '../expr/url-builder.ts'
import { goAttrNameToken, wrapIfMultiToken } from '../lib/go-emit.ts'

/**
 * What the attribute emission needs from the adapter beyond the shared
 * {@link GoEmitContext}: the recursive `ParsedExpr` renderer, the loop/scope
 * position of the element being rendered, the text-position number spelling
 * and the root-field reference of a nillable prop. Kept out of
 * `GoEmitContext` because only this module reads them.
 */
export interface ElementAttrHost {
  readonly ctx: GoEmitContext
  /** Render a `ParsedExpr` through the adapter's `ParsedExprEmitter`. */
  renderParsedExpr(expr: ParsedExpr): string
  /** Whether a lowered Go string already carries its own `{{...}}` actions. */
  isTemplateFragment(go: string, kind?: ParsedExpr['kind']): boolean
  /** The JS number spelling of a value printed as text (`bf_text` / `bf_string`). */
  numericTextExpression(goExpr: string, expr: ParsedExpr | undefined): string
  /** The root field of the nillable prop `propName` names, or null. */
  nillablePropFieldRef(propName: string, viaPropsObject: boolean): string | null
  /** Whether a loop row or callback binds `name` at the current position. */
  isBound(name: string): boolean
  /** Whether the element renders inside a `{{range}}`. */
  inLoop(): boolean
  /** Whether `name` is the innermost loop's plain item param (Go's `.`). */
  isCurrentLoopItem(name: string): boolean
  /** The object-rest exclude keys a loop destructure binds `name` to. */
  lookupRestExclude(name: string): { parent: string; excludeKeys: string[] } | undefined
  /** Record a wrapper-row read of `name`; returns `rendered`. */
  noteWrapperRowRead(name: string, rendered: string): string
  /** A source location for a diagnostic. */
  makeLoc(): SourceLocation
}

/**
 * The bare-reference facts the adapter reads off an attribute's source text
 * for the nil-guarded omission paths: the prop a bare `x` / `props.x` names
 * (null unless it is a plain identifier), and whether the value is a bare
 * `rest.key` read of a closed-type `{...rest}` bag.
 */
export interface BareAttrRead {
  readonly nillablePropName: string | null
  readonly viaPropsObject: boolean
  readonly restKeyRead: boolean
}

/**
 * The attribute forms decided before the value is parsed: a `style={{ … }}`
 * object literal, and a boolean / presence-or-undefined attribute. Null when
 * neither applies.
 */
export function emitStyleOrPresenceAttr(host: ElementAttrHost, value: ExpressionAttr, name: string): string | null {
  // `style={{ … }}` object literal → a CSS string with dynamic values
  // interpolated, instead of refusing the bare object with BF101.
  if (name === 'style') {
    const css = tryLowerStyleObject(host, value)
    if (css !== null) return `style="${css}"`
  }
  if (isBooleanAttr(name) || value.presenceOrUndefined) {
    // Every boolean-attribute value routes through `convertConditionToGo`
    // even when it's a plain item-bound expression (`disabled={item.x}`),
    // not a `conditional` IR node — so #2898's `staticLoopItemStack` check
    // there also fixes this path inside an unrolled static loop row (was
    // a pre-existing silent divergence; `static-loop-item-boolean-attr`
    // is its regression fixture).
    const { condition: goCond, preamble } = host.ctx.convertConditionToGo(value.expr, value.parsed)
    // ARIA attributes are string-valued ("true"/"false"), not HTML5 presence
    // booleans — the truthy presence form renders as `aria-x="true"`
    // (`aria-disabled={isDisabled() || undefined}`).
    const body = name.startsWith('aria-') ? `${name}="true"` : name
    return `${preamble}{{if ${goCond}}}${body}{{end}}`
  }
  return null
}

/** An expression attribute whose value has been parsed (`parsed`). */
export function emitParsedExpressionAttr(
  host: ElementAttrHost,
  value: ExpressionAttr,
  name: string,
  parsed: ParsedExpr,
  bare: BareAttrRead,
): string {
  // #3309 / #3326: a `data-…` name html/template would classify as
  // script / URL / CSS (`data-on…`, `data-src`, `data-style`) is emitted
  // as a `bf_attr_name` action so the value below is escaped as plain text.
  const nameTok = goAttrNameToken(name)
  if (parsed.kind === 'conditional') return emitConditionalAttr(host, name, nameTok, parsed)
  if (parsed.kind === 'template-literal') {
    // Inline Go template syntax with embedded `{{...}}` actions.
    return `${nameTok}="${host.renderParsedExpr(parsed)}"`
  }
  // #2743: a `query` guard-list value (queryHref) emits the WHOLE
  // attribute via `bf_attr` (template.HTMLAttr) so html/template's
  // URL-context inference on the attribute name never percent-encodes
  // the base. See `lowerRegisteredAttrCall`.
  const attrAction = lowerRegisteredAttrCall(host.ctx, name, parsed)
  if (attrAction !== null) return attrAction
  return emitNilGuardedAttr(host, value, nameTok, bare)
}

/** A ternary attribute value (`name={c ? a : b}`). */
function emitConditionalAttr(
  host: ElementAttrHost,
  name: string,
  nameTok: string,
  parsed: Extract<ParsedExpr, { kind: 'conditional' }>,
): string {
  // A ternary whose falsy branch is `undefined` / `null` OMITS the
  // attribute entirely (`aria-current={props.isActive ? 'page' :
  // undefined}`) — wrap the whole attribute in the condition instead of
  // rendering `attr=""`.
  const undef = (e: ParsedExpr): boolean =>
    (e.kind === 'identifier' && (e.name === 'undefined' || e.name === 'null')) ||
    (e.kind === 'literal' && (e.value === null || e.value === undefined))
  if (undef(parsed.alternate) && !undef(parsed.consequent)) {
    return emitOmittableTernaryAttr(host, name, nameTok, parsed)
  }
  // #2743 follow-up (pullfrog review on #2841): a `query` guard-list
  // value (queryHref) reachable through EITHER branch of this ternary
  // still needs the whole-attribute `bf_attr` route — otherwise the
  // pipeline below lands inside the ordinary `name="{{...}}"` wrapper
  // and html/template's URL-context inference still percent-encodes
  // whichever branch wins at render time. See `lowerRegisteredAttrCall`.
  const attrTernary = lowerRegisteredAttrCall(host.ctx, name, parsed)
  if (attrTernary !== null) return attrTernary
  // #2335: the ternary lowers to the pipeline-position `(bf_ternary …)`
  // value (no longer a `{{if}}…{{end}}` fragment), so wrap it in a single
  // `{{…}}` action inside the attribute string — `name="{{bf_ternary …}}"`.
  const ternary = host.renderParsedExpr(parsed)
  const ternaryText = host.numericTextExpression(ternary, parsed)
  // A branch that can be nullish (#3322, `attrValueMayBeNullish`) omits
  // the attribute when the taken branch is nil.
  if (attrValueMayBeNullish(parsed, host.ctx.state.nullishAttrCtx, n => host.isBound(n))) {
    return `{{if ne ${ternary} nil}}${nameTok}="{{${ternaryText}}}"{{end}}`
  }
  return `${nameTok}="{{${ternaryText}}}"`
}

/** `name={test ? value : undefined}`: the attribute wrapped in `{{if test}}`. */
function emitOmittableTernaryAttr(
  host: ElementAttrHost,
  name: string,
  nameTok: string,
  parsed: Extract<ParsedExpr, { kind: 'conditional' }>,
): string {
  const test = parsed.test
  // Lower the parsed test. If it renders as a self-contained action
  // block, lower the whole ternary instead, as before. Never re-read
  // the test from `value.expr`: slicing at the first `?` cuts a
  // `?.`, `??` or `'?'` in the test short (#3511).
  const condTree = host.isTemplateFragment(host.renderParsedExpr(test), test.kind) ? parsed : test
  const { condition: goCond, preamble } = host.ctx.convertConditionToGo(
    stringifyParsedExpr(condTree),
    condTree,
  )
  // #2842 / #2743: a `query` guard-list consequent (queryHref) takes
  // the whole-attribute `bf_attr` route INSIDE the `{{if}}`, so
  // html/template's URL-context inference never percent-encodes it —
  // the same route the direct-call and non-undefined-ternary shapes
  // take. The consequent is passed alone (not the ternary): omission
  // needs this `{{if}}` wrapper, which `bf_attr` can't express on its
  // own. Any other consequent (a `helper-call` plugin, an unmatched
  // call, a member/literal) keeps the ordinary `name="{{…}}"` form —
  // `call()` now consults the registry too, so a plugin call renders
  // its `bf_<helper>` pipeline there instead of invalid Go syntax.
  const attrConsequent = lowerRegisteredAttrCall(host.ctx, name, parsed.consequent)
  const body = attrConsequent !== null
    ? attrConsequent
    : `${nameTok}="{{${host.numericTextExpression(host.renderParsedExpr(parsed.consequent), parsed.consequent)}}}"`
  return `${preamble}{{if ${goCond}}}${body}{{end}}`
}

/**
 * Any other expression value: the nil-guarded omission paths (a bare
 * nillable prop, a nullable signal read, a `rest.key` read, a value that may
 * be nullish) and the plain `name="{{…}}"` form.
 */
function emitNilGuardedAttr(host: ElementAttrHost, value: ExpressionAttr, nameTok: string, bare: BareAttrRead): string {
  const { ctx } = host
  // Nullish-attribute omission: when the attribute value is a BARE reference
  // to a nillable (`interface{}`) prop field, guard emission on `ne .X nil`
  // so an unset optional prop drops the attribute entirely instead of
  // rendering `attr=""`. Scope is deliberately narrow — bare identifiers only
  // — so member exprs, calls, ternaries, template literals, and
  // concrete-typed props (never nil) still emit `attr=""` / `attr="0"`.
  // A props-object access (`props.id`) arrives normalized to its bare prop
  // name (`id`), so the nillable set — keyed by bare prop name — matches the
  // SolidJS-style props-object pattern too, not just destructured params.
  const field = bare.nillablePropName !== null ? host.nillablePropFieldRef(bare.nillablePropName, bare.viaPropsObject) : null
  if (field !== null) {
    return `{{if ne ${field} nil}}${nameTok}="{{${ctx.convertExpressionToGo(value.expr, undefined, value.parsed)}}}"{{end}}`
  }
  // The same omission for a bare read of a nullable signal (`title={s()}`
  // with `s()` undefined, #3304): its `interface{}` field holds `nil`.
  if (nullableSignalAttrGetter(value.parsed, ctx.state.nillableSignalGetters) !== null) {
    const goExpr = ctx.convertExpressionToGo(value.expr, undefined, value.parsed)
    return `{{if ne (${goExpr}) nil}}${nameTok}="{{${goExpr}}}"{{end}}`
  }
  // A closed-type `{...rest}` key (#3057) reads off the rest bag's
  // `map[string]any` field via `bf_get` (see the `restPropsName` member-
  // access route above), never a capitalized Props-struct field, so it
  // can't reuse the `nillablePropNames`/`capitalizeFieldName` route
  // above. `bf_get` returns Go's untyped `nil` for a key the caller
  // omitted, so the same nil-check omission still applies — value and
  // guard share the identical `bf_get` expression.
  if (bare.restKeyRead) {
    const goExpr = ctx.convertExpressionToGo(value.expr, undefined, value.parsed)
    return `{{if ne (${goExpr}) nil}}${nameTok}="{{${goExpr}}}"{{end}}`
  }
  // Lower once; if the result is already a self-contained action block (e.g.
  // an inlined `sortClass(k)` → `{{if …}}…{{end}}`), embed it as-is rather
  // than double-wrapping it in another `{{…}}`.
  const exprOut: { parsed?: ParsedExpr } = {}
  const go = ctx.convertExpressionToGo(value.expr, exprOut, value.parsed)
  if (host.isTemplateFragment(go, exprOut.parsed?.kind)) return `${nameTok}="${go}"`
  // #3359: an arithmetic result or numeric memo is a boxed `float64`
  // here as in text position, so the attribute string takes the same
  // JS number spelling (`1234567890.5`, not `1.2345678905e+09`).
  const goText = host.numericTextExpression(go, exprOut.parsed ?? value.parsed)
  // A value that reaches `undefined`/`null` through a memo, an optional
  // member read or a ternary branch (#3322, `attrValueMayBeNullish`)
  // omits the attribute on a nil value, as Hono does. `ne x nil` is
  // false only for an untyped nil, so a typed field always renders.
  if (attrValueMayBeNullish(value.parsed, ctx.state.nullishAttrCtx, n => host.isBound(n))) {
    return `{{if ne (${go}) nil}}${nameTok}="{{${goText}}}"{{end}}`
  }
  return `${nameTok}="{{${goText}}}"`
}

// Spread attributes (`<div {...attrs()} />`) lower through the
// `bf_spread_attrs` runtime helper. Two paths:
//   - Top-level spread: the bag was plumbed onto the component's Props struct
//     as `.Spread_<slotId>`; emit a reference to it.
//   - Loop-internal spread: the bag lives in the loop iteration variable
//     (Go template's `.` plus property access). Translate the JS expression
//     via `convertExpressionToGo` and emit `{{bf_spread_attrs <e>}}` inline.
// Slot IDs are assigned at IR build time so identity is stable across
// re-emits; a missing one falls back to BF101.
export function emitSpreadAttr(host: ElementAttrHost, value: SpreadAttr): string {
  if (!value.slotId) {
    host.ctx.state.errors.push({
      code: 'BF101',
      severity: 'error',
      message: `JSX spread '{...${value.expr}}' on an intrinsic element has no Go template lowering (missing slot id)`,
      loc: host.makeLoc(),
      suggestion: {
        message: 'This usually means a closed-type rest-prop spread was unexpectedly routed through the bag path — file a bug with the source.',
      },
    })
    return ''
  }
  if (host.inLoop()) {
    // Inside `{{range $_, $t := .Tasks}}`, the iteration value surfaces as Go
    // template's `.` (current context). A bare reference to the loop param
    // therefore translates to `.`, not `.T` (the generic identifier path).
    // Property access through the loop param (`t.attrs`) is already handled
    // by the member-expression path that returns `.Attrs`.
    //
    // A per-item spread whose operand is a plain object/array field read
    // (not a destructure-rest binding) is otherwise gated on whether the
    // enclosing signal's literal initial value bakes at all — see
    // `parsed-literal-to-go.ts`'s nested object/array property support
    // (#2087), which lifted the flat-object-only restriction for the
    // destructure-residual fixtures below.
    const trimmed = value.expr.trim()
    if (host.isCurrentLoopItem(trimmed)) {
      // The row's keys are Go-cased by the field-access contract: the
      // same lowering that makes `attrs.id` emit `{{.ID}}`
      // (`goFieldNameForKey` → `capitalizeFieldName`) requires the
      // seeded row map/struct to be keyed `ID`/`Title`/`DataKind`.
      // `bf_js_keys` (bf.go) undoes just that capitalization — struct
      // via json tag, map via the `capitalizeFieldName` inverse —
      // before `toAttrName`'s UNCHANGED camelCase→kebab conversion
      // sees the real JS names (#2490).
      return `{{bf_spread_attrs (bf_js_keys .)}}`
    }
    // Destructure object-rest spread onto an element (`{...rest}`, #2087
    // Phase B): `rest` alone would spread the WHOLE item (every field,
    // including the ones the pattern already destructured out as `id` /
    // `title`) — route through `bf_omit` instead so the residual excludes
    // exactly those sibling keys. Only a spread whose expr is the BARE
    // rest name matches (`isLowerableLoopDestructure`'s admitted shape);
    // anything else (`{...fn(rest)}`) already refused at the IR gate.
    // `Omit` already recovers original names via json tag (struct) /
    // passthrough (map), so this arm does NOT need `bf_js_keys`.
    const restInfo = host.lookupRestExclude(trimmed)
    if (restInfo) {
      const excludeArgs = restInfo.excludeKeys.map(k => JSON.stringify(k)).join(' ')
      const parent = host.noteWrapperRowRead(trimmed, restInfo.parent)
      const omitArgs = excludeArgs ? `${parent} ${excludeArgs}` : parent
      return `{{bf_spread_attrs (bf_omit ${omitArgs})}}`
    }
    // A field/member read off the loop row (`{...g.extra}`) — same
    // Go-casing exposure as the bare-item case above, PLUS an
    // ambiguity the compiler can't resolve at compile time: a
    // `Record<string, string>` field's runtime map could have been
    // seeded with JS-native data keys (`data-kind`) OR Go-cased
    // field-name keys, and nothing in the TYPE says which. `bf_js_keys`
    // is a no-op on an already-lowercase-first-rune key (lowercasing
    // `data-kind`'s first rune changes nothing) and corrective on a
    // Go-cased one, so wrapping here is safe for both conventions
    // rather than betting on one (#2490).
    const goExpr = host.ctx.convertExpressionToGo(value.expr)
    // `convertExpressionToGo` already pushes BF101 for unsupported
    // expressions and returns `""`; pass through so the template still
    // compiles.
    // `goExpr` is not necessarily a single token — a member spread can
    // lower to a pipeline (`bf_get . $.K`), which the template parser
    // would otherwise read as extra ARGUMENTS to `bf_js_keys`.
    return `{{bf_spread_attrs (bf_js_keys ${wrapIfMultiToken(goExpr)})}}`
  }
  return `{{bf_spread_attrs .${value.slotId}}}`
}

/** A template-literal attribute value (`class={`a ${b}`}`). */
export function emitTemplateAttr(host: ElementAttrHost, value: TemplateAttr, name: string): string {
  return `${goAttrNameToken(name)}="${renderTemplateLiteralParts(host, value.parts)}"`
}

/**
 * Lower a `style={{ … }}` object-literal value to a CSS string with dynamic
 * values interpolated as Go template actions, e.g.
 * `{ backgroundColor: color, padding: '8px' }` →
 * `background-color:{{.Color}};padding:8px`. Returns null when the object
 * shape is unsupported or any value expression can't be lowered (the caller
 * then falls through to the generic BF101 path).
 */
function tryLowerStyleObject(host: ElementAttrHost, value: ExpressionAttr): string | null {
  const entries = planStyleObject(value)
  if (!entries) return null
  // Routed through the single `bf_style_object` runtime call (#2261)
  // rather than per-pair `key:value` template interpolation — a dynamic
  // value that fails the ported `hasUnsafeStyleValue` CSS-injection scan
  // must DROP its entire pair to match Hono's oracle behavior, which
  // isn't expressible as a per-pair inline substitution (a dropped
  // MIDDLE pair would otherwise leave a dangling `key:` / stray `;;` in
  // a `.map().join(';')` splice). `String()` (already returns "" for
  // nil) also has an established zero-value contract for numbers/bools,
  // avoiding html/template's own contextual CSS auto-escaper (whose
  // `ZgotmplZ` sentinel — the pre-#2261 divergence — is bypassed by the
  // call returning a trusted `template.CSS`, not a plain `string`).
  const args = entries.flatMap(e => [
    JSON.stringify(e.cssKey),
    e.kind === 'literal' ? JSON.stringify(e.value) : wrapIfMultiToken(host.ctx.convertExpressionToGo(e.expr, undefined, e.parsed)),
  ])
  return `{{bf_style_object ${args.join(' ')}}}`
}

function renderTemplateExpression(host: ElementAttrHost, expr: JsSourceText, parsed: ParsedExpr): string {
  if (parsed.kind === 'template-literal') {
    return parsed.parts.map(part => {
      if (part.type === 'string') return escapeAttrText(part.value)
      const rendered = host.renderParsedExpr(part.expr)
      return host.isTemplateFragment(rendered, part.expr.kind) ? rendered : '{{' + rendered + '}}'
    }).join('')
  }
  const rendered = host.ctx.convertExpressionToGo(expr, undefined, parsed)
  return host.isTemplateFragment(rendered, parsed.kind) ? rendered : '{{' + rendered + '}}'
}

/**
 * HTML-attribute-safe escaping for double-quoted attribute values. `&`/`"`/`<`
 * are non-negotiable — without them the surrounding `class="..."` quoting
 * breaks (e.g. UnoCSS's `[class*="size-"]`). `>`/`'` are belt-and-suspenders:
 * HTML5 permits both inside double-quoted attrs, but Go's `html/template`
 * lexer is contextual, so escape them too.
 */
function escapeAttrText(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

function renderTemplateLiteralParts(host: ElementAttrHost, parts: IRTemplatePart[]): string {
  let output = ''
  for (const part of parts) {
    if (part.type === 'string') {
      output += escapeAttrText(part.value)
    } else if (part.type === 'expression') {
      output += renderTemplateExpression(host, part.expr, part.parsed)
    } else if (part.type === 'ternary') {
      const { condition: goCond, preamble } = host.ctx.convertConditionToGo(part.condition)
      output += `${preamble}{{if ${goCond}}}${part.whenTrue}{{else}}${part.whenFalse}{{end}}`
    } else if (part.type === 'lookup') {
      // `${MAP[KEY]}` against a Record<T, string> literal — emit a chained
      // `{{if eq .Key "<case>"}}<value>{{else if ...}}{{end}}` so the right
      // case lights up at SSR time. Empty when no case matches; consumers
      // shouldn't rely on a default fallback here (the JSX-side
      // `variant = 'default'` default already shows up via the per-prop
      // fallback in `NewXxxProps`).
      const rawKeyExpr = host.ctx.convertExpressionToGo(part.key)
      // A compound key (`props.placement ?? 'top'` → `or .Placement "top"`)
      // must be parenthesized inside `eq` — unwrapped, Go's template parser
      // reads `eq or .Placement "top" "left"` as four arguments with a zero-arg
      // `or`.
      const keyExpr = /\s/.test(rawKeyExpr) ? `(${rawKeyExpr})` : rawKeyExpr
      const caseEntries = Object.entries(part.cases)
      if (caseEntries.length === 0) continue
      const branches = caseEntries.map(([k, v], i) => {
        const head = i === 0 ? '{{if' : '{{else if'
        // The case value is a static Record<T,string> literal emitted straight
        // into attribute-value text, so HTML-escape it like `string` parts
        // (via escapeAttrText). Otherwise UnoCSS
        // tokens like `has-[>svg]:px-2.5` would leak a raw `>`.
        return `${head} eq ${keyExpr} ${JSON.stringify(k)}}}${escapeAttrText(v)}`
      })
      output += branches.join('') + '{{end}}'
    }
  }
  return output
}
