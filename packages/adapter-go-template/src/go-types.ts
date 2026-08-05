// Go type-combination helpers shared by the Vite plugin's post-emit hook
// (`vite.ts`'s `combineGoTypes` call, writing `components.go`).

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
  const funcRegex = /\/\/ (New\w+Props) creates .*(?:\n\/\/.*)*\nfunc \1\([^)]*\) \w+ \{[\s\S]*?\n\}/g
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

  // Conditionally pull in stdlib packages the combined component code uses.
  // Per-component import blocks are stripped above, so the merged file needs
  // its own block — `fmt` (e.g. `fmt.Sprint` for keyed-loop data-key /
  // indexed-map spread) and `html/template` (`template.HTML` for forwarded
  // JSX children) are only imported when actually referenced, so an app that
  // uses neither doesn't get an "imported and not used" error.
  const usageScan = combinedContent + '\n' + (manualTypes ?? '')
  const stdlibImports: string[] = [`\t"math/rand"`]
  if (/\bfmt\./.test(usageScan)) stdlibImports.push(`\t"fmt"`)
  // `strings.` shows up in generated constructors that normalize a prop, e.g.
  // `searchParams()`-backed components emit `strings.TrimRight(in.Base, "/")`
  // to derive the router base. Only imported when referenced, like the others.
  if (/\bstrings\./.test(usageScan)) stdlibImports.push(`\t"strings"`)
  if (/\btemplate\.HTML\b/.test(usageScan)) stdlibImports.push(`\t"html/template"`)
  // gofmt sorts the stdlib group alphabetically by import path.
  stdlibImports.sort()

  // Build final file
  const parts = [
    `// Code generated by BarefootJS. DO NOT EDIT.`,
    `package ${packageName}`,
    '',
    `import (`,
    ...stdlibImports,
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
