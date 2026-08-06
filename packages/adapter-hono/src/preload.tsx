// @jsxRuntime automatic
// @jsxImportSource hono/jsx
//
// Pragmas as line-comments above the JSDoc; see scripts.tsx for the rationale.

/**
 * BfPreload Component
 *
 * Renders modulepreload link tags in the document head for faster module loading.
 * Modulepreload hints tell the browser to fetch and parse JavaScript modules early,
 * reducing the critical path latency.
 *
 * Usage:
 * ```tsx
 * import { BfPreload } from '@barefootjs/hono/preload'
 * import manifest from './dist/components/manifest.json' with { type: 'json' }
 *
 * <html>
 *   <head>
 *     <BfPreload />
 *     {/* or with additional scripts *\/}
 *     <BfPreload scripts={['/static/components/button.js']} />
 *     {/* or with manifest-based dependency preloading *\/}
 *     <BfPreload manifest={manifest} components={['Button', 'TodoApp']} />
 *   </head>
 *   <body>
 *     {children}
 *     <BfScripts />
 *   </body>
 * </html>
 * ```
 */

import { Fragment } from 'hono/jsx'

/**
 * Manifest entry type for dependency tracking.
 */
export interface ManifestEntry {
  markedTemplate: string
  clientJs?: string
  props?: Array<{ name: string; type: string; optional: boolean }>
  /**
   * Dependency component names for recursive preloading.
   * Note: no current producer (neither legacy site build nor @barefootjs/vite)
   * emits this field, so dependency recursion only activates for
   * hand-authored manifests. Kept for API compatibility.
   */
  dependencies?: string[]
}

/**
 * Manifest type mapping component names to their metadata.
 */
export type Manifest = Record<string, ManifestEntry>

export interface BfPreloadProps {
  /**
   * Path to static files directory.
   * @default '/static'
   */
  staticPath?: string

  /**
   * Additional script URLs to preload.
   * These are added in addition to the barefoot runtime.
   */
  scripts?: string[]

  /**
   * Whether to preload the barefoot runtime.
   * @default true
   */
  includeRuntime?: boolean

  /**
   * Component manifest with dependency information.
   * Used for automatic dependency chain preloading.
   */
  manifest?: Manifest

  /**
   * Component names to preload with their dependencies.
   * Requires manifest to be provided.
   */
  components?: string[]
}

/**
 * Resolves the full dependency chain for given components.
 * Uses a visited set to prevent infinite loops from circular dependencies.
 *
 * Manifest keys are whatever the manifest producer used — the legacy site
 * build uses path-qualified keys like `ui/button`, so component name entries
 * must match those exactly. A key mismatch is silently skipped (no error).
 *
 * @param components - Component names/keys to resolve (must match manifest keys exactly)
 * @param manifest - Component manifest with dependency information
 * @param visited - Set of already visited component names (for cycle detection)
 * @returns Array of clientJs paths for all dependencies
 */
function resolveDependencyChain(
  components: string[],
  manifest: Manifest,
  visited = new Set<string>()
): string[] {
  const result: string[] = []

  for (const compName of components) {
    if (visited.has(compName)) continue
    visited.add(compName)

    const entry = manifest[compName]
    if (!entry) continue

    // Add this component's clientJs
    if (entry.clientJs) {
      result.push(entry.clientJs)
    }

    // Recursively add dependencies
    if (entry.dependencies && entry.dependencies.length > 0) {
      const childScripts = resolveDependencyChain(entry.dependencies, manifest, visited)
      result.push(...childScripts)
    }
  }

  return result
}

/**
 * Renders modulepreload link tags for BarefootJS scripts.
 * Place this component in your <head> element.
 *
 * By default, preloads the barefoot.js runtime which is required
 * by all BarefootJS components.
 *
 * When manifest and components props are provided, automatically
 * preloads the full dependency chain for those components. The `components`
 * array entries must match manifest keys exactly — for the legacy site
 * build, use path-qualified keys like `ui/button`, not component names.
 * A mismatched key is silently skipped.
 */
export function BfPreload({
  staticPath = '/static',
  scripts = [],
  includeRuntime = true,
  manifest,
  components = [],
}: BfPreloadProps = {}) {
  const urls: string[] = []

  // Always preload the barefoot runtime first (most critical)
  if (includeRuntime) {
    urls.push(`${staticPath}/components/barefoot.js`)
  }

  // Auto-preload component dependencies from manifest
  if (manifest && components.length > 0) {
    const dependencyScripts = resolveDependencyChain(components, manifest)
    for (const script of dependencyScripts) {
      urls.push(`${staticPath}/${script}`)
    }
  }

  // Add additional scripts
  urls.push(...scripts)

  // Deduplicate URLs while preserving order
  const uniqueUrls = [...new Set(urls)]

  return (
    <Fragment>
      {uniqueUrls.map((url) => (
        <link rel="modulepreload" href={url} />
      ))}
    </Fragment>
  )
}
