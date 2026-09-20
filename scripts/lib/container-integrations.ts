/**
 * The one answer to "which integrations run on a Cloudflare Container, and
 * from which image": each integration's own wrangler.toml, since that is the
 * file `wrangler deploy` reads. Never a hand-written list -- a new integration
 * is covered the moment it declares a container.
 *
 * Both the tini guard (integrations/shared/lib/__tests__/container-init.test.ts)
 * and the Worker bundle check (scripts/ci/check-worker-bundles.ts) ask this
 * question; they share this walk so the definition cannot drift between them.
 */

import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'

export const INTEGRATIONS_DIR = resolve(import.meta.dir, '../../integrations')

export type ContainerIntegration = {
  /** Directory name under integrations/, which is also what the app is called. */
  name: string
  /** Absolute path to the integration's directory. */
  dir: string
  /** The parsed wrangler.toml, `containers` included. */
  config: Record<string, unknown>
  /** Absolute path to each declared container's Dockerfile, in declaration order. */
  dockerfiles: string[]
}

export function containerIntegrations(): ContainerIntegration[] {
  return readdirSync(INTEGRATIONS_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .flatMap((entry) => {
      const wranglerToml = join(INTEGRATIONS_DIR, entry.name, 'wrangler.toml')
      if (!existsSync(wranglerToml)) return []
      const config = Bun.TOML.parse(readFileSync(wranglerToml, 'utf8')) as Record<string, unknown>
      const containers = config.containers
      if (!Array.isArray(containers) || containers.length === 0) return []
      const dir = dirname(wranglerToml)
      return [
        {
          name: entry.name,
          dir,
          config,
          dockerfiles: containers.map((container) => resolve(dir, String((container as { image: string }).image))),
        },
      ]
    })
}
