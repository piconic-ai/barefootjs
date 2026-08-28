import { describe, test, expect } from 'bun:test'
import ts from 'typescript'
import { AXIS_NAMES, AXIS_VALUES, EVENT_VALUES, type AxisCombo, type AxisName } from '../../pairwise/axes'
import { buildCoveringArray, isValidCombo } from '../../pairwise/covering-array'
import { assertNoMarkers, composeCase, stateInitialValueIsTruthy } from '../../pairwise/compose'

/**
 * The pairwise generator's contract test (#2481 step 5). This is the PR's
 * real deliverable — see CLAUDE.md's "a subset extension merges only with
 * fixtures in the same PR" precedent, applied here to a test-generation
 * tool: the coverage guarantee is worthless unless it's asserted
 * mechanically, not assumed from reading the greedy construction.
 */

function allAxisPairs(): Array<{ a: AxisName; b: AxisName }> {
  const pairs: Array<{ a: AxisName; b: AxisName }> = []
  for (let i = 0; i < AXIS_NAMES.length; i++) {
    for (let j = i + 1; j < AXIS_NAMES.length; j++) {
      pairs.push({ a: AXIS_NAMES[i], b: AXIS_NAMES[j] })
    }
  }
  return pairs
}

describe('pairwise covering array — coverage floor (#2481 t=2)', () => {
  test('every VALID pair of axis values is covered by at least one generated case', () => {
    const { cases, totalValidPairs } = buildCoveringArray()
    const covered = new Set<string>()
    for (const combo of cases) {
      for (const { a, b } of allAxisPairs()) {
        covered.add(`${a}=${combo[a]}&${b}=${combo[b]}`)
      }
    }

    const missing: string[] = []
    for (const { a, b } of allAxisPairs()) {
      for (const valueA of AXIS_VALUES[a]) {
        for (const valueB of AXIS_VALUES[b]) {
          const partial = { [a]: valueA, [b]: valueB } as Partial<AxisCombo>
          if (!isValidCombo(partial)) continue
          const key = `${a}=${valueA}&${b}=${valueB}`
          if (!covered.has(key)) missing.push(key)
        }
      }
    }

    expect(missing).toEqual([])
    expect(covered.size).toBe(totalValidPairs)
  })

  test('no generated case contains an invalid pair', () => {
    const { cases } = buildCoveringArray()
    for (const combo of cases) {
      expect(isValidCombo(combo)).toBe(true)
    }
  })

  test('case count is in the expected ~100-130 range for this grammar', () => {
    const { cases } = buildCoveringArray()
    expect(cases.length).toBeGreaterThanOrEqual(80)
    expect(cases.length).toBeLessThanOrEqual(150)
  })

  test('two generations with the same seed produce byte-identical case tuples', () => {
    const first = buildCoveringArray()
    const second = buildCoveringArray()
    expect(JSON.stringify(second.cases)).toBe(JSON.stringify(first.cases))
  })
})

describe('pairwise covering array — declared constraints', () => {
  test('event values requiring a loop are never paired with a non-loop structure', () => {
    const { cases } = buildCoveringArray()
    for (const combo of cases) {
      if (combo.event === 'handler-reading-loop-param' || combo.event === 'delegated-handler-in-row') {
        expect(['keyed-loop', 'unkeyed-loop', 'static-array-loop', 'signal-array-loop', 'nested-loop-depth-2', 'component-row-root-loop', 'fragment-row-loop', 'preamble-builder-body']).toContain(
          combo.structure,
        )
      }
    }
  })

  test('array-decoration callback values are never paired with a non-loop structure', () => {
    const { cases } = buildCoveringArray()
    for (const combo of cases) {
      if (combo.callback === 'sort-comparator' || combo.callback === 'filter-predicate' || combo.callback === 'flatmap-callback') {
        expect(['keyed-loop', 'unkeyed-loop', 'static-array-loop', 'signal-array-loop', 'nested-loop-depth-2', 'component-row-root-loop', 'fragment-row-loop', 'preamble-builder-body']).toContain(
          combo.structure,
        )
      }
    }
  })

  test('controlled bindings are never paired with the unsettable `prop` state', () => {
    const { cases } = buildCoveringArray()
    for (const combo of cases) {
      if (combo.binding === 'controlled-input' || combo.binding === 'controlled-select' || combo.binding === 'controlled-textarea') {
        expect(combo.state).not.toBe('prop')
      }
    }
  })
})

