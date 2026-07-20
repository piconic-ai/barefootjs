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
 *   - an options bag the probe cannot reproduce EXACTLY in the token+table
 *     vocabulary — era, dayPeriod, 2-digit year, narrow name forms,
 *     non-literal option values ("faithful or loud", never approximate);
 *   - a locale/options combination needing non-latin digits or a
 *     non-gregorian calendar (e.g. `ar-SA`: islamic-umalqura, arabic-indic
 *     digits).
 *
 * Options beyond `timeZone` ARE admitted when literal (#2334): the compiler
 * probes the exact bag with `formatToParts`; month/weekday NAME parts
 * resolve to the `MMMM`/`MMM`/`dddd`/`ddd` tokens plus the 38-slot name
 * table shipped as an ordinary array argument — the backend receives
 * values, never locale knowledge.
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

/**
 * The 38-slot `names` table layout (spec/template-helpers.md "format_date"):
 * [0..11] wide months, [12..23] abbreviated months, [24..30] wide weekdays
 * (Sunday-first), [31..37] abbreviated weekdays.
 */
export interface LocaleDateFormat {
  pattern: string
  /** The 38-slot table, present iff `pattern` contains a name token. */
  names: string[] | null
}

/** Build-time caches: locale tag (+ options key) → derived result (null = not representable). */
const formatCache = new Map<string, LocaleDateFormat | null>()
const namesCache = new Map<string, string[] | null>()

/**
 * Name-derivation context (Copilot review on #2336): many locales inflect
 * month (and sometimes weekday) names by DATE CONTEXT — Russian renders
 * `{month:'long'}` alone as nominative `март` but `dateStyle:'long'` as
 * genitive `марта`. So each section of the table is derived under BOTH a
 * `formatting` probe (name alongside a day — the form full date styles
 * use) and a `standalone` probe (name alone), and `deriveFormat` ships
 * whichever table the probed output actually matches.
 */
type NameContext = 'formatting' | 'standalone'

/**
 * Derive a locale's 24 month names (12 wide + 12 abbreviated) under one
 * {@link NameContext}, or null when any probe fails. The compiler is the
 * only owner of locale data; backends receive the values as an ordinary
 * array argument and stay type-only (#2334).
 */
function deriveMonthNames(locale: string, ctx: NameContext): string[] | null {
  return deriveNamesCached(`${locale}|m|${ctx}`, () => {
    const months = (width: 'long' | 'short') =>
      Array.from({ length: 12 }, (_, m) =>
        probePart(
          locale,
          ctx === 'formatting' ? { month: width, day: 'numeric' } : { month: width },
          Date.UTC(2001, m, 15),
          'month',
        ),
      )
    return [...months('long'), ...months('short')]
  })
}

/**
 * Derive a locale's 14 weekday names (7 wide + 7 abbreviated,
 * Sunday-first — matching `Date.prototype.getUTCDay`) under one context.
 */
function deriveWeekdayNames(locale: string, ctx: NameContext): string[] | null {
  return deriveNamesCached(`${locale}|w|${ctx}`, () => {
    // 2023-01-01 was a Sunday; day offsets walk Sunday..Saturday.
    const weekdays = (width: 'long' | 'short') =>
      Array.from({ length: 7 }, (_, d) =>
        probePart(
          locale,
          ctx === 'formatting' ? { weekday: width, month: 'numeric', day: 'numeric' } : { weekday: width },
          Date.UTC(2023, 0, 1 + d),
          'weekday',
        ),
      )
    return [...weekdays('long'), ...weekdays('short')]
  })
}

function probePart(
  locale: string,
  options: Intl.DateTimeFormatOptions,
  utc: number,
  type: string,
): string {
  const parts = new Intl.DateTimeFormat(locale, { ...options, timeZone: 'UTC' }).formatToParts(new Date(utc))
  const found = parts.find((p) => p.type === type)
  if (!found || !found.value) throw new Error('missing part')
  return found.value
}

function deriveNamesCached(key: string, derive: () => string[]): string[] | null {
  const cached = namesCache.get(key)
  if (cached !== undefined) return cached
  let derived: string[] | null
  try {
    derived = derive()
  } catch {
    derived = null
  }
  namesCache.set(key, derived)
  return derived
}

/**
 * Back-compat convenience over {@link resolveLocaleDateFormat}: the
 * default-options pattern (numeric-only or it doesn't resolve — the default
 * date format of every locale is name-free, so `names` is always null here).
 */
export function resolveLocaleDatePattern(locale: string): string | null {
  return resolveLocaleDateFormat(locale, {})?.pattern ?? null
}

/**
 * Resolve (locale, probe options) to a `format_date` pattern — and, when the
 * probed format contains month/weekday NAMES, the 38-slot table those tokens
 * read (#2334). The fidelity contract: the result is exactly what the user's
 * `toLocaleDateString(locale, options)` evaluates to under the build
 * machine's ECMA-402 — reproduce it exactly or decline (null), never
 * approximate. The gate is structural, not an allowlist: gregorian calendar,
 * latin digits, and every part must be a numeric 4-digit year / numeric or
 * named month / numeric day / named weekday / non-colliding literal.
 * `en-US` default → `M/D/YYYY`; `en-US` + `{dateStyle:'long'}` → `MMMM D,
 * YYYY` + names; `ja-JP` + `{dateStyle:'long'}` → `YYYY年M月D日` (numeric —
 * no names needed, which the probe discovers naturally); era / dayPeriod /
 * 2-digit-year / non-latn digits → null.
 */
export function resolveLocaleDateFormat(
  locale: string,
  probeOptions: Record<string, string>,
): LocaleDateFormat | null {
  const key = `${locale}|${JSON.stringify(probeOptions, Object.keys(probeOptions).sort())}`
  const cached = formatCache.get(key)
  if (cached !== undefined) return cached
  const derived = deriveFormat(locale, probeOptions)
  formatCache.set(key, derived)
  return derived
}

/**
 * Second verification instant: 2001-05-13 UTC — a SUNDAY in MAY, so both
 * the month and weekday indexes differ from {@link PROBE_UTC}'s. The
 * chosen name tables are re-verified against the real ICU output at this
 * instant, closing the coincidental-match hole: a table whose form only
 * happens to agree with the probed format AT the probe month/weekday (but
 * diverges elsewhere) would otherwise ship a silently-wrong name — the
 * one failure class the fidelity rule ("reproduce exactly or decline")
 * cannot tolerate (Copilot review on #2336).
 */
const VERIFY_UTC = new Date(Date.UTC(2001, 4, 13))

/** Render `pattern` + `names` at a fixed calendar point — the compiler-side
 *  mirror of the runtime token scan, used only for the VERIFY_UTC check. */
function renderPatternAt(
  pattern: string,
  names: readonly string[],
  y: number,
  m: number,
  d: number,
  wd: number,
): string {
  const pad2 = (n: number) => String(n).padStart(2, '0')
  return pattern.replace(/YYYY|MMMM|MMM|MM|DD|dddd|ddd|M|D/g, (token) => {
    switch (token) {
      case 'YYYY':
        return String(y).padStart(4, '0')
      case 'MMMM':
        return names[m - 1] ?? ''
      case 'MMM':
        return names[12 + m - 1] ?? ''
      case 'MM':
        return pad2(m)
      case 'M':
        return String(m)
      case 'DD':
        return pad2(d)
      case 'D':
        return String(d)
      case 'dddd':
        return names[24 + wd] ?? ''
      default:
        return names[31 + wd] ?? ''
    }
  })
}

function deriveFormat(locale: string, probeOptions: Record<string, string>): LocaleDateFormat | null {
  let dtf: Intl.DateTimeFormat
  let parts: Intl.DateTimeFormatPart[]
  try {
    dtf = new Intl.DateTimeFormat(locale, {
      ...(probeOptions as Intl.DateTimeFormatOptions),
      timeZone: 'UTC',
    })
    const resolved = dtf.resolvedOptions()
    if (resolved.calendar !== 'gregory' || resolved.numberingSystem !== 'latn') return null
    parts = dtf.formatToParts(PROBE_UTC)
  } catch {
    return null // invalid language tag or invalid/conflicting options
  }
  // Probe instant 2001-02-03 is a Saturday in February: month index 1,
  // weekday index 6 in the Sunday-first table. Each name part is matched
  // against BOTH derivation contexts (formatting first — full date styles
  // use the in-context form) so context-inflecting locales (ru: `марта`
  // vs `март`) resolve to the table whose form the format actually uses.
  const monthTables: Array<string[] | null> = [
    deriveMonthNames(locale, 'formatting'),
    deriveMonthNames(locale, 'standalone'),
  ]
  const weekdayTables: Array<string[] | null> = [
    deriveWeekdayNames(locale, 'formatting'),
    deriveWeekdayNames(locale, 'standalone'),
  ]
  let monthTable: string[] | null = null
  let weekdayTable: string[] | null = null
  let pattern = ''
  let usesNames = false
  for (const part of parts) {
    switch (part.type) {
      case 'year':
        if (part.value !== '2001') return null // 2-digit-year form has no token
        pattern += 'YYYY'
        break
      case 'month': {
        if (part.value === '2') {
          pattern += 'M'
          break
        }
        if (part.value === '02') {
          pattern += 'MM'
          break
        }
        const wide = monthTables.find((t) => t && part.value === t[1]) ?? null
        const abbr = wide ? null : (monthTables.find((t) => t && part.value === t[12 + 1]) ?? null)
        if (wide) pattern += 'MMMM'
        else if (abbr) pattern += 'MMM'
        else return null // narrow / unmatched month form
        monthTable = wide ?? abbr
        usesNames = true
        break
      }
      case 'day':
        if (part.value === '3') pattern += 'D'
        else if (part.value === '03') pattern += 'DD'
        else return null
        break
      case 'weekday': {
        const wide = weekdayTables.find((t) => t && part.value === t[6]) ?? null
        const abbr = wide ? null : (weekdayTables.find((t) => t && part.value === t[7 + 6]) ?? null)
        if (wide) pattern += 'dddd'
        else if (abbr) pattern += 'ddd'
        else return null // narrow / unmatched weekday form
        weekdayTable = wide ?? abbr
        usesNames = true
        break
      }
      case 'literal':
        // A literal colliding with the token alphabet would be re-tokenized
        // by the helper's scan: any uppercase Y/M/D, or a lowercase run of
        // three-plus `d`s (single/double `d` is not a token).
        if (/[YMD]/.test(part.value) || /ddd/.test(part.value)) return null
        pattern += part.value
        break
      default:
        return null // era, dayPeriod, … — not representable
    }
  }
  // The probed format must actually be a date (guards a pathological
  // options bag that yields, say, only a weekday).
  if (!/YYYY|MMMM|MMM|MM|M/.test(pattern) && !/DD|D/.test(pattern)) return null
  if (!usesNames) return { pattern, names: null }
  // Compose the shipped 38-slot table from whichever context matched each
  // section (unused sections default to the formatting context).
  const names = [
    ...(monthTable ?? monthTables[0] ?? monthTables[1] ?? Array<string>(24).fill('')),
    ...(weekdayTable ?? weekdayTables[0] ?? weekdayTables[1] ?? Array<string>(14).fill('')),
  ]
  // Two-point verification: reproduce the SECOND instant (Sunday, May 13)
  // with the frozen pattern + table and byte-compare against real ICU. A
  // probe-index coincidence between contexts cannot survive both points.
  if (renderPatternAt(pattern, names, 2001, 5, 13, 0) !== dtf.format(VERIFY_UTC)) return null
  return { pattern, names }
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
 * Prop-rooting follows `resolveReceiverType`'s rules exactly, per props
 * mode (Copilot review on #2331 — the looser first cut could mis-identify a
 * same-named LOCAL binding as the prop):
 *   - object-props mode (`propsObjectName` set): ONLY a
 *     `<propsObjectName>.<name>` member — a bare identifier is never a prop
 *     there;
 *   - destructured mode: ONLY a bare identifier that is one of
 *     `propsParams` (resolved through `sourceName` for aliased bindings) —
 *     there is no props object to member-access.
 * The prop must be REQUIRED (an optional union can be `undefined` at
 * runtime, and real `toLocaleDateString(undefined, …)` falls back to the
 * HOST locale — the implicit-environment read this plugin exists to rule
 * out) and every union member a quoted string literal.
 */
function resolveLocaleUnionMembers(locale: ParsedExpr, metadata: IRMetadata): string[] | null {
  let sourcePropName: string | null = null
  if (metadata.propsObjectName) {
    if (
      locale.kind === 'member' &&
      !locale.computed &&
      locale.object.kind === 'identifier' &&
      locale.object.name === metadata.propsObjectName
    ) {
      sourcePropName = locale.property
    }
  } else if (locale.kind === 'identifier') {
    const name = locale.name
    const param = metadata.propsParams?.find((pp) => pp.name === name)
    if (param) sourcePropName = param.sourceName ?? param.name
  }
  if (!sourcePropName) return null
  const target = sourcePropName
  const prop = metadata.propsType?.properties?.find((p) => p.name === target)
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

/** Array-literal ParsedExpr over string values (the `names` helper argument). */
function strArr(values: readonly string[]): ParsedExpr {
  return {
    kind: 'array-literal',
    elements: values.map((v) => strLit(v)),
    raw: JSON.stringify(values),
  } as ParsedExpr
}

/**
 * Fold per-union-member values into a right-folded ternary over the runtime
 * locale expression (last member needs no guard — the TS type keeps the
 * value inside the union). Equal values collapse to the plain leaf.
 */
function foldMembers(
  locale: ParsedExpr,
  members: readonly string[],
  leaves: readonly ParsedExpr[],
  allEqual: boolean,
): ParsedExpr {
  let expr = leaves[leaves.length - 1]
  if (allEqual) return expr
  for (let i = leaves.length - 2; i >= 0; i--) {
    expr = {
      kind: 'conditional',
      test: { kind: 'binary', op: '===', left: locale, right: strLit(members[i]) },
      consequent: leaves[i],
      alternate: expr,
    }
  }
  return expr
}

export function matchToLocaleDateStringCall(
  callee: ParsedExpr,
  args: readonly ParsedExpr[],
  metadata: IRMetadata,
): LoweringNode | null {
  if (callee.kind !== 'member' || callee.computed) return null
  if (callee.property !== 'toLocaleDateString' || args.length !== 2) return null
  const [locale, options] = args
  // Options bag: `timeZone` is REQUIRED (a literal 'UTC' | valid ±HH:MM —
  // its omission would read the host timezone); every OTHER key rides into
  // the Intl probe as-is when its value is a string literal (#2334's
  // fidelity rule: admit any literal options bag the probe can reproduce
  // exactly, decline everything else — dateStyle, month/weekday forms, …).
  if (options.kind !== 'object-literal') return null
  let tz: string | null = null
  const probeOptions: Record<string, string> = {}
  for (const prop of options.properties) {
    if (prop.value.kind !== 'literal' || prop.value.literalType !== 'string') return null
    const value = String(prop.value.value)
    if (prop.key === 'timeZone') {
      if (!TO_LOCALE_TZ_RE.test(value)) return null
      tz = value
    } else {
      probeOptions[prop.key] = value
    }
  }
  if (tz === null) return null

  const receiverType = resolveReceiverType(callee.object, metadata, new Map())
  if (!receiverType || receiverType.kind !== 'interface') return null
  const typeName = baseTypeName(receiverType.raw)
  if (typeName !== 'Date') return null
  if (metadata.typeDefinitions.some((d) => d.name === typeName)) return null

  // Literal locale: resolve one pattern (+ name table when the probed
  // format contains month/weekday names) at build time.
  if (locale.kind === 'literal' && locale.literalType === 'string') {
    const format = resolveLocaleDateFormat(String(locale.value), probeOptions)
    if (format === null) return null
    return {
      kind: 'helper-call',
      helper: 'format_date',
      args: [callee.object, strLit(format.pattern), strLit(tz), strArr(format.names ?? [])],
    }
  }

  // Union-typed locale (#2324's union stage): a REQUIRED prop typed as a
  // closed string-literal union resolves every member's format at build
  // time; the pattern AND names arguments each lower to a right-folded
  // ternary over the runtime locale value — runtime locale switching with
  // zero runtime CLDR.
  const members = resolveLocaleUnionMembers(locale, metadata)
  if (!members) return null
  const formats: LocaleDateFormat[] = []
  for (const member of members) {
    const format = resolveLocaleDateFormat(member, probeOptions)
    if (format === null) return null
    formats.push(format)
  }
  const patterns = formats.map((f) => f.pattern)
  const nameTables = formats.map((f) => JSON.stringify(f.names ?? []))
  return {
    kind: 'helper-call',
    helper: 'format_date',
    args: [
      callee.object,
      foldMembers(locale, members, patterns.map(strLit), new Set(patterns).size === 1),
      strLit(tz),
      foldMembers(
        locale,
        members,
        formats.map((f) => strArr(f.names ?? [])),
        new Set(nameTables).size === 1,
      ),
    ],
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
  // The `names` argument's leaf (#2334): an array-literal of string literals.
  if (patternArg.kind === 'array-literal') {
    const values: string[] = []
    for (const el of patternArg.elements) {
      if (el.kind !== 'literal') return null
      values.push(String(el.value))
    }
    return JSON.stringify(values)
  }
  if (patternArg.kind !== 'conditional') return null
  const t = patternArg.test
  if (t.kind !== 'binary' || t.op !== '===' || t.right.kind !== 'literal') return null
  if (t.right.kind !== 'literal') return null
  const cons = patternArgToClientJs(patternArg.consequent, localeText)
  const rest = patternArgToClientJs(patternArg.alternate, localeText)
  if (cons === null || rest === null) return null
  if (patternArg.consequent.kind !== 'literal' && patternArg.consequent.kind !== 'array-literal') return null
  return `${localeText} === ${JSON.stringify(t.right.value)} ? ${cons} : ${rest}`
}

export const toLocaleDatePlugin: LoweringPlugin = {
  name: 'toLocaleDateString',
  prepare(metadata) {
    if (!metadata.propsType || !typeReachesDate(metadata.propsType, metadata, new Set())) return null
    return (callee, args) => matchToLocaleDateStringCall(callee, args, metadata)
  },
}
