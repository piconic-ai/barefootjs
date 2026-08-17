/**
 * Rich-type prop serialization refusal (BF049, #2643).
 *
 * Sibling of BF021 (`rich-type-method-refusal.test.ts`) for a DIFFERENT
 * failure shape: no method call is involved at all. A rich-typed prop
 * (`Map`, `Set`, `BigInt`, …) is simply READ by this component's own client
 * code (a handler, an effect) and passed through untouched — legitimate in
 * general, but the prop still crosses the `bf-p` hydration boundary as JSON,
 * where it either arrives de-riched (`Map`/`Set` → `{}`, entries silently
 * dropped) or fails to serialize at all (`BigInt` throws at SSR render).
 *
 * `checkRichTypePropSerialization` is metadata-driven (mirrors the adapter's
 * own `propsToSerialize` filter), not a lowering-plugin-aware IR walk, so
 * this suite doesn't need the plugin-registry snapshot dance
 * `rich-type-method-refusal.test.ts` uses — no lowering matcher can exempt a
 * prop from serialization the way one exempts a method call from BF021.
 */

import { describe, test, expect } from 'bun:test'
import { compileJSX } from '../compiler'
import { ErrorCodes } from '../errors'
import { TestAdapter } from '../adapters/test-adapter'

const adapter = new TestAdapter()

function bf049(source: string, filePath = 'Test.tsx') {
  const result = compileJSX(source, filePath, { adapter })
  return result.errors.filter((e) => e.code === ErrorCodes.RICH_TYPE_PROP_NOT_HYDRATABLE)
}

describe('rich-type prop serialization refusal — fires (BF049)', () => {
  test('Map prop read in a client event handler (destructured)', () => {
    const errors = bf049(`
      'use client'
      export function Foo({ data }: { data: Map<string, number> }) {
        return <button onClick={() => console.log(data.get('x'))}>go</button>
      }
    `)
    expect(errors).toHaveLength(1)
    expect(errors[0].severity).toBe('error')
    expect(errors[0].message).toContain("Prop 'data'")
    expect(errors[0].message).toContain("'Map<string, number>'")
    expect(errors[0].message).toContain('Map cannot')
    expect(errors[0].suggestion?.escape).toEqual([{ kind: 'prop-precompute' }])
  })

  test('Set prop read in a client event handler', () => {
    const errors = bf049(`
      'use client'
      export function Foo({ tags }: { tags: Set<string> }) {
        return <button onClick={() => console.log(tags.has('x'))}>go</button>
      }
    `)
    expect(errors).toHaveLength(1)
    expect(errors[0].message).toContain("Prop 'tags'")
  })

  test('object-form BigInt prop throws at SSR — message names the consequence', () => {
    const errors = bf049(`
      'use client'
      export function Foo({ n }: { n: BigInt }) {
        return <button onClick={() => console.log(n)}>go</button>
      }
    `)
    expect(errors).toHaveLength(1)
    expect(errors[0].message).toContain('JSON.stringify throws at SSR render')
  })

  test('bigint KEYWORD prop also fires — closes the keyword-spelling gap BF021 leaves open', () => {
    const errors = bf049(`
      'use client'
      export function Foo({ n }: { n: bigint }) {
        return <button onClick={() => console.log(n)}>go</button>
      }
    `)
    expect(errors).toHaveLength(1)
    expect(errors[0].message).toContain("'bigint'")
  })

  test('symbol keyword prop fires', () => {
    const errors = bf049(`
      'use client'
      export function Foo({ s }: { s: symbol }) {
        return <button onClick={() => console.log(s)}>go</button>
      }
    `)
    expect(errors).toHaveLength(1)
    expect(errors[0].message).toContain('drops the value entirely')
  })

  test('props-object mode (props.data)', () => {
    const errors = bf049(`
      'use client'
      export function Foo(props: { data: Map<string, number> }) {
        return <button onClick={() => console.log(props.data)}>go</button>
      }
    `)
    expect(errors).toHaveLength(1)
    expect(errors[0].message).toContain("Prop 'data'")
  })

  test('renamed destructured prop ({ data: d }) — bf-p key is the source name', () => {
    const errors = bf049(`
      'use client'
      export function Foo({ data: d }: { data: Map<string, number> }) {
        return <button onClick={() => console.log(d)}>go</button>
      }
    `)
    expect(errors).toHaveLength(1)
    expect(errors[0].message).toContain("Prop 'd'")
  })

  test('optional Map prop (Map<...> | undefined) still resolves via stripUnion', () => {
    const errors = bf049(`
      'use client'
      export function Foo({ data }: { data?: Map<string, number> }) {
        return <button onClick={() => console.log(data)}>go</button>
      }
    `)
    expect(errors).toHaveLength(1)
  })

  test('RegExp prop client-read fires (loses data on JSON round-trip, not merely "degrades to something")', () => {
    const errors = bf049(`
      'use client'
      export function Foo({ pattern }: { pattern: RegExp }) {
        return <button onClick={() => console.log(pattern.test('x'))}>go</button>
      }
    `)
    expect(errors).toHaveLength(1)
  })

  test('Function-typed (object-form) prop client-read fires', () => {
    const errors = bf049(`
      'use client'
      export function Foo({ cb }: { cb: Function }) {
        return <button onClick={() => cb()}>go</button>
      }
    `)
    expect(errors).toHaveLength(1)
  })
})

