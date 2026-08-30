/**
 * Import detection and DOM import management.
 */

import ts from 'typescript'
import type { ComponentIR, IRNode } from '../types.ts'
import { isClientBuiltinName } from '../builtins.ts'
import { collectValueReferencedNames } from '../value-references.ts'
import { identifierCallPattern } from '../identifier-pattern.ts'

// All exports from @barefootjs/client/runtime that may be used in generated code
export const RUNTIME_IMPORT_CANDIDATES = [
  'createSignal', 'createMemo', 'createEffect', 'onCleanup', 'onMount',
  'hydrate', 'insert', 'getLoopChildren', 'getLoopNodes', 'mapArray', 'mapArrayAnchored', 'mapArrayLazy', 'patchLeaf', 'createDisposableEffect',
  // Resolves the real DOM container for a loop nested inside a loop-row
  // conditional's branch when the conditional's wrapper element carries no
  // `bf="<slot>"` marker of its own (#2705) — see `findCondContainer`'s
  // docstring (runtime/insert.ts) for why the marker collector can't see it.
  'findCondContainer',
  'createComponent', 'renderChild', 'registerComponent', 'registerTemplate', 'initChild', 'upsertChild',
  // Connects a template-clone loop row before the body's tail runs, so a child
  // that inits inside it resolves context against real ancestors rather than
  // falling through to the global store. The clone-root counterpart of the
  // mount point `createComponent` consumes for component-root rows.
  'mountRowRoot',
  'createPortal',
  'provideContext', 'createContext', 'useContext',
  'forwardProps', 'applyRestAttrs', 'splitProps', 'spreadAttrs', 'styleToCss', 'escapeAttr', 'escapeText', 'escapeTextOrNode',
  // JSX-element-as-non-children-prop markup brand (#2651) — `bfMarkup` wraps
  // the compiler-built HTML at the producer (renderChild / initChild props);
  // `escapeTextOrMarkup` unwraps it at the claim-plan-'markup' template slot.
  'bfMarkup', 'escapeTextOrMarkup',
  // Nullish guard for a bare `{children}` passthrough splice (#2775) — the
  // value is already-stringified markup, never escaped, just nullish-safe.
  'markupOrEmpty',
  'qsa', 'qsaItem', 'qsaChildScope', 'qsaChildScopes', 'upsertChildItem', '__slot', '__bfSlot', '__bfText',
  // Claim-plan interpreter (slot unification A2/A3, spec/slot-unification.md)
  // — the "one claim mechanism" that replaced `patchSlotRange` and
  // `updateClientMarker` (both deleted) as the content-slot update door.
  // `lazyClaimSlots` is the read-capable twin of `lazySlots` over the same
  // claim — emitted only by lazy loops that seed an outer-involving TEXT
  // binding by read-compare-write (§9.3(1)).
  // `textOrNode` is the 'text' door's Node guard: a child-position value that
  // turns out to be a live Node must reach the writer as a Node so the claim
  // can promote to 'markup', never as `String(node)`.
  'claimSlots', 'lazySlots', 'lazyClaimSlots', 'textOrNode',
  // Profile mode (#1690, SR3) — turn-boundary markers around event handlers.
  'beginTurn', 'endTurn',
  // Catalogued `Date` lowering (#2274/#2292) — the client counterpart to
  // every SSR adapter's `date` runtime helper (`date-lowering.ts`'s
  // `datePlugin`).
  'date',
  // Literal-locale `toLocaleDateString` sugar (#2324 slice 2) — the client
  // rewrite targets `formatDate(recv, pattern, tz)`, so the emitted code
  // needs the runtime export when the component didn't import it itself.
  'formatDate',
] as const

/** @deprecated Use RUNTIME_IMPORT_CANDIDATES */
export const DOM_IMPORT_CANDIDATES = RUNTIME_IMPORT_CANDIDATES

export const RUNTIME_MODULE = '@barefootjs/client/runtime'

export const IMPORT_PLACEHOLDER = '/* __BAREFOOTJS_DOM_IMPORTS__ */'
export const MODULE_CONSTANTS_PLACEHOLDER = '/* __MODULE_LEVEL_CONSTANTS__ */'

/**
 * Detect which @barefootjs/client/runtime functions are actually used in the generated code
 */
