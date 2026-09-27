/**
 * Client-JS scope gate.
 *
 * Every fixture's emitted client JS (parent + inline child components)
 * is loaded into a single TypeScript program and checked for
 * out-of-scope identifier references — TS diagnostics 2304/2552
 * ("Cannot find name"). An undeclared identifier in emitted JS is a
 * guaranteed runtime `ReferenceError` the moment that code path runs
 * (init or the CSR `template:` lambda), and it ships silently today:
 * nothing type-checks the compiler's emitted output. This gate makes
 * that class of bug loud at test time — #2463's
 * `template: (_p) => \`${loading() ? …}\`` (signal declared inside
 * `init`, referenced at module scope) is the motivating instance.
 *
 * Scope-soundness only: the check filters to 2304/2552 and ignores all
 * other diagnostics, so untyped params, `any` flows, and unresolved
 * module specifiers (`noResolve`) don't produce noise. An `import`
 * declares its bindings whether or not the module resolves, so imports
 * never false-positive here.
 *
 * KNOWN_UNDECLARED (`../client-js-scope-ledger.ts`) is the shrink-only ledger of fixtures whose emitted
 * JS is scope-unsound today. Each entry names the undeclared
 * identifiers and the registry limitation it is an instance of
 * (`packages/adapter-tests/limitations/<id>.ts`). The per-fixture test asserts the
 * EXACT set: a new undeclared name in a pinned fixture still fails,
 * and when a fix lands the pin goes stale and fails with a
 * "graduated — delete the pin" message. New entries may be added only
 * with a registry limitation; the goal state is an empty object.
 *
 * The same walk also checks that every compile accepted the harness
 * Program (`../harness-program-ledger.ts`, #3220). It already compiles
 * every entry and `components` source through `compileFixtureJSX`, so
 * counting Program creations around each compile costs nothing extra.
 */

import { describe, test, expect } from 'bun:test'
import ts from 'typescript'
import {
  disableCompilerInstrumentation,
  enableCompilerInstrumentation,
  resetCompilerCounters,
} from '@barefootjs/jsx'
import { compileFixtureJSX } from '../harness-program'
import { HARNESS_PROGRAM_REJECTION_EXCEPTIONS, harnessProgramOverbuild } from '../harness-program-ledger'
import { HonoAdapter } from '@barefootjs/hono/adapter'
import { jsxFixtures } from '../../fixtures'
import { KNOWN_UNDECLARED } from '../client-js-scope-ledger'

/** One virtual .ts file per emitted client-JS artifact. */
interface VirtualFile {
  fileName: string
  fixtureId: string
  content: string
}

interface CollectedClientJs {
  files: VirtualFile[]
  compileFailed: string[]
  /** Every source key compiled (the harness-Program ledger's key space). */
  sourceKeys: string[]
  /** Compiles that built a Program beyond the harness's own. */
  harnessProgramRejections: string[]
  /** Ledger entries whose compile no longer overbuilds. */
  harnessProgramGraduated: string[]
}

function collectClientJs(): CollectedClientJs {
  const out: CollectedClientJs = {
    files: [],
    compileFailed: [],
    sourceKeys: [],
    harnessProgramRejections: [],
    harnessProgramGraduated: [],
  }
  enableCompilerInstrumentation()
  try {
    for (const fixture of jsxFixtures) collectFixture(fixture, out)
  } finally {
    disableCompilerInstrumentation()
    resetCompilerCounters()
  }
  return out
}

function collectFixture(fixture: (typeof jsxFixtures)[number], out: CollectedClientJs): void {
  // [compile name, harness-Program ledger key, source]
  const sources: Array<[string, string, string]> = [[`${fixture.id}`, fixture.id, fixture.source]]
  for (const [childName, childSource] of Object.entries(fixture.components ?? {})) {
    // Child components are compiled standalone, like the conformance
    // renderers do, but under a sanitised `<id>__<key>.tsx` filename
    // rather than the literal key (the harness-Program count does not
    // depend on the filename; the brand test covers the literal keys).
    const base = childName.replace(/[^a-zA-Z0-9_-]/g, '_')
    sources.push([`${fixture.id}__${base}`, `${fixture.id}:${childName}`, childSource])
  }
  for (const [name, key, source] of sources) {
    out.sourceKeys.push(key)
    let result
    resetCompilerCounters()
    try {
      result = compileFixtureJSX(source, `${name}.tsx`, { adapter: new HonoAdapter() })
    } catch {
      out.compileFailed.push(fixture.id)
      continue
    } finally {
      // Counted even when the compile throws or reports errors.
      const overbuild = harnessProgramOverbuild(source)
      const excepted = HARNESS_PROGRAM_REJECTION_EXCEPTIONS.has(key)
      if (overbuild && !excepted) out.harnessProgramRejections.push(`${key}: ${overbuild}`)
      if (!overbuild && excepted) out.harnessProgramGraduated.push(key)
    }
    if (result.errors.some(e => e.severity === 'error')) {
      out.compileFailed.push(fixture.id)
      continue
    }
    for (const [i, file] of result.files.filter(f => f.type === 'clientJs').entries()) {
      out.files.push({
        fileName: `/virtual/${name}.${i}.ts`,
        fixtureId: fixture.id,
        content: file.content,
      })
    }
  }
}

