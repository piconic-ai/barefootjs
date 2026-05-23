/**
 * BF003 — Client component importing server component.
 *
 * A `"use client"` file cannot import a JSX-rendered binding from a file
 * that lacks the `"use client"` directive. Hydration-marker emission and
 * server-knowledge isolation both depend on the one-way directionality
 * (#1501).
 */

import { describe, test, expect, beforeAll, afterAll } from 'bun:test'
import { mkdtempSync, writeFileSync, rmSync, mkdirSync } from 'fs'
import { tmpdir } from 'os'
import path from 'path'
import { analyzeComponent } from '../analyzer'
import { ErrorCodes } from '../errors'

let fixtureDir: string

beforeAll(() => {
  fixtureDir = mkdtempSync(path.join(tmpdir(), 'bf003-'))
})

afterAll(() => {
  rmSync(fixtureDir, { recursive: true, force: true })
})

function writeFixture(name: string, content: string): string {
  const p = path.join(fixtureDir, name)
  mkdirSync(path.dirname(p), { recursive: true })
  writeFileSync(p, content, 'utf8')
  return p
}

function bf003Errors(ctx: ReturnType<typeof analyzeComponent>) {
  return ctx.errors.filter(e => e.code === ErrorCodes.CLIENT_IMPORTING_SERVER)
}

