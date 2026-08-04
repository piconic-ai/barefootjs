/**
 * Production build for the BarefootJS benchmark app.
 *
 * Runs the real compiler pipeline via `@barefootjs/vite`'s `barefoot()`
 * plugin (see `vite.config.ts`), exactly the way `integrations/csr` does —
 * no hand-written DOM, no manual client JS. `vite build` produces
 * `dist/index.html` plus the compiled component + client runtime under
 * `dist/assets/` (Vite content-hashes and chunk-splits them itself), which
 * is the "shipped JS" measured for this app.
 *
 * `index.html` (the mount point + module script) is a real source file
 * Vite processes directly — see `index.html` in this directory. This file
 * only stages the shared stylesheet and shells out to `vite build`.
 */
import { mkdir, cp, symlink } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { resolve, dirname } from 'node:path'

const appDir = dirname(new URL(import.meta.url).pathname)
const sharedStylesPath = resolve(appDir, '../shared/styles.css')
const viteBin = resolve(appDir, 'node_modules/vite/bin/vite.js')

/**
 * `benchmarks/apps/*` is intentionally NOT a workspace member (the apps are
 * benchmark fixtures, not packages), so none of `vite`, `@barefootjs/vite`,
 * `@barefootjs/client` resolve here on a fresh clone. Recreate the local
 * node_modules symlinks the same way `integrations/csr` gets them from the
 * workspace install — `packages/vite` and `packages/client` already carry
 * complete node_modules of their own (including a hoisted `vite`), so
 * symlinking straight to those three is enough for their own transitive
 * deps (`@barefootjs/jsx`, `@barefootjs/shared`) to resolve through the
 * symlink target's real directory. node_modules is gitignored, so this
 * must run on every build host.
 */
async function ensureWorkspaceLinks(): Promise<void> {
  const scopeDir = resolve(appDir, 'node_modules/@barefootjs')
  await mkdir(scopeDir, { recursive: true })
  const scopedLinks: Array<[string, string]> = [
    [resolve(appDir, '../../../packages/client'), resolve(scopeDir, 'client')],
    [resolve(appDir, '../../../packages/vite'), resolve(scopeDir, 'vite')],
  ]
  for (const [target, link] of scopedLinks) {
    if (!existsSync(link)) await symlink(target, link, 'dir')
  }
  const viteLink = resolve(appDir, 'node_modules/vite')
  if (!existsSync(viteLink)) {
    await symlink(resolve(appDir, '../../../packages/vite/node_modules/vite'), viteLink, 'dir')
  }
}

export async function build(): Promise<void> {
  await ensureWorkspaceLinks()

  // Real compiler pipeline: `vite build` reading vite.config.ts's
  // barefoot() plugin. `emptyOutDir: true` (vite.config.ts) handles
  // clearing a stale dist/ itself.
  const proc = Bun.spawn({
    cmd: ['bun', viteBin, 'build'],
    cwd: appDir,
    stdout: 'pipe',
    stderr: 'pipe',
  })
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ])
  if (exitCode !== 0) {
    console.error(stdout)
    console.error(stderr)
    throw new Error(`barefoot: vite build failed (exit ${exitCode})`)
  }

  // `index.html`'s `<link href="/styles.css">` is a root-absolute
  // reference — Vite passes those through untouched (the publicDir
  // convention) rather than resolving/hashing them, so nothing copies the
  // shared stylesheet into dist/ on its own. Copy it in directly, same as
  // the legacy pipeline did.
  await mkdir(resolve(appDir, 'dist'), { recursive: true })
  await cp(sharedStylesPath, resolve(appDir, 'dist/styles.css'))
}

if (import.meta.main) {
  await build()
  console.log('barefoot: built to benchmarks/apps/barefoot/dist')
}
