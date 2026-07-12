/**
 * Go Template test renderer
 *
 * Compiles JSX source with GoTemplateAdapter and renders to HTML via `go run`.
 * Used by adapter-tests conformance runner.
 */

import { compileJSX } from '@barefootjs/jsx'
import type { TemplateAdapter, ComponentIR, ParsedExpr } from '@barefootjs/jsx'
import { GoTemplateAdapter } from './adapter/go-template-adapter.ts'
import { deduplicateGoTypes } from './build.ts'
import { capitalizeFieldName, goFieldNameForKey, loopKeyToGoFieldPath } from './adapter/lib/go-naming.ts'
import { findNestedComponents } from './adapter/analysis/component-tree.ts'
import type { NestedComponentInfo } from './adapter/lib/types.ts'
import { mkdir, rm } from 'node:fs/promises'
import { resolve } from 'node:path'

const RENDER_TEMP_DIR = resolve(import.meta.dir, '../.render-temp')
const GO_RUNTIME_DIR = resolve(import.meta.dir, '../runtime')

export class GoNotAvailableError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'GoNotAvailableError'
  }
}

let _goAvailable: boolean | null = null
async function isGoAvailable(): Promise<boolean> {
  if (_goAvailable !== null) return _goAvailable
  try {
    // If the caller pinned GOTOOLCHAIN to a specific version, run
    // `go version` under it — `go` itself respects GOTOOLCHAIN and
    // will auto-fetch the requested toolchain. This means the
    // availability probe reports the *effective* version, not the
    // system Go.
    const env = { ...process.env, GOTOOLCHAIN: process.env.GOTOOLCHAIN ?? 'local' }
    const proc = Bun.spawn(['go', 'version'], { stdout: 'pipe', stderr: 'pipe', env })
    const stdout = await new Response(proc.stdout).text()
    await proc.exited
    if (proc.exitCode !== 0) { _goAvailable = false; return false }

    // Check Go version is sufficient (go.mod requires 1.25+)
    const match = stdout.match(/go(\d+)\.(\d+)/)
    if (match) {
      const major = parseInt(match[1], 10)
      const minor = parseInt(match[2], 10)
      _goAvailable = major > 1 || (major === 1 && minor >= 25)
    } else {
      _goAvailable = false
    }
  } catch {
    _goAvailable = false
  }
  return _goAvailable
}

export interface RenderOptions {
  /** JSX source code */
  source: string
  /** Template adapter to use */
  adapter: TemplateAdapter
  /** Props to inject (optional) */
  props?: Record<string, unknown>
  /** Additional component files (filename → source) */
  components?: Record<string, string>
  /**
   * Pre-compiled child SSR modules (import specifier → path) — consumed
   * by the Hono renderer; here only the KEYS matter (#1896): they carry
   * EVERY specifier a sibling is reachable by (`@ui/components/ui/icon`
   * and `../icon`), whereas `components` keys carry one per sibling, so
   * the sibling-import recognition uses both.
   */
  componentModules?: Record<string, string>
  /**
   * Explicit component to render when `source` declares multiple
   * exports (e.g. `ReactiveProps.tsx` → `PropsReactivityComparison`).
   * Mirrors the Hono reference's `componentName`; omitted for
   * single-export fixtures, which fall back to the default/first export.
   */
  componentName?: string
}

