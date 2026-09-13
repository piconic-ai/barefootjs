/**
 * Real-backend render harness for the Pebble adapter conformance suite.
 *
 * Bun-only (exported solely under the `"bun"` condition — see
 * `package.json`'s `./test-render` export), so it never reaches a published
 * consumer's dependency graph.
 *
 * Phase 3a (#2101): the Java runtime (`packages/adapter-pebble/java/`) now
 * exists — `renderPebble` builds its Gradle fat jar ONCE per process
 * (memoized, mirroring `adapter-rust/src/test-render.ts`'s
 * `ensureBfRenderBuilt` build-once-reuse-across-fixtures pattern) and shells
 * out `java -jar <jar> <templateDir> <entryName> <varsFile>` per render.
 *
 * Phase 3b (#2101): the Java runtime now also registers a custom `set` tag
 * handler (`java/src/main/java/dev/barefootjs/pebble/ext/`) supporting
 * `{% set NAME %}...{% endset %}` block-capture, so JSX-children/
 * named-slot/async-fallback forwarding renders correctly through this same
 * `java -jar` path — see `pebble-set-block.test.ts`.
 *
 * This lands ONLY the hand-written-`.peb`-template smoke-test plumbing
 * (`packages/adapter-pebble/src/__tests__/`) — proving the Java runtime, the
 * `bf.*` helper surface, and the evaluator all work end-to-end through a
 * real `java -jar` invocation. It does NOT compile JSX source through
 * `PebbleAdapter` (unlike the sibling `renderMinijinjaComponent`/
 * `renderJinjaComponent` harnesses) and does NOT support cross-template
 * child rendering yet (`bf.render_child` still throws in the Java runtime —
 * needs multi-template dispatch in `Main`/`Bf`, a separate follow-up).
 * Wiring the full `RenderOptions`-shaped, JSX-compiling harness into
 * `runAdapterConformanceTests` against the ~190 shared fixtures is Phase 4,
 * a separate follow-up task.
 */

import { mkdir, rm } from 'node:fs/promises'
import { resolve } from 'node:path'

const RENDER_TEMP_DIR = resolve(import.meta.dir, '../.render-temp')
// The Gradle project (`barefootjs-pebble-runtime`) lives alongside this
// package (mirrors adapter-rust bundling `runtime/` in-tree). Built ONCE
// (memoized below) and re-used across every render in this process — NEVER
// rebuilt per render, per the package README's "Conformance harness:
// build-once, like adapter-rust" design decision.
const JAVA_DIR = resolve(import.meta.dir, '../java')
const FAT_JAR = resolve(JAVA_DIR, 'build/libs/barefootjs-pebble-runtime.jar')

export class JavaNotAvailableError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'JavaNotAvailableError'
  }
}

/** Whether a `java` toolchain is on `PATH` — mirrors the sibling adapters'
 * "skip gracefully when the toolchain is missing" harness convention
 * (`RustNotAvailableError` in `adapter-rust/src/test-render.ts`). */
export function isJavaToolchainAvailable(): boolean {
  return Bun.which('java') !== null
}

function isGradleAvailable(): boolean {
  return Bun.which('gradle') !== null
}

/**
 * Module-scope memoized build of the fat jar via `gradle shadowJar`. The
 * first caller triggers the build; every subsequent render in the same
 * process awaits the SAME promise (or observes it already resolved). A
 * build FAILURE is a real `Error` (not `JavaNotAvailableError`) — a
 * present-but-broken toolchain should fail loudly, not be silently skipped
 * like a genuinely absent one. No Gradle wrapper is committed for this
 * package (unlike some native-runtime adapters) — the environment this
 * harness runs in provisions a matching `gradle` on `PATH` directly (see
 * the package README's "Gradle project layout" note); a plain `gradle
 * shadowJar` invocation is used rather than `./gradlew`.
 */
let _buildPromise: Promise<void> | null = null
function ensureFatJarBuilt(): Promise<void> {
  if (!_buildPromise) {
    _buildPromise = (async () => {
      if (!isGradleAvailable()) {
        throw new Error('gradle not found on PATH — cannot build the Pebble Java runtime fat jar')
      }
      const proc = Bun.spawn(['gradle', 'shadowJar', '--console=plain'], {
        cwd: JAVA_DIR,
        stdout: 'pipe',
        stderr: 'pipe',
      })
      const [stdout, stderr] = await Promise.all([
        new Response(proc.stdout).text(),
        new Response(proc.stderr).text(),
      ])
      const exitCode = await proc.exited
      if (exitCode !== 0) {
        throw new Error(`gradle shadowJar failed (exit ${exitCode}):\n${stderr}\n${stdout}`)
      }
    })()
  }
  return _buildPromise
}

export interface RenderPebbleTemplateOptions {
  /** Raw `.peb` template text for the entry template. */
  template: string
  /** Render context (props/signals/memos) — a plain JSON-serializable object. */
  vars?: Record<string, unknown>
  /** Additional `.peb` templates (basename without extension -> content). */
  siblingTemplates?: Record<string, string>
  /** `bf.scope_attr()`'s value for this render. Defaults to `'test'`. */
  scopeId?: string
}

/**
 * Render a hand-written `.peb` template (+ optional sibling templates and
 * vars) through the real Java/Pebble runtime. Builds the fat jar once
 * (memoized), writes the template(s) + vars to a scratch directory, shells
 * out `java -jar`, and returns the rendered HTML.
 */
export async function renderPebbleTemplate(options: RenderPebbleTemplateOptions): Promise<string> {
  if (!isJavaToolchainAvailable()) {
    throw new JavaNotAvailableError('java not found on PATH — skipping Pebble rendering')
  }
  await ensureFatJarBuilt()

  const tempDir = resolve(RENDER_TEMP_DIR, `pebble-${Date.now()}-${Math.random().toString(36).slice(2)}`)
  await mkdir(tempDir, { recursive: true })

  try {
    const entryName = 'entry'
    await Bun.write(resolve(tempDir, `${entryName}.peb`), options.template)
    for (const [name, content] of Object.entries(options.siblingTemplates ?? {})) {
      await Bun.write(resolve(tempDir, `${name}.peb`), content)
    }
    const varsPath = resolve(tempDir, 'vars.json')
    await Bun.write(varsPath, JSON.stringify(options.vars ?? {}))

    const args = [FAT_JAR, tempDir, entryName, varsPath]
    if (options.scopeId) {
      args.push(options.scopeId)
    }
    const proc = Bun.spawn(['java', '-jar', ...args], { stdout: 'pipe', stderr: 'pipe' })
    const [stdout, stderr] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
    ])
    const exitCode = await proc.exited
    if (exitCode !== 0) {
      throw new Error(`java -jar barefootjs-pebble-runtime.jar failed (exit ${exitCode}):\n${stderr}`)
    }
    return stdout
  } finally {
    await rm(tempDir, { recursive: true, force: true }).catch(() => {})
  }
}

/**
 * Render a single hand-written `.peb` template string against a props
 * object. Thin convenience wrapper over {@link renderPebbleTemplate} for
 * the common single-template case (`packages/adapter-pebble/src/__tests__/`
 * smoke tests) — matches this file's original (Phase 1) stub signature.
 */
export async function renderPebble(template: string, props: Record<string, unknown>): Promise<string> {
  return renderPebbleTemplate({ template, vars: props })
}
