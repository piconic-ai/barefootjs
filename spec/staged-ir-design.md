# Staged-IR Design — P3 (relocate) Pre-Implementation Review

**Status:** Draft for review (2026-04-30). Not merged into `spec/compiler.md` yet — that happens in P7 after the implementation stabilizes.
**Issue:** #1138.
**Branch:** `feat/staged-ir`.
**Prior phases:** P0 (failing fixtures), P1 (Phase/Scope/Effect types), P2 (analyzer scope tagging) — all merged on this branch.

The audience for this document is the future contributor implementing P3. It assumes you have read #1138 and the conversation that produced this branch.

---

## 1. What P3 must do

### 1.1 Problem (recap of #1138)

The compiler today has **three rewrite passes** that each carry a private model of "which scope is this expression authored in / which scope is it being emitted into":

1. `rewriteBarePropRefs` in `prop-rewrite.ts` — AST walk + RegExp text substitution. Used at **18 call sites in `jsx-to-ir.ts`** (one per `template*` field) and **1 call site in `analyzer.ts`** (for `localConstants.templateValue`).
2. **Inline judgment** in `html-template.ts` (946 lines) — decides which init-locals can be inlined into the standalone `template: (_p) => \`...\`` lambda body. Today this is `compute-inlinability.ts` + ad-hoc fallbacks scattered through `html-template.ts`.
3. **Reactivity wrap** in `emit-reactive.ts` — decides whether an expression needs to be wrapped in a `createEffect` / getter for tick-phase re-evaluation.

