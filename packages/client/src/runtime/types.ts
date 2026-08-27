/**
 * BarefootJS - Core Types
 *
 * Shared type definitions for component initialization and registration.
 */

/**
 * Component init function type.
 * Takes the scope element and props, initializes the component
 * by setting up event handlers, effects, and reactive bindings.
 */
export type InitFn = (scope: Element, props: Record<string, unknown>) => void

/**
 * Component definition.
 * Bundles the init function with optional template and scope metadata.
 */
export interface ComponentDef {
  /** Component name (e.g., 'Counter'). Used for scope ID generation. */
  name?: string
  /** Init function that hydrates a scope element */
  init: InitFn
  /** Template function for client-side component creation */
  template?: (props: Record<string, unknown>) => string
  /**
   * When true, this component's scope has no `bf-s`-carrying element of
   * its own — a proxy element stands in for it. Set for TWO distinct
   * shapes (see `fragmentRoot` below, which tells them apart):
   *   - a genuine fragment root (`<>...</>`), where the proxy is the
   *     fragment's own rendered content;
   *   - a root that is itself a single child component call, where the
   *     proxy is that child's own already-scoped element (#2649).
   */
  comment?: boolean
  /**
   * True only for the genuine-fragment-root shape of `comment` above
   * (`ir.root.type === 'fragment'`) — never for the root-is-a-child-call
   * shape. `materializeComponent` (component.ts) uses this to decide
   * whether a CSR mount must generate its OWN scope id (fragment root: yes,
   * so nested `renderChild()` calls get parent-prefixed naming matching
   * SSR/hydrate) or leave the scope id null to avoid overwriting the
   * child's own (#2649's shape, #2722).
   */
  fragmentRoot?: boolean
}
