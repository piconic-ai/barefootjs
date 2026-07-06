// `bf add <component...>` — Add components to a BarefootJS project.

import { existsSync, mkdirSync, copyFileSync, writeFileSync, readFileSync, readdirSync, utimesSync } from 'fs'
import path from 'path'
import type { CliContext } from '../context'
import type { BarefootConfig } from '../context'
import { resolveDependenciesFromSource } from '../lib/dependency-resolver'
import { extractMetaForFile } from './meta-extract'
import { commandsFor, detectPackageManager } from '../lib/pm'
import type { MetaIndex, MetaIndexEntry, ComponentMeta, RegistryItem } from '../lib/types'

/**
 * Touch `uno.config.ts` so a running `unocss --watch` re-scans its
 * globs and picks up files in newly-created component directories.
 * chokidar (used by the UnoCSS CLI) resolves `**` globs to the set of
 * directories that exist at startup; directories created later by
 * `bf add` are invisible until the watcher restarts or the config
 * file's mtime changes.
 */
function kickCssWatcher(projectDir: string): void {
  const unoConfig = path.resolve(projectDir, 'uno.config.ts')
  if (!existsSync(unoConfig)) return
  const now = new Date()
  try { utimesSync(unoConfig, now, now) } catch { /* best-effort */ }
}

export async function run(args: string[], ctx: CliContext): Promise<void> {
  const force = args.includes('--force')

  // Parse --registry flag
  let registryUrl: string | undefined
  const regIdx = args.indexOf('--registry')
  if (regIdx !== -1) {
    const regValue = args[regIdx + 1]
    if (!regValue || regValue.startsWith('-')) {
      console.error('Error: --registry requires a URL argument.')
      process.exit(1)
    }
    registryUrl = regValue
    args = [...args.slice(0, regIdx), ...args.slice(regIdx + 2)]
  }

  const componentNames = args.filter(a => !a.startsWith('--'))

  if (componentNames.length === 0) {
    console.error('Usage: bf add <component...> [--force] [--registry <url>]')
    process.exit(1)
  }

  if (!ctx.config || !ctx.projectDir) {
    console.error('Error: project config not found. Run `npm create barefootjs@latest` first.')
    console.error('       (looked for barefoot.config.ts walking up from the cwd)')
    process.exit(1)
  }

  const projectDir = ctx.projectDir
  const config = ctx.config

  // Resolution order for source-of-truth:
  //   1. Explicit `--registry <url>` always wins (used for staging URLs,
  //      local mirrors, pkg-pr-new previews, etc.).
  //   2. Monorepo dev: in the BarefootJS source repo, `ui/components/ui/`
  //      exists next to `ctx.root` and `addFromLocal` lets contributors
  //      iterate without a network round-trip.
  //   3. Everywhere else (i.e. scaffolded apps): fall back to the public
  //      registry. Before this, `bf add button` in a scaffolded app went
  //      down `addFromLocal` and failed with "not found in source
  //      registry" because it was looking inside `node_modules/`.
  const monorepoSourceDir = path.resolve(ctx.root, 'ui/components/ui')
  const monorepoMode = existsSync(monorepoSourceDir)

  if (registryUrl) {
    await addFromRegistry(componentNames, registryUrl, projectDir, config, force, false)
  } else if (monorepoMode) {
    addFromLocal(componentNames, ctx, projectDir, config, force)
  } else {
    await addFromRegistry(componentNames, DEFAULT_REGISTRY_URL, projectDir, config, force, false)
  }
}

// Default UI registry. Mirrors `commands/init.ts`'s constant so a
// freshly scaffolded app and a follow-up `bf add` both reach the same
// host. Keeping a duplicate constant here (rather than re-exporting
// init's) avoids importing init's full surface, which carries a
// spinner / TTY-prompt dependency.
const DEFAULT_REGISTRY_URL = 'https://ui.barefootjs.dev/r/'

