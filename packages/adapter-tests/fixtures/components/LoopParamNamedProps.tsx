'use client'

// Test fixture: callback parameters named `props` inside a component whose
// own props are destructured. The client JS renames the component's props
// object to `_p`; every parameter below shadows that name in its own scope
// and must keep its own binding, while the outer prop reads in the same
// scope (`suffix`, `step`) still reach the component's props:
//   - a reactive `.map((props) => …)` row reading `suffix` (text and a
//     forwarded child prop),
//   - a handler's `(props) => …` arrow reading `step`,
//   - a `.filter((props) => …)` callback inside a handler reading `step`,
//   - a nested `function describe(props)` reading `suffix`,
//   - a `var props` declared in a nested block of a handler: `var` binds in
//     the whole handler, so the read after the block is that local.
// `Tag` is a props-object child: its own `props` is the renamed object.
// The rendered row reads its `props` item bare (string rows): a
// `props.<member>` read in a rendered row is `loop-param-named-props-member`.

import { createSignal } from '@barefootjs/client'

function Tag(props: { label: string; mark: string }) {
  return <span className="tag">{props.label}{props.mark}</span>
}

export function LoopParamNamedProps({ suffix, step }: { suffix: string; step: number }) {
  const [items, setItems] = createSignal(['a', 'b'])
  const [total, setTotal] = createSignal(0)
  const [last, setLast] = createSignal('none')
  const bump = (props: { by: number }) => setTotal(total() + props.by * step)
  function describe(props: { label: string }) {
    return props.label + suffix
  }
  return (
    <div>
      <p className="total">{total()}</p>
      <p className="last">{last()}</p>
      <button type="button" className="add" onClick={() => setItems([...items(), 'c'])}>add</button>
      <button type="button" className="bump" onClick={() => bump({ by: 2 })}>bump</button>
      <button type="button" className="drop" onClick={() => setItems(items().filter((props) => props !== items()[step - 1]))}>drop</button>
      <button type="button" className="say" onClick={() => setLast(describe({ label: 'x' }))}>say</button>
      <button
        type="button"
        className="hoist"
        onClick={() => {
          if (step > 0) {
            var props = { by: 10 }
          }
          setTotal(total() + props.by * step)
        }}
      >
        hoist
      </button>
      <ul className="rows">
        {items().map((props) => (
          <li key={props}>
            <span className="label">{props}{suffix}</span>
            <Tag label={props} mark={suffix} />
          </li>
        ))}
      </ul>
    </div>
  )
}