describe('BF003 — client importing server component', () => {
  test('fires when a "use client" parent imports a non-"use client" component', () => {
    writeFixture('label.tsx', `
      export function Label({ children }: { children?: unknown }) {
        return <label>{children}</label>
      }
    `)
    const parentPath = writeFixture('contact-form.tsx', `
      'use client'
      import { createSignal } from '@barefootjs/client'
      import { Label } from './label'

      export function ContactForm() {
        const [name, setName] = createSignal('')
        return <Label>{name()}</Label>
      }
    `)
    const ctx = analyzeComponent(
      `'use client'
      import { createSignal } from '@barefootjs/client'
      import { Label } from './label'

      export function ContactForm() {
        const [name, setName] = createSignal('')
        return <Label>{name()}</Label>
      }`,
      parentPath
    )
    const errs = bf003Errors(ctx)
    expect(errs).toHaveLength(1)
    expect(errs[0].message).toContain('Label')
    expect(errs[0].message).toContain('./label')
  })

  test('does NOT fire when the imported file has "use client"', () => {
    writeFixture('badge.tsx', `
      "use client"
      export function Badge({ children }: { children?: unknown }) {
        return <span>{children}</span>
      }
    `)
    const parentPath = writeFixture('use-badge.tsx', `
      'use client'
      import { createSignal } from '@barefootjs/client'
      import { Badge } from './badge'

      export function UseBadge() {
        const [count] = createSignal(0)
        return <Badge>{count()}</Badge>
      }
    `)
    const ctx = analyzeComponent(
      `'use client'
      import { createSignal } from '@barefootjs/client'
      import { Badge } from './badge'

      export function UseBadge() {
        const [count] = createSignal(0)
        return <Badge>{count()}</Badge>
      }`,
      parentPath
    )
    expect(bf003Errors(ctx)).toHaveLength(0)
  })

  test('does NOT fire for type-only imports from a non-"use client" file', () => {
    writeFixture('types.ts', `
      export interface Theme { kind: 'light' | 'dark' }
    `)
    const parentPath = writeFixture('typed-form.tsx', `
      'use client'
      import { createSignal } from '@barefootjs/client'
      import type { Theme } from './types'

      export function TypedForm({ theme }: { theme: Theme }) {
        const [v] = createSignal(theme.kind)
        return <div>{v()}</div>
      }
    `)
    const ctx = analyzeComponent(
      `'use client'
      import { createSignal } from '@barefootjs/client'
      import type { Theme } from './types'

      export function TypedForm({ theme }: { theme: Theme }) {
        const [v] = createSignal(theme.kind)
        return <div>{v()}</div>
      }`,
      parentPath
    )
    expect(bf003Errors(ctx)).toHaveLength(0)
  })

  test('does NOT fire for utility-function imports (binding not used as JSX tag)', () => {
    writeFixture('utils.ts', `
      export function cn(...parts: string[]): string { return parts.join(' ') }
    `)
    const parentPath = writeFixture('use-util.tsx', `
      'use client'
      import { createSignal } from '@barefootjs/client'
      import { cn } from './utils'

      export function UseUtil() {
        const [v] = createSignal('a')
        return <div className={cn('base', v())}>x</div>
      }
    `)
    const ctx = analyzeComponent(
      `'use client'
      import { createSignal } from '@barefootjs/client'
      import { cn } from './utils'

      export function UseUtil() {
        const [v] = createSignal('a')
        return <div className={cn('base', v())}>x</div>
      }`,
      parentPath
    )
    expect(bf003Errors(ctx)).toHaveLength(0)
  })

  test('does NOT fire when the parent itself is not "use client"', () => {
    writeFixture('inner.tsx', `
      export function Inner() {
        return <span>inner</span>
      }
    `)
    const parentPath = writeFixture('server-page.tsx', `
      import { Inner } from './inner'

      export function ServerPage() {
        return <div><Inner /></div>
      }
    `)
    const ctx = analyzeComponent(
      `import { Inner } from './inner'

      export function ServerPage() {
        return <div><Inner /></div>
      }`,
      parentPath
    )
    expect(bf003Errors(ctx)).toHaveLength(0)
  })

  test('resolves to /index.tsx when the import points at a directory', () => {
    writeFixture('panel/index.tsx', `
      export function Panel({ children }: { children?: unknown }) {
        return <section>{children}</section>
      }
    `)
    const parentPath = writeFixture('use-panel.tsx', `
      'use client'
      import { createSignal } from '@barefootjs/client'
      import { Panel } from './panel'

      export function UsePanel() {
        const [v] = createSignal('x')
        return <Panel>{v()}</Panel>
      }
    `)
    const ctx = analyzeComponent(
      `'use client'
      import { createSignal } from '@barefootjs/client'
      import { Panel } from './panel'

      export function UsePanel() {
        const [v] = createSignal('x')
        return <Panel>{v()}</Panel>
      }`,
      parentPath
    )
    const errs = bf003Errors(ctx)
    expect(errs).toHaveLength(1)
    expect(errs[0].message).toContain('Panel')
  })

  test('silently skips npm package imports (no relative path)', () => {
    const parentPath = writeFixture('use-pkg.tsx', `
      'use client'
      import { createSignal } from '@barefootjs/client'
      import { Something } from 'some-npm-package'

      export function UsePkg() {
        const [v] = createSignal(0)
        return <Something>{v()}</Something>
      }
    `)
    const ctx = analyzeComponent(
      `'use client'
      import { createSignal } from '@barefootjs/client'
      import { Something } from 'some-npm-package'

      export function UsePkg() {
        const [v] = createSignal(0)
        return <Something>{v()}</Something>
      }`,
      parentPath
    )
    expect(bf003Errors(ctx)).toHaveLength(0)
  })

  test('resolves an explicit-extension relative import (./foo.tsx)', () => {
    writeFixture('explicit-ext.tsx', `
      "use client"
      export function Explicit({ children }: { children?: unknown }) {
        return <span>{children}</span>
      }
    `)
    const parentPath = writeFixture('use-explicit.tsx', `
      'use client'
      import { createSignal } from '@barefootjs/client'
      import { Explicit } from './explicit-ext.tsx'

      export function UseExplicit() {
        const [v] = createSignal(0)
        return <Explicit>{v()}</Explicit>
      }
    `)
    const ctx = analyzeComponent(
      `'use client'
      import { createSignal } from '@barefootjs/client'
      import { Explicit } from './explicit-ext.tsx'

      export function UseExplicit() {
        const [v] = createSignal(0)
        return <Explicit>{v()}</Explicit>
      }`,
      parentPath
    )
    // Source has "use client" — no BF003 expected. The point of this
    // test is that the resolver actually finds explicit-ext.tsx via
    // the as-is branch, rather than probing `.tsx.tsx` / `.tsx.ts`
    // and silently missing (which would also produce 0 errors but
    // for the wrong reason; the negative-case test below pins it).
    expect(bf003Errors(ctx)).toHaveLength(0)
  })

  test('explicit-extension import to a non-"use client" target still fires', () => {
    writeFixture('explicit-server.tsx', `
      export function ExplicitServer({ children }: { children?: unknown }) {
        return <span>{children}</span>
      }
    `)
    const parentPath = writeFixture('use-explicit-server.tsx', `
      'use client'
      import { createSignal } from '@barefootjs/client'
      import { ExplicitServer } from './explicit-server.tsx'

      export function UseExplicitServer() {
        const [v] = createSignal(0)
        return <ExplicitServer>{v()}</ExplicitServer>
      }
    `)
    const ctx = analyzeComponent(
      `'use client'
      import { createSignal } from '@barefootjs/client'
      import { ExplicitServer } from './explicit-server.tsx'

      export function UseExplicitServer() {
        const [v] = createSignal(0)
        return <ExplicitServer>{v()}</ExplicitServer>
      }`,
      parentPath
    )
    expect(bf003Errors(ctx)).toHaveLength(1)
  })

  test('accepts "use client" placed after a value declaration (analyzer semantics)', () => {
    // The analyzer itself treats any ExpressionStatement of `'use client'`
    // as the directive (BF002 enforces top-of-file placement separately);
    // BF003 must match that semantics or it would fire on files the
    // analyzer would classify as client.
    writeFixture('directive-after-import.tsx', `
      import type { ReactNode } from 'react'
      "use client"
      export function AfterImport({ children }: { children?: ReactNode }) {
        return <span>{children}</span>
      }
    `)
    const parentPath = writeFixture('use-after-import.tsx', `
      'use client'
      import { createSignal } from '@barefootjs/client'
      import { AfterImport } from './directive-after-import'

      export function UseAfterImport() {
        const [v] = createSignal(0)
        return <AfterImport>{v()}</AfterImport>
      }
    `)
    const ctx = analyzeComponent(
      `'use client'
      import { createSignal } from '@barefootjs/client'
      import { AfterImport } from './directive-after-import'

      export function UseAfterImport() {
        const [v] = createSignal(0)
        return <AfterImport>{v()}</AfterImport>
      }`,
      parentPath
    )
    expect(bf003Errors(ctx)).toHaveLength(0)
  })

  test('resolves an extensionless import to a sibling .js file', () => {
    writeFixture('legacy-js.js', `
      "use client"
      export function LegacyJs({ children }) {
        return children
      }
    `)
    const parentPath = writeFixture('use-legacy-js.tsx', `
      'use client'
      import { createSignal } from '@barefootjs/client'
      import { LegacyJs } from './legacy-js'

      export function UseLegacyJs() {
        const [v] = createSignal(0)
        return <LegacyJs>{v()}</LegacyJs>
      }
    `)
    const ctx = analyzeComponent(
      `'use client'
      import { createSignal } from '@barefootjs/client'
      import { LegacyJs } from './legacy-js'

      export function UseLegacyJs() {
        const [v] = createSignal(0)
        return <LegacyJs>{v()}</LegacyJs>
      }`,
      parentPath
    )
    expect(bf003Errors(ctx)).toHaveLength(0)
  })

  test('extensionless import to a non-"use client" .jsx target fires', () => {
    writeFixture('legacy-jsx-server.jsx', `
      export function LegacyJsxServer({ children }) {
        return children
      }
    `)
    const parentPath = writeFixture('use-legacy-jsx-server.tsx', `
      'use client'
      import { createSignal } from '@barefootjs/client'
      import { LegacyJsxServer } from './legacy-jsx-server'

      export function UseLegacyJsxServer() {
        const [v] = createSignal(0)
        return <LegacyJsxServer>{v()}</LegacyJsxServer>
      }
    `)
    const ctx = analyzeComponent(
      `'use client'
      import { createSignal } from '@barefootjs/client'
      import { LegacyJsxServer } from './legacy-jsx-server'

      export function UseLegacyJsxServer() {
        const [v] = createSignal(0)
        return <LegacyJsxServer>{v()}</LegacyJsxServer>
      }`,
      parentPath
    )
    expect(bf003Errors(ctx)).toHaveLength(1)
  })

  test('honors block-comment preamble before "use client"', () => {
    writeFixture('commented.tsx', `
      /**
       * Heavily-documented component.
       * @example <Commented />
       */
      "use client"
      export function Commented() {
        return <span>ok</span>
      }
    `)
    const parentPath = writeFixture('use-commented.tsx', `
      'use client'
      import { createSignal } from '@barefootjs/client'
      import { Commented } from './commented'

      export function UseCommented() {
        const [v] = createSignal(0)
        return <Commented>{v()}</Commented>
      }
    `)
    const ctx = analyzeComponent(
      `'use client'
      import { createSignal } from '@barefootjs/client'
      import { Commented } from './commented'

      export function UseCommented() {
        const [v] = createSignal(0)
        return <Commented>{v()}</Commented>
      }`,
      parentPath
    )
    expect(bf003Errors(ctx)).toHaveLength(0)
  })
})
