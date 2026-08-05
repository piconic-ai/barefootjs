'use client'

// Sibling child rendered by `LoopParent` inside a `.map()`, entirely
// client-side (`createComponent`, not a server template composition) —
// the exact TodoApp/TodoItem shape that exercises the `@bf-child:`
// marker gap described in `child-marker.ts`.
export function LoopChild(props: { label: string }) {
  return <li className="loop-child">{props.label}</li>
}