export async function renderGoTemplateComponent(options: RenderOptions): Promise<string> {
  const { source, adapter, props, components, componentModules, componentName: requestedName } = options

  if (!adapter.generateTypes) {
    throw new Error('Go Template adapter must implement generateTypes()')
  }

  // Compile child components first, keeping per-component template defines /
  // type blocks keyed by component name. A child *file* can export many
  // components (e.g. `../icon` exports 30+ icons); only the ones the parent
  // transitively references are emitted into the combined unit. Emitting all
  // of them concatenates dead components whose own codegen may not compile
  // (e.g. `ChevronDownIcon`'s `strokePaths['chevron-down']` lowers to an
  // invalid `{{.StrokePaths.Chevron-down}}` field reference), which would
  // break the whole template parse even though the parent never uses them.
  // (#checkbox)
  interface ChildComponentArtifacts {
    define: string
    typeBlock: string | null
    /** Component names this child component imports from sibling files. */
    importedNames: string[]
  }
  const childArtifacts = new Map<string, ChildComponentArtifacts>()
  // Import specifiers the harness holds child sources for — recognised as
  // sibling imports alongside relative ones (see
  // `collectImportedComponentNames`).
  const childSpecifiers = new Set([
    ...Object.keys(components ?? {}),
    ...Object.keys(componentModules ?? {}),
  ])
  if (components) {
    // Two passes (#1896): a child file may itself render a component from a
    // *sibling* child file (data-table's `checkbox` renders `<CheckIcon
    // data-slot=.../>` from `icon`). `generateTypes` routes such non-param
    // attributes through the target's registered shape, so EVERY child's
    // shape must be registered before ANY child's types are generated —
    // otherwise processing order decides whether the attribute lands in
    // the rest bag or becomes an invalid hyphenated Go field.
    const compiledChildIrs: Array<{ ir: ComponentIR; defines: Map<string, string> }> = []
    for (const [filename, childSource] of Object.entries(components)) {
      const childResult = compileJSX(childSource, filename, { adapter, outputIR: true })
      const childErrors = childResult.errors.filter(e => e.severity === 'error')
      if (childErrors.length > 0) {
        throw new Error(`Compilation errors in ${filename}:\n${childErrors.map(e => e.message).join('\n')}`)
      }
      const childTemplate = childResult.files.find(f => f.type === 'markedTemplate')
      if (!childTemplate) throw new Error(`No marked template for ${filename}`)
      const defineBlocks = splitTemplateDefines(childTemplate.content)

      const childIrFiles = childResult.files.filter(f => f.type === 'ir')
      for (const childIrFile of childIrFiles) {
        const childIR = JSON.parse(childIrFile.content) as ComponentIR
        // (#checkbox) Register each child's cross-component shape so the
        // parent's static-child-init codegen can route a non-param attribute
        // (`<CheckIcon data-slot=.../>`) into the child's rest bag instead of
        // an invalid hyphenated Go field. No-op on adapters without the hook.
        registerChildShape(adapter, childIR)
        compiledChildIrs.push({ ir: childIR, defines: defineBlocks })
      }
    }
    for (const { ir: childIR, defines } of compiledChildIrs) {
      const name = childIR.metadata.componentName
      let typeBlock: string | null = adapter.generateTypes!(childIR)
      if (typeBlock) {
        // Strip package declaration and imports — will be merged into main types
        typeBlock = typeBlock.replace(/^package \w+\n*/, '')
        typeBlock = typeBlock.replace(/import\s*\([^)]*\)\n*/g, '')
        typeBlock = typeBlock.replace(/\t"math\/rand"\n/g, '')
        typeBlock = typeBlock.trim()
      }
      childArtifacts.set(name, {
        define: defines.get(name) ?? '',
        typeBlock,
        importedNames: collectImportedComponentNames(childIR, childSpecifiers),
      })
    }
  }

  // Compile parent source. `siblingTemplatesRegistered: Boolean(components)`
  // matches this harness's real behavior — every sibling child template is concatenated
  // into `tmplContent` and parsed onto one `*template.Template` instance
  // below, so a loop-body cross-template call resolves at render time (#2205).
  const result = compileJSX(source, 'component.tsx', {
    adapter,
    outputIR: true,
    siblingTemplatesRegistered: Boolean(components),
  })

  const errors = result.errors.filter(e => e.severity === 'error')
  if (errors.length > 0) {
    throw new Error(`Compilation errors:\n${errors.map(e => e.message).join('\n')}`)
  }

  const templateFile = result.files.find(f => f.type === 'markedTemplate')
  if (!templateFile) throw new Error('No marked template in compile output')

  // Collect every IR emitted from the parent source. Single-component
  // files yield one file; multi-component files yield one per component
  // (#1297). Pick the entry-point IR — default export wins, else the
  // first inline-exported component, else the first IR.
  const irFiles = result.files.filter(f => f.type === 'ir')
  if (irFiles.length === 0) throw new Error('No IR output (set outputIR: true)')
  const irs = irFiles.map(f => JSON.parse(f.content) as ComponentIR)
  // Explicit `componentName` wins (multi-export sources pin which export
  // is the render target); otherwise default-export, then first inline-
  // exported, then first IR. Mirrors the Hono reference's selection so
  // multi-component fixtures (e.g. `ReactiveProps.tsx`) render the same
  // export across adapters.
  const ir =
    (requestedName ? irs.find(i => i.metadata.componentName === requestedName) : undefined) ??
    irs.find(i => i.metadata.hasDefaultExport) ??
    irs.find(i => i.metadata.isExported) ??
    irs[0]

  // (#checkbox) Register each in-source sibling's shape too, so a parent
  // rendering an inline sibling routes non-param attributes into the
  // sibling's rest bag (same fix as the auto-inferred `../<name>` children).
  for (const siblingIR of irs) registerChildShape(adapter, siblingIR)

  // (#checkbox) Resolve which child components the combined unit actually
  // needs: start from the entry component's cross-file imports, then close
  // transitively over each included child's own imports. Components a child
  // *file* exports but nobody references are dropped (see comment at the
  // child-collection loop above).
  const reachableChildNames = new Set<string>()
  {
    // Seed from EVERY component of the parent source, not just the entry:
    // the siblings' type blocks are merged into the unit too, and their
    // constructors reference their own child components' Props types
    // (#1896 — dropdown-menu-demo's profile sibling uses SettingsIcon,
    // which the entry export never imports... the import list is per-file,
    // but per-IR metadata can differ after analysis; union them all).
    const queue = irs.flatMap(i => collectImportedComponentNames(i, childSpecifiers))
    while (queue.length > 0) {
      const name = queue.shift()!
      if (reachableChildNames.has(name)) continue
      const artifact = childArtifacts.get(name)
      if (!artifact) continue // not a compiled child (e.g. an in-source sibling)
      reachableChildNames.add(name)
      for (const dep of artifact.importedNames) queue.push(dep)
    }
  }
  const childTemplates: string[] = []
  const childTypeBlocks: string[] = []
  for (const name of reachableChildNames) {
    const artifact = childArtifacts.get(name)
    if (!artifact) continue
    if (artifact.define) childTemplates.push(artifact.define)
    if (artifact.typeBlock) childTypeBlocks.push(artifact.typeBlock)
  }

  // Generate types for the entry-point component first, then append
  // types for every sibling component in the same source file so the
  // generated `types.go` is self-contained (multi-component test
  // fixtures otherwise lose helper-component struct definitions).
  let goTypes = adapter.generateTypes(ir)
  if (!goTypes) throw new Error('generateTypes() returned null')

  // Replace package declaration to match main.go
  goTypes = goTypes.replace(/^package \w+/, 'package main')

  // Remove "math/rand" import from types (randomID is defined in main.go)
  goTypes = goTypes.replace(/\t"math\/rand"\n/, '')

  // Collect sibling-component type definitions (multi-component source).
  const siblingTypeBlocks: string[] = []
  for (const siblingIR of irs) {
    if (siblingIR === ir) continue
    let siblingTypes = adapter.generateTypes(siblingIR)
    if (!siblingTypes) continue
    siblingTypes = siblingTypes.replace(/^package \w+\n*/, '')
    siblingTypes = siblingTypes.replace(/import\s*\([^)]*\)\n*/g, '')
    siblingTypes = siblingTypes.replace(/\t"math\/rand"\n/g, '')
    siblingTypeBlocks.push(siblingTypes.trim())
  }

  // Merge entry + sibling + child type blocks through the same
  // `deduplicateGoTypes` helper `bf build` uses. Duplicates arise in two
  // ways (#1896): a multi-component file emits its module-scope shared
  // types (a context-value struct, a data `type Payment = …`) once per
  // component IR — both across the entry source's own sibling exports
  // (data-table-demo's `Payment redeclared`) and across a child file's
  // components (radio-group's context value). The dedup helper re-inserts
  // type definitions at the top of its input, so the entry's
  // `package main` + import header is split off first and re-prepended.
  if (siblingTypeBlocks.length > 0 || childTypeBlocks.length > 0) {
    const headerMatch = goTypes.match(/^package main\n+import \([\s\S]*?\)\n+/)
    const header = headerMatch ? headerMatch[0] : ''
    const body = goTypes.slice(header.length)
    goTypes =
      header +
      deduplicateGoTypes(
        [body, ...siblingTypeBlocks, ...childTypeBlocks].join('\n\n'),
      )
  }

  // Sibling / child type blocks have their own `import (...)` stripped above
  // (their package decl + imports are merged into the entry component's
  // single `types.go` block). When a sibling's generated constructor uses a
  // standard-library symbol the entry component doesn't — e.g. CheckIcon's
  // `NewCheckIconProps` calls `fmt.Sprint(...)` for a `Record[key]` spread
  // lookup (#checkbox icon) — that import would be lost, producing
  // `undefined: fmt`. Re-add any such import to the entry component's import
  // block so the combined compilation unit resolves the symbol. Only `fmt`
  // is needed today; extend `MERGED_STDLIB_IMPORTS` if a future sibling pulls
  // in another stdlib package.
  goTypes = ensureMergedStdlibImports(goTypes)

  const componentName = ir.metadata.componentName
  // Concatenate all templates (child define blocks + parent)
  const template = [...childTemplates, templateFile.content].join('\n')

  // Build temp directory with Go files
  const tempDir = resolve(
    RENDER_TEMP_DIR,
    `go-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  )
  await mkdir(tempDir, { recursive: true })

  try {
    // go.mod with replace directive pointing to local runtime
    const goMod = [
      'module render-temp',
      '',
      'go 1.25.6',
      '',
      'require github.com/barefootjs/runtime/bf v0.0.0',
      '',
      `replace github.com/barefootjs/runtime/bf => ${GO_RUNTIME_DIR}`,
    ].join('\n')
    await Bun.write(resolve(tempDir, 'go.mod'), goMod)

    // types.go — generated struct definitions
    await Bun.write(resolve(tempDir, 'types.go'), goTypes)

    // template content as Go raw string
    const escapedTemplate = template.replace(/`/g, '` + "`" + `')

    // Build props initialization (typed against the generated Input struct so
    // an array-of-objects prop emits e.g. `[]ToggleItemInput{…}`, not `[]any`).
    const propsInit = buildGoPropsInit(componentName, props, ir, goTypes)

    // Honour `__instanceId` from props for the root scope id so
    // shared-component fixtures (which pin `<ComponentName>_test`) match
    // cross-adapter; default to 'test' otherwise.
    const rootScopeId = typeof props?.__instanceId === 'string' ? props.__instanceId : 'test'

    // (#2209 part 2) Route-handler-equivalent seeding for a signal-backed
    // dynamic child-component loop — see buildDynamicChildLoopSeeding's
    // docstring.
    const { lines: dynamicSeedingLines, needsFmt } = buildDynamicChildLoopSeeding(ir, template)

    // main.go — render program
    const mainGo = `package main

import (
${needsFmt ? '\t"fmt"\n' : ''}	"html/template"
	"math/rand"
	"os"

	bf "github.com/barefootjs/runtime/bf"
)

// Silence unused import for bf if only FuncMap is used
var _ = bf.FuncMap

// Merge StreamingFuncMap into the base FuncMap so fixtures using
// <Async> (which compiles to a bfAsyncBoundary call) can be parsed
// by the test harness. See packages/adapter-go-template/runtime/streaming.go
// for the recommended merge recipe.
func bfTestFuncMap() template.FuncMap {
	funcMap := bf.FuncMap()
	for k, v := range bf.StreamingFuncMap() {
		funcMap[k] = v
	}
	return funcMap
}

const tmplContent = \`${escapedTemplate}\`

// randomID generates a random alphanumeric string of given length.
// Required by generated NewXxxProps constructors.
func randomID(n int) string {
	const letters = "abcdefghijklmnopqrstuvwxyz0123456789"
	b := make([]byte, n)
	for i := range b {
		b[i] = letters[rand.Intn(len(letters))]
	}
	return string(b)
}

func main() {
	// Two-step Funcs: bf_tmpl (children defines, #1896) needs a closure
	// over the same template set the defines are parsed into.
	root := template.New("").Funcs(bfTestFuncMap())
	root = root.Funcs(bf.TemplateFuncMap(root))
	tmpl := template.Must(root.Parse(tmplContent))
	props := New${componentName}Props(${componentName}Input{
		ScopeID: ${JSON.stringify(rootScopeId)},
${propsInit}
	})
${dynamicSeedingLines.length > 0 ? dynamicSeedingLines.join('\n') + '\n' : ''}	if err := tmpl.ExecuteTemplate(os.Stdout, "${componentName}", props); err != nil {
		os.Stderr.WriteString("template error: " + err.Error() + "\\n")
		os.Exit(1)
	}
}
`
    await Bun.write(resolve(tempDir, 'main.go'), mainGo)

    // Check if Go is available
    if (!await isGoAvailable()) {
      throw new GoNotAvailableError('go command not found — skipping Go Template rendering')
    }

    // Run `go run .`
    // GOTOOLCHAIN=local prevents Go from downloading a newer toolchain
    // when go.mod specifies a patch version newer than the installed one.
    // Honour a caller-supplied GOTOOLCHAIN env var so CI / dev environments
    // with an older system Go can opt into Go's auto-download behaviour
    // (e.g. `GOTOOLCHAIN=go1.25.6 bun test`).
    const proc = Bun.spawn(['go', 'run', '.'], {
      cwd: tempDir,
      stdout: 'pipe',
      stderr: 'pipe',
      env: { ...process.env, GOTOOLCHAIN: process.env.GOTOOLCHAIN ?? 'local' },
    })

    const [stdout, stderr] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
    ])

    const exitCode = await proc.exited
    if (exitCode !== 0) {
      // Append the offending `types.go` lines (with two lines of context)
      // for each `./types.go:NN` the compiler reported — the temp dir is
      // deleted in `finally`, so without this the merged unit that
      // actually failed is unrecoverable (#1896 debugging aid).
      const typeLines = goTypes.split('\n')
      const context: string[] = []
      const seen = new Set<number>()
      for (const m of stderr.matchAll(/\.\/types\.go:(\d+)/g)) {
        const n = Number(m[1])
        for (let i = Math.max(1, n - 2); i <= Math.min(typeLines.length, n + 2); i++) {
          if (seen.has(i)) continue
          seen.add(i)
          context.push(`${i === n ? '>' : ' '} types.go:${i}: ${typeLines[i - 1]}`)
        }
      }
      const detail = context.length > 0 ? `\n${context.join('\n')}` : ''
      throw new Error(`go run failed (exit ${exitCode}):\n${stderr}${detail}`)
    }

    return stdout
  } finally {
    await rm(tempDir, { recursive: true, force: true }).catch(() => {})
  }
}

