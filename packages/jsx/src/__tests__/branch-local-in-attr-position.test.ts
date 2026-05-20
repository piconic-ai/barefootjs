/**
 * Regression tests for the #1414 matrix follow-up. The
 * "inline at use sites" pass added in #1410 (then extended in #1412
 * for ternary-typed JSX initializers) was shaped around the
 * `{/* @client * / X}` JSX-child position. Element-attribute
 * positions (`style={local}`, `className={local}`, generic
 * `attr={local}`) took a different code path through
 * `getAttributeValue` → template emit and didn't visit the inline
 * pass, so a branch-local string identifier leaked into the
 * emitted template lambda and tripped `ReferenceError: local is
 * not defined` at hydrate.
 *
 * Fix: in `getAttributeValue`, when an attribute value is a bare
 * identifier that resolves to a `_branchScopeVars` entry with a
 * non-JSX initializer, substitute the identifier's AST with the
 * initializer's AST before the downstream attribute-shape probes
 * (template-literal / ternary / generic-expression). JSX-bearing
 * initializers are skipped because attribute positions can't host
 * JSX; those keep the JSX-child-position inlining route from
 * #1410.
 */

import { describe, test, expect } from 'bun:test'
import { compileJSX } from '../compiler'
import { TestAdapter } from '../adapters/test-adapter'

const adapter = new TestAdapter()

function clientJsContent(result: ReturnType<typeof compileJSX>): string {
  return result.files.find(f => f.type === 'clientJs')!.content
}

function hydrateLine(result: ReturnType<typeof compileJSX>): string {
  const line = clientJsContent(result).split('\n').find(l => l.includes('hydrate('))
  if (!line) throw new Error('no hydrate() call in client JS')
  return line
}

