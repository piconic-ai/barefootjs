// Resolve everything `bf preview` needs to build a standalone, styled
// page, working both inside the barefootjs monorepo and in an end-user
// project that installed @barefootjs/cli under Node.
//
// Resolution order per asset (first match wins):
//   1. The user's project (their own tokens / globals.css / uno.config)
//   2. The monorepo `site/` sources (when running inside the monorepo)
//   3. Defaults shipped inside the CLI (bundled next to dist/index.js)
//
// Preferring the user's CSS matches preview's purpose: show the
// component as it looks in their project. The bundled defaults are the
// registry's own design system so `bf add`-ed components render with
// zero setup.

import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { CliContext } from '../../context'
import { loadTokensCss } from '../tokens'
import { PreviewError } from './errors'

// Bundled (dist) at runtime; src/lib/preview in source mode. The default
// assets only exist next to the bundle, so source mode falls through to
// the monorepo `site/` candidates below — which is where it runs.
const assetDir = dirname(fileURLToPath(import.meta.url))

export interface PreviewAssets {
  /** Output + esbuild working root (.preview-dist lives here). */
  rootDir: string
  /** Directory holding `<name>/index.tsx` and `<name>/index.preview.tsx`. */
  srcComponentsDir: string
  /** Rendered design-token CSS (`:root` + `.dark`). */
  tokensCss: string
  /** globals.css contents (empty string if none resolved). */
  globalsCss: string
  /** Path to the self-contained @barefootjs/client standalone runtime. */
  runtimeStandalone: string
  uno: {
    bin: string
    cwd: string
    configPath: string
    /**
     * True when configPath is the CLI-bundled default. Its `import 'unocss'`
     * only resolves from within a tree that has unocss installed, so the
     * caller copies it into the project (.preview-dist) before running.
     */
    configIsBundled: boolean
    globs: string[]
  }
}

function firstExisting(...candidates: (string | undefined)[]): string | undefined {
  return candidates.find((c): c is string => !!c && existsSync(c))
}

function unoBinCandidates(dir: string): string[] {
  return ['unocss', 'unocss.cmd', 'unocss.CMD'].map(n => resolve(dir, 'node_modules/.bin', n))
}

export async function resolvePreviewAssets(ctx: CliContext): Promise<PreviewAssets> {
  const monorepo = ctx.config === null
  const projectDir = ctx.projectDir
  const rootDir = projectDir ?? ctx.root

  const srcComponentsDir = monorepo
    ? resolve(ctx.root, 'ui/components/ui')
    : resolve(projectDir!, ctx.config!.paths.components)

  // 1. Tokens → CSS (already layered user → monorepo → bundled default).
  const tokensCss = await loadTokensCss(ctx)

  // 2. globals.css
  const globalsPath = firstExisting(
    projectDir && resolve(projectDir, 'styles/globals.css'),
    projectDir && resolve(projectDir, 'globals.css'),
    projectDir && resolve(projectDir, 'app/globals.css'),
    monorepo ? resolve(ctx.root, 'site/ui/styles/globals.css') : undefined,
    resolve(assetDir, 'preview-globals.css'),
  )
  const globalsCss = globalsPath ? await readFile(globalsPath, 'utf-8') : ''

  // 3. UnoCSS config
  const bundledUnoConfig = resolve(assetDir, 'preview-uno.config.ts')
  const configPath = firstExisting(
    projectDir && resolve(projectDir, 'uno.config.ts'),
    projectDir && resolve(projectDir, 'uno.config.js'),
    monorepo ? resolve(ctx.root, 'site/ui/uno.config.ts') : undefined,
    bundledUnoConfig,
  )
  if (!configPath) {
    throw new PreviewError(
      'No UnoCSS config found and the bundled default is missing — reinstall @barefootjs/cli.',
    )
  }

  // UnoCSS scan target + working dir. The monorepo keeps its proven
  // site/ui-relative globs; a project scans its component directory.
  const unoCwd = monorepo ? resolve(ctx.root, 'site/ui') : rootDir
  const globs = monorepo
    ? ['../../ui/components/**/*.tsx', './**/*.tsx', './dist/**/*.tsx']
    : [resolve(srcComponentsDir, '**/*.tsx')]

  const unoBin = firstExisting(
    ...unoBinCandidates(rootDir),
    ...(monorepo ? unoBinCandidates(resolve(ctx.root, 'site/ui')) : []),
    ...(monorepo ? unoBinCandidates(ctx.root) : []),
  )
  if (!unoBin) {
    throw new PreviewError(
      'UnoCSS CLI not found. Install it in your project to generate preview styles:\n' +
      '  npm install -D unocss @unocss/cli',
    )
  }

  // 4. @barefootjs/client standalone runtime (no build step).
  const runtimeStandalone = firstExisting(
    monorepo ? resolve(ctx.root, 'packages/client/dist/runtime/standalone.js') : undefined,
    resolve(rootDir, 'node_modules/@barefootjs/client/dist/runtime/standalone.js'),
    resolve(rootDir, 'node_modules/@barefootjs/client/dist/runtime/index.js'),
  )
  if (!runtimeStandalone) {
    throw new PreviewError(
      'The @barefootjs/client runtime was not found. Install @barefootjs/client in your project ' +
      '(its dist must include runtime/standalone.js).',
    )
  }

  return {
    rootDir,
    srcComponentsDir,
    tokensCss,
    globalsCss,
    runtimeStandalone,
    uno: { bin: unoBin, cwd: unoCwd, configPath, configIsBundled: configPath === bundledUnoConfig, globs },
  }
}
