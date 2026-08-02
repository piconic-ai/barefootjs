/**
 * Path helpers for mirroring a component's position under a configured
 * `components` source dir into the `templates` output dir — the same
 * "on-disk layout mirrors source layout" convention `packages/cli/src/lib/
 * build.ts` uses (`effectiveNamesFor` / `effectiveOutName` /
 * `buildRelativeImportRewriter`), ported and simplified for this plugin's
 * needs rather than imported: `@barefootjs/cli`'s only published entry
 * point is the `bf` binary, and that module pulls in the CLI's whole
 * esbuild-based build pipeline (being retired by this very package) as a
 * side effect of import.
 */
import { basename, dirname, relative, resolve, sep } from 'node:path'

/** Posix-normalized path of `absPath` relative to `root` (manifest keys and
 * Rollup `input` specifiers both want forward slashes regardless of OS). */
export function toPosixRelative(root: string, absPath: string): string {
  return relative(root, absPath).split(sep).join('/')
}

/**
 * `absPath`'s position relative to whichever `componentDirs` entry
 * contains it (POSIX, WITH extension) — e.g. `ui/button/index.tsx` for
 * `<componentDir>/ui/button/index.tsx`. Falls back to the bare basename
 * when the file isn't under any configured dir (shouldn't happen for
 * discovered files, but keeps this total).
 */
export function relativeUnderComponentDir(absPath: string, componentDirs: readonly string[]): string {
  for (const dir of componentDirs) {
    if (absPath === dir) continue
    if (absPath.startsWith(dir + sep)) {
      return absPath.slice(dir.length + 1).split(sep).join('/')
    }
  }
  return basename(absPath)
}

/** Swap `.tsx`/`.ts` for `newExtension` (e.g. adapter.extension, or
 * `.ssr-defaults.json`) on a POSIX relative path. */
export function withExtension(relPath: string, newExtension: string): string {
  return relPath.replace(/\.tsx?$/, newExtension)
}

/**
 * Output path (relative to `templatesDir`, still POSIX) for a
 * `templatesPerComponent` adapter's per-component file — same directory as
 * the source file's mirror, named after the exported component instead of
 * the source basename (Mojolicious-style template lookup by component
 * name).
 */
export function perComponentRelPath(relUnderComponentDir: string, componentName: string, extension: string): string {
  const dir = dirname(relUnderComponentDir)
  return dir === '.' ? `${componentName}${extension}` : `${dir}/${componentName}${extension}`
}

/**
 * Build a `rewriteRelativeImport` function for `compileJSX` — re-anchors a
 * relative specifier written in `sourcePath` so it still resolves once the
 * template is emitted to `outputPath` under `templatesDir` instead of
 * living beside its source. Ported from `packages/cli/src/lib/build.ts`'s
 * `buildRelativeImportRewriter` (same behavior); ported rather than
 * imported for the reason in this file's header comment. Only exercised by
 * adapters whose templates carry real `import` statements (Hono-shaped
 * JS-runtime adapters) — Go/Mojo/etc. templates have no import syntax and
 * never call this.
 */
export function buildRelativeImportRewriter(
  sourcePath: string,
  outputPath: string,
  componentDirs: readonly string[],
  templatesDir: string,
): (importPath: string) => string {
  const sourceDir = dirname(sourcePath)
  const outputDir = dirname(outputPath)

  return (importPath: string): string => {
    const srcAbs = resolve(sourceDir, importPath)
    let targetAbs = srcAbs
    for (const componentDir of componentDirs) {
      if (srcAbs === componentDir || srcAbs.startsWith(componentDir + sep)) {
        const relUnderComponentDir = srcAbs === componentDir ? '' : srcAbs.slice(componentDir.length + 1)
        targetAbs = relUnderComponentDir ? resolve(templatesDir, relUnderComponentDir) : templatesDir
        break
      }
    }
    let rewritten = relative(outputDir, targetAbs)
    if (rewritten === '') rewritten = '.'
    if (!rewritten.startsWith('.')) rewritten = './' + rewritten
    return rewritten
  }
}
