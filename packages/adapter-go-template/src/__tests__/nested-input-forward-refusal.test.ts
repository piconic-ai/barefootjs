/**
 * A component that forwards a value it receives at template execute time
 * (JSX children, or a JSX-valued prop rendered through a companion define)
 * into a nested child's prop, where the nested child computes state from
 * it, is refused with BF101 (#3986): its constructor builds the nested
 * child's Props before the value arrives. Values delivered at construction
 * (static text, none at all, a static JSX prop) and nested props that feed
 * no constructor-derived field stay as they are.
 */
import { afterAll, describe, expect, test } from 'bun:test'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { compileJSX } from '@barefootjs/jsx'
import { GoTemplateAdapter } from '../adapter/go-template-adapter'

const kid = `
function Kid(props: { seed?: unknown; tone?: string }) {
  const [v] = createSignal(props.seed ?? 'none')
  return <b data-tone={props.tone}>{v() === 'none' ? 'fallback' : 'children'}</b>
}`

const source = (inner: string, call: string) => `
'use client'
import { createSignal, createMemo } from '@barefootjs/client'
${kid}
${inner}
export function C(props: { label: string; items: string[] }) {
  return <div>${call}</div>
}
`

const bf101 = (src: string) =>
  compileJSX(src.trimStart(), 'test.tsx', { adapter: new GoTemplateAdapter() }).errors.filter(e => e.code === 'BF101').map(e => e.message)

const direct = `function Inner(props: { children?: unknown }) {
  return <Kid seed={props.children} />
}`

