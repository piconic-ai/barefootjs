'use client'

// Test fixture (#3714): a call that spreads an open-type `...rest` bag onto
// a child component and has JSX children. The child
// seeds a signal from `props.children` during init, so the value the init
// hands it shows after hydration and after a client mount, not only in the
// template's HTML. JSX children are the call's last `children`: they reach
// the child whether the bag leaves `children` out (the component
// destructured it) or carries it.

import { createSignal } from '@barefootjs/client'

function Note(props: { children?: string; tone?: string }) {
  const [value, setValue] = createSignal(props.children ?? 'missing')
  return <b data-tone={props.tone} onClick={() => setValue(`${value()}!`)}>{value()}</b>
}

type PanelProps = { children?: string; tone?: string; [key: string]: unknown }

// `children` destructured: the rest bag leaves it out.
function Taken({ children, ...rest }: PanelProps) {
  return (
    <section>
      <p className="fallback"><Note {...rest}>{children ?? 'fallback'}</Note></p>
      <p className="bare"><Note {...rest}>{children}</Note></p>
      <p className="text"><Note {...rest}>text</Note></p>
      <p className="list"><Note {...rest}>{children}!</Note></p>
    </section>
  )
}

// `children` not destructured: the rest bag carries it, and the call's own win.
function Carried({ tone, ...rest }: PanelProps) {
  return <p className="carried" data-tone={tone}><Note {...rest}>own</Note></p>
}

export function OpenRestSpreadChildChildren() {
  return (
    <div>
      <Taken children="hello" tone="warm" />
      <Carried children="hello" tone="warm" />
    </div>
  )
}