describe('pairwise compose — marker substitution', () => {
  test('throws when a marker identifier is used by a template with no substitute supplied', () => {
    // Exercises the same failure `substituteMarkers` guards against, from
    // the public surface: `composeCase` must never emit a case with a
    // marker still in it (this would happen if a future structure
    // template referenced e.g. `__source` without composeCase supplying
    // one — reproduced directly here rather than mutating internal state).
    const factory = ts.factory
    const marker = factory.createIdentifier('__rowContent')
    expect(() => assertNoMarkers(marker)).toThrow(/marker identifier/)
  })

  test('assertNoMarkers accepts a tree with no marker identifiers', () => {
    const factory = ts.factory
    const clean = factory.createIdentifier('totallyFine')
    expect(() => assertNoMarkers(clean)).not.toThrow()
  })

  test('assertNoMarkers finds a leaked marker nested inside a larger tree', () => {
    const factory = ts.factory
    const leaked = factory.createCallExpression(factory.createIdentifier('doStuff'), undefined, [factory.createIdentifier('__eventAttrs')])
    expect(() => assertNoMarkers(leaked)).toThrow(/__eventAttrs/)
  })
})

/**
 * Finds the tag name of the JSX element carrying the literal `data-pw-event`
 * attribute in a composed case's source. `composeCase` always spreads it
 * (alongside the event's own attrs) via the `__eventAttrs` marker, which
 * `substituteMarkers` splices in as literal attributes on whichever element
 * hosted `{...__eventAttrs}` in the structure template — so by construction
 * there is exactly one such element per case. Returns `null` only if that
 * invariant is somehow broken (no case should ever hit it; the coverage
 * test below fails loudly rather than silently skipping if it does).
 */
function findDataPwEventTag(sourceFile: ts.SourceFile): string | null {
  let tag: string | null = null
  const visit = (node: ts.Node): void => {
    if (tag !== null) return
    if (ts.isJsxAttribute(node) && node.name.getText(sourceFile) === 'data-pw-event') {
      const opening = node.parent.parent
      if (ts.isJsxOpeningElement(opening) || ts.isJsxSelfClosingElement(opening)) {
        tag = opening.tagName.getText(sourceFile)
      }
    }
    ts.forEachChild(node, visit)
  }
  visit(sourceFile)
  return tag
}

/**
 * Whether `componentName`'s OWN function declaration (present in the same
 * composed source, as one of `composeCase`'s `extraTopLevelDecls`) forwards
 * its rest-destructured props onto a lowercase (real DOM) tag via
 * `{...rest}`. One hop is all this generator ever needs — no generated case
 * nests a component call inside another component call — so this does not
 * recurse into further component references it might find.
 */
function componentForwardsRestToDomTag(sourceFile: ts.SourceFile, componentName: string): boolean {
  const fn = sourceFile.statements.find((s): s is ts.FunctionDeclaration => ts.isFunctionDeclaration(s) && s.name?.text === componentName)
  if (!fn?.body) return false
  const param = fn.parameters[0]
  if (!param || !ts.isObjectBindingPattern(param.name)) return false
  const restElement = param.name.elements.find(el => el.dotDotDotToken !== undefined)
  if (!restElement || !ts.isIdentifier(restElement.name)) return false
  const restName = restElement.name.text

  let found = false
  const visit = (node: ts.Node): void => {
    if (found) return
    if (ts.isJsxSpreadAttribute(node) && ts.isIdentifier(node.expression) && node.expression.text === restName) {
      const opening = node.parent.parent
      if ((ts.isJsxOpeningElement(opening) || ts.isJsxSelfClosingElement(opening)) && /^[a-z]/.test(opening.tagName.getText(sourceFile))) {
        found = true
        return
      }
    }
    ts.forEachChild(node, visit)
  }
  visit(fn.body)
  return found
}

