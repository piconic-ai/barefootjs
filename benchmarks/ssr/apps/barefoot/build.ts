/**
 * Production build for the BarefootJS SSR bench app.
 *
 * Two phases, two processes:
 * 1. ensureWorkspaceLinks(): `benchmarks/ssr/apps/*` is intentionally NOT a
 *    workspace member, so the `@barefootjs/*` packages and `hono` don't
 *    resolve here on a fresh clone (node_modules is gitignored). Recreate
 *    the local symlinks. `hono` is resolved from the adapter package's own
 *    context so this survives version bumps.
 * 2. Spawn build-impl.ts in a fresh bun process. Bun caches module
 *    resolution per process, so symlinks created in step 1 are only
 *    reliably visible to a process started afterwards.
 */
import { mkdir, symlink } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const appDir = dirname(fileURLToPath(import.meta.url))
const repoRoot = join(appDir, '..', '..', '..', '..')

async function ensureWorkspaceLinks(): Promise<void> {
  const nmDir = join(appDir, 'node_modules')
  const scopeDir = join(nmDir, '@barefootjs')
  await mkdir(scopeDir, { recursive: true })
  const links: Array<[string, string]> = [
    [join(scopeDir, 'client'), join(repoRoot, 'packages/client')],
    [join(scopeDir, 'jsx'), join(repoRoot, 'packages/jsx')],
    [join(scopeDir, 'shared'), join(repoRoot, 'packages/shared')],
    [join(scopeDir, 'hono'), join(repoRoot, 'packages/adapter-hono')],
  ]
  const honoPkg = Bun.resolveSync('hono/package.json', join(repoRoot, 'packages/adapter-hono'))
  links.push([join(nmDir, 'hono'), dirname(honoPkg)])
  for (const [link, target] of links) {
    if (existsSync(link)) continue
    await symlink(target, link, 'dir')
  }
}

export async function build(): Promise<void> {
  await ensureWorkspaceLinks()
  const proc = Bun.spawn({
    cmd: ['bun', join(appDir, 'build-impl.ts')],
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
    throw new Error(`barefoot SSR bench app build failed (exit ${exitCode})`)
  }
}

if (import.meta.main) {
  await build()
  console.log('barefoot: built SSR bench to benchmarks/ssr/apps/barefoot/dist')
}
