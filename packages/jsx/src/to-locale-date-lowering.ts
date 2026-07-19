/**
 * Literal-locale `toLocaleDateString` lowering plugin (#2324 slice 2 — the
 * "upper layer" sugar over the `format_date` primitive).
 *
 * `createdAt.toLocaleDateString('ja-JP', { timeZone: 'UTC' })` on a
 * `Date`-typed prop, with a **compile-time literal** locale and an explicit
 * literal `timeZone`, resolves the locale's default date pattern ONCE at
 * build time (via the build machine's own `Intl.DateTimeFormat`) and lowers
 * to the exact same backend-neutral `helper-call` on `format_date` that
 * `formatDate(date, pattern, tz)` produces. Consequences:
 *
 *   - no runtime ICU/CLDR on any backend — the CLDR lookup happens once, in
 *     the compiler;
 *   - SSR and (rewritten) client JS render from the same frozen pattern, so
 *     output is byte-identical by construction;
 *   - no locale allowlist: any locale whose default date format the
 *     structural gate below can prove representable in the v1 token set is
 *     admitted, and every other shape declines (→ BF021 via
 *     `rich-type-refusal.ts`, whose gate exempts exactly what a registered
 *     plugin claims).
 *
 * A NON-literal locale is admitted in exactly one shape (#2324's
 * union-typed-locale stage): a REQUIRED prop whose TS type is a closed
 * string-literal union (`locale: 'en-US' | 'ja-JP'`). Every member's pattern
 * resolves at build time and the pattern argument lowers to a ternary over
 * the runtime value — runtime locale switching, still zero runtime CLDR.
 * The type IS the contract: TS keeps the runtime value inside the union.
 *
 * Deliberately NOT lowered (decline → loud BF021, never a silent guess):
 *   - zero-arg / locale-only calls — they read the host's locale and/or
 *     timezone, the implicit-environment hole #2273 closed;
 *   - an OPEN-typed runtime locale (`locale: string`) — build-time CLDR
 *     resolution is impossible; the app's i18n layer owns locale → pattern
 *     there, feeding `formatDate` directly. An OPTIONAL union prop also
 *     declines: `undefined` at runtime makes real `toLocaleDateString` read
 *     the host locale, which no frozen pattern table can reproduce;
 *   - an IANA `timeZone` name — couples output to the host's tzdata version
 *     (only `'UTC'` and fixed `±HH:MM` offsets are deterministic);
 *   - options beyond `timeZone` (`dateStyle`, `month: 'long'`, …) — the
 *     name-table stage of #2324, not this slice;
 *   - a locale whose default format needs anything beyond numeric
 *     year/month/day in latin digits on the gregorian calendar (e.g.
 *     `ar-SA`: islamic-umalqura calendar, arabic-indic digits).
 */

import type { IRMetadata, TypeInfo } from './types.ts'
import type { ParsedExpr } from './expression-parser.ts'
import type { LoweringNode, LoweringPlugin } from './lowering-registry.ts'
import { resolveReceiverType, baseTypeName } from './rich-type-evidence.ts'
import { typeReachesDate } from './date-lowering.ts'

/**
 * `timeZone` literals the lowering admits: `'UTC'` or a fixed `±HH:MM`
 * offset **within ECMA-402's valid offset range** (hours 00–23, minutes
 * 00–59). An out-of-range shape like `'+25:00'` or `'+99:99'` must DECLINE
 * (→ BF021), not lower: real `toLocaleDateString` throws a RangeError on
 * it, so compiling it would render a nonsense offset on the template
 * adapters while the JS-native path (Hono, and the pre-rewrite semantics
 * the sugar stands in for) crashes — the exact divergence the sugar exists
 * to rule out.
 */