describe('rich-type prop serialization refusal — silent (no BF049)', () => {
  test('Map prop never read by client code (server-only component)', () => {
    const errors = bf049(`
      export function Foo({ data }: { data: Map<string, number> }) {
        return <div>hi</div>
      }
    `)
    expect(errors).toHaveLength(0)
  })

  test('Map prop declared but unused by the client init', () => {
    const errors = bf049(`
      'use client'
      export function Foo({ data, label }: { data: Map<string, number>; label: string }) {
        return <button onClick={() => console.log(label)}>go</button>
      }
    `)
    expect(errors).toHaveLength(0)
  })

  test('Date prop client-read is silent — Date is JSON-revivable, not JSON-unsafe', () => {
    const errors = bf049(`
      'use client'
      export function Foo({ createdAt }: { createdAt: Date }) {
        return <button onClick={() => console.log(createdAt)}>go</button>
      }
    `)
    expect(errors).toHaveLength(0)
  })

  test('URL prop client-read is silent — same revivable-subset exemption', () => {
    const errors = bf049(`
      'use client'
      export function Foo({ href }: { href: URL }) {
        return <button onClick={() => console.log(href)}>go</button>
      }
    `)
    expect(errors).toHaveLength(0)
  })

  test('two-arm union (RegExp | string) is silent — the InputOTP pattern-prop shape', () => {
    const errors = bf049(`
      'use client'
      export function Foo({ pattern }: { pattern: RegExp | string }) {
        return <button onClick={() => console.log(pattern)}>go</button>
      }
    `)
    expect(errors).toHaveLength(0)
  })

  test('in-file interface Map shadow', () => {
    const errors = bf049(`
      'use client'
      interface Map { iso: string }
      export function Foo({ data }: { data: Map }) {
        return <button onClick={() => console.log(data)}>go</button>
      }
    `)
    expect(errors).toHaveLength(0)
  })

  test('on-prefixed prop (a function prop) is silent — excluded from serialization entirely', () => {
    const errors = bf049(`
      'use client'
      export function Foo({ onGo }: { onGo: () => void }) {
        return <button onClick={onGo}>go</button>
      }
    `)
    expect(errors).toHaveLength(0)
  })

  test('plain string/number/array props are silent', () => {
    const errors = bf049(`
      'use client'
      export function Foo({ label, count, items }: { label: string; count: number; items: string[] }) {
        return <button onClick={() => console.log(label, count, items)}>go</button>
      }
    `)
    expect(errors).toHaveLength(0)
  })

  test('a local type alias of a rich type is a conservative miss (documented, covered by the runtime backstop)', () => {
    const errors = bf049(`
      'use client'
      type RichMap = Map<string, number>
      export function Foo({ data }: { data: RichMap }) {
        return <button onClick={() => console.log(data)}>go</button>
      }
    `)
    expect(errors).toHaveLength(0)
  })
})
