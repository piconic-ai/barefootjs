/**
 * BarefootJS Compiler - Main Entry Point
 *
 * Compiles JSX components to Marked Templates + Client JS.
 */

import type {
  ComponentIR,
  IRMetadata,
  CompileOptions,
  CompileResult,
  FileOutput,
} from './types.ts'
import ts from 'typescript'
import type { TemplateAdapter } from './adapters/interface.ts'
import { analyzeComponent, listComponentFunctions, createProgramForFile, needsTypeBasedDetection } from './analyzer.ts'
import { jsxToIR } from './jsx-to-ir.ts'
import { stripClientBuiltinImports } from './builtins.ts'
import { generateClientJs, generateClientJsWithSourceMap, analyzeClientNeeds } from './ir-to-client-js/index.ts'
import { decideClientOnlyElision } from './ir-to-client-js/client-only-elision.ts'
import { emitModuleLevelDeclarations } from './ir-to-client-js/emit-module-level.ts'
import { RUNTIME_MODULE, detectUsedImports as detectUsedImportsFromCode, makeValueUsageTest, renderUsedImportLines } from './ir-to-client-js/imports.ts'
import { setActiveComponentScope, computeFileScope } from './ir-to-client-js/component-scope.ts'
import { generateModuleExports, collectInlineExportedNames } from './module-exports.ts'
import { applyCssLayerPrefix, applyCssLayerPrefixToFile } from './css-layer-prefixer.ts'
import { preprocessInlineJsxCallbacks } from './preprocess-inline-jsx-callbacks.ts'
import { extractSsrDefaults } from './ssr-defaults.ts'
import { computeSsrSeedPlan } from './ssr-seed-plan.ts'
import { checkRichTypeMethodCalls, checkRichTypePropSerialization } from './rich-type-refusal.ts'
import { ErrorCodes, createError } from './errors.ts'
import { collectComponentNamesFromIR } from './ir-to-client-js/child-components.ts'

/**
 * Extended compile options with required adapter
 */
export interface CompileOptionsWithAdapter extends CompileOptions {
  /** Template adapter for generating output (required) */
  adapter: TemplateAdapter
}

/**
 * Merge the import lines of a multi-component template file into a single,
 * conflict-free block.
 *
 * Named value/type imports from the same source are folded into their first
 * occurrence (preserving line order and first-seen symbol order); a default
 * or namespace import is likewise folded by source rather than deduplicated
 * by exact line — every sibling component that shares a module-scope import
 * declaration compiles it independently, so the same default binding can
 * legally arrive as `import cfg from 'x'` from one component and `import
 * cfg, { helper } from 'x'` from another once only the SECOND one also uses
 * a named specifier from the same statement. Folding by source (default
 * name from the first occurrence that has one, named specifiers unioned)
 * collapses both into one `import cfg, { helper } from 'x'` line; the two
 * exact-line-deduplicated strings would otherwise both survive and
 * redeclare `cfg` (#2767 follow-up — this shape was unreachable before a
 * default/namespace-importing server component could become a real client
 * bundle at all). A namespace specifier can't combine with named ones on
 * one line, so it's folded to its own line, keyed by (source, local name)
 * — see `renderUsedImportLines`'s docstring for the same split rendering
 * rule `collectExternalImports` uses.
 *
 * Every other import form (side-effect) is kept in place and de-duplicated
 * by exact line. This ensures a symbol is never imported twice across
 * sibling components — a redeclaration that Bun tolerates but stricter ESM
 * parsers (the Deno runtime that renders SSR templates) reject.
 *
 * For a single-component file the output is identical to the input order;
 * only repeated sibling imports collapse.
 *
 * Matching is whitespace-insensitive (`import {a,b} from 'x'` and
 * `import {  a , b  }  from  "x"` fold the same): the merge must not silently
 * depend on the emitter's exact spacing. A named import that failed to match
 * would fall through to the by-line branch below and re-introduce the very
 * duplicate-binding SyntaxError this function exists to prevent, so the
 * patterns tolerate any spacing the generated lines might carry.
 */
