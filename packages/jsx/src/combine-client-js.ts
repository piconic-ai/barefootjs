/**
 * Combines parent and child component client JS into single self-contained files.
 *
 * During compilation, child component dependencies are marked with placeholder imports:
 *   import '/* @bf-child:ChildName *​/'
 *
 * This function resolves those placeholders by inlining the child's client JS code
 * into the parent's file, eliminating the need for separate HTTP requests.
 */

import ts from 'typescript'

const CHILD_PLACEHOLDER_RE = /import '\/\* @bf-child:(\w+) \*\/'/g

/**
 * Combine parent-child client JS files by inlining child code into parent files.
 *
 * @param files Map of component name → client JS content
 * @returns Map of component name → combined client JS content (only entries that changed)
 */
export function combineParentChildClientJs(
  files: Map<string, string>
): Map<string, string> {
  const result = new Map<string, string>()

  // Build case-insensitive lookup by file/manifest name
  const lookup = new Map<string, string>()
  for (const [name, content] of files) {
    lookup.set(name.toLowerCase(), content)
  }

  // Secondary lookup: map component name → file name for multi-component files.
  // e.g., icon/index.tsx exports CopyIcon + CheckIcon, keyed as "icon" in the manifest.
  // componentToFile maps "copyicon" → "icon", "checkicon" → "icon".
  const componentToFile = new Map<string, string>()
  for (const [name, content] of files) {
    for (const match of content.matchAll(/hydrate\('(\w+)'/g)) {
      componentToFile.set(match[1].toLowerCase(), name.toLowerCase())
    }
  }

  for (const [name, content] of files) {
    const childNames = [...content.matchAll(CHILD_PLACEHOLDER_RE)].map(m => m[1])
    if (childNames.length === 0) continue

    const processed = new Set<string>()
    const importsBySource = new Map<string, Set<string>>()
    const otherImports: string[] = []
    const codeSections: string[] = []

    function collectDescendant(childName: string) {
      const key = childName.toLowerCase()
      if (processed.has(key)) return
      processed.add(key)

      let childContent = lookup.get(key)
      if (!childContent) {
        // Fallback: resolve component name → file name for multi-component files.
        // Also mark the file name as processed so that other components from the
        // same file (e.g., CheckIcon when CopyIcon was already resolved from "icon")
        // don't inline the same file content again.
        const fileName = componentToFile.get(key)
        if (!fileName || processed.has(fileName)) return
        processed.add(fileName)
        childContent = lookup.get(fileName)
      }
      if (!childContent) return

      // Depth-first: collect grandchildren before the child itself
      const grandChildren = [...childContent.matchAll(CHILD_PLACEHOLDER_RE)].map(m => m[1])
      for (const gc of grandChildren) {
        collectDescendant(gc)
      }

      parseAndMerge(childContent, importsBySource, otherImports, codeSections)
    }

    for (const child of childNames) {
      collectDescendant(child)
    }

    // Parse parent (strip placeholders)
    parseAndMerge(
      content.replace(CHILD_PLACEHOLDER_RE, ''),
      importsBySource, otherImports, codeSections
    )

    // Generate combined output
    const importLines: string[] = []
    for (const [source, names] of importsBySource) {
      importLines.push(`import { ${[...names].sort().join(', ')} } from '${source}'`)
    }

    result.set(name, [...importLines, ...otherImports, '', ...codeSections].join('\n'))
  }

  return result
}

function parseAndMerge(
  content: string,
  importsBySource: Map<string, Set<string>>,
  otherImports: string[],
  codeSections: string[]
): void {
  // Parse the client JS so we only ever treat *real* top-level
  // `ImportDeclaration` statements as imports. The predecessor matched
  // raw lines beginning with `import `, which also caught `import …`
  // lines that merely live *inside a string / template literal value*
  // (e.g. a data module exporting a code snippet). Tearing such a line
  // out of its string relocated the component's real runtime import into
  // the literal and left `hydrate` undefined at call time. See
  // piconic-ai/barefootjs#1702.
  // Parent pointers aren't needed here — we only read `statements` and each
  // import's `getStart`/`getEnd` — so skip building them to keep the per-chunk
  // parse cheap when combining many files.
  const sourceFile = ts.createSourceFile(
    'combine.js',
    content,
    ts.ScriptTarget.Latest,
    /*setParentNodes*/ false,
    ts.ScriptKind.JS,
  )

  // Character spans of the top-level imports to strip from the emitted
  // code, so everything that isn't an import (including literals whose
  // contents look like imports) is preserved verbatim.
  const importSpans: Array<[number, number]> = []

  for (const stmt of sourceFile.statements) {
    if (!ts.isImportDeclaration(stmt)) continue
    const start = stmt.getStart(sourceFile)
    const end = stmt.getEnd()
    importSpans.push([start, end])

    const stmtText = content.slice(start, end)
    // `@bf-child:` placeholders are resolved by inlining elsewhere; drop
    // them entirely (neither merged nor kept as code).
    if (stmtText.includes('@bf-child:')) continue

    const clause = stmt.importClause
    const bindings = clause?.namedBindings
    const specifier = ts.isStringLiteral(stmt.moduleSpecifier)
      ? stmt.moduleSpecifier.text
      : ''
    if (clause && !clause.name && bindings && ts.isNamedImports(bindings)) {
      // Pure named import (`import { a, b as c } from '…'`) — merge by source.
      if (!importsBySource.has(specifier)) {
        importsBySource.set(specifier, new Set())
      }
      const set = importsBySource.get(specifier)!
      for (const el of bindings.elements) {
        const name = el.propertyName
          ? `${el.propertyName.text} as ${el.name.text}`
          : el.name.text
        set.add(name)
      }
    } else {
      // default / namespace / side-effect import — keep verbatim.
      if (!otherImports.includes(stmtText)) {
        otherImports.push(stmtText)
      }
    }
  }

  // Reconstruct the code with the import spans removed.
  let code = ''
  let cursor = 0
  for (const [start, end] of importSpans) {
    code += content.slice(cursor, start)
    cursor = end
  }
  code += content.slice(cursor)
  code = code.trim()
  if (code) {
    codeSections.push(code)
  }
}
