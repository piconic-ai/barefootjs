import { createFixture } from '../src/types'

/**
 * Static array loop whose array is built from props at component-init time
 * (#1247). The expression `Object.entries(props.reactions ?? {})` cannot be
 * inlined into the CSR template (function call + component-scope dependency),
 * so the loop array becomes `[]` in the template substitution. Before the
 * fix, the static-loop emitter assumed SSR had materialised the children
 * and produced no fallback path — leaving the `<div>` empty on CSR mount.
 *
 * The fix routes the static-loop emitter through a clone-and-append fallback
 * when the per-iteration child element is missing from the container.
 */
export const fixture = createFixture({
  id: 'static-array-from-props',
  description: 'Static-array loop with prop-derived array materialises children on CSR (#1247)',
  source: `
'use client'

type Props = {
  reactions: Record<string, string[]>
}

export function ReactionBar(props: Props) {
  const entries = Object.entries(props.reactions ?? {}).filter(([, users]) => users.length > 0)
  return (
    <div data-reaction-bar="true">
      {entries.map(([emoji, users]) => (
        <button key={emoji} type="button">
          <span>{emoji}</span>
          <span>{String(users.length)}</span>
        </button>
      ))}
    </div>
  )
}
`,
  props: {
    reactions: { '👍': ['alice', 'bob'] },
  },
  expectedHtml: `
    <div data-reaction-bar="true" bf-s="test" bf="s2"><button type="button" data-key="👍"><span><!--bf:s0-->👍<!--/--></span><span><!--bf:s1-->2<!--/--></span></button></div>
  `,
})
