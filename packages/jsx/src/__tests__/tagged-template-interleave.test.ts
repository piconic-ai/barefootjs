/**
 * Tagged-template interleave-tag desugaring (#2092, Refs #2069).
 *
 * The classname-tag idiom:
 *
 *   function cn(parts: TemplateStringsArray, ...args: unknown[]): string {
 *     return parts.reduce<string>((acc, p, i) => acc + p + (args[i] ?? ''), '')
 *   }
 *   className={cn`base ${tone()}`}
 *
 * Before #2092 the compiler treated `cn\`...\`` as an opaque scalar leaf: a
 * `TaggedTemplateExpression` falls through `expression-parser.ts` as
 * `unsupported`, and every non-JS template adapter refused it with BF101.
 *
 * #2092 resolves the tag identifier one hop through same-file scope (reusing
 * #2090's `findLocalConst` / `findLocalFunction`), structurally proves the
 * resolved function matches the "interleave tag" catalogue (see
 * `isInterleaveTagFunction` in `jsx-to-ir.ts`), and — only then — REWRITES
 * the whole tagged template to the equivalent untagged template literal
 * (`\`base \${(tone()) ?? ''}\``) before the rest of the compiler ever sees
 * it. Everything else (dep analysis, template-literal parts, adapter emit,
 * client-JS binding) runs unchanged against the rewritten node.
 *
 * These tests exercise the recognizer directly against the IR (so assertions
 * don't depend on any one adapter's output formatting) via `analyzeComponent`
 * + `jsxToIR`, matching `ir-sort-comparator.test.ts`'s style for the sibling
 * #2090 feature.
 */

import { describe, test, expect } from 'bun:test'
import { analyzeComponent } from '../analyzer'
import { jsxToIR } from '../jsx-to-ir'
import type { IRElement, ExpressionAttr } from '../types'

/** Compile `source` and return the root element's `className` attribute
 *  value from the IR (the IR keeps the JSX name `className`; adapters
 *  render it as `class` later). */
function classAttrValue(source: string, filename = 'TagDemo.tsx') {
  const ctx = analyzeComponent(source, filename)
  const ir = jsxToIR(ctx)
  expect(ir).not.toBeNull()
  expect(ir!.type).toBe('element')
  const el = ir as IRElement
  const attr = el.attrs.find(a => a.name === 'className')
  expect(attr).toBeDefined()
  return attr!.value
}

