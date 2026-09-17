// The decision behind `scripts/release-preflight.ts`, kept free of I/O so it
// can be tested as a document of what the preflight refuses and what it
// tells the operator to do.
//
// Why a preflight exists: npm and JSR both publish from CI through Trusted
// Publishing (OIDC), and neither will CREATE a package that way — npm cannot
// at all (npm/cli#8544), JSR wants the package created on jsr.io first. So a
// package's first release fails mid-run, after its siblings have already
// shipped. That is the state 0.37.1 landed in: 23 packages on npm, pebble
// not, every native-registry job skipped, and a `force_native_release`
// dispatch needed to finish. Refusing BEFORE anything is published turns
// that into: fix the registries, re-run, done.
//
// Only existence is checked. A trusted publisher that exists but lacks the
// "npm publish" permission (the other half of the 0.37.1 failure) is not
// detectable up front — that case still lands in the recovery documented in
// release.yml.

import type { RegistryPresence } from './npm-packages'

export interface PreflightEntry {
  name: string
  version: string
  /** Repo-relative package directory, e.g. `packages/adapter-pebble`. */
  dir: string
  npm: RegistryPresence
  /** `null` when the package is not mirrored to JSR (executables, non-TS runtimes). */
  jsr: RegistryPresence | null
}

export interface PreflightContext {
  /** `owner/repo`, for the trusted-publisher instructions. */
  repository: string
  /** Workflow file name the registries trust, e.g. `release.yml`. */
  workflow: string
  /**
   * The commit this run releases (`git rev-parse HEAD` in the workflow
   * checkout), so the manual-publish and tag commands are pasteable as-is.
   * Optional: a by-hand run outside a checkout falls back to a placeholder.
   */
  commit?: string
}

export interface PreflightReport {
  /** True when at least one package definitely does not exist on a registry. */
  blocking: boolean
  /** Names of packages that block, for callers that want to log them tersely. */
  missing: string[]
  /** The full operator-facing text. */
  text: string
}

const npmTarball = (name: string, version: string) =>
  `${name.replace(/^@/, '').replace('/', '-')}-${version}.tgz`

function npmInstructions(e: PreflightEntry, ctx: PreflightContext): string[] {
  const tag = `${e.name}@${e.version}`
  const commit = ctx.commit ?? '<the commit this run releases>'
  return [
    `    npm — ${e.name} is not on npm yet.`,
    `      npm cannot create a package through Trusted Publishing (npm/cli#8544),`,
    `      so publish this first version by hand, from the commit this run is`,
    `      releasing, with an npm token allowed to publish it:`,
    `        git checkout ${commit}`,
    `        cd ${e.dir}`,
    `        bun pm pack`,
    `        npm publish ./${npmTarball(e.name, e.version)} --access public`,
    `      Then hand future versions to this workflow:`,
    `        https://www.npmjs.com/package/${e.name}/access`,
    `        → Trusted Publisher → GitHub Actions`,
    `          repository: ${ctx.repository}    workflow: ${ctx.workflow}`,
    `        and confirm the "npm publish" permission is granted — a trusted`,
    `        publisher without it fails with "OIDC permission denied for this action".`,
    `      The re-run will find ${e.version} on npm and skip this package, so its`,
    `      git tag and GitHub Release are yours to create:`,
    `        git tag '${tag}' ${commit} && git push origin '${tag}'`,
    `        gh release create '${tag}' --title '${tag}' --notes 'See ${e.dir}/CHANGELOG.md'`,
  ]
}

function jsrInstructions(e: PreflightEntry, ctx: PreflightContext): string[] {
  const [scope, pkg] = e.name.replace(/^@/, '').split('/')
  return [
    `    JSR — ${e.name} does not exist on JSR yet.`,
    `      \`deno publish\` cannot create a package from CI. Create it, then link`,
    `      this repository so publishing from GitHub Actions is allowed:`,
    `        1. https://jsr.io/new?scope=${scope}&package=${pkg}`,
    `        2. https://jsr.io/${e.name}/settings`,
    `           → GitHub Repository: ${ctx.repository}`,
    `      Nothing has to be published by hand on JSR: once the package exists,`,
    `      the re-run mirrors it.`,
  ]
}

/**
 * Decide whether the release may proceed, and say what to do if not.
 *
 * `missing` blocks; `unknown` never does (a registry that could not be
 * reached has said nothing about the package) but is reported so a reader
 * of the log knows the check was partial.
 */
export function assessPreflight(entries: PreflightEntry[], ctx: PreflightContext): PreflightReport {
  const blocked = entries.filter(e => e.npm.status === 'missing' || e.jsr?.status === 'missing')
  const unknown = entries.flatMap(e =>
    (['npm', 'jsr'] as const).flatMap(reg => {
      const p = e[reg]
      return p?.status === 'unknown' ? [{ name: e.name, registry: reg, reason: p.reason }] : []
    }),
  )

  const lines: string[] = []

  if (blocked.length === 0) {
    const jsrCount = entries.filter(e => e.jsr !== null).length
    lines.push(
      `Release preflight: all ${entries.length} npm packages and ${jsrCount} JSR packages exist on their registries.`,
    )
  } else {
    lines.push(
      `Release preflight: ${blocked.length} package(s) do not exist on a registry yet, so this run publishes nothing.`,
      ``,
      `A package's first release needs one-time manual setup, because Trusted`,
      `Publishing (OIDC) can only publish to a package that already exists. Once`,
      `the steps below are done, re-run this workflow (Actions → Release →`,
      `Re-run failed jobs): it will publish every package normally, including`,
      `the native-registry jobs. Nothing else needs to be repaired.`,
    )
    for (const e of blocked) {
      lines.push(``, `  ${e.name}@${e.version}  (${e.dir})`)
      if (e.npm.status === 'missing') lines.push(...npmInstructions(e, ctx))
      if (e.jsr?.status === 'missing') lines.push(...jsrInstructions(e, ctx))
    }
  }

  if (unknown.length > 0) {
    lines.push(
      ``,
      `Could not reach a registry for ${unknown.length} check(s). These are NOT treated as missing —`,
      `the publish step itself will be the judge:`,
    )
    for (const u of unknown) lines.push(`  ${u.name}  ${u.registry}: ${u.reason}`)
  }

  return { blocking: blocked.length > 0, missing: blocked.map(e => e.name), text: lines.join('\n') }
}
