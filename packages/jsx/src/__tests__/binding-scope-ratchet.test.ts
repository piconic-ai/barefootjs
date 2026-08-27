/**
 * Shrink-only ledger of direct uses of the legacy ad-hoc
 * "names bound by a loop callback" mechanisms #2482 replaces with the one
 * shared `BindingScope` service (`packages/jsx/src/scope/binding-scope.ts`).
 *
 * #2482 counts SIX such mechanisms; this ledger tracks FIVE textual
 * patterns because two of the six have no greppable device name of their
 * own: `csr-substitute.ts`'s `boundStack` is a function-local variable
 * (migrated in Stage 1 by changing that one function, no ledger pattern
 * needed), and `html-template.ts`'s `opts.loopBoundNames` shares the
 * `loopBoundNames` spelling with the per-adapter ref-counted maps, so one
 * pattern covers both.
 * Modeled in spirit on `map-body-no-silent-divergence.test.ts`'s known-hole
 * ledger: a known-inventory of the current reality that may only shrink as
 * Stages 1-4 migrate call sites onto `BindingScope`, never grow. Stage 4
 * drove this to its FLOOR — every remaining entry is a permanent, justified
 * exception (see the `ALLOWLIST` doc comment below), not leftover debt.
 *
 * Scans every `.ts` file under `packages/jsx/src/` and each `packages/adapter-X/src/`
 * (excluding `__tests__` directories, `*.test.ts` files, and
 * `packages/jsx/src/scope/` itself — the new module legitimately mentions
 * its own migration target names in doc comments) for five forbidden
 * substrings:
 *
 *   - `localConstants.find(`   — ad-hoc linear scan for a shadowing local
 *   - `staticLoopSourceBoundNames` — a per-adapter shadow-name Set
 *   - `loopBoundNames`         — `collectLoopBoundNames`'s flat name Set
 *   - `loopParamStack`         — the Go adapter's own loop-param stack
 *   - `loopParams`             — `jsx-to-ir.ts`'s mutable `ctx.loopParams` Set
 *
 * ALLOWLIST pins the EXACT count of each pattern in each file as of Stage 0
 * (#2482). Every assertion below must hold EXACTLY — not "at most" — so the
 * ledger stays a live, precise record instead of a one-way ratchet that
 * silently tolerates drift in either direction:
 *
 *   - A count ABOVE its allowlisted value means a NEW direct use of a
 *     legacy scope device was added — use `BindingScope`
 *     (`packages/jsx/src/scope/binding-scope.ts`) instead; see #2482.
 *   - A count BELOW its allowlisted value means legacy use was removed
 *     (progress!) — shrink the corresponding `ALLOWLIST` entry to keep the
 *     ledger exact, don't leave a stale higher number sitting there.
 *
 * Counts are total substring OCCURRENCES per file (a line with the pattern
 * twice counts twice), not matching-line counts.
 */

import { describe, test, expect } from 'bun:test'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'

const REPO_ROOT = join(import.meta.dir, '..', '..', '..', '..')

const PATTERNS = [
  'localConstants.find(',
  'staticLoopSourceBoundNames',
  'loopBoundNames',
  'loopParamStack',
  'loopParams',
] as const
type Pattern = (typeof PATTERNS)[number]

/**
 * Exact per-file, per-pattern occurrence counts, updated through #2482
 * Stage 4 (the FLOOR — see that stage's PR for the file-by-file
 * MIGRATE-or-FLOOR review). Only ever shrinks — see header comment. A
 * missing file or missing pattern key means an expected count of 0.
 *
 * ============================== FLOOR INVARIANT ==============================
 * Every entry below is a PERMANENT, JUSTIFIED exception, not leftover debt —
 * each one is annotated with why it can't (or shouldn't) thread a live
 * `BindingScope` instead. Two shapes recur across the justifications:
 *
 *   1. NO LIVE SCOPE TO CONSULT: a prepass that runs once at `generate()` /
 *      constructor-generation time, OUTSIDE the render-time (or
 *      render-shaped) tree walk `BindingScope` is threaded through — there is
 *      no position to ask "what's bound HERE" about, so these fall back to a
 *      coarser, deliberately over-inclusive whole-component or whole-file
 *      scan (safe because over-exclusion only ever degrades to the
 *      already-accepted pre-#2482 residual, never to silently wrong output).
 *   2. UNRELATED DOMAIN: a `localConstants.find(` matching the ledger's
 *      textual pattern by coincidence — const/prop resolution for SSR
 *      dead-code elimination, `Record[key]` lookup, cross-IR CSS class
 *      resolution, component-scope const-chain inlining — none of which ask
 *      "is this name shadowed by a loop callback param" at all, so
 *      `BindingScope` (a loop-row/callback binding stack) has no bearing on
 *      them.
 *   3. ACCESSOR/REWRITE PAYLOAD, NOT AN EXISTENCE QUERY: `BindingScope` only
 *      carries binding EXISTENCE/kind/depth — never per-binding rendering
 *      payload (a Go template accessor string, an ordered client-JS
 *      accessor-rewrite spec). The Go adapter's `loopBindingStack` and the
 *      client-JS emitter's `loopParams: ReadonlyArray<string | LoopParamSpec>`
 *      (`ir-to-client-js/utils.ts`'s `wrapExprWithLoopParams` and its
 *      `collect-elements.ts`/`html-template.ts`/`build-event-delegation.ts`
 *      callers) are this shape — a `BindingScope`-adjacent but structurally
 *      distinct concern.
 *
 * New code must use `BindingScope` (`packages/jsx/src/scope/binding-scope.ts`)
 * for any "is this name bound by an enclosing loop callback" question. Per
 * the mechanics already documented below: entries may only shrink (or be
 * removed outright when a file reaches 0), never grow — a grown or added
 * entry is a regression to flag in review, not to allowlist away.
 * ===============================================================================
 */
