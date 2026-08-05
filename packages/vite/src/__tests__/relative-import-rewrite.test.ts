/**
 * Regression: `rewriterFor`'s `outputPathGuess` (`plugin.ts`) MUST mirror
 * `planEmits`'s actual on-disk output location — a same-directory sibling
 * import must stay `./Sibling` after emission, not turn into a phantom
 * `../blog/Sibling`-shaped path.
 *
 * Only an adapter whose templates carry real `import` syntax exercises
 * this at all (`paths.ts`'s `buildRelativeImportRewriter` docstring) — Go/
 * Mojo/etc. templates have no import syntax. `HonoAdapter` is that adapter
 * here (mirrors `integrations/hono`'s real PageShell → Sidekick-shaped
 * `ReaderToolbar` same-directory import).
 *
 * Fixture (`../../e2e-fixture-relimport`) reproduces the bug's precondition
 * exactly: `app/` (the Vite root, empty of components) and `blog/` (a
 * `components` dir that is a SIBLING of root, not a descendant — this
 * monorepo's real layouts, see `plugin.ts`'s `configureServer` docstring).
 * The root-relative guess and the component-dir-relative REAL output path
 * only diverge when a component's dir isn't the root itself — a fixture
 * with `components` under `root` would not reproduce this at all. Lives
 * under `node_modules`-having `packages/vite/` (not a system tmpdir) so
 * `@barefootjs/client` resolves through the monorepo's real workspace
 * symlinks, same reason `e2e-fixture`/`e2e-fixture-dev` do.
 */
import { describe, test, expect, afterAll } from 'bun:test'
import { build } from 'vite'
import { mkdtemp, rm, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { HonoAdapter } from '@barefootjs/hono/adapter'
import { barefoot } from '../plugin.ts'

const FIXTURE_ROOT = resolve(import.meta.dirname, '../../e2e-fixture-relimport')
const APP_ROOT = join(FIXTURE_ROOT, 'app')
const BLOG_DIR = join(FIXTURE_ROOT, 'blog')

describe('rewriteRelativeImport re-anchoring: a components dir outside the Vite root', () => {
  let outDir: string
  let templatesDir: string

  afterAll(async () => {
    await rm(outDir, { recursive: true, force: true })
    await rm(templatesDir, { recursive: true, force: true })
  })

  test('a same-directory sibling import survives emission as `./Sidekick`, not a phantom `../blog/Sidekick`', async () => {
    outDir = await mkdtemp(join(tmpdir(), 'barefoot-vite-relimport-dist-'))
    templatesDir = await mkdtemp(join(tmpdir(), 'barefoot-vite-relimport-views-'))

    await build({
      configFile: false,
      root: APP_ROOT,
      base: '/static/',
      logLevel: 'warn',
      build: { outDir, emptyOutDir: true },
      plugins: [
        barefoot({
          adapter: new HonoAdapter(),
          components: [BLOG_DIR],
          templates: templatesDir,
        }),
      ],
    })

    const template = await readFile(join(templatesDir, 'PageShell.tsx'), 'utf8')
    // The bug re-anchored this to a phantom `../blog/Sidekick`-shaped path
    // (root-relative, guessing the file would land nested under
    // `templatesDir/../blog/`) — but `planEmits` actually flattens every
    // `components` dir's contents directly under `templatesDir`, so
    // `Sidekick.tsx` is a FLAT sibling of `PageShell.tsx`.
    expect(template).toContain("from './Sidekick'")
    expect(template).not.toContain('../blog/Sidekick')
    expect(template).not.toContain('../../blog/Sidekick')

    // Also assert the emitted Sidekick template actually lives where
    // PageShell's rewritten import now points.
    const sidekick = await readFile(join(templatesDir, 'Sidekick.tsx'), 'utf8')
    expect(sidekick).toContain('function Sidekick')
  }, 60_000)
})
