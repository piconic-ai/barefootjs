// Unit coverage for the scaffold README.md generator (lib/readme.ts).
//
// `generateReadmeMd` is pulled out as a pure `(pkgName, adapter, pm) ->
// string` helper specifically so it's testable here without running
// the full `bf init` flow, which needs network access (the registry
// probe / Button fetch in commands/init.ts) and can't run offline in
// tests. See issue #2124 item 2.

import { describe, test, expect } from 'bun:test'
import { generateReadmeMd } from '../lib/readme'
import { ADAPTERS } from '../lib/templates'

describe('generateReadmeMd', () => {
  test('titles the README with the project (package) name', () => {
    const readme = generateReadmeMd('my-app', ADAPTERS.hono, 'npm')
    expect(readme).toMatch(/^# my-app/)
  })

  test('renders the install + dev commands for the detected package manager', () => {
    const npm = generateReadmeMd('my-app', ADAPTERS.hono, 'npm')
    expect(npm).toContain('npm install')
    expect(npm).toContain('npm run dev')

    const bun = generateReadmeMd('my-app', ADAPTERS.hono, 'bun')
    expect(bun).toContain('bun install')
    expect(bun).toContain('bun run dev')
  })

  test('inserts extraSetupSteps between install and dev (mojo cpanm step)', () => {
    const readme = generateReadmeMd('my-app', ADAPTERS.mojo, 'npm')
    const installIdx = readme.indexOf('npm install')
    const cpanmIdx = readme.indexOf('cpanm --installdeps .')
    const devIdx = readme.indexOf('npm run dev')
    expect(installIdx).toBeGreaterThan(-1)
    expect(cpanmIdx).toBeGreaterThan(installIdx)
    expect(devIdx).toBeGreaterThan(cpanmIdx)
  })

  test('includes a build command for every adapter', () => {
    for (const [id, adapter] of Object.entries(ADAPTERS)) {
      const readme = generateReadmeMd('my-app', adapter, 'npm')
      expect(readme, `${id} missing build command`).toContain('npm run build')
    }
  })

  test('includes a deploy line only for adapters that advertise adapter.deploy', () => {
    const withDeploy = generateReadmeMd('my-app', ADAPTERS.hono, 'npm')
    expect(withDeploy).toContain('deploy to Cloudflare Workers')

    const withoutDeploy = generateReadmeMd('my-app', ADAPTERS['hono-node'], 'npm')
    expect(withoutDeploy).not.toContain('deploy to')
  })

  test('includes the `bf` CLI cheat sheet', () => {
    const readme = generateReadmeMd('my-app', ADAPTERS.csr, 'npm')
    expect(readme).toContain('bf search <term>')
    expect(readme).toContain('bf add <component>')
    expect(readme).toContain('bf docs <component>')
    expect(readme).toContain('bf debug graph <component>')
    expect(readme).toContain('bf guide')
  })

  test('notes that the compiled output directory is generated and shouldn\'t be hand-edited', () => {
    const readme = generateReadmeMd('my-app', ADAPTERS.hono, 'npm')
    expect(readme).toMatch(/regenerated on every build/i)
    expect(readme).toMatch(/don't edit it by hand/i)
  })

  test('explains adapter.overrides in a dedicated section (package.json can\'t carry a comment)', () => {
    // Hono is the one adapter that injects an override today (wrangler
    // -> miniflare's exact undici pin) — see AdapterTemplate.overrides.
    // The README is the only place a user maintaining the generated
    // project can learn why the override exists or when it's safe to
    // remove, since JSON has no comment syntax.
    const readme = generateReadmeMd('my-app', ADAPTERS.hono, 'npm')
    expect(readme).toContain('## Dependency overrides')
    expect(readme).toContain(ADAPTERS.hono.overridesNote)
  })

  test('omits the overrides section for adapters that inject none', () => {
    const readme = generateReadmeMd('my-app', ADAPTERS.csr, 'npm')
    expect(readme).not.toContain('## Dependency overrides')
  })
})
