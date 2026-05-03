// Go template build config factory for barefoot.config.ts

import type { BuildOptions, PostBuildContext } from '@barefootjs/jsx'
import { GoTemplateAdapter } from './adapter'
import type { GoTemplateAdapterOptions } from './adapter'

export interface GoTemplateBuildOptions extends BuildOptions {
  /** Adapter-specific options passed to GoTemplateAdapter */
  adapterOptions?: GoTemplateAdapterOptions
  /** Output path for combined Go types file (relative to projectDir, default: 'components.go') */
  typesOutputFile?: string
  /** Transform the combined types string before writing (for app-specific type fixes) */
  transformTypes?: (types: string) => string
  /** Manual type definitions to append (app-specific types not generated from components) */
  manualTypes?: string
}

// ── Go type helpers ──────────────────────────────────────────────────────

/**
 * Strip Go package header and import block, returning only type definitions.
 */
export function stripGoPackageHeader(types: string): string {
  const lines = types.split('\n')
  const packageEnd = lines.findIndex(l => l.startsWith('package '))
  if (packageEnd < 0) return types

  let startLine = packageEnd + 1
  let inImportBlock = false

  while (startLine < lines.length) {
    const line = lines[startLine]
    const trimmedLine = line?.trim() ?? ''

    if (trimmedLine === '') {
      startLine++
      continue
    }

    // Single-line import: import "foo"
    if (trimmedLine.startsWith('import ') && !trimmedLine.includes('(')) {
      startLine++
      continue
    }

    // Multi-line import block: import (
    if (trimmedLine.startsWith('import (')) {
      inImportBlock = true
      startLine++
      continue
    }

    if (inImportBlock) {
      if (trimmedLine === ')') {
        inImportBlock = false
      }
      startLine++
      continue
    }

    break
  }

  return lines.slice(startLine).join('\n').trim()
}

/**
 * Deduplicate Go type definitions and NewXxxProps constructor functions.
 * When duplicates exist, prefer the version that contains ScopeID (the complete Props struct
 * from generatePropsStruct) over the simplified version from typeDefinitions.
 */
export function deduplicateGoTypes(combined: string): string {
  // --- Pass 1: Collect all type definitions, preferring ScopeID-containing versions ---
  const typeRegex = /\/\/ \w+ (?:is|represents) .*\ntype (\w+) (?:struct\s*\{[\s\S]*?^\}|= \w+)/gm
  const bestTypes = new Map<string, string>()
  let match: RegExpExecArray | null
  while ((match = typeRegex.exec(combined)) !== null) {
    const typeName = match[1]
    const fullMatch = match[0]
    const existing = bestTypes.get(typeName)
    if (!existing) {
      bestTypes.set(typeName, fullMatch)
    } else {
      // Prefer the version with ScopeID (complete Props struct)
      if (!existing.includes('ScopeID') && fullMatch.includes('ScopeID')) {
        bestTypes.set(typeName, fullMatch)
      }
    }
  }

  // Remove all type definitions from the combined string
  let result = combined.replace(typeRegex, '')

  // Re-insert the best version of each type
  const typeInsertions = Array.from(bestTypes.values()).join('\n\n')
  // Insert types at the beginning (after any leading whitespace)
  result = typeInsertions + '\n\n' + result

  // --- Pass 2: Deduplicate NewXxxProps functions (prefer version with ScopeID) ---
  const funcRegex = /\/\/ (New\w+Props) creates .*\nfunc \1\([^)]*\) \w+ \{[\s\S]*?\n\}/g
  const bestFuncs = new Map<string, string>()
  while ((match = funcRegex.exec(result)) !== null) {
    const funcName = match[1]
    const fullMatch = match[0]
    const existing = bestFuncs.get(funcName)
    if (!existing) {
      bestFuncs.set(funcName, fullMatch)
    } else {
      if (!existing.includes('ScopeID') && fullMatch.includes('ScopeID')) {
        bestFuncs.set(funcName, fullMatch)
      }
    }
  }

  result = result.replace(funcRegex, '')
  const funcInsertions = Array.from(bestFuncs.values()).join('\n\n')
  if (funcInsertions) {
    result = result + '\n\n' + funcInsertions
  }

  // Clean up multiple empty lines
  return result.replace(/\n{3,}/g, '\n\n').trim()
}

