/**
 * Production build for the BarefootJS benchmark app.
 *
 * Runs the real compiler pipeline (`bf build` / `packages/cli`) against
 * `barefoot.config.ts`, exactly the way `integrations/csr` does — no
 * hand-written DOM, no manual client JS. That produces
 * `dist/components/Bench.client.js` (compiled component) and
 * `dist/components/barefoot.js` (client runtime), which is the "shipped
 * JS" measured for this app.
 *
 * Then writes dist/index.html (mount point + importmap + module script)
 * and copies the shared stylesheet — see benchmarks/CONTRACT.md.
 */
import { mkdir, cp, rm, symlink } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { resolve, dirname } from 'node:path'

const appDir = dirname(new URL(import.meta.url).pathname)
const distDir = resolve(appDir, 'dist')
const cliEntry = resolve(appDir, '../../../packages/cli/src/index.ts')
const sharedStylesPath = resolve(appDir, '../shared/styles.css')

/**
 * `benchmarks/apps/*` is intentionally NOT a workspace member (the apps are
 * benchmark fixtures, not packages), so `@barefootjs/client` doesn't resolve
 * here on a fresh clone. Recreate the local node_modules symlink the same
 * way `integrations/csr` gets one from the workspace install. node_modules
 * is gitignored, so this must run on every build host.
 */
async function ensureWorkspaceLinks(): Promise<void> {
  const scopeDir = resolve(appDir, 'node_modules/@barefootjs')
  const link = resolve(scopeDir, 'client')
  if (existsSync(link)) return
  await mkdir(scopeDir, { recursive: true })
  await symlink(resolve(appDir, '../../../packages/client'), link, 'dir')
}

export async function build(): Promise<void> {
  await ensureWorkspaceLinks()
  if (existsSync(distDir)) {
    await rm(distDir, { recursive: true, force: true })
  }

  // Real compiler pipeline: `bf build` reading barefoot.config.ts from cwd.
  const proc = Bun.spawn({
    cmd: ['bun', 'run', cliEntry, 'build'],
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
    throw new Error(`barefoot: bf build failed (exit ${exitCode})`)
  }

  // Build bookkeeping files (.bfemit.json / .buildcache.json) are internal
  // to the compiler's incremental-build cache — not shipped JS, drop them
  // so `dist/` only contains what a browser actually loads.
  for (const f of ['.bfemit.json', '.buildcache.json']) {
    const p = resolve(distDir, f)
    if (existsSync(p)) await rm(p)
  }

  await mkdir(distDir, { recursive: true })
  await cp(sharedStylesPath, resolve(distDir, 'styles.css'))

  await Bun.write(
    resolve(distDir, 'index.html'),
    `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>BarefootJS Benchmark — BarefootJS</title>
    <script type="importmap">
      { "imports": { "@barefootjs/client/runtime": "./components/barefoot.js" } }
    </script>
    <link rel="stylesheet" href="./styles.css" />
  </head>
  <body>
    <div id="app"></div>
    <script type="module">
      import { render } from '@barefootjs/client/runtime'
      await import('./components/Bench.client.js')
      render(document.getElementById('app'), 'Bench')
      document.body.dataset.ready = '1'
    </script>
  </body>
</html>
`,
  )
}

if (import.meta.main) {
  await build()
  console.log('barefoot: built to benchmarks/apps/barefoot/dist')
}
