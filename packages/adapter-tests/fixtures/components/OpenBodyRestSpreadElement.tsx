'use client'

// Test fixture (#3714): an open-type rest bag bound by a component-body
// destructure of the props object, spread onto an element. The bag leaves
// out only the key the destructure takes (`title`): a key the props type
// declares and the destructure does not take (`tone`) is in it, reaches the
// element, and stays live after mount.

import { createSignal } from '@barefootjs/client'

type BadgeProps = { title?: string; tone?: string; [key: string]: unknown }

function Badge(props: BadgeProps) {
  const { title, ...rest } = props
  return <i {...rest}>{title}</i>
}

export function OpenBodyRestSpreadElement() {
  const [tone, setTone] = createSignal('warm')
  return (
    <div>
      <Badge title="T" tone={tone()} lang="en" />
      <button onClick={() => setTone('cool')}>next</button>
    </div>
  )
}
