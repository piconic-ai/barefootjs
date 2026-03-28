/**
 * BarefootJS - Component Creation
 *
 * Functions for dynamically creating component instances at runtime.
 * Used by reconcileList() when rendering components in loops.
 */

import { getTemplate } from './template'
import { getComponentInit } from './registry'
import { hydratedScopes } from './hydration-state'
import { BF_SCOPE } from './attrs'
import type { ComponentDef } from './types'

// WeakMap to store props update functions for each component element
// This allows reconcileList to update props when an element is reused
const propsUpdateMap = new WeakMap<HTMLElement, (props: Record<string, unknown>) => void>()

// WeakMap to store the current props for each component element
// Used to pass props to existing elements when they are reused
const propsMap = new WeakMap<HTMLElement, Record<string, unknown>>()


/**
 * Create a component instance with DOM element and initialized state.
 *
 * This function:
 * 1. Gets the template function for the component
 * 2. Generates HTML from props using the template
 * 3. Creates DOM element from HTML
 * 4. Sets scope ID and key attributes
 * 5. Initializes the component (attaches event handlers, sets up effects)
 *
 * @param name - Component name (e.g., 'TodoItem')
 * @param props - Props to pass to the component
 * @param key - Optional key for list reconciliation
 * @returns Created DOM element
 *
 * @example
 * const el = createComponent('TodoItem', {
 *   todo: { id: 1, text: 'Buy milk', done: false },
 *   onDelete: () => handleDelete(1)
 * }, 1)
 */
/**
 * Create a component instance from a string name (SSR mode, uses registry)
 * or from a ComponentDef (CSR mode, no registry needed).
 */
export function createComponent(
  nameOrDef: string | ComponentDef,
  props: Record<string, unknown>,
  key?: string | number
): HTMLElement {
  // ComponentDef mode: use def directly instead of registry lookup
  if (typeof nameOrDef !== 'string') {
    return createComponentFromDef(nameOrDef, props, key)
  }

  const name = nameOrDef

  // 1. Get template function
  const templateFn = getTemplate(name)
  if (!templateFn) {
    console.warn(`[BarefootJS] Template not found for component: ${name}`)
    return createPlaceholder(name, key)
  }

  // 2. Evaluate children from props getter
  const childrenDescriptor = Object.getOwnPropertyDescriptor(props, 'children')
  const children = childrenDescriptor && typeof childrenDescriptor.get === 'function'
    ? childrenDescriptor.get()
    : props.children

  // 3. Generate HTML from props
  // When children contain DOM elements, pass empty children for shell HTML
  const unwrappedProps = unwrapPropsForTemplate(props)
  const hasDomChildren = children != null && hasDomElements(children)
  if (hasDomChildren) {
    unwrappedProps.children = ''
  }
  const html = templateFn(unwrappedProps)

  // 4. Create DOM element
  const template = document.createElement('template')
  template.innerHTML = html.trim()
  const element = template.content.firstChild as HTMLElement

  if (!element) {
    console.warn(`[BarefootJS] Template returned empty HTML for component: ${name}`)
    return createPlaceholder(name, key)
  }

  // 5. Insert DOM children into the shell element
  if (hasDomChildren) {
    insertDomChildren(element, children)
  }

  // 6. Set scope ID and key attributes
  const scopeId = `${name}_${generateId()}`
  element.setAttribute(BF_SCOPE, scopeId)
  if (key !== undefined) {
    element.setAttribute('data-key', String(key))
  }

  // 7. Initialize the component synchronously
  // Event handlers need to be bound immediately so user interactions work right away.
  // Nested effects are now supported in createEffect, so we don't need queueMicrotask.
  const initFn = getComponentInit(name)
  if (initFn) {
    // Pass original props (with getters) for reactivity
    initFn(element, props)
  }

  // 8. Mark element as initialized
  hydratedScopes.add(element)

  // 9. Store props and register update function for element reuse in reconcileList
  propsMap.set(element, props)
  registerPropsUpdate(element, name, props)

  return element
}

/**
 * Get the props stored for a component element.
 * Used by reconcileList to pass props to an existing element.
 */
export function getComponentProps(element: HTMLElement): Record<string, unknown> | undefined {
  return propsMap.get(element)
}

/**
 * Register a props update function for a component element.
 * When called, this function re-initializes the component with new props.
 */
function registerPropsUpdate(
  element: HTMLElement,
  name: string,
  _initialProps: Record<string, unknown>
): void {
  // Register update function that will be called by reconcileList
  propsUpdateMap.set(element, (newProps: Record<string, unknown>) => {
    // Re-initialize the component with new props
    // This allows the component to capture new values (e.g., todo with editing: true)
    // and set up new effects that reference the new values
    const init = getComponentInit(name)
    if (init) {
      init(element, newProps)
    }
  })
}

/**
 * Get the props update function for an element.
 * Used by reconcileList to update props when reusing an element.
 */
export function getPropsUpdateFn(element: HTMLElement): ((props: Record<string, unknown>) => void) | undefined {
  return propsUpdateMap.get(element)
}


/**
 * Render a child component's template to an HTML string.
 * Used by compiler-generated template functions when a stateless component
 * appears inside a conditional branch or loop template.
 *
 * If the component has a registered template, it renders the HTML and injects
 * a bf-s scope attribute. Otherwise, falls back to an empty placeholder.
 *
 * @param name - Component name (e.g., 'Spinner')
 * @param props - Props to pass to the template
 * @param key - Optional key for list reconciliation
 * @returns HTML string with scope marker
 */
