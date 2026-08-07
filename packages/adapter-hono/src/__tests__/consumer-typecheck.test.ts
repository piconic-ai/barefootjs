/**
 * Type-check a CONSUMER program that imports a compiled template — the
 * coverage gap behind both #2559 and #2565: nothing in-repo ever ran tsc
 * over a program shaped like a consumer app, so type-level defects in the
 * emitted `.tsx` shipped invisibly (both were found by downstream apps
 * migrating their BarefootJS version).
 *
 * Each case compiles a real `'use client'` component, writes the emitted
 * template plus a scaffold-shaped `server.tsx` that renders the island,
 * and type-checks the pair with the scaffold's own options (`strict`,
 * `jsxImportSource: '@barefootjs/hono/jsx'`).
 */
import { describe, expect, test } from 'bun:test'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import ts from 'typescript'
import { compileJSX } from '@barefootjs/jsx'
import { HonoAdapter } from '../adapter/index.ts'

const HERE = resolve(import.meta.dir)

interface Diagnostic {
  code: number
  file: string
  message: string
}

/**
 * Write `template` as `components/<name>.tsx` alongside `server.tsx` and
 * run tsc over the pair, returning the flattened diagnostics.
 *
 * The temp dir lives INSIDE the package so module resolution reaches the
 * workspace's node_modules (hono, @barefootjs/*) exactly like a
 * scaffolded app's.
 */
function typeCheckConsumer(name: string, template: string, server: string): Diagnostic[] {
  const tmp = mkdtempSync(join(HERE, '.consumer-typecheck-'))
  try {
    mkdirSync(join(tmp, 'components'), { recursive: true })
    writeFileSync(join(tmp, 'components', `${name}.tsx`), template)
    writeFileSync(join(tmp, 'server.tsx'), server)

    const program = ts.createProgram(
      [join(tmp, 'server.tsx')],
      {
        strict: true,
        noEmit: true,
        target: ts.ScriptTarget.ESNext,
        module: ts.ModuleKind.ESNext,
        moduleResolution: ts.ModuleResolutionKind.Bundler,
        jsx: ts.JsxEmit.ReactJSX,
        jsxImportSource: '@barefootjs/hono/jsx',
        lib: ['lib.esnext.d.ts', 'lib.dom.d.ts'],
        allowImportingTsExtensions: true,
        // Consumer apps skipLibCheck too; the errors these tests pin fire
        // in OUR files regardless.
        skipLibCheck: true,
      },
    )
    return ts.getPreEmitDiagnostics(program).map(d => ({
      code: d.code,
      file: d.file?.fileName.replace(tmp, '') ?? '',
      message: ts.flattenDiagnosticMessageText(d.messageText, ' '),
    }))
  } finally {
    rmSync(tmp, { recursive: true, force: true })
  }
}

const COMPONENT_SOURCE = `"use client"

import { createSignal } from '@barefootjs/client'

export function Counter() {
  const [count, setCount] = createSignal(0)
  return <button onClick={() => setCount(count() + 1)}>{count()}</button>
}
`

const SERVER_SOURCE = `import { Counter } from './components/Counter.tsx'

export function Page() {
  return (
    <div>
      <Counter />
    </div>
  )
}
`

/**
 * #2565's shape: a module-level `as const` record indexed with a
 * narrowing assertion (`strokePaths[name as keyof typeof strokePaths]`),
 * where the prop's union is DELIBERATELY wider than the record's keys —
 * `'github' | 'search'` are handled by earlier early-returns and have no
 * entry in `strokePaths`. That width is the whole point: the compiler
 * folds the record's cases into the JSX binding, and the assertion that
 * made the source type-check is type-stripped out of the IR's index
 * expression, so the inlined literal ends up indexed by the full union.
 *
 * `IconName` is spelled as an explicit literal union rather than the
 * source component's `keyof typeof strokePaths | …` on purpose: the
 * emitted template localises `strokePaths` into the component body, so a
 * module-level alias referring to it would fail TS2304 and widen
 * `keyof typeof` to `string | number | symbol`, masking the TS7053 this
 * test exists to pin.
 */
const ICON_SOURCE = `"use client"

const strokePaths = {
  'check': 'M20 6 9 17l-5-5',
  'chevron-down': 'm6 9 6 6 6-6',
} as const

export type IconName = 'check' | 'chevron-down' | 'github' | 'search'

export function Icon({ name }: { name: IconName }) {
  if (name === 'github') {
    return <span>gh</span>
  }
  if (name === 'search') {
    return <span>search</span>
  }
  const path = strokePaths[name as keyof typeof strokePaths]
  if (!path) {
    return null
  }
  return <svg viewBox="0 0 24 24"><path d={path} /></svg>
}
`

