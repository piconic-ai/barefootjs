/**
 * wiring-check — reactive-WIRING analysis of the user's `src/*.tsx` components.
 *
 * The playground's existing validator (agent.ts `validateReply`) does STATIC
 * checks: registry props/variants, import paths, server.tsx structure. It does
 * NOT look at REACTIVITY. This module adds that missing layer, reusing the exact
 * static analysis `bf debug graph` uses — `buildComponentGraph` from
 * `@barefootjs/jsx` (pure JS: compiles internally, no CLI, no fs). It is
 * browser-safe (same contract as build-to-memory) so it runs inside the browser
 * compile worker, where `@barefootjs/jsx` is already bundled.
 *
 * WHAT IT DETECTS (the reliable, low-false-positive subset — each verified
 * empirically against the analyzer's output before shipping):
 *
 *   1. Signal with no initial value — `createSignal()` / `createSignal<T[]>()`
 *      with no argument. The graph reports such a signal with an EMPTY
 *      `initialValue` (""), while every legitimate initial — `0`, `''`, `false`,
 *      `[]`, `{}`, `props.x ?? 0` — yields a non-empty string. So `initialValue
 *      === ''` is an exact, false-positive-free signal of the bug. This is the
 *      classic AI mistake: `const [items] = createSignal<T[]>()` then
 *      `items().map(...)` → `undefined.map` throws at render/hydration.
 *
 * WHAT IT DELIBERATELY SKIPS (verified false-positive-prone — NOT shipped):
 *
 *   - "Interactive element whose handler calls no setter": a handler that calls
 *     a PARENT callback (`props.onRemove()`), navigates (`location.href = …`),
 *     or runs any deliberate side effect legitimately calls no LOCAL setter, yet
 *     the event summary reports `setterCalls: []` for all of them. Indistinguish-
 *     able from a genuinely-dead button, so flagging it would be noisy.
 *   - "Derived value that should be createMemo": an inline `const d = n() * 2`
 *     does not even surface as a distinct binding in the graph (it inlines), so
 *     the analyzer has nothing clean to report.
 *   - "Declared signal with zero consumers (dead state)": a signal written only
 *     from a `createEffect` body, or read only inside an effect, shows zero DOM
 *     consumers AND its setter is absent from the EVENT summary (effects are not
 *     events) — so it looks dead but is live. Too noisy to ship.
 *
 * If a future check proves reliable, add it here behind the same empirical bar.
 */

import { buildComponentGraph, listComponentFunctions } from '@barefootjs/jsx'

/** One reactive-wiring problem found in a user component. */
export interface WiringIssue {
  /** The source file the issue is in (e.g. `src/Todos.tsx`). */
  path: string
  /** The component the issue is in. */
  component: string
  /** A clear, actionable message: what is wrong + the concrete fix. */
  message: string
}

/**
 * Thrown by the compile pipeline when a wiring issue ALSO breaks compilation.
 *
 * Why this exists: empirically, a no-initial-value signal makes the compiler
 * emit a syntactically-broken SSR template (`const name = () =>` with nothing
 * after the arrow), so the downstream esbuild transpile throws a cryptic
 * `Unexpected "return"` BEFORE any result is produced. Rather than let that
 * opaque error reach the user, the pipeline runs this analysis FIRST and throws
 * this typed error carrying the structured, actionable issues. The compile
 * worker reports them as `wiringIssues` even on a failed (`ok: false`) result,
 * so the same auto-repair / warn paths apply as for a non-fatal issue.
 */
export class WiringIssuesError extends Error {
  readonly issues: WiringIssue[]
  constructor(issues: WiringIssue[]) {
    super('Reactive-wiring issues:\n' + formatWiringIssues(issues))
    this.name = 'WiringIssuesError'
    this.issues = issues
  }
}

/**
 * `createSignal()` with no initial value yields this empty `initialValue` in the
 * graph. Every real initial (`0`, `''`, `false`, `[]`, `{}`, an expression …)
 * produces a non-empty string, so an exact-empty test is false-positive-free.
 */
function hasNoInitialValue(initialValue: string): boolean {
  return initialValue.trim() === ''
}

/**
 * Infer the concrete fix for a no-initial-value signal from how it is consumed.
 * A signal consumed by a `loop` (`{items().map(...)}`) crashes on `undefined.map`
 * unless seeded with `[]`; recommend exactly that. Otherwise give the generic
 * "supply an initial value" guidance with the common seeds.
 */
function suggestInitialFor(signalName: string, consumers: string[]): string {
  const feedsLoop = consumers.some((c) => c.includes('loop'))
  if (feedsLoop) {
    return (
      `signal "${signalName}" has no initial value but is rendered with .map() — ` +
      `seed it with an empty array, e.g. createSignal<T[]>([]). ` +
      `createSignal<T[]>() leaves it undefined and .map() throws at render.`
    )
  }
  return (
    `signal "${signalName}" has no initial value — give createSignal a real ` +
    `initial argument: a list createSignal<T[]>([]), text createSignal(''), ` +
    `number createSignal(0), object createSignal({}). createSignal() leaves it ` +
    `undefined, which crashes any read that assumes a value.`
  )
}

/**
 * Analyze ONE component source for reactive-wiring issues. `filePath` is used
 * both for diagnostics and to scope `listComponentFunctions` to this module.
 * Returns the issues found (empty = clean). Pure, deterministic, no fs/CLI.
 */
export function checkComponentWiring(source: string, filePath: string): WiringIssue[] {
  const issues: WiringIssue[] = []

  // A file may export several component functions (e.g. a page plus a small
  // helper component). Analyze each so an issue in any of them is caught.
  let componentNames: string[]
  try {
    componentNames = listComponentFunctions(source, filePath)
  } catch {
    // A parse failure here is not a WIRING issue — the compile step reports it
    // as a hard error with a precise message. Skip silently.
    return issues
  }
  if (componentNames.length === 0) return issues

  for (const componentName of componentNames) {
    let graph
    try {
      graph = buildComponentGraph(source, filePath, componentName)
    } catch {
      continue
    }

    for (const signal of graph.signals) {
      if (hasNoInitialValue(signal.initialValue)) {
        issues.push({
          path: filePath,
          component: componentName,
          message: suggestInitialFor(signal.name, signal.consumers),
        })
      }
    }
  }

  return issues
}

/**
 * Run the wiring check over every `src/*.tsx` file in an app's file set (the
 * same key shape `compileAppCore` consumes). Non-`src/*.tsx` files (server.tsx,
 * renderer.tsx, …) are skipped — they hold no barefoot components. Returns a
 * flat list of issues across all components, in deterministic file order.
 */
export function checkAppWiring(files: Record<string, string>): WiringIssue[] {
  const issues: WiringIssue[] = []
  const componentPaths = Object.keys(files)
    .filter((p) => /^src\/.+\.tsx$/.test(p))
    .sort()
  for (const path of componentPaths) {
    issues.push(...checkComponentWiring(files[path], path))
  }
  return issues
}

/**
 * Format wiring issues as a single human / model-readable string. Used both for
 * the human-Run warning (toast/chat) and as the AI repair prompt body. Each line
 * is `<path>: <component>.tsx wiring — <message>` so the file + component are
 * always explicit.
 */
export function formatWiringIssues(issues: WiringIssue[]): string {
  return issues
    .map((i) => `${i.path}: ${i.message}`)
    .join('\n')
}
