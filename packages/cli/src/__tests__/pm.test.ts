import { describe, test, expect, beforeEach, afterEach } from 'bun:test'
import { mkdirSync, writeFileSync, rmSync } from 'fs'
import path from 'path'
import os from 'os'
import { detectPackageManager, detectInvokingPackageManager, commandsFor, testRunnerFor } from '../lib/pm'

// Empty env keeps lockfile-detection tests independent of how the test
// runner itself was launched (e.g. `bun test` sets npm_config_user_agent).
const EMPTY_ENV = {} as NodeJS.ProcessEnv
const EMPTY_VERSIONS = {} as { bun?: string }

describe('detectPackageManager', () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = path.join(os.tmpdir(), `bf-pm-${Date.now()}-${Math.random().toString(36).slice(2)}`)
    mkdirSync(tmpDir, { recursive: true })
  })

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true })
  })

  test('returns npm when no lockfile and no user agent', () => {
    expect(detectPackageManager(tmpDir, EMPTY_ENV, EMPTY_VERSIONS)).toBe('npm')
  })

  test('detects bun via bun.lock', () => {
    writeFileSync(path.join(tmpDir, 'bun.lock'), '')
    expect(detectPackageManager(tmpDir, EMPTY_ENV, EMPTY_VERSIONS)).toBe('bun')
  })

  test('detects bun via bun.lockb', () => {
    writeFileSync(path.join(tmpDir, 'bun.lockb'), '')
    expect(detectPackageManager(tmpDir, EMPTY_ENV, EMPTY_VERSIONS)).toBe('bun')
  })

  test('detects pnpm via pnpm-lock.yaml', () => {
    writeFileSync(path.join(tmpDir, 'pnpm-lock.yaml'), '')
    expect(detectPackageManager(tmpDir, EMPTY_ENV, EMPTY_VERSIONS)).toBe('pnpm')
  })

  test('detects yarn via yarn.lock', () => {
    writeFileSync(path.join(tmpDir, 'yarn.lock'), '')
    expect(detectPackageManager(tmpDir, EMPTY_ENV, EMPTY_VERSIONS)).toBe('yarn')
  })

  test('detects npm via package-lock.json', () => {
    writeFileSync(path.join(tmpDir, 'package-lock.json'), '{}')
    expect(detectPackageManager(tmpDir, EMPTY_ENV, EMPTY_VERSIONS)).toBe('npm')
  })

  test('detects deno via deno.lock', () => {
    writeFileSync(path.join(tmpDir, 'deno.lock'), '')
    expect(detectPackageManager(tmpDir, EMPTY_ENV, EMPTY_VERSIONS)).toBe('deno')
  })

  test('detects deno via deno.json', () => {
    writeFileSync(path.join(tmpDir, 'deno.json'), '{}')
    expect(detectPackageManager(tmpDir, EMPTY_ENV, EMPTY_VERSIONS)).toBe('deno')
  })

  test('detects deno via deno.jsonc', () => {
    writeFileSync(path.join(tmpDir, 'deno.jsonc'), '{}')
    expect(detectPackageManager(tmpDir, EMPTY_ENV, EMPTY_VERSIONS)).toBe('deno')
  })

  test('prefers bun over npm when both lockfiles exist', () => {
    writeFileSync(path.join(tmpDir, 'bun.lock'), '')
    writeFileSync(path.join(tmpDir, 'package-lock.json'), '{}')
    expect(detectPackageManager(tmpDir, EMPTY_ENV, EMPTY_VERSIONS)).toBe('bun')
  })

  // A Deno project that also keeps a package.json + a non-Deno lockfile
  // (here bun.lock, for editor tooling) resolves to that lockfile's
  // tool, since it reflects an actually-installed tree — `deno` is the
  // last lockfile signal, not the first.
  test('prefers a non-Deno lockfile (bun) over deno.json when both exist', () => {
    writeFileSync(path.join(tmpDir, 'deno.json'), '{}')
    writeFileSync(path.join(tmpDir, 'bun.lock'), '')
    expect(detectPackageManager(tmpDir, EMPTY_ENV, EMPTY_VERSIONS)).toBe('bun')
  })

  test('falls back to deno runtime when env has no UA (e.g. `deno run npm:bf`)', () => {
    expect(detectPackageManager(tmpDir, EMPTY_ENV, { deno: '2.0.0' })).toBe('deno')
  })

  test('falls back to invoking PM (bunx) when no lockfile is present', () => {
    const env = { npm_config_user_agent: 'bun/1.1.0 npm/? node/v22.0.0 darwin arm64' } as NodeJS.ProcessEnv
    expect(detectPackageManager(tmpDir, env)).toBe('bun')
  })

  test('falls back to invoking PM (pnpm dlx) when no lockfile is present', () => {
    const env = { npm_config_user_agent: 'pnpm/9.0.0 npm/? node/v22.0.0 darwin arm64' } as NodeJS.ProcessEnv
    expect(detectPackageManager(tmpDir, env)).toBe('pnpm')
  })

  test('lockfile wins over invoking PM', () => {
    writeFileSync(path.join(tmpDir, 'pnpm-lock.yaml'), '')
    const env = { npm_config_user_agent: 'bun/1.1.0' } as NodeJS.ProcessEnv
    expect(detectPackageManager(tmpDir, env)).toBe('pnpm')
  })

  test('falls back to bun runtime when env has no UA (e.g. `bun ./cli.js`)', () => {
    expect(detectPackageManager(tmpDir, EMPTY_ENV, { bun: '1.3.0' })).toBe('bun')
  })

  test('UA wins over bun runtime when both are present', () => {
    const env = { npm_config_user_agent: 'pnpm/9.0.0' } as NodeJS.ProcessEnv
    expect(detectPackageManager(tmpDir, env, { bun: '1.3.0' })).toBe('pnpm')
  })
})

