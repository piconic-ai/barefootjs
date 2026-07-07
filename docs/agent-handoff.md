# Agent Handoff: Operating Playbook for AI Sessions

This document is a handoff from prior AI sessions to future ones, regardless of
which model powers them. `CLAUDE.md` states the **rules** of this repo; this
document captures the **operating knowledge** — how to run long tasks to
completion, how to delegate to subagents effectively, and how to turn an
ambiguous request into a correct, verified change. Read `CLAUDE.md` first;
read this second; then start working.

The core principle behind everything below: **in this repo, almost every
question has a mechanical answer** (a CLI command, a spec section, a test
layer). Capability differences between models show up as guessing. Don't
guess — look it up, and the lookup paths are enumerated here.

## 1. Orientation checklist (first five minutes)

Do these before touching code, every session:

1. `git status` + `git log --oneline -10` — know your branch and what recently
   landed. Never develop on `main`; remote sessions get a designated
   `claude/...` branch.
2. `bun run bf --help` — the `bf` CLI is the first reference for component
   APIs, framework guides, and signal graphs. Reading source before trying the
   CLI is the #1 time-waster.
3. Skim the request and classify it (section 3) before planning anything.
4. If the task touches a stateful component (`"use client"`), run
   `bun run bf debug graph <component>` — required by `CLAUDE.md`, and it
   genuinely prevents wrong mental models of the reactive structure.

## 2. Where truth lives (source-of-truth map)

| Question | Look here — not in your memory |
|---|---|
| Component props / usage / a11y | `bun run bf docs <component>` |
| Framework concepts (signals, compiler constraints) | `bun run bf guide <topic>` |
| Reactive structure of a component | `bf debug graph` / `trace` / `signals` / `events` |
| Pipeline, IR schema, transformation rules, error codes | `spec/compiler.md` |
| Which test layer to write | `spec/testing.md` → "Decision Guide" + "Anti-Patterns" |
| Adapter design rules ("constitution") and roadmap | `spec/adapter-architecture.md` |
| Router / template helpers | `spec/router.md`, `spec/template-helpers.md` |
| Known compiler/adapter/runtime gaps | GitHub label `known-limitation` (the label URL is the source of truth) |
| User-facing docs (what we promise users) | `docs/core/` |

Rules of thumb:

- If `bf` output is insufficient (class-composition internals, `...props`
  spread behavior), *then* read source — starting with the files named in
  `CLAUDE.md`'s Architecture section.
- Before concluding "this is a bug," search issues for the `known-limitation`
  label and the adapter-internal `skipJsx` / `skipFixtures` /
  `expectedDiagnostics` declarations — the gap may be tracked and intentional.
- There are 11 template adapters under `packages/adapter-*` plus the shared
  `packages/adapter-tests` harness. Anything that changes template output must
  be reasoned about across **all** of them, not just hono/go-template/erb.

## 3. Turning ambiguous requests into concrete work

Most requests arrive underspecified. The failure mode to avoid is picking an
interpretation silently and building the wrong thing at length. Process:

1. **Classify the request.**
   - *Question / "why does X happen?"* → the deliverable is an investigation
     and a written answer. Do not fix anything until asked.
   - *Problem report* ("X looks broken") → reproduce first. The reproduction
     picks the test layer, which picks the fix location.
   - *Change request* → proceed to step 2.
2. **Restate scope in one sentence** at the start of your work (which
   packages, which adapters, which test layers will prove it). If you cannot
   write that sentence, you don't understand the task yet — investigate more.
3. **Resolve ambiguity with repo defaults before asking the user.** Most
   "which way should I do this?" questions are already answered:
   - Where does the fix go? Hydration → `packages/jsx/`; template HTML → the
     adapter + a conformance fixture; runtime behavior → `packages/client/`.
   - Which test? `CLAUDE.md`'s quick decision guide and
     `spec/testing.md` §"Decision Guide" are nearly total functions from
     change-type to test layer.
   - How to extend output for a tool? Never via compiler hooks; post-process
     with a TS AST walk, or use the `LoweringPlugin` registry for structural
     lowering (details in `CLAUDE.md`).
4. **Ask the user only for genuine forks** — scope changes, destructive or
   irreversible actions, or a reviewer comment readable two ways. When you
   ask, include enough context that the user can answer without scrolling
   back. Everything else: pick the repo-consistent default, state the
   assumption explicitly in your report, and keep moving.

## 4. Long-horizon task playbook

Large tasks (multi-package changes, adapter sweeps, migrations) fail from
losing state, not from any single hard step. Work so that the task survives
interruption, context compaction, or a model swap mid-flight:

- **Phase the work red→green.** For each unit: write/adjust the test at the
  correct layer (red) → implement → re-run (green) → move on. The component
  workflow in `CLAUDE.md` (bf docs → IR test → edit → re-run → maybe E2E) is
  the template; generalize it to compiler work with `packages/jsx/src/__tests__/`.
- **Commit at phase boundaries** with descriptive messages. Commits are your
  durable memory: a future session (or post-compaction you) reconstructs state
  from `git log` faster than from any scratch notes. Never leave hours of
  work uncommitted.
- **Keep a live task list** (the harness todo/task tools if available,
  otherwise a checklist in the PR description). Update it as you go; on wake
  or resume, reconcile the list against `git log` before doing anything.