export const TO_LOCALE_TZ_RE = /^(?:UTC|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/

/**
 * Probe instant for pattern derivation: 2001-02-03 UTC. Month and day are
 * distinct single-digit values, so the rendered part text distinguishes both
 * the field order (`M/D` vs `D.M`) and zero-padding (`02` → `MM`, `2` → `M`).
 */
const PROBE_UTC = new Date(Date.UTC(2001, 1, 3))

/** Build-time cache: locale tag → derived pattern (or null = not representable). */
const patternCache = new Map<string, string | null>()

/**
 * Resolve a locale literal to its default date pattern in the v1
 * `format_date` token language (`YYYY`/`MM`/`M`/`DD`/`D` + literal text), or
 * null when the locale's default format is not representable. The gate is
 * structural, not an allowlist: the format must resolve to the gregorian
 * calendar in latin digits and consist solely of numeric year/month/day
 * parts (4-digit year) plus separator literals that cannot collide with the
 * token alphabet. `en-US` → `M/D/YYYY`, `ja-JP` → `YYYY/M/D`, `en-GB` →
 * `DD/MM/YYYY`, `de-DE` → `D.M.YYYY`; `ar-SA` (islamic-umalqura/arab) and
 * any 2-digit-year or era/weekday-bearing default → null.
 */
export function resolveLocaleDatePattern(locale: string): string | null {
  const cached = patternCache.get(locale)
  if (cached !== undefined) return cached
  const derived = derivePattern(locale)
  patternCache.set(locale, derived)
  return derived
}

function derivePattern(locale: string): string | null {
  let parts: Intl.DateTimeFormatPart[]
  try {
    const dtf = new Intl.DateTimeFormat(locale, { timeZone: 'UTC' })
    const resolved = dtf.resolvedOptions()
    if (resolved.calendar !== 'gregory' || resolved.numberingSystem !== 'latn') return null
    parts = dtf.formatToParts(PROBE_UTC)
  } catch {
    return null // invalid language tag
  }
  let pattern = ''
  for (const part of parts) {
    switch (part.type) {
      case 'year':
        if (part.value !== '2001') return null // 2-digit-year default has no v1 token
        pattern += 'YYYY'
        break
      case 'month':
        if (part.value === '2') pattern += 'M'
        else if (part.value === '02') pattern += 'MM'
        else return null // name/narrow month — the later name-table stage
        break
      case 'day':
        if (part.value === '3') pattern += 'D'
        else if (part.value === '03') pattern += 'DD'
        else return null
        break
      case 'literal':
        // A literal containing the token alphabet would be re-tokenized by
        // the helper's scan; no real numeric-format separator does, but the
        // gate must prove it rather than assume it.
        if (/[YMD]/.test(part.value)) return null
        pattern += part.value
        break
      default:
        return null // era, weekday, dayPeriod, … — not representable
    }
  }
  if (!pattern.includes('YYYY') || !/M/.test(pattern) || !/D/.test(pattern)) return null
  return pattern
}

/**
 * Recognise `<Date-typed prop>.toLocaleDateString(<locale literal>,
 * { timeZone: <'UTC' | '±HH:MM' literal> })` per the module doc and return
 * the `format_date` helper-call with the build-time-resolved pattern, or
 * decline (null) for every other shape. Receiver evidence mirrors
 * `date-lowering.ts`'s `matchDateCall` exactly (prop-rooted, `Date`-typed,
 * no in-file type shadow, `EMPTY_BINDINGS`).
 */
/** A quoted string-literal union member's value, or null when the member is anything else. */
function unionMemberLiteral(member: TypeInfo): string | null {
  const m = /^'([^'\\]*)'$|^"([^"\\]*)"$/.exec(member.raw.trim())
  return m ? (m[1] ?? m[2]) : null
}

/**
 * Resolve a NON-literal `locale` argument to its closed set of string-literal
 * union members (#2324's union-typed-locale stage), or null to decline.
 * Admitted shapes: a bare identifier bound to a prop, or a
 * `props.<name>` member — both checkable for optionality against
 * `propsType.properties`, which matters because an OPTIONAL union prop can be
 * `undefined` at runtime, and real `toLocaleDateString(undefined, …)` falls
 * back to the HOST locale (the implicit-environment read this plugin exists
 * to rule out) while the lowered pattern table cannot. The prop must be
 * required and every union member a quoted string literal.
 */
function resolveLocaleUnionMembers(locale: ParsedExpr, metadata: IRMetadata): string[] | null {
  let propName: string | null = null
  if (locale.kind === 'identifier') {
    propName = locale.name
  } else if (
    locale.kind === 'member' &&
    !locale.computed &&
    locale.object.kind === 'identifier' &&
    locale.object.name === (metadata.propsObjectName ?? 'props')
  ) {
    propName = locale.property
  }
  if (!propName) return null
  const target = propName
  const prop = metadata.propsType?.properties?.find(
    (p) => p.name === target || metadata.propsParams?.some((pp) => pp.name === target && (pp.sourceName ?? pp.name) === p.name),
  )
  if (!prop || prop.optional) return null
  const type = prop.type
  if (type.kind !== 'union' || !type.unionTypes || type.unionTypes.length === 0) return null
  const members: string[] = []
  for (const member of type.unionTypes) {
    const value = unionMemberLiteral(member)
    if (value === null) return null
    members.push(value)
  }
  return members
}

