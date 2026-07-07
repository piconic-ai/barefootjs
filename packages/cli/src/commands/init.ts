// `barefoot init` — Internal scaffolding helper, invoked exclusively
// by `create-barefootjs`. The user-facing entry point is
// `npm create barefootjs@latest`, which sets BAREFOOT_INIT_VIA_CREATE=1
// before spawning this command. Direct `bf init` invocations are
// refused with a redirect message so users land on the documented flow
// (which also handles "is the target directory empty?" pre-flight,
// which init itself does not).
//
// Scaffold output: barefoot.config.ts + server + components/Counter +
// npm scripts so the user can `npm install && npm run dev` and see a
// working page. The single project config is `barefoot.config.ts`,
// carrying both `paths` (consumed by registry tooling) and the build
// options.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import path from 'path'
import { fileURLToPath } from 'node:url'
import type { CliContext } from '../context'
import { addFromRegistry } from './add'
import {
  ADAPTERS,
  CSS_LIBRARIES,
  DEFAULT_ADAPTER,
  DEFAULT_CSS_LIBRARY,
  type AdapterTemplate,
} from '../lib/templates'
import { detectPackageManager, commandsFor, testRunnerFor, type PackageManager } from '../lib/pm'
import { select, SelectCancelled, confirmationLabel } from '../lib/select'
import { startSpinner } from '../lib/spinner'
import { processCssHead, stripUnocssFromScript, stripUnoGitignore } from '../lib/css'
import {
  SHARED_COUNTER_BARE_TSX,
  SHARED_COUNTER_BARE_TEST_TSX,
  UNOCSS_DEV_DEPENDENCIES,
} from '../lib/adapters/shared'

const thisFile = fileURLToPath(import.meta.url)

// The CLI's own version — used to pin `@barefootjs/*` scaffold deps to
// a real version instead of the `'latest'` sentinel every adapter
// template carries (see `pinBarefootDeps` below). All `@barefootjs/*`
// packages publish in lockstep with `@barefootjs/cli`, so its own
// version is authoritative for the whole set.
//
// Two candidate locations, tried in order — the same bundled/dev split
// used by `../lib/tokens.ts` and `../commands/guide.ts`:
//   1. Bundled (published CLI): esbuild inlines every module into a
//      single `dist/index.js` (see scripts/build.mjs), which sits
//      directly under the package root, so package.json is one `..` up.
//   2. Dev/unbundled (e.g. tests spawning `bun src/index.ts` directly,
//      per `../__tests__/init-gate.test.ts`): this file is
//      `src/commands/init.ts`, two levels under the package root.
function readCliVersion(): string {
  const bundledPkgJsonPath = path.resolve(path.dirname(thisFile), '../package.json')
  const devPkgJsonPath = path.resolve(path.dirname(thisFile), '../../package.json')
  const pkgJsonPath = existsSync(bundledPkgJsonPath) ? bundledPkgJsonPath : devPkgJsonPath
  const { version } = JSON.parse(readFileSync(pkgJsonPath, 'utf-8')) as { version?: unknown }
  // Validate before use: a missing/empty `version` would otherwise
  // silently scaffold `"@barefootjs/*": "^undefined"`. Fail loudly and
  // name the file read so a broken CLI package is diagnosable.
  if (typeof version !== 'string' || version.length === 0) {
    throw new Error(
      `Could not read the CLI's own version from ${pkgJsonPath} — ` +
        'cannot pin @barefootjs/* scaffold dependencies.',
    )
  }
  return version
}

const CLI_VERSION = readCliVersion()

