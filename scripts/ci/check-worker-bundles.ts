/**
 * Bundles every Container integration's Worker the way `wrangler deploy`
 * would, without deploying anything or building an image.
 *
 * Why: a Worker that imports a module the bundler cannot resolve only fails at
 * deploy time, and deploys run on main -- #3106 broke all sixteen of them at
 * once (`Could not resolve "@cloudflare/containers"` from a module in
 * integrations/shared that did not declare it) and nothing caught it until
 * main was already red.
 *
 * `wrangler deploy --dry-run` on the integration's own config would also build
 * the container image, which needs Docker and minutes per integration. The
 * point here is only the JS bundle, so each config is rewritten without its
 * `containers` block and handed to wrangler as a temporary file. The Durable
 * Object binding and migrations stay: they are part of what the bundle is
 * checked against.
 */

import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { type ContainerIntegration, containerIntegrations } from '../lib/container-integrations'

const CONCURRENCY = 4

async function bundle(target: ContainerIntegration, workDir: string): Promise<string | null> {
  const { containers, routes, ...rest } = target.config
  void containers // the image build is what this check exists to skip
  void routes // a route on the zone is not part of bundling, and needs an account

  const configPath = join(workDir, `${target.name}.json`)
  await writeFile(
    configPath,
    JSON.stringify({ ...rest, main: resolve(target.dir, String(rest.main)) }, null, 2),
  )

  const proc = Bun.spawn(
    ['bunx', 'wrangler', 'deploy', '--dry-run', '--outdir', join(workDir, target.name), '-c', configPath],
    { cwd: target.dir, stdout: 'pipe', stderr: 'pipe', env: { ...process.env, WRANGLER_SEND_METRICS: 'false' } },
  )
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ])
  return exitCode === 0 ? null : `${stdout}\n${stderr}`.trim()
}

const targets = containerIntegrations()
if (targets.length === 0) {
  console.error('No Container integrations found — the discovery walk is broken, not the workers.')
  process.exit(1)
}

const workDir = await mkdtemp(join(tmpdir(), 'bf-worker-bundle-'))
const failures: { name: string; output: string }[] = []

try {
  for (let i = 0; i < targets.length; i += CONCURRENCY) {
    const batch = targets.slice(i, i + CONCURRENCY)
    const results = await Promise.all(batch.map(async (target) => [target, await bundle(target, workDir)] as const))
    for (const [target, output] of results) {
      if (output === null) {
        console.log(`ok    ${target.name}`)
      } else {
        console.log(`FAIL  ${target.name}`)
        failures.push({ name: target.name, output })
      }
    }
  }
} finally {
  await rm(workDir, { recursive: true, force: true })
}

if (failures.length > 0) {
  for (const failure of failures) {
    console.error(`\n=== ${failure.name} ===\n${failure.output}`)
  }
  console.error(`\n${failures.length} of ${targets.length} Worker bundles failed.`)
  process.exit(1)
}

console.log(`\nAll ${targets.length} Worker bundles built.`)