/**
 * Split a marked-template file's content into per-component `{{define "X"}}…
 * {{end}}` blocks, keyed by component name. A child file that exports multiple
 * components yields one entry per component so the harness can emit only the
 * referenced ones (#checkbox). Non-define preamble (e.g. `export type {...}`)
 * is ignored — it isn't valid Go template text and the entry component carries
 * its own.
 */
function splitTemplateDefines(content: string): Map<string, string> {
  const out = new Map<string, string>()
  // Block actions that open a scope closed by `{{end}}`. A `{{define}}` body
  // can contain nested `{{if}}` / `{{range}}` / `{{with}}` / `{{block}}`, so a
  // non-greedy `.*?{{end}}` would stop at the first inner `{{end}}`. Track
  // nesting depth and capture from each `{{define}}` to its matching `{{end}}`.
  const actionRe = /\{\{[-\s]*(define|if|range|with|block|end)\b/g
  let m: RegExpExecArray | null
  let openName: string | null = null
  let openStart = 0
  let depth = 0
  while ((m = actionRe.exec(content)) !== null) {
    const kw = m[1]
    if (kw === 'end') {
      if (openName !== null) {
        depth--
        if (depth === 0) {
          // Extend to the close of this `{{...end...}}` action.
          const closeIdx = content.indexOf('}}', m.index)
          const end = closeIdx === -1 ? content.length : closeIdx + 2
          out.set(openName, content.slice(openStart, end))
          openName = null
        }
      }
      continue
    }
    if (kw === 'define' && openName === null) {
      const nameMatch = content.slice(m.index).match(/^\{\{[-\s]*define\s+"([^"]+)"/)
      openName = nameMatch ? nameMatch[1] : null
      openStart = m.index
      depth = 1
      continue
    }
    // Any opening action while inside a define deepens the nesting.
    if (openName !== null) depth++
  }
  return out
}

/**
 * Component names a component IR imports from sibling source files — i.e.
 * non-type imports from relative (`./` / `../`) specifiers, plus any
 * specifier the harness was explicitly handed a child source for
 * (`childSpecifiers`, the `components` map keys). The latter is how
 * demo-corpus roots reach their children: they import primitives through
 * the `@ui/components/ui/<name>` alias (#1467), which the relative-only
 * test would silently drop — emitting a parent that references
 * `New<Child>Props` without the child's type block. Used to compute the
 * transitive set of child components the combined Go unit needs.
 */
function collectImportedComponentNames(
  ir: ComponentIR,
  childSpecifiers?: ReadonlySet<string>,
): string[] {
  const names: string[] = []
  for (const imp of ir.metadata.imports ?? []) {
    if (imp.isTypeOnly) continue
    if (!imp.source.startsWith('.') && !childSpecifiers?.has(imp.source)) continue
    for (const spec of imp.specifiers ?? []) {
      if (spec.isNamespace) continue
      // Imported binding name (the local alias is what JSX references, but the
      // generated `{{define}}`/types are keyed by the exported component name —
      // which equals the specifier name when un-aliased; aliased component
      // imports aren't exercised by the UI fixtures).
      names.push(spec.alias ?? spec.name)
    }
  }
  return names
}

/**
 * Register a child/sibling component's cross-component shape on the adapter
 * when it supports the `registerChildComponentShape` hook (Go template). A
 * no-op on adapters without it. Lets the parent's static-child-init codegen
 * route a non-param attribute into the child's rest bag (#checkbox).
 */
function registerChildShape(adapter: TemplateAdapter, ir: ComponentIR): void {
  const hook = (adapter as { registerChildComponentShape?: (ir: ComponentIR) => void })
    .registerChildComponentShape
  if (typeof hook === 'function') hook.call(adapter, ir)
}

/**
 * Standard-library packages that a merged sibling/child type block may
 * reference but the entry component's own import block omits. Each entry maps
 * the import path to a `<pkg>.` usage probe.
 */
const MERGED_STDLIB_IMPORTS: Array<{ path: string; usage: RegExp }> = [
  { path: 'fmt', usage: /\bfmt\./ },
  // A child whose constructor bakes static JSX children references
  // `template.HTML(...)` (#1896 — the `command` demo's Kbd child); the
  // entry component may not use html/template itself.
  { path: 'html/template', usage: /\btemplate\.HTML\(/ },
]

/**
 * Ensure any standard-library import a merged sibling/child block needs is
 * present in the entry component's `import (...)` block. Sibling/child blocks
 * have their own imports stripped during merge, so a symbol they reference
 * (e.g. `fmt.Sprint`) is otherwise `undefined` in the combined unit.
 */
function ensureMergedStdlibImports(goTypes: string): string {
  const importMatch = goTypes.match(/import\s*\(([^)]*)\)/)
  if (!importMatch) return goTypes
  const block = importMatch[1]
  const additions: string[] = []
  for (const { path, usage } of MERGED_STDLIB_IMPORTS) {
    if (!usage.test(goTypes)) continue
    // Already imported? (quoted path present in the import block)
    if (block.includes(`"${path}"`)) continue
    additions.push(`\t"${path}"`)
  }
  if (additions.length === 0) return goTypes
  const newBlock = `import (\n${additions.join('\n')}\n${block.replace(/^\n+/, '')})`
  return goTypes.replace(/import\s*\([^)]*\)/, newBlock)
}

/**
 * Recursively resolve `expr` (a loop's `arrayParsed`) down through
 * `call`/`member` chains to the base signal getter it reads
 * (`todos().filter(...)` → `todos`), or `null` when the base isn't a
 * signal getter call. Structural `ParsedExpr` walk, not string/regex
 * parsing (see CLAUDE.md's "never parse JS with regex" rule).
 */
function findBaseSignalGetter(expr: ParsedExpr | undefined, signalGetters: ReadonlySet<string>): string | null {
  if (!expr) return null
  switch (expr.kind) {
    case 'identifier':
      return signalGetters.has(expr.name) ? expr.name : null
    case 'call':
      return findBaseSignalGetter(expr.callee, signalGetters)
    case 'member':
      return findBaseSignalGetter(expr.object, signalGetters)
    default:
      return null
  }
}

/**
 * (#2209 part 2) Replicate, in the generated `main.go`, the documented
 * "the route handler populates the loop-body child-component slice at
 * request time" contract for a signal-backed dynamic loop —
 * `generateNewPropsFunction`'s doc comment on `<Name>s []<Name>Props`
 * in `adapter/go-template-adapter.ts`. The constructor only ever seeds
 * the loop's DATUM slice (e.g. `.Todos`, straight from the caller's
 * Input); the child-component Props slice the template actually
 * ranges over (`.TodoItems`) has no server-side population path in
 * this harness — the Hono reference materializes it by literally
 * executing the component, so this closes the gap the same way:
 * derive each item's child Props from the datum slice, exactly as a
 * real route handler is documented to.
 *
 * Deliberately narrow: only fires for a loop whose (a) array source
 * resolves, through `call`/`member` chains, to a component signal
 * getter, (b) generated Go TEMPLATE text actually ranges over
 * `.<Name>s` (a plain substring check on GENERATED GO OUTPUT — not JS
 * parsing — so a `/* @client *\/`-marked loop, whose SSR template has
 * no such range, is untouched by construction), and (c) at least one
 * child prop is a bare pass-through of the loop item (`todo={todo}`).
 * Returns the Go statements to splice into `main()` plus whether `fmt`
 * needs importing.
 */
function buildDynamicChildLoopSeeding(
  ir: ComponentIR,
  template: string,
): { lines: string[]; needsFmt: boolean } {
  const signalGetters = new Set(ir.metadata.signals.map(s => s.getter))
  const lines: string[] = []
  let needsFmt = false
  for (const nested of findNestedComponents(ir.root) as NestedComponentInfo[]) {
    if (!nested.isDynamic || nested.isPropDerived) continue
    if (nested.bodyChildren && nested.bodyChildren.length > 0) continue
    if (!nested.loopParam) continue
    if (!template.includes(`:= .${nested.name}s}}`)) continue
    const datumField = findBaseSignalGetter(nested.loopArrayParsed, signalGetters)
    if (!datumField) continue

    const inputFields: string[] = []
    for (const prop of nested.props) {
      if (prop.isEventHandler) continue
      if (prop.name === 'key' || prop.name.includes('-')) continue
      if (
        prop.value.kind === 'expression' &&
        prop.value.parsed?.kind === 'identifier' &&
        prop.value.parsed.name === nested.loopParam
      ) {
        inputFields.push(`${capitalizeFieldName(prop.name)}: item`)
      }
    }
    if (inputFields.length === 0) continue

    lines.push(`\tprops.${nested.name}s = make([]${nested.name}Props, len(props.${capitalizeFieldName(datumField)}))`)
    lines.push(`\tfor i, item := range props.${capitalizeFieldName(datumField)} {`)
    lines.push(`\t\tprops.${nested.name}s[i] = New${nested.name}Props(${nested.name}Input{${inputFields.join(', ')}})`)
    lines.push(`\t\tprops.${nested.name}s[i].BfParent = props.ScopeID`)
    lines.push(`\t\tprops.${nested.name}s[i].BfMount = ${JSON.stringify(nested.slotId ?? '')}`)
    const keyField = loopKeyToGoFieldPath(nested.loopKey, nested.loopParam)
    if (keyField) {
      lines.push(`\t\tprops.${nested.name}s[i].BfDataKey = fmt.Sprint(${keyField})`)
      needsFmt = true
    }
    lines.push(`\t}`)
  }
  return { lines, needsFmt }
}

/**
 * Build Go struct field initializers from props.
 */
function buildGoPropsInit(
  componentName: string,
  props?: Record<string, unknown>,
  ir?: ComponentIR,
  goTypes?: string,
): string {
  if (!props) return ''

  // A `{...props}` rest spread on a component means props that are NOT
  // declared as named params don't get their own top-level Input struct
  // field — they flow through the open-ended rest bag (`Props map[string]any`,
  // the `Capitalize(restPropsName)` field). Without routing them there, a
  // fixture passing e.g. `placeholder` to the `Input` component (whose only
  // declared params are `className` / `type`) emits a top-level
  // `Placeholder:` initializer and Go fails with `unknown field Placeholder
  // in struct literal of type InputInput`. (#1467 Phase 2b)
  const declaredParams = new Set((ir?.metadata.propsParams ?? []).map(p => p.name))
  const restPropsName = ir?.metadata.restPropsName ?? null
  const restBagField = restPropsName ? capitalizeFieldName(restPropsName) : null

  const lines: string[] = []
  const restBagEntries: Array<[string, unknown]> = []
  for (const [key, value] of Object.entries(props)) {
    // Skip internal hydration markers — `__instanceId` / `__bfScope`
    // / `__bfChild` are routed by the framework (consumed via the
    // separate `ScopeID` struct field for `__instanceId` and never
    // appear on the user-facing input struct). Including them produces
    // `unknown field __instanceId in struct literal of type XxxInput`.
    if (key.startsWith('__')) continue
    // A prop that isn't a declared named param on a rest-spread component
    // belongs in the rest bag, not a top-level field. A key that literally
    // matches `restPropsName` already carries a pre-formed bag object and
    // maps straight onto the `Capitalize(restPropsName)` field, so it falls
    // through to the normal (object → map literal) emit below.
    if (restBagField && key !== restPropsName && !declaredParams.has(key)) {
      restBagEntries.push([key, value])
      continue
    }
    // Same Go-initialism-aware capitalizer as the real adapter (`id` → `ID`,
    // not the naive `Id`) — see `goMapLiteralFromObject`'s identical fix.
    const goField = capitalizeFieldName(key)
    if (typeof value === 'string') {
      lines.push(`\t\t${goField}: "${value}",`)
    } else if (typeof value === 'number') {
      lines.push(`\t\t${goField}: ${value},`)
    } else if (typeof value === 'boolean') {
      lines.push(`\t\t${goField}: ${value},`)
    } else if (Array.isArray(value)) {
      // Array → Go slice literal. Fixtures that exercise array-receiver
      // methods (`items.every(...)`, `items.join(' - ')`, etc. — #1448
      // method catalog) need the prop value to reach the rendered template
      // as a real slice so `range .Items` / `bf_join (.Items) ...` see
      // actual elements.
      //
      // When the Input field is a typed slice (`ToggleItems
      // []ToggleItemInput`, a loop-child array prop), emit a matching
      // typed literal (`[]ToggleItemInput{ToggleItemInput{Label: …}, …}`);
      // a bare `[]any{…}` would fail to compile against the typed field.
      // Fall back to `[]any` when the field type is `[]any` / unknown.
      const elemType = goSliceElemType(goTypes, componentName, goField)
      let sliceLiteral: string
      if (elemType && elemType.startsWith('map[')) {
        // An untyped object-array Input field (an inline prop object type
        // that didn't synthesize a named struct, e.g. `items: { title:
        // string; tags: string[] }[]` — `typeInfoToGo`'s 'object' case,
        // type-codegen.ts) resolves to `[]map[string]interface{}`, not a
        // named struct. `goTypedSliceLiteralFromArray`'s `goStructLiteral`
        // emits bare `Field: value` entries, which is struct-literal syntax
        // and doesn't compile as a map literal's keys — route these through
        // the map-literal builder instead (#2075, search-params-derived-filter).
        sliceLiteral = goTypedMapSliceLiteralFromArray(value, elemType)
      } else if (elemType) {
        sliceLiteral = goTypedSliceLiteralFromArray(value, elemType)
      } else {
        sliceLiteral = goArrayLiteralFromArray(value)
      }
      lines.push(`\t\t${goField}: ${sliceLiteral},`)
    } else if (value && typeof value === 'object') {
      // Plain object → Go `map[string]any` literal (#1407 follow-up).
      // Used by `jsx-spread-rest-prop` to populate the input-bag
      // Spread_<N> field that carries the destructured-rest payload.
      // The same harness change is needed when any future fixture
      // passes a `Record<string, unknown>`-shaped prop through.
      lines.push(`\t\t${goField}: ${goMapLiteralFromObject(value as Record<string, unknown>)},`)
    }
  }
  // Emit the collected rest-bag entries as the open-ended bag field. Skip
  // when a direct `restPropsName`-keyed prop already populated it above
  // (merging two sources isn't a shape any fixture needs).
  if (restBagField && restBagEntries.length > 0 && !(restPropsName! in props)) {
    const bag = Object.fromEntries(restBagEntries)
    lines.push(`\t\t${restBagField}: ${goMapLiteralFromObject(bag)},`)
  }
  return lines.join('\n')
}

/**
 * Look up the element type of a typed slice field on the entry component's
 * `<Component>Input` struct (e.g. `ToggleItems []ToggleItemInput` →
 * `ToggleItemInput`). Returns null when the field is absent, isn't a slice, or
 * is an untyped `[]any` / `[]interface{}` (those keep the generic `[]any`
 * harness literal). (#1297, toggle-shared)
 */
function goSliceElemType(
  goTypes: string | undefined,
  componentName: string,
  goField: string,
): string | null {
  if (!goTypes) return null
  const struct = goTypes.match(
    new RegExp(`type ${componentName}Input struct \\{([\\s\\S]*?)\\n\\}`),
  )
  if (!struct) return null
  // The element-type token can carry brackets/braces of its own (a map type
  // like `map[string]interface{}`), not just word chars — broadened so the
  // capture doesn't truncate at the first `[`. The token has no internal
  // whitespace, so it still stops cleanly before a trailing `// comment`.
  const field = struct[1].match(new RegExp(`\\n\\s*${goField}\\s+\\[\\]([\\w.[\\]{}]+)`))
  if (!field) return null
  const elem = field[1]
  if (elem === 'any' || elem === 'interface{}') return null
  return elem
}

/**
 * Emit a typed Go slice literal (`[]Elem{Elem{…}, …}`). Object elements become
 * keyed struct literals with PascalCase field names; scalar elements (for an
 * `[]string` / `[]int` field) are emitted bare. (#1297, toggle-shared)
 */
function goTypedSliceLiteralFromArray(arr: unknown[], elemType: string): string {
  const entries = arr.map(v => {
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      return goStructLiteral(v as Record<string, unknown>, elemType)
    }
    if (typeof v === 'string') return `"${v.replace(/"/g, '\\"')}"`
    if (typeof v === 'number' || typeof v === 'boolean') return String(v)
    if (v === null) return 'nil'
    return goArrayLiteralFromArray(v as unknown[])
  })
  return `[]${elemType}{${entries.join(', ')}}`
}

/**
 * Emit a typed Go slice-of-map literal (`[]map[string]interface{}{map[string]any{…}, …}`)
 * for an untyped object-array Input field. Object elements become
 * `map[string]any{"Field": val, …}` literals with PascalCase keys — Go
 * template map lookup is case-sensitive, so `{{.Title}}` needs a capitalized
 * key, same as the untyped `goArrayLiteralFromArray` fallback's object
 * entries. `map[string]any` and `map[string]interface{}` are the identical
 * type (`any` is the builtin alias for `interface{}`), so the emitted
 * literal is assignable to `elemType` regardless of which spelling the
 * Input struct field carries. (#2075, search-params-derived-filter)
 */
function goTypedMapSliceLiteralFromArray(arr: unknown[], elemType: string): string {
  const entries = arr.map(v => {
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      return goMapLiteralFromObject(v as Record<string, unknown>, true)
    }
    if (typeof v === 'string') return `"${v.replace(/"/g, '\\"')}"`
    if (typeof v === 'number' || typeof v === 'boolean') return String(v)
    if (v === null) return 'nil'
    return goArrayLiteralFromArray(v as unknown[])
  })
  return `[]${elemType}{${entries.join(', ')}}`
}