// Substitutes the `'latest'` sentinel every adapter template's
// `dependencies` / `devDependencies` map carries for `@barefootjs/*`
// packages (see e.g. `../lib/adapters/hono.ts`) with `^<CLI_VERSION>`.
// Adapter templates keep the sentinel — rather than hardcoding a
// version per adapter — so this one substitution point is the only
// place that has to change when the version-pinning strategy changes.
//
// Without this, two teammates scaffolding a week apart would get
// different `@barefootjs/*` versions (no lockfile exists yet at
// scaffold time), and a bad publish — like the accidental
// `@barefootjs/cli@1.0.0` release — would propagate into every new
// scaffold instantly instead of only when a maintainer deliberately
// bumps the pin. Non-`@barefootjs/*` deps (hono, wrangler, typescript,
// ...) are returned unchanged.
function pinBarefootDeps(deps: Record<string, string>): Record<string, string> {
  const pinned: Record<string, string> = {}
  for (const [name, version] of Object.entries(deps)) {
    pinned[name] = name.startsWith('@barefootjs/') && version === 'latest'
      ? `^${CLI_VERSION}`
      : version
  }
  return pinned
}

interface InitFlags {
  name?: string
  adapter?: string
  css?: string
}

function parseFlags(args: string[]): InitFlags {
  const flags: InitFlags = {}
  for (let i = 0; i < args.length; i++) {
    const a = args[i]
    if (a === '--name' && args[i + 1]) {
      flags.name = args[++i]
    } else if (a === '--adapter' && args[i + 1]) {
      flags.adapter = args[++i]
    } else if (a === '--css' && args[i + 1]) {
      flags.css = args[++i]
    }
  }
  return flags
}

// Sentinel set by create-barefootjs when it spawns the CLI. Anything
// else (a curious user running `bf init` directly, a stale shell
// history line) is bounced with a redirect — keeping `bf init` strictly
// internal means the empty-directory pre-flight in create-barefootjs is
// guaranteed to run, so we can't half-scaffold over a populated tree.
const INIT_GATE_ENV = 'BAREFOOT_INIT_VIA_CREATE'

// Prompt copy shared between the interactive `select()` call and the
// non-interactive confirmation line printed when the choice is
// resolved via flag / `--yes` default (see `printSelectConfirmation`
// below) — keeping both paths' transcripts word-for-word identical.
const ADAPTER_SELECT_MESSAGE = 'Choose a framework or runtime'
const CSS_SELECT_MESSAGE = 'Choose a CSS library'

