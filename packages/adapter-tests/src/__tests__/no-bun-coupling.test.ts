/**
 * No-Bun-coupling contract for the published adapter packages.
 *
 * BarefootJS must not force the Bun runtime onto users. A user picks a
 * package manager / runtime (npm + Node, pnpm, yarn, Deno, …) and the
 * adapter they `import` has to work there. So the user-facing source of
 * every *published* adapter package must be free of the Bun-only global
 * API (`Bun.serve`, `Bun.file`, `Bun.spawn`, …) and Bun-only module
 * imports (`from 'bun'` / `'bun:*'`).
 *
 * The one deliberate exception is the `./test-render` helper that some
 * adapters publish (`renderHonoComponent`, `renderGoTemplateComponent`,
 * `renderMojoComponent`). It's a heavyweight integration harness that
 * spawns a real `go` / `perl` toolchain to render a component end-to-end —
 * used by this repo's conformance suite, not by user apps, and not
 * documented for users. It is intentionally written against Bun and is
 * walled off behind the package.json `"bun"` export condition, so a
 * non-bun user can't even resolve it (Node throws
 * ERR_PACKAGE_PATH_NOT_EXPORTED rather than running broken code).
 *
 * This test pins both halves of that contract so the boundary is explicit
 * and regression-proof:
 *   1. every other src file in a published adapter is Bun-free, and
 *   2. where Bun *is* used (`test-render.ts`), the matching export stays
 *      gated to the `"bun"` condition only.
 */
import { describe, test, expect } from 'bun:test'
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs'
import { dirname, join, resolve, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
// HERE = packages/adapter-tests/src/__tests__  →  ../../.. = packages/
const PACKAGES_DIR = resolve(HERE, '../../..')

// Specific Bun method names rather than a bare `Bun.` so a doc comment
// that merely mentions the API (e.g. go-template/build.ts's "use
// node:fs/promises (not Bun.*)") doesn't trip the guard.
const BUN_GLOBAL_API =
  /\bBun\.(serve|file|write|spawn|spawnSync|env|build|connect|listen|\$|password|nanoseconds|hash|sleep|which|stdin|stdout|stderr)\b/
const BUN_MODULE_IMPORT = /from\s+['"]bun(:[a-z0-9]+)?['"]/

// The single file per adapter where Bun coupling is allowed by design.
const TEST_RENDER = 'test-render.ts'

/** Published adapter packages (skip `private: true`, e.g. adapter-tests). */
function publishedAdapters(): { name: string; dir: string }[] {
  return readdirSync(PACKAGES_DIR)
    .filter(name => name.startsWith('adapter-'))
    .map(name => ({ name, dir: join(PACKAGES_DIR, name) }))
    .filter(({ dir }) => existsSync(join(dir, 'src')))
    .filter(({ dir }) => {
      const pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'))
      return pkg.private !== true
    })
}

/** Recursively collect .ts/.tsx files under `dir`, skipping test trees. */
function tsFiles(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) {
      if (entry === '__tests__' || entry === 'node_modules' || entry === 'dist') continue
      out.push(...tsFiles(full))
    } else if (/\.tsx?$/.test(entry)) {
      out.push(full)
    }
  }
  return out
}

const adapters = publishedAdapters()

describe('published adapters do not force the Bun runtime on users', () => {
  test('there is at least one published adapter to check', () => {
    expect(adapters.length).toBeGreaterThan(0)
  })

  test.each(adapters)('$name: user-facing src uses no Bun-only API or module', ({ dir }) => {
    const srcDir = join(dir, 'src')
    for (const file of tsFiles(srcDir)) {
      // test-render.ts is the deliberate, export-gated exception (asserted
      // separately below); every other file must be Bun-free.
      if (file.endsWith(TEST_RENDER)) continue
      const rel = relative(PACKAGES_DIR, file)
      const contents = readFileSync(file, 'utf8')
      expect(contents, `${rel} uses the Bun-only global API`).not.toMatch(BUN_GLOBAL_API)
      expect(contents, `${rel} imports a Bun-only module`).not.toMatch(BUN_MODULE_IMPORT)
    }
  })

  // For adapters that *do* ship the Bun-only test-render helper, pin the
  // two facts that keep it from leaking onto non-bun users.
  const withTestRender = adapters.filter(({ dir }) =>
    existsSync(join(dir, 'src', TEST_RENDER)),
  )

  test.each(withTestRender)(
    '$name: test-render.ts is the intentional Bun-only helper',
    ({ dir }) => {
      const contents = readFileSync(join(dir, 'src', TEST_RENDER), 'utf8')
      // Documents *why* test-render is excluded above: it genuinely uses
      // the Bun API. If this ever stops being true, drop the exclusion.
      expect(contents).toMatch(BUN_GLOBAL_API)
    },
  )

  test.each(withTestRender)(
    '$name: ./test-render export is gated to the "bun" condition only',
    ({ dir }) => {
      const pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'))
      const entry = pkg.exports?.['./test-render']
      expect(entry, 'expected a ./test-render export entry').toBeDefined()
      // Only the `bun` condition — no node/default/import/require fallback
      // that would let a non-bun runtime resolve (and then fail to run) it.
      expect(Object.keys(entry)).toEqual(['bun'])
    },
  )
})
