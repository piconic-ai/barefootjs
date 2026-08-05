// `resolveScaffoldLayout` decides where `bf gen *` writes files. The pre-
// -fix `bf gen component` / `bf gen preview` always wrote relative to
// `ctx.root` — which in a scaffolded app is `node_modules/`. The next
// `npm install` would have wiped any generated user code. This suite
// pins the two-branch behavior (monorepo vs. project) so a future
// `bf gen *` command can stay scaffold-safe by default.

import { describe, test, expect } from 'bun:test'
import { resolveScaffoldLayout } from '../lib/scaffold-layout'
import { scaffold } from '../lib/scaffold'
import type { CliContext } from '../context'

function ctx(overrides: Partial<CliContext> = {}): CliContext {
  return {
    root: '/repo',
    metaDir: '/repo/meta',
    jsonFlag: false,
    config: null,
    projectDir: null,
    ...overrides,
  }
}

describe('resolveScaffoldLayout', () => {
  test('monorepo mode (no config): writes under ctx.root using the registry layout', () => {
    const layout = resolveScaffoldLayout(ctx())
    expect(layout.writeRoot).toBe('/repo')
    expect(layout.componentsBasePath).toBe('ui/components/ui')
  })

  test('project mode: writes under projectDir using paths.components from the project config', () => {
    const layout = resolveScaffoldLayout(
      ctx({
        projectDir: '/Users/me/my-app',
        config: {
          paths: { components: 'components/ui', tokens: 'tokens', meta: 'meta' },
        },
      }),
    )
    expect(layout.writeRoot).toBe('/Users/me/my-app')
    expect(layout.componentsBasePath).toBe('components/ui')
  })

  test('custom paths.components (e.g. src/ui) propagates through', () => {
    const layout = resolveScaffoldLayout(
      ctx({
        projectDir: '/project',
        config: {
          paths: { components: 'src/ui', tokens: 'tokens', meta: 'meta' },
        },
      }),
    )
    expect(layout.writeRoot).toBe('/project')
    expect(layout.componentsBasePath).toBe('src/ui')
  })
})

describe('scaffold (componentsBasePath wiring)', () => {
  // `metaDir = ''` is enough — we only assert the path shape, not the
  // body. The previous `scaffold(name, [], metaDir)` always returned
  // `ui/components/ui/<name>/...`, even for scaffolded apps where that
  // landed in `node_modules`.
  test('default base path matches the monorepo layout', () => {
    const result = scaffold('my-card', [], '')
    expect(result.componentPath).toBe('ui/components/ui/my-card/index.tsx')
    expect(result.testPath).toBe('ui/components/ui/my-card/index.test.tsx')
  })

  test('passing a scaffold path lands files under that project dir, not ui/components/ui', () => {
    const result = scaffold('my-card', [], '', 'components/ui')
    expect(result.componentPath).toBe('components/ui/my-card/index.tsx')
    expect(result.testPath).toBe('components/ui/my-card/index.test.tsx')
  })

  // PM-aware import selection (issue #1454): the emitted test's
  // `import { describe, ... } from '<runner>'` line follows the
  // runner `bf gen component` picks from `testRunnerFor(pm)`.
  // Default stays `bun:test` so existing callers behave unchanged.
  test('defaults the emitted test header to `from \'bun:test\'`', () => {
    const result = scaffold('my-card', [], '', 'components/ui')
    expect(result.testCode).toContain(`from 'bun:test'`)
    expect(result.testCode).not.toContain(`from 'vitest'`)
  })

  test('testImportSource swaps the header for non-bun scaffolds', () => {
    const result = scaffold('my-card', [], '', 'components/ui', {
      testImportSource: 'vitest',
    })
    expect(result.testCode).toContain(`import { describe, test, expect } from 'vitest'`)
    expect(result.testCode).not.toContain(`from 'bun:test'`)
  })
})
