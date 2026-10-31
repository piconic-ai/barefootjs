/**
 * A value-position `&&` / `||` chain grows its template linearly on every
 * template adapter (#3824).
 *
 * JS `a || b || c …` parses left-associated, so each `||` has the chain so
 * far as its left operand. A spelling that renders that operand twice (the
 * test and the value it returns, `truthy(l) ? l : r`) doubles the template
 * at every link: a 16-operand chain reached megabytes. Each adapter now
 * renders every operand once, so the template of a 16-operand chain stays
 * within a small multiple of the 4-operand one. The `logical-value-chains`
 * conformance fixture holds the rendered values.
 */
import { describe, test, expect } from 'bun:test'
import type { TemplateAdapter } from '@barefootjs/jsx'
import { GoTemplateAdapter } from '@barefootjs/go-template/adapter'
import { BladeAdapter } from '@barefootjs/blade/adapter'
import { ErbAdapter } from '@barefootjs/erb/adapter'
import { JinjaAdapter } from '@barefootjs/jinja/adapter'
import { MojoAdapter } from '@barefootjs/mojolicious/adapter'
import { PebbleAdapter } from '@barefootjs/pebble/adapter'
import { MinijinjaAdapter } from '@barefootjs/rust/adapter'
import { TwigAdapter } from '@barefootjs/twig/adapter'
import { XslateAdapter } from '@barefootjs/xslate/adapter'
import { compileFixtureJSX } from '../harness-program'

const TARGETS: ReadonlyArray<readonly [string, () => TemplateAdapter]> = [
  ['go', () => new GoTemplateAdapter()],
  ['blade', () => new BladeAdapter()],
  ['erb', () => new ErbAdapter()],
  ['jinja', () => new JinjaAdapter()],
  ['mojolicious', () => new MojoAdapter()],
  ['pebble', () => new PebbleAdapter()],
  ['rust', () => new MinijinjaAdapter()],
  ['twig', () => new TwigAdapter()],
  ['xslate', () => new XslateAdapter()],
]

const FIELDS = ['zero', 'empty', 'nil', 'label']

/** `p.zero || p.empty || p.nil || p.label || p.zero || …` with `n` operands. */
function chain(n: number, op: '&&' | '||'): string {
  return Array.from({ length: n }, (_, i) => `props.${FIELDS[i % FIELDS.length]}`).join(` ${op} `)
}

function source(n: number): string {
  return `
'use client'
export function Chain(props: { zero: number; empty: string; nil?: string | null; label: string }) {
  return <p data-or={${chain(n, '||')}} data-and={${chain(n, '&&')}}>{${chain(n, '||')}}</p>
}
`
}

function templateSize(n: number, make: () => TemplateAdapter): number {
  const result = compileFixtureJSX(source(n), 'chain.tsx', { adapter: make() })
  const errors = result.errors.filter((e) => e.severity === 'error').map((e) => `${e.code} ${e.message}`)
  expect(errors).toEqual([])
  return result.files
    .filter((f) => f.type === 'markedTemplate')
    .map((f) => f.content.length)
    .reduce((a, b) => a + b, 0)
}

describe('a value-position && / || chain grows its template linearly (#3824)', () => {
  for (const [name, make] of TARGETS) {
    test(name, () => {
      const [s4, s8, s16] = [4, 8, 16].map((n) => templateSize(n, make))
      // Linear growth: 12 more operands per chain add about 3x the
      // operand text of the 4-operand chain. A doubling spelling is 2^12
      // times larger here.
      expect(s16).toBeLessThan(s4 * 4)
      // And each doubling of the operand count adds about the same amount.
      expect(s16 - s8).toBeLessThan((s8 - s4) * 3)
    }, 60_000)
  }
})
