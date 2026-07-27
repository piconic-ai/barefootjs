/**
 * Claim-plan conformance (slot unification, `spec/slot-unification.md` §5
 * Step B, spec item (d)).
 *
 * The compiler emits a `ClaimPlan` — a `SlotSpec[]` literal (`{ id, kind,
 * path, markerless? }`) — into each component's client JS, passed to
 * `lazySlots`/`claimSlots` (`@barefootjs/client/runtime/claim-slots.ts`).
 * That plan is a claim ABOUT the adapter's own SSR output: "walk `path`
 * child indices from the claim root and you will find slot `id`'s anchor".
 * Nine independent adapters render nine independent template languages from
 * the same IR; nothing before this suite mechanically checked that an
 * adapter's ACTUAL rendered DOM matches the shape its OWN compiled claim
 * plan promises.
 *
 * This suite closes that gap: for each fixture, extract the claim plan(s)
 * from the fixture's compiled client JS (a `typescript` AST walk over the
 * `lazySlots(root, [...])` / `claimSlots(root, [...])` call sites — never
 * regex, per CLAUDE.md's parsing rule: a `SlotSpec` literal is JS/TS syntax,
 * not text to pattern-match), render the SAME fixture through the adapter
 * under test to get real SSR HTML, parse that HTML into a DOM (happy-dom),
 * and resolve every STATICALLY-verifiable path (a literal `number[]`, not a
 * `pathExpr` conditional — see `ClaimSlotSpec.pathExpr`'s docstring, which
 * is valid only on one specific CSR fresh-clone branch and has no single
 * SSR-DOM shape to check) against that DOM:
 *
 *   - `markerless` unset, non-empty `path`: the path must land on a Comment
 *     node whose data is exactly `bf:<id>` — the anchor every non-elided
 *     'text'/'markup' slot claims against.
 *   - `markerless: true`: `kind` must be `'text'` (the compiler must never
 *     mark a `'markup'` slot markerless — spec §3(b) case (ii)), the
 *     rendered HTML must contain NO `<!--bf:<id>-->` marker anywhere (the
 *     whole point of eliding it), and the path's PARENT (all but the last
 *     index) must resolve to a real element — the position itself may be
 *     empty (nothing rendered there yet) or hold the slot's own Text node,
 *     but must never coincide with a DIFFERENT slot's `bf:` marker (which
 *     would mean the path landed on the wrong node entirely).
 *   - an empty `path` (`[]`) is the documented "cannot be statically
 *     pathed" marker-scan-fallback case (`spec/slot-unification.md` §5-A3)
 *     — there is no fixed anchor to check, so this suite skips it.
 */

import { describe, test, expect } from 'bun:test'
import * as ts from 'typescript'
import { compileJSX } from '@barefootjs/jsx'
import type { TemplateAdapter } from '@barefootjs/jsx'
import { Window, type Node as HappyNode, type Element as HappyElement, type Comment as HappyComment } from 'happy-dom'
import { BF_SCOPE } from '@barefootjs/shared'
import { jsxFixtures } from '../fixtures'
import type { RenderOptions } from './jsx-runner'

const BF_SCOPE_ATTR = BF_SCOPE

// A private, unregistered happy-dom `Window` — deliberately NOT
// `@happy-dom/global-registrator`. That helper assigns `window`/`document`/…
// onto `globalThis` for the rest of the process, and this module is imported
// by every adapter package's single conformance entry point
// (`runAdapterConformanceTests` → `runClaimPlanConformance`), all of which
// share ONE `bun test` process with that adapter's own unrelated suites.
// `@barefootjs/client`'s server/client branches gate on `typeof window ===
// 'undefined'` (see `reactive.ts`'s `createEnvSignal`) — a global register
// here flips that check for every OTHER test file that runs afterward in the
// same process, e.g. `packages/adapter-hono/src/__tests__/request-env.test.tsx`
// silently takes the browser branch instead of resolving
// `runWithRequestEnv`'s AsyncLocalStorage-scoped query. An isolated `Window`
// instance parses the same HTML without ever touching `globalThis`.
const parseDocument = new Window().document

