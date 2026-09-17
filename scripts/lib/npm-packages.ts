// The npm side of a release: which packages go to npm (every publishable
// workspace package — see `scripts/lib/workspace-packages.ts`), and what
// the registry currently holds for one of them.
//
//   scripts/changeset-publish.ts  publishes them in order
//   scripts/release-preflight.ts  checks every one exists before anything
//                                 is published (a first release needs manual
//                                 setup — see that script)

import { $ } from 'bun'
import { type WorkspacePackage, publishablePackages } from './workspace-packages'

/** Everything Changesets publishes to npm, dependencies before dependents. */
export function npmPublishablePackages(repoRoot: string): WorkspacePackage[] {
  return publishablePackages(repoRoot)
}

/**
 * What a registry says about a package. `missing` is a definite "no such
 * package" (npm E404 / JSR 404); `unknown` is "could not tell" — a network
 * error, a 5xx — and is deliberately kept apart so a flaky lookup is never
 * reported as an absent package.
 */
export type RegistryPresence =
  | { status: 'present'; version?: string }
  | { status: 'missing' }
  | { status: 'unknown'; reason: string }

/**
 * The version npm serves as `latest` for `name`, via `npm view` — the same
 * door `npm publish` uses, so it sees the same registry through the same
 * proxy/auth configuration.
 */
export async function npmRegistryVersion(name: string): Promise<RegistryPresence> {
  const result = await $`npm view ${name} version`.quiet().nothrow()
  if (result.exitCode === 0) return { status: 'present', version: result.text().trim() }
  const stderr = result.stderr.toString().trim()
  if (stderr.includes('E404')) return { status: 'missing' }
  return { status: 'unknown', reason: stderr }
}