/**
 * Normalize a component name to the registry's canonical kebab-case form.
 * The registry stores entries as `<name>.json` with lowercase kebab-case
 * names (`radio-group.json`, `input-otp.json`), but users naturally type
 * PascalCase or camelCase to match the JSX import (`bf add RadioGroup`).
 * Without normalization the literal name 404s — `bf docs <name>` already
 * normalizes via `tryLoadComponent`'s case-insensitive fallback; mirror
 * that here so both paths accept the same surface.
 *
 *   Button       → button
 *   Combobox     → combobox
 *   RadioGroup   → radio-group
 *   InputOTP     → input-otp
 *   input-group  → input-group   (already canonical — no change)
 */
export function toRegistryName(name: string): string {
  return name
    // `RadioGroup` → `Radio-Group`, `InputOTP` → `InputOTP` (acronym not split here)
    .replace(/([a-z\d])([A-Z])/g, '$1-$2')
    // `InputOTP` → `Input-OTP` (split trailing acronym before final word boundary)
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1-$2')
    .toLowerCase()
}

/**
 * Fetch a single registry item. Returns null if skipErrors is true and fetch fails.
 *
 * Names are normalized through `toRegistryName` so PascalCase / camelCase
 * inputs hit the registry's canonical kebab-case URL. If the literal name
 * differs from the normalized one we retry against the literal URL only
 * when the canonical fetch 404s — staging registries that legitimately
 * use mixed-case keys keep working.
 */
async function tryFetchRegistryItem(
  registryUrl: string,
  name: string,
  skipErrors: boolean,
): Promise<RegistryItem | null> {
  const base = registryUrl.endsWith('/') ? registryUrl : `${registryUrl}/`
  const canonical = toRegistryName(name)
  const candidates: string[] = canonical === name ? [name] : [canonical, name]
  let lastUrl = ''
  let lastStatus = 0
  for (const candidate of candidates) {
    const url = `${base}${candidate}.json`
    lastUrl = url
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(10_000) })
      if (res.ok) return await res.json()
      lastStatus = res.status
      // Only fall through to the literal-name retry on 404 — other
      // HTTP errors (5xx, auth) shouldn't trigger an extra round-trip.
      if (res.status !== 404) break
    } catch (err) {
      if (skipErrors) return null
      console.error(`Error: Failed to fetch component "${name}" from ${url}: ${err instanceof Error ? err.message : err}`)
      process.exit(1)
    }
  }
  if (skipErrors) return null
  console.error(`Error: Registry returned HTTP ${lastStatus} for ${lastUrl}`)
  process.exit(1)
}

/**
 * Add components from a remote registry.
 * Phase 1: Fetch all registry items, resolving `requires` dependencies transitively.
 * Phase 2: Write files only if all fetches succeeded (or skip failures when skipErrors=true).
 */