describe('detectInvokingPackageManager', () => {
  test('returns null when user agent is missing and not on bun', () => {
    expect(detectInvokingPackageManager(EMPTY_ENV, EMPTY_VERSIONS)).toBeNull()
  })

  test('detects bun', () => {
    const env = { npm_config_user_agent: 'bun/1.1.0' } as NodeJS.ProcessEnv
    expect(detectInvokingPackageManager(env, EMPTY_VERSIONS)).toBe('bun')
  })

  test('detects npm', () => {
    const env = { npm_config_user_agent: 'npm/10.0.0 node/v22.0.0' } as NodeJS.ProcessEnv
    expect(detectInvokingPackageManager(env, EMPTY_VERSIONS)).toBe('npm')
  })

  test('detects pnpm', () => {
    const env = { npm_config_user_agent: 'pnpm/9.0.0 npm/? node/v22.0.0' } as NodeJS.ProcessEnv
    expect(detectInvokingPackageManager(env, EMPTY_VERSIONS)).toBe('pnpm')
  })

  test('detects yarn', () => {
    const env = { npm_config_user_agent: 'yarn/4.0.0 npm/? node/v22.0.0' } as NodeJS.ProcessEnv
    expect(detectInvokingPackageManager(env, EMPTY_VERSIONS)).toBe('yarn')
  })

  test('detects deno via user agent', () => {
    const env = { npm_config_user_agent: 'deno/2.0.0' } as NodeJS.ProcessEnv
    expect(detectInvokingPackageManager(env, EMPTY_VERSIONS)).toBe('deno')
  })

  test('returns null for unknown user agent (not on bun/deno)', () => {
    const env = { npm_config_user_agent: 'cnpm/1.0.0' } as NodeJS.ProcessEnv
    expect(detectInvokingPackageManager(env, EMPTY_VERSIONS)).toBeNull()
  })

  test('detects bun runtime when UA is absent', () => {
    expect(detectInvokingPackageManager(EMPTY_ENV, { bun: '1.3.0' })).toBe('bun')
  })

  // Deno does not set `npm_config_user_agent`, so the runtime version
  // is the signal that catches `deno run -A npm:bf` in an empty dir.
  test('detects deno runtime when UA is absent', () => {
    expect(detectInvokingPackageManager(EMPTY_ENV, { deno: '2.0.0' })).toBe('deno')
  })
})

