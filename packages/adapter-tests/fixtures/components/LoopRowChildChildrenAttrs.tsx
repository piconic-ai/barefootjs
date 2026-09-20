'use client'

// Test fixture (#3107): a `.map()` loop row whose call to a child
// component receives a JSX element as `children`, and that element has
// its OWN reactive attributes (`href` / `data-current`, both keyed off
// the row's own item against an outer signal).
//
// The same shape works correctly OUTSIDE a loop — the compiler flattens
// a child's `children` slot into the caller's own effect scope, however
// trivial or elaborate the child's body is. Inside a `.map()` row it
// silently drops the effect: the row's per-iteration markup is built
// once from whatever the signal held at the SSR render that produced it,
// and no `createEffect`/`setAttribute` call is ever emitted for those
// attributes afterward — the row's own text markers and the child's own
// declared props patch correctly, only the attributes on the *elements
// passed to the child as `children`* are missing.
//
// `compileJSX` returns zero diagnostics for this shape (`kind: 'silent'`
// on the registry entry) — see
// `packages/adapter-tests/limitations/loop-row-child-children-attrs-frozen.ts`.

import { createSignal } from '@barefootjs/client'

function Chip({ children }: { children?: any }) {
  return <span>{children}</span>
}

export function LoopRowChildChildrenAttrs() {
  const [active, setActive] = createSignal('a')
  const opts = ['a', 'b']

  return (
    <div>
      {opts.map(opt => (
        <Chip key={opt}>
          <a
            href={active() === opt ? '/current' : `/other/${opt}`}
            data-current={active() === opt ? 'true' : 'false'}
          >
            {opt}
          </a>
        </Chip>
      ))}
      <button type="button" className="toggle" onClick={() => setActive('b')}>
        toggle
      </button>
    </div>
  )
}