export async function addFromRegistry(
  componentNames: string[],
  registryUrl: string,
  projectDir: string,
  config: BarefootConfig,
  force: boolean,
  skipErrors = false,
  // `silent` suppresses the per-step summary lines so callers that
  // wrap this in a spinner (notably `barefoot init`) don't interleave
  // output with the spinner frames.
  silent = false,
): Promise<void> {
  // Phase 1: Fetch all registry items, resolving requires transitively
  const fetched = new Map<string, RegistryItem>()
  const failed = new Set<string>()
  const queue = [...componentNames]

  while (queue.length > 0) {
    const pending = queue.filter(n => !fetched.has(n) && !failed.has(n))
    if (pending.length === 0) break

    const results = await Promise.all(
      pending.map(name => tryFetchRegistryItem(registryUrl, name, skipErrors))
    )

    for (let i = 0; i < pending.length; i++) {
      const item = results[i]
      if (!item) {
        failed.add(pending[i])
        continue
      }
      fetched.set(item.name, item)
      // Enqueue any requires that haven't been fetched yet
      if (item.requires) {
        for (const dep of item.requires) {
          if (!fetched.has(dep) && !failed.has(dep) && !queue.includes(dep)) {
            queue.push(dep)
          }
        }
      }
    }

    // Remove processed items from queue
    queue.splice(0, pending.length)
  }

  if (failed.size > 0 && !silent) {
    console.log(`  Skipped ${failed.size} unavailable component(s)`)
  }

  const items = Array.from(fetched.values())
  const autoDeps = items
    .map(i => i.name)
    .filter(n => !componentNames.includes(n))
  if (autoDeps.length > 0 && !silent) {
    console.log(`  Resolved dependencies: ${autoDeps.join(', ')}`)
  }

  // Merge all files into a deduplication map (path → content)
  const fileMap = new Map<string, string>()
  for (const item of items) {
    for (const file of item.files) {
      fileMap.set(file.path, file.content)
    }
  }

  // Phase 2: Write files
  const destComponentsDir = path.resolve(projectDir, config.paths.components)
  const destMetaDir = path.resolve(projectDir, config.paths.meta)
  mkdirSync(destComponentsDir, { recursive: true })
  mkdirSync(destMetaDir, { recursive: true })

  const added: string[] = []
  const skipped: string[] = []
  // `index.tsx` paths we just wrote. Each one is a freshly-added
  // component whose meta we still need to extract — the registry only
  // ships sources (`registry:ui` files), so without this step
  // `meta/<name>.json` stays missing and `bf docs <name>` fails.
  const writtenIndexPaths: string[] = []

  for (const [filePath, content] of fileMap) {
    // Map path: "components/ui/xxx/..." → config.paths.components/xxx/...
    // Everything else → project root relative
    let destPath: string
    if (filePath.startsWith('components/ui/')) {
      const relPath = filePath.slice('components/ui/'.length)
      destPath = path.resolve(destComponentsDir, relPath)
    } else {
      destPath = path.resolve(projectDir, filePath)
    }

    if (existsSync(destPath) && !force) {
      skipped.push(filePath)
      continue
    }

    mkdirSync(path.dirname(destPath), { recursive: true })
    writeFileSync(destPath, content)
    added.push(filePath)
    if (destPath.endsWith(`${path.sep}index.tsx`) && filePath.startsWith('components/ui/')) {
      writtenIndexPaths.push(destPath)
    }
  }

  // Extract meta for each freshly-written component so `bf docs <name>`
  // resolves immediately after `bf add`. We swallow per-file extraction
  // failures (malformed source, analyzer crash) instead of failing the
  // whole add — the source files are already on disk and the user can
  // re-run `bf meta extract` to retry. `silent` callers (e.g. init)
  // still get the warning via stderr so transient bugs aren't hidden.
  for (const indexPath of writtenIndexPaths) {
    try {
      const { meta } = extractMetaForFile(indexPath, projectDir)
      writeFileSync(
        path.join(destMetaDir, `${meta.name}.json`),
        JSON.stringify(meta, null, 2) + '\n',
      )
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      console.warn(`  Warning: failed to extract meta for ${indexPath}: ${msg}`)
    }
  }

  // Rebuild meta/index.json if meta dir exists
  if (existsSync(destMetaDir)) {
    rebuildMetaIndex(destMetaDir)
  }

  if (added.length > 0) {
    kickCssWatcher(projectDir)
  }

  // Summary
  if (silent) return
  if (added.length > 0) {
    console.log(`\n  Added: ${added.join(', ')}`)
  }
  if (skipped.length > 0) {
    console.log(`  Skipped (already exists): ${skipped.join(', ')}`)
    console.log(`  Use --force to overwrite existing components.`)
  }
  if (added.length > 0) {
    const pm = detectPackageManager(projectDir)
    console.log(`\n  Run tests: ${commandsFor(pm).test(`${config.paths.components}/`)}`)
  }
}

/**
 * Add components from local monorepo source (original behavior).
 */