describe('GoTemplateAdapter - template-time value forwarded into a nested child prop (#3986)', () => {
  test('the issue shape is refused, naming the forwarding call and the derived field', () => {
    const messages = bf101(source(direct, '<Inner>{props.label}</Inner>'))
    expect(messages).toHaveLength(1)
    expect(messages[0]).toContain(`<Inner> passes its children to <Kid>'s 'seed' prop, and <Kid>'s 'v' is computed from it`)
  })

  const refused: Array<[string, string, string]> = [
    ['through a body const', `function Inner(props: { children?: unknown }) {
  const c = props.children
  return <Kid seed={c} />
}`, '<Inner>{props.label}</Inner>'],
    ['through a body destructure', `function Inner(props: { children?: unknown }) {
  const { children } = props
  return <Kid seed={children} />
}`, '<Inner>{props.label}</Inner>'],
    ['from a destructured param', `function Inner({ children }: { children?: unknown }) {
  return <Kid seed={children} />
}`, '<Inner>{props.label}</Inner>'],
    ['with a ?? fallback', `function Inner(props: { children?: unknown }) {
  return <Kid seed={props.children ?? 'x'} />
}`, '<Inner>{props.label}</Inner>'],
    ['markup children', direct, '<Inner><i>{props.label}</i></Inner>'],
    ['a call nested in a loop row', direct, '<ul>{props.items.map((x) => <li key={x}><Inner>{x}</Inner></li>)}</ul>'],
    ['a call that is the loop row', direct, '<ul>{props.items.map((x) => <Inner key={x}>own</Inner>)}</ul>'],
    ['the nested child in a loop row of its own', `function Inner(props: { children?: unknown; items: string[] }) {
  return <ul>{props.items.map((x) => <li key={x}><Kid seed={props.children} /></li>)}</ul>
}`, '<Inner items={props.items}>{props.label}</Inner>'],
    ['the nested child under a condition', `function Inner(props: { children?: unknown }) {
  return <p>{props.children ? <Kid seed={props.children} /> : <i>no</i>}</p>
}`, '<Inner>{props.label}</Inner>'],
    ['the nested child in another component\'s children', `function Wrap(props: { children?: unknown }) {
  return <section>{props.children}</section>
}
function Inner(props: { children?: unknown }) {
  return <Wrap><Kid seed={props.children} /></Wrap>
}`, '<Inner>{props.label}</Inner>'],
    ['forwarded on through a second component', `function Mid(props: { seed?: unknown }) {
  return <Kid seed={props.seed} />
}
function Inner(props: { children?: unknown }) {
  return <Mid seed={props.children} />
}`, '<Inner>{props.label}</Inner>'],
    ['a JSX-valued named prop', `function Inner(props: { header?: unknown }) {
  return <Kid seed={props.header} />
}`, '<Inner header={<i>{props.label}</i>} />'],
    ['a static bracket read', `function Inner(props: { children?: unknown }) {
  return <Kid seed={props['children']} />
}`, '<Inner>{props.label}</Inner>'],
    ['a body const read in a loop row whose parameter shadows what the const reads', `function Inner({ children, items }: { children?: unknown; items: string[] }) {
  const captured = children
  return <ul>{items.map((children) => <li key={children}><Kid seed={captured} /></li>)}</ul>
}`, '<Inner items={props.items}>{props.label}</Inner>'],
    ['ten forwarding components in a row', `function Hop1(props: { seed?: unknown }) {\n  return <Hop2 seed={props.seed} />\n}\nfunction Hop2(props: { seed?: unknown }) {\n  return <Hop3 seed={props.seed} />\n}\nfunction Hop3(props: { seed?: unknown }) {\n  return <Hop4 seed={props.seed} />\n}\nfunction Hop4(props: { seed?: unknown }) {\n  return <Hop5 seed={props.seed} />\n}\nfunction Hop5(props: { seed?: unknown }) {\n  return <Hop6 seed={props.seed} />\n}\nfunction Hop6(props: { seed?: unknown }) {\n  return <Hop7 seed={props.seed} />\n}\nfunction Hop7(props: { seed?: unknown }) {\n  return <Hop8 seed={props.seed} />\n}\nfunction Hop8(props: { seed?: unknown }) {\n  return <Hop9 seed={props.seed} />\n}\nfunction Hop9(props: { seed?: unknown }) {\n  return <Hop10 seed={props.seed} />\n}\nfunction Hop10(props: { seed?: unknown }) {\n  return <Kid seed={props.seed} />\n}
function Inner(props: { children?: unknown }) {
  return <Hop1 seed={props.children} />
}`, '<Inner>{props.label}</Inner>'],
    ['a JSX-valued prop a props spread carries', `function Inner(props: { seed?: unknown }) {
  return <Kid {...props} />
}`, '<Inner seed={<i>{props.label}</i>} />'],
    ['children a props spread carries', `function KidC(props: { children?: unknown }) {
  const [v] = createSignal(props.children ?? 'none')
  return <u>{v() === 'none' ? 'fallback' : 'children'}</u>
}
function Inner(props: { children?: unknown }) {
  return <KidC {...props} />
}`, '<Inner>{props.label}</Inner>'],
    ['an explicit writer a spread overrides only when passed, not passed', `function Inner(props: { children?: unknown; seed?: unknown }) {
  return <Kid seed={props.children} {...props} />
}`, '<Inner>{props.label}</Inner>'],
    ['an explicit writer after a props spread', `function Inner(props: { children?: unknown; seed?: unknown }) {
  return <Kid {...props} seed={props.children} />
}`, '<Inner seed="x">{props.label}</Inner>'],
  ]
  for (const [name, inner, call] of refused) {
    test(`refused: ${name}`, () => {
      expect(bf101(source(inner, call))).toHaveLength(1)
    })
  }

  test('a value forwarded on through a second component names the field it reaches', () => {
    const [message] = bf101(source(refused.find(r => r[0] === 'forwarded on through a second component')![1], '<Inner>{props.label}</Inner>'))
    expect(message).toContain(`<Inner> passes its children to <Mid>'s 'seed' prop, and <Kid>'s 'v' is computed from it`)
  })

  const delivered: Array<[string, string, string]> = [
    ['static text children', direct, '<Inner>own</Inner>'],
    ['no children', direct, '<Inner />'],
    ['static markup children', direct, '<Inner><i>own</i></Inner>'],
    ['static children of a call nested in a loop row', direct, '<ul>{props.items.map((x) => <li key={x}><Inner>own</Inner></li>)}</ul>'],
    ['a static JSX-valued named prop', `function Inner(props: { header?: unknown }) {
  return <Kid seed={props.header} />
}`, '<Inner header={<i>own</i>} />'],
    ['a loop row binding that shadows the prop', `function Inner({ children, items }: { children?: unknown; items: string[] }) {
  return <ul>{items.map((children) => <li key={children}><Kid seed={children} /></li>)}</ul>
}`, '<Inner items={props.items}>{props.label}</Inner>'],
    ['a nested prop no derived field reads', `function Inner(props: { children?: unknown }) {
  return <Kid tone={props.children} />
}`, '<Inner>{props.label}</Inner>'],
    ['a client-only nested prop', `function Inner(props: { children?: unknown }) {
  return <Kid seed={/* @client */ props.children} />
}`, '<Inner>{props.label}</Inner>'],
    ['static children through a static bracket read', `function Inner(props: { children?: unknown }) {
  return <Kid seed={props['children']} />
}`, '<Inner>own</Inner>'],
    ['a loop row binding that shadows the body const', `function Inner({ children, items }: { children?: unknown; items: string[] }) {
  const captured = children
  return <ul>{items.map((captured) => <li key={captured}><Kid seed={captured} /></li>)}</ul>
}`, '<Inner items={props.items}>{props.label}</Inner>'],
    ['an explicit writer a spread of a required param replaces', `function Inner(props: { children?: unknown; seed: unknown }) {
  return <Kid seed={props.children} {...props} />
}`, '<Inner seed="x">{props.label}</Inner>'],
    ['an explicit writer a spread overrides when passed, passed', `function Inner(props: { children?: unknown; seed?: unknown }) {
  return <Kid seed={props.children} {...props} />
}`, '<Inner seed="x">{props.label}</Inner>'],
    ['a static JSX-valued prop a props spread carries', `function Inner(props: { seed?: unknown }) {
  return <Kid {...props} />
}`, '<Inner seed={<i>own</i>} />'],
  ]
  for (const [name, inner, call] of delivered) {
    test(`not refused: ${name}`, () => {
      expect(bf101(source(inner, call))).toEqual([])
    })
  }
})

