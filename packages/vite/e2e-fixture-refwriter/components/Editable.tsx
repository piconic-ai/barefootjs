'use client'

// A child component. Its props — `ref` included — are emitted into the SSR
// template verbatim, unlike an intrinsic element's, which is what keeps the
// handler passed to it alive through reachability.
export function Editable(props: { ref?: (el: HTMLTextAreaElement) => void }) {
  return <textarea ref={props.ref} />
}