const ALLOWLIST: Record<string, Partial<Record<Pattern, number>>> = {
  // FLOOR (shape 1, already guarded): `expandDynamicPropValue`'s
  // `this.scope`-mirroring shadow guard (`erb-adapter.ts`'s own
  // `!this.scope.isBound(trimmed)` check, #2489) precedes this `.find(` —
  // the lookup itself is the legitimate const-resolution step once the
  // shadow question is already answered by `scope`.
  'packages/adapter-erb/src/adapter/erb-adapter.ts': { 'localConstants.find(': 1 },
  // FLOOR (shape 2/3 boundary): `inlineLocalHelperCall` resolves a call's
  // CALLEE name against module/component consts to inline a local
  // arrow-helper's body (`sortClass(k)` → its substituted expression) — a
  // "does a helper by this name exist" lookup, not itself a shadow guard.
  // Flagged for the human maintainer (see Stage 4 report): unlike the
  // sibling `litConst` fast path directly above its call site in
  // `go-template-adapter.ts` (which DOES guard with `isLoopShadowedName`),
  // this call site has no such guard — a `.map((sortClass) => ...)`
  // shadowing a same-named module helper is a narrow, unverified gap left
  // for a follow-up rather than fixed speculatively here.
  'packages/adapter-go-template/src/adapter/expr/helper-inline.ts': { 'localConstants.find(': 1 },
  'packages/adapter-go-template/src/adapter/go-template-adapter.ts': {
    // FLOOR: of the 5 `.find(` sites — `resolveDynamicPropValue` (child-prop
    // passthrough, called only from `generateNewPropsFunction`'s
    // `emitStaticChildInstances`), `computeDerivedConstFields` and
    // `isStringExpr` (same `generateNewPropsFunction` constructor-context
    // bucket), and `resolveModuleNumericConst` (guarded in place by
    // `isCurrentLoopItem`/`isOuterLoopParam`, both already `this.scope.lookup`-
    // backed) — 3 are shape-1 (no live scope in the ctor-generation prepass)
    // and 1 is already scope-guarded. The 5th, `renderLoop`'s loop-array
    // const lookup, gained a `!this.scope.isBound(arrayName)` guard in
    // Stage 4 (a real gap: an enclosing loop's own item param could shadow
    // a same-named module const and misfire a BF101) — MIGRATED in place,
    // the `.find(` call itself stays as the legitimate lookup once shadow
    // is ruled out.
    'localConstants.find(': 5,
    // #2482 Stage 3: `loopParamStack` eliminated entirely (0, down from 35)
    // — replaced by the threaded `this.scope: BindingScope`. The remaining
    // 2 `staticLoopSourceBoundNames` uses (down from 3) are the
    // `getBakedStaticChildLoop` shadow guard shared with two call sites
    // OUTSIDE the live `renderLoop` tree walk (no live `scope` to consult
    // there — shape 1) — a genuinely-legitimate surviving use, confirmed
    // FLOOR in Stage 4 (`primeCompileState`'s own comment documents the
    // three-call-site agreement requirement).
    staticLoopSourceBoundNames: 2,
  },
  // FLOOR (shape 1 for the field; the doc-only `loopParamStack` mention this
  // file's top-level comment used to carry was reworded in Stage 4 — that
  // stack no longer exists anywhere, so the ledger's last trace of it is
  // gone too).
  'packages/adapter-go-template/src/adapter/lib/compile-state.ts': { staticLoopSourceBoundNames: 1 },
  // FLOOR (shape 1): `lowerCtorExpr`/`lowerCtorStringArray` lower a derived-
  // state memo's computation into Go CODE evaluated in the `NewXxxProps`
  // constructor — the same no-live-scope bucket as `go-template-adapter.ts`'s
  // ctor-context `.find(` calls above.
  'packages/adapter-go-template/src/adapter/memo/ctor-lowering.ts': { 'localConstants.find(': 3 },
  // FLOOR (shape 1): `packageModuleConst` — same `NewXxxProps` ctor-context
  // bucket as `ctor-lowering.ts`.
  'packages/adapter-go-template/src/adapter/memo/memo-value.ts': { 'localConstants.find(': 1 },
  // FLOOR (shape 1, already guarded): same `this.scope.isBound(trimmed)`
  // shadow guard as `erb-adapter.ts` (#2221 — `resolveLiteralConst` /
  // `resolveStaticRecordLiteral`'s established pattern).
  'packages/adapter-mojolicious/src/adapter/mojo-adapter.ts': {
    'localConstants.find(': 1,
  },
  // FLOOR (shape 2): `generateSignalInitializers`'s reachability analysis
  // for SSR no-op initializer dead-code elimination — module/component-level
  // declaration reachability, unrelated to loop-row shadowing entirely.
  'packages/jsx/src/adapters/jsx-adapter.ts': { 'localConstants.find(': 1 },
  // FLOOR (shape 2): resolves a `Record<T,string>[key]`-shaped indexed
  // lookup's IDENT operand to a module-scope object-literal const for
  // `renderToTest`'s union-semantics resolution — a component-level static
  // analysis pass, not a loop-row shadow question.
  'packages/jsx/src/augment-inherited-props.ts': { 'localConstants.find(': 1 },
  // FLOOR (shape 2): cross-IR CSS class-const resolution for the UnoCSS
  // layer prefixer's transitive-reference walk — operates across whole
  // components' `localConstants` lists, no loop-row scope involved.
  'packages/jsx/src/css-layer-prefixer.ts': { 'localConstants.find(': 1 },
  'packages/jsx/src/free-refs.ts': {
    // FLOOR (shape 2): `resolveConstantInitializerRefs`'s transitive-taint
    // expansion — resolves a local constant's OWN initializer by name to
    // recurse into its free refs, not a loop-row shadow check.
    'localConstants.find(': 1,
    // FLOOR: the `BindingEnvironment.loopParams` field itself was RENAMED
    // (Stage 4) to `loopValueBoundNames` (it carries `scope.valueBoundNames()`
    // — the field name now says so). This single remaining occurrence is the
    // rename's own historical-name mention in `loopValueBoundNames`'s
    // docstring, matching the established convention elsewhere (e.g.
    // `binding-scope.ts`'s own header keeps six `ctx.loopParams` mentions as
    // migration history).
    loopParams: 1,
  },
  // FLOOR (shape 3): `irToPlaceholderTemplate`'s loop-param accessor-rewrite
  // spec forwarding — see the canonical docstring on
  // `wrapExprWithLoopParams` in `ir-to-client-js/utils.ts`.
  'packages/jsx/src/ir-to-client-js/collect-elements.ts': { loopParams: 9 },
  // FLOOR (shape 2): `computeCsrInlinability`'s fixed-point constant-chain
  // inlining loop over `ctx.localConstants` — component-scope const
  // resolution, not loop-row scope.
  'packages/jsx/src/ir-to-client-js/compute-inlinability.ts': { 'localConstants.find(': 1 },
  // FLOOR (shape 3): event-delegation plan building deliberately does NOT
  // pass a loop-param accessor-rewrite spec (see the file's own comments) —
  // the remaining mentions are all in that reasoning, not device usage.
  'packages/jsx/src/ir-to-client-js/control-flow/plan/build-event-delegation.ts': { loopParams: 4 },
  // FLOOR (shape 3): `irToHtmlTemplate`/`irToPlaceholderTemplate`'s
  // loop-param accessor-rewrite spec — see `ir-to-client-js/utils.ts`'s
  // `wrapExprWithLoopParams` docstring (the canonical explanation, pointed
  // to from this file's own function signature since Stage 4).
  'packages/jsx/src/ir-to-client-js/html-template.ts': { loopParams: 17 },
  // FLOOR (shape 1, already guarded): both `expandDynamicPropValue` and
  // `expandConstantForReactivity` precede their `.find(` with
  // `scope?.isBound(trimmedValue)` — see this file's own header comment
  // (added Stage 1b) for the full SHADOW GUARD reasoning. #2723's
  // `resolveRestSpreadOrigin` deliberately does NOT add a third: it walks
  // an alias chain hop by hop, so it indexes `ctx.localConstants` into a
  // memoized `Map` (`localConstantValues`) instead — keeping this floor
  // intact and avoiding a linear scan per hop.
  'packages/jsx/src/ir-to-client-js/prop-handling.ts': { 'localConstants.find(': 2 },
  // FLOOR (shape 3): `wrapExprWithLoopParams` / `LoopParamSpec` — the
  // canonical definition of the accessor-rewrite payload every other
  // `loopParams`-named parameter in `ir-to-client-js/` forwards. See its
  // docstring (added Stage 4) for the full shape-3 reasoning.
  'packages/jsx/src/ir-to-client-js/utils.ts': { loopParams: 4 },
  // `jsx-to-ir.ts` — MIGRATED to 0 in Stage 4: `makeBindingEnv`'s
  // `loopParams: boundNames` field now reads `loopValueBoundNames:
  // boundNames`, matching `free-refs.ts`'s renamed field. No entry needed
  // (a missing key means an expected count of 0).
}