const mid = `
function Mid(props: { forwarded?: unknown; seed?: unknown }) {
  return <Kid seed={props.forwarded} {...props} />
}`

describe('a fallback a props spread overrides only when passed (#3986 review)', () => {
  const twoCalls = (first: string, second: string) => source(`${mid}
function Inner(props: { children?: unknown }) {
  return <p>${first}${second}</p>
}`, '<Inner>{props.label}</Inner>')
  const overriding = '<Mid forwarded={props.children} seed="override" />'
  const falling = '<Mid forwarded={props.children} />'

  test('a call that falls back is refused after a call that overrides', () => {
    expect(bf101(twoCalls(overriding, falling))).toHaveLength(1)
  })
  test('a call that falls back is refused before a call that overrides', () => {
    expect(bf101(twoCalls(falling, overriding))).toHaveLength(1)
  })
  test('a call that always overrides is not refused', () => {
    expect(bf101(twoCalls(overriding, ''))).toEqual([])
  })

  const spreadCall = (callerProps: string) => `
'use client'
import { createSignal } from '@barefootjs/client'
${kid}
${mid}
export function C(props: ${callerProps}) {
  return <div><Mid {...props} forwarded={<i>{props.label}</i>} /></div>
}
`
  test('a spread that does not carry the overriding key is refused', () => {
    expect(bf101(spreadCall('{ label: string }'))).toHaveLength(1)
  })
  test('a spread of an optional overriding param is refused: it may omit it', () => {
    expect(bf101(spreadCall('{ label: string; seed?: string }'))).toHaveLength(1)
  })
  test('a spread of a required overriding param is not refused', () => {
    expect(bf101(spreadCall('{ label: string; seed: string }'))).toEqual([])
  })
  test('an explicit overriding prop is not refused', () => {
    const src = spreadCall('{ label: string }').replace('<Mid {...props} forwarded={<i>{props.label}</i>} />', '<Mid forwarded={<i>{props.label}</i>} seed="x" />')
    expect(bf101(src)).toEqual([])
  })
})