export function renderChild(
  name: string,
  props: Record<string, unknown>,
  key?: string | number,
  slotSuffix?: string
): string {
  const templateFn = getTemplate(name)
  const id = Math.random().toString(36).slice(2, 8)
  const suffix = slotSuffix ? `_${slotSuffix}` : ''
  const keyAttr = key !== undefined ? ` data-key="${key}"` : ''

  if (!templateFn) {
    // Fallback: empty placeholder (for components without registered templates)
    // Use ~ prefix to mark as child component (prevents hydrate() re-initialization)
    return `<div bf-s="~${name}_${id}${suffix}"${keyAttr}></div>`
  }

  const html = templateFn(props).trim()
  // Inject bf-s scope attribute with ~ child prefix into the first element tag.
  // The ~ prefix marks this as a child component so hydrate()'s requestAnimationFrame
  // re-check skips it (the parent initializes it via initChild instead).
  // The optional slot suffix (e.g., "_s5") enables $c() slot-based lookup from the parent.
  // Templates may start with comment markers (e.g., <!--bf-cond-start:...-->),
  // so we find the first element tag rather than assuming it's at position 0.
  const firstElMatch = html.match(/<(\w+)/)
  if (!firstElMatch) return html
  const insertPos = html.indexOf(firstElMatch[0])
  return html.slice(0, insertPos) +
    html.slice(insertPos).replace(/^(<\w+)/, `$1 bf-s="~${name}_${id}${suffix}"${keyAttr}`)
}

/**
 * Generate a random ID for scope identification
 */
function generateId(): string {
  return Math.random().toString(36).slice(2, 8)
}

/**
 * Create a placeholder element when template is not found
 */
function createPlaceholder(name: string, key?: string | number): HTMLElement {
  const el = document.createElement('div')
  el.setAttribute(BF_SCOPE, `${name}_placeholder`)
  if (key !== undefined) {
    el.setAttribute('data-key', String(key))
  }
  el.textContent = `[${name}]`
  el.style.cssText = 'color: red; border: 1px dashed red; padding: 4px;'
  return el
}

/**
 * Unwrap getter props to plain values for template rendering.
 * Template functions need actual values, not getter functions.
 *
 * @param props - Props object (may contain getters)
 * @returns Plain object with unwrapped values
 */
function unwrapPropsForTemplate(props: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {}

  for (const key of Object.keys(props)) {
    const descriptor = Object.getOwnPropertyDescriptor(props, key)

    if (descriptor && typeof descriptor.get === 'function') {
      // It's a getter - call it to get the value
      result[key] = descriptor.get()
    } else {
      // Regular property
      result[key] = props[key]
    }
  }

  // Template functions expect children as an HTML string, not an array.
  // Join non-DOM array children to avoid Array.toString() inserting commas.
  if (Array.isArray(result.children) && !hasDomElements(result.children)) {
    result.children = (result.children as unknown[])
      .flat()
      .map(c => c == null ? '' : String(c))
      .join('')
  }

  return result
}

/**
 * Check if a value contains DOM elements (HTMLElement instances).
 */
function hasDomElements(value: unknown): boolean {
  if (value instanceof HTMLElement) return true
  if (Array.isArray(value)) return value.some(hasDomElements)
  return false
}

/**
 * Insert DOM children into a shell element.
 * - HTMLElement → appendChild directly
 * - Array → iterate, appendChild each element, create text nodes for strings
 * - string/number → create text node
 */
function insertDomChildren(element: HTMLElement, children: unknown): void {
  if (children instanceof HTMLElement) {
    element.appendChild(children)
  } else if (Array.isArray(children)) {
    for (const child of children) {
      insertDomChildren(element, child)
    }
  } else if (typeof children === 'string' || typeof children === 'number') {
    element.appendChild(document.createTextNode(String(children)))
  }
}

/**
 * Create a component instance from a ComponentDef (CSR mode).
 * Does not use the component registry — the def is passed directly.
 */
function createComponentFromDef(
  def: ComponentDef,
  props: Record<string, unknown>,
  key?: string | number
): HTMLElement {
  if (!def.template) {
    throw new Error('[BarefootJS] createComponent with ComponentDef requires a template function')
  }

  // Generate HTML from template
  const unwrappedProps = unwrapPropsForTemplate(props)
  const html = def.template(unwrappedProps)

  // Create DOM element
  const template = document.createElement('template')
  template.innerHTML = html.trim()
  const element = template.content.firstChild as HTMLElement

  if (!element) {
    const el = document.createElement('div')
    el.textContent = '[ComponentDef]'
    el.style.cssText = 'color: red; border: 1px dashed red; padding: 4px;'
    return el
  }

  // Set scope ID and key
  const name = def.name || def.init.name?.replace(/^init/, '') || 'Component'
  const scopeId = `${name}_${generateId()}`
  element.setAttribute(BF_SCOPE, scopeId)
  if (key !== undefined) {
    element.setAttribute('data-key', String(key))
  }

  // Initialize
  def.init(element, props)

  // Mark as initialized
  hydratedScopes.add(element)

  // Store props for element reuse
  propsMap.set(element, props)

  return element
}