describe('branch-local at element-attribute position (#1414)', () => {
  test('string local at `style` attribute substitutes the literal', () => {
    // Pre-fix: template lambda referenced `local` at outer scope.
    // Post-fix: the identifier is substituted with the literal,
    // and `styleToCss('color:red')` evaluates fine at hydrate.
    const source = `
      'use client'
      import { createSignal } from '@barefootjs/client'

      export function CaseStringAtStyle(props: { kind: 'a' | 'b' }) {
        const [count] = createSignal(0)
        if (props.kind === 'a') {
          const local = 'color:red'
          return <div style={local}>A: {count()}</div>
        }
        return <div>B: {count()}</div>
      }
    `
    const result = compileJSX(source, 'CaseStringAtStyle.tsx', { adapter })
    expect(result.errors.filter(e => e.severity === 'error')).toHaveLength(0)

    const hydrate = hydrateLine(result)
    expect(hydrate).not.toMatch(/\blocal\b/)
    expect(hydrate).toContain("'color:red'")
  })

  test('string local at `className` attribute substitutes the literal', () => {
    const source = `
      'use client'
      import { createSignal } from '@barefootjs/client'

      export function CaseStringAtClass(props: { kind: 'a' | 'b' }) {
        const [count] = createSignal(0)
        if (props.kind === 'a') {
          const local = 'foo bar'
          return <div className={local}>A: {count()}</div>
        }
        return <div>B: {count()}</div>
      }
    `
    const result = compileJSX(source, 'CaseStringAtClass.tsx', { adapter })
    expect(result.errors.filter(e => e.severity === 'error')).toHaveLength(0)

    const hydrate = hydrateLine(result)
    expect(hydrate).not.toMatch(/\blocal\b/)
    expect(hydrate).toContain("'foo bar'")
  })

  test('ternary-string branch local at `style` attribute (#1414 case 6)', () => {
    // Speculative case in the matrix that turns out to share the
    // same fix: the ternary initializer doesn't contain JSX, so it
    // qualifies for substitution. The downstream attribute path
    // detects the ConditionalExpression shape and routes through
    // the existing ternary template handling.
    const source = `
      'use client'
      import { createSignal } from '@barefootjs/client'

      export function CaseTernaryStringAtStyle(props: { kind: 'a' | 'b'; warn: boolean }) {
        const [count] = createSignal(0)
        if (props.kind === 'a') {
          const local = props.warn ? 'color:orange' : 'color:green'
          return <div style={local}>A: {count()}</div>
        }
        return <div>B: {count()}</div>
      }
    `
    const result = compileJSX(source, 'CaseTernaryStringAtStyle.tsx', { adapter })
    expect(result.errors.filter(e => e.severity === 'error')).toHaveLength(0)

    const hydrate = hydrateLine(result)
    expect(hydrate).not.toMatch(/\blocal\b/)
    expect(hydrate).toContain("color:orange")
    expect(hydrate).toContain("color:green")
    // The branch's `props.warn` reference is correctly bridged to `_p.warn`.
    expect(hydrate).toMatch(/_p\.warn/)
  })

  test('string local at generic `data-*` attribute', () => {
    const source = `
      'use client'
      import { createSignal } from '@barefootjs/client'

      export function CaseDataAttr(props: { kind: 'a' | 'b' }) {
        const [count] = createSignal(0)
        if (props.kind === 'a') {
          const local = 'flagged'
          return <div data-status={local}>A: {count()}</div>
        }
        return <div>B: {count()}</div>
      }
    `
    const result = compileJSX(source, 'CaseDataAttr.tsx', { adapter })
    expect(result.errors.filter(e => e.severity === 'error')).toHaveLength(0)

    const hydrate = hydrateLine(result)
    expect(hydrate).not.toMatch(/\blocal\b/)
    expect(hydrate).toContain("'flagged'")
  })

  test('branch-local with JSX initializer at attribute position stays unmodified', () => {
    // Regression guard: the substitution must skip initializers that
    // contain JSX. Attribute values can't host JSX, and the
    // existing JSX-child-position fix (#1410) handles those at the
    // `@client` use site. Substituting here would emit malformed
    // template output.
    const source = `
      'use client'
      import { createSignal } from '@barefootjs/client'

      export function JsxLocalAttr(props: { kind: 'a' | 'b' }) {
        const [count] = createSignal(0)
        if (props.kind === 'a') {
          // Contrived: JSX literal local. Using it as an attribute
          // value isn't a real pattern; this test guards that the
          // substitution doesn't crash or emit JSX into the attr text.
          const local = <span>x</span>
          // Use the local at the @client child position (the real
          // pattern), and a separate plain title attribute. The
          // template must not contain a bare \`local\` identifier.
          return <div title="t">{/* @client */ local}</div>
        }
        return <div>B: {count()}</div>
      }
    `
    const result = compileJSX(source, 'JsxLocalAttr.tsx', { adapter })
    expect(result.errors.filter(e => e.severity === 'error')).toHaveLength(0)

    // JSX literal is inlined at the @client child position (per #1410).
    const hydrate = hydrateLine(result)
    expect(hydrate).toContain('<span>x</span>')
    expect(hydrate).not.toMatch(/\blocal\b/)
  })

  test('chained branch-locals resolve transitively (#1425 — asChild Slot pattern)', () => {
    // The `mergedClass` initializer references `childClass`, which
    // is itself a branch-local declared on a previous line. Pre-fix
    // the inlining substituted `mergedClass` at the attribute use
    // site but left `childClass` as a free identifier in the emitted
    // text — `ReferenceError: childClass is not defined` at hydrate.
    // Same applies to the destructured prop names (`children`,
    // `className`) referenced inside the substituted text: the AST
    // walk that drives `rewriteBarePropRefs` only sees the original
    // use-site AST, so any prop refs introduced via substitution
    // need to be bridged to `_p.X` at `branchSubs` build time.
    //
    // Mirrors the scaffold's `Slot` component shape: chain of locals
    // whose initializers reference both earlier locals and
    // destructured props, used at a downstream JSX attribute via
    // `mergedClass || undefined`.
    const source = `
      'use client'

      function isValidElement(element: unknown): element is { tag: unknown; props: Record<string, unknown> } {
        return !!(element && typeof element === 'object' && 'tag' in element && 'props' in element)
      }

      export function Slot({ children, className }: { children?: unknown; className?: string }) {
        if (children && isValidElement(children)) {
          const childProps = children.props || {}
          const childClass = (childProps.className as string) || ''
          const mergedClass = [className, childClass].filter(Boolean).join(' ')
          return <div className={mergedClass || undefined}>X</div>
        }
        return <div>fallback</div>
      }
    `
    const result = compileJSX(source, 'Slot.tsx', { adapter })
    expect(result.errors.filter(e => e.severity === 'error')).toHaveLength(0)

    const clientJs = clientJsContent(result)
    // No branch-local identifier leaks anywhere in the emitted JS —
    // covers both the `initSlot` function body and the `hydrate(...)
    // template` arrow.
    expect(clientJs).not.toMatch(/\bchildClass\b/)
    expect(clientJs).not.toMatch(/\bchildProps\b/)
    expect(clientJs).not.toMatch(/\bmergedClass\b/)
    // Bridged-prop references must appear consistently in the
    // template arrow (which lives at module scope, only `_p` in
    // scope) — `className` / `children` introduced via substitution
    // must reach `_p.className` / `_p.children`.
    const hydrate = hydrateLine(result)
    expect(hydrate).toMatch(/_p\.className/)
    expect(hydrate).toMatch(/_p\.children/)
    // Negative: no bare `className`/`children` value references left
    // in the template arrow's body — the only legal occurrences are
    // either prop access (`.className`/`.children`, preceded by `.`)
    // or `_p.X` (preceded by `_p.`).
    expect(hydrate).not.toMatch(/(?<![._])\bclassName\b/)
    expect(hydrate).not.toMatch(/(?<![._])\bchildren\b/)
  })

  test('branch-local substitution preserves raw form in non-template paths (#1425 SSR-leak guard)', () => {
    // Regression for the false start on #1425: pre-rewriting
    // `branchSubs` text to `_p.X` at substitution-build time fixed
    // the CSR template arrow but poisoned the SSR adapter's JSX
    // emission. The hono / test adapters evaluate the same
    // expression text on the server in a scope where `_p` doesn't
    // exist (function params are destructured as named locals
    // `children` / `className`), so a `_p.children` reference
    // surfaced via substitution throws `ReferenceError: _p is not
    // defined` during SSR.
    //
    // Pin the asymmetry: the IR's `expr` field (consumed by the SSR
    // adapter) stays in raw source-level form; the bridged-prop
    // form lives only on `templateExpr` (consumed by CSR template
    // emission). A child-component prop binding exercises the path
    // that broke first.
    const source = `
      'use client'

      function isValidElement(element: unknown): element is { tag: unknown; props: Record<string, unknown> } {
        return !!(element && typeof element === 'object' && 'tag' in element && 'props' in element)
      }

      function Tag(_p: any) { return null as any }

      export function Slot({ children, className }: { children?: unknown; className?: string }) {
        if (children && isValidElement(children)) {
          const childProps = children.props || {}
          const childClass = (childProps.className as string) || ''
          const mergedClass = [className, childClass].filter(Boolean).join(' ')
          return <Tag className={mergedClass || undefined}>X</Tag>
        }
        return <div>fallback</div>
      }
    `
    const result = compileJSX(source, 'Slot.tsx', { adapter })
    expect(result.errors.filter(e => e.severity === 'error')).toHaveLength(0)

    const clientJs = clientJsContent(result)
    // The child-component path's prop getter — `get className()` /
    // `initChild(... { className: ... })` — runs at `initSlot` scope
    // where `_p` is destructured into named locals at the top, so
    // the substituted text must reference `children` / `className`
    // (NOT `_p.children` / `_p.className`). The same text shape is
    // what the SSR adapter sees, and `_p` doesn't exist on the
    // server. Pin both occurrences.
    expect(clientJs).toMatch(/get className\(\)[^{]*\{[^}]*\bchildren\.props\b/)
    expect(clientJs).not.toMatch(/get className\(\)[^{]*\{[^}]*_p\.children/)
  })

  test('outer-scope string const at attribute position keeps existing inliner path', () => {
    // Negative-side regression: an outer-scope const at attribute
    // position must keep going through `compute-inlinability`
    // (chained-const resolution + relocate), not through the
    // branch-scope substitution that only fires for `_branchScopeVars`
    // entries.
    const source = `
      'use client'
      import { createSignal } from '@barefootjs/client'

      export function OuterScopeAttr(props: { kind: 'a' | 'b' }) {
        const [count] = createSignal(0)
        const local = 'foo bar'
        return <div className={local}>view: {count()}</div>
      }
    `
    const result = compileJSX(source, 'OuterScopeAttr.tsx', { adapter })
    expect(result.errors.filter(e => e.severity === 'error')).toHaveLength(0)

    const hydrate = hydrateLine(result)
    // compute-inlinability already inlines this outer-scope string
    // const at template scope, so `local` does NOT appear as a bare
    // identifier and the value text is in the attribute.
    expect(hydrate).not.toMatch(/\blocal\b/)
    expect(hydrate).toContain('foo bar')
  })

  test('branch-local substitution skips string literals and `$`-prefixed identifiers', () => {
    // The substitution machinery used to scan with `text.replace(/\b
    // (name1|name2)\b/g, ...)`, which would (a) rewrite occurrences
    // of the name inside string literals into invalid JS and
    // (b) mis-match `\b` between `$` and a word char, splitting an
    // identifier like `$kind` and rewriting just its `kind` tail.
    // The fix routes both substitution passes through
    // `replaceInExprContexts` (skips opaque tokens — strings, regex,
    // template bodies, comments) and replaces `\b` with `[\w$]`
    // lookarounds so the boundary check treats `$` as part of an
    // identifier. This test pins both invariants by declaring a
    // branch-local whose name collides with a token inside a string
    // literal *and* with the tail of a `$`-prefixed identifier.
    const source = `
      'use client'
      import { createSignal } from '@barefootjs/client'

      export function CaseEdgeBoundary(props: { kind: 'a' | 'b' }) {
        const [count] = createSignal(0)
        if (props.kind === 'a') {
          const $kind = 'dollar'
          const kind = 'plain'
          // The data-* string literal contains the bare word "kind"
          // (a branch-local name) and the identifier "$kind" (whose
          // tail collides with "kind" under a naive \\b boundary).
          // Both must survive the substitution pass intact.
          const tag = \`label:kind=\${$kind}\`
          return <div data-tag={tag}>A: {kind} {count()}</div>
        }
        return <div>B: {count()}</div>
      }
    `
    const result = compileJSX(source, 'CaseEdgeBoundary.tsx', { adapter })
    expect(result.errors.filter(e => e.severity === 'error')).toHaveLength(0)

    const clientJs = clientJsContent(result)
    // The substituted text MUST contain the literal string `label:kind=`
    // verbatim — pre-fix, the `kind` inside the template-literal head
    // would have been rewritten into `('plain')`, mangling the string.
    expect(clientJs).toContain('label:kind=')
    // The `$kind` identifier must stay intact — pre-fix, `\\bkind\\b`
    // would have split `$kind` into `$` + `kind` and rewritten just
    // the `kind` tail.
    expect(clientJs).toContain('$kind')
  })
})