export function detectUsedImports(code: string): Set<string> {
  const used = new Set<string>()
  for (const name of RUNTIME_IMPORT_CANDIDATES) {
    // Match function calls: name(
    if (identifierCallPattern(name).test(code)) {
      used.add(name)
    }
  }
  // Shorthand finders need special detection ($ is not a word character)
  if (/\$c\s*\(/.test(code)) {
    used.add('$c')
  }
  // Match $t( for text node finders
  if (/\$t\s*\(/.test(code)) {
    used.add('$t')
  }
  // Match $( but not $c( or $t( - use negative lookahead
  if (/\$\s*\(/.test(code)) {
    used.add('$')
  }
  return used
}

/**
 * Collect user-defined imports from @barefootjs/client (or the
 * compiler-emitted /runtime subpath).
 */
export function collectUserDomImports(ir: ComponentIR): string[] {
  const runtimeSources = new Set([RUNTIME_MODULE, '@barefootjs/client'])
  const userImports: string[] = []
  for (const imp of ir.metadata.imports) {
    if (runtimeSources.has(imp.source) && !imp.isTypeOnly) {
      for (const spec of imp.specifiers) {
        // Per-specifier type-only (`import { createSignal, type Signal }
        // from '@barefootjs/client'`) must not emit `Signal` from the
        // runtime subpath, which does not export it (#2432).
        if (!spec.isDefault && !spec.isNamespace && !spec.isTypeOnly) {
          // Compile-away built-ins (`<Async>` / `<Region>`) are lowered into
          // the template — never emit their import into the client bundle,
          // where it would be a phantom runtime import (#1915).
          if (isClientBuiltinName(spec.name)) continue
          userImports.push(spec.alias ? `${spec.name} as ${spec.alias}` : spec.name)
        }
      }
    }
  }
  return userImports
}

/**
 * Build the "is this local name used as a value in the generated code?"
 * test used to decide which imported specifiers survive into the client
 * bundle. Prefers a real value-reference set over the historical
 * `\bname\b` text scan (#2432: an object key or string literal that
 * merely spells an imported name used to emit a phantom import). Falls
 * back to a substring scan when the generated text cannot be parsed
 * cleanly — a partial parse would under-report references and DROP a
 * needed import. The reference set is computed at most once per call.
 *
 * The fallback is a plain `includes()`, not a `\bname\b` regex: `\b` is
 * defined over `[A-Za-z0-9_]`, so a `$`-prefixed name (`$fetch`, as
 * exported by `ofetch`) or a non-ASCII local both sit outside a word
 * boundary and would never match — silently dropping the import, the one
 * failure direction this helper must never take. Worse, splicing
 * `localName` straight into `new RegExp(...)` treated `$` as the
 * end-of-input anchor, so `\b$fetch\b` couldn't match `$fetch` at all.
 * `includes()` is deliberately COARSER than a word-boundary scan (it
 * matches `helper` inside `helperFoo` too) — that's fine here: the
 * fallback's only job is "never under-report", and over-keeping an
 * import whose binding already exists is harmless, while dropping one is
 * fatal.
 */
export function makeValueUsageTest(generatedCode: string): (localName: string) => boolean {
  let referenced: Set<string> | null | undefined
  return (localName: string) => {
    if (referenced === undefined) {
      referenced = collectValueReferencedNames(generatedCode)
    }
    if (referenced !== null) {
      return referenced.has(localName)
    }
    return generatedCode.includes(localName)
  }
}

/**
 * Render already-filtered-to-used specifier fragments for one import source
 * into one or two legal import declaration lines. Shared by every call site
 * that re-serializes an `ImportInfo`'s specifiers into client-JS import
 * text — `collectExternalImports` below and the state-only-file client-JS
 * path (`compiler.ts`'s single-component early return for a `.tsx` with no
 * JSX return but exported `@client` module signals) — so the
 * default/namespace handling lives in exactly one place.
 *
 * A default or namespace specifier needs its own import syntax
 * (`import X from '...'` / `import * as X from '...'`), never the
 * named-import braces a plain specifier gets — a plain `import { lock }
 * from '...'` for a DEFAULT-imported `lock` compiles to a real, silently-
 * wrong ESM import (no such named export) that only surfaces once a
 * bundler actually resolves it (#2767 follow-up: a server component's own
 * compiled init previously never reached a real Rollup graph, so this was
 * unreachable until that gap closed).
 *
 * `import Default, { a, b } from '...'` is the only legal single-line
 * pairing — a namespace specifier can't combine with named ones, but
 * multiple import declarations for the same source are legal ESM, so a
 * used namespace specifier always gets its own line.
 */
export function renderUsedImportLines(
  source: string,
  usedDefault: string | null,
  usedNamespace: string | null,
  usedNamed: string[],
): string[] {
  const lines: string[] = []
  const defaultAndNamed = [
    usedDefault,
    usedNamed.length > 0 ? `{ ${usedNamed.join(', ')} }` : null,
  ].filter((part): part is string => part !== null).join(', ')
  if (defaultAndNamed) lines.push(`import ${defaultAndNamed} from '${source}'`)
  if (usedNamespace) lines.push(`import * as ${usedNamespace} from '${source}'`)
  return lines
}

/**
 * Merge multiple sibling components' compiled client-JS blobs (one file
 * with several `export function`s, e.g. `compileMultipleComponents`'s two
 * `.client.js` outputs) into one conflict-free block.
 *
 * Real top-level `ImportDeclaration` statements are found via a
 * `ts.createSourceFile` AST walk — never a text/regex line scan — so a
 * string or template-literal VALUE that merely contains a line starting
 * with `import ` (a docs component embedding a code sample, say) can never
 * be torn out of its literal and hoisted into the imports block. This
 * mirrors `combine-client-js.ts`'s `parseAndMerge`, the established
 * precedent for exactly this shape of parse (see that file's docstring
 * and issue #1702, the regression it exists to prevent) — CLAUDE.md
 * requires it for "compiled client JS" specifically. Reaching a bundler
 * for the FIRST time is precisely what a plain server component newly
 * promoted to a Rollup entry by `needsClientEntry` (#2767) now does, so a
 * line-based scan here carries real risk, not just a style violation.
 *
 * Differs from `parseAndMerge` in two ways required by this call site:
 * (1) default and named specifiers from the same source fold into ONE
 * declaration via `renderUsedImportLines`'s rule, rather than surviving
 * as separate verbatim, exact-string-deduped lines — the fold is what
 * prevents the duplicate-binding `SyntaxError` two sibling components can
 * otherwise produce for a shared default import (#2767 follow-up); (2) an
 * unresolved `@bf-child:` placeholder import is KEPT (deduped by exact
 * text, same as any other side-effect import), never dropped — unlike
 * `parseAndMerge`'s parent-child inlining case, this merge runs inside
 * `compileMultipleComponents`, BEFORE `@barefootjs/vite`'s `resolveId`
 * gets a chance to rewrite the placeholder into a real module reference.
 *
 * Returns the fully assembled `<imports>\n\n<code…>` block ready to use
 * as a `.client.js` file's content.
 */
export function mergeCompiledClientJsImports(codeBlobs: string[]): string {
  const sourceOrder: string[] = []
  const namedBySource = new Map<string, Set<string>>()
  const defaultBySource = new Map<string, string>()
  const otherImports: string[] = []
  const seenOther = new Set<string>()
  const codeSections: string[] = []

  const ensureSource = (source: string): Set<string> => {
    if (!namedBySource.has(source)) {
      namedBySource.set(source, new Set())
      sourceOrder.push(source)
    }
    return namedBySource.get(source)!
  }

  for (const content of codeBlobs) {
    const sourceFile = ts.createSourceFile(
      'combine.js',
      content,
      ts.ScriptTarget.Latest,
      /*setParentNodes*/ false,
      ts.ScriptKind.JS,
    )
    const importSpans: Array<[number, number]> = []

    for (const stmt of sourceFile.statements) {
      if (!ts.isImportDeclaration(stmt)) continue
      const start = stmt.getStart(sourceFile)
      const end = stmt.getEnd()
      importSpans.push([start, end])

      const clause = stmt.importClause
      const bindings = clause?.namedBindings
      const specifier = ts.isStringLiteral(stmt.moduleSpecifier) ? stmt.moduleSpecifier.text : ''
      const isNamespace = !!bindings && ts.isNamespaceImport(bindings)
      const isNamed = !!bindings && ts.isNamedImports(bindings)

      // A namespace binding (`import * as NS from '…'`, or a combined
      // `import Default, * as NS from '…'`) is never folded — it always
      // falls through to the verbatim-keep branch below, same as
      // `parseAndMerge`'s. Checking `isNamespace` FIRST (not just `!isNamed`)
      // matters for the combined-with-default shape specifically: a naive
      // `clause?.name || isNamed` would route it into the fold branch below
      // on the strength of the default clause alone and silently drop the
      // namespace half, since only `isNamed` is read there. No current
      // producer of `clientJs` output emits that combined shape
      // (`renderUsedImportLines` always splits a used default+namespace
      // pair into two separate lines), but the classification must stay
      // correct independent of that invariant.
      if (!isNamespace && (clause?.name || isNamed)) {
        // Default and/or named specifiers — fold by source.
        const set = ensureSource(specifier)
        if (clause?.name && !defaultBySource.has(specifier)) {
          defaultBySource.set(specifier, clause.name.text)
        }
        if (isNamed) {
          for (const el of (bindings as ts.NamedImports).elements) {
            set.add(el.propertyName ? `${el.propertyName.text} as ${el.name.text}` : el.name.text)
          }
        }
      } else {
        // Namespace or side-effect import (including an unresolved
        // `@bf-child:` placeholder) — kept verbatim, deduped by exact text.
        const stmtText = content.slice(start, end)
        if (!seenOther.has(stmtText)) {
          seenOther.add(stmtText)
          otherImports.push(stmtText)
        }
      }
    }

    let code = ''
    let cursor = 0
    for (const [start, end] of importSpans) {
      code += content.slice(cursor, start)
      cursor = end
    }
    code += content.slice(cursor)
    code = code.trim()
    if (code) codeSections.push(code)
  }

  const mergedImports = sourceOrder.flatMap(source =>
    renderUsedImportLines(source, defaultBySource.get(source) ?? null, null, [...namedBySource.get(source)!]),
  )

  return [...mergedImports, ...otherImports, '', ...codeSections].join('\n')
}

/**
 * Collect external (non-DOM, non-component) imports that are used in generated code.
 * These are third-party libraries like @barefootjs/form, zod, etc. that need to be
 * preserved in client JS output so the browser can resolve them via import map.
 */
export function collectExternalImports(ir: ComponentIR, generatedCode: string, localImportPrefixes?: string[]): string[] {
  const componentNames = collectComponentNames(ir.root)
  const importLines: string[] = []
  const isUsedAsValue = makeValueUsageTest(generatedCode)
  for (const imp of ir.metadata.imports) {
    if (imp.isTypeOnly) continue
    if (imp.source === '@barefootjs/client' || imp.source === RUNTIME_MODULE) continue
    // Skip local path-alias imports (resolved at build time, not in browser)
    if (localImportPrefixes?.some(prefix => imp.source.startsWith(prefix))) continue

    // Side-effect imports have no specifiers — preserve unconditionally
    if (imp.specifiers.length === 0) {
      importLines.push(`import '${imp.source}'`)
      continue
    }

    // Check which specifiers are actually used in the generated code.
    // Skip component names — they are rendered via initChild(), not imported directly.
    const usedNamed: string[] = []
    let usedDefault: string | null = null
    let usedNamespace: string | null = null
    for (const spec of imp.specifiers) {
      // Per-specifier `import { type Foo }` has no value binding — #2432.
      if (spec.isTypeOnly) continue
      const localName = spec.alias || spec.name
      if (componentNames.has(localName)) continue
      if (!isUsedAsValue(localName)) continue
      if (spec.isDefault) {
        usedDefault = localName
      } else if (spec.isNamespace) {
        usedNamespace = localName
      } else {
        usedNamed.push(spec.alias ? `${spec.name} as ${spec.alias}` : spec.name)
      }
    }

    if (usedDefault || usedNamespace || usedNamed.length > 0) {
      let source = imp.source
      if (ir.metadata.clientSignalImportSources?.has(source)) {
        source = source.replace(/\.tsx?$/, '') + '.client.js'
      }
      importLines.push(...renderUsedImportLines(source, usedDefault, usedNamespace, usedNamed))
    }
  }
  return importLines
}

/** Collect all component names referenced in the IR tree. */
function collectComponentNames(node: IRNode): Set<string> {
  const names = new Set<string>()
  function walk(n: IRNode): void {
    if (n.type === 'component') {
      names.add(n.name)
    }
    if ('children' in n && Array.isArray(n.children)) {
      for (const child of n.children) walk(child)
    }
    if (n.type === 'conditional') {
      walk(n.whenTrue)
      walk(n.whenFalse)
    }
    if (n.type === 'if-statement') {
      walk(n.consequent)
      if (n.alternate) walk(n.alternate)
    }
  }
  walk(node)
  return names
}