/**
 * Combine Go types from multiple components into a single .go file.
 */
export function combineGoTypes(options: {
  types: Map<string, string>
  packageName: string
  manualTypes?: string
  transformTypes?: (types: string) => string
}): string {
  const { types, packageName, manualTypes, transformTypes } = options

  // Strip package headers and collect raw type bodies.
  // A single types entry may contain multiple package headers (from multi-component files),
  // so split on 'package ' boundaries and strip each section individually.
  const typeBodies: string[] = []
  for (const [, content] of types) {
    // Split on package boundaries to handle multi-component files
    const sections = content.split(/(?=^package \w+)/m)
    for (const section of sections) {
      const stripped = stripGoPackageHeader(section.trim())
      if (stripped) typeBodies.push(stripped)
    }
  }

  if (typeBodies.length === 0 && !manualTypes) return ''

  // Combine and deduplicate
  let combinedContent = deduplicateGoTypes(typeBodies.join('\n\n'))

  // Apply app-specific transforms
  if (transformTypes) {
    combinedContent = transformTypes(combinedContent)
  }

  // Build final file
  const parts = [
    `// Code generated by BarefootJS. DO NOT EDIT.`,
    `package ${packageName}`,
    '',
    `import (`,
    `\t"math/rand"`,
    '',
    `\tbf "github.com/barefootjs/runtime/bf"`,
    `)`,
    '',
    `// randomID generates a random string of length n for ScopeID.`,
    `func randomID(n int) string {`,
    `\tconst chars = "abcdefghijklmnopqrstuvwxyz0123456789"`,
    `\tb := make([]byte, n)`,
    `\tfor i := range b {`,
    `\t\tb[i] = chars[rand.Intn(len(chars))]`,
    `\t}`,
    `\treturn string(b)`,
    `}`,
  ]

  if (manualTypes) {
    parts.push('', manualTypes)
  }

  if (combinedContent) {
    parts.push('', combinedContent)
  }

  return parts.join('\n') + '\n'
}

// ── Config factory ───────────────────────────────────────────────────────

/**
 * Create a BarefootBuildConfig for Go html/template projects.
 *
 * Uses structural typing — does not import BarefootBuildConfig to avoid
 * circular dependency between @barefootjs/go-template and @barefootjs/cli.
 */
export function createConfig(options: GoTemplateBuildOptions = {}) {
  const packageName = options.adapterOptions?.packageName ?? 'main'
  const typesOutputFile = options.typesOutputFile ?? 'components.go'

  const postBuild = async (ctx: PostBuildContext) => {
    if (ctx.types.size === 0) return

    const content = combineGoTypes({
      types: ctx.types,
      packageName,
      manualTypes: options.manualTypes,
      transformTypes: options.transformTypes,
    })

    if (content) {
      const { resolve } = await import('node:path')
      const { readFile, writeFile } = await import('node:fs/promises')
      const outPath = resolve(ctx.projectDir, typesOutputFile)
      // Write only when content changed so cache-hit builds don't trip the
      // dev-reload sentinel (ctx.markChanged) and trigger a spurious reload.
      // Use node:fs/promises (not Bun.*) so this hook runs under either
      // runtime — the published `barefoot` CLI bin starts via Node.
      const prev = await readFile(outPath, 'utf-8').catch(() => null)
      if (prev !== content) {
        await writeFile(outPath, content)
        ctx.markChanged?.()
        console.log(`Generated: ${typesOutputFile}`)
      }
    }
  }

  // Chain user's postBuild with Go types generation
  const userPostBuild = options.postBuild
  const combinedPostBuild = userPostBuild
    ? async (ctx: PostBuildContext) => {
        await postBuild(ctx)
        await userPostBuild(ctx)
      }
    : postBuild

  return {
    adapter: new GoTemplateAdapter(options.adapterOptions),
    paths: options.paths,
    components: options.components,
    outDir: options.outDir,
    minify: options.minify,
    contentHash: options.contentHash,
    clientOnly: options.clientOnly,
    externals: options.externals,
    externalsBasePath: options.externalsBasePath,
    bundleEntries: options.bundleEntries,
    outputLayout: options.outputLayout ?? {
      templates: 'templates',
      clientJs: 'client',
      runtime: 'client',
    },
    postBuild: combinedPostBuild,
  }
}
