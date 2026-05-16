/**
 * Go Template test renderer
 *
 * Compiles JSX source with GoTemplateAdapter and renders to HTML via `go run`.
 * Used by adapter-tests conformance runner.
 */

import { compileJSX } from '@barefootjs/jsx'
import type { TemplateAdapter, ComponentIR } from '@barefootjs/jsx'
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
    const proc = Bun.spawn(['go', 'version'], { stdout: 'pipe', stderr: 'pipe' })
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
}

export async function renderGoTemplateComponent(options: RenderOptions): Promise<string> {
  const { source, adapter, props, components } = options

  if (!adapter.generateTypes) {
    throw new Error('Go Template adapter must implement generateTypes()')
  }

  // Compile child components first
  const childTemplates: string[] = []
  const childTypeBlocks: string[] = []
  if (components) {
    for (const [filename, childSource] of Object.entries(components)) {
      const childResult = compileJSX(childSource, filename, { adapter, outputIR: true })
      const childErrors = childResult.errors.filter(e => e.severity === 'error')
      if (childErrors.length > 0) {
        throw new Error(`Compilation errors in ${filename}:\n${childErrors.map(e => e.message).join('\n')}`)
      }
      const childTemplate = childResult.files.find(f => f.type === 'markedTemplate')
      if (!childTemplate) throw new Error(`No marked template for ${filename}`)
      childTemplates.push(childTemplate.content)

      const childIrFiles = childResult.files.filter(f => f.type === 'ir')
      for (const childIrFile of childIrFiles) {
        const childIR = JSON.parse(childIrFile.content) as ComponentIR
        let childTypes = adapter.generateTypes!(childIR)
        if (childTypes) {
          // Strip package declaration and imports — will be merged into main types
          childTypes = childTypes.replace(/^package \w+\n*/, '')
          childTypes = childTypes.replace(/import\s*\([^)]*\)\n*/g, '')
          childTypes = childTypes.replace(/\t"math\/rand"\n/g, '')
          childTypeBlocks.push(childTypes.trim())
        }
      }
    }
  }

  // Compile parent source
  const result = compileJSX(source, 'component.tsx', { adapter, outputIR: true })

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
  const ir =
    irs.find(i => i.metadata.hasDefaultExport) ??
    irs.find(i => i.metadata.isExported) ??
    irs[0]

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

  // Append sibling-component type definitions (multi-component source).
  for (const siblingIR of irs) {
    if (siblingIR === ir) continue
    let siblingTypes = adapter.generateTypes(siblingIR)
    if (!siblingTypes) continue
    siblingTypes = siblingTypes.replace(/^package \w+\n*/, '')
    siblingTypes = siblingTypes.replace(/import\s*\([^)]*\)\n*/g, '')
    siblingTypes = siblingTypes.replace(/\t"math\/rand"\n/g, '')
    goTypes += '\n\n' + siblingTypes.trim()
  }

  // Append child type definitions
  if (childTypeBlocks.length > 0) {
    goTypes += '\n\n' + childTypeBlocks.join('\n\n')
  }

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

    // Build props initialization
    const propsInit = buildGoPropsInit(componentName, props)

    // main.go — render program
    const mainGo = `package main

import (
	"html/template"
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
	tmpl := template.Must(template.New("").Funcs(bfTestFuncMap()).Parse(tmplContent))
	props := New${componentName}Props(${componentName}Input{
		ScopeID: "test",
${propsInit}
	})
	if err := tmpl.ExecuteTemplate(os.Stdout, "${componentName}", props); err != nil {
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
    const proc = Bun.spawn(['go', 'run', '.'], {
      cwd: tempDir,
      stdout: 'pipe',
      stderr: 'pipe',
      env: { ...process.env, GOTOOLCHAIN: 'local' },
    })

    const [stdout, stderr] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
    ])

    const exitCode = await proc.exited
    if (exitCode !== 0) {
      throw new Error(`go run failed (exit ${exitCode}):\n${stderr}`)
    }

    return stdout
  } finally {
    await rm(tempDir, { recursive: true, force: true }).catch(() => {})
  }
}

/**
 * Build Go struct field initializers from props.
 */
function buildGoPropsInit(
  _componentName: string,
  props?: Record<string, unknown>,
): string {
  if (!props) return ''

  const lines: string[] = []
  for (const [key, value] of Object.entries(props)) {
    // Capitalize first letter for Go field name
    const goField = key.charAt(0).toUpperCase() + key.slice(1)
    if (typeof value === 'string') {
      lines.push(`\t\t${goField}: "${value}",`)
    } else if (typeof value === 'number') {
      lines.push(`\t\t${goField}: ${value},`)
    } else if (typeof value === 'boolean') {
      lines.push(`\t\t${goField}: ${value},`)
    }
  }
  return lines.join('\n')
}