interface ExtractedSlotSpec {
  id: string
  kind: 'text' | 'markup'
  /** `null` when `path` wasn't a plain numeric-literal array (e.g. a
   *  `pathExpr` conditional) — not statically verifiable here. */
  path: readonly number[] | null
  markerless: boolean
}

/**
 * Structural (AST, not regex) extraction of every `SlotSpec` literal passed
 * to `lazySlots(...)` / `claimSlots(...)` anywhere in `clientJs`. Mirrors
 * the repo's established "parse compiled client JS with `typescript`, never
 * regex" pattern (`resolve-imports.ts`, `combine-client-js.ts`).
 */
export function extractClaimPlanSpecs(clientJs: string): ExtractedSlotSpec[] {
  const sourceFile = ts.createSourceFile('client.js', clientJs, ts.ScriptTarget.Latest, true)
  const out: ExtractedSlotSpec[] = []

  const visit = (node: ts.Node): void => {
    if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      (node.expression.text === 'lazySlots' || node.expression.text === 'claimSlots') &&
      node.arguments.length >= 2 &&
      ts.isArrayLiteralExpression(node.arguments[1])
    ) {
      for (const el of node.arguments[1].elements) {
        const spec = readSlotSpecLiteral(el)
        if (spec) out.push(spec)
      }
    }
    ts.forEachChild(node, visit)
  }
  visit(sourceFile)
  return out
}

function readSlotSpecLiteral(node: ts.Expression): ExtractedSlotSpec | null {
  if (!ts.isObjectLiteralExpression(node)) return null
  let id: string | null = null
  let kind: 'text' | 'markup' | null = null
  let path: readonly number[] | null = null
  let markerless = false

  for (const prop of node.properties) {
    if (!ts.isPropertyAssignment(prop) || !ts.isIdentifier(prop.name)) continue
    const key = prop.name.text
    if (key === 'id' && ts.isStringLiteral(prop.initializer)) {
      id = prop.initializer.text
    } else if (key === 'kind' && ts.isStringLiteral(prop.initializer)) {
      if (prop.initializer.text === 'text' || prop.initializer.text === 'markup') {
        kind = prop.initializer.text
      }
    } else if (key === 'path' && ts.isArrayLiteralExpression(prop.initializer)) {
      const nums: number[] = []
      let allNumeric = true
      for (const e of prop.initializer.elements) {
        if (ts.isNumericLiteral(e)) {
          nums.push(Number(e.text))
        } else {
          allNumeric = false
          break
        }
      }
      path = allNumeric ? nums : null
    } else if (key === 'markerless' && prop.initializer.kind === ts.SyntaxKind.TrueKeyword) {
      markerless = true
    }
  }
  if (id === null || kind === null) return null
  return { id, kind, path, markerless }
}

interface AnchorCheckResult {
  ok: boolean
  reason?: string
}

/** Resolve `path` against `root`'s `childNodes`, per-index, exactly like
 *  `claim-slots.ts`'s `resolvePath` — no node-kind assumption mid-walk. */
function resolvePath(root: HappyNode, path: readonly number[]): HappyNode | null {
  let node: HappyNode = root
  for (const index of path) {
    const child = node.childNodes[index]
    if (!child) return null
    node = child
  }
  return node
}

