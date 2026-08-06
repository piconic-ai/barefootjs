/**
 * `CorpusProgramManager` (#2537): one shared `ts.Program` across every
 * compile, instead of a ~500-600 ms per-file `ts.createProgram` inside
 * `compileJSX`'s fallback for each type-needing file.
 *
 * The unit half exercises the manager's contract directly (gating,
 * instance reuse, incremental rebuild, in-memory divergence fallback).
 * The plugin half drives `barefoot()`'s hooks against a temp project with
 * a fake `node_modules/@barefootjs/form` and pins the two build-breaking
 * symptoms this exists to fix:
 *
 *   - a Reactive<T>-brand importer compiles through the plugin at all
 *     (BF050 is severity `error` and the plugin throws on error
 *     diagnostics — pre-fix, this file could not build);
 *   - zero per-file Program creations across the whole pass, measured by
 *     the compiler's own `programCreations` counter.
 */
import { describe, test, expect, afterEach } from 'bun:test'
import { mkdtemp, rm, mkdir, writeFile, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  testAdapter,
  enableCompilerInstrumentation,
  disableCompilerInstrumentation,
  resetCompilerCounters,
  getCompilerCounters,
} from '@barefootjs/jsx'
import { CorpusProgramManager } from '../corpus-program.ts'
import { barefoot } from '../plugin.ts'

// Same convention as templates-optional.test.ts: hooks are called
// directly, bypassing Vite's own dispatch/typing.
type AnyPlugin = any

const NEEDING_SOURCE = `export function List(props: { items: string[] }) {
  return <ul>{props.items.map(item => <li key={item}>{item}</li>)}</ul>
}
`

const PLAIN_SOURCE = `export function Greeting() { return <p>Hi</p> }
`

describe('CorpusProgramManager', () => {
  let dir: string

  afterEach(async () => {
    if (dir) await rm(dir, { recursive: true, force: true })
  })

  test('returns undefined for a file that needs no type-based detection', async () => {
    dir = await mkdtemp(join(tmpdir(), 'barefoot-corpus-unit-'))
    const abs = join(dir, 'Greeting.tsx')
    await writeFile(abs, PLAIN_SOURCE)

    const manager = new CorpusProgramManager()
    manager.seed([{ absPath: abs, content: PLAIN_SOURCE }])
    expect(manager.programFor(abs, PLAIN_SOURCE)).toBeUndefined()
  })

  test('seeded needing files share ONE Program instance, reused across calls', async () => {
    dir = await mkdtemp(join(tmpdir(), 'barefoot-corpus-unit-'))
    const a = join(dir, 'A.tsx')
    const b = join(dir, 'B.tsx')
    await writeFile(a, NEEDING_SOURCE)
    await writeFile(b, NEEDING_SOURCE)

    const manager = new CorpusProgramManager()
    manager.seed([
      { absPath: a, content: NEEDING_SOURCE },
      { absPath: b, content: NEEDING_SOURCE },
    ])

    const programA = manager.programFor(a, NEEDING_SOURCE)
    const programB = manager.programFor(b, NEEDING_SOURCE)
    expect(programA).toBeDefined()
    expect(programA).toBe(programB!)
    // Re-seeding an unchanged snapshot keeps the same instance — the dev
    // watcher re-seeds on EVERY pass, so this is what keeps quiet passes
    // free.
    manager.seed([
      { absPath: a, content: NEEDING_SOURCE },
      { absPath: b, content: NEEDING_SOURCE },
    ])
    expect(manager.programFor(a, NEEDING_SOURCE)).toBe(programA!)
  })

  test('a changed file rebuilds the Program and the rebuilt SourceFile carries the new text', async () => {
    dir = await mkdtemp(join(tmpdir(), 'barefoot-corpus-unit-'))
    const abs = join(dir, 'A.tsx')
    await writeFile(abs, NEEDING_SOURCE)

    const manager = new CorpusProgramManager()
    manager.seed([{ absPath: abs, content: NEEDING_SOURCE }])
    const before = manager.programFor(abs, NEEDING_SOURCE)

    const edited = NEEDING_SOURCE.replace('<ul>', '<ol>').replace('</ul>', '</ol>')
    await writeFile(abs, edited)
    const after = manager.programFor(abs, edited)

    expect(after).toBeDefined()
    expect(after).not.toBe(before!)
    expect(after!.getSourceFile(abs)?.text).toBe(edited)
  })

  test('a needing file added after the seed still gets a Program (graph pass reaching a brand-new file)', async () => {
    dir = await mkdtemp(join(tmpdir(), 'barefoot-corpus-unit-'))
    const abs = join(dir, 'Late.tsx')

    const manager = new CorpusProgramManager()
    manager.seed([])
    await writeFile(abs, NEEDING_SOURCE)
    const program = manager.programFor(abs, NEEDING_SOURCE)
    expect(program).toBeDefined()
    expect(program!.getSourceFile(abs)?.text).toBe(NEEDING_SOURCE)
  })

  test('in-memory content diverging from disk falls back to a Program that still matches the in-memory text', async () => {
    dir = await mkdtemp(join(tmpdir(), 'barefoot-corpus-unit-'))
    const abs = join(dir, 'A.tsx')
    await writeFile(abs, NEEDING_SOURCE)

    const manager = new CorpusProgramManager()
    manager.seed([{ absPath: abs, content: NEEDING_SOURCE }])

    // Content the caller holds that is NOT what's on disk — the analyzer
    // discards any Program whose SourceFile text mismatches, so whatever
    // comes back here MUST carry the in-memory text.
    const inMemory = NEEDING_SOURCE + '// trailing edit not yet on disk\n'
    const program = manager.programFor(abs, inMemory)
    expect(program).toBeDefined()
    expect(program!.getSourceFile(abs)?.text).toBe(inMemory)
  })
})