/**
 * Emit a keyed Go struct literal (`Elem{Field: val, …}`) with PascalCase field
 * names. Only the keys the caller supplied are set, so an omitted optional prop
 * (e.g. `defaultOn` on the third toggle item) takes the Go zero value. (#1297)
 */
function goStructLiteral(obj: Record<string, unknown>, typeName: string): string {
  const fields: string[] = []
  for (const [k, v] of Object.entries(obj)) {
    // `goFieldNameForKey`, not the bare `capitalizeFieldName` — a data-driven
    // key here can be non-identifier-shaped (`'data-x'`), and the real
    // adapter's own struct-literal baking (`parsed-literal-to-go.ts`)
    // sanitizes those to `DataX`, not `Data-x` (Copilot review, #2202).
    const goField = goFieldNameForKey(k)
    if (typeof v === 'string') fields.push(`${goField}: "${v.replace(/"/g, '\\"')}"`)
    else if (typeof v === 'number' || typeof v === 'boolean') fields.push(`${goField}: ${v}`)
    else if (v === null) fields.push(`${goField}: nil`)
    else if (Array.isArray(v)) fields.push(`${goField}: ${goArrayLiteralFromArray(v)}`)
    else if (v && typeof v === 'object') fields.push(`${goField}: ${goMapLiteralFromObject(v as Record<string, unknown>, true)}`)
  }
  return `${typeName}{${fields.join(', ')}}`
}