export async function run(args: string[], ctx: CliContext): Promise<void> {
  if (process.env[INIT_GATE_ENV] !== '1') {
    console.error('`bf init` is internal — invoke it via `npm create barefootjs@latest`.')
    console.error('')
    console.error('Quick start (you\'ll be prompted for a target directory):')
    console.error('  npm create barefootjs@latest')
    console.error('  # or: bun create barefootjs')
    console.error('  # or: pnpm create barefootjs')
    process.exit(1)
  }

  // `--list-adapters` is a read-only lookup — handled before the
  // config-exists guard below so it works anywhere (including inside
  // an already-initialized project directory), but after the gate
  // above so `bf init` stays strictly internal either way.
  if (args.includes('--list-adapters')) {
    printAdapterList()
    process.exit(0)
  }

  const projectDir = process.cwd()
  const flags = parseFlags(args)

  const tsConfigPath = path.join(projectDir, 'barefoot.config.ts')
  if (existsSync(tsConfigPath)) {
    console.error('Error: barefoot.config.ts already exists. Project is already initialized.')
    process.exit(1)
  }

  const adapterId = await resolveAdapter(flags.adapter)
  const adapter = ADAPTERS[adapterId]
  const cssId = await resolveCssLibrary(flags.css)
  const cssLibrary = CSS_LIBRARIES[cssId]
  // `--css none` opts out of UnoCSS + the barefootjs UI registry: no
  // registry probe/fetch, no UnoCSS config/deps/sheets, a bare starter
  // Counter, and `unocss` stripped from the package.json scripts. Drives
  // both the probe gating below and the scaffold transforms.
  const usesUno = cssLibrary.usesUnoUi !== false

  // Pre-flight: confirm the UI registry is reachable BEFORE writing
  // anything to disk. The runnable starter pulls the registry's Button
  // component, and a vanilla fallback would force the user through a
  // painful migration to UnoCSS + barefootjs UI later. Better to fail
  // fast and have them retry online with no partial state to clean up.
  //
  // Skip the probe entirely for adapters that bundle no registry
  // components (`bundledRegistryComponents: []`, e.g. the xslate
  // scaffold ships a self-contained Counter): there's nothing to fetch,
  // so reaching out — and failing offline with a Button-specific error —
  // would be both pointless and misleading. Mirror scaffoldApp's
  // `?? ['button']` default so the two stay in lockstep.
  // Under `--css none` nothing is pulled from the registry, so skip the
  // probe entirely (an offline `none` scaffold should still succeed).
  const bundledComponents = usesUno ? (adapter.bundledRegistryComponents ?? ['button']) : []
  if (bundledComponents.length > 0) {
    // Surface the host the scaffold is reaching out to so the spinner
    // reads like a concrete action ("Fetching starter components from
    // ui.barefootjs.dev...") rather than a vague "checking a registry".
    const registryHost = new URL(DEFAULT_REGISTRY_URL).host
    const probeSpinner = startSpinner({
      text: `Fetching starter components from ${registryHost}...`,
    })
    try {
      await probeRegistry(DEFAULT_REGISTRY_URL)
      probeSpinner.stop()
    } catch (err) {
      probeSpinner.fail(`Cannot reach ${registryHost} (BarefootJS UI registry)`)
      const msg = err instanceof Error ? err.message : String(err)
      console.error(`  ${msg}`)
      console.error(``)
      console.error(`Project init pulls the starter's Button component from`)
      console.error(`${DEFAULT_REGISTRY_URL} (which the renderer wires through UnoCSS).`)
      console.error(``)
      console.error(`Things to try:`)
      console.error(`  1. Open ${DEFAULT_REGISTRY_URL}button.json in a browser to`)
      console.error(`     confirm ${registryHost} is reachable from this network.`)
      console.error(`  2. If you're behind a corporate proxy, set HTTPS_PROXY.`)
      console.error(`  3. Re-run the create-barefootjs command once you're connected.`)
      process.exit(1)
    }
  }

  const warnings = adapter.prereqWarnings()
  for (const w of warnings) console.warn(`  ! ${w}`)

  const buildSpinner = startSpinner({
    text: `Creating ${adapter.label.split(' ')[0]} + ${cssLibrary.label} project...`,
  })
  try {
    await scaffoldApp(projectDir, adapter, flags, usesUno, ctx)
  } catch (err) {
    buildSpinner.fail('Failed to create project files')
    throw err
  }
  buildSpinner.stop()

  printAppNextSteps(projectDir, adapter)
}

// Targeted hints for common language-name inputs that aren't adapter
// ids themselves — `--adapter go` / `--adapter perl` are the most
// frequent "papercut" from docs/landing copy that talks about
// language support ("Go", "Perl") without spelling out which
// concrete adapter id to pass. Keyed lowercase; looked up
// case-insensitively so `--adapter Go` / `--adapter GO` also hit.
const LANGUAGE_ADAPTER_HINTS: Record<string, string> = {
  go: 'Go apps use one of the Go web-framework adapters: echo, gin, chi, nethttp (e.g. --adapter chi)',
  golang: 'Go apps use one of the Go web-framework adapters: echo, gin, chi, nethttp (e.g. --adapter chi)',
  perl: 'Perl apps use one of the Perl adapters: mojo, xslate (e.g. --adapter mojo)',
}

// Resolve the adapter by precedence: explicit `--adapter` flag (validated)
// > interactive selector when stdin is a TTY and 2+ adapters are
// registered > the registry default. The selector itself short-circuits
// to the default in single-option / non-TTY scenarios (see select.ts),
// so callers don't need to special-case those.
async function resolveAdapter(flag: string | undefined): Promise<string> {
  if (flag) {
    if (!ADAPTERS[flag]) {
      const hint = LANGUAGE_ADAPTER_HINTS[flag.toLowerCase()]
      if (hint) {
        console.error(`Error: unknown adapter "${flag}". ${hint}`)
      } else {
        const known = Object.keys(ADAPTERS).join(', ')
        console.error(`Error: unknown adapter "${flag}". Available: ${known}`)
      }
      process.exit(1)
    }
    // Non-interactive resolution (explicit flag, or `--yes`'s forwarded
    // default) still gets a "✔ ..." confirmation line so the transcript
    // shows what was chosen — same wording the interactive picker uses.
    printSelectConfirmation(ADAPTER_SELECT_MESSAGE, ADAPTERS[flag])
    return flag
  }
  const options = Object.entries(ADAPTERS).map(([value, t]) => ({
    value,
    label: t.label,
    shortLabel: t.shortLabel,
  }))
  try {
    // The internal term is "adapter" (matches `--adapter` and the
    // architecture docs), but new users don't have that vocabulary
    // yet — the prompt phrases the choice in user-facing terms.
    return await select({ message: ADAPTER_SELECT_MESSAGE, options, defaultValue: DEFAULT_ADAPTER })
  } catch (err) {
    bailOnSelectError(err)
  }
}