const SCOPE_MODULE_DIR = join(REPO_ROOT, 'packages', 'jsx', 'src', 'scope')

function listTsFiles(dir: string, out: string[]): void {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    const st = statSync(full)
    if (st.isDirectory()) {
      if (entry === '__tests__') continue
      if (full === SCOPE_MODULE_DIR) continue
      listTsFiles(full, out)
    } else if (st.isFile() && entry.endsWith('.ts') && !entry.endsWith('.test.ts')) {
      out.push(full)
    }
  }
}

function countOccurrences(text: string, pattern: string): number {
  let count = 0
  let idx = 0
  while (true) {
    const found = text.indexOf(pattern, idx)
    if (found === -1) break
    count++
    idx = found + pattern.length
  }
  return count
}

function scan(): Record<string, Partial<Record<Pattern, number>>> {
  const roots: string[] = [join(REPO_ROOT, 'packages', 'jsx', 'src')]
  const packagesDir = join(REPO_ROOT, 'packages')
  for (const entry of readdirSync(packagesDir)) {
    if (!entry.startsWith('adapter-')) continue
    const srcDir = join(packagesDir, entry, 'src')
    try {
      if (statSync(srcDir).isDirectory()) roots.push(srcDir)
    } catch {
      // no src dir for this package — skip
    }
  }

  const files: string[] = []
  for (const root of roots) listTsFiles(root, files)

  const result: Record<string, Partial<Record<Pattern, number>>> = {}
  for (const file of files) {
    const text = readFileSync(file, 'utf8')
    const counts: Partial<Record<Pattern, number>> = {}
    for (const pattern of PATTERNS) {
      const c = countOccurrences(text, pattern)
      if (c > 0) counts[pattern] = c
    }
    if (Object.keys(counts).length > 0) {
      const rel = relative(REPO_ROOT, file).split(sep).join('/')
      result[rel] = counts
    }
  }
  return result
}

