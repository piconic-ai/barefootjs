// Scenario driver for `bf debug profile --scenario` (#1690, SR2/SR7).
//
// Drives a component's *instrumented* build through a real DOM and records the
// reactive event stream the analyses consume. The "auto" scenario mounts the
// component and fires every interactive element once — a zero-config profile
// that needs no scenario file, so a component can be profiled the moment it has
// a handler.
//
// happy-dom + the client runtime are imported lazily, so the static modes
// (`bf debug profile <component>` / `--diff`) carry no DOM dependency.

import { writeFileSync, mkdtempSync, rmSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import type { ProfilerEvent } from '@barefootjs/shared'

export interface ScenarioResult {
  events: ProfilerEvent[]
  /** Tag of the mounted root element. */
  rootTag: string
  /** Interactive elements the auto scenario fired. */
  fired: number
}

/** Component names the compiled client JS registers, in emission order. */
function registeredNames(clientJs: string): string[] {
  const names: string[] = []
  for (const m of clientJs.matchAll(/hydrate\(\s*['"]([A-Za-z_]\w*)['"]/g)) names.push(m[1])
  return names
}

/**
 * Pick which registered component to mount. Prefer the requested name (exact,
 * then case-insensitive — `collapsible` → `Collapsible`); otherwise the first
 * registered component (the file's primary export).
 */
function pickMountName(requested: string | undefined, registered: string[]): string | undefined {
  if (registered.length === 0) return undefined
  if (requested) {
    const exact = registered.find(n => n === requested)
    if (exact) return exact
    const ci = registered.find(n => n.toLowerCase() === requested.toLowerCase())
    if (ci) return ci
  }
  return registered[0]
}

/** A handler the IR knows about: which slot it's on and which event fires it. */
interface HandlerSlot {
  slotId: string
  eventName: string
}

/** Build a bubbling DOM event of the right class for `eventName`. */
function makeEvent(eventName: string): Event {
  if (/^(click|dblclick|mouse|pointer|contextmenu)/.test(eventName)) {
    return new window.MouseEvent(eventName, { bubbles: true, cancelable: true })
  }
  if (/^key/.test(eventName)) {
    return new window.KeyboardEvent(eventName, { bubbles: true, cancelable: true })
  }
  return new window.Event(eventName, { bubbles: true, cancelable: true })
}

/**
 * Fire every handler the IR knows about (`graph.domBindings` of type `event`)
 * on its `[bf="<slotId>"]` element(s) — including list items (delegated) and
 * branch handlers — so coverage reflects real interactions, not just buttons.
 * Falls back to clicking buttons/links when no handler slots resolve.
 */
function fireHandlers(root: HTMLElement, handlers: HandlerSlot[]): number {
  let fired = 0
  const seen = new Set<HTMLElement>()
  for (const h of handlers) {
    const targets: HTMLElement[] = []
    if (root.matches(`[bf="${h.slotId}"]`)) targets.push(root)
    for (const el of Array.from(root.querySelectorAll<HTMLElement>(`[bf="${h.slotId}"]`))) targets.push(el)
    for (const el of targets) {
      el.dispatchEvent(makeEvent(h.eventName))
      seen.add(el)
      fired++
    }
  }
  if (fired === 0) {
    // No IR-resolved targets in the live DOM (e.g. wrapper component) — fall
    // back to the generic clickable sweep.
    const SELECTOR = 'button, a, [role="button"], [onclick]'
    const set = new Set<HTMLElement>()
    if (root.matches(SELECTOR)) set.add(root)
    for (const el of Array.from(root.querySelectorAll<HTMLElement>(SELECTOR))) set.add(el)
    for (const el of (set.size > 0 ? [...set] : [root])) {
      el.dispatchEvent(makeEvent('click'))
      fired++
    }
  }
  return fired
}

/**
 * Compile `source` in profile mode, mount it in happy-dom, fire every
 * interactive element once, and return the recorded event stream (SR2).
 */
export async function runAutoScenario(
  source: string,
  filePath: string,
  componentName?: string,
): Promise<ScenarioResult> {
  // 1. DOM — lazy so static modes don't pay for it.
  const { GlobalRegistrator } = await import('@happy-dom/global-registrator')
  if (typeof (globalThis as { window?: unknown }).window === 'undefined') {
    GlobalRegistrator.register()
  }

  // 2. Instrumented client JS (adapter-independent — testAdapter is enough).
  const { compileJSX, testAdapter } = await import('@barefootjs/jsx')
  const out = compileJSX(source, filePath, { adapter: testAdapter, profile: true })
  const clientJs = out.files.find((f: { type: string }) => f.type === 'clientJs')?.content as
    | string
    | undefined
  if (!clientJs) {
    throw new Error(
      'No client JS emitted — the component is stateless (no signals/handlers), so there is nothing to profile dynamically. Use the static budget instead.',
    )
  }

  // 3. Rewrite the runtime import to an absolute URL so the temp module (which
  //    sits outside any node_modules) resolves it, and so the sink we install
  //    is the *same* physical reactive module the component imports. Use the
  //    bundler's resolver (`import.meta.resolve`) — Node's `createRequire`
  //    doesn't see workspace links here.
  const runtimePath = import.meta.resolve('@barefootjs/client/runtime')
  const rewritten = clientJs
    .replace(/from\s+['"]@barefootjs\/client\/runtime['"]/g, `from ${JSON.stringify(runtimePath)}`)
    .replace(/^import '\/\* @bf-child:\w+ \*\/'\n/gm, '')

  const dir = mkdtempSync(join(tmpdir(), 'bf-profile-'))
  const file = join(dir, 'component.mjs')
  writeFileSync(file, rewritten)

  try {
    await import(file) // registers the component via hydrate(...)
    const rt = (await import(runtimePath)) as {
      createRecordingSink: () => { sink: unknown; events: ProfilerEvent[] }
      setProfilerSink: (s: unknown) => void
      createComponent: (name: string, props: Record<string, unknown>) => HTMLElement
    }

    const name = pickMountName(componentName, registeredNames(clientJs))
    if (!name) throw new Error('Could not determine the component name to mount (none registered).')

    // Handler slots the IR knows about (slotId + event), so the auto scenario
    // fires real interactions — list items, branch handlers — not just buttons.
    let handlers: HandlerSlot[] = []
    try {
      const { graph } = (await import('@barefootjs/jsx')).buildComponentAnalysis(source, filePath, name)
      handlers = graph.domBindings
        .filter((b: { type: string }) => b.type === 'event')
        .map((b: { slotId: string; label: string }) => ({
          slotId: b.slotId,
          eventName: b.label.match(/^(\w+)\s+handler/)?.[1] ?? 'click',
        }))
    } catch {
      handlers = []
    }

    const rec = rt.createRecordingSink()
    rt.setProfilerSink(rec.sink)
    try {
      const el = rt.createComponent(name, {})
      document.body.appendChild(el)
      const fired = fireHandlers(el, handlers)
      return { events: rec.events, rootTag: el.tagName.toLowerCase(), fired }
    } finally {
      rt.setProfilerSink(null)
    }
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}
