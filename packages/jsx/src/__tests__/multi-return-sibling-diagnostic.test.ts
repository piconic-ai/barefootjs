/**
 * Regression tests for #2556: a `'use client'` file where a component
 * references a same-file sibling whose body is a multi-return JSX dispatch
 * (`switch` / `if`-`else` chain) previously compiled clean with ZERO
 * diagnostics, but the sibling produced no template — so the emitted
 * `renderChild`/`initChild`/`createComponent` call referenced a component
 * name with nothing registered under it, throwing
 * `ReferenceError: <Name> is not defined` at SSR/hydrate time.
 *
 * Root cause: `listComponentFunctions`'s #932 "preserve verbatim helper"
 * bypass is gated on `!hasUseClient` — in a `'use client'` file, a
 * multi-return sibling like `NavIcon` below IS added to `componentNames`
 * and asked to compile as a standalone component. But `visitComponentBody`
 * only folds `if`/`else`-chain multi-return bodies into `conditionalReturns`
 * (#1401); a top-level `switch` statement is preserved as a verbatim init
 * statement instead, so `ctx.jsxReturn` stays null and
 * `compileMultipleComponents`'s Pass-1 loop silently `continue`s past it —
 * no entry, no template, no error. Meanwhile the referencing sibling's IR
 * still holds a `component` reference to the dropped name.
 *
 * Fix: BF048 detects this structurally — after Pass 1, any name in
 * `componentNames` that did not make it into `entries` is cross-referenced
 * against every compiled sibling's IR component-reference graph (the same
 * walk `@bf-child` import markers use, `collectComponentNamesFromIR`). A
 * hit fails the compile instead of shipping a silent `ReferenceError`.
 */

import { describe, test, expect } from 'bun:test'
import { compileJSX } from '../compiler'
import { TestAdapter } from '../adapters/test-adapter'

const adapter = new TestAdapter()

