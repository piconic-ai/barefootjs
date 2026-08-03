'use client'

// Sibling child rendered by `LoopParent` inside a `.map()`, entirely
// client-side (`createComponent`, not a server template composition) —
// the exact TodoApp/TodoItem shape that revealed the `@bf-child:` marker
// gap during the gin migration (see `child-marker.ts`).
export function LoopChild(props: { label: string }) {
  return <li className="loop-child">{props.label}</li>
}
