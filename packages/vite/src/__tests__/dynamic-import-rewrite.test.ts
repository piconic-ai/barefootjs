/**
 * Regression (#2588): a relative specifier inside a DYNAMIC `import()` must
 * be re-anchored to the emitted template's directory, exactly like the
 * static `import` statements `rewriteImportsForTemplate` already handles.
 *
 * Dynamic imports never reach `ir.metadata.templateImports` — they ride
 * along inside declaration source text that the adapter re-emits verbatim
 * (`generateModuleScopeDeclarations`' consts/functions, and a component
 * body's local handlers). Before the fix they were emitted untouched, so a
 * specifier written relative to `components/` still said `../lib/heavy`
 * once the template landed in `app/dist/components/` — a path that does
 * not exist. The backend bundler then hard-fails (`Could not resolve
 * "../lib/heavy"`), so this is a build break, not a type-only defect.
 *
 * The fixture mirrors the layout that hits this in the wild (piconic-ai/koma):
 * a `components` dir and a plain `lib` dir side by side, with templates
 * emitted to a DEEPER directory — root-relative and template-relative only
 * diverge when the two depths differ, so a flat layout would not reproduce.
 * Lives under `packages/vite/` (not a system tmpdir) so `@barefootjs/client`
 * resolves through the monorepo's real workspace symlinks — same reason
 * `e2e-fixture`/`e2e-fixture-dev`/`e2e-fixture-relimport` do.
 */
import { describe, test, expect, afterAll } from 'bun:test'
import { build } from 'vite'
import { mkdtemp, rm, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { HonoAdapter } from '@barefootjs/hono/adapter'
import { barefoot } from '../plugin.ts'

const FIXTURE_ROOT = resolve(import.meta.dirname, '../../e2e-fixture-dynimport')
const APP_ROOT = join(FIXTURE_ROOT, 'app')
const COMPONENTS_DIR = join(FIXTURE_ROOT, 'components')

// `app/dist/components/Lazy.tsx` → up three → the fixture root, where `lib/`
// sits. The source says `../lib/heavy` from `components/`; the emitted
// template has to say this instead.
const REANCHORED = '../../../lib/heavy'

describe('dynamic import() re-anchoring in emitted templates', () => {
  let outDir: string
  let templatesDir: string

  afterAll(async () => {
    await rm(outDir, { recursive: true, force: true })
    await rm(join(APP_ROOT, 'dist'), { recursive: true, force: true })
  })

  test('re-anchors dynamic imports at module scope, in type position, and inside a component body', async () => {
    outDir = await mkdtemp(join(tmpdir(), 'barefoot-vite-dynimport-dist-'))
    templatesDir = join(APP_ROOT, 'dist/components')

    await build({
      configFile: false,
      root: APP_ROOT,
      base: '/static/',
      logLevel: 'warn',
      build: { outDir, emptyOutDir: true },
      plugins: [
        barefoot({
          adapter: new HonoAdapter(),
          components: [COMPONENTS_DIR],
          templates: templatesDir,
        }),
      ],
    })

    const template = await readFile(join(templatesDir, 'Lazy.tsx'), 'utf8')

    // Nothing anywhere may still carry the source-relative form. Asserted
    // first and globally: a per-site check would pass while some fourth
    // emission path silently leaked the old specifier.
    expect(template).not.toContain("'../lib/heavy'")

    // Module scope, TYPE position — `typeof import('…')` is an
    // ImportTypeNode, a different AST node from the call expression below,
    // and was missed independently.
    expect(template).toContain(`typeof import('${REANCHORED}')`)

    // Module scope, VALUE position — inside a re-emitted const's body.
    expect(template).toContain(`modPromise = import('${REANCHORED}')`)

    // Component scope — inside a local handler in the component body,
    // which is emitted by a different code path than module declarations.
    expect(template).toContain(`await import('${REANCHORED}')`)

    // The re-anchored path must actually resolve on disk from the emitted
    // template's own directory — the assertions above only pin the string.
    const target = resolve(templatesDir, REANCHORED + '.ts')
    expect(await readFile(target, 'utf8')).toContain('export function heavy')
  }, 60_000)
})