function checkAnchor(root: HappyElement, spec: ExtractedSlotSpec, html: string): AnchorCheckResult {
  if (spec.path === null) return { ok: true } // not statically verifiable — see module docstring
  if (spec.path.length === 0) return { ok: true } // deliberate scan-fallback case, nothing to check

  if (spec.markerless) {
    if (spec.kind !== 'text') {
      return { ok: false, reason: `markerless slot ${spec.id} has kind '${spec.kind}' — 'markup' must never be markerless` }
    }
    if (html.includes(`<!--bf:${spec.id}-->`)) {
      return { ok: false, reason: `markerless slot ${spec.id} still has a <!--bf:${spec.id}--> marker in the rendered HTML` }
    }
    const parentPath = spec.path.slice(0, -1)
    const idx = spec.path[spec.path.length - 1]
    const parent = resolvePath(root, parentPath)
    if (!parent) {
      return { ok: false, reason: `markerless slot ${spec.id}'s path parent did not resolve in the rendered DOM` }
    }
    const existing = parent.childNodes[idx] as HappyComment | undefined
    if (existing && existing.nodeType === 3 /* TEXT_NODE */) return { ok: true } // adopts the rendered value
    if (!existing) return { ok: true } // append point — SSR rendered this slot empty
    if (existing.nodeType === 8 /* COMMENT_NODE */ && (existing.nodeValue ?? '').startsWith('bf:')) {
      return { ok: false, reason: `markerless slot ${spec.id}'s path landed on a DIFFERENT slot's marker (${existing.nodeValue})` }
    }
    return { ok: true } // some other static sibling occupies the append point — fine, insertBefore targets it
  }

  const anchor = resolvePath(root, spec.path)
  if (!anchor || anchor.nodeType !== 8 /* COMMENT_NODE */ || anchor.nodeValue !== `bf:${spec.id}`) {
    return {
      ok: false,
      reason: `slot ${spec.id}'s path did not resolve to its own <!--bf:${spec.id}--> marker (found ${anchor ? `nodeType=${anchor.nodeType} value=${JSON.stringify((anchor as HappyComment).nodeValue)}` : 'nothing'})`,
    }
  }
  return { ok: true }
}

export interface RunClaimPlanConformanceOptions {
  name: string
  factory: () => TemplateAdapter
  render: (opts: RenderOptions) => Promise<string>
  onRenderError?: (err: Error, fixtureId: string) => boolean
  /** Fixture ids this adapter is consciously skipping (paired with a
   *  comment at the call site naming the divergence and its issue). */
  skipFixtures?: ReadonlySet<string>
}

export function runClaimPlanConformance(opts: RunClaimPlanConformanceOptions): void {
  describe(`[${opts.name}] claim-plan conformance (slot unification Step B, spec item (d))`, () => {
    for (const fixture of jsxFixtures) {
      const skipped = opts.skipFixtures?.has(fixture.id) ?? false
      const t = skipped ? test.skip : test
      t(`${fixture.id}: claim-plan paths resolve against real SSR DOM`, async () => {
        const clientJs = compileJSX(fixture.source, `${fixture.id}.tsx`, { adapter: opts.factory() })
          .files.find(f => f.type === 'clientJs')?.content
        if (!clientJs) return // stateless fixture — no claim plan to check

        const specs = extractClaimPlanSpecs(clientJs)
        if (specs.length === 0) return

        let html: string
        try {
          html = await opts.render({
            source: fixture.source,
            adapter: opts.factory(),
            props: fixture.props !== undefined ? structuredClone(fixture.props) : undefined,
            components: fixture.components,
            componentModules: fixture.componentModules,
            componentName: fixture.componentName,
          })
        } catch (err) {
          if (opts.onRenderError?.(err as Error, fixture.id)) return
          throw err
        }

        const host = parseDocument.createElement('div')
        host.innerHTML = html
        // Claim-plan paths are relative to `__scope` (`init<Name>(__scope,
        // …)`, `generate-init.ts`) — the element CARRYING `bf-s`, not this
        // parsing wrapper. The outermost such element in document order is
        // the component's own root scope for every fixture this suite's
        // extraction actually resolves paths for (see module docstring —
        // MY elision target never crosses into a child component's own
        // subtree, so its paths are always relative to the OUTER scope).
        const root = (host.querySelector(`[${BF_SCOPE_ATTR}]`) ?? host.firstElementChild ?? host) as HappyElement
        const results = specs.map(spec => ({ spec, result: checkAnchor(root, spec, html) }))
        const failures = results.filter(r => !r.result.ok)
        expect(failures.map(f => f.result.reason)).toEqual([])
      })
    }
  })
}