/**
 * Run one TS program over all virtual files and return the undeclared
 * identifier names per fixture id (sorted, deduped).
 */
function findUndeclared(files: VirtualFile[]): Map<string, string[]> {
  const options: ts.CompilerOptions = {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.ESNext,
    lib: ['lib.es2022.d.ts', 'lib.dom.d.ts', 'lib.dom.iterable.d.ts'],
    // Imports declare their bindings whether or not the specifier
    // resolves, so skipping resolution keeps the program hermetic
    // without hiding any scope errors.
    noResolve: true,
    noEmit: true,
    skipLibCheck: true,
    types: [],
  }
  const byName = new Map(files.map(f => [f.fileName, f]))
  const host = ts.createCompilerHost(options, true)
  const realGetSourceFile = host.getSourceFile.bind(host)
  host.getSourceFile = (fileName, languageVersion, ...rest) => {
    const virtual = byName.get(fileName)
    if (virtual) {
      return ts.createSourceFile(fileName, virtual.content, languageVersion, true)
    }
    return realGetSourceFile(fileName, languageVersion, ...rest)
  }
  const realFileExists = host.fileExists.bind(host)
  host.fileExists = fileName => byName.has(fileName) || realFileExists(fileName)
  const realReadFile = host.readFile.bind(host)
  host.readFile = fileName => byName.get(fileName)?.content ?? realReadFile(fileName)

  const program = ts.createProgram(files.map(f => f.fileName), options, host)

  const found = new Map<string, Set<string>>()
  for (const file of files) {
    const sourceFile = program.getSourceFile(file.fileName)
    if (!sourceFile) continue
    for (const diag of program.getSemanticDiagnostics(sourceFile)) {
      // 2304: Cannot find name '{0}'.
      // 2552: Cannot find name '{0}'. Did you mean '{1}'?
      if (diag.code !== 2304 && diag.code !== 2552) continue
      const message = ts.flattenDiagnosticMessageText(diag.messageText, ' ')
      const name = message.match(/Cannot find name '([^']*)'/)?.[1] ?? message
      let set = found.get(file.fixtureId)
      if (!set) found.set(file.fixtureId, (set = new Set()))
      set.add(name)
    }
  }
  return new Map([...found].map(([id, names]) => [id, [...names].sort()]))
}

describe('client-JS scope gate', () => {
  const { files, compileFailed, sourceKeys, harnessProgramRejections, harnessProgramGraduated } =
    collectClientJs()
  const undeclared = findUndeclared(files)
  const fixtureIds = new Set(jsxFixtures.map(f => f.id))

  if (process.env.DUMP_SCOPE_GATE) {
    console.log('SCOPE-GATE-INVENTORY ' + JSON.stringify(Object.fromEntries(undeclared)))
  }

  test('every compile accepts the harness Program (no cwd-relative fallback Program)', () => {
    expect(
      harnessProgramRejections,
      'compileJSX rejected the harness Program and built a cwd-relative one — carry the ' +
        'anchor through the rebuild, or declare the source in HARNESS_PROGRAM_REJECTION_EXCEPTIONS',
    ).toEqual([])
  })

  test('every harness-Program exception still overbuilds (graduated entries are deleted)', () => {
    expect(
      harnessProgramGraduated,
      'these sources now accept the harness Program — graduated, delete the entry from ' +
        'HARNESS_PROGRAM_REJECTION_EXCEPTIONS',
    ).toEqual([])
  })

  test('the harness-Program exception ledger names only corpus sources', () => {
    const keys = new Set(sourceKeys)
    expect([...HARNESS_PROGRAM_REJECTION_EXCEPTIONS].filter(key => !keys.has(key))).toEqual([])
  })

  test('every pinned fixture id exists in the corpus', () => {
    const stale = Object.keys(KNOWN_UNDECLARED).filter(id => !fixtureIds.has(id))
    expect(stale).toEqual([])
  })

  for (const fixture of jsxFixtures) {
    const pin = KNOWN_UNDECLARED[fixture.id]
    if (compileFailed.includes(fixture.id)) {
      // Reference-adapter compile refusals have no client JS to check;
      // their contract is the diagnostic, asserted elsewhere.
      test.skip(`[${fixture.id}] compile refused on reference adapter`, () => {})
      continue
    }
    test(`[${fixture.id}] emitted client JS has no out-of-scope references`, () => {
      const names = undeclared.get(fixture.id) ?? []
      if (pin) {
        // Exact-set pin: a new undeclared name still fails, and a fixed
        // fixture makes the pin stale so it must be deleted.
        expect(
          names,
          `pinned scope holes for '${fixture.id}' changed — if the fix landed, ` +
            `delete its KNOWN_UNDECLARED entry (${pin.limitation})`,
        ).toEqual(pin.names)
      } else {
        expect(
          names,
          `emitted client JS for '${fixture.id}' references undeclared identifiers — ` +
            `this is a guaranteed ReferenceError at runtime. Fix the emission or, if it is ` +
            `a tracked limitation, pin it in KNOWN_UNDECLARED with its registry limitation id.`,
        ).toEqual([])
      }
    })
  }
})
