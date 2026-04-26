/**
 * BfScripts Component
 *
 * Renders collected script tags at the end of the document body.
 * BarefootJS components collect their script URLs during SSR render,
 * and this component outputs them all at once to avoid DOM traversal issues.
 *
 * Usage:
 * ```tsx
 * import { BfScripts } from '@barefoot/hono/scripts'
 *
 * <html>
 *   <body>
 *     {children}
 *     <BfScripts />
 *   </body>
 * </html>
 * ```
 */

/** @jsxImportSource hono/jsx */

import { useRequestContext } from 'hono/jsx-renderer'
import { Fragment } from 'hono/jsx'

export type CollectedScript = {
  src: string
}

/**
 * Renders all collected BarefootJS script tags.
 * Place this component at the end of your <body> element.
 *
 * After rendering, sets 'bfScriptsRendered' flag to true.
 * Components rendered after BfScripts (e.g., inside Suspense boundaries)
 * will check this flag and output their scripts inline instead of
 * collecting them here.
 */
export function BfScripts() {
  try {
    const c = useRequestContext()

    // Mark that BfScripts has been rendered.
    // Components rendered after this point (e.g., inside Suspense)
    // should output their scripts inline.
    c.set('bfScriptsRendered', true)

    const scripts: CollectedScript[] = c.get('bfCollectedScripts') || []

    // Reverse script order so child components load before parents.
    // During SSR, parent components render first and collect their scripts,
    // then child components add their scripts. But for hydration, children
    // need to register their templates before parents try to use createComponent().
    // barefoot.js must stay first since it provides the runtime.
    const barefootScript = scripts.find(s => s.src.includes('barefoot.js'))
    const componentScripts = scripts.filter(s => !s.src.includes('barefoot.js'))
    const orderedScripts = barefootScript
      ? [barefootScript, ...componentScripts.reverse()]
      : componentScripts.reverse()

    return (
      <Fragment>
        {orderedScripts.map(({ src }) => (
          <script type="module" src={src} />
        ))}
      </Fragment>
    )
  } catch {
    // Context unavailable (e.g., not using jsxRenderer)
    return null
  }
}