async function resolveCssLibrary(flag: string | undefined): Promise<string> {
  if (flag) {
    if (!CSS_LIBRARIES[flag]) {
      const known = Object.keys(CSS_LIBRARIES).join(', ')
      console.error(`Error: unknown CSS library "${flag}". Available: ${known}`)
      process.exit(1)
    }
    printSelectConfirmation(CSS_SELECT_MESSAGE, CSS_LIBRARIES[flag])
    return flag
  }
  const options = Object.entries(CSS_LIBRARIES).map(([value, t]) => ({ value, label: t.label }))
  try {
    return await select({ message: CSS_SELECT_MESSAGE, options, defaultValue: DEFAULT_CSS_LIBRARY })
  } catch (err) {
    bailOnSelectError(err)
  }
}

// Prints the same "✔ <message> <label>" confirmation `select()` renders
// after an interactive pick (see select.ts), for choices resolved
// without ever going through the prompt (an explicit flag, or `--yes`'s
// forwarded defaults). Keeps the interactive and non-interactive
// transcripts read identically. Colorized only in a TTY, matching the
// rest of init's/create-barefootjs's output conventions.
function printSelectConfirmation(message: string, opt: { label: string; shortLabel?: string }): void {
  const label = confirmationLabel(opt)
  const highlighted = process.stdout.isTTY ? `\x1b[1;32m${label}\x1b[0m` : label
  console.log(`✔ ${message} ${highlighted}`)
}

// `--list-adapters` — a quick, offline way to discover valid `--adapter`
// ids (and the CSS library options) without stumbling into the generic
// "unknown adapter" error first. One line per entry, ids left-aligned
// so labels line up in a column.
function printAdapterList(): void {
  const adapterIds = Object.keys(ADAPTERS)
  const idWidth = Math.max(...adapterIds.map((id) => id.length))
  console.log('Adapters (--adapter <id>):')
  for (const id of adapterIds) {
    console.log(`  ${id.padEnd(idWidth)}  ${ADAPTERS[id].label}`)
  }
  console.log('')
  const cssIds = Object.keys(CSS_LIBRARIES)
  const cssWidth = Math.max(...cssIds.map((id) => id.length))
  console.log('CSS libraries (--css <id>):')
  for (const id of cssIds) {
    console.log(`  ${id.padEnd(cssWidth)}  ${CSS_LIBRARIES[id].label}`)
  }
}

/**
 * Centralised exit path for the interactive selector. A user-driven
 * cancel (`SelectCancelled`) reads as a calm "nothing scaffolded"
 * message, while anything else (lost stdin, render error, ...) gets
 * surfaced with its underlying message so the failure mode is
 * actually debuggable.
 *
 * Returns `never` so callers can use it as the catch-block tail
 * without TypeScript complaining about a missing return.
 */
function bailOnSelectError(err: unknown): never {
  if (err instanceof SelectCancelled) {
    console.error('Cancelled — nothing scaffolded.')
  } else {
    const msg = err instanceof Error ? err.message : String(err)
    console.error(`Error during interactive selection: ${msg}`)
  }
  process.exit(1)
}