describe('a key a spread carries from an optional param, through each hop (#3986 review)', () => {
  const spreader = `function Spreader(props: { children?: unknown; seed?: unknown }) {
  return <Mid {...props} forwarded={props.children} />
}`
  const src = (extra: string, call: string, callerProps = '{ label: string }') => `
'use client'
import { createSignal } from '@barefootjs/client'
${kid}
${mid}
${spreader}
${extra}
export function C(props: ${callerProps}) {
  return <div>${call}</div>
}
`
  const viaSpread = `function Outer(props: { children?: unknown; seed?: unknown }) {
  return <Spreader {...props} />
}`
  const cases: Array<[string, string, string, number, string?]> = [
    ['an explicit override the spread carries on', '', '<Spreader seed="override">{props.label}</Spreader>', 0],
    ['the override omitted', '', '<Spreader>{props.label}</Spreader>', 1],
    ['an explicit override carried through two spreads', viaSpread, '<Outer seed="override">{props.label}</Outer>', 0],
    ['the override omitted through two spreads', viaSpread, '<Outer>{props.label}</Outer>', 1],
    ['an override written on the second hop only', `function Outer(props: { children?: unknown }) {
  return <Spreader seed="o2">{props.children}</Spreader>
}`, '<Outer>{props.label}</Outer>', 0],
    ['an override the first hop drops', `function Outer(props: { children?: unknown; seed?: unknown }) {
  return <Spreader>{props.children}</Spreader>
}`, '<Outer seed="override">{props.label}</Outer>', 1],
    ['a spread of a required caller param', '', '<Spreader {...props}>{props.label}</Spreader>', 0, '{ label: string; seed: string }'],
    // Whether C's own caller passes the optional seed is unknown when C compiles.
    ['a spread of an optional caller param', '', '<Spreader {...props}>{props.label}</Spreader>', 1, '{ label: string; seed?: string }'],
  ]
  for (const [name, extra, call, count, callerProps] of cases) {
    test(`${count ? 'refused' : 'not refused'}: ${name}`, () => {
      expect(bf101(src(extra, call, callerProps))).toHaveLength(count)
    })
  }
})

const root = mkdtempSync(join(tmpdir(), 'bf-go-nested-forward-'))
afterAll(() => rmSync(root, { recursive: true, force: true }))

describe('the refusal does not depend on compile order across files (#3986)', () => {
  const files: Record<string, string> = {
    'c.tsx': `
'use client'
import { Inner } from './inner'
export function C(props: { label: string }) {
  return <Inner>{props.label}</Inner>
}
`,
    'inner.tsx': `
'use client'
import { Kid } from './kid'
export function Inner(props: { children?: unknown }) {
  return <Kid seed={props.children} />
}
`,
    'kid.tsx': `
'use client'
import { createSignal } from '@barefootjs/client'
export function Kid(props: { seed?: unknown }) {
  const [v] = createSignal(props.seed ?? 'none')
  return <b>{v() === 'none' ? 'fallback' : 'children'}</b>
}
`,
  }
  const paths = Object.fromEntries(Object.keys(files).map(name => [name, join(root, name)]))
  mkdirSync(root, { recursive: true })
  for (const [name, src] of Object.entries(files)) writeFileSync(paths[name], src)
  const orders = [
    ['c.tsx', 'inner.tsx', 'kid.tsx'],
    ['kid.tsx', 'inner.tsx', 'c.tsx'],
    ['inner.tsx', 'c.tsx', 'kid.tsx'],
  ]
  for (const order of orders) {
    test(`compiled as ${order.join(', ')}`, () => {
      const adapter = new GoTemplateAdapter()
      const refusedIn: string[] = []
      for (const name of order) {
        const result = compileJSX(files[name], paths[name], { adapter, siblingTemplatesRegistered: true })
        if (result.errors.some(e => e.code === 'BF101')) refusedIn.push(name)
      }
      expect(refusedIn).toEqual(['c.tsx'])
    })
  }
})
