// `barefoot add <component...>` — Add components to a BarefootJS project.

import { existsSync, mkdirSync, copyFileSync, writeFileSync, readFileSync, readdirSync } from 'fs'
import path from 'path'
import type { CliContext } from '../context'
import type { BarefootConfig } from '../context'
import { resolveDependencies } from '../lib/dependency-resolver'
import type { MetaIndex, MetaIndexEntry, ComponentMeta, RegistryItem } from '../lib/types'

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
    console.error('Usage: barefoot add <component...> [--force] [--registry <url>]')
    process.exit(1)
  }

  if (!ctx.config || !ctx.projectDir) {
    console.error('Error: project config not found. Run `barefoot init` first.')
    console.error('       (looked for barefoot.config.ts walking up from the cwd)')
    process.exit(1)
  }

  const projectDir = ctx.projectDir
  const config = ctx.config

  if (registryUrl) {
    await addFromRegistry(componentNames, registryUrl, projectDir, config, force, false)
  } else {
    addFromLocal(componentNames, ctx, projectDir, config, force)
  }
}

/**
 * Fetch a single registry item. Returns null if skipErrors is true and fetch fails.
 */
async function tryFetchRegistryItem(
  registryUrl: string,
  name: string,
  skipErrors: boolean,
): Promise<RegistryItem | null> {
  const base = registryUrl.endsWith('/') ? registryUrl : `${registryUrl}/`
  const url = `${base}${name}.json`
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(10_000) })
    if (!res.ok) {
      if (skipErrors) return null
      console.error(`Error: Registry returned HTTP ${res.status} for ${url}`)
      process.exit(1)
    }
    return await res.json()
  } catch (err) {
    if (skipErrors) return null
    console.error(`Error: Failed to fetch component "${name}" from ${url}: ${err instanceof Error ? err.message : err}`)
    process.exit(1)
  }
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

  if (failed.size > 0) {
    console.log(`  Skipped ${failed.size} unavailable component(s)`)
  }

  const items = Array.from(fetched.values())
  const autoDeps = items
    .map(i => i.name)
    .filter(n => !componentNames.includes(n))
  if (autoDeps.length > 0) {
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
  }

  // Rebuild meta/index.json if meta dir exists
  if (existsSync(destMetaDir)) {
    rebuildMetaIndex(destMetaDir)
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
    console.log(`\n  Run tests: bun test ${config.paths.components}/`)
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

  // Resolve dependencies
  const allComponents = resolveDependencies(componentNames, srcMetaDir)
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

  // Summary
  if (added.length > 0) {
    console.log(`\n  Added: ${added.join(', ')}`)
  }
  if (skipped.length > 0) {
    console.log(`  Skipped (already exists): ${skipped.join(', ')}`)
    console.log(`  Use --force to overwrite existing components.`)
  }
  if (added.length > 0) {
    console.log(`\n  Run tests: bun test ${config.paths.components}/`)
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
