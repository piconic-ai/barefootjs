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

/** Unique interactive descendants (root included) to exercise in the auto scenario. */
function collectClickables(root: HTMLElement): HTMLElement[] {
  const set = new Set<HTMLElement>()
  const SELECTOR = 'button, a, [role="button"], [onclick]'
  if (root.matches(SELECTOR)) set.add(root)
  for (const el of Array.from(root.querySelectorAll<HTMLElement>(SELECTOR))) set.add(el)
  // Fall back to the root itself so a wrapper component still gets one event.
  return set.size > 0 ? [...set] : [root]
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

    const rec = rt.createRecordingSink()
    rt.setProfilerSink(rec.sink)
    try {
      const el = rt.createComponent(name, {})
      document.body.appendChild(el)
      const targets = collectClickables(el)
      for (const t of targets) {
        t.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true }))
      }
      return { events: rec.events, rootTag: el.tagName.toLowerCase(), fired: targets.length }
    } finally {
      rt.setProfilerSink(null)
    }
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}