describe('legacy loop-scope device ledger (#2482) — shrink only', () => {
  const actual = scan()

  test('every scanned file matches its allowlisted counts exactly', () => {
    const allFiles = new Set([...Object.keys(actual), ...Object.keys(ALLOWLIST)])
    const mismatches: string[] = []

    for (const file of allFiles) {
      const actualCounts = actual[file] ?? {}
      const expectedCounts = ALLOWLIST[file] ?? {}
      const allPatterns = new Set<Pattern>([
        ...(Object.keys(actualCounts) as Pattern[]),
        ...(Object.keys(expectedCounts) as Pattern[]),
      ])
      for (const pattern of allPatterns) {
        const got = actualCounts[pattern] ?? 0
        const want = expectedCounts[pattern] ?? 0
        if (got > want) {
          mismatches.push(
            `${file} [${pattern}]: found ${got}, allowlisted ${want} — new direct use of legacy ` +
              `scope device — use BindingScope (packages/jsx/src/scope/binding-scope.ts) instead; see #2482`,
          )
        } else if (got < want) {
          mismatches.push(
            `${file} [${pattern}]: found ${got}, allowlisted ${want} — legacy use removed — ` +
              `shrink the ALLOWLIST entry to keep the ledger exact`,
          )
        }
      }
    }

    expect(mismatches).toEqual([])
  })
})