describe('pairwise compose — the event hook must land on something real', () => {
  /**
   * The covering array proves a pair is present in a case TUPLE; it says
   * nothing about whether the case actually EXERCISES it. A `data-pw-event`
   * spread onto a component call (`<PairwiseRow {...__eventAttrs}>`) never
   * reaches rendered DOM unless that component forwards it — the covered
   * pair would otherwise be illusory. Measured before any fix (with
   * `PairwiseRow`'s original body, `<div>{props.children}</div>`, which
   * forwarded nothing): 16 of 97 generated cases failed this — every
   * `component-row-root-loop` / `child-component` case. This test is the
   * backstop for that whole failure class, not just today's instance of it
   * — CLAUDE.md's "a generator that emits a case testing nothing" is
   * exactly the silent-divergence class this instrument exists to catch.
   */
  test('data-pw-event lands on a lowercase (real DOM) tag, directly or via one hop of rest-prop forwarding', () => {
    const { cases } = buildCoveringArray()
    const unreached: string[] = []
    for (const combo of cases) {
      const composed = composeCase(combo)
      const sourceFile = ts.createSourceFile(`${combo.state}-${combo.structure}.tsx`, composed.source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
      const tag = findDataPwEventTag(sourceFile)
      expect(tag).not.toBeNull()
      if (tag === null) continue
      const reachesDom = /^[a-z]/.test(tag) || componentForwardsRestToDomTag(sourceFile, tag)
      if (!reachesDom) {
        unreached.push(`structure=${combo.structure} event=${combo.event}: <${tag}> never forwards to a DOM tag`)
      }
    }
    expect(unreached).toEqual([])
  })
})

/**
 * `conditional-ternary` / `early-return` each have a branch WITHOUT the
 * row (and so without `data-pw-event`) BY DESIGN — see `CONDITIONAL_TERNARY_TEMPLATE`
 * / `EARLY_RETURN_BODY` in `compose.ts`. Which branch actually renders on
 * first SSR is decided entirely by `stateInitialValueIsTruthy(combo.state)`
 * — NOT by the `event` axis.
 *
 * This table exists because that was not the first guess: `ref-callback`
 * looked like the likely culprit going in ("attaches no attribute"), but a
 * real `bun run pairwise:generate` sweep of all 97 cases falsified that —
 * `direct-handler` and `handler-reading-outer-signal` land in the row-less
 * branch just as often once paired with a falsy-seeded state, and
 * `ref-callback` cases with a TRUTHY-seeded state (`prop`,
 * `prop-shadowing-signal`) carry `data-pw-event` just fine. The real,
 * 100%-consistent split in that sweep was exactly this table: falsy-seeded
 * states (`signal`, `memo`, `getter-elided-signal`, all seeded/derived
 * from `0`) never rendered the row; truthy-seeded ones (`prop`,
 * `prop-shadowing-signal`, sampled at `7`) always did.
 *
 * This is expected generator behavior, not the "component call never
 * forwards" bug class the assertion above catches: the row branch DOES
 * carry `data-pw-event` at compose time (that assertion covers it); the
 * fallback branch, by design, simply has no row to carry it. Across the
 * full covering array both branches of both structures get exercised —
 * some cases render the row, others the fallback — so nothing here goes
 * untested, only unexercised BY THE HOOK given these particular samples.
 */
const LEGITIMATELY_ROW_LESS: ReadonlySet<string> = new Set(
  (['conditional-ternary', 'early-return'] as const).flatMap(structure =>
    (['signal', 'memo', 'getter-elided-signal'] as const).map(state => `${structure}|${state}`),
  ),
)

describe('pairwise compose — branch-selecting structures, a documented (not silent) non-coverage', () => {
  test('every conditional-ternary/early-return case with a falsy-seeded state is a documented exemption, and no truthy-seeded one is', () => {
    const { cases } = buildCoveringArray()
    const branchSelecting = cases.filter(c => c.structure === 'conditional-ternary' || c.structure === 'early-return')
    // Guards the guard: if the covering array ever stopped generating
    // branch-selecting cases, the loop below would vacuously pass.
    expect(branchSelecting.length).toBeGreaterThan(0)

    const undocumented: string[] = []
    const wronglyExempted: string[] = []
    for (const combo of branchSelecting) {
      const key = `${combo.structure}|${combo.state}`
      const rendersRow = stateInitialValueIsTruthy(combo.state)
      if (!rendersRow && !LEGITIMATELY_ROW_LESS.has(key)) {
        undocumented.push(`${key}: renders the row-less branch but has no documented exemption`)
      }
      if (rendersRow && LEGITIMATELY_ROW_LESS.has(key)) {
        wronglyExempted.push(`${key}: documented as row-less but its state renders the row`)
      }
    }
    expect(undocumented).toEqual([])
    expect(wronglyExempted).toEqual([])
  })
})

/**
 * Idempotence-oracle coverage floor (#2481 step 5, browser-oracle leg).
 * `e2e/oracle.playwright.ts`'s `'idempotence'` oracle only ever runs on a
 * case whose `interactions` carries at least one ACTION step
 * (`actionStepsOf`, e2e/interaction-runner.ts) — a case with none is
 * silently never exercised by it. Measured before the fix this guards
 * (a real `bun run pairwise:generate` sweep): 19 of 85 `ok` cases had no
 * interactions, and EVERY one of them was `event: 'ref-callback'` — an
 * entire axis value the idempotence oracle never touched. `composeCase`
 * now gives every case, `ref-callback` included, the same click (see its
 * docstring for why a no-op click is still a real assertion there); this
 * pair of tests is the mechanical backstop so a future change can't
 * silently reopen that gap by re-adding a `combo.event === '…' ? [] : …`
 * carve-out for any event value, known or new.
 */
describe('pairwise compose — idempotence coverage floor (#2481 step 5, browser-oracle leg)', () => {
  test('every generated case declares at least one interaction', () => {
    const { cases } = buildCoveringArray()
    const missing: string[] = []
    for (const combo of cases) {
      const composed = composeCase(combo)
      if (composed.interactions.length === 0) {
        missing.push(`event=${combo.event} structure=${combo.structure} state=${combo.state}`)
      }
    }
    expect(missing).toEqual([])
  })

  test('every EVENT_VALUES value is exercised by at least one case with a non-empty interactions array', () => {
    const { cases } = buildCoveringArray()
    const eventsWithInteractions = new Set(cases.filter(c => composeCase(c).interactions.length > 0).map(c => c.event))
    const uncovered = EVENT_VALUES.filter(value => !eventsWithInteractions.has(value))
    expect(uncovered).toEqual([])
  })
})

describe('pairwise compose — composition smoke', () => {
  test('every generated case parses as valid TSX with no syntactic diagnostics', () => {
    const { cases } = buildCoveringArray()
    for (const combo of cases) {
      const composed = composeCase(combo)
      const sourceFile = ts.createSourceFile(`${combo.state}-${combo.structure}.tsx`, composed.source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
      const diagnostics = (sourceFile as unknown as { parseDiagnostics?: readonly ts.Diagnostic[] }).parseDiagnostics ?? []
      expect({ combo, diagnostics: diagnostics.map(d => ts.flattenDiagnosticMessageText(d.messageText, ' ')) }).toEqual({ combo, diagnostics: [] })
    }
  })

  test('every generated case declares the component name it reports and stays marker-free', () => {
    const { cases } = buildCoveringArray()
    for (const combo of cases) {
      const composed = composeCase(combo)
      expect(composed.source).toContain(`function ${composed.componentName}`)
      expect(composed.source).not.toMatch(/__source\b|__rowContent\b|__eventAttrs\b|__condition\b/)
    }
  })
})