async function probeRegistry(url: string): Promise<void> {
  const probeUrl = `${url.replace(/\/$/, '')}/button.json`
  const res = await fetch(probeUrl, {
    method: 'HEAD',
    signal: AbortSignal.timeout(5000),
  })
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`)
  }
}

async function scaffoldApp(
  projectDir: string,
  adapter: AdapterTemplate,
  flags: InitFlags,
  usesUno: boolean,
  _ctx: CliContext,
): Promise<number> {
  // The single source of truth is `barefoot.config.ts` (written below via
  // adapter.files). It carries both `paths` (consumed by registry tooling)
  // and the build options. We mirror the same defaults here so the rest
  // of init can reason about layout without re-loading the TS file.
  const paths = {
    components: 'components/ui',
    tokens: 'tokens',
    meta: 'meta',
  }

  let created = 0

  // Project name — used both as the package.json `name` and to fill
  // any `{{__PROJECT_NAME__}}` placeholders adapter templates carry
  // (e.g. wrangler.jsonc's `name` field for Cloudflare Workers).
  // Sanitize even when `flags.name` is set: the caller might pass a
  // multi-segment path like "foo/bar/bazz" and slashes are invalid in
  // both npm names and Cloudflare Worker names.
  const rawName = flags.name || path.basename(projectDir)
  const pkgName = path.basename(rawName).replace(/[^a-z0-9-_]/gi, '-').toLowerCase() || 'barefoot-app'

  // Resolve PM up-front so file substitution, the test runner choice,
  // and devDep selection all see the same answer. (Scripts use it too
  // further down.) `testRunnerFor(pm)` centralises the bun-vs-vitest
  // branch — it owns the import specifier `bf gen test` writes
  // (`bun:test` for bun, `vitest` everywhere else), the
  // `package.json#scripts.test` value, the extra devDeps the scaffold
  // adds, and the `{{__PM_TYPES_ENTRY__}}` slot the adapter tsconfigs
  // carry. Keeping the decision in one place means scaffold + the
  // generators below stay aligned over time without each one
  // re-deriving the runner.
  const pm = detectPackageManager(projectDir)
  const runner = testRunnerFor(pm)
  const pmTypesEntry = runner.typesEntry

  // Adapter-contributed files (server, components/Counter, the
  // companion Counter.test.tsx, barefoot.config.ts, etc.). Adapter
  // templates declare every file they want on disk in `adapter.files`,
  // including the IR test paired with the starter Counter — that's
  // why the scaffold ships a green `<pm> test` from minute zero
  // without a post-write codegen step. `{{__TEST_RUNNER_IMPORT__}}`
  // is the PM slot for the test file (`bun:test` on bun scaffolds,
  // `vitest` everywhere else); same substitution mechanism as
  // `{{__PROJECT_NAME__}}` (wrangler worker name) and
  // `{{__PM_TYPES_ENTRY__}}` (tsconfig `types` array entry).
  // Files the UnoCSS path ships but `--css none` drops: the UnoCSS
  // config and the three stylesheets (tokens/styles/uno). Matched by
  // basename so it holds whether an adapter serves them from `public/`
  // or `static/`.
  const UNO_ONLY_FILES = new Set(['uno.config.ts', 'uno.css', 'tokens.css', 'styles.css'])

  for (const [relPath, contents] of Object.entries(adapter.files)) {
    // `--css none`: skip the UnoCSS-only assets entirely.
    if (!usesUno && UNO_ONLY_FILES.has(path.basename(relPath))) continue

    const target = path.join(projectDir, relPath)
    if (existsSync(target)) continue
    mkdirSync(path.dirname(target), { recursive: true })

    // `--css none`: swap the registry-<Button> starter Counter (and its
    // IR test) for the dependency-free native-<button> variant so the
    // bare scaffold builds with nothing fetched from the registry.
    let source = contents
    if (!usesUno && relPath === 'components/Counter.tsx') source = SHARED_COUNTER_BARE_TSX
    if (!usesUno && relPath === 'components/Counter.test.tsx') source = SHARED_COUNTER_BARE_TEST_TSX

    let resolved = source
      .replace(/\{\{__PROJECT_NAME__\}\}/g, pkgName)
      .replace(/\{\{__PM_TYPES_ENTRY__\}\}/g, pmTypesEntry)
      .replace(/\{\{__TEST_RUNNER_IMPORT__\}\}/g, runner.importSource)
    // Rewrite the <head> stylesheet block: keep the links under UnoCSS,
    // drop the whole region (markers + comment + links) under `none`.
    resolved = processCssHead(resolved, usesUno)
    // `--css none`: the bare scaffold never emits `uno.css`, so prune the
    // now-dead `# UnoCSS output` block from the generated `.gitignore`.
    if (!usesUno && path.basename(relPath) === '.gitignore') {
      resolved = stripUnoGitignore(resolved)
    }

    writeFileSync(target, resolved)
    created++
  }

  // meta/ — empty registry index so `barefoot search` doesn't error
  // on an unconfigured app.
  const metaDir = path.resolve(projectDir, paths.meta)
  mkdirSync(metaDir, { recursive: true })
  writeFileSync(
    path.join(metaDir, 'index.json'),
    JSON.stringify({ version: 1, generatedAt: new Date().toISOString(), components: [] }, null, 2) + '\n',
  )
  created++

  // package.json — merge adapter scripts/deps with a sensible default.
  const pkgJsonPath = path.join(projectDir, 'package.json')
  // Resolve adapter scripts. Function values render against the
  // detected PM for the rare command that genuinely differs per PM
  // (e.g. `<pm> install`) — see the `AdapterScriptValue` doc in
  // `../lib/templates.ts`. Most adapter tools (e.g. Hono's `wrangler`)
  // are devDependencies invoked bare instead, so they don't need this.
  // (`pm` was resolved earlier so the file-substitution loop and
  // tsconfig's bun-types entry both see the same value.)
  const resolvedAdapterScripts: Record<string, string> = {}
  for (const [k, v] of Object.entries(adapter.scripts)) {
    const rendered = typeof v === 'function' ? v(pm) : v
    // `--css none`: strip every `unocss` touch-point out of the scripts
    // (the dedicated `unocss --watch` concurrently pane, the `&& unocss`
    // build/deploy links) so they reference only `bf build` + the server.
    resolvedAdapterScripts[k] = usesUno ? rendered : stripUnocssFromScript(rendered)
  }

  // PM-specific devDependencies sourced from the runner config. The
  // adapter map keeps these out by default so the registered surface
  // stays PM-agnostic. For bun: `@types/bun` (paired with the
  // `"bun-types"` entry pmTypesEntry above contributes). For everyone
  // else: `vitest` — its `describe` / `test` / `expect` surface is
  // API-compatible with the `bun:test` line `bf gen test` would
  // otherwise emit, so the same generated file runs under any PM.
  const pmDevDeps: Record<string, string> = runner.devDeps

  // `--css none`: drop the UnoCSS toolchain from devDependencies — the
  // bare scaffold never runs `unocss`.
  const adapterDevDeps: Record<string, string> = { ...adapter.devDependencies }
  if (!usesUno) {
    for (const key of Object.keys(UNOCSS_DEV_DEPENDENCIES)) delete adapterDevDeps[key]
  }

  const pkgJson = {
    name: pkgName,
    private: true,
    type: 'module',
    scripts: {
      ...resolvedAdapterScripts,
      // The cross-adapter rebuild watcher. Under `--css none` there's no
      // `unocss --watch` pane to run alongside `bf build --watch`, so it
      // collapses to a bare build watch (no `concurrently` wrapper).
      watch: usesUno
        ? 'concurrently -k -n build,uno -c blue,magenta "bf build --watch" "unocss --watch"'
        : 'bf build --watch',
      // `test` is wired to the runner that matches the user's package
      // manager — `bun test` for bun, `vitest run` for npm / pnpm /
      // yarn. The matching `bf gen component` / `bf gen test` output
      // imports from the same runner (`bun:test` vs. `vitest`), so the
      // very first generated test file Just Works after `<pm> install`
      // without manual migration. See `testRunnerFor` in `../lib/pm.ts`.
      test: runner.scriptValue,
    },
    // `@barefootjs/*` entries are pinned from the `'latest'` sentinel to
    // `^<CLI_VERSION>` here — see `pinBarefootDeps` above.
    dependencies: pinBarefootDeps({ ...adapter.dependencies }),
    devDependencies: pinBarefootDeps({ ...adapterDevDeps, ...pmDevDeps }),
  }
  if (!existsSync(pkgJsonPath)) {
    writeFileSync(pkgJsonPath, JSON.stringify(pkgJson, null, 2) + '\n')
    created++
  }

  // Pull the bundled registry components (default: just Button).
  // Adapters that can't yet render the registry Button end-to-end set
  // `bundledRegistryComponents: []` so we skip the fetch entirely
  // instead of shipping a scaffold whose very first build errors on
  // an as-yet-unsupported lowering. The pre-flight probe in run()
  // already verified reachability, so a failure here is unusual
  // (transient registry hiccup, malformed item, etc.) — let it
  // propagate so the user retries instead of ending up with a
  // half-scaffolded project that points at a missing import.
  // `silent: true` so the per-file summary doesn't fight the
  // surrounding spinner for the same line.
  // `--css none` pulls nothing from the registry — the bare Counter uses
  // native <button> elements, so there's no <Button> to fetch.
  const bundledComponents = usesUno ? (adapter.bundledRegistryComponents ?? ['button']) : []
  if (bundledComponents.length > 0) {
    await addFromRegistry(
      bundledComponents,
      DEFAULT_REGISTRY_URL,
      projectDir,
      { paths },
      true,
      true,
      true,
    )
  }

  return created
}

