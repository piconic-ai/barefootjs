/**
 * Shared by `./jsx-runtime/index.ts` and `./jsx-dev-runtime/index.ts`.
 *
 * hono's own `jsxFn` (`hono/dist/jsx/base.js`) always wraps `<svg>` /
 * `<head>` children in an internal namespace-context node — even when the
 * caller passed no children at all. That phantom wrapper makes the outer
 * `JSXNode`'s `children.length > 0` true, which trips hono's own
 * "Can only set one of `children` or `props.dangerouslySetInnerHTML`" guard
 * for any childless `<svg>`/`<head>` element using `dangerouslySetInnerHTML`
 * — see https://github.com/piconic-ai/barefootjs/issues/2557.
 *
 * Work around it at the one place BarefootJS's compiled output calls into
 * hono's JSX runtime: when `dangerouslySetInnerHTML` is present and no real
 * `children` prop was given, resolve it into `children` ourselves (mirroring
 * what hono would do internally) before delegating to hono. If the caller
 * supplied *both* real children and `dangerouslySetInnerHTML`, that's a
 * genuine conflict — leave `props` untouched so hono's own guard still
 * rejects it.
 */
import { raw } from 'hono/html'

export function resolveDangerouslySetInnerHTML(props: Record<string, unknown>): Record<string, unknown> {
  if (
    props &&
    'dangerouslySetInnerHTML' in props &&
    props.dangerouslySetInnerHTML != null &&
    !('children' in props)
  ) {
    const { dangerouslySetInnerHTML, ...rest } = props
    const html = (dangerouslySetInnerHTML as { __html: string }).__html
    return { ...rest, children: raw(html) }
  }
  return props
}