function addFromLocal(
  componentNames: string[],
  ctx: CliContext,
  projectDir: string,
  config: BarefootConfig,
  force: boolean,
): void {
  // Source directories (monorepo)
  const srcComponentsDir = path.resolve(ctx.root, 'ui/components/ui')
  const srcMetaDir = path.resolve(ctx.root, 'ui/meta')

  // Destination directories (user project)
  const destComponentsDir = path.resolve(projectDir, config.paths.components)
  const destMetaDir = path.resolve(projectDir, config.paths.meta)

  // Validate requested components exist in source
  for (const name of componentNames) {
    const srcFile = path.join(srcComponentsDir, name, 'index.tsx')
    if (!existsSync(srcFile)) {
      console.error(`Error: Component "${name}" not found in source registry.`)
      console.error(`  Expected: ${srcFile}`)
      process.exit(1)
    }
  }

  // Resolve dependencies by scanning source. We deliberately avoid
  // `ui/meta/<name>.json` here — meta is a derived artefact that can
  // drift between `bf meta extract` runs, and trusting it dropped
  // co-required siblings like `icon` from `bf add checkbox` (#1435).
  const allComponents = resolveDependenciesFromSource(componentNames, srcComponentsDir)
  const autoDeps = allComponents.filter(c => !componentNames.includes(c))

  if (autoDeps.length > 0) {
    console.log(`  Resolved dependencies: ${autoDeps.join(', ')}`)
  }

  // Ensure directories exist
  mkdirSync(destComponentsDir, { recursive: true })
  mkdirSync(destMetaDir, { recursive: true })

  const added: string[] = []
  const skipped: string[] = []

  for (const name of allComponents) {
    const destDir = path.join(destComponentsDir, name)
    const destFile = path.join(destDir, 'index.tsx')

    // Skip if already exists (unless --force)
    if (existsSync(destFile) && !force) {
      skipped.push(name)
      continue
    }

    mkdirSync(destDir, { recursive: true })

    // Copy component source → <name>/index.tsx
    const srcFile = path.join(srcComponentsDir, name, 'index.tsx')
    if (existsSync(srcFile)) {
      copyFileSync(srcFile, destFile)
    }

    // Copy test → <name>/index.test.tsx
    const srcTest = path.join(srcComponentsDir, name, 'index.test.tsx')
    if (existsSync(srcTest)) {
      copyFileSync(srcTest, path.join(destDir, 'index.test.tsx'))
    }

    // Copy preview → <name>/index.preview.tsx
    const srcPreview = path.join(srcComponentsDir, name, 'index.preview.tsx')
    if (existsSync(srcPreview)) {
      copyFileSync(srcPreview, path.join(destDir, 'index.preview.tsx'))
    }

    // Copy meta JSON
    const srcMeta = path.join(srcMetaDir, `${name}.json`)
    const destMeta = path.join(destMetaDir, `${name}.json`)
    if (existsSync(srcMeta)) {
      copyFileSync(srcMeta, destMeta)
    }

    added.push(name)
  }

  // Rebuild meta/index.json from meta/*.json files
  rebuildMetaIndex(destMetaDir)

  if (added.length > 0) {
    kickCssWatcher(projectDir)
  }

  // Summary
  if (added.length > 0) {
    console.log(`\n  Added: ${added.join(', ')}`)
  }
  if (skipped.length > 0) {
    console.log(`  Skipped (already exists): ${skipped.join(', ')}`)
    console.log(`  Use --force to overwrite existing components.`)
  }
  if (added.length > 0) {
    const pm = detectPackageManager(projectDir)
    console.log(`\n  Run tests: ${commandsFor(pm).test(`${config.paths.components}/`)}`)
  }
}

/**
 * Rebuild meta/index.json from all meta/*.json files in the directory.
 */
function rebuildMetaIndex(metaDir: string): void {
  const entries: MetaIndexEntry[] = []

  const files = readdirSync(metaDir).filter(f => f.endsWith('.json') && f !== 'index.json')
  for (const file of files.sort()) {
    try {
      const meta: ComponentMeta = JSON.parse(readFileSync(path.join(metaDir, file), 'utf-8'))
      entries.push({
        name: meta.name,
        title: meta.title,
        category: meta.category,
        description: meta.description,
        tags: meta.tags,
        stateful: meta.stateful,
        ...(meta.subComponents && meta.subComponents.length > 0
          ? { subComponents: meta.subComponents.map(sc => sc.name) }
          : {}),
      })
    } catch {
      // Skip malformed files
    }
  }

  const index: MetaIndex = {
    version: 1,
    generatedAt: new Date().toISOString(),
    components: entries,
  }

  writeFileSync(path.join(metaDir, 'index.json'), JSON.stringify(index, null, 2) + '\n')
}
