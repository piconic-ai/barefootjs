'use client'

// Child for the `static-loop-row-child-signal-prop` fixture (#3921): renders
// the prop it is given, so a signal passed as a live getter shows up in the
// child's DOM.
export function SignalPropBadge(props: { n: number }) {
  return <b className="badge">{'n=' + props.n}</b>
}