describe('barefoot() with a Reactive<T>-brand component (the BF050 unblock)', () => {
  let dir: string
  let templatesDir: string

  afterEach(async () => {
    disableCompilerInstrumentation()
    if (dir) await rm(dir, { recursive: true, force: true })
    if (templatesDir) await rm(templatesDir, { recursive: true, force: true })
  })

  /**
   * A self-contained fake `@barefootjs/form` — same Reactive<T> brand
   * shape as the real package's types, resolvable from the temp project
   * without depending on a built `packages/form/dist`.
   */
  async function writeFakeFormPackage(root: string): Promise<void> {
    const pkgDir = join(root, 'node_modules/@barefootjs/form')
    await mkdir(pkgDir, { recursive: true })
    await writeFile(
      join(pkgDir, 'package.json'),
      JSON.stringify({ name: '@barefootjs/form', version: '0.0.0', types: 'index.d.ts', main: 'index.js' }),
    )
    await writeFile(
      join(pkgDir, 'index.d.ts'),
      `export type Reactive<T> = T & { readonly __reactive: true };
export interface FormReturn {
  isSubmitting: Reactive<() => boolean>;
  handleSubmit: (e: Event) => Promise<void>;
}
export declare function createForm(opts?: unknown): FormReturn;
`,
    )
    await writeFile(join(pkgDir, 'index.js'), 'export function createForm() { return {} }\n')
  }

  test('builds a form-importing component without BF050, resolves the brand, and creates ZERO per-file Programs', async () => {
    dir = await mkdtemp(join(tmpdir(), 'barefoot-corpus-plugin-'))
    templatesDir = await mkdtemp(join(tmpdir(), 'barefoot-corpus-templates-'))
    await mkdir(join(dir, 'src/components'), { recursive: true })
    await writeFakeFormPackage(dir)

    // Multi-export on purpose: pre-fix, the multi-component path masked
    // BF050 while the single path threw — both shapes must now build.
    await writeFile(
      join(dir, 'src/components/Forms.tsx'),
      `'use client'
import { createForm } from '@barefootjs/form'

export function ProfileForm() {
  const form = createForm()
  return <form onSubmit={form.handleSubmit}><button disabled={form.isSubmitting()}>Save</button></form>
}
`,
    )
    await writeFile(join(dir, 'src/components/SingleForm.tsx'), `'use client'
import { createForm } from '@barefootjs/form'

export function SingleForm() {
  const form = createForm()
  return <form onSubmit={form.handleSubmit}><button disabled={form.isSubmitting()}>Go</button></form>
}
`)
    await writeFile(join(dir, 'src/components/Greeting.tsx'), PLAIN_SOURCE)

    const plugin: AnyPlugin = barefoot({
      adapter: testAdapter,
      components: ['src/components'],
      templates: templatesDir,
    })

    enableCompilerInstrumentation()
    resetCompilerCounters()

    await plugin.config({ root: dir }, { command: 'build', mode: 'production' })
    await plugin.configResolved({ root: dir, base: '/', build: { outDir: 'dist', manifest: true } })

    // Graph pass over the client files, exactly as Rollup would drive it.
    const clientJsByName = new Map<string, string>()
    for (const name of ['Forms.tsx', 'SingleForm.tsx']) {
      const abs = join(dir, 'src/components', name)
      const out = plugin.transform(await readFile(abs, 'utf8'), abs)
      clientJsByName.set(name, out?.code ?? '')
    }

    await mkdir(join(dir, 'dist/.vite'), { recursive: true })
    await writeFile(join(dir, 'dist/.vite/manifest.json'), '{}')
    // Pre-fix this throws `[barefoot] compile failed: ... BF050`.
    await plugin.writeBundle()

    // The brand resolved through the SHARED Program: `form.isSubmitting()`
    // auto-defers (#1638). In the CLIENT bundle that means the hydrate
    // template lambda drops the `disabled` attribute and init wires it
    // instead — neither happens if the brand collapsed to `any` (the
    // regex fallback can't classify a library getter, so the attribute
    // would just render inline). The SSR template is not asserted on:
    // a JSX-runtime adapter's template re-runs the real component code,
    // so it legitimately keeps the live attribute expression.
    for (const clientJs of clientJsByName.values()) {
      expect(clientJs).toMatch(/\.disabled = !!\(form\.isSubmitting\(\)\)/)
      expect(clientJs).not.toMatch(/template:.*disabled/)
    }
    const template = await readFile(join(templatesDir, 'Forms.test.tsx'), 'utf8')
    expect(template).toContain('<button')

    // The whole point: no compile anywhere in either pass fell back to a
    // per-file `ts.createProgram`.
    expect(getCompilerCounters().programCreations).toBe(0)
  })
})