describe('Sibling multi-return JSX dispatch produces no template in a client file (#2556)', () => {
  // Higher timeout: `.map()` in the source trips `needsTypeBasedDetection`,
  // and building the one-time `ts.Program` for BF023/BF024's nullable-key
  // check is slow the first time the TS API is touched in a fresh process
  // (e.g. this file run in isolation) — well past bun's 5s default.
  test('BF048: .map() loop child referencing a switch-dispatch sibling fails the compile', () => {
    const source = `
      "use client"
      import { createSignal } from '@barefootjs/client'
      function NavIcon({ name }: { name: string }) {
        switch (name) {
          case 'home': return <svg><path d="M1"/></svg>
          case 'bell': return <svg><path d="M2"/></svg>
          default: return null
        }
      }
      export function Shell() {
        const [n, setN] = createSignal(0)
        return (
          <nav onClick={() => setN(n() + 1)}>
            {['home', 'bell'].map(item => <NavIcon key={item} name={item} />)}
          </nav>
        )
      }
    `

    const result = compileJSX(source, 'Shell.tsx', { adapter })
    const errs = result.errors.filter(e => e.severity === 'error')
    expect(errs.length).toBeGreaterThan(0)
    const bf048 = errs.find(e => e.code === 'BF048')
    expect(bf048).toBeDefined()
    expect(bf048!.message).toContain('NavIcon')
    expect(bf048!.message).toContain('Shell')
    expect(bf048!.message).toMatch(/did not compile to a template/)
  }, 20000)

  test('BF048: direct JSX tag (non-loop) referencing a switch-dispatch sibling fails the compile', () => {
    const source = `
      "use client"
      import { createSignal } from '@barefootjs/client'
      function StatusIcon({ status }: { status: string }) {
        switch (status) {
          case 'ok': return <span class="ok">OK</span>
          case 'err': return <span class="err">ERR</span>
          default: return null
        }
      }
      export function Panel() {
        const [n, setN] = createSignal(0)
        return <div onClick={() => setN(n() + 1)}><StatusIcon status="ok" /></div>
      }
    `

    const result = compileJSX(source, 'Panel.tsx', { adapter })
    const errs = result.errors.filter(e => e.severity === 'error')
    const bf048 = errs.find(e => e.code === 'BF048')
    expect(bf048).toBeDefined()
    expect(bf048!.message).toContain('StatusIcon')
  })

  test('legal neighbor: the identical switch-dispatch shape in a non-"use client" file compiles clean (#932)', () => {
    // Same shape as the failing case above, but without the 'use client'
    // directive: `listComponentFunctions`'s #932 bypass keeps NavIcon OFF
    // `componentNames` entirely, so it is preserved verbatim in the marked
    // template rather than compiled (and dropped) as a component. BF048
    // must not fire here.
    const source = `
      function NavIcon({ name }: { name: string }) {
        switch (name) {
          case 'home': return <svg><path d="M1"/></svg>
          case 'bell': return <svg><path d="M2"/></svg>
          default: return null
        }
      }
      export function Shell() {
        return (
          <nav>
            {['home', 'bell'].map(item => <NavIcon key={item} name={item} />)}
          </nav>
        )
      }
    `

    const result = compileJSX(source, 'Shell.tsx', { adapter })
    const errs = result.errors.filter(e => e.severity === 'error')
    expect(errs.filter(e => e.code === 'BF048')).toHaveLength(0)
    expect(errs).toHaveLength(0)

    const markedTemplate = result.files.find(f => f.type === 'markedTemplate')
    expect(markedTemplate).toBeDefined()
    expect(markedTemplate!.content).toContain('function NavIcon')
  })

  test('legal neighbor: a "use client" sibling whose multi-return body DOES compile (if/else chain, #1401) stays clean', () => {
    // if/else-if chains fold into `conditionalReturns` (#1401) and produce
    // a real ternary template, so the sibling ends up in `entries` and the
    // reference resolves. BF048 must not fire.
    const source = `
      "use client"
      import { createSignal } from '@barefootjs/client'
      function Badge({ kind }: { kind: string }) {
        if (kind === 'ok') return <span class="ok">ok</span>
        if (kind === 'warn') return <span class="warn">warn</span>
        return <span class="err">err</span>
      }
      export function Panel() {
        const [n, setN] = createSignal(0)
        return (
          <div onClick={() => setN(n() + 1)}>
            <Badge kind="ok" />
          </div>
        )
      }
    `

    const result = compileJSX(source, 'Panel.tsx', { adapter })
    const errs = result.errors.filter(e => e.severity === 'error')
    expect(errs.filter(e => e.code === 'BF048')).toHaveLength(0)

    const clientJs = result.files.find(f => f.type === 'clientJs')
    expect(clientJs).toBeDefined()
    // Both the Panel and Badge components' hydrate() registrations exist
    // with real templates — the sibling reference resolves. Badge is a
    // non-exported sibling so its runtime key is file-scoped
    // (`Badge__<hash>`); match on the `name: 'Badge'` metadata instead of
    // the registry key.
    expect(clientJs!.content).toMatch(/hydrate\('Badge[^']*',\s*\{[^}]*template:/s)
    expect(clientJs!.content).toContain("name: 'Badge'")
  })

  test('legal neighbor: single-component "use client" multi-return root (#1401) is unaffected', () => {
    // Only one component in the file, so `compileJSX` never enters the
    // multi-component path where BF048 is computed at all.
    const source = `
      "use client"
      import { createSignal } from '@barefootjs/client'
      export function Toggle(props: { asChild?: boolean }) {
        const [open, setOpen] = createSignal(false)
        if (props.asChild) {
          return <span onClick={() => setOpen(!open())}>child</span>
        }
        return <button onClick={() => setOpen(!open())}>toggle</button>
      }
    `

    const result = compileJSX(source, 'Toggle.tsx', { adapter })
    expect(result.errors.filter(e => e.severity === 'error')).toHaveLength(0)
    const clientJs = result.files.find(f => f.type === 'clientJs')
    expect(clientJs).toBeDefined()
    expect(clientJs!.content).toContain('template:')
  })

  test('legal neighbor: a component-scope local JSX factory does not trip BF048', () => {
    // `listComponentFunctions` recurses into function bodies, so a local
    // factory like `Inner` below lands in `componentNames` and produces no
    // standalone template — but its call sites are handled by the
    // JSX-function-inlining pass, not `createComponent`, so it is NOT the
    // dropped-sibling shape. BF048's uncompiled-sibling set is restricted
    // to module top-level declarations precisely so this stays legal (the
    // first BF048 cut flagged it and broke the ir-dynamic-tag corpus).
    // Two components so the multi-component path (where BF048 runs) engages.
    const source = `
      "use client"
      import { createSignal } from '@barefootjs/client'
      export function Demo() {
        const Inner = () => <span>x</span>
        const [n, setN] = createSignal(0)
        return <div onClick={() => setN(n() + 1)}><Inner /></div>
      }
      export function Other() {
        return <p>other</p>
      }
    `

    const result = compileJSX(source, 'demo.tsx', { adapter })
    expect(result.errors.filter(e => e.severity === 'error')).toHaveLength(0)
  })
})
