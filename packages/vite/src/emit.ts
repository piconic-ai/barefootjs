/**
 * Turn a `CompileResult` into on-disk files under the configured
 * `templates` dir, mirroring the component's position under its
 * `components` source dir.
 *
 * Adapter-generated `types` output (e.g. Go's per-component Props struct +
 * `NewXxxProps` constructor) is written RAW, one file per source, rather
 * than combined into a single backend-native file (Go's `components.go`).
 * Combining is a real per-language operation — for Go specifically it
 * means stripping each fragment's `package`/import header and injecting a
 * single shared `randomID` helper the individual fragments assume exists
 * (see `@barefootjs/go-template/go-types.ts`'s `combineGoTypes`) — and it
 * lives entirely OUTSIDE this core plugin, in each adapter's own `/vite`
 * composition wrapper, driven by core's `afterEmit` escape hatch (see
 * `AfterEmitContext`). Each `.types` fragment is written next to its
 * template so it's visible on disk, but treat it as source material, not a
 * ready-to-compile file.
 */
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import type { CompileResult, TemplateAdapter } from '@barefootjs/jsx'
import { perComponentRelPath, relativeUnderComponentDir, withExtension } from './paths.ts'

export interface EmitTarget {
  /** POSIX path, relative to the `templates` dir. */
  relPath: string
  content: string
}

export function planEmits(
  result: CompileResult,
  absPath: string,
  componentDirs: readonly string[],
  adapter: TemplateAdapter,
): EmitTarget[] {
  const relUnderComponentDir = relativeUnderComponentDir(absPath, componentDirs)
  const targets: EmitTarget[] = []

  for (const tpl of result.files.filter(f => f.type === 'markedTemplate')) {
    const relPath = adapter.templatesPerComponent && tpl.componentName
      ? perComponentRelPath(relUnderComponentDir, tpl.componentName, adapter.extension)
      : withExtension(relUnderComponentDir, adapter.extension)
    targets.push({ relPath, content: tpl.content })
  }

  for (const ssr of result.files.filter(f => f.type === 'ssrDefaults')) {
    const relPath = adapter.templatesPerComponent && ssr.componentName
      ? perComponentRelPath(relUnderComponentDir, ssr.componentName, '.ssr-defaults.json')
      : withExtension(relUnderComponentDir, '.ssr-defaults.json')
    targets.push({ relPath, content: ssr.content })
  }

  for (const types of result.files.filter(f => f.type === 'types')) {
    targets.push({ relPath: withExtension(relUnderComponentDir, '.types'), content: types.content })
  }

  return targets
}

export async function writeEmits(templatesDir: string, targets: EmitTarget[]): Promise<void> {
  for (const target of targets) {
    const outPath = resolve(templatesDir, target.relPath)
    await mkdir(dirname(outPath), { recursive: true })
    await writeFile(outPath, target.content)
  }
}