const strLit = (value: string): ParsedExpr => ({ kind: 'literal', value, literalType: 'string' })

export function matchToLocaleDateStringCall(
  callee: ParsedExpr,
  args: readonly ParsedExpr[],
  metadata: IRMetadata,
): LoweringNode | null {
  if (callee.kind !== 'member' || callee.computed) return null
  if (callee.property !== 'toLocaleDateString' || args.length !== 2) return null
  const [locale, options] = args
  if (options.kind !== 'object-literal' || options.properties.length !== 1) return null
  const prop = options.properties[0]
  if (prop.key !== 'timeZone') return null
  if (prop.value.kind !== 'literal' || prop.value.literalType !== 'string') return null
  const tz = String(prop.value.value)
  if (!TO_LOCALE_TZ_RE.test(tz)) return null

  const receiverType = resolveReceiverType(callee.object, metadata, new Map())
  if (!receiverType || receiverType.kind !== 'interface') return null
  const typeName = baseTypeName(receiverType.raw)
  if (typeName !== 'Date') return null
  if (metadata.typeDefinitions.some((d) => d.name === typeName)) return null

  // Literal locale: resolve one pattern at build time.
  if (locale.kind === 'literal' && locale.literalType === 'string') {
    const pattern = resolveLocaleDatePattern(String(locale.value))
    if (pattern === null) return null
    return {
      kind: 'helper-call',
      helper: 'format_date',
      args: [callee.object, strLit(pattern), strLit(tz)],
    }
  }

  // Union-typed locale (#2324's union stage): a REQUIRED prop typed as a
  // closed string-literal union resolves every member's pattern at build
  // time and lowers the pattern argument to a right-folded ternary over the
  // runtime locale value — runtime locale switching with zero runtime CLDR.
  // (A TS-typed value can't leave the union, so the final alternate needs no
  // guard; equal patterns collapse the ternary away entirely.)
  const members = resolveLocaleUnionMembers(locale, metadata)
  if (!members) return null
  const patterns: string[] = []
  for (const member of members) {
    const pattern = resolveLocaleDatePattern(member)
    if (pattern === null) return null
    patterns.push(pattern)
  }
  let patternExpr: ParsedExpr = strLit(patterns[patterns.length - 1])
  if (new Set(patterns).size > 1) {
    for (let i = patterns.length - 2; i >= 0; i--) {
      patternExpr = {
        kind: 'conditional',
        test: { kind: 'binary', op: '===', left: locale, right: strLit(members[i]) },
        consequent: strLit(patterns[i]),
        alternate: patternExpr,
      }
    }
  }
  return {
    kind: 'helper-call',
    helper: 'format_date',
    args: [callee.object, patternExpr, strLit(tz)],
  }
}

/**
 * Render a matched node's PATTERN argument as client-JS text for the
 * #2292-style rewrite sites (`jsx-to-ir.ts` / `emit-reactive.ts`). A literal
 * pattern stringifies directly; the union stage's right-folded ternary
 * re-serializes against `localeText` — the rewrite site's own source text
 * for the locale argument, so downstream prop-prefix rewrites treat it like
 * any other reference. Returns null for any shape this module didn't build
 * (the caller then leaves the expression raw rather than guessing).
 */
export function patternArgToClientJs(patternArg: ParsedExpr, localeText: string): string | null {
  if (patternArg.kind === 'literal') return JSON.stringify(patternArg.value)
  if (patternArg.kind !== 'conditional') return null
  const t = patternArg.test
  if (t.kind !== 'binary' || t.op !== '===' || t.right.kind !== 'literal') return null
  if (patternArg.consequent.kind !== 'literal') return null
  const rest = patternArgToClientJs(patternArg.alternate, localeText)
  if (rest === null) return null
  return `${localeText} === ${JSON.stringify(t.right.value)} ? ${JSON.stringify(patternArg.consequent.value)} : ${rest}`
}

export const toLocaleDatePlugin: LoweringPlugin = {
  name: 'toLocaleDateString',
  prepare(metadata) {
    if (!metadata.propsType || !typeReachesDate(metadata.propsType, metadata, new Set())) return null
    return (callee, args) => matchToLocaleDateStringCall(callee, args, metadata)
  },
}
