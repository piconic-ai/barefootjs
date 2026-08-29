/**
 * #2754 — a `{...props}` / `{...rest}` forward is the one attribute source
 * no template can carry (its keys are unknown at compile time), so the
 * runtime's `applyRestAttrs` is the only thing that can apply it. That
 * call is addressed by slot id and lives in `init`, and BOTH gates used to
 * miss the stateless case:
 *
 *   - Phase 1 gave the host element no slot id, because a spread trips
 *     none of the reactivity heuristics; and
 *   - `needsClientJs` did not count `restAttrElements`, so even with a
 *     slot the component fell to the template-only mount with `init` empty.
 *
 * SSR and hydration hid both: the SSR markup already carries the caller's
 * attributes. Only a pure `createComponent` mount showed the drop.
 */
import { describe, test, expect } from 'bun:test'
import { compileJSX } from '../compiler'
import { TestAdapter } from '../adapters/test-adapter'

const adapter = new TestAdapter()

function compile(source: string) {
  const result = compileJSX(source, 'Repro.tsx', { adapter })
  expect(result.errors.filter(e => e.severity === 'error')).toHaveLength(0)
  return {
    clientJs: result.files.find(f => f.type === 'clientJs')!.content,
    template: result.files.find(f => f.type === 'markedTemplate')!.content,
  }
}

describe('#2754 — a caller-props forward earns a slot and an init', () => {
  test('a stateless `{ children, ...props }` forwarder emits applyRestAttrs against a slot', () => {
    const { clientJs, template } = compile(`
      "use client";
      export function Plain({ children, ...props }: { children?: unknown; [k: string]: unknown }) {
        return <span className="plain" {...props}>{children}</span>
      }
    `)
    expect(clientJs).toContain('applyRestAttrs')
    // The slot the call addresses must exist in the SSR markup too, or
    // hydration's `$(__scope, 's0')` finds nothing.
    expect(clientJs).toMatch(/const \[_s\d\] = \$\(__scope, 's\d'\)/)
    expect(template).toMatch(/bf="s\d"/)
    // `children` and the statically-set `class` stay excluded so the
    // forward neither double-renders children nor re-emits `class`.
    expect(clientJs).toMatch(/applyRestAttrs\(_s\d, _p, \["children","class"\]\)/)
  })

  test('a whole undestructured props object spread gets the same treatment', () => {
    const { clientJs } = compile(`
      "use client";
      export function Whole(props: { [k: string]: unknown }) {
        return <span className="plain" {...props} />
      }
    `)
    expect(clientJs).toContain('applyRestAttrs')
  })

  test('an alias hop onto the rest binding resolves the same way (#2723 shape)', () => {
    const { clientJs } = compile(`
      "use client";
      export function Aliased({ children, ...props }: { children?: unknown; [k: string]: unknown }) {
        const props__alias = props
        return <span className="plain" {...props__alias}>{children}</span>
      }
    `)
    expect(clientJs).toContain('applyRestAttrs')
  })

  test('a spread of an ordinary object still inlines into the template and earns no slot', () => {
    // Reverse direction: only the caller-props forward is unknowable at
    // compile time. An ordinary object spread is fully emitted by both
    // templates and must not start allocating slot ids.
    const { clientJs, template } = compile(`
      "use client";
      const extra = { title: 'x' }
      export function Ordinary() {
        return <span className="plain" {...extra} />
      }
    `)
    expect(clientJs).toContain('spreadAttrs')
    expect(clientJs).not.toContain('applyRestAttrs')
    expect(template).not.toMatch(/bf="s\d"/)
  })
})
