/**
 * Import detection and DOM import management.
 */

import type { ComponentIR, IRNode } from '../types.ts'
import { isClientBuiltinName } from '../builtins.ts'
import { collectValueReferencedNames } from '../value-references.ts'

// All exports from @barefootjs/client/runtime that may be used in generated code
export const RUNTIME_IMPORT_CANDIDATES = [
  'createSignal', 'createMemo', 'createEffect', 'onCleanup', 'onMount',
  'hydrate', 'insert', 'getLoopChildren', 'getLoopNodes', 'mapArray', 'mapArrayAnchored', 'mapArrayLazy', 'patchLeaf', 'createDisposableEffect',
  'createComponent', 'renderChild', 'registerComponent', 'registerTemplate', 'initChild', 'upsertChild',
  // Connects a template-clone loop row before the body's tail runs, so a child
  // that inits inside it resolves context against real ancestors rather than
  // falling through to the global store. The clone-root counterpart of the
  // mount point `createComponent` consumes for component-root rows.
  'mountRowRoot',
  'createPortal',
  'provideContext', 'createContext', 'useContext',
  'forwardProps', 'applyRestAttrs', 'splitProps', 'spreadAttrs', 'styleToCss', 'escapeAttr', 'escapeText', 'escapeTextOrNode',
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
    if (new RegExp(`\\b${name}\\s*\\(`).test(code)) {
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
    const usedSpecs: string[] = []
    for (const spec of imp.specifiers) {
      // Per-specifier `import { type Foo }` has no value binding — #2432.
      if (spec.isTypeOnly) continue
      const localName = spec.alias || spec.name
      if (componentNames.has(localName)) continue
      if (isUsedAsValue(localName)) {
        usedSpecs.push(spec.alias ? `${spec.name} as ${spec.alias}` : spec.name)
      }
    }

    if (usedSpecs.length > 0) {
      let source = imp.source
      if (ir.metadata.clientSignalImportSources?.has(source)) {
        source = source.replace(/\.tsx?$/, '') + '.client.js'
      }
      importLines.push(`import { ${usedSpecs.join(', ')} } from '${source}'`)
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