const ICON_SERVER_SOURCE = `import { Icon } from './components/Icon.tsx'

export function Page() {
  return (
    <div>
      <Icon name="check" />
    </div>
  )
}
`

/**
 * The same defect through the OTHER emit path: a component-prop `template`
 * is collapsed to a neutral JS expression at IR construction time, so it
 * bypasses the adapter's template-parts renderer. Both positions —
 * intrinsic attr and component prop — carry the record lookup here, and
 * `size` is never narrowed, so every case of `Size` reaches the index.
 */
const BOX_SOURCE = `"use client"

const sizeClasses = { sm: 'h-4', md: 'h-6' } as const

export type Size = 'sm' | 'md' | 'lg'

function Inner({ className }: { className: string }) {
  return <span className={className} />
}

export function Box({ size }: { size: Size }) {
  const cls = sizeClasses[size as keyof typeof sizeClasses]
  return <div className={cls}><Inner className={cls} /></div>
}
`

const BOX_SERVER_SOURCE = `import { Box } from './components/Box.tsx'

export function Page() {
  return (
    <div>
      <Box size="sm" />
    </div>
  )
}
`

describe('consumer program type-check', () => {
  test('a compiled template used as a JSX component type-checks clean (#2559)', () => {
    const result = compileJSX(COMPONENT_SOURCE, '/virtual/Counter.tsx', {
      adapter: new HonoAdapter(),
      // Non-empty so the emitted template's component body returns
      // wrapWithInlineScripts(...) — the #2559 shape.
      scriptAssets: ['/static/components/assets/Counter.js'],
    })
    expect(result.errors.filter(e => e.severity === 'error')).toEqual([])
    const template = result.files.find(f => f.type === 'markedTemplate')?.content
    expect(template).toContain('wrapWithInlineScripts(')

    const diagnostics = typeCheckConsumer('Counter', template!, SERVER_SOURCE)

    // TS2786 = "'X' cannot be used as a JSX component." — the #2559
    // failure. Assert none anywhere in the consumer program.
    expect(diagnostics.filter(d => d.code === 2786)).toEqual([])
  })

  test('an inlined-const index does not re-expose an unnarrowed key (#2565)', () => {
    const result = compileJSX(ICON_SOURCE, '/virtual/Icon.tsx', {
      adapter: new HonoAdapter(),
    })
    expect(result.errors.filter(e => e.severity === 'error')).toEqual([])
    const template = result.files.find(f => f.type === 'markedTemplate')?.content

    // The record's cases really are folded into the binding (if this ever
    // stops holding, the type-check below would pass vacuously).
    expect(template).toContain('"chevron-down": "m6 9 6 6 6-6"')
    expect(template).toContain('as Record<string, string>)[name]')

    const diagnostics = typeCheckConsumer('Icon', template!, ICON_SERVER_SOURCE)

    // TS7053 = "Element implicitly has an 'any' type because expression of
    // type 'IconName' can't be used to index type '{ check: string; … }'".
    expect(diagnostics.filter(d => d.code === 7053)).toEqual([])
    // The whole emitted template is clean for this shape — no error was
    // merely traded for a different one (e.g. TS2538 on the index type).
    expect(diagnostics).toEqual([])
  })

  test('a collapsed component-prop lookup is annotated too (#2565)', () => {
    const result = compileJSX(BOX_SOURCE, '/virtual/Box.tsx', {
      adapter: new HonoAdapter(),
    })
    expect(result.errors.filter(e => e.severity === 'error')).toEqual([])
    const template = result.files.find(f => f.type === 'markedTemplate')?.content

    // Both emit paths reach the annotation: the intrinsic `<div className>`
    // via the template-parts renderer, and the `<Inner className>` prop via
    // the IR-time collapse that `expressionValueToJs` re-renders.
    expect(template!.match(/as Record<string, string>/g)).toHaveLength(2)

    const diagnostics = typeCheckConsumer('Box', template!, BOX_SERVER_SOURCE)

    // Without the annotation TS reports TS2339 here (it distributes the
    // `Size` union over the literal and finds no `lg`); the attribute-only
    // fix left this one behind.
    expect(diagnostics).toEqual([])
  })
})
