/**
 * Arithmetic lowering, across the eight DSL adapters (#3474).
 *
 * Every DSL adapter lowers `+ - * / %` and unary minus through the decisions
 * `@barefootjs/jsx` makes once: `arithmeticOperandCoercion` (an operand whose
 * nil stands for `null` reads as `0`, one whose nil stands for `undefined`
 * reads as `NaN`), `arithmeticHelper` (`/` is the runtime's JS division,
 * `div`, and `%` its JS remainder, `mod`), and `groupBinaryOperand` /
 * `groupUnaryOperand` (a compound operand keeps its source grouping). The
 * adapter only spells each decision.
 *
 * The test compiles one component per operator with each adapter and reads
 * the decisions back out of the template, in source order: a `div` or `mod`
 * call for the division or remainder (the Perl runtime names `div`
 * `divide`), a `number` call for the `undefined` coercion, and the
 * adapter's spelling of the `null` coercion. Blade, Twig, Mojolicious and
 * Xslate spell that one as the operand itself, since PHP's and Perl's
 * operators already read nil as `0`, so it is compared on the other four.
 * Grouping is compared by compiling two sources that differ only in their
 * parentheses: every adapter must emit two different templates. A local
 * special case in one adapter's `binary` or `unary` breaks the agreement.
 */
import { describe, test, expect } from 'bun:test'
import { compileFixtureJSX } from '../harness-program'
import { DSL_ADAPTERS, helperCallsAt, type DslAdapterCase } from '../dsl-helper-calls'

/** How each adapter spells the `null` coercion; `null` where nil already reads as `0`. */
const NULL_AS_ZERO: Readonly<Record<string, RegExp | null>> = {
  blade: null,
  erb: / \|\| 0\)/g,
  jinja: / or 0\)/g,
  mojolicious: null,
  pebble: / is null \? 0 : /g,
  rust: / or 0\)/g,
  twig: null,
  xslate: null,
}

const HELPERS: ReadonlySet<string> = new Set(['div', 'mod', 'number'])

// Eight compiles per case.
const COMPILE_TIMEOUT_MS = 60_000

function source(body: string): string {
  return `
'use client'
import { createSignal } from '@barefootjs/client'
export function Arithmetic(props: { n: number; m: number; nothing: number | null; maybe?: number }) {
  const [nul] = createSignal<number | null>(null)
  const [und] = createSignal<number>()
  return <p>${body}</p>
}
`
}

function compile(src: string, adapter: DslAdapterCase): string {
  const result = compileFixtureJSX(src, 'arithmetic.tsx', { adapter: adapter.make() })
  const errors = result.errors.filter((e) => e.severity === 'error').map((e) => `${e.code} ${e.message}`)
  expect({ adapter: adapter.name, errors }).toEqual({ adapter: adapter.name, errors: [] })
  return result.files
    .filter((f) => f.type === 'markedTemplate')
    .map((f) => f.content)
    .join('\n')
}

/** The arithmetic decisions in `template`, in source order. */
function decisions(template: string, adapter: DslAdapterCase, withNull: boolean): string[] {
  const found: Array<[number, string]> = []
  for (const call of helperCallsAt(template, adapter, HELPERS)) found.push(call)
  const nullAsZero = NULL_AS_ZERO[adapter.name]
  if (withNull && nullAsZero) for (const m of template.matchAll(nullAsZero)) found.push([m.index!, 'zero'])
  return found.sort((a, b) => a[0] - b[0]).map(([, d]) => d)
}

// One operand of each kind the coercion decides on, in this order: a plain
// number prop, a signal seeded with `null`, a signal with no initial value,
// a `number | null` prop, and an optional number prop.
const OPERANDS = ['props.n', 'nul()', 'und()', 'props.nothing', 'props.maybe']

const BINARY_CASES: ReadonlyArray<{ op: string; expected: string[] }> = [
  // `+` coerces only when the other operand is a number literal.
  { op: '+', expected: ['zero', 'number/1', 'zero', 'number/1'] },
  { op: '-', expected: ['zero', 'number/1', 'zero', 'number/1'] },
  { op: '*', expected: ['zero', 'number/1', 'zero', 'number/1'] },
  ...['div', 'mod'].map((helper) => ({
    op: helper === 'div' ? '/' : '%',
    expected: [`${helper}/2`, `${helper}/2`, 'zero', `${helper}/2`, 'number/1', `${helper}/2`, 'zero', `${helper}/2`, 'number/1'],
  })),
]

describe('arithmetic lowers through the shared decisions alike on every DSL adapter (#3474)', () => {
  const cases = [
    ...BINARY_CASES.map(({ op, expected }) => ({
      label: `binary ${op}`,
      body: OPERANDS.map((operand) => `<span>{${operand} ${op} 2}</span>`).join(''),
      expected,
    })),
    {
      label: 'unary -',
      body: OPERANDS.map((operand) => `<span>{-${operand}}</span>`).join(''),
      expected: ['zero', 'number/1', 'zero', 'number/1'],
    },
  ]
  for (const { label, body, expected } of cases) {
    test(label, () => {
      const src = source(body)
      const templates = DSL_ADAPTERS.map((adapter) => ({ adapter, template: compile(src, adapter) }))
      const spelled = templates.filter(({ adapter }) => NULL_AS_ZERO[adapter.name])
      for (const { adapter, template } of spelled) {
        expect({ adapter: adapter.name, decisions: decisions(template, adapter, true) }).toEqual({
          adapter: adapter.name,
          decisions: expected,
        })
      }
      const withoutNull = expected.filter((d) => d !== 'zero')
      for (const { adapter, template } of templates) {
        expect({ adapter: adapter.name, decisions: decisions(template, adapter, false) }).toEqual({
          adapter: adapter.name,
          decisions: withoutNull,
        })
      }
    }, COMPILE_TIMEOUT_MS)
  }
})

describe('a compound arithmetic operand keeps its grouping on every DSL adapter (#3474)', () => {
  // Each pair differs only in its parentheses; the first is grouped against
  // the target's own precedence, so an adapter that drops the grouping emits
  // the same template for both.
  const pairs: ReadonlyArray<readonly [string, string]> = [
    ...['*', '/', '%'].map((op) => [`(props.n + 1) ${op} 2`, `props.n + 1 ${op} 2`] as const),
    ...['+', '-', '*', '/', '%'].map((op) => [`props.n ${op} (props.m - 1)`, `props.n ${op} props.m - 1`] as const),
    ['-(props.n + 1)', '-props.n + 1'],
    ['-(props.n * props.m)', '-props.n * props.m'],
  ]
  for (const [grouped, flat] of pairs) {
    test(grouped, () => {
      for (const adapter of DSL_ADAPTERS) {
        const a = compile(source(`<span>{${grouped}}</span>`), adapter)
        const b = compile(source(`<span>{${flat}}</span>`), adapter)
        expect({ adapter: adapter.name, same: a === b }).toEqual({ adapter: adapter.name, same: false })
      }
    }, COMPILE_TIMEOUT_MS)
  }

  // A negated negation is grouped too: `--x` is a decrement in PHP and Perl.
  test('-(-props.n)', () => {
    for (const adapter of DSL_ADAPTERS) {
      const template = compile(source('<span>{-(-props.n)}</span>'), adapter)
      expect({ adapter: adapter.name, decrement: /(?<!<!)--[\w$]/.test(template) }).toEqual({
        adapter: adapter.name,
        decrement: false,
      })
    }
  }, COMPILE_TIMEOUT_MS)
})
