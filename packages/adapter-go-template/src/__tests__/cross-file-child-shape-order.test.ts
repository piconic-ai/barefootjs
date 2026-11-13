/**
 * A parent's Go output must not depend on which of a build's files compiled
 * first (#3753).
 *
 * `@barefootjs/vite` compiles every discovered component onto ONE adapter,
 * in file-name order, with real absolute paths and no shape pre-pass. This
 * compiles files on disk the same way, in every order, and compares each
 * file's output. Before the fix, `<CheckIcon data-slot=...>` lost its
 * `data-slot` whenever `icon.tsx` compiled after its parent (always, for an
 * icon file declaring one component), and a parent wrote a child's Input
 * field through `bf.Coerce` or not depending on the order.
 */
import { afterAll, describe, expect, test } from 'bun:test'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { compileJSX } from '@barefootjs/jsx'
import { GoTemplateAdapter } from '../adapter/go-template-adapter'

const root = mkdtempSync(join(tmpdir(), 'bf-go-shape-order-'))
afterAll(() => rmSync(root, { recursive: true, force: true }))

let projectCount = 0
/** Write `files` (name → source) into a fresh directory; returns name → absolute path. */
function project(files: Record<string, string>): Record<string, string> {
  const dir = join(root, String(projectCount++))
  mkdirSync(dir)
  const paths: Record<string, string> = {}
  for (const [name, source] of Object.entries(files)) {
    paths[name] = join(dir, name)
    writeFileSync(paths[name], source)
  }
  return paths
}

/** Template, types and diagnostics of every file, compiled in `order` on one adapter. */
function compileInOrder(files: Record<string, string>, paths: Record<string, string>, order: string[]): Record<string, string> {
  const adapter = new GoTemplateAdapter()
  const out: Record<string, string> = {}
  for (const name of order) {
    const result = compileJSX(files[name], paths[name], { adapter, siblingTemplatesRegistered: true })
    const emitted = result.files.filter(f => f.type === 'markedTemplate' || f.type === 'types').map(f => f.content)
    // A random scope-id suffix differs from run to run.
    out[name] = [...emitted, ...result.errors.map(e => `${e.code} ${e.message}`)].join('\n').replace(/_[A-Za-z0-9]{6}"/g, '_RAND"')
  }
  return out
}

function permutations<T>(items: T[]): T[][] {
  if (items.length <= 1) return [items]
  return items.flatMap((item, i) => permutations([...items.slice(0, i), ...items.slice(i + 1)]).map(rest => [item, ...rest]))
}

/** Compile `files` in every order; assert each file's output is the same, and return it. */
function expectOrderIndependent(files: Record<string, string>): Record<string, string> {
  const paths = project(files)
  const [first, ...rest] = permutations(Object.keys(files)).map(order => compileInOrder(files, paths, order))
  for (const other of rest) expect(other).toEqual(first)
  return first
}

const box = `
import { CheckIcon } from './icon'
export function Box() {
  return <span><CheckIcon data-slot="indicator" /></span>
}
`
const checkIcon = `
type IconProps = { size?: string; [key: string]: unknown }
export function CheckIcon({ size, ...props }: IconProps) {
  return <svg data-size={size} {...props}><path d="M0" /></svg>
}
`
const plusIcon = `
export function PlusIcon({ size, ...props }: { size?: string; [key: string]: unknown }) {
  return <svg data-size={size} {...props}><path d="M1" /></svg>
}
`

describe('a cross-file child shape does not depend on compile order (#3753)', () => {
  test('an attribute a child collects in its rest bag reaches the bag, from a one-component file', () => {
    const out = expectOrderIndependent({ 'box.tsx': box, 'icon.tsx': checkIcon })
    expect(out['box.tsx']).toContain('Props: map[string]any{"data-slot": "indicator"},')
  })

  test('an attribute a child collects in its rest bag reaches the bag, from a two-component file', () => {
    const out = expectOrderIndependent({ 'box.tsx': box, 'icon.tsx': checkIcon + plusIcon })
    expect(out['box.tsx']).toContain('Props: map[string]any{"data-slot": "indicator"},')
  })

  test('a props spread forwarded through a middle child compiles the same in every order', () => {
    const out = expectOrderIndependent({
      'root.tsx': `
import { Mid } from './mid'
export function Root(props: { label?: string | null; tone?: string }) {
  return <div><Mid {...props} /></div>
}
`,
      'mid.tsx': `
import { Tag } from './tag'
export function Mid(props: { label?: string | null; tone?: string }) {
  return <p><Tag label="first" {...props} /></p>
}
`,
      'tag.tsx': `
export function Tag(props: { label?: string | null; tone?: string }) {
  return <b data-tone={props.tone}>{props.label ?? 'fallback'}</b>
}
`,
    })
    for (const name of ['root.tsx', 'mid.tsx', 'tag.tsx']) expect(out[name]).not.toContain('BF101')
    expect(out['mid.tsx']).toContain('if input.Label.Passed() { return input.Label }; return "first"')
  })

  test('a plain child field is written as it is in every order', () => {
    const out = expectOrderIndependent({
      'middle.tsx': `
import { Leaf } from './leaf'
export function Middle(props: { label: string }) {
  return <div><Leaf text={props.label} /></div>
}
`,
      'leaf.tsx': `
export function Leaf(props: { text: string }) {
  return <span>{props.text}</span>
}
`,
    })
    expect(out['middle.tsx']).toContain('Text: in.Label,')
  })

  test('a parent compiled again reads the child as it is now, not as it was first read', () => {
    const files = { 'box.tsx': box, 'icon.tsx': checkIcon }
    const paths = project(files)
    const adapter = new GoTemplateAdapter()
    const compileBox = () =>
      compileJSX(box, paths['box.tsx'], { adapter, siblingTemplatesRegistered: true }).files.find(f => f.type === 'types')?.content ?? ''
    expect(compileBox()).toContain('"data-slot": "indicator"')
    // The child no longer collects undeclared props.
    writeFileSync(paths['icon.tsx'], `
export function CheckIcon({ size }: { size?: string }) {
  return <svg data-size={size}><path d="M0" /></svg>
}
`)
    expect(compileBox()).not.toContain('"data-slot": "indicator"')
  })

  test("reading a child's shape keeps the parent's private-component registry keys file-scoped", () => {
    // The parent's non-exported `Helper` is registered under a file-scoped
    // key. Reading `icon.tsx` from inside the parent's `generate()` compiles
    // that file; the parent's client JS, emitted afterwards, must still see
    // the parent's scope, whether the child's shape is cached or not.
    const files = {
      'icon.tsx': `'use client'\nexport function Icon() { return <svg /> }\n`,
      'page.tsx': `'use client'
import { Icon } from './icon'
function Helper() { return <b>private</b> }
export function Page() { return <div><Helper /><Icon /></div> }
`,
    }
    const paths = project(files)
    const adapter = new GoTemplateAdapter()
    const clientJs = () => {
      const result = compileJSX(files['page.tsx'], paths['page.tsx'], { adapter, siblingTemplatesRegistered: true })
      expect(result.errors).toEqual([])
      return result.files.filter(f => f.type === 'clientJs').map(f => f.content).join('\n')
    }
    const cold = clientJs()
    const warm = clientJs()
    expect(cold).toBe(warm)
    expect(cold).toContain('Helper__')
    expect(cold).not.toContain("hydrate('Helper',")
    expect(cold).not.toContain("renderChild('Helper',")
  })
})
