/**
 * The known-limitation registry — the source of truth for every gap the
 * compiler, an adapter, or the runtime is known to have against the
 * conformance contract.
 *
 * One file per limitation under `packages/adapter-tests/limitations/`, flat
 * (no subdirectories: a limitation's classification can change, its id must
 * not). The file name IS the id — a stable kebab-case slug that pins cite
 * (`ConformancePin.limitation`, `RenderDivergences[id].limitation`) and the
 * docs compatibility-matrix page anchors on. A file is deleted when the last
 * pin citing it graduates (`refusal` / `silent`), or lives forever
 * (`by-design`).
 *
 * An entry declares WHAT the limitation is and nothing else — no workflow
 * state (planned / blocked / owner), no cause analysis for a gap nobody has
 * root-caused yet, no links to issues or PRs (those rot; git history holds
 * the story). Every slot has a fixed meaning so entries read alike:
 *
 *   - `title`     — the limitation's name (a noun phrase).
 *   - `given`     — the input shape that hits it. Names no adapter: which
 *                   adapters are affected is derived from the pins, render
 *                   divergences and real-browser e2e quarantine rows that
 *                   cite this id, never declared here.
 *   - `expected`  — what the Hono reference renders for that shape. This
 *                   is a definition, not an opinion: the reference adapter's
 *                   output IS the contract every other adapter is measured
 *                   against.
 *   - `actual`    — (`silent` only) what the affected adapter renders
 *                   instead. For `refusal` / `by-design` the actual outcome
 *                   is fully determined by `diagnostic` ("the compiler
 *                   refuses with BF101") and is rendered from it.
 *   - `diagnostic` — (`refusal` / `by-design`) the code(s) the refusal
 *                   fires with. An array when adapters differ (e.g. BF101
 *                   on most, BF102 on one).
 *   - `reason`    — (`by-design` only) why the shape will never be lowered:
 *                   the design decision, written after the alternatives
 *                   were actually tried.
 *   - `fixtures`  — the minimal reproductions in the conformance corpus
 *                   (`packages/adapter-tests/fixtures/`). The refused /
 *                   diverging fixtures only, never their escape twins (the
 *                   twin is declared on the fixture's own `escapes`).
 *
 * `kind` is the compatibility policy's classifier, applied to the
 * behaviour, not to anyone's intent:
 *
 *   - `silent`    — output silently differs from the contract. A defect.
 *   - `refusal`   — a loud, `/* @client *\/`-escapable compile-time refusal.
 *                   A capability gap; a faithful lowering may land later.
 *   - `by-design` — an accepted permanent position: refused on purpose,
 *                   with `reason` saying why. Never graduates.
 *
 * Entries are discovered from the directory listing (`limitations/index.ts`
 * is the loader, not a list): adding or deleting a file is the whole change.
 * `packages/adapter-tests/src/__tests__/limitations.test.ts` lints every
 * entry (slot shape, no issue/PR references, fixtures exist and are not
 * escape twins) and `packages/compat/src/__tests__/limitations-join.test.ts`
 * joins the registry against every adapter's pins and the e2e quarantine
 * ledgers (every pin cites an existing id; every fixture an entry lists is
 * pinned, declared divergent, or oracle-quarantined under that id; every
 * pinned fixture is listed by the entry it cites). For a hydration-parity
 * gap (server HTML vs hydrated or client-mounted DOM) `expected` states the
 * parity the contract requires rather than a reference render.
 */

export type LimitationKind = 'silent' | 'refusal' | 'by-design'

interface LimitationBase {
  /** The limitation's name — a noun phrase, one line, no trailing period. */
  title: string
  /** The input shape that hits the limitation. One line; names no adapter. */
  given: string
  /** What the Hono reference renders for that shape. One line. */
  expected: string
  /** Minimal reproductions in the conformance corpus (refused / diverging fixtures, not escape twins). */
  fixtures: readonly string[]
}

export interface RefusalLimitation extends LimitationBase {
  kind: 'refusal'
  /** The diagnostic code(s) the refusal fires with, e.g. `'BF101'` or `['BF101', 'BF102']`. */
  diagnostic: string | readonly string[]
}

export interface SilentLimitation extends LimitationBase {
  kind: 'silent'
  /** What the affected adapter renders instead of `expected`. One line, starts with a verb. */
  actual: string
}

export interface ByDesignLimitation extends LimitationBase {
  kind: 'by-design'
  /** The diagnostic code(s) the refusal fires with. */
  diagnostic: string | readonly string[]
  /** Why the shape will never be lowered — the design decision. */
  reason: string
}

export type LimitationSpec = RefusalLimitation | SilentLimitation | ByDesignLimitation

/** A registry entry with its id (the file name) attached. */
export type Limitation = LimitationSpec & { id: string }

/** Identity helper so each `limitations/<id>.ts` gets the discriminated-union typing at the declaration site. */
export function defineLimitation<T extends LimitationSpec>(spec: T): T {
  return spec
}

/** The diagnostic code(s) of a `refusal` / `by-design` entry as an array (sorted); `[]` for `silent`. */
export function limitationDiagnostics(spec: LimitationSpec): string[] {
  if (spec.kind === 'silent') return []
  const codes = typeof spec.diagnostic === 'string' ? [spec.diagnostic] : [...spec.diagnostic]
  return codes.sort()
}

/**
 * The `actual` line every entry renders with: declared for `silent`,
 * derived from `diagnostic` for the two refusal kinds so it is never
 * hand-written twice.
 */
export function limitationActual(spec: LimitationSpec): string {
  if (spec.kind === 'silent') return spec.actual
  const codes = limitationDiagnostics(spec)
  const suffix = spec.kind === 'by-design' ? ' (by design)' : ''
  return `the compiler refuses with ${codes.join(' / ')}${suffix}`
}

/**
 * Regex for a valid limitation id — the file's base name. Kebab-case,
 * letters first (an id is also a URL fragment and a TS import path).
 */
export const LIMITATION_ID_RE = /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/