describe('tagged-template interleave-tag recognition (#2092)', () => {
  test('recognized cn`base ${tone()}` desugars to the untagged template literal', () => {
    const source = `
      'use client'
      import { createSignal } from '@barefootjs/client'
      function cn(parts: TemplateStringsArray, ...args: unknown[]): string {
        return parts.reduce<string>((acc, p, i) => acc + p + (args[i] ?? ''), '')
      }
      export function TagDemo() {
        const [tone, setTone] = createSignal('primary')
        return <div onClick={() => setTone('secondary')} className={cn\`base \${tone()}\`}>x</div>
      }
    `
    const value = classAttrValue(source)
    expect(value.kind).toBe('expression')
    const expr = (value as ExpressionAttr).expr
    // The tag call is gone — replaced by the equivalent untagged template
    // literal, each span wrapped in `(span) ?? ''`.
    expect(expr).not.toMatch(/\bcn`/)
    expect(expr).toBe("`base ${(tone()) ?? ''}`")
  })

  test('const-bound arrow interleave tag also resolves (findLocalConst path)', () => {
    const source = `
      'use client'
      import { createSignal } from '@barefootjs/client'
      const cn = (parts: TemplateStringsArray, ...args: unknown[]): string =>
        parts.reduce<string>((acc, p, i) => acc + p + (args[i] ?? ''), '')
      export function TagDemo() {
        const [tone, setTone] = createSignal('primary')
        return <div onClick={() => setTone('secondary')} className={cn\`base \${tone()}\`}>x</div>
      }
    `
    const value = classAttrValue(source)
    expect(value.kind).toBe('expression')
    expect((value as ExpressionAttr).expr).toBe("`base ${(tone()) ?? ''}`")
  })

  test('String(...)-wrapped span still matches the catalogue', () => {
    const source = `
      'use client'
      import { createSignal } from '@barefootjs/client'
      function cn(parts: TemplateStringsArray, ...args: unknown[]): string {
        return parts.reduce<string>((acc, p, i) => acc + p + String(args[i] ?? ''), '')
      }
      export function TagDemo() {
        const [tone] = createSignal('primary')
        return <div className={cn\`base \${tone()}\`}>x</div>
      }
    `
    const value = classAttrValue(source)
    expect(value.kind).toBe('expression')
    expect((value as ExpressionAttr).expr).toBe("`base ${(tone()) ?? ''}`")
  })

  test('no-substitution template (no interpolation) desugars cleanly', () => {
    const source = `
      'use client'
      function cn(parts: TemplateStringsArray, ...args: unknown[]): string {
        return parts.reduce<string>((acc, p, i) => acc + p + (args[i] ?? ''), '')
      }
      export function TagDemo() {
        return <div className={cn\`base\`}>x</div>
      }
    `
    const value = classAttrValue(source)
    // No spans at all — the rewrite produces a plain
    // NoSubstitutionTemplateLiteral, not an "expression" carrying a call.
    expect(value.kind).toBe('expression')
    expect((value as ExpressionAttr).expr).toBe('`base`')
    expect((value as ExpressionAttr).expr).not.toMatch(/\bcn`/)
  })

  test('escaped backtick / literal ${...} / backslash chunk survives the rewrite verbatim', () => {
    // Chunk raw text (as written in source): `pre\` mid \${lit} end\\stop `
    // — a literal backtick, a literal (non-substituting) `${lit}`, and a
    // literal backslash, followed by the ONE real span `${tone()}`.
    const source = `
      'use client'
      import { createSignal } from '@barefootjs/client'
      function cn(parts: TemplateStringsArray, ...args: unknown[]): string {
        return parts.reduce<string>((acc, p, i) => acc + p + (args[i] ?? ''), '')
      }
      export function TagDemo() {
        const [tone] = createSignal('primary')
        return <div className={cn\`pre\\\` mid \\\${lit} end\\\\stop \${tone()} post\`}>x</div>
      }
    `
    const value = classAttrValue(source)
    expect(value.kind).toBe('expression')
    const expr = (value as ExpressionAttr).expr
    // The escape sequences (backtick, `${`, backslash) must survive
    // byte-for-byte in the rewritten source — using the COOKED text
    // instead of `rawText` would either mis-parse the reconstructed
    // template or silently turn `${lit}` into a real (broken) substitution.
    expect(expr).toBe("`pre\\` mid \\${lit} end\\\\stop ${(tone()) ?? ''} post`")
  })

  test('imported tag identifier is NOT resolved — left untouched (today\'s BF101 path)', () => {
    const source = `
      'use client'
      import { createSignal } from '@barefootjs/client'
      import { cn } from './cn-helper'
      export function TagDemo() {
        const [tone] = createSignal('primary')
        return <div className={cn\`base \${tone()}\`}>x</div>
      }
    `
    const value = classAttrValue(source)
    expect(value.kind).toBe('expression')
    // Unresolved (no same-file binding) — the tag call is preserved verbatim.
    expect((value as ExpressionAttr).expr).toContain('cn`base')
  })

  test('cross-kind name collision (const + function binding) is NOT resolved', () => {
    // Same ambiguity rule as resolveSortComparatorIdentifier (#2091 review):
    // a name bound both as a const and as a `function` declaration can only
    // occur across scopes, and FunctionInfo carries emission placement (not
    // lexical position), so resolution refuses rather than guessing which
    // tag the call site actually sees. The node stays opaque (BF101 path).
    const source = `
      'use client'
      import { createSignal } from '@barefootjs/client'
      function cn(parts: TemplateStringsArray, ...args: unknown[]): string {
        return parts.reduce<string>((acc, p, i) => acc + p + (args[i] ?? ''), '')
      }
      export function TagDemo() {
        const [tone] = createSignal('primary')
        const cn = (parts: TemplateStringsArray, ...args: unknown[]) =>
          parts.reduce<string>((acc, p, i) => acc + p + '-' + (args[i] ?? ''), '')
        return <div className={cn\`base \${tone()}\`}>x</div>
      }
    `
    const value = classAttrValue(source)
    expect(value.kind).toBe('expression')
    expect((value as ExpressionAttr).expr).toContain('cn`base')
  })

  test('off-catalogue body (joins with a separator) is NOT recognized', () => {
    const source = `
      'use client'
      import { createSignal } from '@barefootjs/client'
      function cn(parts: TemplateStringsArray, ...args: unknown[]): string {
        return parts.reduce<string>((acc, p, i) => acc + p + '-' + (args[i] ?? ''), '')
      }
      export function TagDemo() {
        const [tone] = createSignal('primary')
        return <div className={cn\`base \${tone()}\`}>x</div>
      }
    `
    const value = classAttrValue(source)
    expect(value.kind).toBe('expression')
    expect((value as ExpressionAttr).expr).toContain('cn`base')
  })

  test('computed tag (member expression) is NOT recognized', () => {
    const source = `
      'use client'
      import { createSignal } from '@barefootjs/client'
      const helpers = {
        cn(parts: TemplateStringsArray, ...args: unknown[]): string {
          return parts.reduce<string>((acc, p, i) => acc + p + (args[i] ?? ''), '')
        },
      }
      export function TagDemo() {
        const [tone] = createSignal('primary')
        return <div className={helpers.cn\`base \${tone()}\`}>x</div>
      }
    `
    const value = classAttrValue(source)
    expect(value.kind).toBe('expression')
    // Not even an Identifier tag — the recognizer only matches a bare
    // identifier tag (`tryDesugarInterleaveTaggedTemplate` requires
    // `ts.isIdentifier(expr.tag)`), so a computed tag is never attempted.
    expect((value as ExpressionAttr).expr).toContain('helpers.cn`base')
  })

  test('non-rest second parameter is NOT recognized', () => {
    const source = `
      'use client'
      import { createSignal } from '@barefootjs/client'
      function cn(parts: TemplateStringsArray, args: unknown[]): string {
        return parts.reduce<string>((acc, p, i) => acc + p + (args[i] ?? ''), '')
      }
      export function TagDemo() {
        const [tone] = createSignal('primary')
        return <div className={cn\`base \${tone()}\`}>x</div>
      }
    `
    const value = classAttrValue(source)
    expect(value.kind).toBe('expression')
    expect((value as ExpressionAttr).expr).toContain('cn`base')
  })

  test('/* @client */ still defers a recognized interleave tag to the client', () => {
    const source = `
      'use client'
      import { createSignal } from '@barefootjs/client'
      function cn(parts: TemplateStringsArray, ...args: unknown[]): string {
        return parts.reduce<string>((acc, p, i) => acc + p + (args[i] ?? ''), '')
      }
      export function TagDemo() {
        const [tone, setTone] = createSignal('primary')
        return <div onClick={() => setTone('secondary')} className={/* @client */ cn\`base \${tone()}\`}>x</div>
      }
    `
    const ctx = analyzeComponent(source, 'TagDemo.tsx')
    const ir = jsxToIR(ctx)
    expect(ir).not.toBeNull()
    const el = ir as IRElement
    const attr = el.attrs.find(a => a.name === 'className')
    expect(attr).toBeDefined()
    // The desugar still applies (the client-only directive doesn't block
    // recognition — it's read independently from the original node), and
    // the attribute is still flagged clientOnly so it defers to hydrate.
    expect(attr!.clientOnly).toBe(true)
    expect(attr!.value.kind).toBe('expression')
    expect((attr!.value as ExpressionAttr).expr).toBe("`base ${(tone()) ?? ''}`")
  })
})