Each pass independently re-derives "is this name a prop / a signal / an init-local / a sub-init-local / a render-item param / a module import?". When they disagree (the #1132 shadow case, the #1137 memo-inline case), we get the bug.

### 1.2 Goal of P3

Replace all three passes with one function:

```ts
function relocate(
  expr: string | ts.Expression,
  fromScope: Scope,
  toScope: Scope,
  env: RelocateEnv,
): RelocateResult
```

`relocate()` is the **single source of truth** for: what rewrite is needed when an expression authored in `fromScope` is emitted into `toScope`, against the binding environment `env`. The 19 `rewriteBarePropRefs` call sites become 19 `relocate(..., 'init', 'template', env)` calls. The inline-judgment passes become `relocate(..., 'init', 'template', env)` returning a "lifted" form vs. an "inlinable" form.

### 1.3 Non-goals

- **Rewriting at AST level instead of text** is desirable but **not required** for P3. P3 keeps RegExp/text substitution at first; the win is *centralization*. P3.5 (separate, optional) can swap to `ts.transform`.
- **Phase enforcement** (BF060/BF061/BF062 errors) is P5, not P3. relocate() returns enough information for P5 to surface errors, but doesn't itself emit errors.
- **`emit-reactive.ts` consolidation.** Reactivity wrapping has its own logic that isn't strictly stage-shift. Fold it in only if it simplifies; don't force it.

---

## 2. Function shape

### 2.1 Signature

```ts
import ts from 'typescript'
import type { Scope, BindingKind, FreeReference } from './types'

export interface RelocateEnv {
  /** Identifiers visible in `fromScope`, with their resolved binding kind. */
  bindings: Map<string, BindingKind>
  /** Names of inlinable constants (closed-over, dependency-pure). Maps name → init expression. */
  inlinable: Map<string, string>
  /** When true, fall back to safe placeholders (`undefined`, `[]`) for unreachable refs. */
  allowFallback: boolean
}

export interface RelocateResult {
  /** Rewritten expression text, ready to interpolate into the toScope. */
  text: string
  /** True when relocation succeeded without falling back. */
  ok: boolean
  /** Identifiers the rewritten text references (post-rewrite). Used by emit to gate import preservation. */
  usedExternals: Set<string>
  /** Per-name decisions, for diagnostics and P5 error emission. */
  decisions: RelocateDecision[]
}

export interface RelocateDecision {
  name: string
  kind: BindingKind
  action: 'pass-through' | 'lift-to-prop' | 'inline' | 'fallback' | 'reject'
  /** Final emitted form for this name (e.g. `_p.count`, the inlined literal, `undefined`). */
  rewrittenAs: string
}

export function relocate(
  expr: string,
  exprNode: ts.Node | null,
  fromScope: Scope,
  toScope: Scope,
  env: RelocateEnv,
): RelocateResult
```

`exprNode` is optional because some call sites already have the AST and some only have a string. When the AST is available, relocate uses it for shadow-aware identifier walking (the #1132 fix). When only the string is available, relocate uses RegExp with the same shadow rules encoded in `env.bindings`.

### 2.2 Decision matrix

For each free identifier `n` in `expr`, look up `env.bindings.get(n)` and consult the table:

| `fromScope` | `toScope` | binding kind            | action          | rewrittenAs                                    |
|-------------|-----------|-------------------------|-----------------|------------------------------------------------|
| `init`      | `init`    | *any*                   | pass-through    | `n` (no change)                                |
| `init`      | `template`| `prop`                  | lift-to-prop    | `_p.<n>`                                       |
| `init`      | `template`| `module-import`         | pass-through    | `n` (template scope sees module imports)       |
| `init`      | `template`| `module-local`          | pass-through    | `n`                                            |
| `init`      | `template`| `init-local`            | inline OR fallback | inlined initializer if `inlinable.has(n)` else `undefined` |
| `init`      | `template`| `signal-getter`         | reject (P5: BF060) | `undefined` if `allowFallback`, else mark decision rejected |
| `init`      | `template`| `signal-setter`         | reject          | same as signal-getter                          |
| `init`      | `template`| `memo-getter`           | reject          | same                                           |
| `init`      | `template`| `sub-init-local`        | reject          | same                                           |
| `init`      | `template`| `render-item`           | reject          | `undefined`                                    |
| `init`      | `template`| `global`                | pass-through    | `n` (assume e.g. `undefined`, `JSON`, etc.)    |
| `sub-init`  | `template`| same as `init` row, except sub-init params/locals are unreachable in template  |
| `render-item`|`template`| `render-item` is the only addition; all init-side lookups apply too           |
| `init`      | `module`  | rare; only when emitting a static const. Same forbidden set as `template` minus `prop`. |

Rows not listed: pass-through (no rewrite). The matrix is small because most stage-shifts are between adjacent layers.

### 2.3 Inlining decision

The `inlinable` map is computed by an upstream pass (today's `compute-inlinability.ts`, slightly refactored). For P3:

- **Inline-eligible iff:** the constant's free refs are all themselves visible in `toScope` (transitively), and the constant has effect `pure` (no signal-write, no IO).
- **Recursive inlining hazard (#1137):** when the inlined initializer itself contains a reference that isn't visible in `toScope` (e.g. a `createMemo` body referencing `props`), DO NOT inline. Mark the decision as `fallback` and emit `undefined`. Init's effect will populate the real value at tick phase.

The "transitively visible" check is the canonical fix for #1137. Today's compiler inlines blindly and the recursive expansion silently leaks `props` into template scope.

### 2.4 Shadow handling (#1132)

`env.bindings` is constructed by the analyzer with shadow precedence already resolved:

- For each name `n`, the analyzer walks declarations in source order. The last binding wins.
- Sub-Init scope adds local params on top of the inherited binding map; relocate() consults the merged map for the deepest scope `expr` was authored in.
- "Pure alias" (`const { name } = props` with no default) is recorded as `kind: 'prop'`, NOT `kind: 'init-local'`. This preserves today's #1127 fix where bare `name` rewrites to `_p.name`.

Today's `propNames` shadow set (analyzer.ts:1780–1797) becomes a property of `env.bindings`, no longer a separate set.

---

## 3. Migration strategy

### 3.1 Implementation order

1. **Add `relocate()` next to `prop-rewrite.ts`** as a parallel implementation. Initially calls into `rewriteBarePropRefs` for the lift-to-prop case and `compute-inlinability` for the inline case — relocate is a thin façade.
2. **Build `RelocateEnv` once per component** in the analyzer. This becomes part of `IRMetadata.clientAnalysis` so adapter code can also access it.
3. **Migrate the 19 call sites in `jsx-to-ir.ts`** one or two at a time. Each migration:
   - Old: `templateExpr: rewriteBarePropRefs(text, node, ctx)`
   - New: `templateExpr: relocate(text, node, 'init', 'template', env).text`
   - Run `bun test` after each migration. Should be a no-op.
4. **Migrate `analyzer.ts:1813`** (the localConstants `templateValue` rewrite). Same shape.
5. **Migrate the inline-judgment in `html-template.ts`.** This is the one that fixes #1137: today's blind inlining becomes `relocate(initExpr, 'init', 'template', env)` which detects the recursive hazard and falls back. The 4 P0 fixtures should turn green here.
6. **Delete `prop-rewrite.ts`** once the last call site migrates. `relocate()` absorbs its rules.

### 3.2 Backward compatibility

Existing `templateExpr` / `templateValue` / `templateCondition` / `templateArray` / `templateMapPreamble` IR fields stay as they are — `relocate()` populates them, just as `rewriteBarePropRefs` does today. No IR consumer needs to change.

This means P3 is internally a refactor — observable behavior changes only where the bugs were (the 4 P0 fixtures). All 921 currently-passing tests should stay green.

### 3.3 Risk: #1132 regression

The shadow guard in analyzer.ts:1780–1797 is subtle. P3's `RelocateEnv.bindings` must reproduce it exactly. The 02-shadow-guards fixtures already pin this; if any of them fail during P3, the env construction is wrong.

Concrete reproduction recipe before declaring P3 done:

```bash
bun test src/__tests__/staged-ir/02-shadow-guards.test.ts
bun test src/__tests__/csr-template-context-method-shadow.test.ts
bun test src/__tests__/destructured-from-props-localconst-value.test.ts
```

All three must stay green.

### 3.4 Risk: inline-fallback divergence on attribute presence

Today's "fallback to `undefined`" produces `${(undefined) != null ? 'data-x="..."' : ''}` — the runtime null-guard makes this render as no attribute. relocate() must produce the same shape; emit code in `html-template.ts:466-510` consumes the rewritten text and wraps it in this envelope. Don't move the envelope into relocate() (it's emit's job); just keep the rewritten text shape compatible.

---

## 4. Why this fixes the 4 P0 failures

| P0 fixture | Today's broken behavior | Fixed by relocate() |
|---|---|---|
| `05/relative import survives compile` | Init body becomes empty (yjs inlined into template), import-collection thinks `useYjs` is unused | relocate() detects `useYjs` is a `module-import` and adds it to `usedExternals`. Import preservation reads from `usedExternals`, sees the use, keeps the import. |
| `05/multiple imports bundled` | Same shape | Same fix |
| `06/init-locals do NOT leak` | `useYjs(...)` call inlined as initializer of `yjs`, leaks bare `useYjs` into template | relocate() classifies `yjs` as `init-local` with non-pure init (it's a function call, effect ≠ pure under conservative analysis) → falls back to `undefined`. Init's effect populates. |
| `06/createMemo getter NOT inlined` | Memo body `() => \`T(${store.read()})\`` blindly inlined; `store` (an init-local) leaks into template | relocate() detects the memo body's free ref `store` is `init-local` not visible in `template`, refuses to inline. Falls back to `undefined`; init's createEffect populates. |

The 4 fixtures share the same root: the inline-judgment pass didn't know about the visibility table. relocate() centralizes it.

---

## 5. What relocate() does NOT solve

- **Async modifier drop (#1130)** — not a relocate concern. P4 (emit reads from IR) handles this by reading `FunctionInfo.isAsync` and `FunctionInfo.declarationKind` from IR rather than reconstructing.
- **Inline `type` stripping at depth (#1131)** — strip-types.ts's recursion is a separate fix. Folded into P4 as well.
- **Leading `;` ASI hazard** — `InitStatementInfo.needsLeadingSemi` (added in P1) is read by emit in P4.
- **Cross-stage await (BF062)** — P5.

---

## 6. Test plan (when P3 lands)

1. All 27 currently-passing staged-ir fixtures stay green.
2. The 4 currently-failing staged-ir fixtures turn green (this IS the success criterion for P3).
3. All 894 other jsx tests stay green (= 921 total passing today minus the 27 staged-ir fixtures).
4. Build (`bun run build`) clean — no tsgo errors.
5. Manual run against `piconic-ai/desk` `worker/components/canvas/DeskCanvas.tsx` — confirm hydration works without ReferenceError.

If items 1–4 pass but item 5 still fails, that's a missing case in the visibility table; add a row to §2.2 and update the analyzer.

---

## 7. Estimated cost

- **§2.1 + §2.2 (relocate skeleton + decision matrix):** half day.
- **§3.1 step 1–4 (façade + 20 call sites):** 1–2 days. Mechanical, but each migration needs a test pass.
- **§3.1 step 5 (inline-judgment migration, the bug fix):** 1 day. The 4 P0 fixtures are the gate.
- **§3.1 step 6 (delete prop-rewrite.ts):** 1 hour.
- **Risk buffer:** 1 day for unexpected interactions with `compute-inlinability`, `compute-prop-usage`, `walk-prop-accesses`.

Total: **3–5 days** for P3 alone.

---

## 8. Open design questions

These were considered during P3 design and deferred. None block implementation, but flag them in PR reviews.

1. **Should relocate() be a `ts.Visitor`-based AST transform instead of a string operation?** The `rewriteBarePropRefs` RegExp has known edge cases (the `(?<!['"\\w.-])` lookbehind for object literal keys). An AST-based version would be cleaner. **Decision: defer to a P3.5.** P3 absorbs the existing rules into one place; P3.5 swaps the implementation. Decoupling these two changes makes review easier.

2. **Should `RelocateEnv.bindings` be derived per-expression or computed once per component?** Per-expression is more accurate for sub-init scopes; once-per-component is cheaper. **Decision: once-per-component, with sub-init/render-item local extensions overlaid at the call site.** Matches today's pattern in `jsx-to-ir.ts` (`ctx._destructuredPropNames`).

3. **Should `inline` decisions emit a comment trail in the generated code (`/* inlined from foo */`)?** Useful for debugging; verbose. **Decision: skip for now.** Source maps are the right vehicle (P4 already touches `source-map.ts`).

4. **Should `relocate()` be exported for adapter authors?** Adapters today don't see this concern (it's compiler-internal). **Decision: keep internal.** If a future adapter needs it, promote then.

---

## 9. PR shape recommendation

Split P3 into two PRs against `feat/staged-ir`:

1. **PR-A: relocate skeleton + façade** — adds `relocate.ts`, builds `RelocateEnv` in analyzer, migrates the 19 call sites in `jsx-to-ir.ts` and the 1 in `analyzer.ts`. **Behavior unchanged.** All 921 tests green; the 4 P0 still red.
2. **PR-B: inline-judgment fix** — adds the recursive-visibility check in `compute-inlinability` (or wherever the inline decision lands). **The 4 P0 fixtures turn green.** This PR is the user-visible bug fix.

Reviewers can read PR-A for "did the refactor preserve behavior?" without thinking about #1138 semantics. PR-B is small and focused on the actual fix.

If a reviewer wants the staged-ir refactor backed out, reverting PR-A also reverts PR-B's fix — keeps the change atomic for rollback purposes while staying small for review.
