'use client'

// Test fixture (#3903): a call that spreads the component's own props object
// (`{...props}`) onto a child component and has JSX children, where the props
// type declares `children`. The JSX children are the call's last `children`,
// so they win over the `children` key the spread carries: the child gets one
// `children` value, the call's own. The child seeds a signal from
// `props.children` during init, so the value shows after hydration too.

import { createSignal } from '@barefootjs/client'

function Note(props: { children?: unknown; tone?: string }) {
  const [value, setValue] = createSignal(props.children ?? 'missing')
  return <b data-tone={props.tone} onClick={() => setValue(`${value()}!`)}>{value()}</b>
}

function Frame(props: { children?: unknown; tone?: string }) {
  return <i data-tone={props.tone}>{props.children}</i>
}

type PanelProps = { children?: string; tone?: string }

// The spread comes first and the JSX children are static text.
function Text(props: PanelProps) {
  return <p className="text"><Note {...props}>own</Note></p>
}

// The JSX children read the component's own `children` prop.
function Dynamic(props: PanelProps) {
  return <p className="dynamic"><Frame {...props}>{props.children}!</Frame></p>
}

// An explicit prop after the spread still wins for its own key.
function Explicit(props: PanelProps) {
  return <p className="explicit"><Note {...props} tone="cold">own</Note></p>
}

// A spread child nested in the forwarded children of another spread child.
function Nested(props: PanelProps) {
  return <p className="nested"><Frame {...props}><Note {...props}>inner</Note></Frame></p>
}

// No JSX children: the spread's own `children` still reaches the child.
function Forward(props: PanelProps) {
  return <p className="forward"><Frame {...props} /></p>
}

// A required `children` param is carried unconditionally, and still loses.
function Required(props: { children: string; tone?: string }) {
  return <p className="required"><Frame {...props}>own</Frame></p>
}

// A loop row calling the child with the spread and JSX children.
function Rows(props: PanelProps) {
  return <ul className="rows">{['a', 'b'].map((x) => <li key={x}><Frame {...props}>{x}</Frame></li>)}</ul>
}

export function PropsObjectSpreadChildChildren() {
  return (
    <div>
      <Text children="hello" tone="warm" />
      <Dynamic children="hello" tone="warm" />
      <Explicit children="hello" tone="warm" />
      <Nested children="hello" tone="warm" />
      <Forward children="hello" tone="warm" />
      <Required children="hello" tone="warm" />
      <Rows children="hello" tone="warm" />
    </div>
  )
}
