/**
 * The JS primitive plan, held against every template adapter's emission
 * (#3824, `spec/js-primitive-semantics.md` "Conformance" item 5).
 *
 * `planPrimitive` decides, per primitive operation, whether a target spells
 * its native operator or calls the runtime helper; each adapter declares the
 * (op, proof) pairs it spells natively in its `NativeSafeTable`. This test
 * compiles one component per operation and position with each of the nine
 * template adapters, computes the plan of every variant against that
 * adapter's table, and reads back what the template spells: the plan's
 * helper (by the runtime's own name: Perl's `subtract`, PHP's `index`, Go's
 * `bf_eq`, …) or no helper of the operation at all (native).
 *
 * Step 0 fills each table to describe today's output, but some positions
 * still decide on their own (the "M" cells of the note's status table). Each
 * such disagreement is listed in `DISAGREEMENTS` with the rollout step that
 * removes it. The list only shrinks: a listed case that agrees fails the test
 * until its entry is deleted, and a new disagreement (a local special case in
 * one emitter class or position) fails until it is fixed.
 */
import { describe, test, expect } from 'bun:test'
import {
  analyzeComponent,
  BindingScope,
  buildMetadata,
  collectOperandTyping,
  parseExpression,
  planPrimitive,
  type NativeSafeTable,
  type PrimitiveHelper,
  type PrimitiveOp,
  type PrimitivePlan,
  type TemplateAdapter,
} from '@barefootjs/jsx'
import { GoTemplateAdapter, NATIVE_SAFE as GO } from '@barefootjs/go-template/adapter'
import { BladeAdapter, NATIVE_SAFE as BLADE } from '@barefootjs/blade/adapter'
import { ErbAdapter, NATIVE_SAFE as ERB } from '@barefootjs/erb/adapter'
import { JinjaAdapter, NATIVE_SAFE as JINJA } from '@barefootjs/jinja/adapter'
import { MojoAdapter, NATIVE_SAFE as MOJO } from '@barefootjs/mojolicious/adapter'
import { PebbleAdapter, NATIVE_SAFE as PEBBLE } from '@barefootjs/pebble/adapter'
import { MinijinjaAdapter, NATIVE_SAFE as MINIJINJA } from '@barefootjs/rust/adapter'
import { TwigAdapter, NATIVE_SAFE as TWIG } from '@barefootjs/twig/adapter'
import { XslateAdapter, NATIVE_SAFE as XSLATE } from '@barefootjs/xslate/adapter'
import { compileFixtureJSX } from '../harness-program'