describe('commandsFor', () => {
  test('npm commands', () => {
    const c = commandsFor('npm')
    expect(c.install).toBe('npm install')
    expect(c.run('dev')).toBe('npm run dev')
    expect(c.exec('bf add button')).toBe('npx bf add button')
  })

  test('bun commands', () => {
    const c = commandsFor('bun')
    expect(c.install).toBe('bun install')
    expect(c.run('dev')).toBe('bun run dev')
    expect(c.exec('bf add button')).toBe('bunx bf add button')
  })

  test('pnpm commands', () => {
    const c = commandsFor('pnpm')
    expect(c.install).toBe('pnpm install')
    expect(c.run('dev')).toBe('pnpm dev')
    expect(c.exec('bf add button')).toBe('pnpm dlx bf add button')
  })

  test('yarn commands', () => {
    const c = commandsFor('yarn')
    expect(c.install).toBe('yarn')
    expect(c.run('dev')).toBe('yarn dev')
    expect(c.exec('bf add button')).toBe('yarn dlx bf add button')
  })

  test('deno commands', () => {
    const c = commandsFor('deno')
    expect(c.install).toBe('deno install')
    expect(c.run('dev')).toBe('deno task dev')
    // The `npm:` specifier is what makes `deno run -A npm:bf ...` the
    // Deno equivalent of `bunx bf ...` / `npx bf ...`.
    expect(c.exec('bf add button')).toBe('deno run -A npm:bf add button')
  })

  // The `test` helper is what the various "next steps" / "run tests"
  // hints route through so the CLI never prescribes `bun test` to a
  // user who picked a different package manager. Two paths matter:
  // suite-wide ("test") and targeted ("test <path>"). Only npm needs
  // `--` to forward the path to the underlying test script.
  test('test() — suite-wide form maps to each PM', () => {
    expect(commandsFor('npm').test()).toBe('npm test')
    expect(commandsFor('bun').test()).toBe('bun test')
    expect(commandsFor('pnpm').test()).toBe('pnpm test')
    expect(commandsFor('yarn').test()).toBe('yarn test')
    expect(commandsFor('deno').test()).toBe('deno task test')
  })

  test('test(path) — targeted form forwards the arg appropriately per PM', () => {
    expect(commandsFor('npm').test('components/Foo.test.tsx'))
      .toBe('npm test -- components/Foo.test.tsx')
    expect(commandsFor('bun').test('components/Foo.test.tsx'))
      .toBe('bun test components/Foo.test.tsx')
    expect(commandsFor('pnpm').test('components/Foo.test.tsx'))
      .toBe('pnpm test components/Foo.test.tsx')
    expect(commandsFor('yarn').test('components/Foo.test.tsx'))
      .toBe('yarn test components/Foo.test.tsx')
    expect(commandsFor('deno').test('components/Foo.test.tsx'))
      .toBe('deno task test components/Foo.test.tsx')
  })
})

// `testRunnerFor` centralises the bun-vs-vitest decision used by
// `bf init` (`package.json#scripts.test`, devDeps, tsconfig types
// entry) and the `bf gen test` / `bf gen component` code generators
// (the `import { describe, ... } from '<runner>'` line they emit).
// Keeping it as a pure data function lets every caller stay in
// lock-step without re-deriving the branch.
describe('testRunnerFor', () => {
  test('bun: ships `bun:test` import + `bun test` script + `@types/bun` + `, "bun-types"` types entry', () => {
    const r = testRunnerFor('bun')
    expect(r.importSource).toBe('bun:test')
    expect(r.scriptValue).toBe('bun test')
    expect(r.devDeps).toEqual({ '@types/bun': '^1.1.0' })
    // The slot prefix carries its own separator so the empty case
    // still resolves to a valid JSON array.
    expect(r.typesEntry).toBe(', "bun-types"')
  })

  // npm / pnpm / yarn share the vitest path — none of them ships an
  // in-runtime test runner, and vitest's surface is API-compatible
  // with `bun:test` so the same generated file runs unchanged.
  // Deno ships an in-runtime test runner, but it is not `describe` /
  // `test` / `expect`-compatible with the `bun:test` line `bf gen test`
  // emits — so a Deno scaffold rides the same vitest path as npm/pnpm/
  // yarn, keeping the generated test file runnable unchanged.
  test.each(['npm', 'pnpm', 'yarn', 'deno'] as const)(
    '%s: ships `vitest` import + `vitest run` script + vitest devDep + empty types entry',
    (pm) => {
      const r = testRunnerFor(pm)
      expect(r.importSource).toBe('vitest')
      // `vitest run` (not bare `vitest`) so CI doesn't hang in watch.
      expect(r.scriptValue).toBe('vitest run')
      expect(r.devDeps).toHaveProperty('vitest')
      // Vitest types come from the `vitest` import; no ambient entry
      // needed.
      expect(r.typesEntry).toBe('')
      // Negative guard: don't accidentally ship bun's type package
      // to non-bun users.
      expect(r.devDeps).not.toHaveProperty('@types/bun')
    },
  )
})