- **Don't stop at the first green test.** Definition of done here is:
  correct-layer tests pass, adapter conformance is considered (all adapters,
  not three), `bun run lint` (biome) passes, and behavior claims were
  actually exercised — not inferred from a successful compile.
- **Fixed-point loops need a terminal state.** "Make CI green" means:
  diagnose → fix → push → wait for the event → re-diagnose. One round is not
  the task; equally, if several rounds make no progress, report the diagnosis
  and where you're stuck rather than looping silently.
- **Report honestly.** If a test fails, say so with output. If a step was
  skipped, say that. An accurate "80% done, blocked on X" handoff is worth
  more than a confident wrong "done."

## 5. Delegating to subagents

Subagents are how one session covers more ground than one context window.
They pay off on this repo specifically because the codebase is wide (23
packages, 11 adapters) and shallow-coupled. Patterns that have worked:

- **Fan out searches, keep conclusions.** For "where is X handled across the
  repo?" questions, launch read-only Explore agents rather than paging
  through files yourself — you want the conclusion, not the file dumps in
  your context. Launch independent searches in parallel, in one message.
- **Per-adapter fan-out.** Anything touching template output or the adapter
  API has an embarrassingly parallel shape: one agent per adapter to audit or
  apply the mechanical part, then *you* integrate. Give each agent the same
  precise brief (what to change, what NOT to touch, which fixture proves it)
  and require structured output you can diff.
- **Adversarial verification.** For audits/reviews, findings from a single
  pass include plausible-but-wrong items. Spawn independent verifiers
  prompted to *refute* each finding before you report it. Report only what
  survives.
- **Orchestrator discipline.** The main session holds the plan and the
  integration; subagents hold the details. Don't delegate judgment calls that
  need whole-task context (API design, scope decisions) — delegate bounded,
  verifiable work. If a subagent's report drives an edit, spot-check it
  against the real file before acting; agents' summaries can be subtly stale.
- **Parallel mutation needs isolation.** Agents editing files concurrently in
  one worktree will conflict; use worktree isolation for parallel writers, or
  serialize the writes and parallelize only the reads.
- **Cost sanity.** One agent per adapter is 11 agents — fine. One agent per
  fixture file is hundreds — batch by adapter instead. Prefer a pipeline
  (each item flows through stages independently) over barriers that make the
  fastest agent wait for the slowest.

## 6. Repo-specific traps (the expensive ones)

These are the mistakes that cost the most time in past sessions. Full detail
in `CLAUDE.md`; this is the ranked recap:

1. **Parsing imports (or any JS/TS) with regex.** Banned. Use
   `ir.metadata.imports` for source files and a TS AST walk for compiled
   client JS. Precedents: `packages/cli/src/lib/resolve-imports.ts`,
   `packages/jsx/src/combine-client-js.ts`.
2. **Adding a compiler hook to rewrite output for one tool.** Banned. Tools
   post-process; structural lowering goes through the `LoweringPlugin`
   registry returning backend-neutral IR — never a raw output string, never a
   per-adapter recognition branch.
3. **E2E tests for static-only changes** (attributes/classes/ARIA). That is
   the documented anti-pattern; those belong in Component IR tests.
4. **Misreading `renderToTest` semantics.** It models the component compiled
   with *no incoming props*: variant class maps union all cases at once,
   literal destructure defaults resolve, unresolvable interpolations are
   dropped from `.classes`. Assert per-variant tokens with `toContain`;
   assert concrete single-variant output at the adapter conformance layer.
5. **UnoCSS surprises.** Alpha modifiers don't work with CSS variables; new
   file locations must be added to the UnoCSS scanning config or classes
   silently vanish (see the `include integrations globs` fix in git history).
6. **`npm` reflexes.** This repo uses `bun` (`bun install`, `bun test`,
   `bun run bf ...`).
7. **Skipping `bf debug graph` before editing a `"use client"` component.**
   Required, and skipping it is how reactive regressions get written.

## 7. Git, commits, and PRs

- Develop on the designated `claude/...` branch; push with
  `git push -u origin <branch>`; open a **draft** PR if none exists.
- **External PRs are not accepted** (see `CONTRIBUTING.md`) — community
  contributions happen through issues; maintainer/AI sessions land the code.
  Don't advise outsiders to open PRs.
- Every commit ends with `Co-authored-by:` trailers as the final lines: the
  implementing AI first (its model name), then other AI/human collaborators.
  On remote sessions, identify the human collaborator from
  `git log --format='%an <%ae>'` per `CLAUDE.md` before the first commit.
- Commit messages follow the conventional style visible in `git log`
  (`feat(scope):`, `fix(site):`, `chore:`, `ci:`, `release:`).

## 8. Handoff etiquette (leaving state for the next session)

When you end a session mid-task, leave the next agent what you'd want:

- Push the branch, even if incomplete — with a PR description stating what
  is done, what is not, and what you'd do next.
- Record surprising discoveries (a flaky test, an undocumented constraint) in
  the PR thread or an issue — not only in your ephemeral context.
- If you changed your interpretation of the task mid-way, write down the new
  interpretation and why. The next session should never have to re-derive a
  decision you already made.