export function mergeTemplateImports(lines: string[]): string {
  const result: string[] = []
  const valueIdx = new Map<string, number>()
  const valueDefault = new Map<string, string>()
  const valueNames = new Map<string, Set<string>>()
  const typeIdx = new Map<string, number>()
  const typeNames = new Map<string, Set<string>>()
  const seenOther = new Set<string>()

  const foldType = (src: string, rawNames: string) => {
    if (!typeIdx.has(src)) {
      typeIdx.set(src, result.length)
      typeNames.set(src, new Set())
      result.push('')
    }
    const set = typeNames.get(src)!
    for (const n of rawNames.split(',').map(s => s.trim()).filter(Boolean)) set.add(n)
    result[typeIdx.get(src)!] = `import type { ${[...set].join(', ')} } from '${src}'`
  }

  const foldValue = (src: string, defaultName: string | null, rawNames: string | null) => {
    if (!valueIdx.has(src)) {
      valueIdx.set(src, result.length)
      valueNames.set(src, new Set())
      result.push('')
    }
    if (defaultName && !valueDefault.has(src)) valueDefault.set(src, defaultName)
    if (rawNames) {
      const set = valueNames.get(src)!
      for (const n of rawNames.split(',').map(s => s.trim()).filter(Boolean)) set.add(n)
    }
    result[valueIdx.get(src)!] = renderUsedImportLines(
      src,
      valueDefault.get(src) ?? null,
      null,
      [...valueNames.get(src)!],
    ).join('\n')
  }

  for (const raw of lines) {
    const line = raw.trim()
    if (!line) continue
    const typeMatch = line.match(/^import\s+type\s*\{([^}]+)\}\s*from\s*['"]([^'"]+)['"]\s*;?$/)
    const namedMatch = line.match(/^import\s*\{([^}]+)\}\s*from\s*['"]([^'"]+)['"]\s*;?$/)
    const defaultNamedMatch = line.match(/^import\s+([A-Za-z_$][\w$]*)\s*,\s*\{([^}]+)\}\s*from\s*['"]([^'"]+)['"]\s*;?$/)
    const defaultOnlyMatch = line.match(/^import\s+([A-Za-z_$][\w$]*)\s*from\s*['"]([^'"]+)['"]\s*;?$/)

    if (typeMatch) {
      foldType(typeMatch[2], typeMatch[1])
    } else if (namedMatch) {
      foldValue(namedMatch[2], null, namedMatch[1])
    } else if (defaultNamedMatch) {
      foldValue(defaultNamedMatch[3], defaultNamedMatch[1], defaultNamedMatch[2])
    } else if (defaultOnlyMatch) {
      foldValue(defaultOnlyMatch[2], defaultOnlyMatch[1], null)
    } else if (!seenOther.has(line)) {
      // Covers namespace imports (`import * as X from 'src'`) and
      // side-effect imports alike — deduplicated by exact line, same as
      // before. A namespace import can't combine with named specifiers on
      // one line (see `renderUsedImportLines`), so two components that
      // both import the SAME namespace binding from the SAME source
      // always emit byte-identical lines and collapse here; two DIFFERENT
      // local namespace names for the same source (unusual — would require
      // sibling components to alias the same module-scope `import * as`
      // declaration differently, which isn't possible for one shared
      // declaration) are kept as separate lines rather than silently
      // merged.
      seenOther.add(line)
      result.push(line)
    }
  }

  return result.filter(Boolean).join('\n')
}

// =============================================================================
// Multiple Component Compilation
// =============================================================================

