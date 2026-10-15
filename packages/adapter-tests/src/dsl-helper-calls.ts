/**
 * Read runtime-helper calls back out of the eight DSL adapters' compiled
 * templates, for cross-adapter tests that pin the adapters to one lowering
 * (#3476, #3477): every adapter must call the same helpers, in the same
 * order, with the same number of operands.
 */
import type { TemplateAdapter } from '@barefootjs/jsx'
import { BladeAdapter } from '@barefootjs/blade/adapter'
import { ErbAdapter } from '@barefootjs/erb/adapter'
import { JinjaAdapter } from '@barefootjs/jinja/adapter'
import { MojoAdapter } from '@barefootjs/mojolicious/adapter'
import { PebbleAdapter } from '@barefootjs/pebble/adapter'
import { MinijinjaAdapter } from '@barefootjs/rust/adapter'
import { TwigAdapter } from '@barefootjs/twig/adapter'
import { XslateAdapter } from '@barefootjs/xslate/adapter'

export interface DslAdapterCase {
  name: string
  /** The display name the adapter's diagnostics use ("the Jinja adapter"). */
  displayName: string
  make: () => TemplateAdapter
  /** The text before a runtime helper's name (`bf.join(` → `bf.`). */
  prefix: string
  /** Helpers this adapter lowers to a native operator, and how to find each call. */
  native?: Record<string, RegExp>
  /** The adapter lowers a predicate the evaluator cannot model natively. */
  nativePredicate?: boolean
}

export const DSL_ADAPTERS: readonly DslAdapterCase[] = [
  { name: 'blade', displayName: 'Blade', make: () => new BladeAdapter(), prefix: '$bf->' },
  {
    name: 'erb',
    displayName: 'ERB',
    make: () => new ErbAdapter(),
    prefix: 'bf.',
    native: { lc: /\)\.downcase\b/g, uc: /\)\.upcase\b/g },
    nativePredicate: true,
  },
  { name: 'jinja', displayName: 'Jinja', make: () => new JinjaAdapter(), prefix: 'bf.' },
  {
    name: 'mojolicious',
    displayName: 'Mojo',
    make: () => new MojoAdapter(),
    prefix: 'bf->',
    native: { lc: /(?<![\w>$])lc\(/g, uc: /(?<![\w>$])uc\(/g },
    nativePredicate: true,
  },
  { name: 'pebble', displayName: 'Pebble', make: () => new PebbleAdapter(), prefix: 'bf.' },
  { name: 'rust', displayName: 'MiniJinja', make: () => new MinijinjaAdapter(), prefix: 'bf.' },
  { name: 'twig', displayName: 'Twig', make: () => new TwigAdapter(), prefix: 'bf.' },
  { name: 'xslate', displayName: 'Xslate', make: () => new XslateAdapter(), prefix: '$bf.', nativePredicate: true },
]

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** The number of top-level comma-separated operands from `src[open]` (an opening paren). */
export function operandCount(src: string, open: number): number {
  let depth = 0
  let count = 1
  for (let i = open; i < src.length; i++) {
    const ch = src[i]!
    if (ch === "'" || ch === '"') {
      for (i++; i < src.length && src[i] !== ch; i++) if (src[i] === '\\') i++
    } else if (ch === '(' || ch === '[' || ch === '{') {
      depth++
    } else if (ch === ')' || ch === ']' || ch === '}') {
      if (--depth === 0) return count
    } else if (ch === ',' && depth === 1) {
      count++
    }
  }
  throw new Error(`unbalanced call at ${open}`)
}

/** The calls of `helpers` in `src`, as `helper/operands`, in source order. */
export function helperCalls(src: string, adapter: DslAdapterCase, helpers: ReadonlySet<string>): string[] {
  const calls: Array<[number, string]> = []
  const prefixed = new RegExp(`(?<![\\w$])${escapeRe(adapter.prefix)}(\\w+)\\(`, 'g')
  for (const m of src.matchAll(prefixed)) {
    if (helpers.has(m[1]!)) calls.push([m.index!, `${m[1]}/${operandCount(src, m.index! + m[0].length - 1)}`])
  }
  for (const [helper, re] of Object.entries(adapter.native ?? {})) {
    if (helpers.has(helper)) for (const m of src.matchAll(re)) calls.push([m.index!, `${helper}/1`])
  }
  return calls.sort((a, b) => a[0] - b[0]).map(([, call]) => call)
}