const DEFAULT_REGISTRY_URL = 'https://ui.barefootjs.dev/r/'

function printAppNextSteps(projectDir: string, adapter: AdapterTemplate): void {
  const pm: PackageManager = detectPackageManager(projectDir)
  const cmd = commandsFor(pm)
  // The detected PM is reflected in the commands quoted below, so we
  // don't announce it separately — the user just sees `bun install`
  // or `pnpm install` and knows what's happening.
  // `barefoot init` runs inside the freshly created project dir but
  // the user's shell is still in the parent. Lead with `cd` so the
  // remaining commands work when copy-pasted in order. When invoked
  // via create-barefootjs the relative path the user typed
  // (e.g. "foo/bar/bazz") is forwarded through this env var so we
  // echo the same thing back; standalone `barefoot init` invocations
  // (no env var) fall back to the directory basename.
  const projectName =
    process.env.BAREFOOT_INIT_PROJECT_PATH || path.basename(projectDir)

  // Get started — minimal copy-paste sequence. No URL hint: wrangler
  // (and other dev servers) can pick a different port when the
  // default is in use, so quoting a specific URL here would be wrong
  // some of the time. The dev server prints its bound address itself.
  console.log('')
  console.log(`${heading('Get started:')}`)
  console.log(`  cd ${projectName}`)
  console.log(`  ${cmd.install}`)
  // Adapter-specific setup commands (e.g. Mojolicious's `cpanm
  // --installdeps .` — issue #1416 item 2). Rendered between
  // `<pm> install` and `<pm> run dev` so each block reads as a
  // contiguous "before you can start the dev server, run this"
  // checklist.
  if (adapter.extraSetupSteps && adapter.extraSetupSteps.length > 0) {
    for (const step of adapter.extraSetupSteps) {
      if (step.label) console.log(`  ${dim(`# ${step.label}`)}`)
      console.log(`  ${step.command}`)
    }
  }
  console.log(`  ${cmd.run('dev')}`)

  if (adapter.deploy) {
    const deployCmd = cmd.run(adapter.deploy.script)
    console.log('')
    console.log(`${heading('Deploy:')}`)
    console.log(`  ${deployCmd}${dim(`   # deploy to ${adapter.deploy.target}`)}`)
  }
}

// ANSI helpers for the next-steps block. All three apply only in a
// TTY — piped output (CI, scripts) gets the plain text so logs stay
// grep-friendly.
function heading(s: string): string {
  return process.stdout.isTTY ? `\x1b[1;36m${s}\x1b[0m` : s
}
function dim(s: string): string {
  return process.stdout.isTTY ? `\x1b[2m${s}\x1b[0m` : s
}