function compileMultipleComponents(
  source: string,
  filePath: string,
  componentNames: string[],
  options: CompileOptionsWithAdapter
): CompileResult {
  const files: FileOutput[] = []
  const errors: CompileResult['errors'] = []
  const adapter = options.adapter

  // --- Pass 1: analyze + jsxToIR for ALL components ---
  const entries: { componentIR: ComponentIR; ctx: ReturnType<typeof analyzeComponent> }[] = []

  // Create ts.Program only when the file needs type-based reactivity
  // detection. A caller-supplied Program is only usable while its cached
  // SourceFile still matches `source` — after an upstream rewrite
  // (preprocessInlineJsxCallbacks), the analyzer would silently discard
  // the stale Program PER COMPONENT and rebuild a per-file one each time
  // (measured: 14 rebuilds ≈ 30 s on site/ui's xyflow-demo.tsx, #2537).
  // Detect the staleness here instead, so the rewritten source gets ONE
  // per-file Program shared by every sibling component.
  const callerProgram =
    options.program?.getSourceFile(filePath)?.text === source ? options.program : undefined
  const program = callerProgram ?? (needsTypeBasedDetection(source) ? createProgramForFile(source, filePath)?.program : undefined)
  // Whether a SHARED Program was genuinely supplied by the caller, as
  // opposed to the per-file amortization built on the line above. The
  // distinction feeds BF050: the per-file build is precisely the fallback
  // that diagnostic exists to flag, so it must not suppress it the way a
  // caller-supplied corpus Program does. See `analyzeComponent`'s
  // `programIsShared` docstring — the single-component path gets the same
  // verdict via its default inference from `options.program`.
  const programIsShared = options.program !== undefined

  for (const componentName of componentNames) {
    const ctx = analyzeComponent(source, filePath, componentName, program, adapter.acceptsCallbackBody, programIsShared)

    if (!ctx.jsxReturn) {
      errors.push(...ctx.errors)
      continue
    }

    const ir = jsxToIR(ctx)
    errors.push(...ctx.errors)
    if (!ir) continue

    const componentIR: ComponentIR = {
      version: '0.1',
      metadata: buildMetadata(ctx),
      root: ir,
      errors: [],
    }

    componentIR.metadata.clientAnalysis = analyzeClientNeeds(componentIR)
    checkRichTypeMethodCalls(componentIR.root, componentIR.metadata, errors)
    checkRichTypePropSerialization(componentIR.root, componentIR.metadata, errors, ctx.propsDestructuring?.loc)

    // Slot unification Step B — see the single-component path's identical
    // call for why this must run before adapter.generate/generateClientJs.
    decideClientOnlyElision(componentIR.root)

    entries.push({ componentIR, ctx })
  }

  // BF048 — refuse loudly when an emitted component template references a
  // same-file sibling that was in `componentNames` (so `listComponentFunctions`
  // treated it as a component to compile — the 'use client' branch of #932
  // does exactly that for multi-return JSX dispatch shapes) but never made
  // it into `entries` (its own `analyzeComponent`/`jsxToIR` pass produced no
  // usable IR — most commonly a top-level `switch` dispatch, which
  // `visitComponentBody` preserves as a verbatim init statement rather than
  // folding into `conditionalReturns`, so `ctx.jsxReturn` stays null).
  // Pre-fix this compiled clean and the emitted `renderChild`/`initChild`/
  // `createComponent` call threw `ReferenceError: <Name> is not defined` at
  // SSR/hydrate time (#2556) — the silence itself is the bug. Detection
  // walks the IR component-reference graph (the same walk that drives
  // `@bf-child` import markers, `collectComponentNamesFromIR`), never the
  // emitted template text.
  //
  // Restricted to TOP-LEVEL declarations: `listComponentFunctions` recurses
  // into function bodies, so `componentNames` also carries component-scope
  // local factories (`const Inner = () => <span/>` inside a component).
  // Those never compile to standalone templates either, but their call
  // sites are handled by the JSX-function-inlining pass — flagging them
  // here would fail legal programs (the ir-dynamic-tag / resolver-alias
  // corpus shapes). Only a name declared at module top level can be the
  // dropped-sibling shape this diagnostic exists for.
  //
  // Restricted to 'use client' FILES: only the 'use client' branch of #932
  // widens `listComponentFunctions` to multi-return dispatch shapes; in a
  // non-client file an uncompiled sibling is preserved verbatim (that is
  // the escape hatch the message below recommends), so flagging it there
  // would fail exactly the programs the fix tells users to write.
  if (entries.some(e => e.componentIR.metadata.isClientComponent)) {
    const topLevelNames = new Set<string>()
    {
      const sf = ts.createSourceFile(filePath, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
      for (const stmt of sf.statements) {
        if (ts.isFunctionDeclaration(stmt) && stmt.name) topLevelNames.add(stmt.name.text)
        else if (ts.isVariableStatement(stmt)) {
          for (const d of stmt.declarationList.declarations) {
            if (ts.isIdentifier(d.name)) topLevelNames.add(d.name.text)
          }
        }
      }
    }
    const compiledNames = new Set(entries.map(e => e.componentIR.metadata.componentName))
    const uncompiledSiblings = new Set(
      componentNames.filter(name => !compiledNames.has(name) && topLevelNames.has(name)),
    )
    if (uncompiledSiblings.size > 0) {
      for (const { componentIR } of entries) {
        const referenced = new Set<string>()
        collectComponentNamesFromIR([componentIR.root], referenced)
        for (const name of referenced) {
          if (!uncompiledSiblings.has(name)) continue
          errors.push(createError(
            ErrorCodes.SIBLING_COMPONENT_NOT_COMPILED,
            componentIR.root.loc,
            {
              message:
                `Component '${componentIR.metadata.componentName}' references sibling ` +
                `'<${name}>', which did not compile to a template in this 'use client' file ` +
                `(likely a multi-return JSX dispatch — a \`switch\` or \`if\`/\`else\` chain ` +
                `across multiple JSX-returning branches). This reference would throw ` +
                `\`ReferenceError: ${name} is not defined\` at SSR/hydrate time. Extract '${name}' ` +
                `to a separate non-"use client" file (where #932 preserves it verbatim), or ` +
                `rewrite it as a single-return ternary/conditional chain so the component ` +
                `pipeline can compile it.`,
            },
          ))
        }
      }
    }
  }

  // CSS layer prefixing must be FILE-WIDE: per-IR application diverges the
  // per-component copies of a shared module-scope constant (prefixed in the
  // components whose class attrs reference it, raw elsewhere), and module
  // shape emission (#2570) would then declare the constant twice. See
  // `applyCssLayerPrefixToFile`.
  if (options.cssLayerPrefix) {
    applyCssLayerPrefixToFile(entries.map(e => e.componentIR), options.cssLayerPrefix)
  }

  // BF050 is a per-FILE diagnostic (it points at the brand-package import
  // line), but pass 1 runs the analyzer once per component, so a
  // multi-component file accumulates one identical copy per sibling.
  // Keep the first.
  {
    let seenBf050 = false
    const deduped = errors.filter(e => {
      if (e.code !== ErrorCodes.SHARED_PROGRAM_REQUIRED) return true
      if (seenBf050) return false
      seenBf050 = true
      return true
    })
    errors.length = 0
    errors.push(...deduped)
  }

  // Emit IR files per component when requested. The contract is "if the
  // user asks for IR, they get IR" regardless of `isClientComponent` or
  // adapter (#1297). Single-component files emit `<base>.ir.json`; multi-
  // component files emit one file per component as
  // `<base>.<ComponentName>.ir.json` to keep paths unique. Test harnesses
  // (go-template, Mojo) pick the IR for the primary component by matching
  // `metadata.hasDefaultExport` / `metadata.isExported`.
  if (options.outputIR) {
    for (const { componentIR } of entries) {
      const componentName = componentIR.metadata.componentName
      files.push({
        path: filePath.replace(/\.tsx?$/, `.${componentName}.ir.json`),
        content: JSON.stringify(componentIR, null, 2),
        type: 'ir',
      })
    }
  }

  // --- Pass 2: adapter.generate + generateClientJs ---
  const allOutputs: { componentName: string; rawTemplate: string; imports: string; types: string; moduleExports: string; component: string; clientJs?: string; adapterTypes?: string }[] = []

  // Find the default export name for scriptBaseName (multi-component files share one .client.js)
  const defaultExportName = entries.find(e => e.componentIR.metadata.hasDefaultExport)?.componentIR.metadata.componentName

  // Union of sibling-component inline exports — passed to each per-component
  // emit so the trailing `export { ... }` block is identical across siblings
  // and the line-dedup pass collapses them.
  const fileWideInlineExported = new Set<string>()
  for (const { componentIR } of entries) {
    for (const name of collectInlineExportedNames(componentIR)) {
      fileWideInlineExported.add(name)
    }
  }

  // Module-scope statements (types, consts, functions, SSR-side context
  // bindings) are file-wide, but each component's IR may carry a different
  // SUBSET — the analyzer collects the module declarations lexically
  // preceding the component, so in a file that interleaves constants with
  // component functions the blocks are unequal prefixes of one another
  // (carousel does this). Whole-block string dedup would then emit every
  // prefix and redeclare each name (TS2300/TS2451), while per-LINE dedup
  // would corrupt multi-line declarations (repeated `})` lines collapse).
  // So dedup at the TOP-LEVEL-STATEMENT level via a TS parse of each block
  // — the repo-wide idiom for splitting emitted source (never regex/line
  // matching). Identical statements re-collected across components dedup
  // to their first occurrence, preserving source order.
  const moduleStatementSeen = new Set<string>()
  const moduleStatementsOrdered: string[] = []
  const collectModuleStatements = (block: string): void => {
    const sf = ts.createSourceFile(
      '__bf_module_decls.tsx',
      block,
      ts.ScriptTarget.Latest,
      /* setParentNodes */ false,
      ts.ScriptKind.TSX,
    )
    for (const stmt of sf.statements) {
      const text = stmt.getText(sf)
      if (moduleStatementSeen.has(text)) continue
      moduleStatementSeen.add(text)
      moduleStatementsOrdered.push(text)
    }
  }

  // Component-name scope: rewrite `hydrate` / `renderChild` / `initChild` /
  // `createComponent` / `upsertChild` keys for non-exported helpers
  // (`function SunIcon` inside theme-switcher.tsx) so they cannot collide
  // with same-named components from another file in the global runtime
  // registry. Exported components keep their original name — their cross-
  // file consumers still resolve them as before.
  const fileScope = computeFileScope(filePath)
  const nonExportedSiblings = new Set<string>()
  for (const { componentIR } of entries) {
    if (!componentIR.metadata.isExported) {
      nonExportedSiblings.add(componentIR.metadata.componentName)
    }
  }
  setActiveComponentScope({ fileScope, nonExportedSiblings })
  // Same adapter capabilities for every component compiled in this file
  // (#1187 phase 3).
  const multiAdapterCaps = {
    templatePrimitives: options.adapter.templatePrimitives,
    acceptsTemplateCall: options.adapter.acceptsTemplateCall,
  }
  try {

  for (const { componentIR } of entries) {
    // Non-default exports share the parent's .client.js, so they
    // route to the default export's script name. The pipeline's
    // path-based override (`options.scriptBaseName`) takes
    // precedence when set — it captures the on-disk filename
    // (e.g. `ui/button/index`) which the default-export name
    // (`Button`) doesn't.
    const scriptBaseName =
      options.scriptBaseName ??
      (!componentIR.metadata.hasDefaultExport && defaultExportName ? defaultExportName : undefined)
    const adapterOutput = adapter.generate(componentIR, {
      scriptBaseName,
      siblingTemplatesRegistered: options.siblingTemplatesRegistered,
      rewriteRelativeImport: options.rewriteRelativeImport,
      scriptAssets: options.scriptAssets,
      preloadAssets: options.preloadAssets,
    })
    const moduleExports = generateModuleExports(
      componentIR,
      fileWideInlineExported,
      options.rewriteRelativeImport,
      { skipValueDeclarations: adapterOutput.sections.moduleConstantsIncludeExports },
    )

    const s = adapterOutput.sections
    const imports = s.imports
    const types = s.types
    const component = s.component + (s.defaultExport || '')
    const mc = s.moduleConstants
    if (mc) collectModuleStatements(mc)

    allOutputs.push({
      componentName: componentIR.metadata.componentName,
      rawTemplate: adapterOutput.template,
      imports,
      types,
      moduleExports: moduleExports || '',
      component,
      clientJs: generateClientJs(
        componentIR,
        componentNames,
        options.localImportPrefixes,
        undefined,
        multiAdapterCaps,
        options.profile,
      ) || undefined,
      adapterTypes: adapterOutput.types || undefined,
    })
    errors.push(...componentIR.errors)
  }
  } finally {
    setActiveComponentScope(null)
  }

  if (allOutputs.length === 0) {
    return { files, errors }
  }

  // Per-component adapters (e.g. Mojolicious) need one template file per component
  // because their template renderers look up templates by filename.
  if (adapter.templatesPerComponent) {
    const dir = filePath.substring(0, filePath.lastIndexOf('/') + 1)
    for (const output of allOutputs) {
      files.push({
        path: dir + output.componentName + adapter.extension,
        content: output.rawTemplate,
        type: 'markedTemplate',
        componentName: output.componentName,
      })
      // SSR defaults, paired with the per-component template file via
      // the matching basename (the build pipeline pairs them in
      // `compileEntry`).
      const ir = entries.find(e => e.componentIR.metadata.componentName === output.componentName)
      const ssrDefaults = ir ? extractSsrDefaults(ir.componentIR.metadata) : undefined
      if (ssrDefaults) {
        files.push({
          path: dir + output.componentName + '.ssr-defaults.json',
          content: JSON.stringify(ssrDefaults),
          type: 'ssrDefaults',
          componentName: output.componentName,
        })
      }
    }
    // Types and client JS remain one-per-source-file (shared across components)
    const adapterTypesOutputs = allOutputs.map(o => o.adapterTypes).filter(Boolean) as string[]
    if (adapterTypesOutputs.length > 0) {
      files.push({
        path: filePath.replace(/\.tsx?$/, '.types'),
        content: adapterTypesOutputs.join('\n\n'),
        type: 'types',
      })
    }
    const clientJsOutputs = allOutputs.map(o => o.clientJs).filter(Boolean) as string[]
    if (clientJsOutputs.length > 0) {
      // Same conflict-free fold `mergeTemplateImports` already does for
      // SSR template imports — see its docstring for why a plain
      // exact-line dedup re-declares a shared default/named import across
      // sibling components (#2767 follow-up).
      const importLines: string[] = []
      const allCode: string[] = []
      for (const js of clientJsOutputs) {
        for (const line of js.split('\n')) {
          if (line.startsWith('import ')) importLines.push(line)
        }
        allCode.push(js.replace(/^import .+\n/gm, '').trim())
      }
      files.push({
        path: filePath.replace(/\.tsx?$/, '.client.js'),
        content: [mergeTemplateImports(importLines), '', ...allCode.filter(Boolean)].join('\n'),
        type: 'clientJs',
      })
    }
    return { files, errors }
  }

  // Merge imports from all components. Named imports from the same source
  // are combined into their first occurrence rather than deduplicated by
  // exact line: in a multi-component file each component emits its own
  // `import { … } from '@barefootjs/hono/utils'` listing only the symbols
  // it uses, so plain line-dedup leaves several statements that re-declare
  // the same binding (e.g. `bfComment`). Bun tolerates the redeclaration,
  // but stricter ESM parsers — including Deno, used to render the SSR
  // template — reject it as a SyntaxError.
  const mergedImports = mergeTemplateImports(
    allOutputs.flatMap(o => (o.imports ? o.imports.split('\n') : [])),
  )

  // Combine unique type definitions
  const seenTypes = new Set<string>()
  const uniqueTypes: string[] = []
  for (const output of allOutputs) {
    if (output.types && !seenTypes.has(output.types)) {
      seenTypes.add(output.types)
      uniqueTypes.push(output.types)
    }
  }

  // Deduplicate module-level exports across components
  const seenModuleExports = new Set<string>()
  const uniqueModuleExports: string[] = []
  for (const output of allOutputs) {
    if (output.moduleExports) {
      for (const line of output.moduleExports.split('\n')) {
        if (line.trim() && !seenModuleExports.has(line)) {
          seenModuleExports.add(line)
          uniqueModuleExports.push(line)
        }
      }
    }
  }

  // Combine all components
  const combinedTemplate = [
    mergedImports,
    moduleStatementsOrdered.join('\n\n'),
    uniqueTypes.join('\n\n'),
    uniqueModuleExports.length > 0 ? uniqueModuleExports.join('\n') : '',
    ...allOutputs.map(o => o.component),
  ]
    .filter(Boolean)
    .join('\n\n')

  files.push({
    path: filePath.replace(/\.tsx?$/, adapter.extension),
    content: combinedTemplate,
    type: 'markedTemplate',
  })

  // SSR defaults — for non-per-component adapters the single template
  // is keyed by source filename, so only the entry-point component's
  // defaults are surfaced (default export → exported sibling → first).
  {
    const entryIR =
      entries.find(e => e.componentIR.metadata.hasDefaultExport) ??
      entries.find(e => e.componentIR.metadata.isExported) ??
      entries[0]
    const ssrDefaults = entryIR ? extractSsrDefaults(entryIR.componentIR.metadata) : undefined
    if (ssrDefaults) {
      files.push({
        path: filePath.replace(/\.tsx?$/, '.ssr-defaults.json'),
        content: JSON.stringify(ssrDefaults),
        type: 'ssrDefaults',
      })
    }
  }

  // Emit combined adapter types if any
  const adapterTypesOutputs = allOutputs.map(o => o.adapterTypes).filter(Boolean) as string[]
  if (adapterTypesOutputs.length > 0) {
    files.push({
      path: filePath.replace(/\.tsx?$/, '.types'),
      content: adapterTypesOutputs.join('\n\n'),
      type: 'types',
    })
  }

  // Combine client JS if any. Same conflict-free fold `mergeTemplateImports`
  // does for SSR template imports (see its docstring) — a plain exact-line
  // dedup would re-declare a default/named import shared across sibling
  // components (#2767 follow-up).
  const clientJsOutputs = allOutputs.map(o => o.clientJs).filter(Boolean) as string[]
  if (clientJsOutputs.length > 0) {
    const importLines: string[] = []
    const allCode: string[] = []

    for (const js of clientJsOutputs) {
      const codeLines: string[] = []
      for (const line of js.split('\n')) {
        if (line.startsWith('import ')) {
          importLines.push(line)
        } else {
          codeLines.push(line)
        }
      }
      allCode.push(codeLines.join('\n').trim())
    }

    const combinedClientJs = [
      mergeTemplateImports(importLines),
      '',
      ...allCode.filter(Boolean),
    ].join('\n')

    files.push({
      path: filePath.replace(/\.tsx?$/, '.client.js'),
      content: combinedClientJs,
      type: 'clientJs',
    })
  }

  return { files, errors }
}

// =============================================================================
// Helpers
// =============================================================================

/**
 * Verbatim text of the component function's own generic type parameter
 * list (`<NodeType extends NodeBase = NodeBase, EdgeType extends EdgeBase
 * = EdgeBase>`), or `null` when the component isn't generic. Source text
 * per parameter (`node.getText(sourceFile)`), not a re-printed AST, so
 * constraints/defaults/comments round-trip exactly like `ConstantInfo.
 * typeAnnotation` does for `let` (#2589) — see `IRMetadata.typeParameters`.
 */
function componentTypeParametersText(
  componentNode: ts.FunctionDeclaration | ts.ArrowFunction | null,
  sourceFile: ts.SourceFile,
): string | null {
  const typeParameters = componentNode?.typeParameters
  if (!typeParameters || typeParameters.length === 0) return null
  return `<${typeParameters.map(p => p.getText(sourceFile)).join(', ')}>`
}

export function buildMetadata(
  ctx: ReturnType<typeof analyzeComponent>,
): IRMetadata {
  const metadata: IRMetadata = {
    componentName: ctx.componentName || 'Unknown',
    hasDefaultExport: ctx.hasDefaultExport,
    isExported: ctx.isExported,
    isClientComponent: ctx.hasUseClientDirective,
    typeDefinitions: ctx.typeDefinitions,
    propsType: ctx.propsType,
    typeParameters: componentTypeParametersText(ctx.componentNode, ctx.sourceFile),
    propsParams: ctx.propsParams,
    propsObjectName: ctx.propsObjectName,
    restPropsName: ctx.restPropsName,
    restPropsExpandedKeys: ctx.restPropsExpandedKeys,
    signals: ctx.signals,
    memos: ctx.memos,
    effects: ctx.effects,
    onMounts: ctx.onMounts,
    initStatements: ctx.initStatements,
    imports: ctx.imports,
    // `templateImports` is the raw import list adapters consider for SSR
    // re-emission. Adapters that re-emit imports (Hono, test) call
    // `rewriteImportsForTemplate` themselves to apply client-shim rewrite or
    // strip behaviour; adapters whose templates never carry imports (Go,
    // Mojo) only consult this list for diagnostics like BF103. The
    // compile-away built-ins (`<Async>` / `<Region>`) are stripped here so
    // their `@barefootjs/client` import never reaches any adapter's template
    // as a phantom (#1915).
    templateImports: stripClientBuiltinImports(ctx.imports),
    namedExports: ctx.namedExports,
    localFunctions: ctx.localFunctions,
    localConstants: ctx.localConstants,
  }
  // Computed from the assembled metadata (not `ctx`): the plan reads the
  // exact fields adapters see, so the two can never disagree.
  metadata.ssrSeedPlan = computeSsrSeedPlan(metadata)
  return metadata
}

// =============================================================================
// Main Entry Point
// =============================================================================

export function compileJSX(
  source: string,
  filePath: string,
  options: CompileOptionsWithAdapter
): CompileResult {
  const files: FileOutput[] = []
  const errors: CompileResult['errors'] = []

  // Inline JSX-callback preprocessing (#1211): hoist
  // `renderNode={(n) => <div/>}` style arrows into synthesized
  // `'use client'` components before downstream parsing. Without this
  // the arrows survive as raw JSX in the emitted client bundle and
  // crash the parser.
  const preprocessed = preprocessInlineJsxCallbacks(source, filePath)
  errors.push(...preprocessed.errors)
  if (preprocessed.errors.length > 0) {
    return { files, errors }
  }
  const compileSource = preprocessed.source

  // List all exported components
  const componentNames = listComponentFunctions(compileSource, filePath)

  // If multiple components, compile each separately and combine
  if (componentNames.length > 1) {
    return compileMultipleComponents(compileSource, filePath, componentNames, options)
  }

  // Single component flow
  const ctx = analyzeComponent(compileSource, filePath, undefined, options.program, options.adapter.acceptsCallbackBody)

  if (!ctx.jsxReturn) {
    errors.push(...ctx.errors)

    // State-only file: no component, but has exported @client signals.
    // Produce a standalone client JS module so other components can
    // `import { count, setCount } from './state.client.js'`.
    const exportedModuleSignals = ctx.signals.filter(s => s.isModule && s.isExported)
    const exportedModuleMemos = ctx.memos.filter(m => m.isModule && m.isExported)
    if (exportedModuleSignals.length > 0 || exportedModuleMemos.length > 0) {
      const body = emitModuleLevelDeclarations([], [], exportedModuleSignals, exportedModuleMemos)
      const runtimeImports = detectUsedImportsFromCode(body)
      const sortedRuntimeImports = [...runtimeImports].sort()
      const runtimeImportLine = sortedRuntimeImports.length > 0
        ? `import { ${sortedRuntimeImports.join(', ')} } from '${RUNTIME_MODULE}'`
        : ''

      // Preserve non-runtime user imports whose specifiers are referenced
      // in the generated body (e.g. an initializer that calls an imported
      // helper: `createSignal(defaultValue())`). A default- or namespace-
      // imported helper needs its own import syntax, not named braces —
      // see `renderUsedImportLines`'s docstring.
      const externalImportLines: string[] = []
      const isUsedAsValue = makeValueUsageTest(body)
      for (const imp of ctx.imports) {
        if (imp.isTypeOnly) continue
        if (imp.source === '@barefootjs/client' || imp.source === RUNTIME_MODULE) continue
        if (imp.specifiers.length === 0) {
          externalImportLines.push(`import '${imp.source}'`)
          continue
        }
        const usedNamed: string[] = []
        let usedDefault: string | null = null
        let usedNamespace: string | null = null
        for (const s of imp.specifiers) {
          if (s.isTypeOnly) continue
          const localName = s.alias || s.name
          if (!isUsedAsValue(localName)) continue
          if (s.isDefault) {
            usedDefault = localName
          } else if (s.isNamespace) {
            usedNamespace = localName
          } else {
            usedNamed.push(s.alias ? `${s.name} as ${s.alias}` : s.name)
          }
        }
        externalImportLines.push(...renderUsedImportLines(imp.source, usedDefault, usedNamespace, usedNamed))
      }

      const allImports = [runtimeImportLine, ...externalImportLines].filter(Boolean).join('\n')
      const clientJsPath = filePath.replace(/\.tsx?$/, '.client.js')
      files.push({ path: clientJsPath, content: allImports + (allImports ? '\n\n' : '') + body, type: 'clientJs' })
    }

    return { files, errors }
  }

  const ir = jsxToIR(ctx)
  errors.push(...ctx.errors)  // All errors: analyzer + IR phase

  if (!ir) {
    return { files, errors }
  }

  const componentIR: ComponentIR = {
    version: '0.1',
    metadata: buildMetadata(ctx),
    root: ir,
    errors: [],
  }

  // Pre-compute client JS analysis for adapter optimization
  componentIR.metadata.clientAnalysis = analyzeClientNeeds(componentIR)
  checkRichTypeMethodCalls(componentIR.root, componentIR.metadata, errors)
  checkRichTypePropSerialization(componentIR.root, componentIR.metadata, errors, ctx.propsDestructuring?.loc)

  // Slot unification Step B (`spec/slot-unification.md` §5 Step B): decide
  // marker elision ONCE, mutating `componentIR.root` in place, before either
  // `adapter.generate` or `generateClientJs` run below — both must see the
  // SAME `markerless`/`elidedPath` flags on the SAME IR nodes.
  decideClientOnlyElision(componentIR.root)

  // Cross-file @client signal sources: identify which import sources
  // need `.client.js` path rewriting in the client bundle.
  if (ctx.importedClientSignalNames.size > 0) {
    const sources = new Set<string>()
    for (const imp of ctx.imports) {
      if (imp.isTypeOnly) continue
      if (!imp.source.startsWith('./') && !imp.source.startsWith('../')) continue
      for (const spec of imp.specifiers) {
        // A type-only specifier must not force a `.client.js` source
        // rewrite — it has no runtime binding (#2432).
        if (spec.isTypeOnly) continue
        if (ctx.importedClientSignalNames.has(spec.alias ?? spec.name)) {
          sources.add(imp.source)
          break
        }
      }
    }
    if (sources.size > 0) {
      componentIR.metadata.clientSignalImportSources = sources
    }
  }

  // Apply CSS layer prefix if configured
  if (options.cssLayerPrefix) {
    applyCssLayerPrefix(componentIR, options.cssLayerPrefix)
  }

  if (options.outputIR) {
    files.push({
      path: filePath.replace(/\.tsx?$/, '.ir.json'),
      content: JSON.stringify(componentIR, null, 2),
      type: 'ir',
    })
  }

  const adapter = options.adapter
  const adapterOutput = adapter.generate(componentIR, {
    scriptBaseName: options.scriptBaseName,
    siblingTemplatesRegistered: options.siblingTemplatesRegistered,
    rewriteRelativeImport: options.rewriteRelativeImport,
    scriptAssets: options.scriptAssets,
    preloadAssets: options.preloadAssets,
  })

  // `templatesPerComponent` adapters (Mojolicious) emit non-JS template files
  // (`.html.ep`), so imports / types / module exports / default-export
  // sections don't belong in the output — the template engine renders them
  // as plain text. Mirror `compileMultipleComponents`'s `templatesPerComponent`
  // branch and use the raw template directly.
  const s = adapterOutput.sections
  let content: string
  if (adapter.templatesPerComponent) {
    content = adapterOutput.template
  } else {
    const moduleExports = generateModuleExports(componentIR, undefined, options.rewriteRelativeImport, {
      skipValueDeclarations: s.moduleConstantsIncludeExports,
    })
    content = [s.imports, s.moduleConstants ?? '', s.types, moduleExports, s.component]
      .filter(Boolean).join('\n\n') + (s.defaultExport || '')
  }

  files.push({
    path: filePath.replace(/\.tsx?$/, adapter.extension),
    content,
    type: 'markedTemplate',
    componentName: componentIR.metadata.componentName,
  })

  // SSR defaults — JSON-encoded seed values for the template's
  // stash, derived statically from props / signals / memos. The CLI
  // build pipeline reads this output (it isn't written to disk) and
  // attaches it to the manifest entry so adapters can populate the
  // SSR stash without per-component wire-up in user code.
  {
    const ssrDefaults = extractSsrDefaults(componentIR.metadata)
    if (ssrDefaults) {
      files.push({
        path: filePath.replace(/\.tsx?$/, '.ssr-defaults.json'),
        content: JSON.stringify(ssrDefaults),
        type: 'ssrDefaults',
        componentName: componentIR.metadata.componentName,
      })
    }
  }

  // Emit adapter types as a separate FileOutput
  if (adapterOutput.types) {
    files.push({
      path: filePath.replace(/\.tsx?$/, '.types'),
      content: adapterOutput.types,
      type: 'types',
    })
  }

  const clientJsPath = filePath.replace(/\.tsx?$/, '.client.js')
  // Single-component file: only the component itself can collide. Scope it
  // when it's non-exported so a private helper can't be overwritten by an
  // identically-named exported component in another file.
  const singleScope = {
    fileScope: computeFileScope(filePath),
    nonExportedSiblings: componentIR.metadata.isExported
      ? new Set<string>()
      : new Set([componentIR.metadata.componentName]),
  }
  setActiveComponentScope(singleScope)
  // Adapter capabilities thread through to relocate's inline-safety
  // check so a registered template primitive escapes the bridged-arg /
  // zero-arg rejection (#1187 phase 3).
  const adapterCaps = {
    templatePrimitives: options.adapter.templatePrimitives,
    acceptsTemplateCall: options.adapter.acceptsTemplateCall,
  }
  try {
    if (options.sourceMaps) {
      const result = generateClientJsWithSourceMap(
        componentIR,
        undefined,
        options.localImportPrefixes,
        {
          sourceMaps: true,
          generatedFileName: clientJsPath.split('/').pop(),
        },
        undefined,
        adapterCaps,
        options.profile,
      )
      errors.push(...componentIR.errors)
      if (result.code) {
        files.push({ path: clientJsPath, content: result.code, type: 'clientJs' })
        if (result.sourceMap) {
          files.push({ path: clientJsPath + '.map', content: JSON.stringify(result.sourceMap), type: 'sourceMap' as FileOutput['type'] })
        }
      }
    } else {
      const clientJs = generateClientJs(
        componentIR,
        undefined,
        options.localImportPrefixes,
        undefined,
        adapterCaps,
        options.profile,
      )
      errors.push(...componentIR.errors)
      if (clientJs) {
        files.push({ path: clientJsPath, content: clientJs, type: 'clientJs' })
      }
    }
  } finally {
    setActiveComponentScope(null)
  }

  return { files, errors }
}

// =============================================================================
// Export Types
// =============================================================================

export type { ComponentIR, CompileOptions, CompileResult, FileOutput }