function goArrayLiteralFromArray(arr: unknown[]): string {
  const entries: string[] = []
  for (const v of arr) {
    if (typeof v === 'string') entries.push(`"${v.replace(/"/g, '\\"')}"`)
    else if (typeof v === 'number') entries.push(String(v))
    else if (typeof v === 'boolean') entries.push(String(v))
    else if (v === null) entries.push('nil')
    else if (Array.isArray(v)) entries.push(goArrayLiteralFromArray(v))
    else if (v && typeof v === 'object') {
      // Objects inside arrays are accessed via Go-struct-style
      // template field paths (`{{.Name}}`) and sort projections
      // (`bf_sort ... "Price" ...`), both of which expect PascalCase
      // identifiers. html/template does case-sensitive map lookup,
      // so emit capitalized keys so `{{.Name}}` resolves directly
      // without relying on the runtime's case-fallback. (#1487)
      entries.push(goMapLiteralFromObject(v as Record<string, unknown>, true))
    }
  }
  return `[]any{${entries.join(', ')}}`
}

function goMapLiteralFromObject(
  obj: Record<string, unknown>,
  capitalizeKeys = false,
): string {
  const entries: string[] = []
  for (const [k, v] of Object.entries(obj)) {
    // `goFieldNameForKey`, not a naive first-letter uppercase and not the
    // bare `capitalizeFieldName` — #2168 nested-loop-triple-depth: a naive
    // capitalize disagrees with the real adapter's Go-initialism-aware
    // field naming for a key like `id` (naive → "Id", adapter's generated
    // struct/template field → "ID"), so the harness baked a literal the
    // template's `{{.ID}}` lookup could never match — the fixture's
    // rendered fields came back empty at EVERY nesting depth for this
    // reason, not because of any depth limit. `capitalizeFieldName` alone
    // fixes the initialism case but still mis-bakes a non-identifier key
    // (`'data-x'` → `"Data-x"`, not the adapter's own `"DataX"` —
    // Copilot review, #2202); `goFieldNameForKey` is what the real adapter
    // uses for exactly this key-to-Go-field sanitization.
    const emittedKey = capitalizeKeys ? goFieldNameForKey(k) : k
    const key = JSON.stringify(emittedKey)
    if (typeof v === 'string') entries.push(`${key}: "${v.replace(/"/g, '\\"')}"`)
    else if (typeof v === 'number') entries.push(`${key}: ${v}`)
    else if (typeof v === 'boolean') entries.push(`${key}: ${v}`)
    else if (v === null) entries.push(`${key}: nil`)
    else if (Array.isArray(v)) {
      // Array-valued field inside an object-in-array (e.g. the `tags`
      // of `items.flatMap(i => i.tags)`). Without this branch the field
      // was silently dropped, leaving an empty map so the template
      // rendered nothing for the projection (#1448 Tier C flatMap).
      entries.push(`${key}: ${goArrayLiteralFromArray(v)}`)
    }
    else if (v && typeof v === 'object') {
      entries.push(`${key}: ${goMapLiteralFromObject(v as Record<string, unknown>, capitalizeKeys)}`)
    }
  }
  return `map[string]any{${entries.join(', ')}}`
}
