/**
 * Whether a JSX attribute / component-prop name is an event handler
 * (`onClick`, `onValueChange`, ...) rather than a plain attribute or data
 * prop: `on` followed by an uppercase letter. `on`, `only`, `once`, `online`
 * are ordinary names.
 *
 * The one decision every site shares: native-element attribute extraction
 * (routes into `IREvent`, never rendered HTML), the `isEventHandler` flag on
 * loop child-component props, client-JS prop wiring, and the SSR adapters'
 * "handler has no SSR value" skips.
 */
export function isEventHandlerName(name: string): boolean {
  return /^on[A-Z]/.test(name)
}