interface Target {
  name: string
  make: () => TemplateAdapter
  table: NativeSafeTable
  /** The pattern of a call of `helper` in this adapter's template; null when its runtime has none. */
  call: (helper: PrimitiveHelper) => RegExp | null
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** A DSL helper call `<prefix><name>(`, by the runtime's own names for the helper. */
function dslCall(prefix: string, names: Partial<Record<PrimitiveHelper, readonly string[]>> = {}) {
  return (helper: PrimitiveHelper) => {
    const spelled = names[helper] ?? [helper]
    return new RegExp(`(?<![\\w$])${escapeRe(prefix)}(?:${spelled.map(escapeRe).join('|')})\\(`)
  }
}

// A value-position `&&` / `||` tests its left operand inside the box that
// keeps it (`keep_truthy` / `keep_falsy`), so those count as the truthy helper.
const TRUTHY_NAMES = ['truthy', 'keep_truthy', 'keep_falsy']
const GO_NAMES: Partial<Record<PrimitiveHelper, readonly string[]>> = {
  strict_eq: ['eq', 'ne'],
  coalesce: ['nullish'],
  truthy: TRUTHY_NAMES,
}
const PERL_NAMES = { sub: ['subtract'], mul: ['multiply'], div: ['divide'], truthy: TRUTHY_NAMES }
const PHP_NAMES = { get: ['index'], strict_eq: ['eq', 'neq'], truthy: TRUTHY_NAMES }

const TARGETS: readonly Target[] = [
  {
    name: 'go',
    make: () => new GoTemplateAdapter(),
    table: GO,
    call: (helper) => new RegExp(`\\bbf_(?:${(GO_NAMES[helper] ?? [helper]).join('|')})\\b`),
  },
  { name: 'blade', make: () => new BladeAdapter(), table: BLADE, call: dslCall('$bf->', PHP_NAMES) },
  { name: 'erb', make: () => new ErbAdapter(), table: ERB, call: dslCall('bf.', { truthy: ['truthy?', 'keep_truthy', 'keep_falsy'] }) },
  { name: 'jinja', make: () => new JinjaAdapter(), table: JINJA, call: dslCall('bf.', { truthy: TRUTHY_NAMES }) },
  { name: 'mojolicious', make: () => new MojoAdapter(), table: MOJO, call: dslCall('bf->', PERL_NAMES) },
  {
    name: 'pebble',
    make: () => new PebbleAdapter(),
    table: PEBBLE,
    // Pebble's own `and` / `or` yield booleans; `||` / `&&` are the runtime's
    // JsLogicalExtension operators, which test by JS truthiness.
    call: (helper) =>
      helper === 'truthy' ? /(?<![\w$])bf\.truthy\(|\|\||&&/ : dslCall('bf.', { strict_eq: ['eq', 'neq'] })(helper),
  },
  { name: 'rust', make: () => new MinijinjaAdapter(), table: MINIJINJA, call: dslCall('bf.', { truthy: TRUTHY_NAMES }) },
  {
    name: 'twig',
    make: () => new TwigAdapter(),
    table: TWIG,
    // Twig's value-position `&&` / `||` test through the `bf_js_or` /
    // `bf_js_and` filters (`Barefoot\BarefootExtension`), not a `bf.` method.
    call: (helper) =>
      helper === 'truthy' ? /(?<![\w$])bf\.truthy\(|\|bf_js_(?:or|and)\(/ : dslCall('bf.', PHP_NAMES)(helper),
  },
  { name: 'xslate', make: () => new XslateAdapter(), table: XSLATE, call: dslCall('$bf.', PERL_NAMES) },
]

/** Every helper an operation can name: a native plan must spell none of them. */
const OP_HELPERS: Readonly<Record<PrimitiveOp, readonly PrimitiveHelper[]>> = {
  'to-boolean': ['truthy'],
  'to-number': ['sub', 'mul', 'div', 'mod', 'to_number'],
  'to-string': [],
  'boolean-value': [],
  get: ['get'],
  'strict-eq': ['strict_eq'],
  relational: ['lt', 'le', 'gt', 'ge'],
  plus: ['add', 'plus'],
  neg: ['neg'],
  'number-literal': ['number'],
  nullish: ['coalesce'],
}

/** Where a variant sits: the scope its plan is read in. */
type Scope = 'component' | 'filter' | 'loop'

interface Variant {
  label: string
  /** The JSX of the variant's element, with `@` where its marker goes. */
  jsx: string
  /** The expression whose root is the planned node. */
  node: string
  scope: Scope
}

type Position = (operand: string, label: string) => Variant

const text: Position = (e, label) => ({ label, jsx: `<p>@{${e}}</p>`, node: e, scope: 'component' })
const attr: Position = (e, label) => ({ label, jsx: `<p>@<i data-v={${e}} /></p>`, node: e, scope: 'component' })
const ifTest: Position = (e, label) => ({ label, jsx: `<p>@{${e} ? <b>y</b> : <i>n</i>}</p>`, node: e, scope: 'component' })
/** A `.filter()` predicate over `x`, lowered inline in the loop. */
const filter = (predicate: string, node: string, label: string): Variant => ({
  label,
  jsx: `<ul>@{props.rows.filter(x => ${predicate}).map(x => <li key={x}>{x}</li>)}</ul>`,
  node,
  scope: 'filter',
})

interface Case {
  id: string
  positions: Record<string, readonly Variant[]>
}

/** The same operands at several positions. */
function at(positions: Record<string, Position>, operands: Record<string, string>): Record<string, Variant[]> {
  return Object.fromEntries(
    Object.entries(positions).map(([name, pos]) => [name, Object.entries(operands).map(([label, e]) => pos(e, label))]),
  )
}

// A test operand T at the five test positions: `!T`, `T ? a : b`, `T && y`,
// `T || n` and an `{T ? <b/> : <i/>}` condition.
const TESTS = { boolean: 'props.on', comparison: 'props.n < props.m', string: 'props.s', optional: 'props.maybe' }
const testPositions = (positions: Record<string, (t: string) => { jsx: string; node: string }>) =>
  Object.fromEntries(
    Object.entries(positions).map(([name, pos]) => [
      name,
      Object.entries(TESTS).map(([label, t]) => ({ label, ...pos(t), scope: 'component' as const })),
    ]),
  )

const CASES: readonly Case[] = [
  {
    id: 'to-boolean',
    positions: {
      ...testPositions({
        not: (t) => ({ jsx: `<p>@{!${t}}</p>`, node: `!${t}` }),
        ternary: (t) => ({ jsx: `<p>@<i data-v={${t} ? 'a' : 'b'} /></p>`, node: `${t} ? 'a' : 'b'` }),
        and: (t) => ({ jsx: `<p>@<i data-v={${t} && 'y'} /></p>`, node: `${t} && 'y'` }),
        or: (t) => ({ jsx: `<p>@{${t} || 'n'}</p>`, node: `${t} || 'n'` }),
        if: (t) => ({ jsx: `<p>@{${t} ? <b>y</b> : <i>n</i>}</p>`, node: `${t} ? 1 : 2` }),
      }),
      filter: [filter('!props.on', '!props.on', 'boolean'), filter('!props.s', '!props.s', 'string'), filter('!x', '!x', 'row')],
    },
  },
  {
    id: 'relational',
    positions: {
      ...at(
        { text, attr, if: ifTest },
        { 'number-pair': 'props.n < props.m', signal: 'count() >= props.n', strings: 'props.s > props.t', optional: 'props.n <= props.maybe' },
      ),
      filter: [filter('x < props.n', 'x < props.n', 'row'), filter('props.n < props.m', 'props.n < props.m', 'number-pair')],
    },
  },
  {
    id: 'strict-eq',
    positions: {
      ...at(
        { text, attr, if: ifTest },
        {
          'number-pair': 'props.n === props.m',
          'string-pair': 'props.s !== props.t',
          'boolean-pair': 'props.on === true',
          optional: 'props.maybe === 1',
          'optional-string': "props.ms !== 'a'",
          'different-types': 'props.n === props.s',
        },
      ),
      filter: [filter('x === props.n', 'x === props.n', 'row'), filter("props.s === 'a'", "props.s === 'a'", 'string-pair')],
    },
  },
  {
    id: 'plus',
    positions: {
      ...at(
        { text, attr },
        { 'number-pair': 'props.n + props.m', 'string-pair': 'props.s + props.t', 'number-string': "props.n + 'px'", optional: 'props.maybe + props.n' },
      ),
      filter: [filter('x + props.n > 0', 'x + props.n', 'row'), filter('props.n + props.m > 0', 'props.n + props.m', 'number-pair')],
    },
  },
  {
    id: 'to-number',
    positions: {
      ...at(
        { text, attr },
        {
          sub: 'props.n - props.m',
          mul: 'props.n * props.m',
          'optional-sub': 'props.maybe - props.n',
          div: 'props.n / props.m',
          mod: 'props.n % props.m',
          'unary-plus': '+props.s',
        },
      ),
      filter: [filter('x - props.n > 0', 'x - props.n', 'row'), filter('props.n * props.m > 0', 'props.n * props.m', 'number-pair')],
    },
  },
  {
    id: 'neg',
    positions: at({ text, attr }, { prop: '-props.n', signal: '-count()' }),
  },
  {
    id: 'number-literal',
    positions: {
      text: [
        { label: 'safe-integer', jsx: '<p>@{props.n + 1}</p>', node: '1', scope: 'component' },
        { label: 'fraction', jsx: '<p>@{props.n + 1.5}</p>', node: '1.5', scope: 'component' },
        { label: 'large', jsx: '<p>@{props.n * 1e21}</p>', node: '1e21', scope: 'component' },
      ],
    },
  },
  {
    id: 'nullish',
    positions: at({ text, attr }, { 'non-nil': "props.s ?? 'x'", optional: 'props.maybe ?? 0', 'optional-string': "props.ms ?? 'none'" }),
  },
  {
    id: 'get',
    positions: {
      ...at(
        { text, attr, if: ifTest },
        {
          'index-access': 'props.rows[props.n]',
          'string-key': 'props.rows[props.s]',
          'negative-key': 'props.rows[-1]',
          'literal-key': 'props.rows[0]',
          'fraction-key': 'props.rows[1.1]',
          'non-identifier-key': "props.obj['a.b']",
          'identifier-key': "props.obj['id']",
        },
      ),
      filter: [
        filter('props.rows[x] > 0', 'props.rows[x]', 'row-key'),
        filter("props.obj['a.b'] === x", "props.obj['a.b']", 'literal-key'),
      ],
      loop: [
        {
          label: 'loop-index',
          jsx: '<ul>@{props.rows.map((r, i) => <li key={r}>{props.rows[i]}</li>)}</ul>',
          node: 'props.rows[i]',
          scope: 'loop',
        },
      ],
    },
  },
]

/**
 * The cases whose emission does not yet spell its plan, as
 * `<adapter> <case> <position> <variant>`, with the rollout step
 * (`spec/js-primitive-semantics.md`, "Rollout plan") that makes it agree.
 * Shrink-only.
 */
const DISAGREEMENTS: Readonly<Record<string, string>> = {
  // ToNumber. Go and Perl drop a unary `+` instead of converting.
  'go to-number text unary-plus': 'step 3 (ToNumber)',
  'mojolicious to-number text unary-plus': 'step 3 (ToNumber)',
  'xslate to-number text unary-plus': 'step 3 (ToNumber)',
  'go to-number attr unary-plus': 'step 3 (ToNumber)',
  'mojolicious to-number attr unary-plus': 'step 3 (ToNumber)',
  'xslate to-number attr unary-plus': 'step 3 (ToNumber)',
  // `+` over an operand Phase 1 cannot type: numeric addition (`add`), not `plus`.
  'go plus text optional': 'step 4 (`+`)',
  'mojolicious plus text optional': 'step 4 (`+`)',
  'xslate plus text optional': 'step 4 (`+`)',
  'go plus attr optional': 'step 4 (`+`)',
  'mojolicious plus attr optional': 'step 4 (`+`)',
  'xslate plus attr optional': 'step 4 (`+`)',
  'go plus filter row': 'step 4 (`+`)',
  'mojolicious plus filter row': 'step 4 (`+`)',
  'xslate plus filter row': 'step 4 (`+`)',
  // `??` on Go: `bf_nullish` for a nillable prop, `or` otherwise.
  'go nullish text optional-string': 'step 7 (nullish on Go)',
  'go nullish attr optional-string': 'step 7 (nullish on Go)',
  // `===`. Operands proven of different types are not folded to a constant;
  // Mojolicious spells `==` / `ne` for an operand it cannot type.
  'go strict-eq text different-types': 'step 8 (`===`)',
  'blade strict-eq text different-types': 'step 8 (`===`)',
  'erb strict-eq text different-types': 'step 8 (`===`)',
  'jinja strict-eq text different-types': 'step 8 (`===`)',
  'mojolicious strict-eq text optional': 'step 8 (`===`)',
  'mojolicious strict-eq text optional-string': 'step 8 (`===`)',
  'mojolicious strict-eq text different-types': 'step 8 (`===`)',
  'pebble strict-eq text different-types': 'step 8 (`===`)',
  'rust strict-eq text different-types': 'step 8 (`===`)',
  'twig strict-eq text different-types': 'step 8 (`===`)',
  'xslate strict-eq text different-types': 'step 8 (`===`)',
  'go strict-eq attr different-types': 'step 8 (`===`)',
  'blade strict-eq attr different-types': 'step 8 (`===`)',
  'erb strict-eq attr different-types': 'step 8 (`===`)',
  'jinja strict-eq attr different-types': 'step 8 (`===`)',
  'mojolicious strict-eq attr optional': 'step 8 (`===`)',
  'mojolicious strict-eq attr optional-string': 'step 8 (`===`)',
  'mojolicious strict-eq attr different-types': 'step 8 (`===`)',
  'pebble strict-eq attr different-types': 'step 8 (`===`)',
  'rust strict-eq attr different-types': 'step 8 (`===`)',
  'twig strict-eq attr different-types': 'step 8 (`===`)',
  'xslate strict-eq attr different-types': 'step 8 (`===`)',
  'go strict-eq if different-types': 'step 8 (`===`)',
  'blade strict-eq if different-types': 'step 8 (`===`)',
  'erb strict-eq if different-types': 'step 8 (`===`)',
  'jinja strict-eq if different-types': 'step 8 (`===`)',
  'mojolicious strict-eq if optional': 'step 8 (`===`)',
  'mojolicious strict-eq if optional-string': 'step 8 (`===`)',
  'mojolicious strict-eq if different-types': 'step 8 (`===`)',
  'pebble strict-eq if different-types': 'step 8 (`===`)',
  'rust strict-eq if different-types': 'step 8 (`===`)',
  'twig strict-eq if different-types': 'step 8 (`===`)',
  'xslate strict-eq if different-types': 'step 8 (`===`)',
  'mojolicious strict-eq filter row': 'step 8 (`===`)',
}

const PROPS =
  '{ n: number; m: number; s: string; t: string; on: boolean; maybe?: number; ms?: string; items: string[]; rows: number[]; obj: Record<string, number> }'

function source(variants: readonly Variant[]): string {
  const body = variants.map((v, i) => v.jsx.replace('@', `QV${i}Q`)).join('')
  return `
'use client'
import { createSignal } from '@barefootjs/client'
export function Primitives(props: ${PROPS}) {
  const [count] = createSignal(0)
  return <div>${body}</div>
}
`
}

/** Each variant's slice of `template`, between its marker and the next. */
function segments(template: string, count: number): string[] {
  return Array.from({ length: count }, (_, i) => {
    const start = template.indexOf(`QV${i}Q`)
    const end = i + 1 < count ? template.indexOf(`QV${i + 1}Q`) : template.length
    if (start < 0 || end < 0) throw new Error(`marker QV${i}Q missing from the template`)
    return template.slice(start, end)
  })
}

type Outcome = 'native' | 'helper' | 'const'

function expected(plan: PrimitivePlan | null): Outcome {
  if (plan === null) throw new Error('variant node is not a primitive operation')
  if (plan.mode === 'refuse') throw new Error('no variant is refused in step 0')
  return plan.mode
}

function observed(segment: string, plan: PrimitivePlan, target: Target): Outcome {
  const helpers: readonly PrimitiveHelper[] = plan.mode === 'helper' ? [plan.helper] : OP_HELPERS[plan.op]
  return helpers.some((h) => target.call(h)?.test(segment)) ? 'helper' : 'native'
}

function scopeFor(kind: Scope, propsObjectName: string | null): BindingScope {
  const component = BindingScope.forComponent(propsObjectName)
  if (kind === 'filter') return component.enterCallback(['x'])
  if (kind === 'loop') return component.enterLoopRow({ param: 'r', index: 'i' })
  return component
}

function compile(src: string, target: Target): string {
  const result = compileFixtureJSX(src, 'primitives.tsx', { adapter: target.make() })
  const errors = result.errors.filter((e) => e.severity === 'error').map((e) => `${e.code} ${e.message}`)
  expect({ adapter: target.name, errors }).toEqual({ adapter: target.name, errors: [] })
  return result.files.filter((f) => f.type === 'markedTemplate').map((f) => f.content).join('\n')
}

// Nine compiles per position.
const COMPILE_TIMEOUT_MS = 120_000

const seen = new Map<string, boolean>()

describe('every template adapter spells the primitive plan its NativeSafeTable names (#3824)', () => {
  for (const { id, positions } of CASES) {
    for (const [position, variants] of Object.entries(positions)) {
      test(`${id} at ${position}`, () => {
        const src = source(variants)
        const metadata = buildMetadata(analyzeComponent(src, 'primitives.tsx'))
        const typing = collectOperandTyping(metadata)
        const unexpected: string[] = []
        for (const target of TARGETS) {
          const parts = segments(compile(src, target), variants.length)
          variants.forEach((v, i) => {
            const plan = planPrimitive(parseExpression(v.node), typing.at(scopeFor(v.scope, metadata.propsObjectName)), target.table)
            const want = expected(plan)
            const got = observed(parts[i]!, plan!, target)
            const key = `${target.name} ${id} ${position} ${v.label}`
            const listed = key in DISAGREEMENTS
            seen.set(key, want !== got)
            if ((want !== got) !== listed) unexpected.push(`${key}: plan ${want}, template ${got}${listed ? ' (listed)' : ''}`)
          })
        }
        expect(unexpected).toEqual([])
      }, COMPILE_TIMEOUT_MS)
    }
  }

  test('every listed disagreement names a case this test compiles', () => {
    expect(Object.keys(DISAGREEMENTS).filter((key) => !seen.has(key))).toEqual([])
  })
})
