/**
 * BarefootJS - Client-Side Rendering
 *
 * CSR entry point for rendering components directly in the browser
 * without server-side rendering. Tree-shakeable: SSR-only apps
 * never import this module.
 */

import { BF_SCOPE } from '@barefootjs/shared'
import { setParentScopeId } from './component'
import { hydratedScopes } from './hydration-state'
import { getComponentInit } from './registry'
import { getTemplate, type TemplateFn } from './template'
import type { ComponentDef, InitFn } from './types'

/**
 * Render a component into a container element (CSR mode).
 *
 * Accepts either:
 * - A registered component name (string) — looks up `init` and `template` from the registry
 *   (the component must be registered first by importing its `.client.js` file).
 * - A `ComponentDef` — uses the def's `init` and `template` directly, bypassing the registry.
 *
 * Generates DOM from the template, mounts it into the container, and initializes it
 * with the given props. Unlike hydrate(), no pre-rendered HTML is required; the
 * container's content is replaced entirely.
 *
 * @param container - Target DOM element to render into
 * @param nameOrDef - Registered component name or a ComponentDef
 * @param props - Props to pass to the component
 *
 * @example
 * // By name (registry-based)
 * await import('/static/components/Counter.client.js')
 * render(document.getElementById('app')!, 'Counter', { initialCount: 0 })
 *
 * @example
 * // By ComponentDef (registry-free)
 * render(container, { name: 'MyNode', init, template }, { id: 'n1' })
 */
export function render(
  container: HTMLElement,
  nameOrDef: string | ComponentDef,
  props: Record<string, unknown> = {}
): void {
  let name: string
  let init: InitFn | undefined
  let template: TemplateFn | undefined

  if (typeof nameOrDef === 'string') {
    name = nameOrDef
    init = getComponentInit(name)
    template = getTemplate(name)

    if (!init || !template) {
      throw new Error(
        `[BarefootJS] Component "${name}" is not registered. ` +
        `Did you import its .client.js file before calling render()?`
      )
    }
  } else {
    init = nameOrDef.init
    template = nameOrDef.template
    name = nameOrDef.name || init.name?.replace(/^init/, '') || 'Component'

    if (!template) {
      throw new Error(
        '[BarefootJS] render(): ComponentDef requires a template function'
      )
    }
  }

  // Generate the parent scope ID up front so renderChild calls inside
  // template() can stamp `bf-s="~${parentScopeId}_sN"` on child scopes,
  // matching what the compiler-emitted `$c(__scope, 'sN')` lookup later
  // expects. Without this, renderChild falls back to `${childName}_${randomId}`
  // and `$c` returns null, silently breaking child hydration. (#1160)
  const scopeId = `${name}_${Math.random().toString(36).slice(2, 8)}`
  setParentScopeId(scopeId)
  let html: string
  try {
    html = template(props).trim()
  } finally {
    setParentScopeId(null)
  }

  const tpl = document.createElement('template')
  tpl.innerHTML = html
  const element = tpl.content.firstChild as HTMLElement

  if (!element) {
    throw new Error('[BarefootJS] render(): template returned empty HTML')
  }

  if (!element.getAttribute(BF_SCOPE)) {
    element.setAttribute(BF_SCOPE, scopeId)
  }

  container.innerHTML = ''
  container.appendChild(element)

  init(element, props)

  hydratedScopes.add(element)
}
