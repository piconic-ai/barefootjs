// Alpha install path: when create-barefootjs is itself installed from
// pkg.pr.new it forwards the base URL + ref to `bf init` via env vars
// so the generated app's `@barefootjs/*: "latest"` entries get rewritten
// to URLs pinned at the same SHA. Without this rewrite `npm install`
// against the scaffolded `package.json` 404s on every @barefootjs/* dep
// until the first npm publish lands — the friction the alpha install
// docs called out as the manual "step 3" rewrite users had to do.
//
// This test pins the rewrite as a contract: in, "latest"; out, the
// pinned URL. Pure-function coverage of the env-driven path; the
// end-to-end "create-barefootjs detects + propagates" leg is covered by
// the per-PR pkg.pr.new install walk in CI / manual verification.

import { describe, test, expect, afterEach } from 'bun:test'
import { rewriteAlphaPkgPrNewDeps } from '../commands/init'

const BASE = 'BAREFOOT_PKG_PR_NEW_BASE'
const REF = 'BAREFOOT_PKG_PR_NEW_REF'
const SAVED: Record<string, string | undefined> = {}

function setEnv(base: string | undefined, ref: string | undefined): void {
  SAVED[BASE] = process.env[BASE]
  SAVED[REF] = process.env[REF]
  if (base === undefined) delete process.env[BASE]
  else process.env[BASE] = base
  if (ref === undefined) delete process.env[REF]
  else process.env[REF] = ref
}

afterEach(() => {
  if (SAVED[BASE] === undefined) delete process.env[BASE]
  else process.env[BASE] = SAVED[BASE]
  if (SAVED[REF] === undefined) delete process.env[REF]
  else process.env[REF] = SAVED[REF]
})

describe('rewriteAlphaPkgPrNewDeps', () => {
  test('rewrites @barefootjs/* latest deps to pinned pkg.pr.new URLs', () => {
    setEnv('https://pkg.pr.new/piconic-ai/barefootjs', 'abc123')
    const deps = { '@barefootjs/cli': 'latest', hono: '^4.6.0' }
    const devDeps = { '@barefootjs/test': 'latest', typescript: '^5.6.0' }
    rewriteAlphaPkgPrNewDeps(deps, devDeps)
    expect(deps['@barefootjs/cli']).toBe(
      'https://pkg.pr.new/piconic-ai/barefootjs/@barefootjs/cli@abc123',
    )
    // Non-@barefootjs deps untouched — they resolve from npm as usual.
    expect(deps.hono).toBe('^4.6.0')
    expect(devDeps['@barefootjs/test']).toBe(
      'https://pkg.pr.new/piconic-ai/barefootjs/@barefootjs/test@abc123',
    )
    expect(devDeps.typescript).toBe('^5.6.0')
  })

  test('no-op when env vars are unset (normal npm install path)', () => {
    setEnv(undefined, undefined)
    const deps = { '@barefootjs/cli': 'latest' }
    const devDeps = { '@barefootjs/test': 'latest' }
    rewriteAlphaPkgPrNewDeps(deps, devDeps)
    expect(deps['@barefootjs/cli']).toBe('latest')
    expect(devDeps['@barefootjs/test']).toBe('latest')
  })

  test('no-op when only one of the two env vars is set', () => {
    setEnv('https://pkg.pr.new/piconic-ai/barefootjs', undefined)
    const deps = { '@barefootjs/cli': 'latest' }
    const devDeps = {}
    rewriteAlphaPkgPrNewDeps(deps, devDeps)
    expect(deps['@barefootjs/cli']).toBe('latest')
  })

  test('leaves non-"latest" @barefootjs/* versions alone (user override)', () => {
    setEnv('https://pkg.pr.new/piconic-ai/barefootjs', 'abc123')
    // If a downstream user pinned a specific version we don't clobber it.
    const deps = {
      '@barefootjs/cli': '0.2.0',
      '@barefootjs/client': 'latest',
    }
    const devDeps = {}
    rewriteAlphaPkgPrNewDeps(deps, devDeps)
    expect(deps['@barefootjs/cli']).toBe('0.2.0')
    expect(deps['@barefootjs/client']).toBe(
      'https://pkg.pr.new/piconic-ai/barefootjs/@barefootjs/client@abc123',
    )
  })
})
